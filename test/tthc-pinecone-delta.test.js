'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    assertDryRunMatches,
    assertTargetIdentity,
    buildCatalogScope,
    classifyDelta,
    main,
    restoreManifest,
    stableRefreshId,
    summarizeDelta,
    toVectorMetadata,
} = require('../scripts/refresh-tthc-pinecone');

const TARGET = { index: 'chatbot-tthc-xnc', host: 'chatbot-tthc-xnc.svc.aped-4627-b74a.pinecone.io', namespace: 'chatbot-tthc-xnc' };
const OPERATION_SCOPE = 'tthc-2026-qd5230-seven-procedure-delta';

function procedure(id, title, sourceDecision = '5230/QĐ-BCA-C06 ngày 18/8/2026') {
    return {
        id,
        procedureId: id.replace(/^guide_/, 'guide:'),
        title,
        category: 'can_cuoc',
        categoryLabel: 'Căn cước',
        cap: 'xa',
        fee: 'Chưa quy định.',
        sourceDecision,
        text: `Tên thủ tục: ${title}\nNguồn: ${sourceDecision}`,
    };
}

test('stable refresh IDs are deterministic and distinct', () => {
    const first = procedure('guide_can-cuoc_new-one', 'Thủ tục A');
    const second = procedure('guide_can-cuoc_new-two', 'Thủ tục B');
    assert.equal(stableRefreshId(first), stableRefreshId(first));
    assert.notEqual(stableRefreshId(first), stableRefreshId(second));
});

test('catalog scope is exactly the seven QD5230 records on canonical catalog', () => {
    const catalog = require('../data/tthc-catalog.json');
    const scope = buildCatalogScope(catalog);
    assert.equal(catalog.procedures.length, 83);
    assert.equal(scope.length, 7);
    assert.equal(scope.filter(item => item.sourceDecision.includes('1.012564')).length, 1);
    assert.equal(scope.filter(item => item.sourceDecision.includes('1.014060')).length, 1);
});

test('delta distinguishes five inserts and two exact title updates without touching out-of-scope rows', () => {
    const procedures = [
        procedure('guide_can-cuoc_new-one', 'NEW A'),
        procedure('guide_can-cuoc_new-two', 'NEW B'),
        procedure('guide_can-cuoc_new-three', 'NEW C'),
        procedure('guide_can-cuoc_new-four', 'NEW D'),
        procedure('guide_can-cuoc_new-five', 'NEW E'),
        procedure('guide_can-cuoc_updated-a', 'UPDATED A'),
        procedure('guide_can-cuoc_updated-b', 'UPDATED B'),
    ];
    const liveRows = [
        { id: 'guide_old_a_01', metadata: { source_type: 'guide', title: 'UPDATED A', content_hash: 'old-a' } },
        { id: 'guide_old_b_01', metadata: { source_type: 'guide', title: 'UPDATED B', content_hash: 'old-b' } },
        { id: 'law_01', metadata: { source_type: 'law', title: 'UPDATED A', content_hash: 'law' } },
    ];
    const delta = classifyDelta(procedures, liveRows);
    const summary = summarizeDelta(delta);
    assert.equal(delta.insert.length, 5);
    assert.equal(delta.update.length, 2);
    assert.equal(delta.duplicate.length, 0);
    assert.equal(summary.delete.length, 2);
    assert.equal(summary.outOfScopeLiveCount, 1);
});

test('metadata preserves identity and uses governed source role', () => {
    const item = procedure('guide_can-cuoc_new-one', 'Cấp, cấp đổi, cấp lại thẻ căn cước');
    const metadata = toVectorMetadata(item, '2026-09-16T00:00:00.000Z');
    assert.equal(metadata.source_type, 'guide');
    assert.equal(metadata.source_priority, 'supplemental');
    assert.equal(metadata.review_status, 'approved');
    assert.equal(metadata.canonical_procedure_key, item.procedureId);
    assert.equal(metadata.embedding_dimensions, 768);
});

test('target identity refuses a different Pinecone index', () => {
    assert.throws(
        () => assertTargetIdentity(TARGET, { ...TARGET, index: 'another-index' }),
        error => error.code === 'INDEX_MISMATCH',
    );
});

test('target identity refuses a different Pinecone host', () => {
    assert.throws(
        () => assertTargetIdentity(TARGET, { ...TARGET, host: 'other.svc.pinecone.io' }),
        error => error.code === 'HOST_MISMATCH',
    );
});

test('target identity refuses a different Pinecone namespace', () => {
    assert.throws(
        () => assertTargetIdentity(TARGET, { ...TARGET, namespace: 'another-namespace' }),
        error => error.code === 'NAMESPACE_MISMATCH',
    );
});

