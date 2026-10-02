'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createZaloBatchStore, hashPrincipal, storeNamespace, dayWindow } = require('../lib/zalo-batch-store');
const { processZaloBatch } = require('../lib/zalo-batch-worker');
const { publishZaloJob, verifyZaloJob, workerUrl } = require('../lib/zalo-qstash');

// CI uses a real isolated Redis service. The REST adapter below only translates
// transport; it executes the production Lua scripts, not a JS copy of transitions.
const { redisCommand } = require('./helpers/zalo-redis');

function fixture() {
    let time = 1700000000000;
    const env = { KV_REST_API_URL: 'https://redis.test', KV_REST_API_TOKEN: 'test-only', CHAT_LOG_HASH_SALT: crypto.randomUUID(), CHAT_DAILY_IP_LIMIT: '50' };
    const store = createZaloBatchStore({ env, now: () => time, fetchImpl: async (_, options) => ({ ok: true, json: async () => ({ result: await redisCommand(JSON.parse(options.body)) }) }) });
    const chatHash = hashPrincipal('test-chat', env);
    return { store, env, chatHash, now: () => time, advance: ms => { time += ms; },
        append: (text, id = crypto.randomUUID(), extra = {}) => store.append({ chatHash, chatId: 'test-private-chat', messageHash: hashPrincipal(id, env), kind: 'text', text, ...extra }),
        job: accepted => ({ chatHash, batchId: accepted.batchId }),
    };
}

const integration = (name, fn) => test(name, { skip: !process.env.ZALO_TEST_REDIS_PORT }, fn);
const sanitize = items => items.slice(-6);

integration('Redis Lua: three fragments, duplicate delivery and one atomic quota reservation', async () => {
    const f = fixture();
    const first = await f.append('Tôi là người Hàn Quốc', 'm1');
    f.advance(1000);
    await f.append('đang ở Thanh Miếu', 'm2');
    f.advance(1000);
    await f.append('muốn khai báo tạm trú cần gì?', 'm3');
    assert.equal((await f.append('duplicate must not be added', 'm1')).status, 'duplicate');
    assert.equal((await f.store.claim(f.job(first))).status, 'deferred');
    f.advance(3000);
    const sends = [];
    let generated = 0;
    const args = { job: f.job(first), store: f.store, sanitizeHistory: sanitize, req: { headers: {} }, now: f.now,
        resolveTurn: async ({ text }) => { generated++; assert.equal(text, 'Tôi là người Hàn Quốc\nđang ở Thanh Miếu\nmuốn khai báo tạm trú cần gì?'); return { text: 'Hướng dẫn', result: 'RAG_REPLIED', intent: 'OTHER' }; },
        sendImpl: async value => sends.push(value),
    };
    assert.equal((await processZaloBatch(args)).status, 'done');
    assert.equal((await processZaloBatch(args)).status, 'done');
    assert.equal(generated, 1);
    assert.equal(sends.length, 1);
    assert.equal(await redisCommand(['GET', `${f.store.namespace}:daily:${dayWindow(f.now()).key}:${f.chatHash}`]), '1');
    assert.equal(await redisCommand(['GET', `${f.store.namespace}:chat:${f.chatHash}`]), null);
});

integration('Redis Lua: max eight-second window, two principals and a new fragment after claim', async () => {
    const f = fixture();
    const first = await f.append('a');
    f.advance(2500); await f.append('b');
    f.advance(2500); await f.append('c');
    f.advance(2500); const last = await f.append('d');
    assert.equal(last.dueAt, f.now() + 500);
    f.advance(500);
    const active = await f.store.claim(f.job(first));
    assert.equal(active.status, 'claimed');
    const next = await f.append('new question');
    assert.notEqual(next.batchId, first.batchId);
    assert.equal((await f.store.claim(f.job(next))).status, 'blocked');
    const other = hashPrincipal('other-chat', f.env);
    const otherBatch = await f.append('other person', 'other', { chatHash: other, chatId: 'other-private-chat' });
    f.advance(3000);
    const different = await f.store.claim({ chatHash: other, batchId: otherBatch.batchId });
    assert.equal(different.chatId, 'other-private-chat');
    assert.equal(different.batch.fragments.length, 1);
});

