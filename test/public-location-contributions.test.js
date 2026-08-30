'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const test = require('node:test');

const pipeline = require('../setup/apps-script');
const workbookConfig = require('../lib/location-workbooks');
const createGateway = require('../setup/staff-gateway');
const publicApi = require('../api/location-contributions');

const SECRET = 'public-test-secret';
const NOW = 1_786_320_000_000;
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]).toString('base64');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');
const WEBP = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]).toString('base64');
const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = global.fetch;

function allowlist() {
    return [
        { unit_code: 'CA_XA_HY_CUONG', unit_name: 'Công an phường A', allowed_emails: 'staff@example.gov.vn', active: true },
        { unit_code: 'CA_OFF', unit_name: 'Công an phường đã tắt', allowed_emails: '', active: false },
    ];
}

function publicPayload(overrides = {}) {
    return {
        request_id: 'public-request-1', operation_id: 'public-operation-1', request_type: pipeline.REQUEST_TYPES.create,
        unit_code: 'CA_XA_HY_CUONG', location_name: 'Điểm tiếp dân A', address: 'Địa chỉ A',
        maps_url_original: 'https://www.google.com/maps/@21.3225,105.4027,16z', maps_url_resolved: 'https://www.google.com/maps/@21.3225,105.4027,16z',
        coordinates: '21.3225,105.4027', submitter_name: 'Người dân', submitter_phone: '0210000000', review_note: 'Ghi chú',
        image: { base64: JPEG, mimeType: 'image/png', filename: 'spoof.png', size: 1 }, ...overrides,
    };
}

function makeStore(options = {}) {
    const ledgers = new Map();
    const staging = [];
    const audits = [];
    const files = new Map();
    let creates = 0;
    let failUploadLedgerUpdate = Boolean(options.failUploadLedgerUpdate);
    let failAfterStagingAppend = Boolean(options.failAfterStagingAppend);
    return {
        getRows: sheet => sheet === 'Unit_Allowlist' ? allowlist() : sheet === 'Location_Staging' ? staging : sheet === 'Approval_Audit_Log' ? audits : [],
        findLedger: id => ledgers.get(id) || null,
        createLedger: row => ledgers.set(row.request_id, { ...row }),
        updateLedger: (id, patch) => {
            if (failUploadLedgerUpdate && patch.state === 'UPLOAD_PERSISTED') {
                failUploadLedgerUpdate = false;
                throw new Error('SIMULATED_CRASH_AFTER_IMAGE');
            }
            const current = ledgers.get(id);
            ledgers.set(id, { ...current, ...patch });
        },
        findStagingByRequestId: id => staging.find(row => row.request_id === id) || null,
        appendStaging: row => {
            staging.push({ ...row });
            if (failAfterStagingAppend) {
                failAfterStagingAppend = false;
                throw new Error('SIMULATED_CRASH_AFTER_STAGING');
            }
        },
        hasApprovalAudit: (id, action) => audits.some(row => row.request_id === id && row.action === action),
        appendApprovalAudit: row => audits.push({ ...row }),
        findDriveResource: key => files.get(key) || null,
        createPrivateImage: ({ resourceKey, mimeType }) => {
            creates += 1;
            const file = { fileId: `private-file-${creates}`, driveUrl: `https://drive.invalid/${creates}`, mimeType };
            files.set(resourceKey, file);
            return file;
        },
        counts: () => ({ staging: staging.length, audits: audits.length, images: creates }),
        rows: () => ({ staging, audits, files }),
    };
}

function gateway(store, now = NOW) {
    return createGateway({
        pipeline, workbookConfig, store,
        runtime: {
            env: { PRIVATE_LOCATION_SPREADSHEET_ID: 'private-test', PUBLIC_LOCATION_SPREADSHEET_ID: 'public-test' },
            secret: SECRET, now: () => now, decodeBase64: value => Buffer.from(value, 'base64'),
            sha256Hex: value => crypto.createHash('sha256').update(value).digest('hex'),
            hmacSha256Hex: (message, secret) => crypto.createHmac('sha256', secret).update(message).digest('hex'),
            withLock: callback => callback(),
        },
    });
}

function response(status, body, headers = {}) {
    return {
        ok: status >= 200 && status < 300, status,
        headers: { get: name => headers[name.toLowerCase()] || headers[name] || null },
        json: async () => body,
        text: async () => JSON.stringify(body),
    };
}

function apiRequest(method, body, headers = {}, url = '/api/location-contributions') {
    return { method, url, body, headers: { origin: 'https://bandocapt.vercel.app', 'user-agent': 'Mozilla/5.0 test', ...headers } };
}

