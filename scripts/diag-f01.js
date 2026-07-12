const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { Pinecone } = require('@pinecone-database/pinecone');

const QUESTION = 'Tôi là người nước ngoài, cần đăng ký tạm trú';
const EMBED_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent';

async function embed(text) {
    const r = await fetch(`${EMBED_URL}?key=${process.env.GEMINI_API_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'models/gemini-embedding-001', content: { parts: [{ text }] }, outputDimensionality: 768 })
    });
    if (!r.ok) throw new Error(`embed ${r.status} ${await r.text()}`);
    return (await r.json()).embedding.values;
}

(async () => {
    const indexName = process.env.PINECONE_INDEX_NAME || 'chatbot-tthc-xnc';
    const host = process.env.PINECONE_INDEX_HOST || undefined;
    const ns = process.env.PINECONE_NAMESPACE || 'chatbot-tthc-xnc';
    const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    const index = pc.index(indexName, host).namespace(ns);

    const v = await embed(QUESTION);

    const res = await index.query({ vector: v, topK: 12, includeMetadata: true });
    console.log(`\n=== F01: "${QUESTION}" — topK=12, KHONG filter ===`);
    (res.matches || []).forEach((m, i) => {
        const md = m.metadata || {};
        const naHit = /phiếu|NA17|fax|nộp trực tiếp|đăng ký tạm trú/i.test(md.text || '');
        console.log(`${String(i + 1).padStart(2)}. ${m.score.toFixed(3)} | id=${m.id} | intent=${md.retrieval_intent || md.loai_thu_tuc || '?'} | src=${md.source_file || md.van_ban || '?'} | rev=${md.review_status ?? '-'} sup=${md.supersedes ?? '-'}${naHit ? '  <<< paper/citizen-term' : ''}`);
    });

    const fetched = await index.fetch(['tthc_matt26265']);
    const rec = fetched.records?.['tthc_matt26265'];
    console.log(`\n=== tthc_matt26265 ton tai: ${!!rec} ===`);
    if (rec) {
        const md = rec.metadata || {};
        console.log(`intent=${md.retrieval_intent} | loai=${md.loai_thu_tuc} | rev=${md.review_status ?? '-'} | mau_don=${JSON.stringify(md.mau_don || '')}`);
        const rank = (res.matches || []).findIndex(m => m.id === 'tthc_matt26265');
        console.log(`Xep hang trong top-12 khong filter: ${rank === -1 ? 'KHONG co trong top-12' : `#${rank + 1}`}`);
    }
})().catch(e => { console.error(e); process.exit(1); });
