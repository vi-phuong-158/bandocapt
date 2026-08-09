'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = `${fs.readFileSync(path.join(root, 'setup', 'apps-script.js'), 'utf8')}\n${fs.readFileSync(path.join(root, 'setup', 'location-intake', 'Code.gs'), 'utf8')}`;
const secret = 'gateway-runtime-test-secret';
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const hmac = value => crypto.createHmac('sha256', secret).update(value).digest('hex');

class FakeRange {
    constructor(sheet, row, column, rows, columns) { Object.assign(this, { sheet, row, column, rows, columns }); }
    getValues() { return Array.from({ length: this.rows }, (_, r) => Array.from({ length: this.columns }, (_, c) => (this.sheet.values[this.row - 1 + r] || [])[this.column - 1 + c] ?? '')); }
    getDisplayValues() { return this.getValues().map(row => row.map(value => String(value ?? ''))); }
    setValues(values) {
        if (this.sheet.failWrites > 0) { this.sheet.failWrites -= 1; throw new Error('SHEET_WRITE_FAILED'); }
        values.forEach((row, r) => row.forEach((value, c) => {
            const rowIndex = this.row - 1 + r;
            const columnIndex = this.column - 1 + c;
            if (!this.sheet.values[rowIndex]) this.sheet.values[rowIndex] = [];
            this.sheet.values[rowIndex][columnIndex] = value;
        }));
        return this;
    }
    setFontWeight() { return this; }
    setBackground() { return this; }
    setFontColor() { return this; }
}

class FakeSheet {
    constructor(headers, rows = []) { this.values = [headers, ...rows.map(row => headers.map(header => row[header] ?? ''))]; this.failWrites = 0; }
    getLastRow() { return this.values.length; }
    getLastColumn() { return Math.max(...this.values.map(row => row.length), 0); }
    getRange(row, column, rows = 1, columns = 1) { return new FakeRange(this, row, column, rows, columns); }
    clearContents() { this.values = []; }
}

class FakeFile {
    constructor(id, blob) { this.id = id; this.name = blob.name; this.mimeType = blob.mimeType; this.throwIdOnce = false; this.trashed = false; }
    getId() { if (this.throwIdOnce) { this.throwIdOnce = false; throw new Error('CRASH_AFTER_CREATE'); } return this.id; }
    getName() { return this.name; }
    getMimeType() { return this.mimeType; }
    getUrl() { return `https://drive.test/${this.id}`; }
    setTrashed(value) { this.trashed = value; }
}

class FakeFolder {
    constructor() { this.files = []; this.createCount = 0; this.crashAfterCreate = false; this.onCreate = null; }
    createFile(blob) {
        const file = new FakeFile(`file-${++this.createCount}`, blob);
        if (this.crashAfterCreate) { this.crashAfterCreate = false; file.throwIdOnce = true; }
        this.files.push(file);
        if (this.onCreate) this.onCreate();
        return file;
    }
    getFiles() {
        const files = this.files.filter(file => !file.trashed);
        let index = 0;
        return { hasNext: () => index < files.length, next: () => files[index++] };
    }
}

class FakeLock {
    constructor() { this.locked = false; this.waitCalls = 0; this.queue = []; }
    waitLock() { assert.equal(this.locked, false, 'the fake lock must serialize state-changing calls'); this.locked = true; this.waitCalls += 1; }
    releaseLock() { this.locked = false; const next = this.queue.shift(); if (next) next(); }
    enqueue(callback) { this.queue.push(callback); }
}

