'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const pipeline = require('../setup/apps-script');
const migration = require('../scripts/migrate-location-workbooks');
const { resolvePublicSpreadsheetId } = require('../lib/location-workbook-config');

test('public workbook config keeps GOOGLE_SHEET_ID as a compatible alias and fails closed on drift', () => {
    assert.equal(resolvePublicSpreadsheetId({ GOOGLE_SHEET_ID: 'public' }), 'public');
    assert.equal(resolvePublicSpreadsheetId({ PUBLIC_LOCATION_SPREADSHEET_ID: 'public' }), 'public');
    assert.equal(resolvePublicSpreadsheetId({ PUBLIC_LOCATION_SPREADSHEET_ID: 'public', GOOGLE_SHEET_ID: 'public' }), 'public');
    assert.throws(() => resolvePublicSpreadsheetId({ PUBLIC_LOCATION_SPREADSHEET_ID: 'private', GOOGLE_SHEET_ID: 'public' }), /PUBLIC_LOCATION_SPREADSHEET_ID_MISMATCH/);
});

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

test('health gate fails closed when a required private or public sheet is missing', () => {
    const complete = pipeline.validateRequiredWorkbookSheets({
        privateSheetNames: pipeline.PRIVATE_SHEET_KEYS.map(key => pipeline.SHEETS[key]),
        publicSheetNames: pipeline.PUBLIC_SHEET_KEYS.map(key => pipeline.SHEETS[key]),
    });
    assert.equal(complete.ok, true);

    const missing = pipeline.validateRequiredWorkbookSheets({
        privateSheetNames: pipeline.PRIVATE_SHEET_KEYS.filter(key => key !== 'staging').map(key => pipeline.SHEETS[key]),
        publicSheetNames: [],
    });
    assert.equal(missing.ok, false);
    assert.deepEqual(missing.errors, [
        'REQUIRED_PRIVATE_SHEET_MISSING:Location_Staging',
        'REQUIRED_PUBLIC_SHEET_MISSING:Published_Locations',
    ]);
});

test('health gate accepts only link-view access for the public workbook', () => {
    assert.equal(pipeline.isPublicWorkbookLinkView('ANYONE_WITH_LINK', 'VIEW'), true);
    assert.equal(pipeline.isPublicWorkbookLinkView('ANYONE_WITH_LINK', 'EDIT'), false);
    assert.equal(pipeline.isPublicWorkbookLinkView('PRIVATE', 'VIEW'), false);
});

const sha256Hex = value => crypto.createHash('sha256').update(value).digest('hex');
const hmacSha256Hex = (value, secret) => crypto.createHmac('sha256', secret).update(value).digest('hex');

test('M58-M63 gateway HMAC binds the raw body and fails closed for invalid envelope inputs', () => {
    const action = 'submitRequest';
    const timestamp = '1765700000';
    const secret = 'test-gateway-secret';
    const rawBody = '{"requestId":"request-id-123456","submission":{}}';
    const signature = hmacSha256Hex(pipeline.buildGatewayCanonical(action, timestamp, sha256Hex(rawBody)), secret);
    const valid = pipeline.validateGatewayEnvelope({ action, timestamp, signature, rawBody, secret, nowSeconds: 1765700000, sha256Hex, hmacSha256Hex });
    assert.equal(valid.ok, true);
    assert.equal(valid.bodyHash, sha256Hex(rawBody));
    assert.equal(pipeline.validateGatewayEnvelope({ action, timestamp, signature: '0'.repeat(64), rawBody, secret, nowSeconds: 1765700000, sha256Hex, hmacSha256Hex }).error, 'GATEWAY_SIGNATURE_INVALID');
    assert.equal(pipeline.validateGatewayEnvelope({ action, timestamp, signature, rawBody: `${rawBody} `, secret, nowSeconds: 1765700000, sha256Hex, hmacSha256Hex }).error, 'GATEWAY_SIGNATURE_INVALID');
    assert.equal(pipeline.validateGatewayEnvelope({ action, timestamp: '1765699699', signature, rawBody, secret, nowSeconds: 1765700000, sha256Hex, hmacSha256Hex }).error, 'GATEWAY_TIMESTAMP_OUT_OF_WINDOW');
    assert.equal(pipeline.validateGatewayEnvelope({ action, timestamp: '1765700301', signature, rawBody, secret, nowSeconds: 1765700000, sha256Hex, hmacSha256Hex }).error, 'GATEWAY_TIMESTAMP_OUT_OF_WINDOW');
    assert.equal(pipeline.validateGatewayEnvelope({ action, timestamp, signature: '', rawBody, secret, nowSeconds: 1765700000, sha256Hex, hmacSha256Hex }).error, 'GATEWAY_SIGNATURE_INVALID');
});

test('M83-M88 ledger claim is atomic-ready, replay-safe, and rejects payload drift', () => {
    const requestId = 'request-id-123456';
    const claimed = pipeline.claimGatewayIdempotency([], { action: 'submitRequest', requestId, bodyHash: 'hash-a', now: '2026-08-09T00:00:00.000Z' });
    assert.equal(claimed.status, 'CLAIMED');
    assert.deepEqual(claimed.record, {
        action: 'submitRequest', request_id: requestId, body_hash: 'hash-a', status: 'CLAIMED',
        image_resource_key: 'staff-request-request-id-123456', image_file_id: '', staging_ref: '', record_id: '', last_error: '', updated_at: '2026-08-09T00:00:00.000Z',
    });
    claimed.records[0].status = 'DONE';
    assert.equal(pipeline.claimGatewayIdempotency(claimed.records, { action: 'submitRequest', requestId, bodyHash: 'hash-a' }).status, 'ALREADY_PROCESSED');
    assert.equal(pipeline.claimGatewayIdempotency(claimed.records, { action: 'submitRequest', requestId, bodyHash: 'hash-b' }).error, 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD');
});

test('M89 ledger recovery retains the deterministic Drive resource pointer after an interrupted upload', () => {
    const recovered = pipeline.claimGatewayIdempotency([{
        action: 'submitRequest', request_id: 'request-id-123456', body_hash: 'hash-a', status: 'UPLOAD_PERSISTED',
        image_resource_key: 'staff-request-request-id-123456', image_file_id: 'drive-file-1', staging_ref: '', record_id: '', last_error: '', updated_at: '2026-08-09T00:00:00.000Z',
    }], { action: 'submitRequest', requestId: 'request-id-123456', bodyHash: 'hash-a' });
    assert.equal(recovered.status, 'RECOVER');
    assert.equal(recovered.record.image_resource_key, 'staff-request-request-id-123456');
    assert.equal(recovered.record.image_file_id, 'drive-file-1');
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