function makeDryRunManifest() {
    return {
        schemaVersion: 1,
        mode: 'dry-run',
        target: TARGET,
        operationScope: {
            id: OPERATION_SCOPE,
            sourceDecision: '5230/QĐ-BCA-C06',
            procedureIds: ['procedure-a'],
            affectedIds: ['legacy-id', 'new-id'],
            upsertIds: ['new-id'],
            deleteIds: ['legacy-id'],
        },
        catalogFingerprint: { recordCount: 83, sha256: 'catalog-hash' },
        affectedIds: ['legacy-id', 'new-id'],
        upsertIds: ['new-id'],
        deleteIds: ['legacy-id'],
        createdIds: ['new-id'],
        beforeRecords: [{ id: 'legacy-id', values: [0.25, 0.5], metadata: { title: 'Before', content_hash: 'before-hash' } }],
        absentIds: ['new-id'],
    };
}

test('apply preflight refuses a catalog or affected-ID before-state drift from reviewed dry-run', () => {
    const reviewed = makeDryRunManifest();
    assert.doesNotThrow(() => assertDryRunMatches(reviewed, structuredClone(reviewed)));

    const changedCatalog = structuredClone(reviewed);
    changedCatalog.catalogFingerprint.sha256 = 'different-catalog-hash';
    assert.throws(() => assertDryRunMatches(reviewed, changedCatalog), error => error.code === 'CATALOG_MISMATCH');

    const changedBeforeState = structuredClone(reviewed);
    changedBeforeState.beforeRecords[0].metadata.content_hash = 'different-before-hash';
    assert.throws(() => assertDryRunMatches(reviewed, changedBeforeState), error => error.code === 'DRY_RUN_STATE_MISMATCH');
});

function makeApplyManifest() {
    return {
        schemaVersion: 1,
        mode: 'apply',
        generatedAt: '2026-09-20T00:00:00.000Z',
        target: TARGET,
        operationScope: { id: OPERATION_SCOPE },
        affectedIds: ['legacy-id', 'new-id'],
        upsertIds: ['new-id'],
        deleteIds: ['legacy-id'],
        createdIds: ['new-id'],
        beforeRecords: [{ id: 'legacy-id', values: [0.25, 0.5], metadata: { title: 'Before', content_hash: 'before-hash' } }],
        absentIds: ['new-id'],
    };
}

function fakeNamespace(initialRecords, { corruptUpsert = false } = {}) {
    const records = new Map(Object.entries(initialRecords));
    const calls = { upserts: [], deletes: [], fetches: [] };
    return {
        records,
        calls,
        async upsert(vectors) {
            calls.upserts.push(vectors.map(vector => vector.id));
            for (const vector of vectors) {
                records.set(vector.id, {
                    id: vector.id,
                    values: Array.from(vector.values || []),
                    metadata: corruptUpsert ? { ...(vector.metadata || {}), content_hash: 'wrong-hash' } : vector.metadata,
                });
            }
        },
        async deleteMany(ids) {
            calls.deletes.push([...ids]);
            for (const id of ids) records.delete(id);
        },
        async fetch(ids) {
            calls.fetches.push([...ids]);
            return { records: Object.fromEntries(ids.filter(id => records.has(id)).map(id => [id, records.get(id)])) };
        },
    };
}

test('restore verifies full prior vectors and removes IDs created by the operation', async () => {
    const manifest = makeApplyManifest();
    const unrelated = { id: 'unrelated-id', values: [9, 8], metadata: { source_type: 'law' } };
    const namespace = fakeNamespace({
        'legacy-id': { id: 'legacy-id', values: [1, 1], metadata: { title: 'After', content_hash: 'after-hash' } },
        'new-id': { id: 'new-id', values: [3, 3], metadata: { title: 'Created' } },
        'unrelated-id': unrelated,
    });

    const result = await restoreManifest(namespace, manifest, { target: TARGET, attempts: 1, delayMs: 0 });

    assert.deepEqual(result, { restored: 1, removedCreated: 1, affectedIdCount: 2 });
    assert.deepEqual(namespace.records.get('legacy-id'), manifest.beforeRecords[0]);
    assert.equal(namespace.records.has('new-id'), false);
    assert.deepEqual(namespace.records.get('unrelated-id'), unrelated);
});

