'use strict';

// Gắn vai trò nguồn cho law/guide mà không tự duyệt chúng. Khi governance bật,
// record pending/superseded vẫn bị chặn cho tới khi có đợt review riêng.
// Mọi lần ghi đều cần namespace xác nhận tường minh, full backup và có rollback.
const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const dotenv = require('dotenv');
const { Pinecone } = require('@pinecone-database/pinecone');
const { classify, PRIORITY_BY_CLASS } = require('./inventory-corpus');

const ROOT = path.resolve(__dirname, '..');
const BACKUP_DIR = path.join(ROOT, 'data/pinecone-backups');
const TARGET_CLASSES = new Set(['law', 'guide']);
const MANIFEST_VERSION = 1;

function loadEnvFromNearestAncestor() {
    let dir = ROOT;
    while (true) {
        let found = false;
        for (const filename of ['.env', '.env.local']) {
            const envPath = path.join(dir, filename);
            if (!fs.existsSync(envPath)) continue;
            found = true;
            for (const [key, value] of Object.entries(dotenv.parse(fs.readFileSync(envPath, 'utf8')))) {
                if (!String(process.env[key] || '').trim() && String(value || '').trim()) process.env[key] = value;
            }
        }
        if (found) return;
        const parent = path.dirname(dir);
        if (parent === dir) return;
        dir = parent;
    }
}

loadEnvFromNearestAncestor();

function stamp() {
    return new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '').replace('T', '_');
}

function optionValue(name, args = process.argv.slice(2)) {
    const prefix = `${name}=`;
    const option = args.find(value => value.startsWith(prefix));
    return option ? option.slice(prefix.length).trim() : '';
}

function hasReviewStatus(metadata = {}) {
    return String(metadata.review_status || '').trim() !== '';
}

function isFullProcedureGuide(id, metadata = {}) {
    return classify(id, metadata.source_type) === 'guide'
        && String(metadata.section || '').trim().endsWith('Toàn văn thủ tục');
}

// Trả về kế hoạch cập nhật cho 1 record, hoặc null nếu ngoài phạm vi hoặc đã đúng.
// `pending` là trạng thái an toàn mặc định: gắn nhãn không đồng nghĩa được retrieval.
function planUpdate(id, metadata = {}) {
    const klass = classify(id, metadata.source_type);
    if (!TARGET_CLASSES.has(klass)) return null;
    const wantSourceType = klass;
    const wantPriority = PRIORITY_BY_CLASS[klass];
    const wantReviewStatus = hasReviewStatus(metadata) ? metadata.review_status : 'pending';
    if (metadata.source_type === wantSourceType
        && metadata.source_priority === wantPriority
        && metadata.review_status === wantReviewStatus) return null;
    return {
        id,
        klass,
        before: {
            source_type: metadata.source_type || null,
            source_priority: metadata.source_priority || null,
            review_status: metadata.review_status || null
        },
        after: {
            source_type: wantSourceType,
            source_priority: wantPriority,
            review_status: wantReviewStatus
        },
        metadata: {
            ...metadata,
            source_type: wantSourceType,
            source_priority: wantPriority,
            review_status: wantReviewStatus
        }
    };
}

function buildAudit(targetIds, records = {}) {
    const fullProcedureGuideIds = targetIds.filter(id => isFullProcedureGuide(id, records[id]?.metadata));
    const byClass = targetIds.reduce((acc, id) => {
        const klass = classify(id, records[id]?.metadata?.source_type);
        acc[klass] = (acc[klass] || 0) + 1;
        return acc;
    }, {});
    return { byClass, fullProcedureGuideIds };
}

function cloneRecord(id, record = {}) {
    if (!Array.isArray(record.values) || record.values.length === 0) {
        throw new Error(`Record ${id} không có vector đầy đủ để backup/rollback.`);
    }
    return {
        id,
        values: record.values,
        ...(record.sparseValues ? { sparseValues: record.sparseValues } : {}),
        metadata: record.metadata || {}
    };
}

