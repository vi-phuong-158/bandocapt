'use strict';

// =====================================================================
// T3.1 — Inventory corpus + báo cáo thiếu metadata hiệu lực / xung đột nguồn
//
// Quét TOÀN BỘ record trong namespace Pinecone (mode live, mặc định) hoặc một
// snapshot backup (mode offline), rồi báo cáo:
//   1) Độ phủ metadata hiệu lực (governance) và structured facts so với schema
//      GĐ3 (xem docs/brain/07-parallel-task-plan.md §GIAI ĐOẠN 3).
//   2) content_hash lệch với sha256(text) hiện tại (nội dung đã đổi mà chưa
//      cập nhật hash / chưa xác minh lại).
//   3) Xung đột nguồn: record mang dấu hiệu luồng giấy/NA17/fax/nộp trực tiếp
//      chưa được đánh dấu superseded; procedure_id trùng trên nhiều record.
//
// Chỉ ĐỌC — không ghi Pinecone. Xuất data/corpus-inventory.json (máy đọc, dẫn
// vào T3.2) và data/corpus-inventory-report.md (người duyệt đọc).
//
// Dùng:
//   node scripts/inventory-corpus.js                 # live (cần PINECONE_API_KEY)
//   node scripts/inventory-corpus.js --source=backups [file.json]
// =====================================================================

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// ------- Env: tìm ngược lên cây thư mục để thấy .env repo chính khi chạy từ worktree -------
function loadEnvFromNearestAncestor() {
    let dotenv;
    try { dotenv = require('dotenv'); } catch { return; }
    let dir = __dirname;
    while (true) {
        let found = false;
        for (const name of ['.env', '.env.local']) {
            const p = path.join(dir, name);
            if (!fs.existsSync(p)) continue;
            found = true;
            const parsed = dotenv.parse(fs.readFileSync(p, 'utf8'));
            for (const [k, v] of Object.entries(parsed)) {
                if (!String(process.env[k] || '').trim() && String(v || '').trim()) process.env[k] = v;
            }
        }
        if (found) return;
        const parent = path.dirname(dir);
        if (parent === dir) return;
        dir = parent;
    }
}

loadEnvFromNearestAncestor();

const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_JSON = path.join(REPO_ROOT, 'data', 'corpus-inventory.json');
const OUT_MD = path.join(REPO_ROOT, 'data', 'corpus-inventory-report.md');
const BACKUP_DIR = path.join(REPO_ROOT, 'data', 'pinecone-backups');

// Schema hiệu lực GĐ3 — trường không áp dụng vẫn phải ghi "N/A" mới coi là ĐỦ.
const GOVERNANCE_FIELDS = [
    'review_status',        // approved | pending | superseded
    'source_priority',      // current_procedure | legal_basis | supplemental | legacy
    'valid_from',
    'valid_to',
    'supersedes',
    'procedure_version',
    'last_verified_at',
    'content_hash'
];
// Structured facts: fee tính là ĐỦ nếu có phi HOẶC le_phi.
const FACT_FIELDS = ['thoi_han', 'mau_don', 'authority'];

// Dấu hiệu nguồn hết hiệu lực (F01), HAI TẦNG để không âm thầm bỏ sót:
//  - STRICT: tín hiệu giấy/NA17/fax rõ ràng → độ tin cậy cao là luồng cũ.
//  - BROAD: nhắc tới "trực tiếp/bản giấy/phiếu" — phần lớn là kênh nộp HỢP LỆ
//    (đăng ký xe, cư trú…), người duyệt T3.3 lọc, KHÔNG tự coi là hết hiệu lực.
const LEGACY_SIGNALS = /phiếu giấy|mẫu\s*NA17|\bNA17\b|qua fax|bằng fax|nộp trực tiếp|nộp bản giấy|bản giấy tại/i;
const BROAD_PAPER_SIGNALS = /\bphiếu\b|nộp\s+(?:hồ sơ\s+)?trực tiếp|trực tiếp tại|bản giấy|\bfax\b|\bNA17\b/i;
const ONLINE_SIGNALS = /trực tuyến|online|kbtt\.xuatnhapcanh|hệ thống khai báo|cổng dịch vụ công|dinhcu\.xuatnhapcanh/i;

