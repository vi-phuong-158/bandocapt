'use strict';

// =====================================================================
// ZALO BOT PLATFORM V0 — transport adapter riêng cho kênh Zalo Bot.
//
// File này CHỈ chứa logic transport-specific của Zalo Bot Platform (khác biệt
// hoàn toàn Zalo OA OpenAPI — không dùng OA, không GMF): xác thực webhook,
// parse payload chính thức, chia nhỏ text theo giới hạn 2000 ký tự và gọi
// sendMessage. KHÔNG chứa RAG/orchestration — pipeline chatbot dùng chung nằm
// trong api/chat.js (`runChatOrchestration`), file này không được phép copy
// lại pipeline đó.
//
// V0 CHỈ hỗ trợ event `message.text.received`. Ảnh/sticker/voice/event khác
// được `parseZaloWebhook` phân loại `supported: false` để tầng gọi ACK an
// toàn mà không đưa vào RAG.
// =====================================================================

const crypto = require('crypto');

const ZALO_BOT_API_BASE = 'https://bot-api.zaloplatforms.com';
const ZALO_MAX_TEXT_LENGTH = 2000;
const TEXT_EVENT_NAME = 'message.text.received';

// Route/query phải khớp đúng kênh Zalo trước khi xét tới secret token — đây là
// điều kiện ĐẦU TIÊN trong 2 điều kiện xác định "Zalo Bot trusted request"
// (điều kiện thứ hai là verifyZaloWebhookSecret). Chỉ POST mới hợp lệ; GET/
// OPTIONS luôn rơi về luồng website để giữ nguyên hành vi CORS/preflight cũ.
function isZaloBotRoute(req) {
    if (!req || req.method !== 'POST') return false;
    const channel = req.query && req.query.__channel;
    return channel === 'zalo_bot';
}

