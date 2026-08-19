const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const { createStaffApi, deriveGatewayRequestId, validateStaffImage, normalizeRequestBody } = require('../lib/staff-api');
const { snapshotHash } = require('../lib/staff-location-contract');
const { createStaffSession } = require('../lib/staff-session');
const { getPublishedLocations, resetPublishedLocationsCache } = require('../lib/published-locations');
const { MUTATION_TIMEOUT_MS, MUTATION_MAX_ATTEMPTS } = require('../lib/staff-gateway-client');

const SECRET = 'synthetic-staff-session-secret-32-bytes';
const VALID_IMAGE = { base64: Buffer.from('synthetic-image').toString('base64') };
const ENV = {
    GOOGLE_CLIENT_ID: 'google-client-id.apps.googleusercontent.com',
    STAFF_SESSION_SECRET: SECRET,
    STAFF_ALLOWED_ORIGINS: 'https://staff.example.test',
    STAFF_GATEWAY_URL: 'https://script.google.com/macros/s/test/exec',
    LOCATION_GATEWAY_SECRET: 'synthetic-gateway-secret',
    PUBLIC_LOCATION_SPREADSHEET_ID: 'public-test',
};

function response() {
    const headers = new Map();
    return {
        headers,
        statusCode: 200,
        setHeader(name, value) { headers.set(name, value); },
        getHeader(name) { return headers.get(name); },
        status(code) { this.statusCode = code; return this; },
        json(value) { this.body = value; return this; },
        end() { this.ended = true; return this; },
    };
}

function request(method, body, headers = {}) {
    return { method, body, headers: { host: 'staff.example.test', ...headers } };
}

function record(overrides = {}) {
    return {
        id: 'R_A', unitCode: 'UNIT_A', name: 'Điểm A', type: 'police_station', address: 'Địa chỉ A',
        phone: '0210', coordinates: '21.3225,105.4027', imageUrl: '', searchAliases: '', updatedAt: '2026-08-11T00:00:00.000Z',
        siteType: 'HEADQUARTERS', services: ['POLICE_OFFICE'], googleMapsUrl: '', cccdServiceMode: '', serviceSchedule: '',
        servedUnits: '', status: 'APPROVED', verifiedAt: '2026-08-11T00:00:00.000Z', ...overrides,
    };
}

function csrfHeaders(token = 'csrf-token') {
    return { origin: 'https://staff.example.test', cookie: `staff_csrf=${token}`, 'x-staff-csrf': token };
}

function locationPayload(address) {
    const cols = ['record_id', 'unit_code', 'name', 'type', 'address', 'phone', 'coordinates'].map(label => ({ label }));
    return {
        table: {
            cols,
            rows: [{ c: [{ v: 'R_A' }, { v: 'UNIT_A' }, { v: 'Äiá»ƒm A' }, { v: 'Trá»¥ sá»Ÿ' }, { v: address }, { v: '0210' }, { v: '21.3225,105.4027' }] }],
        },
    };
}

test('request id is deterministic and excludes payload content', () => {
    const first = deriveGatewayRequestId({ sub: 'sub-a', action: 'submitRequest', operationId: 'op_1' });
    const second = deriveGatewayRequestId({ sub: 'sub-a', action: 'submitRequest', operationId: 'op_1' });
    assert.equal(first, second);
    assert.notEqual(first, deriveGatewayRequestId({ sub: 'sub-b', action: 'submitRequest', operationId: 'op_1' }));
    assert.notEqual(first, deriveGatewayRequestId({ sub: 'sub-a', action: 'writeVerificationEvent', operationId: 'op_1' }));
    assert.match(first, /^[0-9a-f]{64}$/);
});

