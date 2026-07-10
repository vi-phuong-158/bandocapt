'use strict';

// =====================================================================
// P2.2 — Re-embed toàn bộ corpus với taskType RETRIEVAL_DOCUMENT sang một
// NAMESPACE MỚI, để dùng cặp embedding bất đối xứng với query-side
// RETRIEVAL_QUERY (bật qua env EMBED_TASK_TYPE trong api/chat.js).
//
// Vì sao namespace mới: rollback = đổi PINECONE_NAMESPACE về namespace cũ và
// bỏ env EMBED_TASK_TYPE — không đụng dữ liệu gốc. KÍCH HOẠT đồng bộ:
//   - upsert xong namespace mới bằng script này (--apply)
//   - đặt PINECONE_NAMESPACE=<target> và EMBED_TASK_TYPE=RETRIEVAL_QUERY trên Vercel
//   - deploy — query và corpus khớp không gian embedding cùng lúc.
//
// QUY TRÌNH:
//   node setup/reembed-corpus.js                          (mặc định --dry-run: chỉ đếm)
//   node setup/reembed-corpus.js --apply --target <ns>    (re-embed + upsert sang <ns>)
//
// Không có env Pinecone/Gemini hợp lệ thì thoát sớm, không làm gì.
// =====================================================================

const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const EMBED_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent';
const BACKUP_DIR = path.resolve(__dirname, '../data/pinecone-backups');
const DOC_TASK_TYPE = 'RETRIEVAL_DOCUMENT';

function getPc() {
    const { Pinecone } = require('@pinecone-database/pinecone');
    return new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
}

async function embedDocument(text) {
    const res = await fetch(`${EMBED_URL}?key=${process.env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'models/gemini-embedding-001',
            content: { parts: [{ text }] },
            outputDimensionality: 768,
            taskType: DOC_TASK_TYPE
        })
    });
    if (!res.ok) throw new Error(`Embedding failed ${res.status}: ${await res.text()}`);
    return (await res.json()).embedding?.values || [];
}

async function loadAll(activeIndex) {
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
            if (!rec) continue;
            records.push({ id, metadata: rec.metadata || {}, values: rec.values });
        }
    }
    return records;
}

function stampNow() {
    return new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '').replace('T', '_');
}

async function main() {
    if (!process.env.PINECONE_API_KEY || !process.env.GEMINI_API_KEY) {
        console.error('Thiếu PINECONE_API_KEY hoặc GEMINI_API_KEY — script thoát, không làm gì.');
        process.exitCode = 1;
        return;
    }

    const apply = process.argv.includes('--apply');
    const targetIdx = process.argv.indexOf('--target');
    const indexName = process.env.PINECONE_INDEX_NAME || 'chatbot-tthc-xnc';
    const indexHost = process.env.PINECONE_INDEX_HOST || undefined;
    const sourceNs = process.env.PINECONE_NAMESPACE || 'chatbot-tthc-xnc';
    const targetNs = targetIdx >= 0 ? process.argv[targetIdx + 1] : `${sourceNs}-rd`;

    const pc = getPc();
    const base = pc.index(indexName, indexHost);
    const sourceIndex = base.namespace(sourceNs);
    const records = await loadAll(sourceIndex);
    const withText = records.filter(r => r.metadata.text);

    if (!apply) {
        console.log(JSON.stringify({
            mode: 'dry-run', sourceNs, targetNs,
            totalRecords: records.length, withText: withText.length,
            note: 'Chạy lại với --apply --target <ns> để re-embed. KHÔNG đụng namespace nguồn.'
        }, null, 2));
        return;
    }

    if (targetNs === sourceNs) throw new Error('Target namespace trùng source — từ chối để bảo vệ dữ liệu gốc.');

    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = stampNow();
    fs.writeFileSync(
        path.join(BACKUP_DIR, `${stamp}-pre-reembed-${sourceNs}.json`),
        JSON.stringify(records.map(r => ({ id: r.id, metadata: r.metadata })), null, 2), 'utf8'
    );

    const targetIndex = base.namespace(targetNs);
    let done = 0;
    for (const r of withText) {
        const values = await embedDocument(r.metadata.text);
        if (!values.length) throw new Error(`Embedding rỗng cho ${r.id}`);
        await targetIndex.upsert([{ id: r.id, values, metadata: r.metadata }]);
        done++;
        if (done % 10 === 0) console.log(`  ...${done}/${withText.length}`);
    }

    // Verify: fetch lại vài record, đảm bảo tồn tại trong namespace mới.
    const sample = withText.slice(0, 3).map(r => r.id);
    const check = await targetIndex.fetch(sample);
    for (const id of sample) {
        if (!check.records?.[id]?.values?.length) throw new Error(`Verify thất bại: ${id} chưa có trong ${targetNs}`);
    }

    console.log(JSON.stringify({
        mode: 'apply', sourceNs, targetNs, reembedded: done,
        next: `Đặt PINECONE_NAMESPACE=${targetNs} và EMBED_TASK_TYPE=RETRIEVAL_QUERY rồi deploy.`
    }, null, 2));
}

main().catch(err => { console.error(err); process.exitCode = 1; });
