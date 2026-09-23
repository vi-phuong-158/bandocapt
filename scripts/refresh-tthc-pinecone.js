'use strict';

// TTHC 2026 delta refresh — dry-run by default.
//
// This script deliberately scopes production mutation to the seven catalog
// records whose source decision is QĐ5230: five NEW procedures and two
// UPDATED procedures. It never calls deleteAll and never touches law or
// truso vectors. Applying requires --manifest pointing to the reviewed dry-run
// artifact; rollback manifests bind the index name, resolved host, and namespace.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Pinecone } = require('@pinecone-database/pinecone');

const ROOT = path.resolve(__dirname, '..');
const CATALOG_PATH = path.join(ROOT, 'data', 'tthc-catalog.json');
const BACKUP_DIR = path.join(ROOT, 'data', 'pinecone-backups');
const DEFAULT_INDEX = 'chatbot-tthc-xnc';
const DEFAULT_NAMESPACE = 'chatbot-tthc-xnc';
const EMBED_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent';
const DIMENSIONS = 768;
const QD5230_MARKER = '5230/QĐ-BCA-C06';
const MANIFEST_VERSION = 1;
const OPERATION_SCOPE = 'tthc-2026-qd5230-seven-procedure-delta';
const EXPECTED_INSERTS = 5;
const EXPECTED_UPDATES = 2;

function stamp() {
    return new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '').replace('T', '_');
}

function sha256(value) {
    const input = Buffer.isBuffer(value) ? value : Buffer.from(String(value ?? ''), 'utf8');
    return crypto.createHash('sha256').update(input).digest('hex');
}

function normalizeHost(host) {
    return String(host || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
}

function targetMismatch(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.code = code;
    return error;
}

function assertTargetIdentity(expected, actual) {
    if (!expected?.index || !actual?.index || expected.index !== actual.index) {
        throw targetMismatch('INDEX_MISMATCH', `index expected=${expected?.index || '(missing)'} actual=${actual?.index || '(missing)'}`);
    }
    if (!normalizeHost(expected.host) || normalizeHost(expected.host) !== normalizeHost(actual.host)) {
        throw targetMismatch('HOST_MISMATCH', `index host does not match the manifest`);
    }
    if (!expected?.namespace || !actual?.namespace || expected.namespace !== actual.namespace) {
        throw targetMismatch('NAMESPACE_MISMATCH', `namespace expected=${expected?.namespace || '(missing)'} actual=${actual?.namespace || '(missing)'}`);
    }
}

async function resolveTarget(pc, config) {
    const description = await pc.describeIndex(config.indexName);
    const describedHost = String(description?.host || '').trim();
    if (!describedHost) throw targetMismatch('HOST_MISMATCH', 'Pinecone did not return a resolvable index host.');
    if (config.indexHost && normalizeHost(config.indexHost) !== normalizeHost(describedHost)) {
        throw targetMismatch('HOST_MISMATCH', 'PINECONE_INDEX_HOST does not resolve to PINECONE_INDEX_NAME.');
    }
    return {
        index: config.indexName,
        host: describedHost,
        namespace: config.namespace,
    };
}

function normalizeText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/gi, 'd')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function loadEnvFiles() {
    // The clean worktree must not receive copied credentials. Local operators
    // may provide process.env, or keep .env files in this worktree only.
    let dotenv;
    try { dotenv = require('dotenv'); } catch { return; }
    for (const file of ['.env', '.env.local']) {
        const envPath = path.join(ROOT, file);
        if (!fs.existsSync(envPath)) continue;
        for (const [key, value] of Object.entries(dotenv.parse(fs.readFileSync(envPath, 'utf8')))) {
            if (!String(process.env[key] || '').trim() && String(value || '').trim()) process.env[key] = value;
        }
    }
}

function getConfig() {
    loadEnvFiles();
    return {
        apiKey: String(process.env.PINECONE_API_KEY || '').trim(),
        geminiKey: String(process.env.GEMINI_API_KEY || '').trim(),
        indexName: String(process.env.PINECONE_INDEX_NAME || DEFAULT_INDEX).trim(),
        indexHost: String(process.env.PINECONE_INDEX_HOST || '').trim(),
        namespace: String(process.env.PINECONE_NAMESPACE || DEFAULT_NAMESPACE).trim(),
    };
}

