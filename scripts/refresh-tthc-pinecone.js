'use strict';

// TTHC 2026 delta refresh — dry-run by default.
//
// This script deliberately scopes production mutation to the seven catalog
// records whose source decision is QĐ5230: five NEW procedures and two
// UPDATED procedures. It never calls deleteAll and never touches law or
// truso vectors. Use --apply only after reviewing the dry-run output.

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

function stamp() {
    return new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '').replace('T', '_');
}

function sha256(value) {
    return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
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
    return {
        scope: delta.scope,
        insert: delta.insert.map(item => ({ id: item.id, procedureId: item.procedure.procedureId, title: item.procedure.title })),
        update: delta.update.map(item => ({ oldId: item.existingId, newId: item.id, procedureId: item.procedure.procedureId, title: item.procedure.title })),
        delete: delta.update.filter(item => item.existingId !== item.id).map(item => item.existingId),
        unchanged: delta.unchanged.map(item => ({ id: item.existingId, procedureId: item.procedure.procedureId, title: item.procedure.title })),
        duplicate: delta.duplicate.map(item => ({ procedureId: item.procedure.procedureId, title: item.procedure.title, candidateIds: item.candidateIds })),
        missing: delta.missing,
        stale: delta.stale,
        outOfScopeLiveCount: delta.outOfScopeLive.length,
        expectedVectorDelta: delta.insert.length + delta.update.filter(item => item.existingId !== item.id).length,
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

function makeManifestPath(prefix) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    return path.join(BACKUP_DIR, `${stamp()}-${prefix}.json`);
}

function assertApplySafe(delta) {
    if (delta.duplicate.length) throw new Error('Có duplicate/ambiguous match; dừng để tránh targeted delete sai.');
    if (delta.stale.length) throw new Error('Có stale QĐ5230 row chưa map chắc chắn; dừng để tránh xóa nhầm.');
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

async function restoreManifest(namespace, manifest) {
    if (manifest.beforeRecords?.length) await namespace.upsert(manifest.beforeRecords);
    if (manifest.createdIds?.length) await namespace.deleteMany(manifest.createdIds);
}

async function runRollback(config, manifestPath) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!manifest.beforeRecords || !manifest.target) throw new Error('Rollback manifest không hợp lệ.');
    if (!config.apiKey) throw new Error('Thiếu PINECONE_API_KEY; không thể rollback.');
    const pc = new Pinecone({ apiKey: config.apiKey });
    const namespace = pc.index(config.indexName, config.indexHost || undefined).namespace(manifest.target.namespace);
    await restoreManifest(namespace, manifest);
    console.log(JSON.stringify({ mode: 'rollback', manifest: path.relative(ROOT, manifestPath), restored: manifest.beforeRecords.length, removedCreated: manifest.createdIds || [] }, null, 2));
}

async function main() {
    const rollbackFlag = process.argv.indexOf('--rollback');
    const config = getConfig();
    if (rollbackFlag >= 0) return runRollback(config, process.argv[rollbackFlag + 1]);
    if (!config.apiKey) throw new Error('Thiếu PINECONE_API_KEY; dry-run live cần credential read-only.');

    const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
    const procedures = buildCatalogScope(catalog);
    const pc = new Pinecone({ apiKey: config.apiKey });
    const namespace = pc.index(config.indexName, config.indexHost || undefined).namespace(config.namespace);
    const stats = await namespace.describeIndexStats();
    const ids = await listIds(namespace);
    const records = await fetchAll(namespace, ids);
    const liveRows = Object.entries(records).map(([id, record]) => ({ id, ...record }));
    const delta = classifyDelta(procedures, liveRows);
    const summary = summarizeDelta(delta);
    const dryRunPath = makeManifestPath('tthc-2026-delta-dry-run');
    fs.writeFileSync(dryRunPath, JSON.stringify({
        mode: 'dry-run', generatedAt: new Date().toISOString(), target: { index: config.indexName, namespace: config.namespace },
        catalogCount: catalog.procedures.length, catalogSha256: sha256(fs.readFileSync(CATALOG_PATH)),
        before: { vectorCount: stats.namespaces?.[config.namespace]?.recordCount ?? null, dimensions: stats.dimension, ids: ids.length },
        summary,
    }, null, 2), 'utf8');

    const applying = process.argv.includes('--apply');
    if (!applying) {
        console.log(JSON.stringify({ mode: 'dry-run', target: { index: config.indexName, namespace: config.namespace }, before: { vectorCount: stats.namespaces?.[config.namespace]?.recordCount ?? null, dimensions: stats.dimension }, summary, report: path.relative(ROOT, dryRunPath) }, null, 2));
        return;
    }

    assertApplySafe(delta);
    if (!config.geminiKey) throw new Error('Thiếu GEMINI_API_KEY; không thể tạo vector mới/cập nhật.');
    const verifiedAt = catalog.generatedAt || new Date().toISOString();
    const changed = [...delta.insert, ...delta.update];
    const vectors = [];
    for (const item of changed) {
        vectors.push({ id: item.id, values: await embedDocument(item.procedure.text, config.geminiKey), metadata: toVectorMetadata(item.procedure, verifiedAt) });
    }
    const deleteIds = [...new Set(delta.update.filter(item => item.existingId !== item.id).map(item => item.existingId))];
    const beforeIds = [...new Set([...vectors.map(vector => vector.id), ...deleteIds])];
    const beforeRecords = Object.values(await fetchAll(namespace, beforeIds));
    const manifestPath = makeManifestPath('tthc-2026-delta-pre');
    const manifest = {
        mode: 'apply', generatedAt: new Date().toISOString(), target: { index: config.indexName, namespace: config.namespace },
        catalogCount: catalog.procedures.length, catalogSha256: sha256(fs.readFileSync(CATALOG_PATH)), summary,
        beforeStats: stats, beforeRecords, createdIds: vectors.filter(vector => !records[vector.id]).map(vector => vector.id),
        upsertIds: vectors.map(vector => vector.id), deleteIds,
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    try {
        if (vectors.length) await namespace.upsert(vectors);
        if (deleteIds.length) await namespace.deleteMany(deleteIds);
        await verifyApplied(namespace, vectors, deleteIds);
    } catch (error) {
        try { await restoreManifest(namespace, manifest); } catch (rollbackError) { error.message += ` Rollback tự động thất bại: ${rollbackError.message}`; }
        throw error;
    }
    console.log(JSON.stringify({ mode: 'apply', target: { index: config.indexName, namespace: config.namespace }, actual: { insert: delta.insert.length, update: delta.update.length, delete: deleteIds.length }, rollbackManifest: path.relative(ROOT, manifestPath), verify: 'PASS' }, null, 2));
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });

module.exports = {
    DIMENSIONS,
    buildCatalogScope,
    classifyDelta,
    contentHash,
    sourceTypeFor,
    stableRefreshId,
    summarizeDelta,
    toVectorMetadata,
    main,
};
