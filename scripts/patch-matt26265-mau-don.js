const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { Pinecone } = require('@pinecone-database/pinecone');

// T1.11 F01: bản ghi matt26265 vẫn nhúng cụm "mẫu NA17" (phiếu giấy, lỗi thời theo quyết định
// 2026-07-11) trong field mau_don — field này được bơm vào ngữ cảnh model qua MAU_DON=... (xem
// buildVerifiedFactsLine trong api/chat.js), tạo rủi ro rò forbidden obsolete_paper_flow.
// Chỉ sửa mau_don, GIỮ NGUYÊN vector values + text + content_hash (không cần re-embed, tránh
// đụng quota Gemini embedding đang cạn theo ngày).
// Mặc định chỉ xem trước. Phải truyền --apply mới được ghi Pinecone.
const RECORD_ID = 'tthc_matt26265';
const NEW_MAU_DON = 'N/A';

async function main() {
    if (!process.env.PINECONE_API_KEY) {
        throw new Error('Missing PINECONE_API_KEY in environment.');
    }

    const indexName = process.env.PINECONE_INDEX_NAME || 'chatbot-tthc-xnc';
    const indexHost = process.env.PINECONE_INDEX_HOST || undefined;
    const namespace = process.env.PINECONE_NAMESPACE || 'chatbot-tthc-xnc';
    const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    const index = pc.index(indexName, indexHost).namespace(namespace);
    const backupDir = path.resolve(__dirname, '../data/pinecone-backups');
    fs.mkdirSync(backupDir, { recursive: true });

    const beforeFetch = await index.fetch([RECORD_ID]);
    const beforeRecord = beforeFetch.records?.[RECORD_ID];
    if (!beforeRecord) {
        throw new Error(`Record ${RECORD_ID} not found in namespace ${namespace}.`);
    }
    if (!beforeRecord.values || beforeRecord.values.length === 0) {
        throw new Error('Fetched record has no vector values — cannot upsert without re-embedding.');
    }

    if (!/na17|phiếu|phieu/i.test(beforeRecord.metadata?.mau_don || '')) {
        console.log(JSON.stringify({ skipped: true, reason: 'mau_don already clean', mau_don: beforeRecord.metadata?.mau_don }, null, 2));
        return;
    }

    if (!process.argv.includes('--apply')) {
        console.log(JSON.stringify({
            mode: 'dry-run',
            recordId: RECORD_ID,
            indexName,
            namespace,
            mau_don_before: beforeRecord.metadata?.mau_don,
            mau_don_after: NEW_MAU_DON,
            note: 'Chạy lại với --apply để backup và ghi Pinecone.'
        }, null, 2));
        return;
    }

    const stamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '').replace('T', '_');
    const prePath = path.join(backupDir, `${stamp}-pre-patch-mau-don-${RECORD_ID}.json`);
    fs.writeFileSync(prePath, JSON.stringify({ id: RECORD_ID, ...beforeRecord }, null, 2), 'utf8');

    const patchedMetadata = {
        ...beforeRecord.metadata,
        mau_don: NEW_MAU_DON,
    };

    await index.upsert([{
        id: RECORD_ID,
        values: beforeRecord.values, // GIỮ NGUYÊN vector — không re-embed
        metadata: patchedMetadata,
    }]);

    const afterFetch = await index.fetch([RECORD_ID]);
    const afterRecord = afterFetch.records?.[RECORD_ID];
    const postPath = path.join(backupDir, `${stamp}-post-patch-mau-don-${RECORD_ID}.json`);
    fs.writeFileSync(postPath, JSON.stringify({ id: RECORD_ID, ...afterRecord }, null, 2), 'utf8');

    if (/na17|phiếu|phieu/i.test(afterRecord?.metadata?.mau_don || '')) {
        throw new Error('Post-patch mau_don still contains NA17/phiếu reference.');
    }
    if (afterRecord?.metadata?.text !== beforeRecord.metadata?.text) {
        throw new Error('text field changed unexpectedly — investigate before trusting this patch.');
    }
    if (afterRecord?.metadata?.content_hash !== beforeRecord.metadata?.content_hash) {
        throw new Error('content_hash changed unexpectedly — text should have been untouched.');
    }
    if (JSON.stringify(afterRecord?.values) !== JSON.stringify(beforeRecord.values)) {
        throw new Error('Vector values changed unexpectedly — expected untouched (no re-embed).');
    }

    console.log(JSON.stringify({
        preBackup: prePath,
        postBackup: postPath,
        mau_don_before: beforeRecord.metadata.mau_don,
        mau_don_after: afterRecord.metadata.mau_don,
        vectorUnchanged: true,
        textUnchanged: true,
    }, null, 2));
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