function stableRefreshId(procedure) {
    const sourceKey = procedure.procedureId || procedure.id;
    const readable = String(sourceKey).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 150);
    return `tthc-2026-${readable}-${sha256(sourceKey).slice(0, 12)}`;
}

function contentHash(procedure) {
    return sha256(procedure.text);
}

function extractOfficialCode(procedure) {
    const match = String(procedure.text || '').match(/Mã thủ tục:\s*([0-9.]+)/i);
    return match ? match[1] : 'N/A';
}

function sourceTypeFor(procedure) {
    return String(procedure.id).startsWith('guide_') ? 'guide' : 'tthc';
}

function toVectorMetadata(procedure, verifiedAt) {
    const sourceType = sourceTypeFor(procedure);
    const hash = contentHash(procedure);
    const sourceDecision = String(procedure.sourceDecision || 'N/A');
    return {
        text: procedure.text,
        title: procedure.title,
        procedure_id: procedure.procedureId,
        canonical_procedure_key: procedure.procedureId,
        refresh_id: stableRefreshId(procedure),
        legal_procedure_code: extractOfficialCode(procedure),
        source_type: sourceType,
        source_priority: sourceType === 'guide' ? 'supplemental' : 'current_procedure',
        review_status: 'approved',
        loai_thu_tuc: procedure.category,
        category: procedure.category,
        category_label: procedure.categoryLabel,
        linh_vuc: procedure.categoryLabel,
        cap: procedure.cap,
        cap_normalized: procedure.cap,
        source_decision: sourceDecision,
        legal_basis: sourceDecision,
        fee: procedure.fee || 'N/A',
        valid_from: '2026-08-18',
        valid_to: 'N/A',
        supersedes: 'N/A',
        procedure_version: hash,
        last_verified_at: verifiedAt,
        content_hash: hash,
        embedding_model: 'gemini-embedding-001',
        embedding_dimensions: DIMENSIONS,
    };
}

function buildCatalogScope(catalog) {
    if (!catalog || !Array.isArray(catalog.procedures)) throw new Error('Catalog không có procedures[].');
    if (catalog.procedures.length !== 83) throw new Error(`Catalog phải có 83 record, nhận ${catalog.procedures.length}.`);
    const scoped = catalog.procedures.filter(procedure => String(procedure.sourceDecision || '').includes(QD5230_MARKER));
    if (scoped.length !== 7) throw new Error(`Scope QĐ5230 phải có 7 record, nhận ${scoped.length}.`);
    return scoped;
}

function liveTitle(row) {
    return String(row.metadata?.title || row.metadata?.procedure_title || '').trim();
}

function liveSourceType(row) {
    if (row.metadata?.source_type) return String(row.metadata.source_type);
    if (String(row.id).startsWith('guide_')) return 'guide';
    if (String(row.id).startsWith('tthc_')) return 'tthc';
    return '';
}

function isTthcScopeRow(row) {
    return ['tthc', 'guide'].includes(liveSourceType(row));
}

