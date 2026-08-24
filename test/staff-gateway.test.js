const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const pipeline = require('../setup/apps-script');
const workbookConfig = require('../lib/location-workbooks');
const operationalBaseline = require('../lib/operational-baseline');
const createStaffGateway = require('../setup/staff-gateway');

const SECRET = 'synthetic-gateway-secret';
const NOW = 1_786_320_000_000;
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]).toString('base64');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');
const WEBP = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]).toString('base64');

function sign(rawBody, timestamp = NOW, secret = SECRET) {
    return crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function allowlist() {
    return [
        { unit_code: 'CA_A', unit_name: 'Công an phường A', allowed_emails: 'canbo@example.gov.vn', active: true, notes: 'private' },
        { unit_code: 'CA_B', unit_name: 'Công an phường B', allowed_emails: 'other@example.gov.vn', active: true },
    ];
}

function basePayload(overrides = {}) {
    return {
        email: 'canbo@example.gov.vn',
        unit_code: 'CA_A',
        request_type: pipeline.REQUEST_TYPES.create,
        location_name: 'Điểm tiếp dân A',
        address: 'Địa chỉ A',
        coordinates: '21.3225,105.4027',
        services: ['POLICE_OFFICE'],
        image: { base64: JPEG, mimeType: 'image/png', filename: 'fake.png', size: 5 },
        ...overrides,
    };
}

function makeStore(options = {}) {
    const ledgers = new Map();
    const staging = (options.stagingRows || []).map(row => ({ ...row }));
    const approvalAudit = [];
    const verificationAudit = [];
    const files = new Map();
    let imageCreates = 0;
    let failUploadPersist = false;
    return {
        getRows: sheet => sheet === 'Unit_Allowlist' ? allowlist() : (sheet === 'Location_Staging' ? staging.map(row => ({ ...row })) : []),
        getOperationalRecords: () => {
            if (options.operationalRecordsError) throw new Error(options.operationalRecordsError);
            return options.operationalRecords || [];
        },
        findLedger: requestId => ledgers.get(requestId) || null,
        createLedger: row => ledgers.set(row.request_id, { ...row }),
        updateLedger: (requestId, patch) => {
            if (failUploadPersist && patch.state === 'UPLOAD_PERSISTED') {
                failUploadPersist = false;
                throw new Error('simulated crash after Drive create');
            }
            const current = ledgers.get(requestId);
            if (!current) throw new Error('ledger missing');
            const merged = { ...current, ...patch };
            ledgers.set(requestId, merged);
            return merged;
        },
        findStagingByRequestId: requestId => staging.find(row => row.request_id === requestId) || null,
        appendStaging: row => staging.push({ ...row }),
        hasApprovalAudit: requestId => approvalAudit.some(row => row.request_id === requestId),
        appendApprovalAudit: row => {
            if (options.failApprovalAudit) throw new Error('audit unavailable');
            approvalAudit.push({ ...row });
        },
        findVerificationEvent: operationId => verificationAudit.find(row => row.operation_id === operationId) || null,
        appendVerificationAudit: row => verificationAudit.push({ ...row }),
        findDriveResource: key => files.get(key) || null,
        createPrivateImage: ({ resourceKey, mimeType }) => {
            imageCreates += 1;
            const file = { fileId: `file-${imageCreates}`, driveUrl: `https://drive.invalid/${imageCreates}`, mimeType };
            files.set(resourceKey, file);
            return file;
        },
        setFailUploadPersist: () => { failUploadPersist = true; },
        counts: () => ({ ledgers: ledgers.size, staging: staging.length, approvalAudit: approvalAudit.length, verificationAudit: verificationAudit.length, imageCreates }),
        rows: () => ({ ledgers: [...ledgers.values()], staging, approvalAudit, verificationAudit, files }),
    };
}

function makeGateway(store, env = { PRIVATE_LOCATION_SPREADSHEET_ID: 'private-test', PUBLIC_LOCATION_SPREADSHEET_ID: 'public-test' }, now = NOW, secret = SECRET) {
    return createStaffGateway({
        pipeline,
        workbookConfig,
        store,
        runtime: {
            env,
            secret,
            now: () => now,
            decodeBase64: value => Buffer.from(value, 'base64'),
            sha256Hex: value => sha256(value),
            hmacSha256Hex: (message, secret) => crypto.createHmac('sha256', secret).update(message).digest('hex'),
            withLock: callback => callback(),
        },
    });
}

function rawRequest(action, requestId, payload, timestamp = NOW) {
    const raw = JSON.stringify({ action, request_id: requestId, payload });
    return { raw, metadata: { timestamp: String(timestamp), signature: sign(raw, timestamp) } };
}

test('HMAC is over exact raw body before JSON parsing and rejects missing/tampered/stale/future requests', () => {
    const gateway = makeGateway(makeStore());
    const request = rawRequest('resolveUnits', 'READ_1', { email: 'canbo@example.gov.vn' });
    assert.deepEqual(gateway.handleRawRequest(request.raw, request.metadata), { units: [{ unitCode: 'CA_A', unitName: 'Công an phường A' }] });
    assert.throws(() => gateway.handleRawRequest(`${request.raw} `, request.metadata), /REQUEST_SIGNATURE_INVALID/);
    assert.throws(() => gateway.handleRawRequest(request.raw, { timestamp: String(NOW), signature: '' }), /REQUEST_SIGNATURE_INVALID/);
    assert.throws(() => gateway.handleRawRequest(request.raw, { timestamp: String(NOW - 300001), signature: sign(request.raw, NOW - 300001) }), /REQUEST_TIMESTAMP_STALE/);
    assert.throws(() => gateway.handleRawRequest(request.raw, { timestamp: String(NOW + 300001), signature: sign(request.raw, NOW + 300001) }), /REQUEST_TIMESTAMP_FUTURE/);
    assert.throws(() => gateway.handleRawRequest('{"action":', { timestamp: String(NOW), signature: sign('{"action":', NOW) }), /REQUEST_JSON_INVALID/);
    assert.throws(() => gateway.handleRawRequest(request.raw, { timestamp: 'not-a-timestamp', signature: sign(request.raw, NOW) }), /REQUEST_TIMESTAMP_INVALID/);
    const wrongSecret = rawRequest('resolveUnits', 'READ_WRONG_SECRET', { email: 'canbo@example.gov.vn' });
    assert.throws(() => gateway.handleRawRequest(wrongSecret.raw, { timestamp: String(NOW), signature: sign(wrongSecret.raw, NOW, 'wrong-secret') }), /REQUEST_SIGNATURE_INVALID/);
    const missingSecret = makeGateway(makeStore(), { PRIVATE_LOCATION_SPREADSHEET_ID: 'private', PUBLIC_LOCATION_SPREADSHEET_ID: 'public' }, NOW, '');
    assert.throws(() => missingSecret.handleRawRequest(request.raw, request.metadata), /GATEWAY_SECRET_MISSING/);
    assert.equal(createStaffGateway.constantTimeEqual('aa', 'aa'), true);
    assert.equal(createStaffGateway.constantTimeEqual('aa', 'ab'), false);
    assert.equal(createStaffGateway.constantTimeEqual('aa', 'a'), false);
});

test('action allowlist and private workbook config fail closed', () => {
    const gateway = makeGateway(makeStore());
    for (const action of ['', 'deleteAll', 'resolve_units']) {
        const request = rawRequest(action, 'X', {});
        assert.throws(() => gateway.handleRawRequest(request.raw, request.metadata), /UNKNOWN_ACTION/);
    }
    const mismatched = JSON.stringify({ action: 'submitRequest', request_id: 'REQ_ENVELOPE', payload: { ...basePayload(), request_id: 'REQ_PAYLOAD' } });
    assert.throws(() => gateway.handleRawRequest(mismatched, { timestamp: String(NOW), signature: sign(mismatched) }), /REQUEST_ID_MISMATCH/);
    assert.throws(() => makeGateway(makeStore(), {}).resolveUnits({ email: 'canbo@example.gov.vn' }), /PRIVATE_LOCATION_SPREADSHEET_ID_MISSING/);
    assert.throws(() => makeGateway(makeStore(), { PRIVATE_LOCATION_SPREADSHEET_ID: 'same', PUBLIC_LOCATION_SPREADSHEET_ID: 'same' }).resolveUnits({ email: 'canbo@example.gov.vn' }), /LOCATION_WORKBOOK_BOUNDARY_VIOLATION/);
    assert.throws(() => makeGateway(makeStore(), { PRIVATE_LOCATION_SPREADSHEET_ID: 'private', PUBLIC_LOCATION_SPREADSHEET_ID: 'public', GOOGLE_SHEET_ID: 'legacy' }).resolveUnits({ email: 'canbo@example.gov.vn' }), /PUBLIC_LOCATION_WORKBOOK_CONFIG_CONFLICT/);
});

test('resolveUnits returns only permitted DTOs and cannot enumerate private rows', () => {
    const store = makeStore();
    const gateway = makeGateway(store);
    const result = gateway.resolveUnits({ email: 'CANBO@example.gov.vn' });
    assert.deepEqual(result, { units: [{ unitCode: 'CA_A', unitName: 'Công an phường A' }] });
    assert.equal(JSON.stringify(result).includes('allowed_emails'), false);
    assert.deepEqual(gateway.resolveUnits({ email: 'unknown@example.gov.vn' }), { units: [] });
});

test('request-status projection is pending-only, unit-scoped, and strips private staging metadata', () => {
    const store = makeStore({ stagingRows: [
        { request_id: 'REQ_A', target_record_id: 'LOC_A', unit_code: 'CA_A', request_type: pipeline.REQUEST_TYPES.update, status: 'PENDING', submitted_at: '2026-08-23T01:02:03.000Z', submitter_email: 'private@example.test', image_file_id: 'private-file', review_note: 'private note' },
        { request_id: 'REQ_CREATE', target_record_id: '', unit_code: 'CA_A', request_type: pipeline.REQUEST_TYPES.create, status: 'PENDING', submitted_at: '2026-08-23T01:02:03.000Z', image_drive_url: 'https://drive.google.com/private' },
        { request_id: 'REQ_B', target_record_id: 'LOC_B', unit_code: 'CA_B', request_type: pipeline.REQUEST_TYPES.stop, status: 'PENDING', submitted_at: '2026-08-23T01:02:03.000Z' },
        { request_id: 'REQ_DONE', target_record_id: 'LOC_A', unit_code: 'CA_A', request_type: pipeline.REQUEST_TYPES.update, status: 'APPROVED', submitted_at: '2026-08-23T01:02:03.000Z' },
        { request_id: '', target_record_id: 'LOC_A', unit_code: 'CA_A', request_type: pipeline.REQUEST_TYPES.update, status: 'PENDING' },
    ] });
    const gateway = makeGateway(store);
    const request = rawRequest('listStaffRequestStatuses', 'READ_STATUS', { email: 'canbo@example.gov.vn' });
    const result = gateway.handleRawRequest(request.raw, request.metadata);
    assert.deepEqual(result, { requests: [
        { locationId: 'LOC_A', unitCode: 'CA_A', type: pipeline.REQUEST_TYPES.update, status: 'PENDING', submittedAt: '2026-08-23T01:02:03.000Z' },
        { locationId: '', unitCode: 'CA_A', type: pipeline.REQUEST_TYPES.create, status: 'PENDING', submittedAt: '2026-08-23T01:02:03.000Z' },
    ] });
    assert.equal(JSON.stringify(result).includes('private-file'), false);
    assert.equal(JSON.stringify(result).includes('private@example.test'), false);
    assert.deepEqual(gateway.listStaffRequestStatuses({ email: 'other@example.gov.vn' }), { requests: [
        { locationId: 'LOC_B', unitCode: 'CA_B', type: pipeline.REQUEST_TYPES.stop, status: 'PENDING', submittedAt: '2026-08-23T01:02:03.000Z' },
    ] });
});

test('submitRequest authorizes unit, writes private staging once, and replay is idempotent', () => {
    const store = makeStore();
    const gateway = makeGateway(store);
    const request = rawRequest('submitRequest', 'REQ_1', basePayload());
    const first = gateway.handleRawRequest(request.raw, request.metadata);
    const replay = gateway.handleRawRequest(request.raw, request.metadata);
    assert.equal(first.status, 'PENDING');
    assert.equal(replay.idempotent, true);
    assert.deepEqual(store.counts(), { ledgers: 1, staging: 1, approvalAudit: 1, verificationAudit: 0, imageCreates: 1 });
    assert.equal(store.rows().staging[0].record_id, first.recordId);
    assert.equal(store.rows().staging[0].status, 'PENDING');
});

test('submitRequest rejects a distinct pending request for the same target under the Gateway lock', () => {
    const target = { record_id: 'CA_A_OLD', unit_code: 'CA_A', name: 'A', location_name: 'A', coordinates: '21.3,105.4' };
    const store = makeStore({
        operationalRecords: [target],
        stagingRows: [{ request_id: 'REQ_EXISTING', target_record_id: target.record_id, unit_code: 'CA_A', request_type: pipeline.REQUEST_TYPES.update, status: 'PENDING' }],
    });
    const gateway = makeGateway(store);
    const payload = basePayload({ request_type: pipeline.REQUEST_TYPES.stop, target_record_id: target.record_id });
    delete payload.image;
    const request = rawRequest('submitRequest', 'REQ_CONFLICT', payload);
    assert.throws(() => gateway.handleRawRequest(request.raw, request.metadata), /PENDING_REQUEST_CONFLICT/);
    assert.equal(store.counts().staging, 1);
    assert.equal(store.counts().imageCreates, 0);
});

test('a migrated operational baseline permits update, legacy correct, and stop without a replacement image', () => {
    const target = { record_id: 'CA_A_OLD', unit_code: 'CA_A', name: 'Điểm cũ', address: 'Địa chỉ cũ', coordinates: '21.3225,105.4027', image_url: 'https://drive.google.com/uc?export=view&id=file-old' };
    const prior = { record_id: target.record_id, status: pipeline.STATUSES.approved, published_image_file_id: 'file-old', reviewed_at: '2026-08-15T00:00:00.000Z' };
    const baselinePlan = operationalBaseline.reconcileOperationalBaseline({ publicRecords: [target], allowlistRows: allowlist(), reconciledAt: '2026-08-22T00:00:00.000Z' });
    assert.deepEqual(baselinePlan.blockers, []);
    const operationalRecords = operationalBaseline.mergeOperationalRecords({ baselineRows: baselinePlan.plannedRows });
    for (const [requestId, requestType] of [
        ['REQ_UPDATE_NO_IMAGE', pipeline.REQUEST_TYPES.update],
        ['REQ_CORRECT_NO_IMAGE', pipeline.REQUEST_TYPES.correct],
        ['REQ_STOP_NO_IMAGE', pipeline.REQUEST_TYPES.stop],
    ]) {
        const store = makeStore({ operationalRecords, stagingRows: [prior] });
        const gateway = makeGateway(store);
        const payload = basePayload({ request_type: requestType, target_record_id: target.record_id });
        delete payload.image;
        const request = rawRequest('submitRequest', requestId, payload);
        const result = gateway.handleRawRequest(request.raw, request.metadata);
        assert.equal(result.status, 'PENDING');
        assert.equal(store.counts().imageCreates, 0);
        assert.equal(store.rows().staging.find(row => row.request_id === requestId).published_image_file_id, 'file-old');
    }
});

test('CREATE remains independent when the legacy operational baseline is unavailable', () => {
    const store = makeStore({ operationalRecordsError: 'PRIVATE_SHEET_MISSING:Operational_Baseline' });
    const gateway = makeGateway(store);
    const request = rawRequest('submitRequest', 'REQ_CREATE_BASELINE_INDEPENDENT', basePayload());
    const result = gateway.handleRawRequest(request.raw, request.metadata);
    assert.equal(result.status, 'PENDING');
    assert.equal(store.counts().staging, 1);
});

test('gateway rejects create without an image before staging or Drive side effects', () => {
    const store = makeStore();
    const gateway = makeGateway(store);
    const payload = basePayload();
    delete payload.image;
    const request = rawRequest('submitRequest', 'REQ_CREATE_NO_IMAGE', payload);
    assert.throws(() => gateway.handleRawRequest(request.raw, request.metadata), /IMAGE_REQUIRED/);
    assert.equal(store.counts().staging, 0);
    assert.equal(store.counts().imageCreates, 0);
});

test('concurrent duplicate submitRequest has one effective side effect', async () => {
    const store = makeStore();
    const gateway = makeGateway(store);
    const request = rawRequest('submitRequest', 'REQ_CONCURRENT', basePayload());
    const results = await Promise.all([
        Promise.resolve().then(() => gateway.handleRawRequest(request.raw, request.metadata)),
        Promise.resolve().then(() => gateway.handleRawRequest(request.raw, request.metadata)),
    ]);
    assert.equal(store.counts().staging, 1);
    assert.equal(store.counts().imageCreates, 1);
    assert.equal(results.filter(result => result.idempotent).length, 1);
});

test('submitRequest rejects unauthorized units, create target IDs, cross-unit targets, and formula target IDs before side effects', () => {
    const operational = [{ record_id: 'CA_B_OLD', unit_code: 'CA_B', name: 'B', location_name: 'B', coordinates: '21.3,105.4' }];
    const cases = [
        { payload: basePayload({ unit_code: 'CA_B' }), error: 'EMAIL_NOT_AUTHORIZED_FOR_UNIT' },
        { payload: basePayload({ target_record_id: 'CA_A_OLD' }), error: 'CREATE_TARGET_RECORD_ID_NOT_ALLOWED' },
        { payload: basePayload({ request_type: pipeline.REQUEST_TYPES.update, target_record_id: 'CA_B_OLD' }), error: 'TARGET_RECORD_UNIT_MISMATCH' },
        { payload: basePayload({ request_type: pipeline.REQUEST_TYPES.update, target_record_id: '=IMPORTXML("x")' }), error: 'TARGET_RECORD_ID_NOT_FOUND' },
    ];
    for (const item of cases) {
        const store = makeStore({ operationalRecords: operational });
        const gateway = makeGateway(store);
        const request = rawRequest('submitRequest', `REQ_${item.error}`, item.payload);
        assert.throws(() => gateway.handleRawRequest(request.raw, request.metadata), new RegExp(item.error));
        assert.equal(store.counts().staging, 0);
        assert.equal(store.counts().imageCreates, 0);
    }
});

test('image validation uses decoded magic bytes and authoritative size, ignoring client MIME/name/size', () => {
    const store = makeStore();
    const gateway = makeGateway(store);
    const fake = rawRequest('submitRequest', 'REQ_FAKE_IMAGE', basePayload({ image: { base64: Buffer.from('not an image').toString('base64'), mimeType: 'image/jpeg', filename: 'x.jpg', size: 1 } }));
    assert.throws(() => gateway.handleRawRequest(fake.raw, fake.metadata), /IMAGE_TYPE_NOT_ALLOWED/);
    const malformed = rawRequest('submitRequest', 'REQ_BAD_B64', basePayload({ image: { base64: '%%%=', mimeType: 'image/jpeg' } }));
    assert.throws(() => gateway.handleRawRequest(malformed.raw, malformed.metadata), /IMAGE_ENCODING_INVALID/);
    const largeRuntimeStore = makeStore();
    const largeGateway = createStaffGateway({
        pipeline, workbookConfig, store: largeRuntimeStore,
        runtime: {
            env: { PRIVATE_LOCATION_SPREADSHEET_ID: 'private', PUBLIC_LOCATION_SPREADSHEET_ID: 'public' }, secret: SECRET, now: () => NOW,
            decodeBase64: () => Buffer.alloc(createStaffGateway.MAX_IMAGE_BYTES + 1), sha256Hex: value => sha256(value),
            hmacSha256Hex: (message, secret) => crypto.createHmac('sha256', secret).update(message).digest('hex'), withLock: callback => callback(),
        },
    });
    const large = rawRequest('submitRequest', 'REQ_LARGE_IMAGE', basePayload({ image: { base64: 'AAAA', mimeType: 'image/jpeg' } }));
    assert.throws(() => largeGateway.handleRawRequest(large.raw, large.metadata), /IMAGE_TOO_LARGE/);
});

test('image magic bytes accept JPEG, PNG and WebP, but reject a fake WebP marker', () => {
    assert.equal(createStaffGateway.detectImageType(Buffer.from(JPEG, 'base64')), 'image/jpeg');
    assert.equal(createStaffGateway.detectImageType(Buffer.from(PNG, 'base64')), 'image/png');
    assert.equal(createStaffGateway.detectImageType(Buffer.from(WEBP, 'base64')), 'image/webp');
    const fakeWebp = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x4a, 0x55, 0x4e, 0x4b]);
    assert.equal(createStaffGateway.detectImageType(fakeWebp), '');
    assert.deepEqual(createStaffGateway.validateImageBase64({ base64: WEBP }), { ok: true, bytes: Buffer.from(WEBP, 'base64'), mimeType: 'image/webp', size: 12 });
});