function sha256(value) {
    return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

// source_type chỉ set cho tthc/guide; law + tru_so để trống. Phân lớp thật theo
// tiền tố id để map source_priority đúng ở T3.2.
function classify(id, sourceType) {
    if (/^tthc[_:]/.test(id) || sourceType === 'tthc') return 'tthc';
    if (/^guide[_:]/.test(id) || sourceType === 'guide') return 'guide';
    if (/^law[_:]/.test(id)) return 'law';
    if (/^truso-/.test(id)) return 'tru_so';
    return 'other';
}

// source_priority gợi ý theo lớp (người duyệt T3.3 chốt).
const PRIORITY_BY_CLASS = {
    tthc: 'current_procedure',
    law: 'legal_basis',
    guide: 'supplemental',
    tru_so: 'N/A (ngoài phạm vi hiệu lực — Published_Locations)',
    other: 'pending'
};

function filled(v) {
    return v !== undefined && v !== null && String(v).trim() !== '';
}

// ------- Nạp record -------
async function loadLiveRecords() {
    const { Pinecone } = require('@pinecone-database/pinecone');
    const indexName = process.env.PINECONE_INDEX_NAME || 'chatbot-tthc-xnc';
    const indexHost = process.env.PINECONE_INDEX_HOST || undefined;
    const namespace = process.env.PINECONE_NAMESPACE || 'chatbot-tthc-xnc';
    const activeIndex = new Pinecone({ apiKey: process.env.PINECONE_API_KEY })
        .index(indexName, indexHost).namespace(namespace);

    const ids = [];
    let paginationToken;
    do {
        const page = await activeIndex.listPaginated({ limit: 100, paginationToken });
        for (const v of page.vectors || []) ids.push(v.id);
        paginationToken = page.pagination?.next;
    } while (paginationToken);

    const records = [];
    for (let i = 0; i < ids.length; i += 100) {
        const batch = ids.slice(i, i + 100);
        const res = await activeIndex.fetch(batch);
        for (const id of batch) {
            const rec = res.records?.[id];
            if (rec?.metadata) records.push({ id, metadata: rec.metadata });
        }
    }
    return { source: `live:${namespace}`, records };
}

function loadBackupRecords(file) {
    const p = file
        ? path.resolve(file)
        : path.join(BACKUP_DIR, '2026-07-01-pre-update-backup-original-metadata.json');
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    const list = Array.isArray(raw) ? raw : (raw.records ? Object.values(raw.records) : Object.values(raw));
    const records = list
        .map(r => ({ id: r.id || r.metadata?.procedure_id || '?', metadata: r.metadata || r }))
        .filter(r => r.metadata && typeof r.metadata === 'object');
    return { source: `backup:${path.basename(p)}`, records };
}

// ------- Phân tích 1 record -------
function analyzeRecord({ id, metadata }) {
    const m = metadata;
    const missingGovernance = GOVERNANCE_FIELDS.filter(f => !filled(m[f]));
    const missingFacts = [];
    if (!filled(m.phi) && !filled(m.le_phi)) missingFacts.push('phi/le_phi');
    for (const f of FACT_FIELDS) if (!filled(m[f])) missingFacts.push(f);

    const text = m.text || '';
    const blob = text + ' ' + (m.mau_don || '');
    const hashDrift = filled(m.content_hash) && m.content_hash !== sha256(text);
    const legacyHit = LEGACY_SIGNALS.test(blob);
    const paperMention = BROAD_PAPER_SIGNALS.test(blob);
    const onlineHit = ONLINE_SIGNALS.test(text);

    const klass = classify(id, m.source_type);
    return {
        id,
        klass,
        procedure_id: m.procedure_id || null,
        source_type: m.source_type || 'unknown',
        title: m.title || '',
        review_status: m.review_status || null,
        missingGovernance,
        missingFacts,
        hashDrift,
        // Cờ luồng giấy: chỉ đáng lo khi CHƯA đánh dấu superseded.
        legacyFlag: legacyHit && m.review_status !== 'superseded',
        legacyPrimary: legacyHit && !onlineHit, // luồng chính là giấy (không có tín hiệu online)
        paperMention: paperMention && m.review_status !== 'superseded',
    };
}

// ------- Báo cáo Markdown -------
function buildMarkdown(summary) {
    const {
        source, total, generatedAt, byClass, fieldCoverage,
        governed, hashDrift, legacy, paperCandidates, duplicateProcedureIds
    } = summary;

    const cov = f => {
        const c = fieldCoverage[f] || 0;
        return `| \`${f}\` | ${c}/${total} | ${total - c} |`;
    };

    const lines = [
        '# T3.1 — Báo cáo inventory corpus (metadata hiệu lực / xung đột nguồn)',
        '',
        `> Nguồn dữ liệu: **${source}** · Tổng record: **${total}** · Tạo lúc: ${generatedAt}`,
        '> Chỉ đọc, không ghi Pinecone. Sinh bởi `scripts/inventory-corpus.js` (T3.1).',
        '',
        '## Tóm tắt',
        '',
        `- Record có \`review_status\` (đã đưa vào quản trị hiệu lực): **${governed}/${total}**`,
        `- Record cờ luồng giấy/NA17 chưa superseded (F01 độ tin cậy cao): **${legacy.length}**`,
        `- Record nhắc nộp giấy/trực tiếp (rộng — người duyệt lọc): **${paperCandidates.length}**`,
        `- Record content_hash lệch text hiện tại: **${hashDrift.length}**`,
        `- procedure_id trùng trên nhiều record: **${duplicateProcedureIds.length}**`,
        '',
        '### Phân lớp corpus (theo tiền tố id) + source_priority gợi ý',
        '',
        '| Lớp | Số record | source_priority gợi ý | content_hash drift |',
        '|---|---|---|---|',
        ...Object.entries(byClass).sort((a, b) => b[1].total - a[1].total).map(([k, v]) =>
            `| \`${k}\` | ${v.total} | ${PRIORITY_BY_CLASS[k] || 'pending'} | ${v.drift}/${v.total} |`),
        '',
        '### Độ phủ trường metadata (đã điền / tổng — thiếu)',
        '',
        '| Trường | Đã điền | Thiếu |',
        '|---|---|---|',
        ...GOVERNANCE_FIELDS.map(cov),
        `| \`phi/le_phi\` | ${fieldCoverage['phi/le_phi'] || 0}/${total} | ${total - (fieldCoverage['phi/le_phi'] || 0)} |`,
        ...FACT_FIELDS.map(cov),
        '',
        '## Xung đột nguồn cần xử lý (F01)',
        '',
    ];

    if (legacy.length === 0) {
        lines.push('_Không có record mang dấu hiệu luồng giấy/NA17/fax/nộp trực tiếp chưa superseded._', '');
    } else {
        lines.push('| id | procedure_id | luồng chính là giấy? | title |', '|---|---|---|---|');
        for (const r of legacy) {
            lines.push(`| \`${r.id}\` | ${r.procedure_id || '-'} | ${r.legacyPrimary ? '⚠️ CÓ' : 'nhắc như dự phòng'} | ${(r.title || '').slice(0, 60)} |`);
        }
        lines.push('');
    }

    lines.push('### Ứng viên rộng — nhắc nộp giấy/trực tiếp (người duyệt T3.3 lọc)', '',
        `Tổng **${paperCandidates.length}** record nhắc "phiếu/trực tiếp/bản giấy/fax" nhưng phần lớn là`,
        'kênh nộp HỢP LỆ (đăng ký xe, cư trú…), KHÔNG tự động coi là hết hiệu lực. Phân bố theo lớp:', '');
    if (paperCandidates.length) {
        const byK = {};
        for (const r of paperCandidates) byK[r.klass] = (byK[r.klass] || 0) + 1;
        lines.push(...Object.entries(byK).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- \`${k}\`: ${v} record`),
            '', '_Danh sách id đầy đủ trong `data/corpus-inventory.json` (trường `paperCandidates`)._', '');
    } else {
        lines.push('_Không có._', '');
    }

    if (duplicateProcedureIds.length) {
        lines.push('## procedure_id trùng (nghi có nhiều phiên bản)', '');
        lines.push('| procedure_id | các record id |', '|---|---|');
        for (const d of duplicateProcedureIds) lines.push(`| ${d.procedure_id} | ${d.ids.join(', ')} |`);
        lines.push('');
    }

    if (hashDrift.length) {
        const tthcDrift = hashDrift.filter(r => r.klass === 'tthc');
        const otherDrift = hashDrift.filter(r => r.klass !== 'tthc');
        lines.push('## content_hash lệch sha256(text)', '');
        if (tthcDrift.length) {
            lines.push(`### tthc (${tthcDrift.length}) — staleness thật (đổi metadata phí không tính lại hash)`, '');
            for (const r of tthcDrift) lines.push(`- \`${r.id}\` — ${(r.title || '').slice(0, 70)}`);
            lines.push('');
        }
        if (otherDrift.length) {
            const byK = {};
            for (const r of otherDrift) byK[r.klass] = (byK[r.klass] || 0) + 1;
            lines.push('### Lớp khác — nghi khác cơ sở hash (không phải staleness từng record)', '',
                Object.entries(byK).map(([k, v]) => `- \`${k}\`: ${v} record`).join('\n'),
                '', '_Chuẩn hóa lại content_hash đồng bộ khi re-embed ở T3.5._', '');
        }
    }

    lines.push('## Bước tiếp (T3.2)', '',
        'Toàn bộ record hiện **thiếu** schema hiệu lực (`review_status`, `source_priority`,',
        '`valid_from/valid_to/supersedes`, `procedure_version`, `last_verified_at`) và phần lớn',
        'structured facts (`thoi_han`/`mau_don`/`authority`). T3.2 mở rộng CSV draft để người duyệt',
        '(T3.3) điền các trường này; T3.4 backfill + đánh dấu superseded cho các record cờ luồng giấy.',
        '', `Chi tiết máy-đọc: \`data/corpus-inventory.json\`.`, '');

    return lines.join('\n');
}

