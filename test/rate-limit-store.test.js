'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
    RATE_LIMIT_SCRIPT,
    buildRateLimitKey,
    checkAndIncrement,
    clearLocalRateLimitStore,
} = require('../lib/rate-limit-store');

const BASE = {
    redisUrl: 'https://redis.example.test',
    redisToken: 'server-only-token',
    namespace: 'bandocapt:public-location:v1',
    key: '0123456789abcdef0123456789abcdef',
    window: '2026_08_26',
    limit: 3,
    windowSeconds: 86400,
    resetAt: '2026-08-27T00:00:00.000Z',
};

function response(result, ok = true) {
    return { ok, json: async () => ({ result }) };
}

function fakeRedis({ results = [], failure = null, stateful = false } = {}) {
    const calls = [];
    const counts = new Map();
    const fetchImpl = async (url, options) => {
        calls.push({ url, options, command: JSON.parse(options.body) });
        if (failure) throw new Error(failure);
        const command = JSON.parse(options.body);
        if (stateful) {
            const key = command[3];
            const current = counts.get(key) || 0;
            if (current >= Number(command[4])) return response(-current);
            const next = current + 1;
            counts.set(key, next);
            return response(next);
        }
        return response(results.length ? results.shift() : 1);
    };
    return { calls, fetchImpl };
}

test.beforeEach(() => clearLocalRateLimitStore());

test('first request is allowed and returns stable count metadata', async () => {
    const fake = fakeRedis({ results: [1] });
    const result = await checkAndIncrement({ ...BASE, fetchImpl: fake.fetchImpl });
    assert.deepEqual(result, { allowed: true, count: 1, remaining: 2, resetAt: BASE.resetAt });
    assert.equal(fake.calls[0].command[0], 'EVAL');
    assert.equal(fake.calls[0].command[3], `${BASE.namespace}:${BASE.window}:${BASE.key}`);
});

test('below-limit and at-limit requests pass, and the next request is rejected without over-incrementing', async () => {
    const fake = fakeRedis({ results: [1, 2, 3, -3] });
    const results = [];
    for (let index = 0; index < 4; index += 1) {
        results.push(await checkAndIncrement({ ...BASE, fetchImpl: fake.fetchImpl }));
    }
    assert.deepEqual(results.map(result => result.allowed), [true, true, true, false]);
    assert.deepEqual(results.map(result => result.count), [1, 2, 3, 3]);
    assert.equal(results[3].reason, 'limit_exceeded');
});

test('different hashed IP keys are independent and next window uses a different key', async () => {
    const fake = fakeRedis({ results: [1, 1, 1] });
    await checkAndIncrement({ ...BASE, fetchImpl: fake.fetchImpl });
    await checkAndIncrement({ ...BASE, key: 'abcdefabcdefabcdefabcdefabcdefab', fetchImpl: fake.fetchImpl });
    await checkAndIncrement({ ...BASE, window: '2026_08_27', fetchImpl: fake.fetchImpl });
    assert.deepEqual(fake.calls.map(call => call.command[3]), [
        'bandocapt:public-location:v1:2026_08_26:0123456789abcdef0123456789abcdef',
        'bandocapt:public-location:v1:2026_08_26:abcdefabcdefabcdefabcdefabcdefab',
        'bandocapt:public-location:v1:2026_08_27:0123456789abcdef0123456789abcdef',
    ]);
});

test('TTL is initialized by the atomic script and malformed Redis responses fail closed', async () => {
    const fake = fakeRedis({ results: [1, 'not-a-count'] });
    const success = await checkAndIncrement({ ...BASE, windowSeconds: 123, fetchImpl: fake.fetchImpl });
    const malformed = await checkAndIncrement({ ...BASE, windowSeconds: 123, fetchImpl: fake.fetchImpl });
    assert.equal(success.allowed, true);
    assert.equal(fake.calls[0].command[5], '123');
    assert.match(fake.calls[0].command[1], /GET/);
    assert.match(fake.calls[0].command[1], /INCR/);
    assert.match(fake.calls[0].command[1], /EXPIRE/);
    assert.deepEqual(malformed, { allowed: false, count: 0, remaining: 0, resetAt: BASE.resetAt, reason: 'unavailable' });
});

test('Redis timeout/unavailability fails closed without leaking IP, PII, or salt', async () => {
    const fake = fakeRedis({ failure: 'timeout' });
    const rawIp = '203.0.113.99';
    const pii = 'Người dân|0210000000|Địa chỉ A|https://maps.google.com|test-salt';
    const result = await checkAndIncrement({
        ...BASE,
        key: 'abcdef0123456789abcdef0123456789',
        fetchImpl: fake.fetchImpl,
    });
    const serialized = JSON.stringify(fake.calls);
    assert.equal(result.reason, 'unavailable');
    assert.equal(serialized.includes(rawIp), false);
    assert.equal(serialized.includes(pii), false);
    assert.equal(serialized.includes('server-only-token'), true);
});

test('concurrent calls use one atomic Redis command per request and never allow more than the limit', async () => {
    const fake = fakeRedis({ stateful: true });
    const results = await Promise.all(Array.from({ length: 20 }, () => checkAndIncrement({
        ...BASE,
        limit: 5,
        fetchImpl: fake.fetchImpl,
    })));
    assert.equal(results.filter(result => result.allowed).length, 5);
    assert.equal(results.filter(result => result.reason === 'limit_exceeded').length, 15);
    assert.equal(fake.calls.every(call => call.command[0] === 'EVAL'), true);
    assert.equal(fake.calls.every(call => !call.command[3].includes('203.0.113.99')), true);
});

test('local fallback is available only when explicitly enabled', async () => {
    const withoutFallback = await checkAndIncrement({ ...BASE, redisUrl: '', redisToken: '', fetchImpl: async () => response(1) });
    const localFirst = await checkAndIncrement({ ...BASE, redisUrl: '', redisToken: '', allowInMemoryFallback: true, fetchImpl: async () => response(1) });
    assert.equal(withoutFallback.reason, 'unavailable');
    assert.equal(localFirst.allowed, true);
    assert.equal(buildRateLimitKey(BASE), 'bandocapt:public-location:v1:2026_08_26:0123456789abcdef0123456789abcdef');
});

test('the Redis script contains no application PII fields', () => {
    for (const value of ['name', 'phone', 'address', 'maps', 'image', 'email', '203.0.113.99']) {
        assert.equal(RATE_LIMIT_SCRIPT.toLowerCase().includes(value), false, value);
    }
});
