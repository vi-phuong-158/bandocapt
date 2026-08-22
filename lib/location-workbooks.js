(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.LocationWorkbookConfig = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

const PUBLIC_LOCATION_SHEETS = Object.freeze(['Published_Locations']);
const PRIVATE_LOCATION_SHEETS = Object.freeze([
    'Unit_Allowlist',
    'Location_Staging',
    'Approval_Audit_Log',
    'Staff_Verification_Audit',
    'Idempotency_Ledger',
    'Operational_Baseline',
    'Intake_Setup_Info',
    'Form Responses 1',
]);

function readId(env, key) {
    return String(env?.[key] || '').trim();
}

function createConfigError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
}

function resolvePublicLocationWorkbook(env = process.env) {
    const publicWorkbookId = readId(env, 'PUBLIC_LOCATION_SPREADSHEET_ID');
    const legacyWorkbookId = readId(env, 'GOOGLE_SHEET_ID');
    const privateWorkbookId = readId(env, 'PRIVATE_LOCATION_SPREADSHEET_ID');

    if (publicWorkbookId && legacyWorkbookId && publicWorkbookId !== legacyWorkbookId) {
        throw createConfigError('PUBLIC_LOCATION_WORKBOOK_CONFIG_CONFLICT');
    }
    const spreadsheetId = publicWorkbookId || legacyWorkbookId;
    if (!spreadsheetId) throw createConfigError('PUBLIC_LOCATION_SPREADSHEET_ID_MISSING');
    if (privateWorkbookId && spreadsheetId === privateWorkbookId) {
        throw createConfigError('LOCATION_WORKBOOK_BOUNDARY_VIOLATION');
    }

    return Object.freeze({
        spreadsheetId,
        source: publicWorkbookId ? 'PUBLIC_LOCATION_SPREADSHEET_ID' : 'GOOGLE_SHEET_ID',
        compatibilityMode: !publicWorkbookId,
    });
}

function resolvePrivateLocationWorkbook(env = process.env) {
    const spreadsheetId = readId(env, 'PRIVATE_LOCATION_SPREADSHEET_ID');
    if (!spreadsheetId) throw createConfigError('PRIVATE_LOCATION_SPREADSHEET_ID_MISSING');

    const explicitPublicWorkbookId = readId(env, 'PUBLIC_LOCATION_SPREADSHEET_ID');
    const legacyPublicWorkbookId = readId(env, 'GOOGLE_SHEET_ID');
    if (explicitPublicWorkbookId && legacyPublicWorkbookId && explicitPublicWorkbookId !== legacyPublicWorkbookId) {
        throw createConfigError('PUBLIC_LOCATION_WORKBOOK_CONFIG_CONFLICT');
    }
    const publicWorkbookId = explicitPublicWorkbookId || legacyPublicWorkbookId;
    if (publicWorkbookId && publicWorkbookId === spreadsheetId) {
        throw createConfigError('LOCATION_WORKBOOK_BOUNDARY_VIOLATION');
    }
    return Object.freeze({ spreadsheetId, source: 'PRIVATE_LOCATION_SPREADSHEET_ID' });
}

function classifyLocationSheet(name) {
    if (PUBLIC_LOCATION_SHEETS.includes(name)) return 'public';
    if (PRIVATE_LOCATION_SHEETS.includes(name) || /^Form Responses(?: \d+)?$/i.test(String(name || ''))) return 'private';
    return 'unknown';
}

return {
    PUBLIC_LOCATION_SHEETS,
    PRIVATE_LOCATION_SHEETS,
    classifyLocationSheet,
    resolvePrivateLocationWorkbook,
    resolvePublicLocationWorkbook,
};
});
