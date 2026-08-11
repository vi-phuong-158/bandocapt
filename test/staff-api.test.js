const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const { createStaffApi, deriveGatewayRequestId, validateStaffImage } = require('../lib/staff-api');
const { snapshotHash } = require('../lib/staff-location-contract');
const { createStaffSession } = require('../lib/staff-session');

const SECRET = 'synthetic-staff-session-secret-32-bytes';
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
            return { sub: 'google-sub-a', email: 'staff@example.test' };
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
    assert.deepEqual(loginResponse.body.data.user, { email: 'staff@example.test' });
    assert.match(loginResponse.getHeader('Set-Cookie').join('\n'), /staff_session=.*HttpOnly/);
    assert.equal(calls[0].action, 'resolveUnits');
    assert.deepEqual(calls[0].payload, { email: 'staff@example.test' });
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
    const api = createStaffApi({
        env: ENV,
        gatewayCall: async (action, payload) => {
            calls.push({ action, payload });
            if (action === 'resolveUnits') return { units: [{ unitCode: 'UNIT_A', unitName: 'Đơn vị A' }] };
            return { status: 'PENDING' };
        },
        getLocations: async () => ({ locations: [location] }),
    });
    const baseHeaders = { ...csrfHeaders(), cookie: `staff_session=${encodeURIComponent(session)}; staff_csrf=csrf-token` };
    const create = response();
    await api.requests(request('POST', {
        operationId: 'op_create', requestType: 'Thêm địa điểm mới', unitCode: 'UNIT_A',
        email: 'victim@example.test', actor_email: 'victim@example.test', publicPhone: '0210',
    }, baseHeaders), create);
    assert.equal(create.statusCode, 200);
    const submitCall = calls.find(call => call.action === 'submitRequest');
    assert.equal(submitCall.payload.email, 'staff@example.test');
    assert.equal(submitCall.payload.unit_code, 'UNIT_A');
    assert.equal('actor_email' in submitCall.payload, false);

    const target = response();
    await api.requests(request('POST', { operationId: 'op_bad', requestType: 'Thêm địa điểm mới', targetRecordId: 'R_A' }, baseHeaders), target);
    assert.equal(target.statusCode, 400);
    assert.equal(target.body.error.code, 'CREATE_TARGET_RECORD_ID_NOT_ALLOWED');

    const stale = response();
    await api.requests(request('POST', { operationId: 'op_stale', requestType: 'Cập nhật địa điểm đang có', targetRecordId: 'R_A', snapshotHash: '0'.repeat(64) }, baseHeaders), stale);
    assert.equal(stale.statusCode, 409);
    assert.equal(calls.filter(call => call.action === 'submitRequest').length, 1);
});

test('staff image preflight rejects malformed and over-cap decoded payloads', () => {
    assert.equal(validateStaffImage(null), null);
    assert.throws(() => validateStaffImage({ base64: 'not-base64' }), /IMAGE_ENCODING_INVALID/);
    const oversized = Buffer.alloc(3 * 1024 * 1024 + 1).toString('base64');
    assert.throws(() => validateStaffImage({ base64: oversized }), /STAFF_IMAGE_TOO_LARGE|IMAGE_ENCODING_INVALID/);
    const tiny = Buffer.from('synthetic').toString('base64');
    assert.equal(validateStaffImage({ base64: tiny }).base64, tiny);
});
