const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { Pinecone } = require('@pinecone-database/pinecone');

(async () => {
    const indexName = process.env.PINECONE_INDEX_NAME || 'chatbot-tthc-xnc';
    const host = process.env.PINECONE_INDEX_HOST || undefined;
    const ns = process.env.PINECONE_NAMESPACE || 'chatbot-tthc-xnc';
    const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    const index = pc.index(indexName, host).namespace(ns);

    const fetched = await index.fetch(['tthc_matt26265']);
    const rec = fetched.records?.['tthc_matt26265'];
    if (!rec) throw new Error('record not found');
    console.log(JSON.stringify({ id: 'tthc_matt26265', metadata: rec.metadata, vectorLen: rec.values?.length }, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
