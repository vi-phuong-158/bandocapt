'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { verifyZaloJob } = require('../lib/zalo-queue');

const env = { ZALO_BOT_WORKER_SECRET: 'fake-worker-secret'.repeat(3), ZALO_BOT_WORKER_URL: 'https://worker.test/api/zalo-bot/worker', VERCEL_AUTOMATION_BYPASS_SECRET: 'fake-bypass' };
const job = () => ({ chatHash: 'a'.repeat(64), batchId: crypto.randomUUID() });
const message = (body = job(), attempts = 1) => ({ body, attempts, acknowledgements: 0, retries: [], ack() { this.acknowledgements++; }, retry(value) { this.retries.push(value); } });

async function withFetch(mock, fn) {
    const original = global.fetch;
    global.fetch = mock;
    try { return await fn((await import('../cloudflare/zalo-queue/worker.mjs')).default); }
    finally { global.fetch = original; }
}

test('Cloudflare consumer signs exact callback accepted by Node verifier and sends only metadata', async () => {
    const m = message();
    await withFetch(async (url, options) => {
        assert.equal(url, env.ZALO_BOT_WORKER_URL);
        assert.equal(options.redirect, 'error');
        assert.equal(options.headers['x-vercel-protection-bypass'], 'fake-bypass');
        assert.deepEqual(await verifyZaloJob({ method: options.method, headers: options.headers, body: options.body }, { env }), m.body);
        return new Response(JSON.stringify({ status: 'done' }));
    }, worker => worker.queue({ messages: [m] }, env));
    assert.equal(m.acknowledgements, 1);
    assert.deepEqual(m.retries, []);
});

test('Cloudflare consumer rejects malformed jobs without forwarding contents', async () => {
    const messages = [message({ ...job(), text: 'PRIVATE_MARKER' }), message(null), message({ chatHash: [], batchId: 'bad' })];
    await withFetch(async () => assert.fail('invalid job must not call Vercel'), worker => worker.queue({ messages }, env));
    for (const m of messages) assert.equal(m.acknowledgements, 1);
});

test('Cloudflare consumer respects Retry-After for Redis lease recovery', async () => {
    const m = message();
    await withFetch(async () => new Response(JSON.stringify({ status: 'retry' }), { status: 503, headers: { 'Retry-After': '65' } }), worker => worker.queue({ messages: [m] }, env));
    assert.equal(m.acknowledgements, 0);
    assert.deepEqual(m.retries, [{ delaySeconds: 65 }]);
});

test('Cloudflare transport retries use 10/20/40 seconds without acknowledging failures', async () => {
    for (let attempt = 1; attempt <= 3; attempt++) {
        const m = message(job(), attempt);
        await withFetch(async () => { throw new Error('PRIVATE_NETWORK_SECRET'); }, worker => worker.queue({ messages: [m] }, env));
        assert.deepEqual(m.retries, [{ delaySeconds: 10 * 2 ** (attempt - 1) }]);
        assert.equal(m.acknowledgements, 0);
    }
});

test('Cloudflare consumer does not treat HTML protection or an arbitrary 200 as success', async () => {
    for (const body of ['<html>Sign in</html>', '{"status":"unexpected"}']) {
        const m = message();
        await withFetch(async () => new Response(body), worker => worker.queue({ messages: [m] }, env));
        assert.equal(m.acknowledgements, 0);
        assert.equal(m.retries.length, 1);
    }
});

test('Cloudflare consumer accepts terminal unknown delivery without resending', async () => {
    const m = message();
    await withFetch(async () => new Response('{"status":"delivery_unknown"}'), worker => worker.queue({ messages: [m] }, env));
    assert.equal(m.acknowledgements, 1);
    assert.deepEqual(m.retries, []);
});

test('Cloudflare Cron invokes a signed sweep directly without queue operations', async () => {
    let calls = 0;
    await withFetch(async (_, options) => {
        calls++;
        assert.deepEqual(await verifyZaloJob({ method: 'POST', headers: options.headers, body: options.body }, { env }), { type: 'sweep' });
        return new Response('{"status":"swept","count":0}');
    }, worker => worker.scheduled({}, env));
    assert.equal(calls, 1);
});

test('Cloudflare Cron reports failures without leaking provider response or credentials', async () => {
    const original = console.error;
    const logs = [];
    console.error = line => logs.push(line);
    try {
        await withFetch(async () => { throw new Error('PRIVATE_MARKER'); }, worker => assert.rejects(worker.scheduled({}, env), /ZALO_SWEEP_FAILED/));
        assert.equal(logs.join('').includes('PRIVATE_MARKER'), false);
        assert.equal(logs.join('').includes(env.ZALO_BOT_WORKER_SECRET), false);
    } finally { console.error = original; }
});

test('Cloudflare callback refuses unconfigured or unsafe destinations', async () => {
    for (const config of [{ ...env, ZALO_BOT_WORKER_SECRET: '' }, { ...env, ZALO_BOT_WORKER_URL: 'http://unsafe.test/api/zalo-bot/worker' }, { ...env, ZALO_BOT_WORKER_URL: env.ZALO_BOT_WORKER_URL + '?secret=test' }]) {
        const m = message();
        await withFetch(async () => assert.fail('invalid configuration must not send'), worker => worker.queue({ messages: [m] }, config));
        assert.equal(m.acknowledgements, 0);
        assert.equal(m.retries.length, 1);
    }
});

test('Cloudflare config isolates Preview/Production and keeps single-message, three-retry consumers', () => {
    const config = fs.readFileSync(path.join(__dirname, '../cloudflare/zalo-queue/wrangler.toml'), 'utf8');
    assert.match(config, /\[env\.preview\]/);
    assert.match(config, /\[env\.production\]/);
    assert.match(config, /queue = "bandocapt-zalo-preview"/);
    assert.match(config, /queue = "bandocapt-zalo-production"/);
    for (const pattern of [/max_batch_size = 1/g, /max_retries = 3/g, /crons = \["\* \* \* \* \*"\]/g]) assert.equal([...config.matchAll(pattern)].length, 2);
    assert.match(config, /enabled = false/);
});
