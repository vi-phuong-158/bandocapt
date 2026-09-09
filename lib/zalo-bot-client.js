'use strict';

// =====================================================================
// ZALO BOT API CLIENT — adapter thuần cho Zalo Bot Platform.
//
// Contract xác nhận qua nhiều SDK/tooling bên thứ ba độc lập (Go, Python, JS, n8n) vì
// docs.zaloplatforms.com bị chặn egress trong môi trường build này (xem docs/zalo-bot.md
// mục "Zalo contract verified" để biết chi tiết + việc owner cần tự đối chiếu docs chính
// thức trước khi đi production). Endpoint dạng Telegram-style:
//   POST https://bot-api.zaloplatforms.com/bot<TOKEN>/<method>
// Response envelope: { ok: boolean, result?, description? }.
//
// KHÔNG log Bot Token: URL chứa token chỉ được dùng nội bộ cho fetch(), không bao giờ
// đưa vào console.log/console.warn/console.error hay lỗi trả về caller.
// =====================================================================

const ZALO_BOT_API_BASE = 'https://bot-api.zaloplatforms.com';
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_ATTEMPTS = 3; // 1 lần gọi đầu + tối đa 2 lần retry cho lỗi transient
const RETRY_BACKOFF_BASE_MS = 300;

function getBotApiUrl(token, method) {
    return `${ZALO_BOT_API_BASE}/bot${token}/${method}`;
}

// Chỉ retry lỗi transient thật sự: 429 (rate limit) và 5xx (lỗi phía Zalo). KHÔNG retry mù
// bất kỳ lỗi 4xx nào khác — theo yêu cầu bảo mật, tránh khuếch đại lỗi client thành spam.
function isRetryableStatus(status) {
    return status === 429 || (status >= 500 && status <= 599);
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Gọi 1 method Zalo Bot API. KHÔNG bao giờ trả về hay log chính `url` (chứa token).
async function callZaloApi(method, payload, options = {}) {
    const {
        token = process.env.ZALO_BOT_TOKEN,
        timeoutMs = DEFAULT_TIMEOUT_MS,
        maxAttempts = DEFAULT_MAX_ATTEMPTS,
        fetchImpl = fetch,
    } = options;

    if (!token) {
        return { ok: false, error: 'ZALO_BOT_TOKEN_MISSING', detail: 'ZALO_BOT_TOKEN chưa được cấu hình.' };
    }

    const url = getBotApiUrl(token, method);
    let lastResult = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetchImpl(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload || {}),
                signal: controller.signal,
            });
            clearTimeout(timer);

            let data = null;
            try {
                data = await res.json();
            } catch (_) {
                // Non-JSON body — coi như lỗi, dùng HTTP status làm mô tả.
            }

            if (res.ok && data && data.ok !== false) {
                return { ok: true, result: data.result !== undefined ? data.result : data };
            }

            const description = (data && (data.description || data.detail || data.error)) || `HTTP ${res.status}`;
            lastResult = {
                ok: false,
                status: res.status,
                error: 'ZALO_API_ERROR',
                detail: String(description).substring(0, 300),
            };

            if (!isRetryableStatus(res.status) || attempt === maxAttempts) {
                return lastResult;
            }
        } catch (err) {
            clearTimeout(timer);
            const isTimeout = err && err.name === 'AbortError';
            lastResult = {
                ok: false,
                error: isTimeout ? 'ZALO_API_TIMEOUT' : 'ZALO_API_NETWORK_ERROR',
                detail: isTimeout ? 'timeout' : String(err.message || err).substring(0, 300),
            };
            if (attempt === maxAttempts) {
                return lastResult;
            }
        }

        await delay(RETRY_BACKOFF_BASE_MS * attempt);
    }

    return lastResult || { ok: false, error: 'ZALO_API_UNKNOWN_ERROR', detail: 'Không rõ nguyên nhân.' };
}

async function sendMessage(chatId, text, options = {}) {
    return callZaloApi('sendMessage', { chat_id: chatId, text }, options);
}

async function sendChatAction(chatId, action = 'typing', options = {}) {
    return callZaloApi('sendChatAction', { chat_id: chatId, action }, options);
}

async function setWebhook(webhookUrl, secretToken, options = {}) {
    return callZaloApi('setWebhook', { url: webhookUrl, secret_token: secretToken }, options);
}

async function deleteWebhook(options = {}) {
    return callZaloApi('deleteWebhook', {}, options);
}

async function getWebhookInfo(options = {}) {
    return callZaloApi('getWebhookInfo', {}, options);
}

module.exports = {
    getBotApiUrl,
    isRetryableStatus,
    callZaloApi,
    sendMessage,
    sendChatAction,
    setWebhook,
    deleteWebhook,
    getWebhookInfo,
};