async function main() {
    const args = process.argv.slice(2);
    const sourceArg = (args.find(a => a.startsWith('--source=')) || '--source=live').split('=')[1];
    const backupFile = args.find(a => !a.startsWith('--'));

    let loaded;
    if (sourceArg === 'backups') {
        loaded = loadBackupRecords(backupFile);
    } else {
        if (!process.env.PINECONE_API_KEY) {
            console.error('Thiếu PINECONE_API_KEY — chạy live cần key. Dùng --source=backups để chạy offline.');
            process.exitCode = 1;
            return;
        }
        loaded = await loadLiveRecords();
    }

    const { source, records } = loaded;
    const total = records.length;
    const analyzed = records.map(analyzeRecord);

    const fieldCoverage = {};
    for (const f of [...GOVERNANCE_FIELDS, ...FACT_FIELDS, 'phi/le_phi']) fieldCoverage[f] = 0;

    for (const { metadata } of records) {
        for (const f of GOVERNANCE_FIELDS) if (filled(metadata[f])) fieldCoverage[f]++;
        for (const f of FACT_FIELDS) if (filled(metadata[f])) fieldCoverage[f]++;
        if (filled(metadata.phi) || filled(metadata.le_phi)) fieldCoverage['phi/le_phi']++;
    }

    const byClass = {};
    for (const r of analyzed) {
        const c = (byClass[r.klass] = byClass[r.klass] || { total: 0, drift: 0 });
        c.total++;
        if (r.hashDrift) c.drift++;
    }

    const governed = analyzed.filter(r => filled(r.review_status)).length;
    const hashDrift = analyzed.filter(r => r.hashDrift);
    const legacy = analyzed.filter(r => r.legacyFlag);
    // Broad candidates trừ những cái đã nằm trong strict legacy.
    const paperCandidates = analyzed.filter(r => r.paperMention && !r.legacyFlag);

    const byPid = {};
    for (const r of analyzed) {
        if (!r.procedure_id) continue;
        (byPid[r.procedure_id] = byPid[r.procedure_id] || []).push(r.id);
    }
    const duplicateProcedureIds = Object.entries(byPid)
        .filter(([, ids]) => ids.length > 1)
        .map(([procedure_id, ids]) => ({ procedure_id, ids }));

    // Timestamp offline-safe cho môi trường cấm Date.now (fallback env / '-').
    let generatedAt = '-';
    try { generatedAt = new Date().toISOString(); } catch { /* môi trường hạn chế */ }

    const summary = {
        source, total, generatedAt, byClass, fieldCoverage,
        governed, hashDrift, legacy, paperCandidates, duplicateProcedureIds,
        records: analyzed
    };

    fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
    fs.writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2) + '\n', 'utf8');
    fs.writeFileSync(OUT_MD, buildMarkdown(summary), 'utf8');

    console.log(JSON.stringify({
        source, total, governed,
        legacyFlagged: legacy.length,
        paperCandidates: paperCandidates.length,
        hashDrift: hashDrift.length,
        duplicateProcedureIds: duplicateProcedureIds.length,
        json: OUT_JSON, report: OUT_MD
    }, null, 2));
}

// Export helper để T3.2 (generate-governance-draft.js) tái dùng — tránh lệch regex
// phân loại nguồn giấy giữa hai script.
module.exports = {
    classify, PRIORITY_BY_CLASS, GOVERNANCE_FIELDS, FACT_FIELDS,
    LEGACY_SIGNALS, BROAD_PAPER_SIGNALS, ONLINE_SIGNALS,
    sha256, filled, loadEnvFromNearestAncestor
};

if (require.main === module) {
    main().catch(err => { console.error(err); process.exitCode = 1; });
}
