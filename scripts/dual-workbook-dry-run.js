'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
    normalizePublishedLocations,
    parseCoordinates,
    resolveColumnIndexes,
    validatePublishedLocationsSchema,
} = require('../js/location-data');
const {
    PUBLIC_LOCATION_SHEETS,
    PRIVATE_LOCATION_SHEETS,
    classifyLocationSheet,
} = require('../lib/location-workbooks');

const REQUIRED_PUBLIC_COLUMNS = Object.freeze(['name', 'coordinates']);
const REQUIRED_PUBLIC_COLUMN_ALIASES = Object.freeze({
    name: ['name', 'ten don vi', 'ten dia diem', 'ten tru so'],
    coordinates: ['coordinates', 'toa do', 'vi tri', 'google maps', 'link google maps'],
});
const PRIVATE_PUBLICATION_COLUMNS = new Set([
    'allowed_emails', 'submitter_name', 'submitter_phone', 'submitter_email', 'actor_email',
    'staff_email', 'request_id', 'request_type', 'target_record_id', 'auth_status',
    'validation_errors', 'warnings', 'review_action', 'review_note', 'reviewed_by',
    'image_file_id', 'image_drive_url', 'published_image_file_id', 'snapshot_json',
    'body_hash', 'image_resource_key', 'staging_ref', 'last_error', 'note', 'notes',
].map(normalizeColumnName));

function normalizeColumnName(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[đĐ]/g, 'd')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function parseArgs(argv) {
    const args = { source: '', target: '', report: '' };
    for (let index = 0; index < argv.length; index += 1) {
        const value = argv[index];
        if (value === '--source') args.source = argv[index + 1] || '';
        if (value === '--target') args.target = argv[index + 1] || '';
        if (value === '--report') args.report = argv[index + 1] || '';
        if (/^--(?:apply|write)(?:=|$)/.test(value)) throw new Error('DUAL_WORKBOOK_DRY_RUN_ONLY');
    }
    return args;
}

function normalizeWorkbook(parsed) {
    const sheets = parsed?.sheets || parsed;
    if (!sheets || Array.isArray(sheets) || typeof sheets !== 'object') {
        throw new Error('WORKBOOK_MUST_BE_SHEETS_OBJECT');
    }
    for (const [name, rows] of Object.entries(sheets)) {
        if (!Array.isArray(rows)) throw new Error(`SHEET_ROWS_MUST_BE_ARRAY:${name}`);
    }
    return sheets;
}

function readWorkbook(filePath) {
    if (!filePath) throw new Error('SOURCE_WORKBOOK_REQUIRED');
    return normalizeWorkbook(JSON.parse(fs.readFileSync(filePath, 'utf8')));
}

function readTarget(filePath) {
    if (!filePath) return null;
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (parsed?.public || parsed?.private) {
        return {
            publicSheets: normalizeWorkbook(parsed.public || {}),
            privateSheets: normalizeWorkbook(parsed.private || {}),
        };
    }
    return { publicSheets: normalizeWorkbook(parsed), privateSheets: {} };
}

function recordKeys(records) {
    return Array.from(new Set(records.flatMap(record => Object.keys(record || {}))));
}

function toVisualizationPayload(records) {
    const columns = recordKeys(records);
    return {
        table: {
            cols: columns.map(label => ({ label })),
            rows: records.map(record => ({ c: columns.map(label => record?.[label] == null ? null : { v: record[label] }) })),
        },
    };
}

function duplicateValues(records, field) {
    const counts = new Map();
    for (const record of records) {
        const value = String(record?.[field] || '').trim();
        if (value) counts.set(value, (counts.get(value) || 0) + 1);
    }
    return Array.from(counts.entries()).filter(([, count]) => count > 1).map(([value]) => value).sort();
}

function inventoryPublicSheet(records = []) {
    const payload = toVisualizationPayload(records);
    const columns = recordKeys(records);
    const schema = validatePublishedLocationsSchema(payload.table, { allowLegacy: false });
    const normalized = schema.ok ? normalizePublishedLocations(payload, { allowLegacy: false }) : { locations: [], rejected: records };
    const normalizedColumns = columns.map(normalizeColumnName);
    const missingRequiredColumns = REQUIRED_PUBLIC_COLUMNS.filter(column => (
        !REQUIRED_PUBLIC_COLUMN_ALIASES[column].some(alias => normalizedColumns.includes(alias))
    ));
    return {
        rows: records.length,
        columns: columns.sort(),
        missingRequiredColumns,
        schemaOk: schema.ok,
        validCoordinates: normalized.locations.length,
        invalidCoordinates: normalized.rejected.length,
        duplicateRecordIds: duplicateValues(records, 'record_id'),
        privateColumns: columns.filter(column => PRIVATE_PUBLICATION_COLUMNS.has(normalizeColumnName(column))).sort(),
    };
}