function buildBackupManifest({ indexName, namespace, records, purpose }) {
    return {
        manifestVersion: MANIFEST_VERSION,
        purpose,
        createdAt: new Date().toISOString(),
        indexName,
        namespace,
        records
    };
}

function comparableRecord(record = {}) {
    return {
        id: record.id,
        values: record.values || [],
        sparseValues: record.sparseValues || null,
        metadata: record.metadata || {}
    };
}

function verifyUpdatedRecord(before, after, update) {
    if (!after?.metadata) throw new Error(`Không fetch được record sau cập nhật: ${update.id}.`);
    for (const [key, value] of Object.entries(update.after)) {
        if (after.metadata[key] !== value) throw new Error(`Xác minh metadata thất bại (${key}): ${update.id}.`);
    }
    if (after.metadata.text !== before.metadata?.text || after.metadata.content_hash !== before.metadata?.content_hash) {
        throw new Error(`text/content_hash thay đổi ngoài ý muốn: ${update.id}.`);
    }
    if (!isDeepStrictEqual(after.values, before.values) || !isDeepStrictEqual(after.sparseValues || null, before.sparseValues || null)) {
        throw new Error(`Vector thay đổi ngoài ý muốn: ${update.id}.`);
    }
}

function verifyRestoredRecord(expected, actual) {
    if (!isDeepStrictEqual(comparableRecord(actual), comparableRecord(expected))) {
        throw new Error(`Rollback không khôi phục đúng record: ${expected.id}.`);
    }
}

function assertConfirmedWrite(args, namespace) {
    const requestedNamespace = optionValue('--namespace', args);
    const confirmedNamespace = optionValue('--confirm-namespace', args);
    if (!requestedNamespace || requestedNamespace !== namespace || confirmedNamespace !== namespace) {
        throw new Error('Ghi Pinecone cần --namespace=<name> và --confirm-namespace=<name> trùng đúng namespace đích.');
    }
}

function readRollbackManifest(value) {
    const manifestPath = path.resolve(value);
    if (!fs.existsSync(manifestPath)) throw new Error(`Không tìm thấy rollback manifest: ${manifestPath}`);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.manifestVersion !== MANIFEST_VERSION || !Array.isArray(manifest.records) || manifest.records.length === 0) {
        throw new Error('Rollback manifest không hợp lệ hoặc không có record.');
    }
    return { manifestPath, manifest };
}

async function listIds(index) {
    const ids = []; let token;
    do {
        const page = await index.listPaginated({ limit: 100, paginationToken: token });
        ids.push(...(page.vectors || []).map(vector => vector.id));
        token = page.pagination?.next;
    } while (token);
    return ids;
}

async function fetchAll(index, ids) {
    const out = {};
    for (let i = 0; i < ids.length; i += 100) {
        const res = await index.fetch(ids.slice(i, i + 100));
        Object.assign(out, res.records || {});
    }
    return out;
}

async function fetchUntil(index, id, predicate, attempts = 6) {
    let record;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        record = (await index.fetch([id])).records?.[id];
        if (predicate(record)) return record;
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    return record;
}

function writeManifest(manifest, filename) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const backupPath = path.join(BACKUP_DIR, filename);
    fs.writeFileSync(backupPath, JSON.stringify(manifest, null, 2), 'utf8');
    return backupPath;
}

async function applyPlan(index, plan, fetched, indexName, namespace) {
    const originals = plan.map(update => cloneRecord(update.id, fetched[update.id]));
    const backupPath = writeManifest(
        buildBackupManifest({ indexName, namespace, records: originals, purpose: 'pre-backfill-law-guide-governance' }),
        `${stamp()}-backfill-law-guide-governance-${namespace}-pre.json`
    );

    let done = 0;
    for (const update of plan) {
        await index.update({ id: update.id, metadata: update.metadata });
        const after = await fetchUntil(index, update.id, record => {
            const metadata = record?.metadata || {};
            return metadata.source_type === update.after.source_type
                && metadata.source_priority === update.after.source_priority
                && metadata.review_status === update.after.review_status;
        });
        verifyUpdatedRecord(fetched[update.id], after, update);
        done += 1;
        if (done % 25 === 0 || done === plan.length) console.log(`Đã cập nhật ${done}/${plan.length}`);
    }
    return backupPath;
}