function classifyDelta(procedures, liveRows) {
    const scopedLive = liveRows.filter(isTthcScopeRow);
    const byId = new Map(scopedLive.map(row => [row.id, row]));
    const byTitle = new Map();
    for (const row of scopedLive) {
        const key = `${liveSourceType(row)}|${normalizeText(liveTitle(row))}`;
        if (!byTitle.has(key)) byTitle.set(key, []);
        byTitle.get(key).push(row);
    }

    const result = {
        scope: 'QĐ5230 legal refresh',
        insert: [],
        update: [],
        unchanged: [],
        duplicate: [],
        missing: [],
        stale: [],
        outOfScopeLive: liveRows.filter(row => !isTthcScopeRow(row)).map(row => row.id),
    };
    const consumed = new Set();

    for (const procedure of procedures) {
        const stableId = stableRefreshId(procedure);
        const expectedHash = contentHash(procedure);
        const sourceType = sourceTypeFor(procedure);
        const titleKey = `${sourceType}|${normalizeText(procedure.title)}`;
        const stable = byId.get(stableId);
        const titleCandidates = byTitle.get(titleKey) || [];
        const candidates = stable ? [stable] : titleCandidates;

        if (candidates.length > 1) {
            result.duplicate.push({ procedure, candidateIds: candidates.map(row => row.id) });
            continue;
        }
        if (candidates.length === 0) {
            result.insert.push({ procedure, id: stableId, expectedHash });
            result.missing.push({ procedureId: procedure.procedureId, title: procedure.title });
            continue;
        }

        const existing = candidates[0];
        consumed.add(existing.id);
        const item = { procedure, id: stableId, existingId: existing.id, expectedHash, existingHash: existing.metadata?.content_hash || null };
        if (existing.metadata?.content_hash === expectedHash) result.unchanged.push(item);
        else result.update.push(item);
    }

    // Only flag stale records that have an explicit QĐ5230 procedure identity.
    // Legacy rows without that identity stay untouched and are reported as
    // out-of-scope, because a title-only delete would be unsafe.
    for (const row of scopedLive) {
        const decision = String(row.metadata?.source_decision || row.metadata?.legal_basis || '');
        if (!consumed.has(row.id) && decision.includes(QD5230_MARKER)) {
            result.stale.push({ id: row.id, title: liveTitle(row), procedureId: row.metadata?.procedure_id || null });
        }
    }

    return result;
}

function summarizeDelta(delta) {
    const deleteIds = delta.update.filter(item => item.existingId !== item.id).map(item => item.existingId);
    return {
        scope: delta.scope,
        insert: delta.insert.map(item => ({ id: item.id, procedureId: item.procedure.procedureId, title: item.procedure.title })),
        update: delta.update.map(item => ({ oldId: item.existingId, newId: item.id, procedureId: item.procedure.procedureId, title: item.procedure.title })),
        delete: deleteIds,
        unchanged: delta.unchanged.map(item => ({ id: item.existingId, procedureId: item.procedure.procedureId, title: item.procedure.title })),
        duplicate: delta.duplicate.map(item => ({ procedureId: item.procedure.procedureId, title: item.procedure.title, candidateIds: item.candidateIds })),
        missing: delta.missing,
        stale: delta.stale,
        outOfScopeLiveCount: delta.outOfScopeLive.length,
        expectedVectorDelta: delta.insert.length,
        counts: {
            add: delta.insert.length,
            update: delta.update.length,
            delete: deleteIds.length,
            noop: delta.unchanged.length,
        },
    };
}

async function listIds(namespace) {
    const ids = [];
    let token;
    do {
        const page = await namespace.listPaginated({ limit: 100, ...(token ? { paginationToken: token } : {}) });
        ids.push(...(page.vectors || []).map(vector => vector.id));
        token = page.pagination?.next;
    } while (token);
    return ids;
}

async function fetchAll(namespace, ids) {
    const records = {};
    for (let offset = 0; offset < ids.length; offset += 100) {
        Object.assign(records, (await namespace.fetch(ids.slice(offset, offset + 100))).records || {});
    }
    return records;
}

function uniqueSorted(ids) {
    return [...new Set(ids)].sort();
}

function operationPlan(delta) {
    const upsertIds = uniqueSorted([...delta.insert, ...delta.update].map(item => item.id));
    const deleteIds = uniqueSorted(delta.update.filter(item => item.existingId !== item.id).map(item => item.existingId));
    return { upsertIds, deleteIds, affectedIds: uniqueSorted([...upsertIds, ...deleteIds]) };
}

function snapshotAffectedIds(plan, records) {
    const beforeRecords = [];
    const absentIds = [];
    for (const id of plan.affectedIds) {
        const record = records[id];
        if (!record) {
            absentIds.push(id);
            continue;
        }
        beforeRecords.push({
            id,
            values: Array.from(record.values || []),
            metadata: record.metadata ?? null,
        });
    }
    return { beforeRecords, absentIds };
}

function canonicalize(value) {
    if (ArrayBuffer.isView(value)) return Array.from(value, canonicalize);
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
    }
    return value;
}