function apiResponse() {
    return {
        statusCode: 200, headers: {}, body: null,
        setHeader(name, value) { this.headers[name] = value; },
        status(code) { this.statusCode = code; return this; },
        json(value) { this.body = value; return this; },
        end() { return this; },
    };
}

function signedHeaders(operationId, requestTime = Date.now()) {
    requestTime = String(requestTime);
    const host = 'bandocapt.vercel.app';
    const userAgent = 'Mozilla/5.0 test';
    const digest = crypto.createHash('sha256').update(operationId).digest('hex').slice(0, 32);
    const signData = `${requestTime}:${host}:${userAgent.length}:${digest}`;
    const key = `xnc-phu-tho:${host}:${userAgent.slice(0, 16)}`;
    return { 'x-request-time': requestTime, 'x-request-token': crypto.createHmac('sha256', key).update(signData).digest('hex') };
}

test.afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    global.fetch = ORIGINAL_FETCH;
});

test('public Gateway CREATE is PENDING, private, provenance-marked, and has no staff email requirement', () => {
    const store = makeStore();
    const result = gateway(store).submitPublicContribution(publicPayload());
    assert.deepEqual(result, { requestId: 'public-request-1', status: 'PENDING' });
    assert.deepEqual(store.counts(), { staging: 1, audits: 1, images: 1 });
    const row = store.rows().staging[0];
    assert.equal(row.status, pipeline.STATUSES.pending);
    assert.equal(row.auth_status, 'PUBLIC_CAPTCHA');
    assert.equal(row.submitter_email, 'public-web@bandocapt.invalid');
    assert.equal(row.image_public_url, '');
    assert.equal(store.rows().audits[0].action, 'PUBLIC_SUBMIT');
    assert.equal(JSON.stringify(result).includes('private-file'), false);
    assert.equal(JSON.stringify(result).includes('recordId'), false);
});

test('public unit directory contains all 148 canonical units, including units with no published location', () => {
    const result = gateway(makeStore()).listPublicContributionUnits();
    assert.equal(result.units.length, 148);
    assert.equal(result.units.some(u => u.unitCode === 'CA_XA_VINH_PHU'), true);
    assert.equal(JSON.stringify(result).includes('allowed_emails'), false);
    assert.equal(JSON.stringify(result).includes('notes'), false);
});

test('public Gateway rejects inactive/unknown units, non-CREATE, target IDs, and missing images', () => {
    for (const [name, overrides, expected] of [
        ['inactive', { unit_code: 'CA_OFF' }, 'PUBLIC_UNIT_NOT_ALLOWED'],
        ['unknown', { unit_code: 'CA_UNKNOWN' }, 'PUBLIC_UNIT_NOT_ALLOWED'],
        ['update', { request_type: pipeline.REQUEST_TYPES.update }, 'PUBLIC_REQUEST_TYPE_NOT_ALLOWED'],
        ['stop', { request_type: pipeline.REQUEST_TYPES.stop }, 'PUBLIC_REQUEST_TYPE_NOT_ALLOWED'],
        ['correct', { request_type: pipeline.REQUEST_TYPES.correct }, 'PUBLIC_REQUEST_TYPE_NOT_ALLOWED'],
        ['target', { target_record_id: 'PRIVATE_TARGET' }, 'CREATE_TARGET_RECORD_ID_NOT_ALLOWED'],
        ['unsupported maps host', { maps_url_original: 'https://evil.example/maps/@21.3225,105.4027,16z' }, 'COORDINATE_INVALID_LINK'],
        ['outside Phu Tho', { coordinates: '10.762622,106.660172' }, 'COORDINATE_OUTSIDE_PHU_THO'],
        ['no image', { image: undefined }, 'IMAGE_REQUIRED'],
    ]) {
        const payload = publicPayload(overrides);
        if (name === 'no image') delete payload.image;
        assert.throws(() => gateway(makeStore()).submitPublicContribution(payload), new RegExp(expected));
    }
});

