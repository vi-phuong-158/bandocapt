(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./staff-location-contract'));
    else if (root) root.OperationalBaseline = factory(root.StaffLocationContract);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (staffLocationContract) {
    'use strict';

    if (!staffLocationContract) throw new Error('OPERATIONAL_BASELINE_CONTRACT_MISSING');

    const { SNAPSHOT_FIELDS, stableStringify, toPublicSnapshot } = staffLocationContract;
    const SHEET_NAME = 'Operational_Baseline';
    const BASELINE_SOURCE = 'MIGRATED_PUBLISHED_LOCATION';
    const BASELINE_STATUS = 'ACTIVE';
    const BASELINE_VERSION = 'v1';
    const HEADERS = Object.freeze([
        ...SNAPSHOT_FIELDS,
        'baseline_source', 'baseline_status', 'baseline_version', 'source_updated_at', 'reconciled_at',
    ]);

    function text(value) { return String(value == null ? '' : value).trim(); }

    function baselineError(code) {
        const error = new Error(code);
        error.code = code;
        return error;
    }

    function normalizedSnapshot(record) {
        const snapshot = toPublicSnapshot(record || {});
        return Object.fromEntries(SNAPSHOT_FIELDS.map(field => {
            const value = snapshot[field];
            return [field, Array.isArray(value) ? value.map(text).filter(Boolean).join('|') : text(value)];
        }));
    }

    function duplicateRecordIds(records = []) {
        const counts = new Map();
        for (const record of records) {
            const recordId = text(record?.record_id || record?.recordId || record?.id);
            if (recordId) counts.set(recordId, (counts.get(recordId) || 0) + 1);
        }
        return Array.from(counts.entries()).filter(([, count]) => count > 1).map(([recordId]) => recordId).sort();
    }

    function toBaselineRow(publicRecord, reconciledAt) {
        const snapshot = normalizedSnapshot(publicRecord);
        return {
            ...snapshot,
            baseline_source: BASELINE_SOURCE,
            baseline_status: BASELINE_STATUS,
            baseline_version: BASELINE_VERSION,
            source_updated_at: snapshot.updated_at,
            reconciled_at: text(reconciledAt),
        };
    }

    function baselineComparable(row) {
        return stableStringify(normalizedSnapshot(row));
    }

    function reconcileOperationalBaseline({ publicRecords = [], baselineRows = [], allowlistRows = [], reconciledAt = '' } = {}) {
        const publicRows = Array.isArray(publicRecords) ? publicRecords : [];
        const existingRows = Array.isArray(baselineRows) ? baselineRows : [];
        const allowedUnits = new Set((Array.isArray(allowlistRows) ? allowlistRows : [])
            .map(row => text(row?.unit_code || row?.unitCode).toLowerCase()).filter(Boolean));
        const blockers = [];
        const duplicatePublicRecordIds = duplicateRecordIds(publicRows);
        const duplicateBaselineRecordIds = duplicateRecordIds(existingRows);
        blockers.push(...duplicatePublicRecordIds.map(recordId => `PUBLIC_DUPLICATE_RECORD_ID:${recordId}`));
        blockers.push(...duplicateBaselineRecordIds.map(recordId => `BASELINE_DUPLICATE_RECORD_ID:${recordId}`));

        const publicById = new Map();
        const unknownUnitCodes = new Set();
        for (const publicRecord of publicRows) {
            const snapshot = normalizedSnapshot(publicRecord);
            if (!snapshot.record_id) blockers.push('PUBLIC_RECORD_ID_MISSING');
            if (!snapshot.unit_code) blockers.push(`PUBLIC_UNIT_CODE_MISSING:${snapshot.record_id || 'UNKNOWN'}`);
            if (!snapshot.name) blockers.push(`PUBLIC_NAME_MISSING:${snapshot.record_id || 'UNKNOWN'}`);
            if (!snapshot.coordinates) blockers.push(`PUBLIC_COORDINATES_MISSING:${snapshot.record_id || 'UNKNOWN'}`);
            if (snapshot.unit_code && !allowedUnits.has(snapshot.unit_code.toLowerCase())) unknownUnitCodes.add(snapshot.unit_code);
            if (snapshot.record_id && !publicById.has(snapshot.record_id)) publicById.set(snapshot.record_id, snapshot);
        }
        blockers.push(...Array.from(unknownUnitCodes).sort().map(unitCode => `UNKNOWN_UNIT_CODE:${unitCode}`));

        const baselineById = new Map();
        for (const row of existingRows) {
            const snapshot = normalizedSnapshot(row);
            if (!snapshot.record_id) {
                blockers.push('BASELINE_RECORD_ID_MISSING');
                continue;
            }
            if (text(row.baseline_source) !== BASELINE_SOURCE) blockers.push(`BASELINE_PROVENANCE_INVALID:${snapshot.record_id}`);
            if (text(row.baseline_status) !== BASELINE_STATUS) blockers.push(`BASELINE_STATUS_INVALID:${snapshot.record_id}`);
            if (text(row.baseline_version) !== BASELINE_VERSION) blockers.push(`BASELINE_VERSION_INVALID:${snapshot.record_id}`);
            if (snapshot.unit_code && !allowedUnits.has(snapshot.unit_code.toLowerCase())) unknownUnitCodes.add(snapshot.unit_code);
            if (!baselineById.has(snapshot.record_id)) baselineById.set(snapshot.record_id, row);
        }
        blockers.push(...Array.from(unknownUnitCodes).sort().map(unitCode => `UNKNOWN_UNIT_CODE:${unitCode}`));

        const plannedRows = [];
        const mismatchedRecordIds = [];
        for (const [recordId, snapshot] of publicById.entries()) {
            const current = baselineById.get(recordId);
            if (!current) {
                plannedRows.push(toBaselineRow(snapshot, reconciledAt));
            } else if (baselineComparable(current) !== stableStringify(snapshot)) {
                mismatchedRecordIds.push(recordId);
            }
        }
        mismatchedRecordIds.sort();
        blockers.push(...mismatchedRecordIds.map(recordId => `BASELINE_PUBLIC_RECORD_MISMATCH:${recordId}`));

        const unexpectedBaselineRecordIds = Array.from(baselineById.keys())
            .filter(recordId => !publicById.has(recordId)).sort();
        blockers.push(...unexpectedBaselineRecordIds.map(recordId => `BASELINE_RECORD_NOT_IN_PUBLIC:${recordId}`));

        const projectedCount = baselineById.size + plannedRows.length;
        if (projectedCount !== publicById.size) blockers.push(`PUBLIC_PRIVATE_COUNT_MISMATCH:${publicById.size}:${projectedCount}`);

        return {
            dryRun: true,
            writePerformed: false,
            source: BASELINE_SOURCE,
            version: BASELINE_VERSION,
            publicRecords: publicRows.length,
            baselineEligible: publicById.size,
            baselineExisting: baselineById.size,
            baselinePlanned: plannedRows.length,
            baselineProjected: projectedCount,
            duplicatePublicRecordIds,
            duplicateBaselineRecordIds,
            unknownUnitCodes: Array.from(unknownUnitCodes).sort(),
            unexpectedBaselineRecordIds,
            mismatchedRecordIds,
            blockers: Array.from(new Set(blockers)).sort(),
            plannedRows: plannedRows.sort((left, right) => left.record_id.localeCompare(right.record_id)),
        };
    }

    function stagingToSnapshot(row) {
        return normalizedSnapshot({
            record_id: row?.target_record_id || row?.record_id,
            unit_code: row?.unit_code,
            name: row?.location_name || row?.name,
            type: row?.type,
            address: row?.address,
            phone: row?.public_phone || row?.phone,
            coordinates: row?.coordinates,
            image_url: row?.image_public_url || row?.image_url,
            search_aliases: row?.search_aliases,
            updated_at: row?.updated_at,
            site_type: row?.site_type,
            services: row?.services,
            google_maps_url: row?.maps_url_resolved || row?.maps_url_original || row?.google_maps_url,
            cccd_service_mode: row?.cccd_service_mode,
            service_schedule: row?.service_schedule,
            served_units: row?.served_units,
            status: row?.status,
            verified_at: row?.reviewed_at || row?.verified_at,
        });
    }

    function mergeOperationalRecords({ baselineRows = [], stagingRows = [], approvedStatus = 'APPROVED' } = {}) {
        const merged = new Map();
        for (const row of baselineRows || []) {
            if (text(row?.baseline_status) !== BASELINE_STATUS) continue;
            if (text(row?.baseline_source) !== BASELINE_SOURCE || text(row?.baseline_version) !== BASELINE_VERSION) {
                throw baselineError('OPERATIONAL_BASELINE_PROVENANCE_INVALID');
            }
            const snapshot = normalizedSnapshot(row);
            if (!snapshot.record_id) throw baselineError('OPERATIONAL_BASELINE_RECORD_ID_MISSING');
            if (merged.has(snapshot.record_id)) throw baselineError('OPERATIONAL_BASELINE_DUPLICATE_RECORD_ID');
            merged.set(snapshot.record_id, snapshot);
        }
        for (const row of stagingRows || []) {
            if (text(row?.status) !== text(approvedStatus)) continue;
            const snapshot = stagingToSnapshot(row);
            if (!snapshot.record_id) continue;
            const existing = merged.get(snapshot.record_id);
            if (existing && existing.unit_code.toLowerCase() !== snapshot.unit_code.toLowerCase()) {
                throw baselineError('OPERATIONAL_BASELINE_UNIT_MISMATCH');
            }
            merged.set(snapshot.record_id, snapshot);
        }
        return Array.from(merged.values()).sort((left, right) => left.record_id.localeCompare(right.record_id));
    }

    return Object.freeze({
        SHEET_NAME,
        HEADERS,
        BASELINE_SOURCE,
        BASELINE_STATUS,
        BASELINE_VERSION,
        duplicateRecordIds,
        mergeOperationalRecords,
        reconcileOperationalBaseline,
        stagingToSnapshot,
        toBaselineRow,
    });
});
