'use strict';

// Nhập toàn bộ thủ tục hiện hành đã crawl từ website Phú Thọ vào namespace mới.
// Mục Phiếu/NA17 giữ quyết định superseded, không đưa vào luồng hiện hành.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { Pinecone } = require('@pinecone-database/pinecone');
const { categoryKey, listIds, textForProcedure } = require('./import-phutho-xa-to-pinecone');
const { normalizeCap } = require('../lib/retrieval-governance');

const ROOT = path.resolve(__dirname, '..');
const SNAPSHOT_PATH = path.join(ROOT, 'data/tthc-phutho-source.json');
const BACKUP_DIR = path.join(ROOT, 'data/pinecone-backups');
const EMBED_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent';
for (const filename of ['.env', '.env.local']) {
    const envPath = path.join(ROOT, filename);
    if (!fs.existsSync(envPath)) continue;
    for (const [key, value] of Object.entries(dotenv.parse(fs.readFileSync(envPath, 'utf8')))) {
        if (String(value || '').trim()) process.env[key] = value;
    }
}

function stamp() { return new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '').replace('T', '_'); }
function formCodes(source) {
    const text = [source.documents, ...(source.attachments || []).map(item => item.title)].filter(Boolean).join(' ');
    return [...new Set((text.match(/\b(?:NA|TK|TT|M|XC|HC)\d{1,3}[A-Z]?\b/gi) || []).map(x => x.toUpperCase()))].sort().join(', ') || 'N/A';
}
function proposedId(siteId) { return `tthc_phutho_web_${String(siteId).replace(/[^a-z0-9-]+/gi, '-')}`; }
function buildWebRecords(snapshot, verifiedAt) {
    const active = (snapshot.procedures || []).filter(source => !(source.risk_flags || []).includes('paper_flow_candidate'));
    return active.map(source => {
        const row = { service_level: source.service_level || 'N/A', form_codes: formCodes(source) };
        const text = textForProcedure(source, row);
        return {
            id: proposedId(source.site_id), source,
            text,
            contentHash: crypto.createHash('sha256').update(text).digest('hex'),
            metadata: {
                text, title: source.title, procedure_id: proposedId(source.site_id), source_type: 'tthc',
                loai_thu_tuc: categoryKey(source.category), linh_vuc: source.category, cap: source.level, cap_normalized: normalizeCap(source.level),
                service_level: row.service_level, authority: source.agency, thoi_han: source.processing_time,
                le_phi: source.fee || 'N/A', phi: 'N/A', mau_don: row.form_codes,
                review_status: 'approved', source_priority: 'current_procedure', valid_from: 'N/A', valid_to: 'N/A',
                procedure_version: source.content_hash, last_verified_at: verifiedAt,
                content_hash: crypto.createHash('sha256').update(text).digest('hex'),
                phutho_source_hash: source.content_hash, official_url: source.source_url,
                online_submission_url: source.online_submission_url || 'N/A',
                source_decision: 'TTHC Công an tỉnh Phú Thọ — nguồn website đã duyệt'
            }
        };
    });
}
function isValidVector(record) { return Array.isArray(record?.values) && record.values.length === 768; }
async function withTimeout(promise, label, ms = 60000) {
    let timer;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timeout sau ${ms}ms`)), ms); })
        ]);
    } finally { clearTimeout(timer); }
}
async function embedDocument(text) {
    let lastError;
    for (let attempt = 1; attempt <= 6; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        try {
            const response = await fetch(`${EMBED_URL}?key=${process.env.GEMINI_API_KEY}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: 'models/gemini-embedding-001', content: { parts: [{ text }] }, outputDimensionality: 768, taskType: 'RETRIEVAL_DOCUMENT' }),
                signal: controller.signal
            });
            if (!response.ok) {
                const detail = await response.text();
                const error = new Error(`Embedding HTTP ${response.status}: ${detail}`);
                error.status = response.status;
                throw error;
            }
            const values = (await response.json()).embedding?.values || [];
            if (values.length !== 768) throw new Error(`Embedding có ${values.length} chiều.`);
            return values;
        } catch (error) {
            lastError = error;
            if (attempt < 6) await new Promise(resolve => setTimeout(resolve, error.status === 429 ? 30000 : 1500 * attempt));
        } finally {
            clearTimeout(timeout);
        }
    }
    throw lastError;
}
async function fetchAll(index, ids) {
    const out = {}; for (let i = 0; i < ids.length; i += 100) Object.assign(out, (await withTimeout(index.fetch(ids.slice(i, i + 100)), 'PINECONE_FETCH')).records || {}); return out;
}
async function verifyAll(index, records) {
    const fetched = await fetchAll(index, records.map(r => r.id));
    for (const record of records) {
        const actual = fetched[record.id];
        if (!isValidVector(actual) || actual.metadata?.content_hash !== record.metadata.content_hash || actual.metadata?.review_status !== 'approved') throw new Error(`Verify thất bại: ${record.id}`);
    }
}
async function upsertOne(index, vector) {
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try { return await withTimeout(index.upsert([vector]), 'PINECONE_UPSERT', 90000); }
        catch (error) { lastError = error; if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 3000)); }
    }
    throw lastError;
}