function inventoryWorkbook(sheets) {
    const result = { public: {}, private: {}, unknownSheets: [] };
    for (const [name, records] of Object.entries(sheets)) {
        const classification = classifyLocationSheet(name);
        if (classification === 'public') result.public[name] = inventoryPublicSheet(records);
        else if (classification === 'private') {
            result.private[name] = {
                rows: records.length,
                columns: recordKeys(records).sort(),
                duplicateRecordIds: duplicateValues(records, 'record_id'),
                duplicateRequestIds: name === 'Location_Staging' ? duplicateValues(records, 'request_id') : [],
            };
        } else result.unknownSheets.push({ name, rows: records.length });
    }
    for (const name of PUBLIC_LOCATION_SHEETS) {
        if (!Object.hasOwn(result.public, name)) result.public[name] = inventoryPublicSheet([]);
    }
    return result;
}

function recordIds(records = []) {
    return new Set(records.map(record => canonicalizePublishedRecord(record).recordId).filter(Boolean));
}

function valueAtColumn(record, columns, index) {
    if (index < 0) return '';
    const value = record?.[columns[index]];
    return value == null ? '' : String(value).normalize('NFC').trim().replace(/\s+/g, ' ');
}

function canonicalizePublishedRecord(record = {}) {
    const columns = Object.keys(record);
    const { semanticIndexes } = resolveColumnIndexes(columns.map(label => ({ label })));
    const recordId = valueAtColumn(record, columns, semanticIndexes.recordId);
    const name = valueAtColumn(record, columns, semanticIndexes.name);
    const coordinateValue = valueAtColumn(record, columns, semanticIndexes.coordinates);
    const coordinate = coordinateValue ? parseCoordinates(coordinateValue) : { ok: false, error: 'COORDINATES_MISSING' };
    const unitCodeIndex = columns.findIndex(column => ['unit_code', 'unit code', 'ma don vi'].includes(normalizeColumnName(column)));
    return {
        recordId,
        name,
        publicData: {
            recordId,
            unitCode: valueAtColumn(record, columns, unitCodeIndex),
            name,
            type: valueAtColumn(record, columns, semanticIndexes.type),
            address: valueAtColumn(record, columns, semanticIndexes.address),
            phone: valueAtColumn(record, columns, semanticIndexes.phone),
            imageUrl: valueAtColumn(record, columns, semanticIndexes.imageUrl),
            searchAliases: valueAtColumn(record, columns, semanticIndexes.searchAliases),
            updatedAt: valueAtColumn(record, columns, semanticIndexes.updatedAt),
            siteType: valueAtColumn(record, columns, semanticIndexes.siteType),
            services: valueAtColumn(record, columns, semanticIndexes.services),
            googleMapsUrl: valueAtColumn(record, columns, semanticIndexes.googleMapsUrl),
            cccdServiceMode: valueAtColumn(record, columns, semanticIndexes.cccdServiceMode),
            serviceSchedule: valueAtColumn(record, columns, semanticIndexes.serviceSchedule),
            servedUnits: valueAtColumn(record, columns, semanticIndexes.servedUnits),
            status: valueAtColumn(record, columns, semanticIndexes.status),
            verifiedAt: valueAtColumn(record, columns, semanticIndexes.verifiedAt),
        },
        coordinates: coordinate.ok
            ? { raw: coordinateValue, ok: true, lat: coordinate.lat, lng: coordinate.lng }
            : { raw: coordinateValue, ok: false, error: coordinate.error },
    };
}

function recordsById(records = []) {
    const byId = new Map();
    for (const record of records) {
        const canonical = canonicalizePublishedRecord(record);
        if (canonical.recordId && !byId.has(canonical.recordId)) byId.set(canonical.recordId, canonical);
    }
    return byId;
}