test('public Gateway validates image bytes and idempotency, including retry after image persistence', () => {
    const badBytes = publicPayload({ image: { base64: Buffer.from('not image').toString('base64'), mimeType: 'image/jpeg' } });
    assert.throws(() => gateway(makeStore()).submitPublicContribution(badBytes), /IMAGE_TYPE_NOT_ALLOWED/);
    const badBase64 = publicPayload({ image: { base64: '%%%=', mimeType: 'image/jpeg' } });
    assert.throws(() => gateway(makeStore()).submitPublicContribution(badBase64), /IMAGE_ENCODING_INVALID/);

    const store = makeStore({ failUploadLedgerUpdate: true });
    const instance = gateway(store);
    assert.throws(() => instance.submitPublicContribution(publicPayload()), /PUBLIC_SUBMIT_FAILED/);
    const retry = instance.submitPublicContribution(publicPayload());
    assert.equal(retry.status, 'PENDING');
    assert.equal(store.counts().staging, 1);
    assert.equal(store.counts().audits, 1);
    assert.equal(store.counts().images, 1);

    assert.throws(() => instance.submitPublicContribution(publicPayload({ address: 'Payload khác' })), /IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD/);

    for (const bytes of [PNG, WEBP]) {
        const accepted = gateway(makeStore()).submitPublicContribution(publicPayload({ request_id: `request-${bytes.slice(0, 4)}`, operation_id: `operation-${bytes.slice(0, 4)}`, image: { base64: bytes, mimeType: 'image/jpeg' } }));
        assert.equal(accepted.status, 'PENDING');
    }

    const afterStaging = makeStore({ failAfterStagingAppend: true });
    const afterStagingGateway = gateway(afterStaging);
    assert.throws(() => afterStagingGateway.submitPublicContribution(publicPayload()), /PUBLIC_SUBMIT_FAILED/);
    const afterStagingRetry = afterStagingGateway.submitPublicContribution(publicPayload());
    assert.equal(afterStagingRetry.status, 'PENDING');
    assert.equal(afterStaging.counts().staging, 1);
    assert.equal(afterStaging.counts().audits, 1);
    assert.equal(afterStaging.counts().images, 1);
});

test('public API DTO exposes only safe unit fields and deterministic request IDs', () => {
    assert.deepEqual(publicApi.toSafeUnits({ locations: [
        { unitCode: 'CA_A', name: 'Công an A', phone: 'private', allowedEmails: 'private' },
        { unitCode: 'ca_a', name: 'Tên trùng', email: 'private' },
        { unitCode: 'CA_B', name: 'Công an B' },
    ] }), [{ unitCode: 'CA_A', label: 'Công an A' }, { unitCode: 'CA_B', label: 'Công an B' }]);
    assert.deepEqual(publicApi.toSafeUnits({ units: [
        { unitCode: 'CA_NEW', unitName: 'Công an đơn vị mới', allowed_emails: 'private', notes: 'private' },
    ] }), [{ unitCode: 'CA_NEW', label: 'Công an đơn vị mới' }]);
    assert.equal(publicApi.deriveGatewayRequestId('operation-1'), publicApi.deriveGatewayRequestId('operation-1'));
    assert.notEqual(publicApi.deriveGatewayRequestId('operation-1'), publicApi.deriveGatewayRequestId('operation-2'));
    assert.throws(() => publicApi.validateBody({ operationId: 'x', unitCode: 'CA_XA_HY_CUONG', locationName: 'A', address: 'B', mapsUrl: 'https://maps.google.com', image: { base64: JPEG }, email: 'staff@example.gov.vn' }), /UNKNOWN_FIELD/);
    assert.throws(() => publicApi.validateBody({ operationId: 'x', requestType: pipeline.REQUEST_TYPES.update, unitCode: 'CA_XA_HY_CUONG', locationName: 'A', address: 'B', mapsUrl: 'https://maps.google.com', image: { base64: JPEG } }), /PUBLIC_REQUEST_TYPE_NOT_ALLOWED/);
});

test('public config exposes only the public Turnstile sitekey and supports Preview overrides', async () => {
    process.env.TURNSTILE_SITE_KEY = '0xTEST_PUBLIC_SITE_KEY';
    const result = apiResponse();
    await publicApi(apiRequest('GET', undefined, {}, '/api/location-contributions?config=public'), result);
    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.body, { ok: true, data: { turnstileSiteKey: '0xTEST_PUBLIC_SITE_KEY' } });
    assert.equal(JSON.stringify(result.body).includes('TURNSTILE_SECRET_KEY'), false);
    assert.equal(JSON.stringify(result.body).includes('turnstile-secret'), false);
    assert.match(publicApi.publicConfig({ TURNSTILE_SITE_KEY: 'turnstile-secret' }).turnstileSiteKey, /^0x/);
    assert.equal(publicApi.publicConfig({ TURNSTILE_SITE_KEY: '1x00000000000000000000AA' }).turnstileSiteKey, '1x00000000000000000000AA');
});

