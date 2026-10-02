'use strict';

const { Receiver } = require('@upstash/qstash');

function workerUrl(env = process.env) {
    const value = env.VERCEL_ENV === 'preview' && env.VERCEL_URL
        ? `https://${env.VERCEL_URL}/api/zalo-bot/worker`
        : env.ZALO_BOT_WORKER_URL;
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/api/zalo-bot/worker') throw new Error('ZALO_QSTASH_UNCONFIGURED');
    return url.href;
}

function assertQStashConfig(env = process.env) {
    if (!env.QSTASH_TOKEN || !env.QSTASH_CURRENT_SIGNING_KEY || !env.QSTASH_NEXT_SIGNING_KEY) throw new Error('ZALO_QSTASH_UNCONFIGURED');
    return workerUrl(env);
}

async function publishZaloJob(job, dueAt = Date.now(), { env = process.env, fetchImpl = fetch } = {}) {
    const url = assertQStashConfig(env);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
        const response = await fetchImpl(`https://qstash.upstash.io/v2/publish/${url}`, {
            method: 'POST', signal: controller.signal,
            headers: {
                Authorization: `Bearer ${env.QSTASH_TOKEN}`,
                'Content-Type': 'text/plain', 'Upstash-Forward-Content-Type': 'text/plain',
                'Upstash-Not-Before': String(Math.ceil(dueAt / 1000)),
                'Upstash-Retries': '3', 'Upstash-Retry-Delay': '10000 * pow(2, retried)',
                ...(env.VERCEL_AUTOMATION_BYPASS_SECRET ? {
                    'Upstash-Forward-x-vercel-protection-bypass': env.VERCEL_AUTOMATION_BYPASS_SECRET,
                    'Upstash-Redact-Fields': 'header[x-vercel-protection-bypass]',
                } : {}),
            },
            body: JSON.stringify({ chatHash: job.chatHash, batchId: job.batchId }),
        });
        const payload = await response.json();
        if (!response.ok || typeof payload.messageId !== 'string') throw new Error('ZALO_QUEUE_FAILED');
    } catch (_) { throw new Error('ZALO_QUEUE_FAILED'); }
    finally { clearTimeout(timer); }
}

async function verifyZaloJob(req, { env = process.env } = {}) {
    assertQStashConfig(env);
    if (req.method !== 'POST' || !String(req.headers['content-type'] || '').toLowerCase().startsWith('text/plain')) return null;
    // Never reconstruct parsed JSON: the JWT body claim hashes the exact wire string.
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
    if (typeof body !== 'string' || Buffer.byteLength(body) > 2048 || typeof req.headers['upstash-signature'] !== 'string') return null;
    try {
        const receiver = new Receiver({ currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY, nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY });
        if (!await receiver.verify({ signature: req.headers['upstash-signature'], body, url: workerUrl(env) })) return null;
        const job = JSON.parse(body);
        if (job.type === 'sweep' && Object.keys(job).length === 1) return job;
        if (Object.keys(job).length !== 2 || !/^[a-f0-9]{64}$/.test(job.chatHash) || !/^[a-f0-9-]{36}$/.test(job.batchId)) return null;
        return job;
    } catch (_) { return null; }
}

module.exports = { workerUrl, assertQStashConfig, publishZaloJob, verifyZaloJob };
