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
        if (BLOCKED_CLASSIFICATIONS.has(record.classification) && record.new_procedure_id) errors.push(`blocked record cannot claim an unverified successor: ${record.procedure_id}`);
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
    validateRegistry
};