test('Google login verifies server claims, resolves allowlist and issues protected cookie', async () => {
    const calls = [];
    const api = createStaffApi({
        env: ENV,
        verifyToken: async (credential, audience) => {
            assert.equal(credential, 'synthetic-google-token');
            assert.equal(audience, ENV.GOOGLE_CLIENT_ID);
            return { sub: 'google-sub-a', email: 'staff@example.test', name: 'Cán Bộ A' };
        },
        gatewayCall: async (action, payload) => {
            calls.push({ action, payload });
            return { units: [{ unitCode: 'UNIT_A', unitName: 'Đơn vị A' }] };
        },
    });
    const csrfResponse = response();
    await api.csrf(request('GET', null), csrfResponse);
    assert.equal(csrfResponse.statusCode, 200);
    assert.match(csrfResponse.getHeader('Set-Cookie').join('\n'), /staff_csrf=.*Secure/);
    const loginResponse = response();
    await api.google(request('POST', { credential: 'synthetic-google-token' }, csrfHeaders('login-csrf')), loginResponse);
    assert.equal(loginResponse.statusCode, 200);
    assert.equal(loginResponse.body.ok, true);
    assert.deepEqual(loginResponse.body.data.user, { email: 'staff@example.test', name: 'Cán Bộ A' });
    assert.match(loginResponse.getHeader('Set-Cookie').join('\n'), /staff_session=.*HttpOnly/);
    assert.equal(calls[0].action, 'resolveUnits');
    assert.deepEqual(calls[0].payload, { email: 'staff@example.test' });
});

test('verified display name flows into the signed session and /api/staff/session, and overrides a client-submitted submitter name', async () => {
    const session = createStaffSession({ sub: 'sub-a', email: 'staff@example.test', name: 'Cán Bộ Xác Thực', now: Date.now() }, SECRET);
    const calls = [];
    const api = createStaffApi({
        env: ENV,
        gatewayCall: async (action, payload) => {
            calls.push({ action, payload });
            if (action === 'resolveUnits') return { units: [{ unitCode: 'UNIT_A', unitName: 'Đơn vị A' }] };
            return { status: 'PENDING' };
        },
    });
    const sessionRes = response();
    await api.session(request('GET', null, { cookie: `staff_session=${encodeURIComponent(session)}` }), sessionRes);
    assert.equal(sessionRes.statusCode, 200);
    assert.deepEqual(sessionRes.body.data.user, { email: 'staff@example.test', name: 'Cán Bộ Xác Thực' });

    const baseHeaders = { ...csrfHeaders(), cookie: `staff_session=${encodeURIComponent(session)}; staff_csrf=csrf-token` };
    const create = response();
    await api.requests(request('POST', {
        operationId: 'op_identity', requestType: 'Thêm địa điểm mới', unitCode: 'UNIT_A',
        submitterName: 'Tên giả mạo do client tự gửi', image: VALID_IMAGE,
    }, baseHeaders), create);
    assert.equal(create.statusCode, 200);
    const submitCall = calls.find(call => call.action === 'submitRequest');
    assert.equal(submitCall.payload.submitter_name, 'Cán Bộ Xác Thực');
});

test('missing verified display name falls back to the client-submitted submitter name', async () => {
    const session = createStaffSession({ sub: 'sub-a', email: 'staff@example.test', now: Date.now() }, SECRET);
    const calls = [];
    const api = createStaffApi({
        env: ENV,
        gatewayCall: async (action, payload) => {
            calls.push({ action, payload });
            if (action === 'resolveUnits') return { units: [{ unitCode: 'UNIT_A', unitName: 'Đơn vị A' }] };
            return { status: 'PENDING' };
        },
    });
    const baseHeaders = { ...csrfHeaders(), cookie: `staff_session=${encodeURIComponent(session)}; staff_csrf=csrf-token` };
    const create = response();
    await api.requests(request('POST', {
        operationId: 'op_fallback_name', requestType: 'Thêm địa điểm mới', unitCode: 'UNIT_A',
        submitterName: 'Nhập tay vì không có tên xác thực', image: VALID_IMAGE,
    }, baseHeaders), create);
    assert.equal(create.statusCode, 200);
    const submitCall = calls.find(call => call.action === 'submitRequest');
    assert.equal(submitCall.payload.submitter_name, 'Nhập tay vì không có tên xác thực');
});