async function rollback(index, manifest, indexName, namespace) {
    if (manifest.namespace !== namespace || manifest.indexName !== indexName) {
        throw new Error('Rollback manifest không khớp index/namespace đích.');
    }
    const ids = manifest.records.map(record => record.id);
    const current = await fetchAll(index, ids);
    const preRollbackPath = writeManifest(
        buildBackupManifest({
            indexName,
            namespace,
            records: ids.map(id => cloneRecord(id, current[id])),
            purpose: 'pre-rollback-law-guide-governance'
        }),
        `${stamp()}-backfill-law-guide-governance-${namespace}-pre-rollback.json`
    );

    for (let i = 0; i < manifest.records.length; i += 100) {
        await index.upsert(manifest.records.slice(i, i + 100));
    }
    for (const expected of manifest.records) {
        const actual = await fetchUntil(index, expected.id, record => isDeepStrictEqual(comparableRecord(record), comparableRecord(expected)));
        verifyRestoredRecord(expected, actual);
    }
    return preRollbackPath;
}

async function main() {
    if (!process.env.PINECONE_API_KEY) throw new Error('Thiếu PINECONE_API_KEY; không thể đọc hoặc ghi dữ liệu.');
    const args = process.argv.slice(2);
    const apply = args.includes('--apply');
    const rollbackPathOption = optionValue('--rollback', args);
    if (apply && rollbackPathOption) throw new Error('Chỉ dùng một trong hai mode: --apply hoặc --rollback=<manifest>.');

    const namespace = optionValue('--namespace', args) || process.env.PINECONE_NAMESPACE || 'chatbot-tthc-xnc';
    const indexName = process.env.PINECONE_INDEX_NAME || 'chatbot-tthc-xnc';
    const host = process.env.PINECONE_INDEX_HOST || undefined;
    const index = new Pinecone({ apiKey: process.env.PINECONE_API_KEY }).index(indexName, host).namespace(namespace);

    if (rollbackPathOption) {
        assertConfirmedWrite(args, namespace);
        const { manifestPath, manifest } = readRollbackManifest(rollbackPathOption);
        const preRollbackPath = await rollback(index, manifest, indexName, namespace);
        console.log(JSON.stringify({
            mode: 'rollback', namespace, restored: manifest.records.length,
            manifest: path.relative(ROOT, manifestPath), preRollbackBackup: path.relative(ROOT, preRollbackPath)
        }, null, 2));
        return;
    }

    const allIds = await listIds(index);
    const targetIds = allIds.filter(id => /^(law|guide)[_:]/.test(id));
    const fetched = await fetchAll(index, targetIds);
    const plan = targetIds.map(id => planUpdate(id, fetched[id]?.metadata)).filter(Boolean);
    const audit = buildAudit(targetIds, fetched);
    const byClass = plan.reduce((acc, update) => { acc[update.klass] = (acc[update.klass] || 0) + 1; return acc; }, {});

    if (!apply) {
        console.log(JSON.stringify({
            mode: 'dry-run', namespace, scanned: targetIds.length, toUpdate: plan.length,
            alreadyCorrect: targetIds.length - plan.length, byClass,
            audit: { byClass: audit.byClass, fullProcedureGuideCount: audit.fullProcedureGuideIds.length, fullProcedureGuideIds: audit.fullProcedureGuideIds }
        }, null, 2));
        return;
    }

    assertConfirmedWrite(args, namespace);
    const backupPath = await applyPlan(index, plan, fetched, indexName, namespace);
    console.log(JSON.stringify({ mode: 'apply', namespace, updated: plan.length, byClass, backup: path.relative(ROOT, backupPath) }, null, 2));
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });

module.exports = {
    TARGET_CLASSES,
    MANIFEST_VERSION,
    optionValue,
    isFullProcedureGuide,
    planUpdate,
    buildAudit,
    buildBackupManifest,
    comparableRecord,
    verifyUpdatedRecord,
    verifyRestoredRecord,
    assertConfirmedWrite
};
