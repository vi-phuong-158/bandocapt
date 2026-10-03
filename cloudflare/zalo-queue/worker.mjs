const SUCCESS_STATUSES = new Set(['done', 'ignored', 'expired', 'failed', 'delivery_unknown', 'delivery_failed', 'deferred', 'blocked', 'swept']);

function callbackErrorCode(error) {
    if (['SIGNATURE_FAILED', 'TRANSPORT_FAILED', 'RESPONSE_INVALID'].includes(error?.message)) return error.message;
    if (error?.message === 'UNCONFIGURED') return 'UNCONFIGURED';
    if (error instanceof ReferenceError) return 'RUNTIME_REFERENCE_ERROR';
    if (error instanceof TypeError) return 'RUNTIME_TYPE_ERROR';
    return 'CALLBACK_ERROR';
}

function isJob(job) {
    return job && typeof job === 'object' && !Array.isArray(job) && Object.keys(job).length === 2
        && typeof job.chatHash === 'string' && /^[a-f0-9]{64}$/.test(job.chatHash)
        && typeof job.batchId === 'string' && /^[a-f0-9-]{36}$/.test(job.batchId);
}

async function callWorker(job, env) {
    const url = new URL(env.ZALO_BOT_WORKER_URL);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/api/zalo-bot/worker'
        || typeof env.ZALO_BOT_WORKER_SECRET !== 'string' || env.ZALO_BOT_WORKER_SECRET.length < 32) throw new Error('UNCONFIGURED');
    const body = JSON.stringify(job);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const encoder = new TextEncoder();
    let digest;
    try {
        const key = await crypto.subtle.importKey('raw', encoder.encode(env.ZALO_BOT_WORKER_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        digest = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}\n${url.href}\n${body}`));
    } catch (_) { throw new Error('SIGNATURE_FAILED'); }
    const signature = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
        let response;
        try {
            response = await fetch(url.href, {
                // workerd supports manual/follow only; never forward signed headers to a redirect.
                method: 'POST', redirect: 'manual', signal: controller.signal,
                headers: { 'content-type': 'text/plain', 'x-zalo-worker-timestamp': timestamp, 'x-zalo-worker-signature': signature,
                    ...(env.VERCEL_AUTOMATION_BYPASS_SECRET ? { 'x-vercel-protection-bypass': env.VERCEL_AUTOMATION_BYPASS_SECRET } : {}) },
                body,
            });
        } catch (_) { throw new Error('TRANSPORT_FAILED'); }
        if (response.status >= 300 && response.status < 400) return { ok: false, retryAfter: 0 };
        const retryAfter = Number(response.headers.get('retry-after'));
        let payload;
        try { payload = await response.json(); }
        catch (_) { throw new Error('RESPONSE_INVALID'); }
        return { ok: response.ok && SUCCESS_STATUSES.has(payload?.status), retryAfter: retryAfter > 0 ? Math.min(65, Math.ceil(retryAfter)) : 0 };
    } finally { clearTimeout(timer); }
}

export default {
    fetch() {
        // Queue publishing uses Cloudflare's authenticated API; no public producer endpoint.
        return new Response('Not found', { status: 404 });
    },
    async queue(batch, env) {
        for (const message of batch.messages) {
            if (!isJob(message.body)) {
                console.warn('[zalo-queue] result=invalid_job');
                message.ack();
                continue;
            }
            let retryAfter = Math.min(40, 10 * 2 ** Math.max(0, message.attempts - 1));
            let errorCode = 'CALLBACK_REJECTED';
            try {
                const result = await callWorker({ chatHash: message.body.chatHash, batchId: message.body.batchId }, env);
                if (result.ok) { message.ack(); continue; }
                retryAfter = result.retryAfter || retryAfter;
            } catch (error) { errorCode = callbackErrorCode(error); }
            console.warn(`[zalo-queue] result=retry error_code=${errorCode}`);
            message.retry({ delaySeconds: retryAfter });
        }
    },
    async scheduled(_event, env) {
        try {
            const result = await callWorker({ type: 'sweep' }, env);
            if (!result.ok) throw new Error();
        } catch (error) {
            console.error(`[zalo-queue] result=sweep_failed error_code=${callbackErrorCode(error)}`);
            throw new Error('ZALO_SWEEP_FAILED');
        }
    },
};