test('restore reports failure when read-after-restore content does not match before-state', async () => {
    const manifest = makeApplyManifest();
    const namespace = fakeNamespace({
        'legacy-id': { id: 'legacy-id', values: [1, 1], metadata: { title: 'After', content_hash: 'after-hash' } },
        'new-id': { id: 'new-id', values: [3, 3], metadata: { title: 'Created' } },
    }, { corruptUpsert: true });

    await assert.rejects(
        restoreManifest(namespace, manifest, { target: TARGET, attempts: 2, delayMs: 0, sleep: async () => {} }),
        error => error.code === 'RESTORE_VERIFY_FAILED' && /legacy-id/.test(error.message),
    );
});

test('restore never sends unrelated IDs to upsert or delete', async () => {
    const manifest = makeApplyManifest();
    const namespace = fakeNamespace({
        'legacy-id': { id: 'legacy-id', values: [1], metadata: { title: 'Changed' } },
        'new-id': { id: 'new-id', values: [2], metadata: { title: 'Created' } },
        'law-unrelated': { id: 'law-unrelated', values: [7], metadata: { source_type: 'law' } },
    });

    await restoreManifest(namespace, manifest, { target: TARGET, attempts: 1, delayMs: 0 });

    assert.deepEqual(namespace.calls.upserts, [['legacy-id']]);
    assert.deepEqual(namespace.calls.deletes, [['new-id']]);
    assert.deepEqual(namespace.calls.fetches, [['legacy-id', 'new-id']]);
});

test('restore checks manifest target before any write', async () => {
    for (const [target, code] of [
        [{ ...TARGET, index: 'another-index' }, 'INDEX_MISMATCH'],
        [{ ...TARGET, host: 'other.svc.pinecone.io' }, 'HOST_MISMATCH'],
        [{ ...TARGET, namespace: 'another-namespace' }, 'NAMESPACE_MISMATCH'],
    ]) {
        const namespace = fakeNamespace({});
        await assert.rejects(
            restoreManifest(namespace, makeApplyManifest(), { target, attempts: 1, delayMs: 0 }),
            error => error.code === code,
        );
        assert.deepEqual(namespace.calls.upserts, []);
        assert.deepEqual(namespace.calls.deletes, []);
    }
});

test('dry-run reads the scoped records and performs no Pinecone mutation', async t => {
    const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bandocapt-pinecone-dry-run-'));
    t.after(() => fs.rmSync(backupDir, { recursive: true, force: true }));
    const calls = { upsert: 0, deleteMany: 0 };
    const namespace = {
        async describeIndexStats() { return { dimension: 768, namespaces: { [TARGET.namespace]: { recordCount: 0 } } }; },
        async listPaginated() { return { vectors: [], pagination: {} }; },
        async fetch() { return { records: {} }; },
        async upsert() { calls.upsert += 1; throw new Error('dry-run called upsert'); },
        async deleteMany() { calls.deleteMany += 1; throw new Error('dry-run called deleteMany'); },
    };
    const client = {
        async describeIndex(indexName) { return { name: indexName, host: TARGET.host }; },
        index(indexName, host) {
            assert.equal(indexName, TARGET.index);
            assert.equal(host, TARGET.host);
            return { namespace(namespaceName) { assert.equal(namespaceName, TARGET.namespace); return namespace; } };
        },
    };
    const output = [];

    await main({
        argv: [],
        config: { apiKey: 'test-only', geminiKey: '', indexName: TARGET.index, indexHost: '', namespace: TARGET.namespace },
        createClient: () => client,
        backupDir,
        output: { log: value => output.push(value) },
    });

    assert.deepEqual(calls, { upsert: 0, deleteMany: 0 });
    const report = JSON.parse(output[0]);
    assert.deepEqual(report.target, TARGET);
    assert.equal(report.before.vectorCount, 0);
    assert.equal(report.affectedIdCount, 7);
    assert.deepEqual(report.summary.counts, { add: 7, update: 0, delete: 0, noop: 0 });
    const saved = JSON.parse(fs.readFileSync(path.join(backupDir, fs.readdirSync(backupDir)[0]), 'utf8'));
    assert.equal(saved.mode, 'dry-run');
    assert.equal(saved.schemaVersion, 1);
    assert.equal(saved.target.host, TARGET.host);
    assert.equal(saved.operationScope.id, OPERATION_SCOPE);
    assert.equal(saved.affectedIds.length, 7);
    assert.equal(saved.absentIds.length, 7);
});

test('apply requires an explicit reviewed dry-run manifest', async () => {
    let clientCreated = false;
    await assert.rejects(
        main({
            argv: ['--apply'],
            config: { apiKey: 'test-only', geminiKey: 'test-only', indexName: TARGET.index, indexHost: '', namespace: TARGET.namespace },
            createClient: () => { clientCreated = true; throw new Error('client must not be created'); },
        }),
        /--apply requires --manifest/,
    );
    assert.equal(clientCreated, false);
});
