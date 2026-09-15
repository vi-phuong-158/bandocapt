'use strict';

const ALLOWED_CLASSIFICATIONS = new Set([
    'UNCHANGED', 'NEW', 'AMENDED', 'REPLACED', 'ABOLISHED', 'SUPERSEDED', 'OUT_OF_SCOPE', 'NEEDS_LEGAL_REVIEW'
]);
const BLOCKED_CLASSIFICATIONS = new Set(['ABOLISHED', 'SUPERSEDED']);
const REQUIRED_SOURCE_FIELDS = [
    'document_number', 'document_type', 'title', 'issuer', 'issued_date', 'effective_date',
    'status', 'official_url', 'domains', 'supersedes', 'source_priority', 'verified_at'
];
const REQUIRED_MANIFEST_FIELDS = [
    'procedure_id', 'old_name', 'classification', 'domain', 'old_level', 'document_changes',
    'processing_time_changes', 'submission_method_changes', 'fee_changes', 'new_forms',
    'legal_basis', 'source_url_ref', 'effective_date', 'confidence', 'evidence'
];

function isIsoDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function isOfficialUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && [
            'vanban.bocongan.gov.vn', 'bocongan.gov.vn', 'dichvucong.bocongan.gov.vn', 'dichvucong.gov.vn',
            'vanban.chinhphu.vn', 'xaydungchinhsach.chinhphu.vn', 'mps.gov.vn'
        ].includes(url.hostname);
    } catch {
        return false;
    }
}

function validateRegistry(registry = {}) {
    const errors = [];
    const numbers = new Set();
    for (const source of registry.sources || []) {
        for (const field of REQUIRED_SOURCE_FIELDS) {
            if (source[field] === undefined || source[field] === null || source[field] === '') errors.push(`source missing ${field}`);
        }
        if (!isIsoDate(source.issued_date) || !isIsoDate(source.effective_date) || !isIsoDate(source.verified_at)) errors.push(`source has invalid date: ${source.document_number || 'unknown'}`);
        if (!isOfficialUrl(source.official_url)) errors.push(`source is not an official URL: ${source.document_number || 'unknown'}`);
        if (numbers.has(source.document_number)) errors.push(`duplicate source: ${source.document_number}`);
        numbers.add(source.document_number);
    }
    return errors;
}

function validateManifest(manifest = {}, registry = {}) {
    const errors = [];
    const sourceNumbers = new Set((registry.sources || []).map(source => source.document_number));
    const supersededBy = new Map((registry.sources || []).filter(source => source.superseded_by).map(source => [source.document_number, source.superseded_by]));
    const procedureIds = new Set();
    for (const record of manifest.records || []) {
        for (const field of REQUIRED_MANIFEST_FIELDS) {
            if (record[field] === undefined || record[field] === null || record[field] === '') errors.push(`record ${record.procedure_id || 'unknown'} missing ${field}`);
        }
        if (!ALLOWED_CLASSIFICATIONS.has(record.classification)) errors.push(`invalid classification: ${record.procedure_id || 'unknown'}`);
        if (!isIsoDate(record.effective_date)) errors.push(`record has invalid effective_date: ${record.procedure_id || 'unknown'}`);
        if (procedureIds.has(record.procedure_id)) errors.push(`duplicate procedure_id: ${record.procedure_id}`);
        procedureIds.add(record.procedure_id);
        for (const basis of record.legal_basis || []) if (!sourceNumbers.has(basis)) errors.push(`record ${record.procedure_id} references unknown source: ${basis}`);
        if (!sourceNumbers.has(record.source_url_ref)) errors.push(`record ${record.procedure_id} has unknown source_url_ref`);
        for (const basis of record.legal_basis || []) {
            const newer = supersededBy.get(basis);
            if (newer && !record.legal_basis.includes(newer) && record.source_url_ref !== newer) {
                errors.push(`record ${record.procedure_id} cites superseded source ${basis} without its replacement ${newer}`);
            }
        }
        if (BLOCKED_CLASSIFICATIONS.has(record.classification) && record.new_procedure_id && record.qd5230_catalog_closure?.evidence_quality !== 'PRIMARY_CONFIRMED') {
            errors.push(`blocked record cannot claim an unverified successor: ${record.procedure_id}`);
        }
        if (record.reconciliation?.initialClassification === 'NEEDS_LEGAL_REVIEW') {
            if (!record.reconciliation.result || !record.reconciliation.matchMethod || !record.reconciliation.reason) {
                errors.push(`reconciled record missing disposition evidence: ${record.procedure_id}`);
            }
            if (record.reconciliation.result !== record.classification) errors.push(`reconciled result disagrees with classification: ${record.procedure_id}`);
        }
        if (record.classification === 'NEEDS_LEGAL_REVIEW' && !record.reconciliation?.reason) {
            errors.push(`unresolved record missing concrete reconciliation reason: ${record.procedure_id}`);
        }
    }
    return errors;
}