test('login rejects client identity fields and exact Origin suffix tricks', async () => {
    const api = createStaffApi({ env: ENV, verifyToken: async () => ({ sub: 'sub', email: 'staff@example.test' }), gatewayCall: async () => ({ units: [] }) });
    const badOrigin = response();
    await api.google(request('POST', { credential: 'token' }, { ...csrfHeaders(), origin: 'https://staff.example.test.attacker.com' }), badOrigin);
    assert.equal(badOrigin.statusCode, 403);
    assert.equal(badOrigin.body.error.code, 'STAFF_ORIGIN_REJECTED');

    const identityInjection = response();
    await api.google(request('POST', { credential: 'token', email: 'victim@example.test' }, csrfHeaders()), identityInjection);
    assert.equal(identityInjection.statusCode, 401);
    assert.equal(identityInjection.body.error.code, 'GOOGLE_TOKEN_INVALID');
});

test('protected session reauthorizes current units and revocation clears the cookie', async () => {
    const session = createStaffSession({ sub: 'sub-a', email: 'staff@example.test', now: Date.now() }, SECRET);
    const api = createStaffApi({
        env: ENV,
        now: () => 1_800_000_001_000,
        gatewayCall: async () => ({ units: [] }),
    });
    const res = response();
    await api.session(request('GET', null, { cookie: `staff_session=${encodeURIComponent(session)}` }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error.code, 'STAFF_ACCESS_REVOKED');
    assert.match(res.getHeader('Set-Cookie').join('\n'), /staff_session=.*Max-Age=0/);
});

test('locations are filtered by current unit and snapshot hashes are deterministic', async () => {
    const session = createStaffSession({ sub: 'sub-a', email: 'staff@example.test', now: Date.now() }, SECRET);
    const locations = [record(), record({ id: 'R_B', unitCode: 'UNIT_B', name: 'Điểm B' })];
    const api = createStaffApi({
        env: ENV,
        gatewayCall: async () => ({ units: [{ unitCode: 'UNIT_A', unitName: 'Đơn vị A' }] }),
        getLocations: async () => ({ locations }),
    });
    const res = response();
    await api.locations(request('GET', null, { cookie: `staff_session=${encodeURIComponent(session)}` }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.locations.length, 1);
    const item = res.body.data.locations[0];
    assert.equal(item.record.record_id, 'R_A');
    assert.equal(item.snapshotHash, snapshotHash(item.record));
});

test('the location list DTO never leaks private/internal fields even if the source object carries them', async () => {
    const session = createStaffSession({ sub: 'sub-a', email: 'staff@example.test', now: Date.now() }, SECRET);
    const withPrivateFields = record({
        submitter_email: 'someone.else@example.test', submitterEmail: 'someone.else@example.test',
        image_file_id: 'drive-file-id-secret', imageDriveUrl: 'https://drive.google.com/private/secret',
        review_note: 'ghi chú nội bộ', auth_status: 'AUTHORIZED', request_id: 'REQ_INTERNAL',
        validation_errors: '', warnings: '',
    });
    const api = createStaffApi({
        env: ENV,
        gatewayCall: async () => ({ units: [{ unitCode: 'UNIT_A', unitName: 'Đơn vị A' }] }),
        getLocations: async () => ({ locations: [withPrivateFields] }),
    });
    const res = response();
    await api.locations(request('GET', null, { cookie: `staff_session=${encodeURIComponent(session)}` }), res);
    assert.equal(res.statusCode, 200);
    const fields = Object.keys(res.body.data.locations[0].record);
    for (const leaked of ['submitter_email', 'submitterEmail', 'image_file_id', 'imageDriveUrl', 'review_note', 'auth_status', 'request_id', 'validation_errors', 'warnings']) {
        assert.equal(fields.includes(leaked), false, `${leaked} must not reach the Staff API DTO`);
    }
});

test('authoritative mutation bypasses fresh cache and never accepts stale fallback', async () => {
    resetPublishedLocationsCache();
    let sourceMode = 'A';
    let sourceCalls = 0;
    let mutationCalls = 0;
    const getLocations = options => getPublishedLocations({
        ...options,
        now: sourceCalls * 1000 + 1,
        sheetId: 'staff-authoritative-test',
        fetchImpl: async () => {
            sourceCalls += 1;
            if (sourceMode === 'error') throw new Error('source unavailable');
            const payload = locationPayload(sourceMode === 'A' ? 'Äá»‹a chá»‰ A' : 'Äá»‹a chá»‰ B');
            return new Response(`google.visualization.Query.setResponse(${JSON.stringify(payload)});`);
        },
    });
    const session = createStaffSession({ sub: 'sub-a', email: 'staff@example.test', now: Date.now() }, SECRET);
    const api = createStaffApi({
        env: ENV,
        gatewayCall: async action => {
            if (action === 'resolveUnits') return { units: [{ unitCode: 'UNIT_A', unitName: 'ÄÆ¡n vá»‹ A' }] };
            mutationCalls += 1;
            return { eventType: 'CONFIRM' };
        },
        getLocations,
    });
    const sessionHeaders = { ...csrfHeaders(), cookie: `staff_session=${encodeURIComponent(session)}; staff_csrf=csrf-token` };
    const read = response();
    await api.locations(request('GET', null, { cookie: `staff_session=${encodeURIComponent(session)}` }), read);
    const hashA = read.body.data.locations[0].snapshotHash;
    assert.equal(sourceCalls, 1);

    sourceMode = 'B';
    const stale = response();
    await api.verification(request('POST', { operationId: 'op_authoritative', recordId: 'R_A', snapshotHash: hashA, eventType: 'CONFIRM' }, sessionHeaders), stale);
    assert.equal(stale.statusCode, 409);
    assert.equal(stale.body.error.code, 'STALE_PUBLIC_SNAPSHOT');
    assert.equal(sourceCalls, 2, 'mutation must bypass the fresh cache');
    assert.equal(mutationCalls, 0);

    resetPublishedLocationsCache();
    sourceMode = 'A';
    sourceCalls = 0;
    const cacheRead = response();
    await api.locations(request('GET', null, { cookie: `staff_session=${encodeURIComponent(session)}` }), cacheRead);
    const cachedHash = cacheRead.body.data.locations[0].snapshotHash;
    sourceMode = 'error';
    const unavailable = response();
    await api.verification(request('POST', { operationId: 'op_unavailable', recordId: 'R_A', snapshotHash: cachedHash, eventType: 'CONFIRM' }, sessionHeaders), unavailable);
    assert.equal(unavailable.statusCode, 503);
    assert.equal(unavailable.body.error.code, 'STAFF_PUBLIC_SOURCE_UNAVAILABLE');
    assert.equal(mutationCalls, 0, 'Gateway mutation must not run when authoritative source fails');
    resetPublishedLocationsCache();
});

test('stale verification is rejected before Gateway and fresh verification sends server snapshot', async () => {
    const session = createStaffSession({ sub: 'sub-a', email: 'staff@example.test', now: Date.now() }, SECRET);
    const location = record();
    let gatewayCalls = 0;
    const api = createStaffApi({
        env: ENV,
        gatewayCall: async (action, payload) => {
            if (action === 'resolveUnits') return { units: [{ unitCode: 'UNIT_A', unitName: 'Đơn vị A' }] };
            gatewayCalls += 1;
            assert.equal(action, 'writeVerificationEvent');
            assert.equal(payload.email, 'staff@example.test');
            assert.equal(payload.unit_code, 'UNIT_A');
            return { eventType: 'CONFIRM' };
        },
        getLocations: async () => ({ locations: [location] }),
    });
    const stale = response();
    await api.verification(request('POST', { operationId: 'op_1', recordId: 'R_A', snapshotHash: '0'.repeat(64), eventType: 'CONFIRM' }, { ...csrfHeaders(), cookie: `staff_session=${encodeURIComponent(session)}; staff_csrf=csrf-token` }), stale);
    assert.equal(stale.statusCode, 409);
    assert.equal(stale.body.error.code, 'STALE_PUBLIC_SNAPSHOT');
    assert.equal(gatewayCalls, 0);

    const freshHash = snapshotHash(require('../lib/staff-location-contract').toPublicSnapshot(location));
    const fresh = response();
    await api.verification(request('POST', { operationId: 'op_2', recordId: 'R_A', snapshotHash: freshHash, eventType: 'CONFIRM' }, { ...csrfHeaders(), cookie: `staff_session=${encodeURIComponent(session)}; staff_csrf=csrf-token` }), fresh);
    assert.equal(fresh.statusCode, 200);
    assert.equal(gatewayCalls, 1);
});

test('request endpoint ignores client identity and blocks stale/cross-unit/create targets', async () => {
    const session = createStaffSession({ sub: 'sub-a', email: 'staff@example.test', now: Date.now() }, SECRET);
    const location = record();
    const calls = [];
    let locationReads = 0;
    const locationOptions = [];
    const api = createStaffApi({
        env: ENV,
        gatewayCall: async (action, payload) => {
            calls.push({ action, payload });
            if (action === 'resolveUnits') return { units: [{ unitCode: 'UNIT_A', unitName: 'Đơn vị A' }] };
            return { status: 'PENDING' };
        },
        getLocations: async options => { locationReads += 1; locationOptions.push(options); return { locations: [location] }; },
    });
    const baseHeaders = { ...csrfHeaders(), cookie: `staff_session=${encodeURIComponent(session)}; staff_csrf=csrf-token` };
    const create = response();
    await api.requests(request('POST', {
        operationId: 'op_create', requestType: 'Thêm địa điểm mới', unitCode: 'UNIT_A',
        email: 'victim@example.test', actor_email: 'victim@example.test', publicPhone: '0210', image: VALID_IMAGE,
    }, baseHeaders), create);
    assert.equal(create.statusCode, 200);
    const submitCall = calls.find(call => call.action === 'submitRequest');
    assert.equal(submitCall.payload.email, 'staff@example.test');
    assert.equal(submitCall.payload.unit_code, 'UNIT_A');
    assert.equal('actor_email' in submitCall.payload, false);
    assert.equal(locationReads, 0, 'create must not fetch Published_Locations unnecessarily');

    const target = response();
    await api.requests(request('POST', { operationId: 'op_bad', requestType: 'Thêm địa điểm mới', targetRecordId: 'R_A' }, baseHeaders), target);
    assert.equal(target.statusCode, 400);
    assert.equal(target.body.error.code, 'CREATE_TARGET_RECORD_ID_NOT_ALLOWED');

    const stale = response();
    await api.requests(request('POST', { operationId: 'op_stale', requestType: 'Cập nhật địa điểm đang có', targetRecordId: 'R_A', snapshotHash: '0'.repeat(64) }, baseHeaders), stale);
    assert.equal(stale.statusCode, 409);
    assert.equal(locationReads, 1);
    assert.equal(locationOptions[0].forceRefresh, true);
    assert.equal(locationOptions[0].allowStale, false);

    const currentHash = snapshotHash(require('../lib/staff-location-contract').toPublicSnapshot(location));
    for (const [operationId, requestType] of [
        ['op_correct', 'Báo địa chỉ hoặc vị trí sai'],
        ['op_stop', 'Báo địa điểm ngừng hoạt động'],
    ]) {
        const targetMutation = response();
        await api.requests(request('POST', { operationId, requestType, targetRecordId: 'R_A', snapshotHash: currentHash }, baseHeaders), targetMutation);
        assert.equal(targetMutation.statusCode, 200);
    }
    assert.equal(locationReads, 3);
    assert.equal(locationOptions[1].forceRefresh, true);
    assert.equal(locationOptions[1].allowStale, false);
    assert.equal(locationOptions[2].forceRefresh, true);
    assert.equal(locationOptions[2].allowStale, false);
    assert.equal(calls.filter(call => call.action === 'submitRequest').length, 3);
});

test('U3: a client-submitted unit_code outside the session\'s authorized units is rejected, not trusted', async () => {
    const session = createStaffSession({ sub: 'sub-a', email: 'staff@example.test', now: Date.now() }, SECRET);
    let submitCalls = 0;
    const api = createStaffApi({
        env: ENV,
        gatewayCall: async action => {
            if (action === 'resolveUnits') return { units: [{ unitCode: 'UNIT_A', unitName: 'Đơn vị A' }] };
            submitCalls += 1;
            return { status: 'PENDING' };
        },
    });
    const res = response();
    await api.requests(request('POST', {
        operationId: 'op_wrong_unit', requestType: 'Thêm địa điểm mới', unitCode: 'UNIT_B_NOT_AUTHORIZED',
    }, { ...csrfHeaders(), cookie: `staff_session=${encodeURIComponent(session)}; staff_csrf=csrf-token` }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error.code, 'EMAIL_NOT_AUTHORIZED_FOR_UNIT');
    assert.equal(submitCalls, 0, 'the Gateway must never be called with an unauthorized unit');
});

test('U4: an email with no authorized units cannot reach the mutation flow', async () => {
    const session = createStaffSession({ sub: 'sub-a', email: 'nobody@example.test', now: Date.now() }, SECRET);
    let submitCalls = 0;
    const api = createStaffApi({
        env: ENV,
        gatewayCall: async action => {
            if (action === 'resolveUnits') return { units: [] };
            submitCalls += 1;
            return { status: 'PENDING' };
        },
    });
    const res = response();
    await api.requests(request('POST', {
        operationId: 'op_no_units', requestType: 'Thêm địa điểm mới', unitCode: 'UNIT_A',
    }, { ...csrfHeaders(), cookie: `staff_session=${encodeURIComponent(session)}; staff_csrf=csrf-token` }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error.code, 'STAFF_ACCESS_REVOKED');
    assert.equal(submitCalls, 0);
});

test('U4/C4/S4/F4: update/correct/stop/confirm against a genuinely different unit\'s target fail closed at the Vercel layer, not just on the UI', async () => {
    // Session is authorized ONLY for UNIT_A. The target record's authoritative unit is UNIT_B — a
    // real cross-unit attempt, distinct from the existing stale-hash tests (same unit, old hash).
    const session = createStaffSession({ sub: 'sub-a', email: 'staff@example.test', now: Date.now() }, SECRET);
    const foreignRecord = record({ id: 'R_B', unitCode: 'UNIT_B', name: 'Điểm của đơn vị khác' });
    const foreignHash = snapshotHash(require('../lib/staff-location-contract').toPublicSnapshot(foreignRecord));
    let mutationCalls = 0;
    const api = createStaffApi({
        env: ENV,
        gatewayCall: async action => {
            if (action === 'resolveUnits') return { units: [{ unitCode: 'UNIT_A', unitName: 'Đơn vị A' }] };
            mutationCalls += 1;
            return { status: 'PENDING', eventType: 'CONFIRM' };
        },
        getLocations: async () => ({ locations: [foreignRecord] }),
    });
    const headers = { ...csrfHeaders(), cookie: `staff_session=${encodeURIComponent(session)}; staff_csrf=csrf-token` };

    for (const [operationId, requestType] of [
        ['op_cross_update', 'Cập nhật địa điểm đang có'],
        ['op_cross_correct', 'Báo địa chỉ hoặc vị trí sai'],
        ['op_cross_stop', 'Báo địa điểm ngừng hoạt động'],
    ]) {
        const res = response();
        await api.requests(request('POST', { operationId, requestType, targetRecordId: 'R_B', snapshotHash: foreignHash }, headers), res);
        assert.equal(res.statusCode, 403, `${requestType} must fail closed`);
        assert.equal(res.body.error.code, 'TARGET_RECORD_UNIT_MISMATCH');
    }

    const confirmRes = response();
    await api.verification(request('POST', { operationId: 'op_cross_confirm', recordId: 'R_B', snapshotHash: foreignHash, eventType: 'CONFIRM' }, headers), confirmRes);
    assert.equal(confirmRes.statusCode, 403);
    assert.equal(confirmRes.body.error.code, 'TARGET_RECORD_UNIT_MISMATCH');

    assert.equal(mutationCalls, 0, 'the Gateway must never be called for a cross-unit target on any of the four flows');
});

test('staff image preflight rejects malformed and over-cap decoded payloads', () => {
    assert.equal(validateStaffImage(null), null);
    assert.throws(() => validateStaffImage({ base64: 'not-base64' }), /IMAGE_ENCODING_INVALID/);
    const oversized = Buffer.alloc(3 * 1024 * 1024 + 1).toString('base64');
    assert.throws(() => validateStaffImage({ base64: oversized }), /STAFF_IMAGE_TOO_LARGE|IMAGE_ENCODING_INVALID/);
    const tiny = Buffer.from('synthetic').toString('base64');
    assert.equal(validateStaffImage({ base64: tiny }).base64, tiny);
});

test('staff API requires an image only for create and omits an absent update/correct image', async () => {
    const session = createStaffSession({ sub: 'sub-a', email: 'staff@example.test', now: Date.now() }, SECRET);
    const location = record();
    const currentHash = snapshotHash(require('../lib/staff-location-contract').toPublicSnapshot(location));
    const calls = [];
    const api = createStaffApi({
        env: ENV,
        gatewayCall: async (action, payload) => {
            if (action === 'resolveUnits') return { units: [{ unitCode: 'UNIT_A', unitName: 'Đơn vị A' }] };
            calls.push(payload);
            return { status: 'PENDING' };
        },
        getLocations: async () => ({ locations: [location] }),
    });
    const headers = { ...csrfHeaders(), cookie: `staff_session=${encodeURIComponent(session)}; staff_csrf=csrf-token` };

    const create = response();
    await api.requests(request('POST', { operationId: 'op_create_no_image', requestType: 'Thêm địa điểm mới', unitCode: 'UNIT_A' }, headers), create);
    assert.equal(create.statusCode, 400);
    assert.equal(create.body.error.code, 'IMAGE_REQUIRED');

    for (const [operationId, requestType] of [
        ['op_update_no_image', 'Cập nhật địa điểm đang có'],
        ['op_correct_no_image', 'Báo địa chỉ hoặc vị trí sai'],
    ]) {
        const res = response();
        await api.requests(request('POST', { operationId, requestType, targetRecordId: 'R_A', snapshotHash: currentHash }, headers), res);
        assert.equal(res.statusCode, 200);
    }
    assert.equal(calls.length, 2);
    assert.equal('image' in calls[0], false);
    assert.equal('image' in calls[1], false);
});

test('staff request boundary rejects non-text fields, oversized text and non-array services', () => {
    assert.throws(() => normalizeRequestBody({ locationName: { value: 'A' } }), /STAFF_REQUEST_INVALID/);
    assert.throws(() => normalizeRequestBody({ reviewNote: 'x'.repeat(2001) }), /STAFF_REQUEST_INVALID/);
    assert.throws(() => normalizeRequestBody({ services: 'POLICE_OFFICE' }), /STAFF_REQUEST_INVALID/);
    assert.deepEqual(normalizeRequestBody({ locationName: '  Điểm A  ', services: [' POLICE_OFFICE ', ''] }), {
        locationName: 'Điểm A', services: ['POLICE_OFFICE'],
    });
});

test('malformed staff request returns a safe 400 before Apps Script submission', async () => {
    const session = createStaffSession({ sub: 'sub-a', email: 'staff@example.test', now: Date.now() }, SECRET);
    let submitCalls = 0;
    const api = createStaffApi({
        env: ENV,
        gatewayCall: async action => {
            if (action === 'resolveUnits') return { units: [{ unitCode: 'UNIT_A', unitName: 'Đơn vị A' }] };
            submitCalls += 1;
            return { status: 'PENDING' };
        },
    });
    const res = response();
    await api.requests(request('POST', { operationId: 'op_invalid', requestType: 'Thêm địa điểm mới', unitCode: 'UNIT_A', locationName: { value: 'not text' } }, {
        ...csrfHeaders(), cookie: `staff_session=${encodeURIComponent(session)}; staff_csrf=csrf-token`,
    }), res);
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { ok: false, error: { code: 'STAFF_REQUEST_INVALID' } });
    assert.equal(submitCalls, 0);
});

test('public staff auth config exposes only the Google client id and fails closed when missing', async () => {
    const configured = response();
    await createStaffApi({ env: ENV }).config(request('GET', null), configured);
    assert.equal(configured.statusCode, 200);
    assert.deepEqual(configured.body, { ok: true, data: { googleClientId: ENV.GOOGLE_CLIENT_ID } });
    assert.equal(configured.headers.get('Cache-Control'), 'no-store');

    const missing = response();
    await createStaffApi({ env: { ...ENV, GOOGLE_CLIENT_ID: '' } }).config(request('GET', null), missing);
    assert.equal(missing.statusCode, 503);
    assert.deepEqual(missing.body, { ok: false, error: { code: 'STAFF_AUTH_CONFIG_INVALID' } });
    assert.equal(JSON.stringify(missing.body).includes('STAFF_SESSION_SECRET'), false);
});

test('resolveUnits keeps default Gateway timeout/attempts; submitRequest and writeVerificationEvent use the long mutation policy', async () => {
    const session = createStaffSession({ sub: 'sub-a', email: 'staff@example.test', now: Date.now() }, SECRET);
    const location = record();
    const calls = [];
    const api = createStaffApi({
        env: ENV,
        gatewayCall: async (action, payload, options) => {
            calls.push({ action, options });
            if (action === 'resolveUnits') return { units: [{ unitCode: 'UNIT_A', unitName: 'Đơn vị A' }] };
            if (action === 'submitRequest') return { status: 'PENDING' };
            return { eventType: 'CONFIRM' };
        },
        getLocations: async () => ({ locations: [location] }),
    });
    const baseHeaders = { ...csrfHeaders(), cookie: `staff_session=${encodeURIComponent(session)}; staff_csrf=csrf-token` };

    const create = response();
    await api.requests(request('POST', {
        operationId: 'op_wiring_create', requestType: 'Thêm địa điểm mới', unitCode: 'UNIT_A',
        image: VALID_IMAGE,
    }, baseHeaders), create);
    assert.equal(create.statusCode, 200);

    const currentHash = snapshotHash(require('../lib/staff-location-contract').toPublicSnapshot(location));
    const verify = response();
    await api.verification(request('POST', { operationId: 'op_wiring_verify', recordId: 'R_A', snapshotHash: currentHash, eventType: 'CONFIRM' }, baseHeaders), verify);
    assert.equal(verify.statusCode, 200);

    const resolveUnitsCalls = calls.filter(call => call.action === 'resolveUnits');
    assert.ok(resolveUnitsCalls.length >= 1);
    resolveUnitsCalls.forEach(call => {
        assert.equal(call.options.timeoutMs, undefined, 'resolveUnits must not opt into the long mutation timeout');
        assert.equal(call.options.maxAttempts, undefined, 'resolveUnits must keep the default retry-capable attempt count');
    });

    const submitCall = calls.find(call => call.action === 'submitRequest');
    assert.equal(submitCall.options.timeoutMs, MUTATION_TIMEOUT_MS);
    assert.equal(submitCall.options.maxAttempts, MUTATION_MAX_ATTEMPTS);

    const verifyCall = calls.find(call => call.action === 'writeVerificationEvent');
    assert.equal(verifyCall.options.timeoutMs, MUTATION_TIMEOUT_MS);
    assert.equal(verifyCall.options.maxAttempts, MUTATION_MAX_ATTEMPTS);
});
