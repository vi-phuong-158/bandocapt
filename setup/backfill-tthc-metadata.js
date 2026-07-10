'use strict';

// =====================================================================
// P2.1 — Backfill metadata `thoi_han` (thời gian giải quyết) và `mau_don`
// (mã mẫu đơn) cho các record tthc_* trên Pinecone.
//
// `buildVerifiedFactsLine` trong api/chat.js đã sẵn sàng đọc 2 field này và
// bơm thành khối [FACTS ĐÃ XÁC MINH] vào prompt — nhưng metadata gốc phần lớn
// chưa có (xem docs/brain/03-decisions.md 2026-07-02). Script này backfill.
//
// QUY TRÌNH 2 BƯỚC (an toàn, có người duyệt):
//   1) node setup/backfill-tthc-metadata.js            (mặc định --draft)
//        → đọc toàn bộ tthc_*, trích ứng viên thoi_han/mau_don từ `text`,
//          xuất data/tthc-metadata-draft.csv. KHÔNG ghi Pinecone.
//   2) (người duyệt sửa CSV, điền cột final_thoi_han / final_mau_don)
//   3) node setup/backfill-tthc-metadata.js --apply data/tthc-metadata-draft.csv
//        → backup từng record → upsert metadata (GIỮ nguyên vector cũ) → verify.
//
// Không có env Pinecone/Gemini hợp lệ thì script thoát sớm, không làm gì.
// =====================================================================

const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const DRAFT_PATH = path.resolve(__dirname, '../data/tthc-metadata-draft.csv');
const BACKUP_DIR = path.resolve(__dirname, '../data/pinecone-backups');

// ------- Trích ứng viên từ text (heuristic, người duyệt sẽ chốt) -------
const THOI_HAN_LINE = /(?:^|\n)\s*(?:Thời hạn giải quyết|Thời hạn|Hạn khai báo|Thời gian giải quyết)\s*:\s*([^\n]+)/i;
const DURATION_INLINE = /trong\s+(?:vòng\s+)?\d+\s*(?:ngày làm việc|ngày|giờ)[^\n.]*/i;
const MAU_DON_LINE = /(?:^|\n)\s*(?:Mẫu đơn|Mẫu tờ khai|Biểu mẫu)\s*:\s*([^\n]+)/i;
const FORM_CODE = /\b(?:NA|TK|TT|M|XC|HC)\d{1,3}\b/gi;

function extractThoiHanCandidate(text) {
    const line = THOI_HAN_LINE.exec(text || '');
    if (line) return line[1].trim();
    const inline = DURATION_INLINE.exec(text || '');
    if (inline) return inline[0].trim();
    return '';
}

function extractMauDonCandidate(text) {
    const line = MAU_DON_LINE.exec(text || '');
    if (line) return line[1].trim();
    const codes = (text || '').match(FORM_CODE);
    if (codes) return [...new Set(codes.map(c => c.toUpperCase()))].join(', ');
    return '';
}

// ------- CSV helpers (tối giản, escape đúng dấu phẩy/ngoặc kép/newline) -------
function csvCell(value) {
    const s = String(value == null ? '' : value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function parseCsv(content) {
    const rows = [];
    let field = '';
    let row = [];
    let inQuotes = false;
    for (let i = 0; i < content.length; i++) {
        const ch = content[i];
        if (inQuotes) {
            if (ch === '"') {
                if (content[i + 1] === '"') { field += '"'; i++; }
                else inQuotes = false;
            } else field += ch;
        } else if (ch === '"') inQuotes = true;
        else if (ch === ',') { row.push(field); field = ''; }
        else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else if (ch === '\r') { /* skip */ }
        else field += ch;
    }
    if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
    return rows.filter(r => r.length > 1 || (r.length === 1 && r[0] !== ''));
}

// ------- Pinecone helpers -------
async function loadTthcRecords(activeIndex) {
    let paginationToken;
    const ids = [];
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
            if (!rec?.metadata) continue;
            if (rec.metadata.source_type !== 'tthc') continue;
            records.push({ id, metadata: rec.metadata, values: rec.values });
        }
    }
    return records;
}