function validateQd5230NewProcedures(manifest = {}, qd1523Map = null) {
    const errors = [];
    const entry = (manifest.known_missing_procedures || []).find(item => item.source_document_number === '5230/QĐ-BCA-C06');
    if (!entry || !entry.qd5230_final_reconciliation) {
        errors.push('QĐ5230 final reconciliation block missing from known_missing_procedures');
        return errors;
    }
    const r = entry.qd5230_final_reconciliation;
    const titles = r.titles || [];
    if (r.unique_new_titles !== titles.length) errors.push(`unique_new_titles (${r.unique_new_titles}) does not match titles array length (${titles.length})`);
    const rowSum = titles.reduce((sum, t) => sum + (t.rows || 0), 0);
    if (r.published_new_rows !== rowSum) errors.push(`published_new_rows (${r.published_new_rows}) does not match sum of title rows (${rowSum})`);

    const dist = r.authority_distribution || {};
    const counted = { trung_uong: 0, tinh: 0, xa: 0 };
    for (const t of titles) {
        for (const level of t.authority_levels || []) {
            if (counted[level] === undefined) errors.push(`unknown authority level "${level}" in title "${t.title}"`);
            else counted[level] += 1;
        }
    }
    for (const level of ['trung_uong', 'tinh', 'xa']) {
        if (dist[level] !== counted[level]) errors.push(`authority_distribution.${level} (${dist[level]}) does not match rows counted from titles (${counted[level]})`);
    }

    const officialCodePattern = /^\d\.\d{5,7}$/;
    const validActions = new Set(['ADD_NEW', 'UPDATE_EXISTING', 'MERGE_AUTHORITY', 'ALREADY_PRESENT', 'UNRESOLVED']);
    for (const t of titles) {
        if (t.official_code || officialCodePattern.test(String(t.title || ''))) errors.push(`NEW title must not carry a fabricated official_code: ${t.title}`);
        if (t.action && !validActions.has(t.action)) errors.push(`title "${t.title}" has invalid catalog action: ${t.action}`);
    }

    const mappedIds = new Set();
    const seenTwice = new Set();
    for (const t of titles) {
        for (const id of t.mapped_old_abolished_procedure_ids || []) {
            const record = (manifest.records || []).find(rec => rec.procedure_id === id);
            if (!record) { errors.push(`mapped old procedure_id not found in manifest.records: ${id}`); continue; }
            if (record.classification !== 'ABOLISHED') errors.push(`mapped old procedure_id ${id} is not classified ABOLISHED`);
            if (!(record.legal_basis || []).includes('5230/QĐ-BCA-C06')) errors.push(`mapped old procedure_id ${id} does not cite 5230/QĐ-BCA-C06`);
            if (mappedIds.has(id)) seenTwice.add(id);
            mappedIds.add(id);
        }
    }
    for (const id of seenTwice) errors.push(`old procedure_id mapped to more than one NEW title: ${id}`);

    const abolished5230 = (manifest.records || []).filter(rec => rec.classification === 'ABOLISHED' && (rec.legal_basis || []).includes('5230/QĐ-BCA-C06'));
    for (const rec of abolished5230) {
        const exempt = rec.qd5230_catalog_closure?.catalog_action === 'NOT_APPLICABLE_NEVER_IN_CURRENT_CATALOG';
        if (!exempt && !mappedIds.has(rec.procedure_id)) errors.push(`5230-abolished record not mapped to any NEW title: ${rec.procedure_id}`);
    }

    if (qd1523Map && Array.isArray(qd1523Map.rows)) {
        const qd1523Names = new Set(qd1523Map.rows.map(row => row.officialName));
        for (const t of titles) {
            if (qd1523Names.has(t.title)) errors.push(`NEW title exactly matches a QĐ1523 officialName - possible conflation: ${t.title}`);
        }
    }

    return errors;
}

function blockedProcedureIds(manifest = {}) {
    return new Set((manifest.records || []).filter(record => BLOCKED_CLASSIFICATIONS.has(record.classification)).map(record => record.procedure_id));
}

function applyLegalRefreshToCatalog(catalog = {}, manifest = {}) {
    const blocked = blockedProcedureIds(manifest);
    const procedures = (catalog.procedures || []).filter(procedure => !blocked.has(procedure.procedureId));
    const manifestProcedureIds = new Set((manifest.records || []).map(record => record.procedure_id));
    const categories = new Map();
    for (const procedure of procedures) {
        const current = categories.get(procedure.category) || { key: procedure.category, label: procedure.categoryLabel, count: 0 };
        current.count += 1;
        categories.set(procedure.category, current);
    }
    return {
        ...catalog,
        categories: [...categories.values()],
        procedures,
        legalRefresh: {
            manifestVersion: manifest.schema_version || null,
            excludedHistoricalProcedureIds: [...blocked].sort(),
            unresolvedProcedureCount: procedures.filter(procedure => !manifestProcedureIds.has(procedure.procedureId)).length
        }
    };
}

module.exports = {
    ALLOWED_CLASSIFICATIONS,
    BLOCKED_CLASSIFICATIONS,
    applyLegalRefreshToCatalog,
    blockedProcedureIds,
    isOfficialUrl,
    validateManifest,
    validateQd5230NewProcedures,
    validateRegistry
};