test('public GET accepts native same-origin browser metadata but keeps raw missing-Origin requests fail-closed', async () => {
    process.env.TURNSTILE_SITE_KEY = '0xTEST_PUBLIC_SITE_KEY';
    const rawMissingOrigin = apiResponse();
    await publicApi({ method: 'GET', url: '/api/location-contributions?config=public', headers: {} }, rawMissingOrigin);
    assert.equal(rawMissingOrigin.statusCode, 403);
    assert.equal(rawMissingOrigin.headers['Cache-Control'], 'no-store, no-cache, must-revalidate');

    const browserGet = apiResponse();
    await publicApi({
        method: 'GET', url: '/api/location-contributions?config=public',
        headers: {
            host: 'bandocapt-rehearsal.example.vercel.app',
            'x-forwarded-proto': 'https',
            'sec-fetch-site': 'same-origin',
            referer: 'https://bandocapt-rehearsal.example.vercel.app/dong-gop',
        },
    }, browserGet);
    assert.equal(browserGet.statusCode, 200);
    assert.deepEqual(browserGet.body, { ok: true, data: { turnstileSiteKey: '0xTEST_PUBLIC_SITE_KEY' } });

    const crossOriginBrowserGet = apiResponse();
    await publicApi({
        method: 'GET', url: '/api/location-contributions?config=public',
        headers: {
            host: 'bandocapt-rehearsal.example.vercel.app',
            'x-forwarded-proto': 'https',
            'sec-fetch-site': 'cross-site',
            referer: 'https://evil.example/dong-gop',
        },
    }, crossOriginBrowserGet);
    assert.equal(crossOriginBrowserGet.statusCode, 403);
});

test('public API denies origin/signature/CAPTCHA failures and returns only safe PENDING data on success', async () => {
    const deniedOrigin = apiResponse();
    await publicApi(apiRequest('GET', undefined, { origin: 'https://evil.example' }), deniedOrigin);
    assert.equal(deniedOrigin.statusCode, 403);

    const safeUnitList = apiResponse();
    await publicApi(apiRequest('GET'), safeUnitList);
    assert.equal(safeUnitList.statusCode, 200);
    assert.equal(safeUnitList.body.data.units.length, 148);
    assert.equal(safeUnitList.body.data.units.some(u => u.unitCode === 'CA_XA_VINH_PHU'), true);
    assert.equal(safeUnitList.body.data.units.some(u => u.unitCode === 'TEST_CA_TEST'), false);
    assert.equal(JSON.stringify(safeUnitList.body).includes('allowed_emails'), false);

    const missingSignature = apiResponse();
    await publicApi(apiRequest('POST', { operationId: 'op-missing', requestType: pipeline.REQUEST_TYPES.create, unitCode: 'CA_XA_HY_CUONG', locationName: 'A', address: 'B', mapsUrl: 'https://www.google.com/maps/@21.3225,105.4027,16z', image: { base64: JPEG }, captchaToken: 'token' }), missingSignature);
    assert.equal(missingSignature.statusCode, 403);

    process.env.NODE_ENV = 'production';
    process.env.TURNSTILE_SECRET_KEY = 'turnstile-secret';
    process.env.KV_REST_API_URL = 'https://redis.example.test';
    process.env.KV_REST_API_TOKEN = 'test-redis-token';
    process.env.LOCATION_GATEWAY_SECRET = SECRET;
    process.env.STAFF_GATEWAY_URL = 'https://gateway.example.test/exec';
    delete process.env.CHAT_LOG_HASH_SALT;
    const missingSalt = apiResponse();
    global.fetch = async url => String(url).includes('siteverify') ? response(200, { success: true }) : response(500, {});
    await publicApi(apiRequest('POST', { operationId: 'op-missing-salt', requestType: pipeline.REQUEST_TYPES.create, unitCode: 'CA_XA_HY_CUONG', locationName: 'A', address: 'B', mapsUrl: 'https://www.google.com/maps/@21.3225,105.4027,16z', image: { base64: JPEG }, captchaToken: 'token' }, signedHeaders('op-missing-salt')), missingSalt);
    assert.equal(missingSalt.statusCode, 503);
    process.env.CHAT_LOG_HASH_SALT = 'test-only-hash-salt';
    const invalidCaptcha = apiResponse();
    global.fetch = async url => String(url).includes('siteverify') ? response(200, { success: false }) : response(500, {});
    await publicApi(apiRequest('POST', { operationId: 'op-captcha', requestType: pipeline.REQUEST_TYPES.create, unitCode: 'CA_XA_HY_CUONG', locationName: 'A', address: 'B', mapsUrl: 'https://www.google.com/maps/@21.3225,105.4027,16z', image: { base64: JPEG }, captchaToken: 'token' }, signedHeaders('op-captcha')), invalidCaptcha);
    assert.equal(invalidCaptcha.statusCode, 403);

    const success = apiResponse();
    global.fetch = async (url, options = {}) => {
        if (String(url).includes('siteverify')) return response(200, { success: true });
        const body = typeof options.body === 'string' ? JSON.parse(options.body) : null;
        if (Array.isArray(body) && body[0] === 'EVAL') return response(200, { result: 1 });
        return response(200, { ok: true, data: { status: 'PENDING', requestId: 'private-not-public' } });
    };
    const body = { operationId: 'op-success', requestType: pipeline.REQUEST_TYPES.create, unitCode: 'CA_XA_HY_CUONG', locationName: 'A', address: 'B', mapsUrl: 'https://www.google.com/maps/@21.3225,105.4027,16z', image: { base64: JPEG, mimeType: 'image/png' }, captchaToken: 'token' };
    await publicApi(apiRequest('POST', body, signedHeaders('op-success')), success);
    assert.equal(success.statusCode, 200);
    assert.deepEqual(success.body.data.status, 'PENDING');
    assert.equal(JSON.stringify(success.body).includes('private-not-public'), false);
    assert.equal(JSON.stringify(success.body).includes('gateway.example.test'), false);
});