function getActiveIndex() {
    const { Pinecone } = require('@pinecone-database/pinecone');
    const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    const indexName = process.env.PINECONE_INDEX_NAME || 'chatbot-tthc-xnc';
    const indexHost = process.env.PINECONE_INDEX_HOST || undefined;
    const namespace = process.env.PINECONE_NAMESPACE || 'chatbot-tthc-xnc';
    const base = pc.index(indexName, indexHost);
    return { activeIndex: base.namespace(namespace), namespace };
}

function stampNow() {
    return new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '').replace('T', '_');
}

// ------- Mode: draft -------
async function runDraft() {
    const { activeIndex, namespace } = getActiveIndex();
    const records = await loadTthcRecords(activeIndex);
    records.sort((a, b) => a.id.localeCompare(b.id));

    const header = ['id', 'title', 'existing_thoi_han', 'candidate_thoi_han', 'final_thoi_han', 'existing_mau_don', 'candidate_mau_don', 'final_mau_don'];
    const lines = [header.map(csvCell).join(',')];
    for (const r of records) {
        const m = r.metadata;
        lines.push([
            r.id,
            m.title || '',
            m.thoi_han || '',
            extractThoiHanCandidate(m.text),
            m.thoi_han || '',            // final mặc định = existing (người duyệt sửa)
            m.mau_don || '',
            extractMauDonCandidate(m.text),
            m.mau_don || ''
        ].map(csvCell).join(','));
    }
    fs.writeFileSync(DRAFT_PATH, lines.join('\n') + '\n', 'utf8');
    console.log(JSON.stringify({
        mode: 'draft', namespace, records: records.length, draft: DRAFT_PATH,
        note: 'Sửa cột final_thoi_han / final_mau_don rồi chạy lại với --apply <csv>.'
    }, null, 2));
}

// ------- Mode: apply -------
async function runApply(csvPath) {
    const rows = parseCsv(fs.readFileSync(path.resolve(csvPath), 'utf8'));
    const header = rows.shift();
    const col = name => header.indexOf(name);
    const cId = col('id'), cTh = col('final_thoi_han'), cMd = col('final_mau_don');
    if (cId < 0 || cTh < 0 || cMd < 0) {
        throw new Error('CSV thiếu cột id / final_thoi_han / final_mau_don.');
    }

    const { activeIndex, namespace } = getActiveIndex();
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = stampNow();
    const applied = [];

    for (const row of rows) {
        const id = (row[cId] || '').trim();
        if (!id) continue;
        const thoiHan = (row[cTh] || '').trim();
        const mauDon = (row[cMd] || '').trim();
        if (!thoiHan && !mauDon) continue;

        const before = await activeIndex.fetch([id]);
        const rec = before.records?.[id];
        if (!rec?.metadata) { console.warn('[skip] không tìm thấy record', id); continue; }

        fs.writeFileSync(
            path.join(BACKUP_DIR, `${stamp}-pre-backfill-${id}.json`),
            JSON.stringify({ id, ...rec }, null, 2), 'utf8'
        );

        const newMetadata = { ...rec.metadata };
        if (thoiHan) newMetadata.thoi_han = thoiHan;
        if (mauDon) newMetadata.mau_don = mauDon;

        // Chỉ cập nhật metadata, GIỮ nguyên vector cũ (không re-embed).
        await activeIndex.update({ id, metadata: newMetadata });

        const after = await activeIndex.fetch([id]);
        const am = after.records?.[id]?.metadata || {};
        if (thoiHan && am.thoi_han !== thoiHan) throw new Error(`Verify thoi_han thất bại cho ${id}`);
        if (mauDon && am.mau_don !== mauDon) throw new Error(`Verify mau_don thất bại cho ${id}`);
        applied.push({ id, thoi_han: am.thoi_han, mau_don: am.mau_don });
    }

    console.log(JSON.stringify({ mode: 'apply', namespace, applied: applied.length, records: applied }, null, 2));
}

async function main() {
    if (!process.env.PINECONE_API_KEY) {
        console.error('Thiếu PINECONE_API_KEY — script thoát, không làm gì.');
        process.exitCode = 1;
        return;
    }
    const applyIdx = process.argv.indexOf('--apply');
    if (applyIdx >= 0) {
        const csvPath = process.argv[applyIdx + 1] || DRAFT_PATH;
        await runApply(csvPath);
    } else {
        await runDraft();
    }
}

main().catch(err => { console.error(err); process.exitCode = 1; });
