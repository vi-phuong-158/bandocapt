'use strict';

const { formatForZalo, splitZaloText, sendZaloMessage } = require('./zalo-bot');
const { validateChatContent } = require('./chat-validation');
const { NON_TEXT_MESSAGE_TEXT, RATE_LIMITED_TEXT } = require('./zalo-bot-v1');

const TEMPORARY_ERROR_TEXT = 'Xin lỗi, hệ thống đang gặp sự cố tạm thời. Vui lòng thử lại sau ít phút.';

async function processZaloBatch({ job, store, resolveTurn, sanitizeHistory, req, now = Date.now, sendImpl = sendZaloMessage }) {
    const startedAt = now();
    const deadlineAt = startedAt + 55000;
    const claimed = await store.claim({ ...job, deadlineAt });
    if (claimed.status !== 'claimed') return claimed;
    const { batch, chatId } = claimed;
    const owner = { ...job, owner: batch.owner, deadlineAt };
    const history = sanitizeHistory(Array.isArray(claimed.history) ? claimed.history : []);
    const text = batch.fragments.filter(part => part.kind === 'text').map(part => part.text).join('\n');
    const update = async (method, data) => {
        if (now() >= deadlineAt) throw new Error('ZALO_WORKER_DEADLINE');
        const result = await store[method]({ ...owner, ...data });
        if (result.status === 'stale') throw new Error('ZALO_WORKER_STALE');
    };
    try {
        let reply = batch.reply;
        if (!reply) {
            let answer;
            const invalid = batch.fragments.find(part => part.kind === 'invalid');
            const validation = validateChatContent(text);
            if (!batch.quotaAllowed) answer = { intent: 'RATE_LIMIT', result: 'RATE_LIMITED', text: RATE_LIMITED_TEXT };
            else if (invalid) answer = { intent: 'VALIDATION', result: 'INVALID_INPUT', text: invalid.text };
            else if (!text && batch.fragments.some(part => part.kind === 'non_text')) answer = { intent: 'NON_TEXT', result: 'NON_TEXT_REPLIED', text: NON_TEXT_MESSAGE_TEXT };
            else if (!validation.ok) answer = { intent: 'VALIDATION', result: 'INVALID_INPUT', text: validation.detail };
            else answer = await resolveTurn({ text, history, principal: `zalo-batch:${job.chatHash}`, req, startedAt, deadlineAt });
            if (answer.result === 'INTERNAL_ERROR' && batch.attempts < 4) {
                await update('retry');
                return { status: 'retry', retryAfter: 10 * 2 ** (batch.attempts - 1) };
            }
            reply = { intent: answer.intent, result: answer.result, chunks: splitZaloText(formatForZalo(answer.text) || TEMPORARY_ERROR_TEXT) };
            await update('saveReply', { reply });
        }
        for (let index = batch.nextChunk; index <= reply.chunks.length; index++) {
            // Record BEFORE the API call. An orphaned inFlight is deliberately not resent.
            await update('markSending', { index });
            try {
                const timeoutMs = Math.min(8000, deadlineAt - now() - 4000);
                if (timeoutMs <= 0) {
                    await update('retry');
                    return { status: 'retry', retryAfter: 10 };
                }
                await sendImpl({ chatId, text: reply.chunks[index - 1], timeoutMs, requireConfirmation: true });
            } catch (error) {
                if (error.code === 'ZALO_SEND_RETRYABLE') {
                    await update('retry');
                    return { status: 'retry', retryAfter: 10 * 2 ** (batch.attempts - 1) };
                }
                const status = error.code === 'ZALO_SEND_REJECTED' ? 'delivery_failed' : 'delivery_unknown';
                await update('finish', { status });
                return { status };
            }
            await update('markSent', { index });
        }
        const nextHistory = text && !['INVALID_INPUT', 'RATE_LIMITED', 'INTERNAL_ERROR'].includes(reply.result)
            ? sanitizeHistory([...history, { role: 'user', parts: [{ text }] }, { role: 'model', parts: [{ text: reply.chunks.join('') }] }])
            : [];
        await update('finish', { status: 'done', history: nextHistory });
        return { status: 'done', fragmentCount: batch.fragments.length, durationMs: now() - startedAt };
    } catch (_) {
        // Leave persisted state/lease intact. A retry/sweep safely resumes or marks unknown delivery.
        return { status: 'retry', retryAfter: Math.max(10, Math.ceil((batch.leaseUntil - now()) / 1000)) };
    }
}

module.exports = { processZaloBatch };