test('public error and diagnostic code utilities map safe error codes', () => {
    assert.equal(publicApi.safeGatewayDiagnosticCode({ gatewayCode: 'PRIVATE_LOCATION_SPREADSHEET_ID_MISSING' }), 'PRIVATE_LOCATION_SPREADSHEET_ID_MISSING');
    assert.equal(publicApi.safeGatewayDiagnosticCode({ gatewayCode: 'private-sheet-id' }), 'UNKNOWN');
    assert.equal(publicApi.safeGatewayDiagnosticCode({}), 'UNKNOWN');
});

test('public API boundary rejects malformed, stale, oversized, invalid-map, gateway, and rate-limit cases safely', async () => {
    const validBody = (operationId, overrides = {}) => ({
        operationId, requestType: pipeline.REQUEST_TYPES.create, unitCode: 'CA_XA_HY_CUONG', locationName: 'A', address: 'B',
        mapsUrl: 'https://www.google.com/maps/@21.3225,105.4027,16z', image: { base64: JPEG }, captchaToken: 'captcha', ...overrides,
    });

    const method = apiResponse();
    await publicApi(apiRequest('PUT', undefined), method);
    assert.equal(method.statusCode, 405);

    const malformed = apiResponse();
    await publicApi(apiRequest('POST', '{'), malformed);
    assert.equal(malformed.statusCode, 400);

    const missingBody = apiResponse();
    await publicApi(apiRequest('POST', undefined), missingBody);
    assert.equal(missingBody.statusCode, 400);

    const stale = apiResponse();
    await publicApi(apiRequest('POST', validBody('op-stale'), signedHeaders('op-stale', Date.now() - 5 * 60 * 1000 - 1)), stale);
    assert.equal(stale.statusCode, 403);

    const oversized = apiResponse();
    await publicApi(apiRequest('POST', 'x'.repeat(publicApi.MAX_REQUEST_BYTES + 1)), oversized);
    assert.equal(oversized.statusCode, 413);

    const tooLong = apiResponse();
    await publicApi(apiRequest('POST', validBody('op-too-long', { locationName: 'x'.repeat(201) }), signedHeaders('op-too-long')), tooLong);
    assert.equal(tooLong.statusCode, 400);

    process.env.NODE_ENV = 'development';
    process.env.EVAL_BYPASS_TOKEN = 'captcha';
    const badMaps = apiResponse();
    await publicApi(apiRequest('POST', validBody('op-bad-maps', { mapsUrl: 'https://evil.example/maps' }), signedHeaders('op-bad-maps')), badMaps);
    assert.equal(badMaps.statusCode, 400);
    assert.equal(badMaps.body.error, 'COORDINATE_INVALID_LINK');

    delete process.env.STAFF_GATEWAY_URL;
    delete process.env.LOCATION_GATEWAY_SECRET;
    const unavailable = apiResponse();
    await publicApi(apiRequest('POST', validBody('op-unavailable'), signedHeaders('op-unavailable')), unavailable);
    assert.equal(unavailable.statusCode, 503);
    assert.equal(JSON.stringify(unavailable.body).includes('STAFF_GATEWAY_CONFIG_INVALID'), false);

    process.env.STAFF_GATEWAY_URL = 'https://gateway.example.test/exec';
    process.env.LOCATION_GATEWAY_SECRET = SECRET;
    global.fetch = async () => response(500, { ok: false, error: { code: 'PRIVATE_STACK_TRACE', message: 'private details' } });
    const internalFailure = apiResponse();
    await publicApi(apiRequest('POST', validBody('op-internal-failure'), signedHeaders('op-internal-failure')), internalFailure);
    assert.equal(internalFailure.statusCode, 503);
    assert.equal(JSON.stringify(internalFailure.body).includes('PRIVATE_STACK_TRACE'), false);
    assert.equal(JSON.stringify(internalFailure.body).includes('private details'), false);

    delete process.env.EVAL_BYPASS_TOKEN;
    process.env.TURNSTILE_SECRET_KEY = 'turnstile-secret';
    global.fetch = async () => { throw new Error('turnstile remote failure'); };
    const captchaRemoteFailure = apiResponse();
    await publicApi(apiRequest('POST', validBody('op-captcha-remote'), signedHeaders('op-captcha-remote')), captchaRemoteFailure);
    assert.equal(captchaRemoteFailure.statusCode, 403);

    process.env.NODE_ENV = 'development';
    process.env.EVAL_BYPASS_TOKEN = 'captcha';
    process.env.PUBLIC_LOCATION_DAILY_IP_LIMIT = '1';
    global.fetch = async () => response(200, { ok: true, data: { status: 'PENDING' } });
    const rateHeaders = { ...signedHeaders('op-rate-1'), 'x-vercel-forwarded-for': '203.0.113.99' };
    const first = apiResponse();
    await publicApi(apiRequest('POST', validBody('op-rate-1'), rateHeaders), first);
    assert.equal(first.statusCode, 200);
    const second = apiResponse();
    await publicApi(apiRequest('POST', validBody('op-rate-2'), { ...signedHeaders('op-rate-2'), 'x-vercel-forwarded-for': '203.0.113.99' }), second);
    assert.equal(second.statusCode, 429);
});

