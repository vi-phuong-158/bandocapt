const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const { callGateway, signGatewayBody, MUTATION_TIMEOUT_MS, MUTATION_MAX_ATTEMPTS, DEFAULT_TIMEOUT_MS } = require('../lib/staff-gateway-client');

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

test('Gateway tolerates a legitimate long mutation: a slow-but-successful response inside the mutation timeout still resolves', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let resolveFetch;
    const fetchPromise = new Promise(resolve => { resolveFetch = resolve; });
    const callPromise = callGateway('submitRequest', { request_id: 'slow-op' }, {
        env, requestId: 'slow-op', timeoutMs: MUTATION_TIMEOUT_MS, maxAttempts: 1,
        fetchImpl: async () => fetchPromise,
    });
    // Advance past the legacy 8s default and the observed 26.633s real-world duration, but stay
    // under the new 40s mutation timeout — proves the abort timer configured at MUTATION_TIMEOUT_MS
    // does not fire while the (simulated) Apps Script execution is still legitimately running.
    t.mock.timers.tick(DEFAULT_TIMEOUT_MS);
    t.mock.timers.tick(26633 - DEFAULT_TIMEOUT_MS);
    resolveFetch({ ok: true, status: 200, json: async () => ({ ok: true, data: { status: 'PENDING', recordId: 'REC_1' } }) });
    const result = await callPromise;
    assert.deepEqual(result, { status: 'PENDING', recordId: 'REC_1' });
});

test('Gateway with maxAttempts=1 makes exactly one fetch call and does not overlap a retry on transport failure', async () => {
    let calls = 0;
    await assert.rejects(() => callGateway('submitRequest', { request_id: 'no-overlap' }, {
        env, requestId: 'no-overlap', timeoutMs: 10, maxAttempts: MUTATION_MAX_ATTEMPTS,
        fetchImpl: async () => { calls += 1; throw new Error('network'); },
    }), error => error.code === 'STAFF_GATEWAY_UNAVAILABLE');
    assert.equal(calls, 1, 'a single bounded attempt must not fire a second overlapping Apps Script execution');
});

test('Gateway still fails closed when a mutation genuinely exceeds the configured mutation timeout', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const callPromise = callGateway('submitRequest', { request_id: 'too-slow' }, {
        env, requestId: 'too-slow', timeoutMs: 100, maxAttempts: 1,
        fetchImpl: async (url, options) => new Promise((resolve, reject) => {
            options.signal.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')), { once: true });
        }),
    });
    t.mock.timers.tick(100);
    await assert.rejects(() => callPromise, error => error.code === 'STAFF_GATEWAY_UNAVAILABLE');
});

test('Gateway request id and raw body are identical regardless of the timeout/attempts policy used', async () => {
    let captured;
    await callGateway('submitRequest', { request_id: 'policy-neutral', value: 'x' }, {
        env, requestId: 'policy-neutral', timeoutMs: MUTATION_TIMEOUT_MS, maxAttempts: MUTATION_MAX_ATTEMPTS,
        fetchImpl: async (url, options) => { captured = options.body; return { ok: true, status: 200, json: async () => ({ ok: true, data: {} }) }; },
    });
    assert.equal(captured, JSON.stringify({ action: 'submitRequest', request_id: 'policy-neutral', payload: { request_id: 'policy-neutral', value: 'x' } }));
});

test('signature helper matches Node HMAC UTF-8 bytes', () => {
    const raw = JSON.stringify({ value: 'Tiếng Việt' });
    const expected = crypto.createHmac('sha256', env.LOCATION_GATEWAY_SECRET).update(`123.${raw}`, 'utf8').digest('hex');
    assert.equal(signGatewayBody(raw, 123, env.LOCATION_GATEWAY_SECRET), expected);
});
