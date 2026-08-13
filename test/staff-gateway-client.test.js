const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const { callGateway, signGatewayBody } = require('../lib/staff-gateway-client');

const env = {
    STAFF_GATEWAY_URL: 'https://script.google.com/macros/s/test/exec',
    LOCATION_GATEWAY_SECRET: 'synthetic-gateway-secret',
};

test('Gateway client signs and sends the exact Unicode raw body', async () => {
    let captured;
    const result = await callGateway('resolveUnits', { email: 'cán bộ@example.test', note: 'Địa điểm' }, {
        env,
        requestId: 'read_1',
        fetchImpl: async (url, options) => {
            captured = { url, options };
            return { ok: true, status: 200, json: async () => ({ ok: true, data: { units: [] } }) };
        },
    });
    assert.deepEqual(result, { units: [] });
    const timestamp = new URL(captured.url).searchParams.get('timestamp');
    const signature = new URL(captured.url).searchParams.get('signature');
    assert.equal(signature, signGatewayBody(captured.options.body, Number(timestamp), env.LOCATION_GATEWAY_SECRET));
    assert.match(captured.options.body, /cán bộ/);
    assert.equal(captured.options.body, JSON.stringify({ action: 'resolveUnits', request_id: 'read_1', payload: { email: 'cán bộ@example.test', note: 'Địa điểm' } }));
});

test('Gateway transport retry keeps request id and exact body but rotates timestamp/signature', async () => {
    const calls = [];
    const result = await callGateway('submitRequest', { request_id: 'stable-id', value: 'Đồng bộ' }, {
        env,
        requestId: 'stable-id',
        fetchImpl: async (url, options) => {
            calls.push({ url, options });
            if (calls.length === 1) throw new Error('network');
            return { ok: true, status: 200, json: async () => ({ ok: true, data: { status: 'PENDING' } }) };
        },
    });
    assert.deepEqual(result, { status: 'PENDING' });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].options.body, calls[1].options.body);
    assert.match(new URL(calls[0].url).searchParams.get('timestamp'), /^\d+$/);
    assert.match(new URL(calls[1].url).searchParams.get('signature'), /^[0-9a-f]{64}$/);
});

test('Gateway response errors are validated and unknown errors are sanitized', async () => {
    const safe = await assert.rejects(() => callGateway('submitRequest', {}, {
        env, fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ ok: false, error: { code: 'TARGET_RECORD_ID_NOT_FOUND' } }) }),
    }));
    assert.equal(safe, undefined);
    await assert.rejects(() => callGateway('submitRequest', {}, {
        env, fetchImpl: async () => ({ ok: true, status: 400, json: async () => ({ ok: false, error: { code: 'IMAGE_REQUIRED' } }) }),
    }), error => error.code === 'IMAGE_REQUIRED');
    await assert.rejects(() => callGateway('submitRequest', {}, {
        env, fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ ok: false, error: { code: 'PRIVATE_ROW_SECRET' } }) }),
    }), error => error.code === 'STAFF_GATEWAY_REJECTED' && error.gatewayCode === 'PRIVATE_ROW_SECRET');
    await assert.rejects(() => callGateway('submitRequest', {}, {
        env, timeoutMs: 10, fetchImpl: async () => { throw new Error('offline'); },
    }), error => error.code === 'STAFF_GATEWAY_UNAVAILABLE');
});

test('Gateway client rejects malformed config and malformed response', async () => {
    await assert.rejects(() => callGateway('resolveUnits', {}, { env: { ...env, STAFF_GATEWAY_URL: 'https://example.test/not-exec' } }), /STAFF_GATEWAY_CONFIG_INVALID/);
    await assert.rejects(() => callGateway('resolveUnits', {}, { env, fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ html: '<html>' }) }) }), /STAFF_GATEWAY_INVALID_RESPONSE/);
});

test('Gateway timeout AbortError is sanitized and remains bounded', async () => {
    const attempts = [];
    await assert.rejects(() => callGateway('resolveUnits', {}, {
        env, timeoutMs: 5,
        fetchImpl: async (url, options) => {
            attempts.push({ url, body: options.body });
            await new Promise((resolve, reject) => {
                options.signal.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')), { once: true });
            });
        },
    }), error => error.code === 'STAFF_GATEWAY_UNAVAILABLE' && !/AbortError|DOMException|stack/i.test(error.message));
    assert.equal(attempts.length, 2);
    assert.equal(attempts[0].body, attempts[1].body);
});

test('signature helper matches Node HMAC UTF-8 bytes', () => {
    const raw = JSON.stringify({ value: 'Tiếng Việt' });
    const expected = crypto.createHmac('sha256', env.LOCATION_GATEWAY_SECRET).update(`123.${raw}`, 'utf8').digest('hex');
    assert.equal(signGatewayBody(raw, 123, env.LOCATION_GATEWAY_SECRET), expected);
});