integration('Redis Lua: lease fencing, retry reservation and delivery unknown after crash', async () => {
    const f = fixture();
    const first = await f.append('question'); f.advance(3000);
    const a = await f.store.claim(f.job(first));
    assert.equal((await f.store.claim(f.job(first))).status, 'busy');
    f.advance(65001);
    const b = await f.store.claim(f.job(first));
    assert.equal(b.batch.attempts, 2);
    assert.equal((await f.store.saveReply({ ...f.job(first), owner: a.batch.owner, reply: {} })).status, 'stale');
    assert.equal(await redisCommand(['GET', `${f.store.namespace}:daily:${dayWindow(f.now()).key}:${f.chatHash}`]), '1');
    await f.store.markSending({ ...f.job(first), owner: b.batch.owner, index: 1 });
    f.advance(65001);
    assert.equal((await f.store.claim(f.job(first))).status, 'delivery_unknown');
    assert.equal((await f.store.claim(f.job(first))).status, 'delivery_unknown');
});

integration('Redis Lua: short context TTL, full input limit and no AI for invalid batches', async () => {
    const f = fixture();
    const sent = [];
    const run = accepted => processZaloBatch({ job: f.job(accepted), store: f.store, sanitizeHistory: sanitize, now: f.now, req: { headers: {} },
        resolveTurn: async ({ text, history }) => { assert.equal(text, 'first question'); assert.equal(history.length, 0); return { intent: 'OTHER', result: 'RAG_REPLIED', text: 'Bạn ở xã/phường nào?' }; }, sendImpl: async msg => sent.push(msg) });
    const first = await f.append('first question'); f.advance(3000); await run(first);
    const ttl = await redisCommand(['TTL', `${f.store.namespace}:session:${f.chatHash}`]);
    assert.ok(ttl > 290 && ttl <= 300);
    f.advance(20000); const next = await f.append('Thanh Miếu'); f.advance(3000);
    const c = await f.store.claim(f.job(next));
    assert.equal(c.history.length, 2);
    await f.store.finish({ ...f.job(next), owner: c.batch.owner, status: 'done', history: [] });
    const bad = await f.append('a'.repeat(600)); await f.append('b'.repeat(600)); f.advance(3000);
    const result = await processZaloBatch({ job: f.job(bad), store: f.store, sanitizeHistory: sanitize, now: f.now, req: { headers: {} }, resolveTurn: async () => assert.fail('oversize must not invoke AI'), sendImpl: async msg => sent.push(msg) });
    assert.equal(result.status, 'done');
    assert.match(sent.at(-1).text, /quá dài/);
    await redisCommand(['DEL', `${f.store.namespace}:session:${f.chatHash}`]);
    const clean = await f.append('new session'); f.advance(3000);
    assert.deepEqual((await f.store.claim(f.job(clean))).history, {});
});

integration('Redis Lua: outbox recovers failed publishing and expires old jobs', async () => {
    const f = fixture();
    const batch = await f.append('question'); f.advance(3000);
    const due = await f.store.dueJobs();
    assert.ok(due.jobs.some(item => item.batchId === batch.batchId));
    f.advance(600001);
    assert.equal((await f.store.claim(f.job(batch))).status, 'expired');
});

integration('Redis Lua: fixed minute spam limit and bounded generation retries', async () => {
    const f = fixture();
    const first = await f.append('a');
    for (let i = 1; i < 30; i++) assert.equal((await f.append('a')).status, 'accepted');
    assert.equal((await f.append('a')).status, 'spam_limited');
    f.advance(3000);
    for (let i = 0; i < 4; i++) {
        const claimed = await f.store.claim(f.job(first));
        assert.equal(claimed.status, 'claimed');
        const retried = await f.store.retry({ ...f.job(first), owner: claimed.batch.owner });
        assert.equal(retried.status, i === 3 ? 'failed' : 'saved');
        f.advance(10000 * 2 ** i);
    }
    assert.equal((await f.store.claim(f.job(first))).status, 'failed');
});

