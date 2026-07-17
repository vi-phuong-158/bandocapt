'use strict';

// Copy the operator-approved law/guide corpus into a candidate namespace.
// The source namespace is never mutated. Writes require an explicit target confirmation.
const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { Pinecone } = require('@pinecone-database/pinecone');
const { classify, PRIORITY_BY_CLASS, loadEnvFromNearestAncestor } = require('./inventory-corpus');

const ROOT = path.resolve(__dirname, '..');
const BACKUP_DIR = path.join(ROOT, 'data/pinecone-backups');
const TARGET_CLASSES = new Set(['law', 'guide']);

loadEnvFromNearestAncestor();

function optionValue(name, args = process.argv.slice(2)) {
    const prefix = `${name}=`;
    const option = args.find(value => value.startsWith(prefix));
    return option ? option.slice(prefix.length).trim() : '';
}

function stamp() {
    return new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '').replace('T', '_');
}

function approvedCopy(id, record = {}, approvedAt) {
    const klass = classify(id, record.metadata?.source_type);
    if (!TARGET_CLASSES.has(klass)) return null;
    if (!Array.isArray(record.values) || record.values.length !== 768) {
        throw new Error(`Record ${id} khong co vector 768 chieu.`);
    }
    return {
        id,
        values: record.values,
        ...(record.sparseValues ? { sparseValues: record.sparseValues } : {}),
        metadata: {
            ...(record.metadata || {}),
            source_type: klass,
            source_priority: PRIORITY_BY_CLASS[klass],
            review_status: 'approved',
            reviewed_at: approvedAt
        }
    };
}

function assertConfirmedWrite(args, sourceNamespace, targetNamespace) {
    const source = optionValue('--source', args);
    const target = optionValue('--target', args);
    const confirmed = optionValue('--confirm-target', args);
    if (!source || !target || source !== sourceNamespace || target !== targetNamespace || confirmed !== targetNamespace) {
        throw new Error('Ghi Pinecone can --source=<name>, --target=<name> va --confirm-target=<name> trung namespace dich.');
    }
    if (sourceNamespace === targetNamespace) throw new Error('Namespace nguon va dich phai khac nhau.');
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
    const records = {};
    for (let offset = 0; offset < ids.length; offset += 100) {
        const response = await index.fetch(ids.slice(offset, offset + 100));
        Object.assign(records, response.records || {});
    }
    return records;
}

function sameApprovedRecord(actual, expected) {
    const actualMetadata = { ...(actual?.metadata || {}) };
    const expectedMetadata = { ...(expected?.metadata || {}) };
    // reviewed_at is the operator action timestamp and may change on an idempotent rerun.
    delete actualMetadata.reviewed_at;
    delete expectedMetadata.reviewed_at;
    return Boolean(actual
        && isDeepStrictEqual(actual.values || [], expected.values)
        && isDeepStrictEqual(actual.sparseValues || null, expected.sparseValues || null)
        && isDeepStrictEqual(actualMetadata, expectedMetadata));
}

async function verify(index, expected) {
    const actual = await fetchAll(index, expected.map(record => record.id));
    for (const record of expected) {
        if (!sameApprovedRecord(actual[record.id], record)) throw new Error(`Xac minh that bai: ${record.id}.`);
    }
}

function writeBackup(indexName, sourceNamespace, targetNamespace, records) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const backupPath = path.join(BACKUP_DIR, `${stamp()}-approved-law-guide-${sourceNamespace}-to-${targetNamespace}.json`);
    fs.writeFileSync(backupPath, JSON.stringify({
        manifestVersion: 1,
        purpose: 'approved-law-guide-candidate-seed',
        createdAt: new Date().toISOString(),
        indexName,
        sourceNamespace,
        targetNamespace,
        records
    }, null, 2), 'utf8');
    return backupPath;
}

async function main() {
    if (!process.env.PINECONE_API_KEY) throw new Error('Thieu PINECONE_API_KEY.');
    const args = process.argv.slice(2);
    const apply = args.includes('--apply');
    const sourceNamespace = optionValue('--source', args) || process.env.PINECONE_NAMESPACE || 'chatbot-tthc-xnc';
    const targetNamespace = optionValue('--target', args);
    if (!targetNamespace || sourceNamespace === targetNamespace) throw new Error('Can namespace dich moi va khac namespace nguon.');

    const indexName = process.env.PINECONE_INDEX_NAME || 'chatbot-tthc-xnc';
    const rootIndex = new Pinecone({ apiKey: process.env.PINECONE_API_KEY }).index(indexName, process.env.PINECONE_INDEX_HOST || undefined);
    const source = rootIndex.namespace(sourceNamespace);
    const target = rootIndex.namespace(targetNamespace);
    const sourceIds = (await listIds(source)).filter(id => /^(law|guide)[_:]/.test(id));
    const sourceRecords = await fetchAll(source, sourceIds);
    const approvedAt = new Date().toISOString();
    const records = sourceIds.map(id => approvedCopy(id, sourceRecords[id], approvedAt)).filter(Boolean);
    const targetRecords = await fetchAll(target, sourceIds);
    const collisions = records.filter(record => targetRecords[record.id] && !sameApprovedRecord(targetRecords[record.id], record));
    const byClass = records.reduce((result, record) => {
        const klass = record.metadata.source_type;
        result[klass] = (result[klass] || 0) + 1;
        return result;
    }, {});

    if (!apply) {
        console.log(JSON.stringify({ mode: 'dry-run', sourceNamespace, targetNamespace, total: records.length, byClass, collisions: collisions.map(record => record.id) }, null, 2));
        return;
    }
    assertConfirmedWrite(args, sourceNamespace, targetNamespace);
    if (collisions.length) throw new Error(`Namespace dich co ${collisions.length} record xung dot; dung namespace moi.`);
    const backupPath = writeBackup(indexName, sourceNamespace, targetNamespace, records);
    for (let offset = 0; offset < records.length; offset += 100) {
        await target.upsert(records.slice(offset, offset + 100));
        console.log(`Da nhap ${Math.min(offset + 100, records.length)}/${records.length}`);
    }
    await verify(target, records);
    console.log(JSON.stringify({ mode: 'apply', sourceNamespace, targetNamespace, imported: records.length, byClass, backup: path.relative(ROOT, backupPath) }, null, 2));
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });

module.exports = { approvedCopy, assertConfirmedWrite, sameApprovedRecord };
