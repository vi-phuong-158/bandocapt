'use strict';
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { Pinecone } = require('@pinecone-database/pinecone');
const { normalizeCap } = require('../lib/retrieval-governance');
const { proposedId } = require('./import-phutho-web-to-pinecone');

const ROOT = path.resolve(__dirname, '..');
for (const filename of ['.env', '.env.local']) {
    const file = path.join(ROOT, filename);
    if (fs.existsSync(file)) for (const [key, value] of Object.entries(dotenv.parse(fs.readFileSync(file, 'utf8')))) {
        if (String(value || '').trim()) process.env[key] = value;
    }
}
const namespace = process.env.PINECONE_CANDIDATE_NAMESPACE || 'chatbot-tthc-xnc-web-rd-20260715';
const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tthc-phutho-source.json'), 'utf8'));

function metadataFor(source) {
    const id = proposedId(source.site_id);
    const isKbttWebsiteReference = source.site_id === '2372-17';
    return {
        cap_normalized: normalizeCap(source.level),
        canonical_procedure_key: isKbttWebsiteReference ? 'tam-tru-khai-bao-nguoi-nuoc-ngoai' : id,
        ...(isKbttWebsiteReference ? {
            retrieval_intent: 'tam_tru_khai_bao_website_reference',
            review_status: 'superseded',
            source_priority: 'legacy',
            superseded_by: 'tthc_matt26265',
            governance_note: 'KBTT online record is the user-approved operational source; do not retrieve this website version.'
        } : {})
    };
}

async function main() {
    const apply = process.argv.includes('--apply');
    const active = snapshot.procedures.filter(source => !(source.risk_flags || []).includes('paper_flow_candidate'));
    const plan = active.map(source => ({ id: proposedId(source.site_id), metadata: metadataFor(source) }));
    if (!apply) return console.log(JSON.stringify({ mode: 'dry-run', namespace, updates: plan.length, kbttWebsiteReference: 'tthc_phutho_web_2372-17' }, null, 2));
    if (!process.env.PINECONE_API_KEY) throw new Error('Thiếu PINECONE_API_KEY.');
    const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    const index = pc.index(process.env.PINECONE_INDEX_NAME || 'chatbot-tthc-xnc', process.env.PINECONE_INDEX_HOST || undefined).namespace(namespace);
    const backupDir = path.join(ROOT, 'data/pinecone-backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const manifest = path.join(backupDir, `${new Date().toISOString().replace(/[:.]/g, '-')}--phutho-web-governance-${namespace}.json`);
    fs.writeFileSync(manifest, JSON.stringify({ namespace, updates: plan }, null, 2), 'utf8');
    for (const record of plan) await index.update({ id: record.id, metadata: record.metadata });
    console.log(JSON.stringify({ mode: 'apply', namespace, updates: plan.length, manifest: path.relative(ROOT, manifest) }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
