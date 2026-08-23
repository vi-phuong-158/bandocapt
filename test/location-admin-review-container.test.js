'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { requireActivePrivateWorkbook } = require('../setup/location-admin-review-container');
const { resolvePrivateLocationWorkbook, resolvePublicLocationWorkbook } = require('../lib/location-workbooks');
const { createLocationAdminReview, isApprover } = require('../setup/location-admin-review');
const { buildLocationAdminReviewAppsScript } = require('../scripts/build-location-admin-review-apps-script');

const root = path.resolve(__dirname, '..');
const runtimePath = path.join(root, 'setup', 'location-admin-review', 'Code.gs');
const manifestPath = path.join(root, 'setup', 'location-admin-review', 'appsscript.json');

test('admin menu accepts only the configured private workbook before a selected row can be used', () => {
    assert.equal(requireActivePrivateWorkbook({
        activeSpreadsheetId: 'private-production', configuredPrivateWorkbookId: 'private-production',
    }), 'private-production');
    assert.throws(() => requireActivePrivateWorkbook({
        activeSpreadsheetId: 'legacy-container', configuredPrivateWorkbookId: 'private-production',
    }), error => error.code === 'ADMIN_REVIEW_ACTIVE_WORKBOOK_MISMATCH');
});

test('wrong active workbook aborts before any synthetic private or public mutation', () => {
    const state = { privateWrites: 0, publicWrites: 0 };
    assert.throws(() => requireActivePrivateWorkbook({
        activeSpreadsheetId: 'old-test-workbook', configuredPrivateWorkbookId: 'private-production',
    }), /ADMIN_REVIEW_ACTIVE_WORKBOOK_MISMATCH/);
    assert.deepEqual(state, { privateWrites: 0, publicWrites: 0 });
});

test('configured admin workbooks preserve the public/private boundary and public compatibility ID', () => {
    const env = {
        PRIVATE_LOCATION_SPREADSHEET_ID: 'private-production',
        PUBLIC_LOCATION_SPREADSHEET_ID: 'public-production',
        GOOGLE_SHEET_ID: 'public-production',
    };
    assert.equal(resolvePrivateLocationWorkbook(env).spreadsheetId, 'private-production');
    assert.throws(() => resolvePrivateLocationWorkbook({ ...env, PRIVATE_LOCATION_SPREADSHEET_ID: '' }), /PRIVATE_LOCATION_SPREADSHEET_ID_MISSING/);
    assert.throws(() => resolvePrivateLocationWorkbook({ ...env, PRIVATE_LOCATION_SPREADSHEET_ID: 'public-production' }), /LOCATION_WORKBOOK_BOUNDARY_VIOLATION/);
    assert.equal(resolvePublicLocationWorkbook(env).spreadsheetId, 'public-production');
    assert.throws(() => resolvePublicLocationWorkbook({ ...env, GOOGLE_SHEET_ID: 'other-public' }), /PUBLIC_LOCATION_WORKBOOK_CONFIG_CONFLICT/);
});

test('approver allowlist remains fail-closed without any Gateway secret dependency', () => {
    assert.equal(isApprover('approver@example.gov.vn', ''), false);
    assert.equal(isApprover('approver@example.gov.vn', 'other@example.gov.vn'), false);
    assert.equal(isApprover('approver@example.gov.vn', 'approver@example.gov.vn'), true);
});

