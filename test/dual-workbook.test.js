'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const pipeline = require('../setup/apps-script');
const migration = require('../scripts/migrate-location-workbooks');

test('B14 health gate blocks conflicting duplicate allowlist rows', () => {
    const result = pipeline.validateAllowlistDuplicates([
        { unit_name: 'Công an phường A', unit_code: 'CA_A', active: true, allowed_emails: 'a@example.gov.vn' },
        { unit_name: 'Công an phường A', unit_code: 'CA_OTHER', active: true, allowed_emails: 'a@example.gov.vn' },
    ]);
    assert.equal(result.ok, false);
    assert.deepEqual(result.errors, [{ code: 'ALLOWLIST_DUPLICATE_CONFLICT', unitName: 'cong an phuong a' }]);
});

test('equivalent duplicate allowlist rows warn without changing the authorization source of truth', () => {
    const result = pipeline.validateAllowlistDuplicates([
        { unit_name: 'Công an phường A', unit_code: 'CA_A', active: true, allowed_emails: 'a@example.gov.vn; b@example.gov.vn' },
        { unit_name: 'Công an phường A', unit_code: 'ca_a', active: 'true', allowed_emails: 'b@example.gov.vn, a@example.gov.vn' },
    ]);
    assert.equal(result.ok, true);
    assert.deepEqual(result.warnings, [{ code: 'ALLOWLIST_DUPLICATE_EQUIVALENT', unitName: 'cong an phuong a' }]);
});

test('dual-workbook config rejects missing, shared, and mismatched public IDs', () => {
    assert.equal(pipeline.validateDualWorkbookConfig({}, []).ok, false);
    assert.match(pipeline.validateDualWorkbookConfig({ privateSpreadsheetId: 'same', publicSpreadsheetId: 'same', googleSheetId: 'same' }).errors.join('|'), /PRIVATE_AND_PUBLIC_WORKBOOK_MUST_DIFFER/);
    assert.match(pipeline.validateDualWorkbookConfig({ privateSpreadsheetId: 'private', publicSpreadsheetId: 'public', googleSheetId: 'wrong' }).errors.join('|'), /GOOGLE_SHEET_ID_MUST_MATCH_PUBLIC_WORKBOOK/);
    assert.equal(pipeline.validateDualWorkbookConfig({ privateSpreadsheetId: 'private', publicSpreadsheetId: 'public', googleSheetId: 'public' }).ok, true);
});

test('dry-run migration separates public records from private operational sheets without writing', () => {
    const source = {
        publishedRecords: [{ record_id: 'REC_1', unit_code: 'CA_A', name: 'Trụ sở A', address: 'A', phone: '0123', coordinates: '21.3,105.4', status: 'APPROVED' }],
        allowlistRows: [{ unit_name: 'Công an phường A', unit_code: 'CA_A', active: true, allowed_emails: 'a@example.gov.vn' }],
        stagingRecords: [{ request_id: 'REQ_1', submitter_email: 'a@example.gov.vn' }],
    };
    const plan = migration.planDualWorkbookMigration(source);
    assert.equal(plan.ok, true);
    assert.equal(plan.report.publicRecordCount, 1);
    assert.equal(plan.report.privateRowCounts.Location_Staging, 1);
    assert.equal(plan.publicWorkbook.Published_Locations[0].submitter_email, undefined);
    assert.equal(plan.privateWorkbook.Location_Staging[0].submitter_email, 'a@example.gov.vn');
});

test('migration refuses to export a public record with private columns and apply requires a new explicit directory', () => {
    const invalid = migration.planDualWorkbookMigration({ publishedRecords: [{ record_id: 'REC_1', submitter_email: 'staff@example.gov.vn' }] });
    assert.equal(invalid.ok, false);
    assert.deepEqual(invalid.report.publicPrivateFieldRows, ['REC_1']);
    assert.throws(() => migration.applyDualWorkbookMigration(invalid, path.join(os.tmpdir(), 'bandocapt-invalid-migration')), /MIGRATION_VALIDATION_FAILED/);

    const valid = migration.planDualWorkbookMigration({ publishedRecords: [] });
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bandocapt-migration-'));
    fs.rmdirSync(outputDir);
    migration.applyDualWorkbookMigration(valid, outputDir);
    assert.equal(fs.existsSync(path.join(outputDir, 'public-workbook.json')), true);
    fs.rmSync(outputDir, { recursive: true, force: true });
});