test('Drive crash after create recovers deterministic file and does not duplicate staging or Drive side effects', () => {
    const store = makeStore();
    store.setFailUploadPersist();
    const gateway = makeGateway(store);
    const request = rawRequest('submitRequest', 'REQ_CRASH', basePayload());
    assert.throws(() => gateway.handleRawRequest(request.raw, request.metadata), /GATEWAY_OPERATION_FAILED/);
    const recovered = gateway.handleRawRequest(request.raw, request.metadata);
    assert.equal(recovered.status, 'PENDING');
    assert.deepEqual(store.counts(), { ledgers: 1, staging: 1, approvalAudit: 1, verificationAudit: 0, imageCreates: 1 });
});

test('approval audit failure does not report business failure or duplicate staging on retry', () => {
    const store = makeStore({ failApprovalAudit: true });
    const gateway = makeGateway(store);
    const request = rawRequest('submitRequest', 'REQ_AUDIT_WARNING', basePayload());
    const result = gateway.handleRawRequest(request.raw, request.metadata);
    assert.equal(result.auditWarning, 'AUDIT_APPEND_FAILED');
    assert.equal(gateway.handleRawRequest(request.raw, request.metadata).idempotent, true);
    assert.equal(store.counts().staging, 1);
});

test('writeVerificationEvent validates canonical snapshot hash, unit ownership and idempotency', () => {
    const store = makeStore();
    const gateway = makeGateway(store);
    const snapshot = { record_id: 'CA_A_OLD', unit_code: 'CA_A', name: 'A', address: 'Address', coordinates: '21.3,105.4' };
    const payload = { email: 'canbo@example.gov.vn', unit_code: 'CA_A', event_type: 'CONFIRM', snapshot, snapshot_hash: sha256(JSON.stringify({ address: 'Address', coordinates: '21.3,105.4', name: 'A', record_id: 'CA_A_OLD', unit_code: 'CA_A' })), actor_role: 'admin', timestamp: 'client-controlled' };
    const request = rawRequest('writeVerificationEvent', 'OP_1', payload);
    const result = gateway.handleRawRequest(request.raw, request.metadata);
    assert.equal(result.eventType, 'CONFIRM');
    assert.equal(gateway.handleRawRequest(request.raw, request.metadata).idempotent, true);
    assert.equal(store.counts().verificationAudit, 1);
    assert.equal('actor_role' in store.rows().verificationAudit[0], false);
    const mismatch = rawRequest('writeVerificationEvent', 'OP_2', { ...payload, snapshot: { ...snapshot, unit_code: 'CA_B' }, snapshot_hash: sha256(JSON.stringify({ address: 'Address', coordinates: '21.3,105.4', name: 'A', record_id: 'CA_A_OLD', unit_code: 'CA_B' })) });
    assert.throws(() => gateway.handleRawRequest(mismatch.raw, mismatch.metadata), /TARGET_RECORD_UNIT_MISMATCH/);
});
