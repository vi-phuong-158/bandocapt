const assert = require('node:assert/strict');
const test = require('node:test');

const {
    classifyLocationSheet,
    resolvePrivateLocationWorkbook,
    resolvePublicLocationWorkbook,
} = require('../lib/location-workbooks');

test('public workbook uses GOOGLE_SHEET_ID only as explicit compatibility fallback', () => {
    assert.deepEqual(resolvePublicLocationWorkbook({ GOOGLE_SHEET_ID: 'legacy-public' }), {
        spreadsheetId: 'legacy-public', source: 'GOOGLE_SHEET_ID', compatibilityMode: true,
    });
    assert.deepEqual(resolvePublicLocationWorkbook({ PUBLIC_LOCATION_SPREADSHEET_ID: 'new-public' }), {
        spreadsheetId: 'new-public', source: 'PUBLIC_LOCATION_SPREADSHEET_ID', compatibilityMode: false,
    });
});

test('workbook configuration fails closed for missing, conflicting, or collapsed boundaries', () => {
    assert.throws(() => resolvePublicLocationWorkbook({}), /PUBLIC_LOCATION_SPREADSHEET_ID_MISSING/);
    assert.throws(() => resolvePublicLocationWorkbook({
        PUBLIC_LOCATION_SPREADSHEET_ID: 'new-public', GOOGLE_SHEET_ID: 'legacy-public',
    }), /PUBLIC_LOCATION_WORKBOOK_CONFIG_CONFLICT/);
    assert.throws(() => resolvePublicLocationWorkbook({
        PUBLIC_LOCATION_SPREADSHEET_ID: 'same', PRIVATE_LOCATION_SPREADSHEET_ID: 'same',
    }), /LOCATION_WORKBOOK_BOUNDARY_VIOLATION/);
    assert.throws(() => resolvePublicLocationWorkbook({
        GOOGLE_SHEET_ID: 'same', PRIVATE_LOCATION_SPREADSHEET_ID: 'same',
    }), /LOCATION_WORKBOOK_BOUNDARY_VIOLATION/);
    assert.throws(() => resolvePrivateLocationWorkbook({}), /PRIVATE_LOCATION_SPREADSHEET_ID_MISSING/);
    assert.throws(() => resolvePrivateLocationWorkbook({
        GOOGLE_SHEET_ID: 'same', PRIVATE_LOCATION_SPREADSHEET_ID: 'same',
    }), /LOCATION_WORKBOOK_BOUNDARY_VIOLATION/);
});

test('sheet classification keeps operational sheets private', () => {
    assert.equal(classifyLocationSheet('Published_Locations'), 'public');
    assert.equal(classifyLocationSheet('Unit_Allowlist'), 'private');
    assert.equal(classifyLocationSheet('Staff_Verification_Audit'), 'private');
    assert.equal(classifyLocationSheet('Idempotency_Ledger'), 'private');
    assert.equal(classifyLocationSheet('Form Responses 7'), 'private');
    assert.equal(classifyLocationSheet('Unknown'), 'unknown');
});