test('public static entry contains required fields and no staff login surface', () => {
    const html = fs.readFileSync('dong-gop/index.html', 'utf8');
    assert.match(html, /Đóng góp địa điểm/);
    assert.match(html, /name="unitCode"[^>]+required/);
    assert.match(html, /name="locationName"[^>]+required/);
    assert.match(html, /name="address"[^>]+required/);
    assert.match(html, /name="mapsUrl"[^>]+required/);
    assert.match(html, /name="image"[^>]+required/);
    assert.match(html, /public-turnstile-widget/);
    assert.match(html, /data-sitekey=""/);
    assert.doesNotMatch(html, /data-sitekey="0x/);
    assert.doesNotMatch(html, /Google Sign-In|google-client-id|staff-session/i);
});
test('Phase 5 Regression: 148 canonical units public directory, missing location submission, unknown unit rejection, and staff auth isolation', async () => {
    // 1. GET returns all 148 units
    const listRes = apiResponse();
    await publicApi(apiRequest('GET'), listRes);
    assert.equal(listRes.statusCode, 200);
    assert.equal(listRes.body.ok, true);
    assert.equal(listRes.body.data.units.length, 148);

    // 2. 7 units without existing location/staff email are present
    const missing7 = [
        'CA_XA_VINH_PHU', 'CA_XA_NHAN_NGHIA', 'CA_XA_YEN_PHU',
        'CA_XA_AN_NGHIA', 'CA_XA_CAO_DUONG', 'CA_XA_MUONG_HOA',
        'CA_PHUONG_TAN_HOA',
    ];
    missing7.forEach(code => {
        const found = listRes.body.data.units.find(u => u.unitCode === code);
        assert.ok(found, `Missing unit ${code} must appear in public directory`);
        assert.ok(found.label.startsWith('Công an '));
    });

    // 3. Synthetic TEST unit is strictly absent
    assert.equal(listRes.body.data.units.some(u => u.unitCode === 'TEST_CA_TEST'), false);
    assert.equal(listRes.body.data.units.some(u => u.label.includes('TEST')), false);

    // 4. Unknown or synthetic unitCode in submit is rejected with 400 UNIT_NOT_ALLOWED
    process.env.NODE_ENV = 'development';
    process.env.EVAL_BYPASS_TOKEN = 'captcha';
    for (const badCode of ['TEST_CA_TEST', 'CA_UNKNOWN', 'CA_INVALID']) {
        const badRes = apiResponse();
        const badPayload = {
            operationId: 'op-bad-unit-' + badCode,
            requestType: pipeline.REQUEST_TYPES.create,
            unitCode: badCode,
            locationName: 'Điểm kiểm thử',
            address: 'Địa chỉ kiểm thử',
            mapsUrl: 'https://www.google.com/maps/@21.3225,105.4027,16z',
            image: { base64: JPEG, mimeType: 'image/jpeg' },
            captchaToken: 'captcha',
        };
        await publicApi(apiRequest('POST', badPayload, signedHeaders(badPayload.operationId)), badRes);
        assert.equal(badRes.statusCode, 400);
        assert.equal(badRes.body.error, 'UNIT_NOT_ALLOWED');
    }

    // 5. Canonical unit without existing location (e.g. CA_XA_VINH_PHU) submits successfully
    process.env.STAFF_GATEWAY_URL = 'https://gateway.example.test/exec';
    process.env.LOCATION_GATEWAY_SECRET = SECRET;
    global.fetch = async (url, options = {}) => {
        if (String(url).includes('siteverify')) return response(200, { success: true });
        return response(200, { ok: true, data: { status: 'PENDING', requestId: 'staged-req-vinh-phu' } });
    };
    const submitVinhPhuRes = apiResponse();
    const vinhPhuPayload = {
        operationId: 'op-submit-vinh-phu',
        requestType: pipeline.REQUEST_TYPES.create,
        unitCode: 'CA_XA_VINH_PHU',
        locationName: 'Trụ sở Công an xã Vĩnh Phú',
        address: 'Xã Vĩnh Phú, huyện Phù Ninh, Phú Thọ',
        mapsUrl: 'https://www.google.com/maps/@21.3225,105.4027,16z',
        image: { base64: JPEG, mimeType: 'image/jpeg' },
        captchaToken: 'captcha',
    };
    await publicApi(apiRequest('POST', vinhPhuPayload, signedHeaders(vinhPhuPayload.operationId)), submitVinhPhuRes);
    assert.equal(submitVinhPhuRes.statusCode, 200);
    assert.equal(submitVinhPhuRes.body.ok, true);
    assert.equal(submitVinhPhuRes.body.data.status, 'PENDING');

    // 6. Staff Authorization remains strictly bound to Unit_Allowlist
    const privateAllowlistRows = [
        { unit_code: 'CA_XA_HY_CUONG', unit_name: 'Công an xã Hy Cương', allowed_emails: 'staff.hycuong@phutho.gov.vn', active: true },
    ];
    // Email for Hy Cuong only resolves Hy Cuong
    const hyCuongUnits = pipeline.resolveUnitsByEmail('staff.hycuong@phutho.gov.vn', privateAllowlistRows);
    assert.deepEqual(hyCuongUnits, [{ unitCode: 'CA_XA_HY_CUONG', unitName: 'Công an xã Hy Cương' }]);

    // Email not in allowlist cannot access any unit, even if the unit is in canonical directory
    const unassignedUnits = pipeline.resolveUnitsByEmail('unknown.staff@phutho.gov.vn', privateAllowlistRows);
    assert.deepEqual(unassignedUnits, []);

    // Canonical unit without staff email (e.g. CA_XA_VINH_PHU) cannot be authorized for staff portal
    const vinhPhuStaffUnits = pipeline.resolveUnitsByEmail('someone@phutho.gov.vn', privateAllowlistRows);
    assert.deepEqual(vinhPhuStaffUnits, []);
});

// ==================================================
// Acceptance Gate: Canonical unit without Unit_Allowlist entry
// ==================================================
// Proves end-to-end that a unit belonging to the 148 canonical directory
// but having NO entry in Unit_Allowlist (no staff email, no active row)
// can still complete the full public contribution pipeline.
// ==================================================

test('Gateway submitPublicContribution ACCEPTS canonical unit with NO Unit_Allowlist entry and REJECTS non-canonical', () => {
    // Allowlist deliberately does NOT contain CA_XA_VINH_PHU, CA_XA_NHAN_NGHIA, etc.
    const store = makeStore();
    const gw = gateway(store);

    // --- ACCEPT: canonical unit absent from allowlist ---
    const missingUnitPayload = publicPayload({
        request_id: 'acceptance-vinh-phu-1',
        operation_id: 'acceptance-vinh-phu-1',
        unit_code: 'CA_XA_VINH_PHU',
        location_name: 'Trụ sở Công an xã Vĩnh Phú',
        address: 'Xã Vĩnh Phú, huyện Phù Ninh, Phú Thọ',
    });
    const result = gw.submitPublicContribution(missingUnitPayload);
    assert.equal(result.status, 'PENDING', 'canonical unit without allowlist entry must be accepted');
    assert.equal(result.requestId, 'acceptance-vinh-phu-1');

    // Staging record must have correct canonical unit identity
    const staged = store.rows().staging.find(r => r.request_id === 'acceptance-vinh-phu-1');
    assert.ok(staged, 'staging record must exist');
    assert.equal(staged.unit_code, 'CA_XA_VINH_PHU');
    assert.equal(staged.unit_name, 'Công an xã Vĩnh Phú');
    assert.equal(staged.status, pipeline.STATUSES.pending);
    assert.equal(staged.auth_status, 'PUBLIC_CAPTCHA');
    assert.equal(staged.submitter_email, 'public-web@bandocapt.invalid');
    // Must NOT have validation errors (no SUBMITTER_EMAIL_MISSING, no UNIT_NAME_MISSING, no auth error)
    assert.equal(staged.validation_errors, '');

    // Audit trail must exist
    const audit = store.rows().audits.find(a => a.request_id === 'acceptance-vinh-phu-1');
    assert.ok(audit, 'audit entry must exist');
    assert.equal(audit.action, 'PUBLIC_SUBMIT');

    // --- ACCEPT: second canonical unit absent from allowlist ---
    const store2 = makeStore();
    const result2 = gateway(store2).submitPublicContribution(publicPayload({
        request_id: 'acceptance-nhan-nghia-1',
        operation_id: 'acceptance-nhan-nghia-1',
        unit_code: 'CA_XA_NHAN_NGHIA',
        location_name: 'Trụ sở Công an xã Nhân Nghĩa',
        address: 'Xã Nhân Nghĩa, huyện Cẩm Khê, Phú Thọ',
    }));
    assert.equal(result2.status, 'PENDING', 'CA_XA_NHAN_NGHIA (no allowlist) must be accepted');

    // --- REJECT: non-canonical unit code ---
    assert.throws(
        () => gateway(makeStore()).submitPublicContribution(publicPayload({
            request_id: 'reject-fake-1',
            operation_id: 'reject-fake-1',
            unit_code: 'CA_XA_FAKE_UNIT',
        })),
        /PUBLIC_UNIT_NOT_ALLOWED/,
        'non-canonical unit must be rejected by Gateway'
    );

    // --- REJECT: synthetic test unit code ---
    assert.throws(
        () => gateway(makeStore()).submitPublicContribution(publicPayload({
            request_id: 'reject-test-1',
            operation_id: 'reject-test-1',
            unit_code: 'TEST_CA_TEST',
        })),
        /PUBLIC_UNIT_NOT_ALLOWED/,
        'synthetic test unit must be rejected by Gateway'
    );

    // --- Staff Authorization remains FAIL-CLOSED ---
    const staffAllowlist = allowlist(); // only CA_XA_HY_CUONG and CA_OFF
    // Canonical unit without allowlist email → staff resolveUnitsByEmail returns empty
    const noStaffAccess = pipeline.resolveUnitsByEmail('random.person@phutho.gov.vn', staffAllowlist);
    assert.deepEqual(noStaffAccess, [], 'staff auth must not grant access for email not in allowlist');

    // Canonical unit present in directory does NOT auto-grant staff access
    const vinhPhuStaff = pipeline.resolveUnitsByEmail('vinhphu.staff@phutho.gov.vn', staffAllowlist);
    assert.deepEqual(vinhPhuStaff, [], 'canonical unit without staff email must not grant staff access');

    // Only allowlisted email gets access, and only to its specific unit
    const authorizedStaff = pipeline.resolveUnitsByEmail('staff@example.gov.vn', staffAllowlist);
    assert.equal(authorizedStaff.length, 1);
    assert.equal(authorizedStaff[0].unitCode, 'CA_XA_HY_CUONG');

    // authorizeSubmission must reject canonical unit without staff email
    const authResult = pipeline.authorizeSubmission('Công an xã Vĩnh Phú', 'random@phutho.gov.vn', staffAllowlist);
    assert.equal(authResult.authorized, false, 'authorizeSubmission must reject canonical unit without staff email');
});