integration('Redis Lua: retry resumes saved chunks without regenerating or resending confirmed chunks', async () => {
    const f = fixture();
    const first = await f.append('question'); f.advance(3000);
    let generations = 0, blocked = false;
    const sends = [];
    const args = { job: f.job(first), store: f.store, sanitizeHistory: sanitize, now: f.now, req: { headers: {} },
        resolveTurn: async () => { generations++; return { text: 'A'.repeat(2000) + 'B'.repeat(2000) + 'C'.repeat(5), intent: 'OTHER', result: 'RAG_REPLIED' }; },
        sendImpl: async ({ text }) => { sends.push(text); if (text.startsWith('B') && !blocked) { blocked = true; throw Object.assign(new Error('429'), { code: 'ZALO_SEND_RETRYABLE' }); } },
    };
    assert.equal((await processZaloBatch(args)).status, 'retry');
    f.advance(10000);
    assert.equal((await processZaloBatch(args)).status, 'done');
    assert.equal(generations, 1);
    assert.equal(sends.filter(text => text.startsWith('A')).length, 1);
    assert.equal(sends.filter(text => text.startsWith('B')).length, 2);
    assert.equal(sends.filter(text => text.startsWith('C')).length, 1);
});

integration('Redis Lua: Redis expiry removes history before the next session', async () => {
    const f = fixture();
    const key = `${f.store.namespace}:session:${f.chatHash}`;
    await redisCommand(['SET', key, JSON.stringify([{ role: 'user', parts: [{ text: 'old context' }] }]), 'EX', '1']);
    await new Promise(resolve => setTimeout(resolve, 1100));
    const next = await f.append('fresh question'); f.advance(3000);
    const c = await f.store.claim(f.job(next));
    assert.deepEqual(c.history, {});
});

test('environment namespace and QStash publishing carry no chat content or raw IDs', async () => {
    assert.notEqual(storeNamespace({ VERCEL_ENV: 'production' }), storeNamespace({ VERCEL_ENV: 'preview' }));
    assert.notEqual(storeNamespace({ VERCEL_ENV: 'preview', VERCEL_URL: 'one.test' }), storeNamespace({ VERCEL_ENV: 'preview', VERCEL_URL: 'two.test' }));
    const env = { QSTASH_TOKEN: 'test', QSTASH_CURRENT_SIGNING_KEY: 'test', QSTASH_NEXT_SIGNING_KEY: 'test', ZALO_BOT_WORKER_URL: 'https://worker.test/api/zalo-bot/worker', VERCEL_AUTOMATION_BYPASS_SECRET: 'fake-bypass-secret' };
    const job = { chatHash: 'a'.repeat(64), batchId: crypto.randomUUID(), text: 'PRIVATE', chatId: 'RAW_ID' };
    await publishZaloJob(job, 5000, { env, fetchImpl: async (_, options) => {
        assert.equal(options.headers['Content-Type'], 'text/plain');
        assert.equal(options.headers['Upstash-Retry-Delay'], '10000 * pow(2, retried)');
        assert.equal(options.headers['Upstash-Forward-x-vercel-protection-bypass'], 'fake-bypass-secret');
        assert.equal(options.headers['Upstash-Redact-Fields'], 'header[x-vercel-protection-bypass]');
        assert.equal(options.body.includes('PRIVATE'), false);
        assert.equal(options.body.includes('RAW_ID'), false);
        return { ok: true, json: async () => ({ messageId: 'job' }) };
    } });
    assert.equal(await verifyZaloJob({ method: 'POST', headers: { 'content-type': 'application/json' }, body: job }, { env }), null);
    await assert.rejects(publishZaloJob(job, 5000, { env, fetchImpl: async () => { throw new Error('token content'); } }), /ZALO_QUEUE_FAILED/);
    assert.equal(workerUrl({ ...env, VERCEL_ENV: 'preview', VERCEL_URL: 'preview.test' }), 'https://preview.test/api/zalo-bot/worker');
});

test('Redis configuration fails closed without leaking credentials', async () => {
    const store = createZaloBatchStore({ env: {} });
    await assert.rejects(store.append({ chatHash: 'a'.repeat(64), text: 'PRIVATE' }), /ZALO_STORE_UNCONFIGURED/);
});