async function main() {
    if (!process.env.PINECONE_API_KEY || !process.env.GEMINI_API_KEY) throw new Error('Thiếu PINECONE_API_KEY hoặc GEMINI_API_KEY.');
    const apply = process.argv.includes('--apply'); const resume = process.argv.includes('--resume');
    const delayFlag = process.argv.indexOf('--delay-ms'); const delayMs = delayFlag >= 0 ? Math.max(0, Number(process.argv[delayFlag + 1]) || 0) : 10000;
    const targetFlag = process.argv.indexOf('--target'); const targetNamespace = targetFlag >= 0 ? process.argv[targetFlag + 1] : 'chatbot-tthc-xnc-web-rd-20260715';
    const snapshotBuffer = fs.readFileSync(SNAPSHOT_PATH); const snapshot = JSON.parse(snapshotBuffer);
    const limitFlag = process.argv.indexOf('--limit'); const requestedLimit = limitFlag >= 0 ? Number(process.argv[limitFlag + 1]) : 0;
    const records = buildWebRecords(snapshot, new Date().toISOString()).slice(0, requestedLimit > 0 ? requestedLimit : undefined);
    const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY }); const indexName = process.env.PINECONE_INDEX_NAME || 'chatbot-tthc-xnc'; const host = process.env.PINECONE_INDEX_HOST || undefined;
    const target = pc.index(indexName, host).namespace(targetNamespace);
    if (!apply) { console.log(JSON.stringify({ mode: 'dry-run', targetNamespace, totalWebsite: snapshot.procedures.length, activeImported: records.length, excludedPaper: snapshot.procedures.length - records.length, existingTarget: 'deferred_to_apply_fetch', delayMs }, null, 2)); return; }
    const skipTargetFetch = process.argv.includes('--skip-target-fetch');
    const expectedIds = records.map(record => record.id);
    const existingTarget = resume && !skipTargetFetch ? await fetchAll(target, expectedIds) : {};
    if (!resume && Object.keys(existingTarget).length > 0) throw new Error(`Namespace đích đã có ${Object.keys(existingTarget).length} record; dùng --resume.`);
    const noSeed = process.argv.includes('--no-seed');
    const oldNs = process.env.PINECONE_XA_NAMESPACE || 'chatbot-tthc-xnc-xa-rd-20260715';
    let bySourceHash = new Map();
    if (!noSeed) {
        const oldIndex = pc.index(indexName, host).namespace(oldNs);
        const oldIds = await listIds(oldIndex); const oldRecords = await fetchAll(oldIndex, oldIds);
        bySourceHash = new Map(Object.values(oldRecords).filter(r => r.metadata?.phutho_source_hash).map(r => [r.metadata.phutho_source_hash, r]));
    }
    fs.mkdirSync(BACKUP_DIR, { recursive: true }); const backupPath = path.join(BACKUP_DIR, `${stamp()}-phutho-web-import-${targetNamespace}-manifest.json`);
    fs.writeFileSync(backupPath, JSON.stringify({ targetNamespace, sourceSnapshotSha256: crypto.createHash('sha256').update(snapshotBuffer).digest('hex'), records: records.map(r => ({ id: r.id, metadata: r.metadata })) }, null, 2), 'utf8');
    const oldTarget = existingTarget; let reused = 0; let embedded = 0; let done = 0;
    for (const record of records) {
        if (resume && isValidVector(oldTarget[record.id]) && oldTarget[record.id].metadata?.content_hash === record.metadata.content_hash) { reused += 1; done += 1; continue; }
        let values = bySourceHash.get(record.source.content_hash)?.values;
        if (values?.length === 768) reused += 1; else { values = await embedDocument(record.text); embedded += 1; }
        await upsertOne(target, { id: record.id, values, metadata: record.metadata }); done += 1;
        if (done % 10 === 0 || done === records.length) console.log(`Đã nhập ${done}/${records.length}`);
        if (delayMs > 0 && done < records.length) await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    const verified = process.argv.includes('--skip-verify') ? false : (await verifyAll(target, records), true);
    console.log(JSON.stringify({ mode: 'apply', targetNamespace, totalWebsite: snapshot.procedures.length, imported: records.length, embedded, reused, backup: path.relative(ROOT, backupPath), excludedPaper: snapshot.procedures.length - records.length, verified, next: 'T3.6/T3.7: kiểm thử retrieval toàn bộ website trước khi đổi production.' }, null, 2));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { buildWebRecords, categoryKey, proposedId };