// So sánh constant-time khi độ dài phù hợp — cùng khuôn mẫu với
// lib/request-security.js verifyRequestSignature(), không phát minh cơ chế mới.
function constantTimeEquals(a, b) {
    const bufA = Buffer.from(String(a), 'utf8');
    const bufB = Buffer.from(String(b), 'utf8');
    return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

// Webhook secret phải dài 8-256 ký tự (ràng buộc của task). Secret rỗng/thiếu
// cấu hình luôn fail-closed — không có "chế độ mở" nào cho kênh Zalo.
function verifyZaloWebhookSecret(req, secretEnv = process.env.ZALO_BOT_WEBHOOK_SECRET) {
    if (typeof secretEnv !== 'string' || secretEnv.length < 8 || secretEnv.length > 256) return false;
    const provided = req && req.headers && req.headers['x-bot-api-secret-token'];
    if (typeof provided !== 'string' || !provided) return false;
    return constantTimeEquals(provided, secretEnv);
}

// Parse đúng hợp đồng chính thức: body.result.event_name / body.result.message.
// Trả về { ok:false } chỉ khi payload không đúng hình dạng tối thiểu (ACK an
// toàn, không throw 500). Trả { ok:true, supported:false, ... } cho mọi
// trường hợp V0 không xử lý (event khác text, tin nhắn từ bot, thiếu text/chat)
// — bên gọi ACK mà không đưa vào RAG, không bịa câu trả lời.
function parseZaloWebhook(body) {
    if (!body || typeof body !== 'object') return { ok: false, reason: 'INVALID_BODY' };

    const result = body.result;
    if (!result || typeof result !== 'object') return { ok: false, reason: 'INVALID_BODY' };

    const eventName = typeof result.event_name === 'string' ? result.event_name : null;
    if (eventName !== TEXT_EVENT_NAME) {
        return { ok: true, supported: false, eventName, reason: 'UNSUPPORTED_EVENT' };
    }

    const message = result.message;
    if (!message || typeof message !== 'object') {
        return { ok: false, reason: 'INVALID_MESSAGE' };
    }

    if (message.from && message.from.is_bot === true) {
        return { ok: true, supported: false, eventName, reason: 'BOT_MESSAGE' };
    }

    const text = typeof message.text === 'string' ? message.text.trim() : '';
    const chat = message.chat && typeof message.chat === 'object' ? message.chat : {};
    const chatId = chat.id;
    const chatType = typeof chat.chat_type === 'string' ? chat.chat_type : 'UNKNOWN';
    const fromId = message.from && message.from.id;

    if (!text || chatId === undefined || chatId === null || chatId === '') {
        return { ok: true, supported: false, eventName, reason: 'MISSING_TEXT_OR_CHAT' };
    }

    return {
        ok: true,
        supported: true,
        eventName,
        text,
        chatId: String(chatId),
        chatType,
        fromId: fromId === undefined || fromId === null || fromId === '' ? 'unknown' : String(fromId),
    };
}

// Principal ổn định cho rate-limit — KHÔNG dùng IP webhook server của Zalo
// (mọi webhook Zalo đến từ cùng dải hạ tầng của Zalo, không đại diện người
// dùng cuối). Chuỗi này được băm (HMAC, cơ chế hiện hành trong api/chat.js
// hashForLog) trước khi dùng làm key lưu trữ hoặc ghi log.
function buildZaloRatePrincipal({ chatType, chatId, fromId }) {
    return `zalo:${chatType}:${chatId}:${fromId}`;
}

// Chia text tại ranh giới đoạn/câu/khoảng trắng gần nhất, tuyệt đối không mất
// ký tự: mọi lần cắt giữ lại ký tự phân tách trong đoạn TRƯỚC (không trim),
// nên nối các đoạn lại đúng bằng chuỗi gốc. Cắt cứng ở đúng maxLength chỉ khi
// không tìm được ranh giới an toàn nào trong phạm vi cho phép.
function splitZaloText(text, maxLength = ZALO_MAX_TEXT_LENGTH) {
    const value = typeof text === 'string' ? text : String(text === null || text === undefined ? '' : text);
    if (value.length <= maxLength) return [value];

    const BOUNDARIES = ['\n\n', '\n', '. ', ' '];
    const chunks = [];
    let remaining = value;

    while (remaining.length > maxLength) {
        let cutAt = -1;
        for (const needle of BOUNDARIES) {
            const searchLimit = maxLength - needle.length;
            if (searchLimit < 0) continue;
            const idx = remaining.lastIndexOf(needle, searchLimit);
            if (idx >= 0) {
                cutAt = idx + needle.length;
                break;
            }
        }
        if (cutAt <= 0) cutAt = maxLength;
        chunks.push(remaining.slice(0, cutAt));
        remaining = remaining.slice(cutAt);
    }
    if (remaining.length > 0) chunks.push(remaining);
    return chunks;
}

// POST /sendMessage — không log token/secret; lỗi chỉ mang HTTP status.
async function sendZaloMessage({ chatId, text, token = process.env.ZALO_BOT_TOKEN, fetchImpl = fetch, timeoutMs = 8000 }) {
    if (!token) throw new Error('ZALO_BOT_TOKEN chưa được cấu hình.');
    if (!chatId) throw new Error('Thiếu chat_id khi gửi tin Zalo.');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetchImpl(`${ZALO_BOT_API_BASE}/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text }),
            signal: controller.signal,
        });
        if (!res || !res.ok) {
            const status = res ? res.status : 'network_error';
            throw new Error(`Zalo sendMessage thất bại (HTTP ${status}).`);
        }
        // Zalo Bot API có thể trả HTTP 200 kèm { ok: false, ... } khi platform từ chối request ở
        // tầng application (không phải lỗi mạng/HTTP) — status 2xx một mình không đủ để coi là
        // gửi thành công. Không log body (có thể mang dữ liệu Zalo trả về), chỉ ném lỗi chung.
        let body = null;
        try {
            body = await res.json();
        } catch (_) {
            body = null;
        }
        if (body && body.ok === false) {
            throw new Error('Zalo sendMessage thất bại (API trả ok=false).');
        }
        return true;
    } finally {
        clearTimeout(timer);
    }
}

module.exports = {
    ZALO_BOT_API_BASE,
    ZALO_MAX_TEXT_LENGTH,
    TEXT_EVENT_NAME,
    isZaloBotRoute,
    verifyZaloWebhookSecret,
    parseZaloWebhook,
    buildZaloRatePrincipal,
    splitZaloText,
    sendZaloMessage,
};