function comparePublishedRecordFidelity(sourceRecords = [], targetRecords = []) {
    const sourceById = recordsById(sourceRecords);
    const targetById = recordsById(targetRecords);
    const fidelity = {
        mismatchedRecordIds: [],
        coordinateLost: [],
        coordinateInvalid: [],
        coordinateChanged: [],
    };
    for (const [recordId, source] of sourceById.entries()) {
        const target = targetById.get(recordId);
        if (!target) continue;

        let coordinateMismatch = false;
        if (source.coordinates.ok && !target.coordinates.raw) {
            fidelity.coordinateLost.push(recordId);
            coordinateMismatch = true;
        } else if (source.coordinates.ok && !target.coordinates.ok) {
            fidelity.coordinateInvalid.push(recordId);
            coordinateMismatch = true;
        } else if (source.coordinates.ok && (source.coordinates.lat !== target.coordinates.lat || source.coordinates.lng !== target.coordinates.lng)) {
            fidelity.coordinateChanged.push(recordId);
            coordinateMismatch = true;
        }
        if (!coordinateMismatch && JSON.stringify(source.publicData) !== JSON.stringify(target.publicData)) {
            fidelity.mismatchedRecordIds.push(recordId);
        }
    }
    for (const values of Object.values(fidelity)) values.sort();
    return fidelity;
}

function comparePublishedLocations(sourceSheets, targetSheets) {
    const sourceRecords = sourceSheets.Published_Locations || [];
    const targetRecords = targetSheets?.Published_Locations || [];
    if (!targetSheets) {
        return {
            compared: false,
            missingInTarget: [],
            unexpectedInTarget: [],
            duplicateTargetRecordIds: [],
            fidelity: comparePublishedRecordFidelity(),
        };
    }
    const sourceIds = recordIds(sourceRecords);
    const targetIds = recordIds(targetRecords);
    return {
        compared: true,
        missingInTarget: Array.from(sourceIds).filter(id => !targetIds.has(id)).sort(),
        unexpectedInTarget: Array.from(targetIds).filter(id => !sourceIds.has(id)).sort(),
        duplicateTargetRecordIds: duplicateValues(targetRecords, 'record_id'),
        fidelity: comparePublishedRecordFidelity(sourceRecords, targetRecords),
    };
}

