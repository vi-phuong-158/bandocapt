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
// Chỉ event `message.text.received` được xử lý nội dung. Ảnh/sticker/voice/event
// khác được `parseZaloWebhook` phân loại `supported: false` (không bao giờ vào
// RAG); riêng 4 loại tin người dùng không phải văn bản mang thêm `replyTarget`
// để tầng gọi trả một câu hướng dẫn tĩnh thay vì im lặng.
// =====================================================================

const crypto = require('crypto');

const ZALO_BOT_API_BASE = 'https://bot-api.zaloplatforms.com';
const ZALO_MAX_TEXT_LENGTH = 2000;
const TEXT_EVENT_NAME = 'message.text.received';
// Tin nhắn người dùng không phải văn bản — đúng danh sách event_name tài liệu hoá tại
// bot.zapps.me/docs/webhook/ (xác minh 2026-09-27). Chỉ những event này được trả một câu
// hướng dẫn tĩnh; event lạ khác vẫn bị bỏ qua im lặng.
const NON_TEXT_MESSAGE_EVENTS = new Set([
    'message.image.received',
    'message.sticker.received',
    'message.voice.received',
    'message.unsupported.received',
]);

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

// Hợp đồng CHÍNH THỨC/tài liệu hiện có (bot.zapps.me/docs/webhook/, xác minh 2026-09-26) là dạng
// BỌC: { ok: true, result: { event_name, message } }. Tuy nhiên production ACK 200 nhưng không có
// sendMessage nào ra đi (owner test "Xin chào" + "Công an phường Thanh Miếu ở đâu", 2026-09-26) —
// và SDK bên thứ ba độc lập cho nền tảng này (NightOwl-VN/zalobot-sdk `src/modules/webhook.js`)
// tự khai báo hỗ trợ CẢ hai dạng "wrapped { result: {...} }" lẫn "flat { event_name, message }".
// Không có bằng chứng raw production payload (không được phép log để "xem thử"), nên KHÔNG khẳng
// định chắc chắn dạng nào Zalo thực tế gửi trong sự cố này — chỉ có bằng chứng mức TRUNG BÌNH rằng
// dạng flat có xảy ra trong thực tế với nền tảng này. Chấp nhận cả hai dạng là backward-compatible
// và an toàn (không nới lỏng verify secret, không biến payload rác thành tin nhắn tin cậy), nên
// luôn chuẩn hoá qua normalizeZaloWebhookEnvelope() trước khi đọc event_name/message.
function normalizeZaloWebhookEnvelope(body) {
    if (!body || typeof body !== 'object') {
        return { envelope: null, shape: 'invalid' };
    }
    if (body.result && typeof body.result === 'object') {
        return { envelope: body.result, shape: 'wrapped' };
    }
    return { envelope: body, shape: 'flat' };
}

// Trả về { ok:false } chỉ khi payload không đúng hình dạng tối thiểu (ACK an
// toàn, không throw 500). Trả { ok:true, supported:false, ... } cho mọi
// trường hợp V0 không xử lý (event khác text, tin nhắn từ bot, thiếu text/chat)
// — bên gọi ACK mà không đưa vào RAG, không bịa câu trả lời. Mọi nhánh trả về đều mang
// `envelopeShape` (metadata an toàn: chỉ 'wrapped'/'flat'/'invalid', không phải nội dung) để
// tầng gọi log phục vụ chẩn đoán production mà không cần đọc/log raw body.
function readChatTarget(message) {
    const chat = message.chat && typeof message.chat === 'object' ? message.chat : {};
    const chatId = chat.id;
    if (chatId === undefined || chatId === null || chatId === '') return null;
    const fromId = message.from && message.from.id;
    return {
        chatId: String(chatId),
        chatType: ['PRIVATE', 'GROUP'].includes(chat.chat_type) ? chat.chat_type : 'UNKNOWN',
        fromId: fromId === undefined || fromId === null || fromId === '' ? 'unknown' : String(fromId),
        messageId: typeof message.message_id === 'string' || typeof message.message_id === 'number' ? String(message.message_id) : '',
    };
}

function parseZaloWebhook(body) {
    const { envelope, shape } = normalizeZaloWebhookEnvelope(body);
    if (!envelope) return { ok: false, reason: 'INVALID_BODY', envelopeShape: shape };

    const eventName = typeof envelope.event_name === 'string' ? envelope.event_name : null;
    if (eventName !== TEXT_EVENT_NAME) {
        const unsupported = { ok: true, supported: false, eventName, reason: 'UNSUPPORTED_EVENT', envelopeShape: shape };
        const nonText = envelope.message;
        if (!NON_TEXT_MESSAGE_EVENTS.has(eventName) || !nonText || typeof nonText !== 'object') return unsupported;
        if (nonText.from && nonText.from.is_bot === true) return unsupported;
        // `replyTarget` chỉ cho biết NƠI có thể gửi câu hướng dẫn tĩnh; nội dung ảnh/sticker/
        // voice không bao giờ được đọc hay đưa vào RAG.
        const replyTarget = readChatTarget(nonText);
        return replyTarget ? { ...unsupported, replyTarget } : unsupported;
    }

    const message = envelope.message;
    if (!message || typeof message !== 'object') {
        return { ok: false, reason: 'INVALID_MESSAGE', envelopeShape: shape };
    }

    if (message.from && message.from.is_bot === true) {
        return { ok: true, supported: false, eventName, reason: 'BOT_MESSAGE', envelopeShape: shape };
    }

    const text = typeof message.text === 'string' ? message.text.trim() : '';
    const target = readChatTarget(message);
    if (!text || !target) {
        return { ok: true, supported: false, eventName, reason: 'MISSING_TEXT_OR_CHAT', envelopeShape: shape };
    }

    return { ok: true, supported: true, eventName, text, ...target, envelopeShape: shape };
}