test('Redis operations abort within the remaining worker deadline', async () => {
    const env = { KV_REST_API_URL: 'https://redis.test', KV_REST_API_TOKEN: 'test', CHAT_LOG_HASH_SALT: 'salt' };
    let aborted = false;
    const store = createZaloBatchStore({ env, fetchImpl: async (_, { signal }) => new Promise((_, reject) => {
        signal.addEventListener('abort', () => { aborted = true; reject(new Error('abort')); }, { once: true });
    }) });
    await assert.rejects(store.claim({ chatHash: 'a'.repeat(64), batchId: crypto.randomUUID(), deadlineAt: Date.now() + 20 }), /ZALO_STORE_FAILED/);
    assert.equal(aborted, true);
});

test('QStash verifies exact body, subject, expiry and both signing keys', async () => {
    const env = { QSTASH_TOKEN: 'test', QSTASH_CURRENT_SIGNING_KEY: 'current-test-key', QSTASH_NEXT_SIGNING_KEY: 'next-test-key', ZALO_BOT_WORKER_URL: 'https://worker.test/api/zalo-bot/worker' };
    const body = JSON.stringify({ chatHash: 'b'.repeat(64), batchId: crypto.randomUUID() });
    const sign = (key, overrides = {}) => {
        const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
        const payload = Buffer.from(JSON.stringify({ iss: 'Upstash', sub: env.ZALO_BOT_WORKER_URL, exp: Math.floor(Date.now() / 1000) + 60, nbf: Math.floor(Date.now() / 1000) - 1, body: crypto.createHash('sha256').update(body).digest('base64url'), ...overrides })).toString('base64url');
        const input = `${header}.${payload}`;
        return `${input}.${crypto.createHmac('sha256', key).update(input).digest('base64url')}`;
    };
    const request = signature => ({ method: 'POST', headers: { 'content-type': 'text/plain', 'upstash-signature': signature }, body });
    for (const key of [env.QSTASH_CURRENT_SIGNING_KEY, env.QSTASH_NEXT_SIGNING_KEY]) assert.deepEqual(await verifyZaloJob(request(sign(key)), { env }), JSON.parse(body));
    assert.equal(await verifyZaloJob({ ...request(sign(env.QSTASH_CURRENT_SIGNING_KEY)), body: body + ' ' }, { env }), null);
    assert.equal(await verifyZaloJob(request(sign(env.QSTASH_CURRENT_SIGNING_KEY, { sub: 'https://attacker.test' })), { env }), null);
    assert.equal(await verifyZaloJob(request(sign(env.QSTASH_CURRENT_SIGNING_KEY, { exp: 1 })), { env }), null);
});

test('worker schedule uses an idempotent environment-specific ID and contains only metadata', async () => {
    const { registerWorkerSchedule } = require('../scripts/register-zalo-bot-worker');
    const env = { QSTASH_TOKEN: 'test', QSTASH_CURRENT_SIGNING_KEY: 'key', QSTASH_NEXT_SIGNING_KEY: 'key2', ZALO_BOT_WORKER_URL: 'https://worker.test/api/zalo-bot/worker', KV_REST_API_URL: 'test', KV_REST_API_TOKEN: 'test', CHAT_LOG_HASH_SALT: 'salt' };
    const calls = [];
    await registerWorkerSchedule({ env, client: { schedules: { create: async value => { calls.push(value); return { scheduleId: 'test' }; } } } });
    assert.equal(calls[0].cron, '* * * * *');
    assert.equal(calls[0].headers['Content-Type'], 'text/plain');
    assert.deepEqual(JSON.parse(calls[0].body), { type: 'sweep' });
});

test('Preview webhook URL uses automation bypass without changing Production URL', () => {
    const { getWebhookUrl } = require('../scripts/register-zalo-bot-webhook');
    const env = { ZALO_BOT_WEBHOOK_URL: 'https://preview.test/api/zalo-bot/webhook', VERCEL_AUTOMATION_BYPASS_SECRET: 'fake-secret' };
    assert.equal(getWebhookUrl(env), env.ZALO_BOT_WEBHOOK_URL);
    assert.equal(new URL(getWebhookUrl({ ...env, VERCEL_ENV: 'preview' })).searchParams.get('x-vercel-protection-bypass'), 'fake-secret');
});