function analyzeDualWorkbookMigration(sourceSheets, target = null) {
    const source = inventoryWorkbook(sourceSheets);
    const publicTargetInventory = target ? inventoryWorkbook(target.publicSheets) : null;
    const privateTargetInventory = target ? inventoryWorkbook(target.privateSheets) : null;
    const targetInventory = target ? {
        public: publicTargetInventory.public,
        private: privateTargetInventory.private,
        publicUnknownSheets: publicTargetInventory.unknownSheets,
        privateUnknownSheets: privateTargetInventory.unknownSheets,
    } : null;
    const targetLeaksPrivateSheet = target
        ? Object.keys(target.publicSheets).filter(name => classifyLocationSheet(name) === 'private')
        : [];
    const targetLeaksPublicSheet = target
        ? Object.keys(target.privateSheets).filter(name => classifyLocationSheet(name) === 'public')
        : [];
    const comparison = comparePublishedLocations(sourceSheets, target?.publicSheets || null);
    const sourcePublic = source.public.Published_Locations;
    const targetPublic = targetInventory?.public.Published_Locations;
    const sourceStaging = source.private.Location_Staging;
    const targetStaging = targetInventory?.private.Location_Staging;
    const missingPrivateTargetSheets = target
        ? Object.keys(source.private).filter(name => !Object.hasOwn(target.privateSheets, name))
        : [];
    return {
        dryRun: true,
        writePerformed: false,
        boundary: { publicSheets: PUBLIC_LOCATION_SHEETS, privateSheets: PRIVATE_LOCATION_SHEETS },
        source,
        target: targetInventory,
        comparison: { publishedLocations: comparison },
        blockers: [
            ...sourcePublic.missingRequiredColumns.map(column => `PUBLIC_REQUIRED_COLUMN_MISSING:${column}`),
            ...(sourcePublic.schemaOk ? [] : ['PUBLIC_SCHEMA_INVALID']),
            ...(sourcePublic.rows > 0 && sourcePublic.validCoordinates === 0 ? ['PUBLIC_NO_VALID_COORDINATES'] : []),
            ...sourcePublic.duplicateRecordIds.map(value => `SOURCE_DUPLICATE_RECORD_ID:Published_Locations:${value}`),
            ...sourcePublic.privateColumns.map(value => `PRIVATE_COLUMN_IN_PUBLIC_SOURCE:${value}`),
            ...(sourceStaging ? sourceStaging.duplicateRecordIds.map(value => `SOURCE_DUPLICATE_RECORD_ID:Location_Staging:${value}`) : []),
            ...(sourceStaging ? sourceStaging.duplicateRequestIds.map(value => `SOURCE_DUPLICATE_REQUEST_ID:Location_Staging:${value}`) : []),
            ...(source.unknownSheets.length ? source.unknownSheets.map(sheet => `UNKNOWN_SHEET:${sheet.name}`) : []),
            ...(targetLeaksPrivateSheet.map(name => `PRIVATE_SHEET_IN_PUBLIC_TARGET:${name}`)),
            ...(targetLeaksPublicSheet.map(name => `PUBLIC_SHEET_IN_PRIVATE_TARGET:${name}`)),
            ...(targetInventory ? targetInventory.publicUnknownSheets.map(sheet => `UNKNOWN_PUBLIC_TARGET_SHEET:${sheet.name}`) : []),
            ...(targetInventory ? targetInventory.privateUnknownSheets.map(sheet => `UNKNOWN_PRIVATE_TARGET_SHEET:${sheet.name}`) : []),
            ...(targetPublic ? targetPublic.missingRequiredColumns.map(column => `TARGET_PUBLIC_REQUIRED_COLUMN_MISSING:${column}`) : []),
            ...(targetPublic && !targetPublic.schemaOk ? ['TARGET_PUBLIC_SCHEMA_INVALID'] : []),
            ...(targetPublic && targetPublic.rows === 0 ? ['TARGET_PUBLIC_EMPTY'] : []),
            ...(targetPublic && targetPublic.rows > 0 && targetPublic.validCoordinates === 0 ? ['TARGET_PUBLIC_NO_VALID_COORDINATES'] : []),
            ...(targetPublic ? targetPublic.duplicateRecordIds.map(value => `TARGET_DUPLICATE_RECORD_ID:Published_Locations:${value}`) : []),
            ...(targetPublic ? targetPublic.privateColumns.map(value => `PRIVATE_COLUMN_IN_PUBLIC_TARGET:${value}`) : []),
            ...(targetStaging ? targetStaging.duplicateRecordIds.map(value => `TARGET_DUPLICATE_RECORD_ID:Location_Staging:${value}`) : []),
            ...(targetStaging ? targetStaging.duplicateRequestIds.map(value => `TARGET_DUPLICATE_REQUEST_ID:Location_Staging:${value}`) : []),
            ...missingPrivateTargetSheets.map(name => `TARGET_PRIVATE_SHEET_MISSING:${name}`),
            ...(comparison.compared ? comparison.missingInTarget.map(value => `TARGET_PUBLIC_RECORD_MISSING:${value}`) : []),
            ...(comparison.compared ? comparison.unexpectedInTarget.map(value => `TARGET_PUBLIC_RECORD_UNEXPECTED:${value}`) : []),
            ...(comparison.compared ? comparison.fidelity.coordinateLost.map(value => `TARGET_COORDINATE_LOST:${value}`) : []),
            ...(comparison.compared ? comparison.fidelity.coordinateInvalid.map(value => `TARGET_COORDINATE_INVALID:${value}`) : []),
            ...(comparison.compared ? comparison.fidelity.coordinateChanged.map(value => `TARGET_COORDINATE_CHANGED:${value}`) : []),
            ...(comparison.compared ? comparison.fidelity.mismatchedRecordIds.map(value => `TARGET_PUBLIC_RECORD_MISMATCH:${value}`) : []),
        ],
    };
}

function runDualWorkbookDryRun(options) {
    const sourceSheets = readWorkbook(options.source);
    const target = readTarget(options.target);
    const report = analyzeDualWorkbookMigration(sourceSheets, target);
    if (options.report) {
        const reportPath = path.resolve(options.report);
        fs.mkdirSync(path.dirname(reportPath), { recursive: true });
        fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    }
    return report;
}

if (require.main === module) {
    const report = runDualWorkbookDryRun(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

module.exports = {
    analyzeDualWorkbookMigration,
    canonicalizePublishedRecord,
    comparePublishedRecordFidelity,
    inventoryPublicSheet,
    inventoryWorkbook,
    parseArgs,
    runDualWorkbookDryRun,
};