function setupRuntime() {
    const headers = {
        allowlist: ['unit_code', 'unit_name', 'allowed_emails', 'active', 'notes'],
        staging: ['record_id', 'request_id', 'request_type', 'target_record_id', 'unit_code', 'unit_name', 'location_name', 'type', 'site_type', 'services', 'address', 'public_phone', 'maps_url_original', 'maps_url_resolved', 'coordinates', 'coordinate_status', 'image_file_id', 'image_drive_url', 'image_public_url', 'image_mime_type', 'cccd_service_mode', 'service_schedule', 'served_units', 'search_aliases', 'submitter_name', 'submitter_phone', 'submitter_email', 'auth_status', 'validation_errors', 'warnings', 'status', 'review_action', 'review_note', 'reviewed_by', 'reviewed_at', 'submitted_at', 'updated_at', 'published_image_file_id'],
        audit: ['timestamp', 'action', 'record_id', 'request_id', 'unit_code', 'actor_email', 'submitter_email', 'previous_status', 'next_status', 'note', 'snapshot_json'],
        verification: ['verification_id', 'request_id', 'record_id', 'unit_code', 'staff_email', 'verified_at', 'snapshot_hash', 'source', 'note'],
        idempotency: ['action', 'request_id', 'body_hash', 'status', 'image_resource_key', 'image_file_id', 'staging_ref', 'record_id', 'last_error', 'updated_at'],
        published: ['record_id', 'unit_code', 'name', 'type', 'address', 'phone', 'coordinates', 'image_url', 'search_aliases', 'updated_at', 'site_type', 'services', 'google_maps_url', 'cccd_service_mode', 'service_schedule', 'served_units', 'status', 'verified_at'],
    };
    const privateSheets = {
        Unit_Allowlist: new FakeSheet(headers.allowlist, [{ unit_code: 'UNIT_A', unit_name: 'Unit A', allowed_emails: 'staff@example.gov.vn', active: true }]),
        Location_Staging: new FakeSheet(headers.staging), Approval_Audit_Log: new FakeSheet(headers.audit),
        Staff_Verification_Audit: new FakeSheet(headers.verification), Idempotency_Ledger: new FakeSheet(headers.idempotency),
    };
    const publishedRecord = { record_id: 'REC_1', unit_code: 'UNIT_A', name: 'Trụ sở A', type: 'police_station', address: 'A', phone: '0123', coordinates: '21.3,105.4', image_url: '', search_aliases: '', updated_at: '2026-08-09T00:00:00.000Z', site_type: 'HEADQUARTERS', services: 'POLICE_OFFICE', google_maps_url: 'https://www.google.com/maps/@21.3,105.4,17z', cccd_service_mode: 'PERMANENT', service_schedule: '', served_units: '', status: 'published', verified_at: '2026-08-09T00:00:00.000Z' };
    const publicSheets = { Published_Locations: new FakeSheet(headers.published, [publishedRecord]) };
    const folder = new FakeFolder();
    const lock = new FakeLock();
    const context = {
        console,
        globalThis: null,
        PropertiesService: { getScriptProperties: () => ({ getProperty: name => ({ PRIVATE_LOCATION_SPREADSHEET_ID: 'private', PUBLIC_LOCATION_SPREADSHEET_ID: 'public', DESTINATION_FOLDER_ID: 'folder', LOCATION_GATEWAY_SECRET: secret })[name] || '' }) },
        SpreadsheetApp: { openById: id => ({ getSheetByName: name => (id === 'private' ? privateSheets : publicSheets)[name] || null }) },
        DriveApp: { getFolderById: () => folder, getFileById: id => { const file = folder.files.find(item => item.id === id && !item.trashed); if (!file) throw new Error('FILE_NOT_FOUND'); return file; } },
        LockService: { getScriptLock: () => lock },
        Utilities: {
            Charset: { UTF_8: 'UTF_8' }, DigestAlgorithm: { SHA_256: 'SHA_256' },
            computeDigest: (_, value) => Array.from(crypto.createHash('sha256').update(value).digest(), byte => byte > 127 ? byte - 256 : byte),
            computeHmacSha256Signature: (value, key) => Array.from(crypto.createHmac('sha256', key).update(value).digest(), byte => byte > 127 ? byte - 256 : byte),
            base64Decode: value => Array.from(Buffer.from(value, 'base64')),
            newBlob: (bytes, mimeType, name) => ({ bytes, mimeType, name }), getUuid: () => '00000000-0000-4000-8000-000000000001',
        },
        ContentService: { MimeType: { JSON: 'JSON' }, createTextOutput: text => ({ text, setMimeType() { return this; } }) },
    };
    context.globalThis = context;
    vm.runInNewContext(source, context, { filename: 'gateway-runtime.gs' });
    return { context, folder, lock, privateSheets, publicSheets, publishedRecord };
}

function callGateway(runtime, action, body, timestamp = Math.floor(Date.now() / 1000)) {
    const rawBody = JSON.stringify(body);
    const signature = hmac(`POST\n${action}\n${timestamp}\n${sha256(rawBody)}`);
    return JSON.parse(runtime.context.doPost({ parameter: { action, timestamp: String(timestamp), signature }, postData: { contents: rawBody } }).text);
}

function createBody(requestId) {
    return { requestId, staffEmail: 'staff@example.gov.vn', image: { mimeType: 'image/png', base64: Buffer.from('image').toString('base64') }, submission: { requestType: 'Thêm địa điểm mới', unitName: 'Unit A', locationName: 'Trụ sở mới', siteType: 'HEADQUARTERS', address: 'A', mapsUrlOriginal: 'https://www.google.com/maps/@21.3,105.4,17z', services: ['POLICE_OFFICE'], cccdServiceMode: 'PERMANENT' } };
}

function records(runtime, sheetName) { return runtime.context.readLocationObjects_(runtime.privateSheets[sheetName]); }

