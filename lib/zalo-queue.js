'use strict';

const crypto = require('node:crypto');

function workerUrl(env = process.env) {
    try {
        const value = env.VERCEL_ENV === 'preview' && env.VERCEL_URL
            ? `https://${env.VERCEL_URL}/api/zalo-bot/worker` : env.ZALO_BOT_WORKER_URL;
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/api/zalo-bot/worker') throw new Error();
        return url.href;
    } catch (_) { throw new Error('ZALO_QUEUE_UNCONFIGURED'); }
}

function assertWorkerConfig(env = process.env) {
    if (typeof env.ZALO_BOT_WORKER_SECRET !== 'string' || env.ZALO_BOT_WORKER_SECRET.length < 32) throw new Error('ZALO_QUEUE_UNCONFIGURED');
    return workerUrl(env);
}

function assertZaloQueueConfig(env = process.env) {
    assertWorkerConfig(env);
    if (!/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID) || !/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ZALO_QUEUE_ID) || !env.CLOUDFLARE_ZALO_QUEUE_TOKEN) throw new Error('ZALO_QUEUE_UNCONFIGURED');
}

function isZaloJob(job) {
    return job && typeof job === 'object' && !Array.isArray(job) && Object.keys(job).length === 2
        && typeof job.chatHash === 'string' && /^[a-f0-9]{64}$/.test(job.chatHash)
        && typeof job.batchId === 'string' && /^[a-f0-9-]{36}$/.test(job.batchId);
}

async function publishZaloJob(job, dueAt = Date.now(), { env = process.env, fetchImpl = fetch, now = Date.now } = {}) {
    assertZaloQueueConfig(env);
    // Project only the two approved metadata fields: never forward a caller's payload.
    const body = { chatHash: job.chatHash, batchId: job.batchId };
    if (!isZaloJob(body) || !Number.isFinite(dueAt)) throw new Error('INVALID_ZALO_JOB');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
        const response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/queues/${env.CLOUDFLARE_ZALO_QUEUE_ID}/messages`, {
            method: 'POST', signal: controller.signal, redirect: 'error',
            headers: { Authorization: `Bearer ${env.CLOUDFLARE_ZALO_QUEUE_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ body, content_type: 'json', delay_seconds: Math.min(86400, Math.max(0, Math.ceil((dueAt - now()) / 1000))) }),
        });
        const payload = await response.json();
        if (!response.ok || payload?.success !== true) throw new Error();
    } catch (_) { throw new Error('ZALO_QUEUE_FAILED'); }
    finally { clearTimeout(timer); }
}

async function verifyZaloJob(req, { env = process.env, now = Date.now } = {}) {
    const url = assertWorkerConfig(env);
    if (req.method !== 'POST' || !/^text\/plain(?:;|$)/i.test(String(req.headers['content-type'] || ''))) return null;
    const timestamp = req.headers['x-zalo-worker-timestamp'];
    const signature = req.headers['x-zalo-worker-signature'];
    if (typeof timestamp !== 'string' || !/^\d{10}$/.test(timestamp) || Math.abs(Math.floor(now() / 1000) - Number(timestamp)) > 60
        || typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature)) return null;
    // Vercel leaves text/plain unparsed. Reject parsed objects rather than serializing them.
    let body = req.body;
    if (Buffer.isBuffer(body)) body = body.toString('utf8');
    if (body === undefined && req[Symbol.asyncIterator]) {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
            size += Buffer.byteLength(chunk);
            if (size > 2048) return null;
            chunks.push(Buffer.from(chunk));
        }
        body = Buffer.concat(chunks).toString('utf8');
    }
    if (typeof body !== 'string' || Buffer.byteLength(body) > 2048) return null;
    const expected = crypto.createHmac('sha256', env.ZALO_BOT_WORKER_SECRET).update(`${timestamp}\n${url}\n${body}`).digest();
    if (!crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'))) return null;
    try {
        const job = JSON.parse(body);
        if (job && job.type === 'sweep' && Object.keys(job).length === 1) return job;
        return isZaloJob(job) ? job : null;
    } catch (_) { return null; }
}

module.exports = { workerUrl, assertZaloQueueConfig, publishZaloJob, verifyZaloJob };
