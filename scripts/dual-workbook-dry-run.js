'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { normalizePublishedLocations, validatePublishedLocationsSchema } = require('../js/location-data');
const {
    PUBLIC_LOCATION_SHEETS,
    PRIVATE_LOCATION_SHEETS,
    classifyLocationSheet,
} = require('../lib/location-workbooks');

const REQUIRED_PUBLIC_COLUMNS = Object.freeze(['name', 'coordinates']);

function parseArgs(argv) {
    const args = { source: '', target: '', report: '' };
    for (let index = 0; index < argv.length; index += 1) {
        const value = argv[index];
        if (value === '--source') args.source = argv[index + 1] || '';
        if (value === '--target') args.target = argv[index + 1] || '';
        if (value === '--report') args.report = argv[index + 1] || '';
        if (value === '--apply' || value === '--write') throw new Error('DUAL_WORKBOOK_DRY_RUN_ONLY');
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
    const missingRequiredColumns = REQUIRED_PUBLIC_COLUMNS.filter(column => !columns.includes(column));
    return {
        rows: records.length,
        columns: columns.sort(),
        missingRequiredColumns,
        schemaOk: schema.ok,
        validCoordinates: normalized.locations.length,
        invalidCoordinates: normalized.rejected.length,
        duplicateRecordIds: duplicateValues(records, 'record_id'),
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
    return new Set(records.map(record => String(record?.record_id || '').trim()).filter(Boolean));
}

function comparePublishedLocations(sourceSheets, targetSheets) {
    const sourceRecords = sourceSheets.Published_Locations || [];
    const targetRecords = targetSheets?.Published_Locations || [];
    if (!targetSheets) return { compared: false, missingInTarget: [], unexpectedInTarget: [], duplicateTargetRecordIds: [] };
    const sourceIds = recordIds(sourceRecords);
    const targetIds = recordIds(targetRecords);
    return {
        compared: true,
        missingInTarget: Array.from(sourceIds).filter(id => !targetIds.has(id)).sort(),
        unexpectedInTarget: Array.from(targetIds).filter(id => !sourceIds.has(id)).sort(),
        duplicateTargetRecordIds: duplicateValues(targetRecords, 'record_id'),
    };
}

function analyzeDualWorkbookMigration(sourceSheets, target = null) {
    const source = inventoryWorkbook(sourceSheets);
    const targetInventory = target ? {
        public: inventoryWorkbook(target.publicSheets).public,
        private: inventoryWorkbook(target.privateSheets).private,
        publicUnknownSheets: inventoryWorkbook(target.publicSheets).unknownSheets,
        privateUnknownSheets: inventoryWorkbook(target.privateSheets).unknownSheets,
    } : null;
    const targetLeaksPrivateSheet = target
        ? Object.keys(target.publicSheets).filter(name => classifyLocationSheet(name) === 'private')
        : [];
    return {
        dryRun: true,
        writePerformed: false,
        boundary: { publicSheets: PUBLIC_LOCATION_SHEETS, privateSheets: PRIVATE_LOCATION_SHEETS },
        source,
        target: targetInventory,
        comparison: { publishedLocations: comparePublishedLocations(sourceSheets, target?.publicSheets || null) },
        blockers: [
            ...source.public.Published_Locations.missingRequiredColumns.map(column => `PUBLIC_REQUIRED_COLUMN_MISSING:${column}`),
            ...(source.public.Published_Locations.schemaOk ? [] : ['PUBLIC_SCHEMA_INVALID']),
            ...(source.public.Published_Locations.rows > 0 && source.public.Published_Locations.validCoordinates === 0 ? ['PUBLIC_NO_VALID_COORDINATES'] : []),
            ...(source.unknownSheets.length ? source.unknownSheets.map(sheet => `UNKNOWN_SHEET:${sheet.name}`) : []),
            ...(targetLeaksPrivateSheet.map(name => `PRIVATE_SHEET_IN_PUBLIC_TARGET:${name}`)),
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
    inventoryPublicSheet,
    inventoryWorkbook,
    parseArgs,
    runDualWorkbookDryRun,
};
