'use strict';

// =====================================================================
// T3.2 — Mở rộng CSV draft: schema hiệu lực (governance) + structured facts.
//
// Nối tiếp T3.1 (scripts/inventory-corpus.js). Đọc live Pinecone (mặc định) hoặc
// backup, sinh data/corpus-governance-draft.csv để NGƯỜI DUYỆT (T3.3) điền các
// trường hiệu lực trước khi T3.4 backfill/đánh dấu superseded.
//
// Chỉ ĐỌC Pinecone — KHÔNG ghi. Ứng viên (candidate) là gợi ý heuristic; cột
// final_* là nơi người duyệt chốt (điền N/A nếu không áp dụng).
//
// Phạm vi: tthc (39, tier HIGH — soi từng dòng) + law (152) + guide (194)
// (tier BULK — có thể duyệt hàng loạt). tru_so (145) LOẠI khỏi draft vì đã có
// pipeline duyệt Published_Locations riêng (thêm --include-tru-so nếu cần).
//
// Dùng:
//   node scripts/generate-governance-draft.js
//   node scripts/generate-governance-draft.js --source=backups [file.json]
// =====================================================================

const fs = require('node:fs');
const path = require('node:path');
const inv = require('./inventory-corpus');

inv.loadEnvFromNearestAncestor();

const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_CSV = path.join(REPO_ROOT, 'data', 'corpus-governance-draft.csv');
const BACKUP_DIR = path.join(REPO_ROOT, 'data', 'pinecone-backups');

// ------- Trích ứng viên facts (đồng bộ với setup/backfill-tthc-metadata.js) -------
const THOI_HAN_LINE = /(?:^|\n)\s*(?:Thời hạn giải quyết|Thời hạn|Hạn khai báo|Thời gian giải quyết)\s*:\s*([^\n]+)/i;
const DURATION_INLINE = /trong\s+(?:vòng\s+)?\d+\s*(?:ngày làm việc|ngày|giờ)[^\n.]*/i;
const MAU_DON_LINE = /(?:^|\n)\s*(?:Mẫu đơn|Mẫu tờ khai|Biểu mẫu)\s*:\s*([^\n]+)/i;
const FORM_CODE = /\b(?:NA|TK|TT|M|XC|HC)\d{1,3}\b/gi;

// Loại candidate placeholder vô nghĩa để KHÔNG prefill rác vào final_ (người
// duyệt dễ nhận nhầm "Xem chi tiết" là thời hạn thật).
const PLACEHOLDER = /^(xem chi tiết|theo quy định|chi tiết|xem|không|n\/a|-)\s*\.?$/i;
function cleanCandidate(v) {
    const s = (v || '').trim();
    return PLACEHOLDER.test(s) ? '' : s;
}
function extractThoiHan(text) {
    const line = THOI_HAN_LINE.exec(text || '');
    const fromLine = line ? cleanCandidate(line[1]) : '';
    if (fromLine) return fromLine;
    const inline = DURATION_INLINE.exec(text || '');
    return inline ? inline[0].trim() : '';
}
function extractMauDon(text) {
    const line = MAU_DON_LINE.exec(text || '');
    if (line) return line[1].trim();
    const codes = (text || '').match(FORM_CODE);
    return codes ? [...new Set(codes.map(c => c.toUpperCase()))].join(', ') : '';
}

// authority gợi ý theo cấp xử lý (tthc); law/guide → N/A (không áp dụng).
const AUTHORITY_BY_CAP = {
    xa: 'Công an cấp xã',
    huyen: 'Công an cấp huyện',
    tinh: 'Công an cấp tỉnh (Phòng Quản lý xuất nhập cảnh)',
    tw: 'Cục Quản lý xuất nhập cảnh - Bộ Công an'
};

// review_status gợi ý: tthc = pending (BẮT người duyệt xác nhận từng dòng rủi ro
// cao); law/guide = approved (văn bản nền/hướng dẫn, người duyệt spot-check).
const REVIEW_STATUS_BY_CLASS = { tthc: 'pending', law: 'approved', guide: 'approved' };

function feeExisting(m) {
    const phi = inv.filled(m.phi) ? m.phi : '';
    const lePhi = inv.filled(m.le_phi) ? m.le_phi : '';
    if (phi && lePhi) return `Lệ phí: ${lePhi} | Phí: ${phi}`;
    return lePhi ? `Lệ phí: ${lePhi}` : (phi ? `Phí: ${phi}` : '');
}

function paperFlag(id, m) {
    const blob = (m.text || '') + ' ' + (m.mau_don || '');
    if (inv.LEGACY_SIGNALS.test(blob)) return 'strict';
    if (inv.BROAD_PAPER_SIGNALS.test(blob)) return 'broad';
    return '';
}