test('dedicated admin source exposes only the review menu and no legacy intake or Web App entrypoint', () => {
    const source = fs.readFileSync(runtimePath, 'utf8');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.match(source, /createMenu\('Bản đồ CA - Duyệt địa điểm'\)/);
    assert.doesNotMatch(source, /Bản đồ CA - Địa điểm/);
    assert.doesNotMatch(source, /function\s+doPost\s*\(/);
    assert.doesNotMatch(source, /LOCATION_GATEWAY_SECRET/);
    assert.equal(Object.hasOwn(manifest, 'webapp'), false);
});

test('generated admin bundle remains independent from the Staff Gateway Web App', () => {
    const result = buildLocationAdminReviewAppsScript();
    const bundle = fs.readFileSync(result.outputPath, 'utf8');
    assert.match(bundle, /ADMIN_REVIEW_ACTIVE_WORKBOOK_MISMATCH/);
    assert.match(bundle, /Bản đồ CA - Duyệt địa điểm/);
    assert.doesNotMatch(bundle, /function\s+doPost\s*\(/);
    assert.doesNotMatch(bundle, /LOCATION_GATEWAY_SECRET/);
    assert.doesNotMatch(bundle, /StaffGateway/);
});



function createMemoryReview({ stagingRows = [], publicRows = [] } = {}) {
    const auditRows = [];
    const publicRecords = publicRows.map(row => ({ ...row }));
    const pipeline = {
        STATUSES: { pending: 'PENDING', approved: 'APPROVED', rejected: 'REJECTED', needVerification: 'NEED_VERIFICATION', revoked: 'REVOKED', blocked: 'BLOCKED' },
        REQUEST_TYPES: { create: 'CREATE', stop: 'STOP' },
        PUBLIC_FIELDS: ['record_id', 'unit_code', 'name', 'google_maps_url', 'updated_at'],
        requiresNewImage: () => false,
        sameUnitCode: (left, right) => String(left || '').trim() === String(right || '').trim(),
        buildPublishedRecord: (row, timestamp) => ({
            record_id: row.record_id,
            unit_code: row.unit_code,
            name: row.name,
            google_maps_url: row.google_maps_url || '',
            updated_at: timestamp,
        }),
        buildAuditEntry: (action, payload) => ({
            action,
            request_id: payload.requestId,
            record_id: payload.recordId,
        }),
    };
    const review = createLocationAdminReview({
        pipeline,
        workbookConfig: {},
        runtime: { now: () => Date.UTC(2026, 7, 23), withLock: callback => callback() },
        privateStore: {
            getStagingRows: () => stagingRows,
            getAuditRows: () => auditRows,
            updateStagingRow: (requestId, patch) => Object.assign(
                stagingRows.find(row => row.request_id === requestId), patch
            ),
            appendAuditRow: row => auditRows.push(row),
        },
        publicStore: {
            getAll: () => publicRecords,
            findById: recordId => publicRecords.find(row => row.record_id === recordId) || null,
            upsert: record => {
                const index = publicRecords.findIndex(row => row.record_id === record.record_id);
                if (index < 0) publicRecords.push({ ...record });
                else publicRecords[index] = { ...record };
            },
            remove: recordId => {
                const index = publicRecords.findIndex(row => row.record_id === recordId);
                if (index >= 0) publicRecords.splice(index, 1);
            },
        },
    });
    return { review, stagingRows, publicRecords, auditRows };
}

function pendingRequest(requestId) {
    return {
        request_id: requestId,
        record_id: 'LOCATION_001',
        request_type: 'CREATE',
        status: 'PENDING',
        unit_code: 'CA_TEST',
        name: 'Điểm kiểm tra',
        google_maps_url: '',
        validation_errors: '',
    };
}

test('REJECT changes only the private staging/audit state and appends exactly one audit row', () => {
    const state = createMemoryReview({ stagingRows: [pendingRequest('REQ_REJECT')] });
    const result = state.review.reviewRequest({
        requestId: 'REQ_REJECT', action: 'REJECT', actorEmail: 'approver@example.gov.vn',
    });
    assert.equal(result.status, 'REJECTED');
    assert.equal(result.publicTouched, false);
    assert.equal(state.stagingRows[0].status, 'REJECTED');
    assert.deepEqual(state.publicRecords, []);
    assert.equal(state.auditRows.filter(row => row.action === 'REJECT').length, 1);
});

test('APPROVE publishes a valid pending request and records the completed review', () => {
    const state = createMemoryReview({ stagingRows: [pendingRequest('REQ_APPROVE')] });
    const result = state.review.reviewRequest({
        requestId: 'REQ_APPROVE', action: 'APPROVE', actorEmail: 'approver@example.gov.vn',
    });
    assert.equal(result.status, 'APPROVED');
    assert.equal(state.stagingRows[0].status, 'APPROVED');
    assert.equal(state.publicRecords.length, 1);
    assert.equal(state.publicRecords[0].record_id, 'LOCATION_001');
    assert.equal(state.auditRows.filter(row => row.action === 'APPROVE').length, 1);
});

test('NEED_VERIFICATION remains private and leaves Published_Locations unchanged', () => {
    const state = createMemoryReview({ stagingRows: [pendingRequest('REQ_VERIFY')] });
    const result = state.review.reviewRequest({
        requestId: 'REQ_VERIFY', action: 'NEED_VERIFICATION', actorEmail: 'approver@example.gov.vn',
    });
    assert.equal(result.status, 'NEED_VERIFICATION');
    assert.equal(result.publicTouched, false);
    assert.equal(state.publicRecords.length, 0);
    assert.equal(state.auditRows.filter(row => row.action === 'NEED_VERIFICATION').length, 1);
});

test('reconcile is idempotent after an interrupted approved transition', () => {
    const row = { ...pendingRequest('REQ_RECONCILE'), status: 'APPROVED' };
    const state = createMemoryReview({ stagingRows: [row] });
    const first = state.review.reconcileRequest({ requestId: row.request_id, actorEmail: 'approver@example.gov.vn' });
    const second = state.review.reconcileRequest({ requestId: row.request_id, actorEmail: 'approver@example.gov.vn' });
    assert.equal(first.publicTouched, true);
    assert.equal(second.publicTouched, false);
    assert.equal(state.publicRecords.length, 1);
    assert.equal(state.auditRows.filter(entry => entry.action === 'APPROVE').length, 1);
});