test('M58-M63 executes doPost and rejects altered, stale, future, or unsigned envelopes before side effects', () => {
    const runtime = setupRuntime();
    assert.deepEqual(callGateway(runtime, 'resolveUnits', { email: 'staff@example.gov.vn' }).authorizedUnits, [{ unitCode: 'UNIT_A', unitName: 'Unit A' }]);
    const body = JSON.stringify({ email: 'staff@example.gov.vn' });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = hmac(`POST\nresolveUnits\n${timestamp}\n${sha256(body)}`);
    const invoke = event => JSON.parse(runtime.context.doPost(event).text);
    assert.equal(invoke({ parameter: { action: 'resolveUnits', timestamp: String(timestamp), signature }, postData: { contents: `${body} ` } }).error, 'GATEWAY_SIGNATURE_INVALID');
    assert.equal(callGateway(runtime, 'resolveUnits', { email: 'staff@example.gov.vn' }, timestamp - 301).error, 'GATEWAY_TIMESTAMP_OUT_OF_WINDOW');
    assert.equal(callGateway(runtime, 'resolveUnits', { email: 'staff@example.gov.vn' }, timestamp + 301).error, 'GATEWAY_TIMESTAMP_OUT_OF_WINDOW');
    assert.equal(invoke({ parameter: { action: 'resolveUnits', timestamp: String(timestamp), signature: '' }, postData: { contents: body } }).error, 'GATEWAY_SIGNATURE_INVALID');
    assert.equal(records(runtime, 'Location_Staging').length, 0);
});

test('M83-M85 executes replay-safe staging, Drive upload, and verification side effects through doPost', () => {
    const runtime = setupRuntime();
    const body = createBody('submit-request-0001');
    assert.equal(callGateway(runtime, 'submitRequest', body).status, 'PROCESSED');
    assert.equal(callGateway(runtime, 'submitRequest', body).status, 'ALREADY_PROCESSED');
    assert.equal(records(runtime, 'Location_Staging').length, 1);
    assert.equal(runtime.folder.createCount, 1);
    const snapshotHash = sha256(runtime.context.LocationApprovalPipeline.canonicalJson(runtime.publishedRecord));
    const verification = { requestId: 'verify-request-0001', staffEmail: 'staff@example.gov.vn', recordId: 'REC_1', snapshotHash };
    assert.equal(callGateway(runtime, 'writeVerificationEvent', verification).status, 'PROCESSED');
    assert.equal(callGateway(runtime, 'writeVerificationEvent', verification).status, 'ALREADY_PROCESSED');
    assert.equal(records(runtime, 'Staff_Verification_Audit').length, 1);
});

test('M87 simulates a second request arriving during the first locked upload and serializes it to one side effect', () => {
    const runtime = setupRuntime();
    const body = createBody('race-request-00001');
    let second;
    runtime.folder.onCreate = () => runtime.lock.enqueue(() => { second = callGateway(runtime, 'submitRequest', body); });
    const first = callGateway(runtime, 'submitRequest', body);
    assert.equal(first.status, 'PROCESSED');
    assert.equal(second.status, 'ALREADY_PROCESSED');
    assert.equal(runtime.lock.waitCalls, 2);
    assert.equal(runtime.folder.createCount, 1);
    assert.equal(records(runtime, 'Location_Staging').length, 1);
});

test('M88 rejects a reused requestId with a different payload through doPost without another side effect', () => {
    const runtime = setupRuntime();
    const body = createBody('payload-drift-request-1');
    assert.equal(callGateway(runtime, 'submitRequest', body).status, 'PROCESSED');
    const changedBody = JSON.parse(JSON.stringify(body));
    changedBody.submission.locationName = 'Trụ sở đã bị sửa';
    assert.equal(callGateway(runtime, 'submitRequest', changedBody).error, 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD');
    assert.equal(runtime.folder.createCount, 1);
    assert.equal(records(runtime, 'Location_Staging').length, 1);
});

test('M89 simulates a crash after Drive createFile before pointer persistence and retries without a second file or staging row', () => {
    const runtime = setupRuntime();
    const body = createBody('crash-request-0001');
    runtime.folder.crashAfterCreate = true;
    assert.equal(callGateway(runtime, 'submitRequest', body).error, 'GATEWAY_INTERNAL_ERROR');
    assert.equal(runtime.folder.createCount, 1);
    assert.equal(records(runtime, 'Idempotency_Ledger')[0].status, 'CLAIMED');
    assert.equal(callGateway(runtime, 'submitRequest', body).status, 'PROCESSED');
    assert.equal(runtime.folder.createCount, 1);
    assert.equal(records(runtime, 'Location_Staging').length, 1);
    assert.equal(records(runtime, 'Idempotency_Ledger')[0].status, 'DONE');
});

test('audit failure is best-effort: the completed staging request returns success and records the audit error', () => {
    const runtime = setupRuntime();
    runtime.privateSheets.Approval_Audit_Log.failWrites = 1;
    assert.equal(callGateway(runtime, 'submitRequest', createBody('audit-request-0001')).status, 'PROCESSED');
    const ledger = records(runtime, 'Idempotency_Ledger')[0];
    assert.equal(ledger.status, 'DONE');
    assert.equal(ledger.last_error, 'AUDIT_APPEND_FAILED');
});