// ------- CSV helpers -------
function csvCell(v) {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ------- Nạp record (live / backup) -------
async function loadLive() {
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

function loadBackup(file) {
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

// ------- Xây 1 dòng draft -------
function buildRow({ id, metadata }) {
    const m = metadata;
    const klass = inv.classify(id, m.source_type);
    const isTthc = klass === 'tthc';
    const naIfNotTthc = isTthc ? '' : 'N/A';

    const candidateThoiHan = isTthc ? extractThoiHan(m.text) : '';
    const candidateMauDon = isTthc ? extractMauDon(m.text) : '';
    const suggestedAuthority = isTthc ? (AUTHORITY_BY_CAP[m.cap] || '') : 'N/A';
    const existingFee = feeExisting(m);

    return {
        review_tier: isTthc ? 'HIGH' : 'BULK',
        id,
        klass,
        title: m.title || '',
        source_decision: m.source_decision || '',
        cap: m.cap || '',
        // Governance — final_* để người duyệt chốt (đã prefill gợi ý an toàn).
        final_review_status: REVIEW_STATUS_BY_CLASS[klass] || 'pending',
        final_source_priority: inv.PRIORITY_BY_CLASS[klass] || 'pending',
        final_valid_from: '',                 // người duyệt điền theo ngày hiệu lực nguồn
        final_valid_to: naIfNotTthc,          // procedure hiện hành thường chưa có hạn kết thúc
        final_supersedes: '',                 // điền id nguồn cũ nếu record này thay thế
        final_procedure_version: '',
        final_last_verified_at: '',           // T3.4 đóng dấu ngày duyệt; để trống ở draft
        // Structured facts.
        existing_phi_le_phi: existingFee,
        final_phi_le_phi: existingFee || naIfNotTthc,
        candidate_thoi_han: candidateThoiHan,
        final_thoi_han: candidateThoiHan || naIfNotTthc,
        candidate_mau_don: candidateMauDon,
        final_mau_don: candidateMauDon || naIfNotTthc,
        suggested_authority: suggestedAuthority,
        final_authority: suggestedAuthority,
        paper_flag: paperFlag(id, m),         // strict = xem superseded; broad = cân nhắc
        notes: ''
    };
}

const COLUMNS = [
    'review_tier', 'id', 'klass', 'title', 'source_decision', 'cap',
    'final_review_status', 'final_source_priority', 'final_valid_from', 'final_valid_to',
    'final_supersedes', 'final_procedure_version', 'final_last_verified_at',
    'existing_phi_le_phi', 'final_phi_le_phi', 'candidate_thoi_han', 'final_thoi_han',
    'candidate_mau_don', 'final_mau_don', 'suggested_authority', 'final_authority',
    'paper_flag', 'notes'
];

async function main() {
    const args = process.argv.slice(2);
    const sourceArg = (args.find(a => a.startsWith('--source=')) || '--source=live').split('=')[1];
    const includeTruSo = args.includes('--include-tru-so');
    const backupFile = args.find(a => !a.startsWith('--'));

    let loaded;
    if (sourceArg === 'backups') {
        loaded = loadBackup(backupFile);
    } else {
        if (!process.env.PINECONE_API_KEY) {
            console.error('Thiếu PINECONE_API_KEY — chạy live cần key. Dùng --source=backups để chạy offline.');
            process.exitCode = 1;
            return;
        }
        loaded = await loadLive();
    }

    const rows = loaded.records
        .map(buildRow)
        .filter(r => includeTruSo || (r.klass !== 'tru_so' && r.klass !== 'other'));

    // tthc (HIGH) lên đầu để người duyệt soi trước, rồi theo id.
    rows.sort((a, b) => {
        if (a.review_tier !== b.review_tier) return a.review_tier === 'HIGH' ? -1 : 1;
        return a.id.localeCompare(b.id);
    });

    const lines = [COLUMNS.map(csvCell).join(',')];
    for (const r of rows) lines.push(COLUMNS.map(c => csvCell(r[c])).join(','));
    fs.mkdirSync(path.dirname(OUT_CSV), { recursive: true });
    fs.writeFileSync(OUT_CSV, lines.join('\n') + '\n', 'utf8');

    const tiers = {};
    const paper = { strict: 0, broad: 0 };
    for (const r of rows) {
        tiers[r.review_tier] = (tiers[r.review_tier] || 0) + 1;
        if (r.paper_flag) paper[r.paper_flag]++;
    }
    console.log(JSON.stringify({
        source: loaded.source, rows: rows.length, byTier: tiers, paperFlags: paper, csv: OUT_CSV
    }, null, 2));
}

main().catch(err => { console.error(err); process.exitCode = 1; });
