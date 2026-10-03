'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { redisCommand } = require('./helpers/zalo-redis');
const { storeNamespace, hashPrincipal, dayWindow } = require('../lib/zalo-batch-store');

const vercelPath = require.resolve('@vercel/functions');
const background = [];
require.cache[vercelPath] = { id: vercelPath, filename: vercelPath, loaded: true, exports: { waitUntil: promise => background.push(Promise.resolve(promise)) } };
const handler = require('../api/chat');
const response = () => ({ code: 0, payload: null, headers: {}, status(code) { this.code = code; return this; }, json(value) { this.payload = value; return this; }, setHeader(key, value) { this.headers[key] = value; } });

function signedRequest(job) {
    const body = JSON.stringify(job);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = crypto.createHmac('sha256', process.env.ZALO_BOT_WORKER_SECRET)
        .update(`${timestamp}\n${process.env.ZALO_BOT_WORKER_URL}\n${body}`).digest('hex');
    return { method: 'POST', query: { __channel: 'zalo_worker' }, headers: { 'content-type': 'text/plain', 'x-zalo-worker-timestamp': timestamp, 'x-zalo-worker-signature': signature }, body };
}

const integration = (name, fn) => test(name, { skip: !process.env.ZALO_TEST_REDIS_PORT }, fn);

integration('actual handler: fragmented webhook, duplicate, signed worker, diagnostics-on privacy and rollback drain', async () => {
    const saved = { ...process.env };
    const originalFetch = global.fetch;
    const originalNow = Date.now;
    let now = originalNow();
    Date.now = () => now;
    Object.assign(process.env, { NODE_ENV: 'development', VERCEL_ENV: 'development', ZALO_BOT_BATCHING_ENABLED: 'on', KV_REST_API_URL: 'https://redis.test', KV_REST_API_TOKEN: 'fake', CHAT_LOG_HASH_SALT: crypto.randomUUID(), ZALO_BOT_WEBHOOK_SECRET: 'test-webhook-secret', ZALO_BOT_TOKEN: 'test-only-token', CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_ZALO_QUEUE_ID: 'b'.repeat(32), CLOUDFLARE_ZALO_QUEUE_TOKEN: 'test-only-queue-token', ZALO_BOT_WORKER_SECRET: 'test-current-key'.repeat(3), ZALO_BOT_WORKER_URL: 'https://worker.test/api/zalo-bot/worker', FIREBASE_DB_URL: 'https://telemetry.test', CHAT_DIAGNOSTIC_LOG: 'on', CHAT_DIAGNOSTIC_LOG_APPROVED: 'on', CHAT_DIAGNOSTIC_LOG_SAMPLE_RATE: '1' });
    delete process.env.CHAT_DIAGNOSTIC_LOG_UNTIL;
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const jobs = [], sends = [], writes = [];
    let failQueue = false;
    global.fetch = async (url, options) => {
        if (String(url) === 'https://redis.test') return { ok: true, json: async () => ({ result: await redisCommand(JSON.parse(options.body)) }) };
        if (String(url).startsWith('https://api.cloudflare.com/client/v4/')) {
            if (failQueue) throw new Error('queue unavailable');
            jobs.push(JSON.parse(options.body).body);
            return { ok: true, json: async () => ({ success: true }) };
        }
        if (String(url).includes('/sendMessage')) { sends.push(JSON.parse(options.body)); return { ok: true, status: 200, json: async () => ({ ok: true }) }; }
        if (String(url).startsWith('https://telemetry.test/')) { writes.push({ url, body: JSON.parse(options.body) }); return { ok: true, json: async () => ({}) }; }
        throw new Error('unmocked request');
    };
    const webhook = async (text, id) => {
        const res = response();
        await handler({ method: 'POST', query: { __channel: 'zalo_bot' }, headers: { 'x-bot-api-secret-token': process.env.ZALO_BOT_WEBHOOK_SECRET }, body: { event_name: 'message.text.received', message: { message_id: id, text, chat: { id: 'private-chat', chat_type: 'PRIVATE' }, from: { id: 'private-person' } } } }, res);
        return res;
    };
    try {
        assert.equal((await webhook('thời tiết', 'm1')).code, 200);
        now += 1000; await webhook('PRIVATE_MARKER hôm nay', 'm2');
        now += 1000; await webhook('thế nào?', 'm3');
        assert.equal((await webhook('thời tiết', 'm1')).code, 200);
        assert.equal(sends.length, 0);
        assert.equal(jobs.length, 4);
        assert.ok(jobs.every(job => Object.keys(job).length === 2));
        now += 3000;
        // Disabling ingress must not abandon previously accepted work.
        process.env.ZALO_BOT_BATCHING_ENABLED = 'off';
        const worker = response(); await handler(signedRequest(jobs[0]), worker);
        assert.equal(worker.code, 200);
        assert.equal(worker.payload.status, 'done');
        await Promise.all(background.splice(0));
        assert.equal(sends.length, 1);
        assert.equal(sends[0].chat_id, 'private-chat');
        assert.equal(JSON.stringify(writes).includes('PRIVATE_MARKER'), false);
        assert.equal(writes.some(item => String(item.url).includes('diagnostic')), false);
        const replay = response(); await handler(signedRequest(jobs[0]), replay);
        assert.equal(sends.length, 1);
        const principal = hashPrincipal('zalo:PRIVATE:private-chat:private-person');
        assert.equal(await redisCommand(['GET', `${storeNamespace()}:daily:${dayWindow(now).key}:${principal}`]), '1');
        process.env.ZALO_BOT_BATCHING_ENABLED = 'on'; failQueue = true;
        assert.equal((await webhook('xin chào', 'new')).code, 503);
        failQueue = false; now += 3000;
        const sweep = response(); await handler(signedRequest({ type: 'sweep' }), sweep);
        assert.equal(sweep.code, 200);
        assert.ok(sweep.payload.count > 0);
        const missingSignature = signedRequest(jobs.at(-1)); delete missingSignature.headers['x-zalo-worker-signature'];
        const forbidden = response(); await handler(missingSignature, forbidden);
        assert.equal(forbidden.code, 403);
    } finally {
        global.fetch = originalFetch; Date.now = originalNow;
        for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
        Object.assign(process.env, saved);
    }
});