// Principal ổn định cho rate-limit — KHÔNG dùng IP webhook server của Zalo
// (mọi webhook Zalo đến từ cùng dải hạ tầng của Zalo, không đại diện người
// dùng cuối). Chuỗi này được băm (HMAC, cơ chế hiện hành trong api/chat.js
// hashForLog) trước khi dùng làm key lưu trữ hoặc ghi log.
function buildZaloRatePrincipal({ chatType, chatId, fromId }) {
    return `zalo:${chatType}:${chatId}:${fromId}`;
}

// Zalo hiển thị text thô: Markdown mà website render qua marked (**đậm**, ### tiêu đề,
// [nhãn](url), `code`, bảng) sẽ lộ nguyên ký hiệu. Giữ emoji, xuống dòng và URL; URL được
// tách ra trước khi xử lý nhấn mạnh để `*`/`_` bên trong URL không bị cắt nhầm.
const URL_PLACEHOLDER = '\u0000';

function formatInlineForZalo(line) {
    const urls = [];
    const protect = url => { urls.push(url); return `${URL_PLACEHOLDER}${urls.length - 1}${URL_PLACEHOLDER}`; };
    let value = line
        // lib/output-validator.js cố ý xoá URL chưa xác minh, để lại `[nhãn]()` — khi đó chỉ giữ nhãn.
        .replace(/!?\[([^\]]*)\]\(\s*<?([^)\s>]*)>?\s*\)/g, (_, label, url) => {
            const trimmed = label.trim();
            if (url && (!trimmed || trimmed === url)) return protect(url);
            const cleanLabel = trimmed.replace(/\*\*|__|`/g, '').trim();
            if (!url) return cleanLabel;
            return cleanLabel ? `${cleanLabel}: ${protect(url)}` : protect(url);
        })
        .replace(/<(https?:\/\/[^>\s]+)>/g, (_, url) => protect(url))
        .replace(/https?:\/\/[^\s<>*]+/g, url => protect(url));
    value = value
        .replace(/\\([\\`*_#[\]()>|-])/g, '$1')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/__(.+?)__/g, '$1')
        .replace(/`([^`\n]+)`/g, '$1')
        .replace(/(^|[^\w*])\*(?=\S)([^*\n]+?)\*(?![\w*])/g, '$1$2')
        .replace(/\*\*/g, '');
    return value.replace(new RegExp(`${URL_PLACEHOLDER}(\\d+)${URL_PLACEHOLDER}`, 'g'), (_, index) => urls[Number(index)]);
}

function formatForZalo(text) {
    if (typeof text !== 'string' || !text) return '';
    const lines = text.replace(/\r\n?/g, '\n').replace(/<br\s*\/?>/gi, '\n').split('\n');
    const out = [];
    let inFence = false;
    for (const rawLine of lines) {
        if (/^\s*```/.test(rawLine)) { inFence = !inFence; continue; }
        if (inFence) { out.push(rawLine); continue; }
        if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(rawLine)) continue;
        if (/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(rawLine)) continue;
        let line = rawLine
            .replace(/^\s*>\s?/, '')
            .replace(/^\s*#{1,6}\s+/, '')
            .replace(/^(\s*)[-*+]\s+/, '$1• ');
        if (/^\s*\|.*\|\s*$/.test(line)) {
            line = line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim()).filter(Boolean).join(' — ');
        }
        out.push(formatInlineForZalo(line));
    }
    return out.join('\n').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
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
async function sendZaloMessage({ chatId, text, token = process.env.ZALO_BOT_TOKEN, fetchImpl = fetch, timeoutMs = 8000, requireConfirmation = false }) {
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
            const error = new Error(`Zalo sendMessage thất bại (HTTP ${status}).`);
            error.code = status === 429 ? 'ZALO_SEND_RETRYABLE' : (typeof status === 'number' && status < 500 ? 'ZALO_SEND_REJECTED' : 'ZALO_DELIVERY_UNKNOWN');
            throw error;
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
            const error = new Error('Zalo sendMessage thất bại (API trả ok=false).');
            error.code = 'ZALO_SEND_REJECTED';
            throw error;
        }
        if (requireConfirmation && body?.ok !== true) {
            const error = new Error('Zalo delivery could not be confirmed.');
            error.code = 'ZALO_DELIVERY_UNKNOWN';
            throw error;
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
    NON_TEXT_MESSAGE_EVENTS,
    isZaloBotRoute,
    verifyZaloWebhookSecret,
    normalizeZaloWebhookEnvelope,
    parseZaloWebhook,
    buildZaloRatePrincipal,
    formatForZalo,
    splitZaloText,
    sendZaloMessage,
};