function sameJson(left, right) {
    return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function recordMatches(expected, actual) {
    return Boolean(actual)
        && sameJson(Array.from(expected.values || []), Array.from(actual.values || []))
        && sameJson(expected.metadata ?? null, actual.metadata ?? null);
}

function assertManifestEnvelope(manifest, expectedMode) {
    if (!manifest || manifest.schemaVersion !== MANIFEST_VERSION || manifest.mode !== expectedMode) {
        throw targetMismatch('MANIFEST_INVALID', `expected schema ${MANIFEST_VERSION} ${expectedMode} manifest`);
    }
    if (manifest.operationScope?.id !== OPERATION_SCOPE) {
        throw targetMismatch('MANIFEST_INVALID', 'operation scope is missing or unsupported');
    }
    const arrays = ['affectedIds', 'upsertIds', 'deleteIds', 'createdIds', 'absentIds'];
    for (const key of arrays) {
        if (!Array.isArray(manifest[key]) || manifest[key].some(id => typeof id !== 'string' || !id)) {
            throw targetMismatch('MANIFEST_INVALID', `${key} must be an array of vector IDs`);
        }
        if (new Set(manifest[key]).size !== manifest[key].length) {
            throw targetMismatch('MANIFEST_INVALID', `${key} contains duplicate IDs`);
        }
    }
    if (!Array.isArray(manifest.beforeRecords)) throw targetMismatch('MANIFEST_INVALID', 'beforeRecords must be an array');
    const recordIds = manifest.beforeRecords.map(record => record?.id);
    if (recordIds.some(id => typeof id !== 'string' || !id) || new Set(recordIds).size !== recordIds.length) {
        throw targetMismatch('MANIFEST_INVALID', 'beforeRecords must contain unique vector IDs');
    }
    const present = new Set(recordIds);
    const absent = new Set(manifest.absentIds);
    if (recordIds.some(id => absent.has(id))
        || manifest.affectedIds.some(id => present.has(id) === absent.has(id))
        || manifest.affectedIds.length !== present.size + absent.size
        || manifest.affectedIds.some(id => !present.has(id) && !absent.has(id))) {
        throw targetMismatch('MANIFEST_INVALID', 'beforeRecords and absentIds must partition affectedIds');
    }
    if (manifest.createdIds.some(id => !manifest.upsertIds.includes(id) || !absent.has(id))) {
        throw targetMismatch('MANIFEST_INVALID', 'createdIds must be absent-before upsert IDs');
    }
    if (manifest.upsertIds.some(id => !manifest.affectedIds.includes(id))
        || manifest.deleteIds.some(id => !manifest.affectedIds.includes(id))) {
        throw targetMismatch('MANIFEST_INVALID', 'upsertIds/deleteIds must be included in affectedIds');
    }
    if (!sameJson(uniqueSorted([...manifest.upsertIds, ...manifest.deleteIds]), uniqueSorted(manifest.affectedIds))) {
        throw targetMismatch('MANIFEST_INVALID', 'affectedIds must exactly match the upsert/delete ID union');
    }
    const expectedCreated = manifest.upsertIds.filter(id => absent.has(id));
    if (!sameJson(uniqueSorted(expectedCreated), uniqueSorted(manifest.createdIds))) {
        throw targetMismatch('MANIFEST_INVALID', 'createdIds must exactly match upsert IDs absent before the operation');
    }
}

function assertDryRunMatches(dryRun, current) {
    assertManifestEnvelope(dryRun, 'dry-run');
    if (!sameJson(dryRun.catalogFingerprint, current.catalogFingerprint)) {
        throw targetMismatch('CATALOG_MISMATCH', 'catalog fingerprint differs from the reviewed dry-run');
    }
    if (!sameJson(dryRun.operationScope, current.operationScope)
        || !sameJson(dryRun.affectedIds, current.affectedIds)
        || !sameJson(dryRun.upsertIds, current.upsertIds)
        || !sameJson(dryRun.deleteIds, current.deleteIds)) {
        throw targetMismatch('DRY_RUN_PLAN_MISMATCH', 'affected IDs or operation plan changed since dry-run');
    }
    if (!sameJson(dryRun.beforeRecords, current.beforeRecords)
        || !sameJson(dryRun.absentIds, current.absentIds)) {
        throw targetMismatch('DRY_RUN_STATE_MISMATCH', 'before-state for affected IDs changed since dry-run');
    }
}

async function embedDocument(text, geminiKey) {
    const response = await fetch(`${EMBED_URL}?key=${encodeURIComponent(geminiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'models/gemini-embedding-001',
            content: { parts: [{ text }] },
            outputDimensionality: DIMENSIONS,
            taskType: 'RETRIEVAL_DOCUMENT',
        }),
    });
    if (!response.ok) throw new Error(`Embedding thất bại HTTP ${response.status}.`);
    const values = (await response.json()).embedding?.values || [];
    if (values.length !== DIMENSIONS) throw new Error(`Embedding phải có ${DIMENSIONS} chiều, nhận ${values.length}.`);
    return values;
}

function makeManifestPath(prefix, backupDir = BACKUP_DIR, fsModule = fs) {
    fsModule.mkdirSync(backupDir, { recursive: true });
    return path.join(backupDir, `${stamp()}-${prefix}.json`);
}

function assertApplySafe(delta) {
    if (delta.duplicate.length) throw new Error('Có duplicate/ambiguous match; dừng để tránh targeted delete sai.');
    if (delta.stale.length) throw new Error('Có stale QĐ5230 row chưa map chắc chắn; dừng để tránh xóa nhầm.');
    if (delta.insert.length !== EXPECTED_INSERTS
        || delta.update.length !== EXPECTED_UPDATES
        || delta.unchanged.length !== 0) {
        throw targetMismatch(
            'OPERATION_SET_MISMATCH',
            `expected ${EXPECTED_INSERTS} insert + ${EXPECTED_UPDATES} update + 0 unchanged; `
            + `actual ${delta.insert.length} insert + ${delta.update.length} update + ${delta.unchanged.length} unchanged`,
        );
    }
}

async function verifyApplied(namespace, plannedVectors, deletedIds) {
    let lastProblem = 'chưa có dữ liệu verify';
    for (let attempt = 1; attempt <= 8; attempt += 1) {
        const fetched = await fetchAll(namespace, plannedVectors.map(vector => vector.id));
        const badUpserts = plannedVectors.filter(vector => {
            const actual = fetched[vector.id];
            return !actual || actual.values?.length !== DIMENSIONS || actual.metadata?.content_hash !== vector.metadata.content_hash;
        }).map(vector => vector.id);
        const deleted = await fetchAll(namespace, deletedIds);
        const stillPresent = deletedIds.filter(id => deleted[id]);
        if (!badUpserts.length && !stillPresent.length) return;
        lastProblem = `upsert=${badUpserts.join(',') || 'ok'} delete=${stillPresent.join(',') || 'ok'}`;
        if (attempt < 8) await new Promise(resolve => setTimeout(resolve, attempt * 1500));
    }
    throw new Error(`Verify sau eventual consistency thất bại: ${lastProblem}`);
}

function buildManifest({ mode, target, catalog, catalogBytes, procedures, stats, ids, delta, records, generatedAt }) {
    const plan = operationPlan(delta);
    const snapshot = snapshotAffectedIds(plan, records);
    const createdIds = plan.upsertIds.filter(id => snapshot.absentIds.includes(id));
    const catalogSha256 = sha256(catalogBytes);
    return {
        schemaVersion: MANIFEST_VERSION,
        mode,
        generatedAt,
        target: { index: target.index, host: target.host, namespace: target.namespace },
        operationScope: {
            id: OPERATION_SCOPE,
            sourceDecision: QD5230_MARKER,
            procedureIds: uniqueSorted(procedures.map(procedure => procedure.procedureId)),
            affectedIds: plan.affectedIds,
            upsertIds: plan.upsertIds,
            deleteIds: plan.deleteIds,
        },
        catalogCount: catalog.procedures.length,
        catalogSha256,
        catalogFingerprint: { recordCount: catalog.procedures.length, sha256: catalogSha256 },
        before: {
            vectorCount: stats.namespaces?.[target.namespace]?.recordCount ?? null,
            dimensions: stats.dimension,
            ids: ids.length,
        },
        ...plan,
        ...snapshot,
        createdIds,
        summary: summarizeDelta(delta),
    };
}

async function restoreManifest(namespace, manifest, { target, attempts = 8, delayMs = 1500, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
    assertManifestEnvelope(manifest, 'apply');
    assertTargetIdentity(manifest.target, target);
    if (manifest.beforeRecords.length) {
        await namespace.upsert(manifest.beforeRecords.map(record => ({
            id: record.id,
            values: Array.from(record.values || []),
            ...(record.metadata == null ? {} : { metadata: record.metadata }),
        })));
    }
    if (manifest.createdIds.length) await namespace.deleteMany(manifest.createdIds);

    let lastProblem = 'chưa có dữ liệu verify';
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        const actual = await fetchAll(namespace, manifest.affectedIds);
        const badRecords = manifest.beforeRecords.filter(record => !recordMatches(record, actual[record.id])).map(record => record.id);
        const unexpectedlyPresent = manifest.absentIds.filter(id => actual[id]);
        const actualPresent = Object.keys(actual).filter(id => manifest.affectedIds.includes(id)).length;
        if (!badRecords.length && !unexpectedlyPresent.length && actualPresent === manifest.beforeRecords.length) {
            return { restored: manifest.beforeRecords.length, removedCreated: manifest.createdIds.length, affectedIdCount: manifest.affectedIds.length };
        }
        lastProblem = `restoreMismatch=${badRecords.join(',') || 'ok'} absentMismatch=${unexpectedlyPresent.join(',') || 'ok'} count=${actualPresent}/${manifest.beforeRecords.length}`;
        if (attempt < attempts) await sleep(delayMs * attempt);
    }
    throw targetMismatch('RESTORE_VERIFY_FAILED', `read-after-restore verification failed: ${lastProblem}`);
}

async function runRollback({ config, manifestPath, createClient, fsModule, root, output, sleep }) {
    const manifest = JSON.parse(fsModule.readFileSync(manifestPath, 'utf8'));
    assertManifestEnvelope(manifest, 'apply');
    if (!config.apiKey) throw new Error('Thiếu PINECONE_API_KEY; không thể rollback.');
    const pc = createClient();
    const target = await resolveTarget(pc, config);
    assertTargetIdentity(manifest.target, target);
    const namespace = pc.index(target.index, target.host).namespace(target.namespace);
    const result = await restoreManifest(namespace, manifest, { target, sleep });
    output.log(JSON.stringify({
        mode: 'rollback',
        status: 'RESTORE_PASS',
        manifest: path.relative(root, manifestPath),
        target,
        ...result,
    }, null, 2));
}

function getFlagValue(argv, flag) {
    const index = argv.indexOf(flag);
    if (index < 0) return null;
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
    return value;
}

async function main(options = {}) {
    const argv = options.argv || process.argv.slice(2);
    const config = options.config || getConfig();
    const fsModule = options.fsModule || fs;
    const root = options.root || ROOT;
    const catalogPath = options.catalogPath || path.join(root, 'data', 'tthc-catalog.json');
    const backupDir = options.backupDir || BACKUP_DIR;
    const output = options.output || console;
    const sleep = options.sleep;
    const createClient = options.createClient || (() => new Pinecone({ apiKey: config.apiKey }));
    const rollbackPath = getFlagValue(argv, '--rollback');
    if (rollbackPath) {
        const manifestPath = path.resolve(root, rollbackPath);
        return runRollback({ config, manifestPath, createClient, fsModule, root, output, sleep });
    }

    const applying = argv.includes('--apply');
    const dryRunPath = getFlagValue(argv, '--manifest');
    if (applying && !dryRunPath) throw new Error('--apply requires --manifest <reviewed-dry-run.json>.');
    if (!applying && dryRunPath) throw new Error('--manifest is only valid together with --apply.');
    if (!config.apiKey) throw new Error('Thiếu PINECONE_API_KEY; dry-run live cần credential read-only.');

    const dryRunManifestPath = dryRunPath ? path.resolve(root, dryRunPath) : null;
    const reviewedDryRun = dryRunManifestPath
        ? JSON.parse(fsModule.readFileSync(dryRunManifestPath, 'utf8'))
        : null;
    if (reviewedDryRun) assertManifestEnvelope(reviewedDryRun, 'dry-run');

    const catalogBytes = fsModule.readFileSync(catalogPath);
    const catalog = JSON.parse(catalogBytes.toString('utf8'));
    const procedures = buildCatalogScope(catalog);
    const pc = createClient();
    const target = await resolveTarget(pc, config);
    if (reviewedDryRun) assertTargetIdentity(reviewedDryRun.target, target);
    const namespace = pc.index(target.index, target.host).namespace(target.namespace);
    const stats = await namespace.describeIndexStats();
    const ids = await listIds(namespace);
    const records = await fetchAll(namespace, ids);
    const liveRows = Object.entries(records).map(([id, record]) => ({ id, ...record }));
    const delta = classifyDelta(procedures, liveRows);
    const summary = summarizeDelta(delta);
    const currentDryRun = buildManifest({
        mode: 'dry-run', target, catalog, catalogBytes, procedures, stats, ids, delta, records,
        generatedAt: new Date().toISOString(),
    });
    const reportPath = makeManifestPath('tthc-2026-delta-dry-run', backupDir, fsModule);
    fsModule.writeFileSync(reportPath, JSON.stringify(currentDryRun, null, 2), 'utf8');

    if (!applying) {
        output.log(JSON.stringify({
            mode: 'dry-run',
            target,
            before: currentDryRun.before,
            affectedIdCount: currentDryRun.affectedIds.length,
            affectedIds: currentDryRun.affectedIds,
            summary,
            report: path.relative(root, reportPath),
        }, null, 2));
        return;
    }

    assertTargetIdentity(reviewedDryRun.target, target);
    assertDryRunMatches(reviewedDryRun, currentDryRun);
    assertApplySafe(delta);
    if (!config.geminiKey) throw new Error('Thiếu GEMINI_API_KEY; không thể tạo vector mới/cập nhật.');
    const verifiedAt = catalog.generatedAt || new Date().toISOString();
    const changed = [...delta.insert, ...delta.update];
    const vectors = [];
    for (const item of changed) {
        vectors.push({ id: item.id, values: await embedDocument(item.procedure.text, config.geminiKey), metadata: toVectorMetadata(item.procedure, verifiedAt) });
    }
    const deleteIds = currentDryRun.deleteIds;
    const manifest = { ...currentDryRun, mode: 'apply', generatedAt: new Date().toISOString() };
    const backupManifestPath = makeManifestPath('tthc-2026-delta-pre', backupDir, fsModule);
    fsModule.writeFileSync(backupManifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    try {
        const targetBeforeMutation = await resolveTarget(pc, config);
        assertTargetIdentity(reviewedDryRun.target, targetBeforeMutation);
        if (vectors.length) await namespace.upsert(vectors);
        if (deleteIds.length) await namespace.deleteMany(deleteIds);
        await verifyApplied(namespace, vectors, deleteIds);
    } catch (error) {
        try {
            const rollbackTarget = await resolveTarget(pc, config);
            assertTargetIdentity(manifest.target, rollbackTarget);
            const rollbackNamespace = pc.index(rollbackTarget.index, rollbackTarget.host).namespace(rollbackTarget.namespace);
            const rollbackResult = await restoreManifest(rollbackNamespace, manifest, { target: rollbackTarget, sleep });
            error.message += ` Auto-rollback RESTORE_PASS; affected=${rollbackResult.affectedIdCount}.`;
        } catch (rollbackError) {
            error.message += ` Auto-rollback failed or was blocked: ${rollbackError.message}`;
        }
        throw error;
    }
    output.log(JSON.stringify({
        mode: 'apply',
        target,
        affectedIdCount: manifest.affectedIds.length,
        affectedIds: manifest.affectedIds,
        actual: summary.counts,
        rollbackManifest: path.relative(root, backupManifestPath),
        verify: 'PASS',
    }, null, 2));
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });

module.exports = {
    DIMENSIONS,
    assertApplySafe,
    assertDryRunMatches,
    assertTargetIdentity,
    buildCatalogScope,
    buildManifest,
    classifyDelta,
    contentHash,
    main,
    normalizeHost,
    operationPlan,
    restoreManifest,
    sourceTypeFor,
    stableRefreshId,
    summarizeDelta,
    toVectorMetadata,
};
