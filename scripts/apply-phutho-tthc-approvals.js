'use strict';

// T3.4 — Only applies the explicitly approved provincial-source facts.  It never
// re-embeds, changes text/vector values, or touches unmatched records.
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { Pinecone } = require('@pinecone-database/pinecone');

const ROOT = path.resolve(__dirname, '..');
for (const filename of ['.env', '.env.local']) {
    const file = path.join(ROOT, filename);
    if (!fs.existsSync(file)) continue;
    for (const [key, value] of Object.entries(dotenv.parse(fs.readFileSync(file)))) {
        if (String(value || '').trim()) process.env[key] = value;
    }
}

const decisions = require(path.join(ROOT, 'data/tthc-phutho-review-decisions.json'));
const snapshot = require(path.join(ROOT, 'data/tthc-phutho-source.json'));
const reviewCsv = fs.readFileSync(path.join(ROOT, 'data/tthc-phutho-high-review.csv'), 'utf8');
const BACKUP_DIR = path.join(ROOT, 'data/pinecone-backups');
const FORM_CODE = /\b(?:NA|TK|TT|M|XC|HC)\d{1,3}\b/gi;

function parseCsv(content) {
    const rows = []; let field = ''; let row = []; let quoted = false;
    for (let i = 0; i < content.length; i += 1) {
        const ch = content[i];
        if (quoted) { if (ch === '"' && content[i + 1] === '"') { field += ch; i += 1; } else if (ch === '"') quoted = false; else field += ch; }
        else if (ch === '"') quoted = true;
        else if (ch === ',') { row.push(field); field = ''; }
        else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else if (ch !== '\r') field += ch;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    const [header, ...body] = rows;
    return body.filter(r => r.length === header.length).map(r => Object.fromEntries(header.map((key, i) => [key, r[i] || ''])));
}
function stamp() { return new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '').replace('T', '_'); }
function formCodes(value) { return [...new Set((value.match(FORM_CODE) || []).map(v => v.toUpperCase()))].join(', '); }
async function fetchUntil(index, id, predicate, attempts = 6) {
    let record;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        record = (await index.fetch([id])).records?.[id];
        if (predicate(record)) return record;
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    return record;
}

async function main() {
    if (!process.env.PINECONE_API_KEY) throw new Error('Thiếu PINECONE_API_KEY; không ghi dữ liệu.');
    const approved = new Set(decisions.approved_source_matches);
    const proceduresByUrl = new Map(snapshot.procedures.map(item => [item.source_url, item]));
    const rows = parseCsv(reviewCsv).filter(row => approved.has(row.id));
    if (rows.length !== approved.size) throw new Error(`Thiếu mapping nguồn: tìm thấy ${rows.length}/${approved.size}.`);
    const name = process.env.PINECONE_INDEX_NAME || 'chatbot-tthc-xnc';
    const host = process.env.PINECONE_INDEX_HOST || undefined;
    const namespace = process.env.PINECONE_NAMESPACE || 'chatbot-tthc-xnc';
    const index = new Pinecone({ apiKey: process.env.PINECONE_API_KEY }).index(name, host).namespace(namespace);
    const apply = process.argv.includes('--apply');
    const verifiedAt = new Date().toISOString();
    const preview = [];
    for (const row of rows) {
        const source = proceduresByUrl.get(row.source_url);
        if (!source) throw new Error(`Không có snapshot tương ứng cho ${row.id}.`);
        const before = (await index.fetch([row.id])).records?.[row.id];
        if (!before?.metadata) throw new Error(`Không tìm thấy record ${row.id} trong namespace ${namespace}.`);
        const action = decisions.approved_actions[row.id] || {};
        const metadata = {
            ...before.metadata,
            review_status: 'approved', source_priority: 'current_procedure', valid_to: 'N/A',
            last_verified_at: verifiedAt, authority: source.agency || before.metadata.authority || '',
            thoi_han: source.processing_time || before.metadata.thoi_han || '',
            phutho_source_url: source.source_url, phutho_source_hash: source.content_hash
        };
        const sourceForm = formCodes(source.attachments.map(item => item.title).join(' '));
        if (action.form === 'retain_NA5') metadata.mau_don = 'NA5';
        else if (action.form === 'retain_NA13') metadata.mau_don = 'NA13';
        else if (sourceForm) metadata.mau_don = sourceForm;
        if (source.fee) { metadata.le_phi = 'Không'; metadata.phi = source.fee; }
        preview.push({ id: row.id, title: before.metadata.title, thoi_han: metadata.thoi_han, mau_don: metadata.mau_don, has_fee: Boolean(source.fee) });
        if (!apply) continue;
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        const prefix = `${stamp()}-phutho-t3-4-${row.id}`;
        fs.writeFileSync(path.join(BACKUP_DIR, `${prefix}-pre.json`), JSON.stringify({ id: row.id, ...before }, null, 2), 'utf8');
        await index.update({ id: row.id, metadata });
        const after = await fetchUntil(index, row.id, record =>
            record?.metadata?.review_status === 'approved' && record.metadata.phutho_source_hash === source.content_hash);
        fs.writeFileSync(path.join(BACKUP_DIR, `${prefix}-post.json`), JSON.stringify({ id: row.id, ...after }, null, 2), 'utf8');
        if (after?.metadata?.review_status !== 'approved' || after.metadata.phutho_source_hash !== source.content_hash) throw new Error(`Xác minh metadata thất bại: ${row.id}.`);
        if (JSON.stringify(after.values) !== JSON.stringify(before.values) || after.metadata.text !== before.metadata.text) throw new Error(`Vector/text thay đổi ngoài ý muốn: ${row.id}.`);
    }
    // KBTT is an approved no-change decision: govern the existing canonical
    // record, but deliberately do not copy the contradictory provincial page.
    const kbttId = 'tthc_matt26265';
    const kbttBefore = (await index.fetch([kbttId])).records?.[kbttId];
    if (!kbttBefore?.metadata) throw new Error(`Không tìm thấy record ${kbttId} trong namespace ${namespace}.`);
    const kbttMetadata = {
        ...kbttBefore.metadata,
        review_status: 'approved', source_priority: 'current_procedure', valid_to: 'N/A',
        last_verified_at: verifiedAt,
        phutho_source_conflict: 'Do not overwrite KBTT canonical 12h/24h declaration deadline with provincial 24h/07d listing.'
    };
    preview.push({ id: kbttId, title: kbttBefore.metadata.title, action: 'approved_no_change' });
    if (apply) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        const prefix = `${stamp()}-phutho-t3-4-${kbttId}`;
        fs.writeFileSync(path.join(BACKUP_DIR, `${prefix}-pre.json`), JSON.stringify({ id: kbttId, ...kbttBefore }, null, 2), 'utf8');
        await index.update({ id: kbttId, metadata: kbttMetadata });
        const kbttAfter = await fetchUntil(index, kbttId, record => record?.metadata?.review_status === 'approved');
        fs.writeFileSync(path.join(BACKUP_DIR, `${prefix}-post.json`), JSON.stringify({ id: kbttId, ...kbttAfter }, null, 2), 'utf8');
        if (kbttAfter?.metadata?.review_status !== 'approved' || kbttAfter.metadata.text !== kbttBefore.metadata.text || JSON.stringify(kbttAfter.values) !== JSON.stringify(kbttBefore.values)) throw new Error(`Xác minh KBTT thất bại.`);
    }
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', namespace, count: preview.length, records: preview }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
