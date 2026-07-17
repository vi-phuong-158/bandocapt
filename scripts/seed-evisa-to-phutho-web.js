'use strict';
// Seed thủ tục e-visa (tthc_5568-tw-06, cấp trung ương) từ namespace production cũ sang
// namespace ứng viên. Lý do: website tỉnh không có e-visa (thủ tục Cục QLXNC) nên importer
// web bỏ sót → EV01 fail cấu trúc (xem 06-ai-working-log 2026-07-17). Tái dùng vector gốc
// (text không đổi) — không gọi embedding, không tốn quota Gemini.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { Pinecone } = require('@pinecone-database/pinecone');

const ROOT = path.resolve(__dirname, '..');
for (const filename of ['.env', '.env.local']) {
    const file = path.join(ROOT, filename);
    if (fs.existsSync(file)) for (const [key, value] of Object.entries(dotenv.parse(fs.readFileSync(file, 'utf8')))) {
        if (String(value || '').trim()) process.env[key] = value;
    }
}

const RECORD_ID = 'tthc_5568-tw-06';
const sourceNamespace = process.env.PINECONE_SOURCE_NAMESPACE || 'chatbot-tthc-xnc';
const targetNamespace = process.env.PINECONE_CANDIDATE_NAMESPACE || 'chatbot-tthc-xnc-web-rd-20260715';
const BACKUP_DIR = path.join(ROOT, 'data/pinecone-backups');

// Governance ứng viên (lib/retrieval-governance SOURCE_POLICIES): tthc phải là
// approved/current_procedure. loai_thu_tuc/linh_vuc theo đúng quy ước importer web
// (categoryKey('Quản lý xuất nhập cảnh') = 'xuat_nhap_canh') để khớp category filter runtime.
function buildSeedMetadata(original) {
    return {
        ...original,
        loai_thu_tuc: 'xuat_nhap_canh',
        linh_vuc: 'Quản lý xuất nhập cảnh',
        review_status: 'approved',
        source_priority: 'current_procedure',
        valid_from: 'N/A',
        valid_to: 'N/A',
        canonical_procedure_key: 'thi-thuc-dien-tu-nguoi-nuoc-ngoai',
        last_verified_at: new Date().toISOString(),
        seeded_from_namespace: sourceNamespace,
    };
}

async function main() {
    const apply = process.argv.includes('--apply');
    if (!process.env.PINECONE_API_KEY) throw new Error('Thiếu PINECONE_API_KEY.');
    const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    const indexName = process.env.PINECONE_INDEX_NAME || 'chatbot-tthc-xnc';
    const host = process.env.PINECONE_INDEX_HOST || undefined;
    const source = pc.index(indexName, host).namespace(sourceNamespace);
    const target = pc.index(indexName, host).namespace(targetNamespace);

    const fetched = (await source.fetch([RECORD_ID])).records?.[RECORD_ID];
    if (!fetched?.values?.length || !fetched?.metadata?.text) {
        throw new Error(`Không tìm thấy ${RECORD_ID} (kèm vector + text) trong namespace nguồn ${sourceNamespace}.`);
    }
    const metadata = buildSeedMetadata(fetched.metadata);
    const contentHash = crypto.createHash('sha256').update(String(fetched.metadata.text)).digest('hex');
    const summary = {
        mode: apply ? 'apply' : 'dry-run',
        id: RECORD_ID,
        sourceNamespace,
        targetNamespace,
        dims: fetched.values.length,
        title: metadata.title,
        content_hash_sha256: contentHash,
        original_content_hash: fetched.metadata.content_hash || null,
    };
    if (!apply) return console.log(JSON.stringify(summary, null, 2));

    // Backup trạng thái đích trước khi ghi (kể cả khi chưa tồn tại — ghi manifest rollback).
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const existing = (await target.fetch([RECORD_ID])).records?.[RECORD_ID] || null;
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    const backupPath = path.join(BACKUP_DIR, `${stamp}-seed-evisa-${sourceNamespace}-to-${targetNamespace}.json`);
    fs.writeFileSync(backupPath, JSON.stringify({
        manifestVersion: 1,
        purpose: 'Seed e-visa tthc_5568-tw-06 sang namespace ứng viên (EV01). Rollback: nếu preExisting=null thì xóa id khỏi target; ngược lại upsert lại preExisting.',
        createdAt: new Date().toISOString(),
        indexName, sourceNamespace, targetNamespace,
        preExisting: existing,
        seeded: { id: RECORD_ID, metadata },
    }, null, 2));

    await target.upsert([{ id: RECORD_ID, values: fetched.values, metadata }]);

    // Verify: đọc lại từ đích, so chiều vector + hash text + cờ governance.
    const check = (await target.fetch([RECORD_ID])).records?.[RECORD_ID];
    const verifyHash = crypto.createHash('sha256').update(String(check?.metadata?.text || '')).digest('hex');
    const ok = check?.values?.length === fetched.values.length
        && verifyHash === contentHash
        && check?.metadata?.review_status === 'approved'
        && check?.metadata?.source_priority === 'current_procedure'
        && check?.metadata?.source_type === 'tthc';
    console.log(JSON.stringify({ ...summary, backupPath: path.relative(ROOT, backupPath), verified: ok }, null, 2));
    if (!ok) throw new Error('Verify sau upsert KHÔNG đạt — kiểm tra backup và trạng thái namespace đích.');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
