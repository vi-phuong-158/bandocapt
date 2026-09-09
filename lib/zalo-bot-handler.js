'use strict';

// =====================================================================
// ZALO BOT WEBHOOK HANDLER — kênh giao tiếp công khai thứ hai của Bản đồ Công an Phú Thọ.
//
// Kiến trúc "MỘT LÕI — NHIỀU KÊNH": handler này KHÔNG triển khai lại RAG/AI/location resolver.
// Toàn bộ nghiệp vụ (system prompt, Pinecone RAG, retrieval governance, Published_Locations,
// output validator) chạy qua `runChatCore` — đúng cùng hàm mà `api/chat.js` dùng cho website,
// chỉ khác sink (BufferSink thay vì SseSink) và transport phía trước nó (webhook Zalo thay vì
// CORS/Turnstile/HMAC của trình duyệt). Xem docs/zalo-bot.md để biết toàn bộ luồng dữ liệu.
//
// File này KHÔNG nằm trực tiếp dưới api/ để không vượt giới hạn 12 Serverless Function của
// gói Vercel Hobby hiện tại của dự án (xem test/vercel-preview-budget.test.js): endpoint công
// khai `/api/zalo-bot` được vercel.json rewrite vào `api/feedback.js?__route=zalo-bot`, và
// `api/feedback.js` chỉ thêm đúng MỘT nhánh bridge ở đầu handler, gọi thẳng vào đây — không
// đổi hành vi feedback hiện có. Cùng kỹ thuật với `/api/staff/auth/config` đã dùng trước đó.
// =====================================================================

const crypto = require('crypto');
const { waitUntil } = require('@vercel/functions');
// Require nguyên module (namespace) thay vì destructure trực tiếp: destructure sẽ "đóng
// băng" tham chiếu hàm ngay tại thời điểm require đầu tiên, khiến test không thể mock riêng
// từng ca bằng cách gán lại `module.exports.<fn>` sau đó. Giữ nguyên hành vi production;
// đây thuần là seam cho test (xem test/zalo-bot-handler.test.js).
const chatCore = require('../api/chat.js');
const { createBufferSink } = require('./response-sink');
const zaloClient = require('./zalo-bot-client');
const zaloSession = require('./zalo-session');
const { formatZaloReply, getFallbackReply, getAppUrl } = require('./zalo-formatter');
const { checkAndIncrement } = require('./rate-limit-store');

const RATE_LIMIT_NAMESPACE = 'bandocapt:zalo-bot:v1';
const RATE_LIMIT_WINDOW_SECONDS = 3600; // 1 giờ

function getPositiveEnvInt(name, fallback) {
    const value = parseInt(process.env[name], 10);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

function isBotEnabled() {
    return process.env.ZALO_BOT_ENABLED === 'true';
}

// So sánh hằng thời gian để tránh timing attack dò secret. Độ dài khác nhau tự động false
// (không dùng timingSafeEqual trực tiếp trên hai buffer khác length — nó throw).
function verifySecretToken(req) {
    const expected = process.env.ZALO_BOT_WEBHOOK_SECRET;
    if (!expected) return { ok: false, reason: 'not_configured' };
    const provided = req.headers['x-bot-api-secret-token'];
    if (!provided || typeof provided !== 'string') return { ok: false, reason: 'missing' };
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return { ok: false, reason: 'mismatch' };
    try {
        return { ok: crypto.timingSafeEqual(a, b), reason: 'checked' };
    } catch (_) {
        return { ok: false, reason: 'mismatch' };
    }
}

// Parse phòng thủ: hợp đồng thực tế của webhook Zalo Bot chưa xác minh được bằng tài liệu
// chính thức trong môi trường build này (docs.zaloplatforms.com bị egress-block — xem
// docs/zalo-bot.md mục "Zalo contract verified"). Nhiều SDK bên thứ ba độc lập (Go/Python/
// JS/n8n) đều cho thấy dạng giống Telegram Bot API: có thể lồng thẳng { message: {...} }
// hoặc bọc thêm { result: { message: {...} } }. Chấp nhận cả hai, coi mọi dạng khác là event
// chưa hỗ trợ — KHÔNG throw, chỉ trả null để caller ACK và bỏ qua an toàn.
function extractIncomingMessage(body) {
    if (!body || typeof body !== 'object') return null;
    const container = body.result && typeof body.result === 'object' ? body.result : body;
    const message = container.message && typeof container.message === 'object' ? container.message : null;
    if (!message) return null;

    const chat = message.chat && typeof message.chat === 'object' ? message.chat : null;
    const chatId = chat?.id ?? message.chat_id ?? container.chat_id;
    const messageId = message.message_id ?? message.messageId ?? container.message_id;
    const text = typeof message.text === 'string' ? message.text : null;
    const chatType = chat?.chat_type || chat?.type || message.chat_type || null;

    if (chatId === undefined || chatId === null || String(chatId).trim() === '') return null;
    if (messageId === undefined || messageId === null || String(messageId).trim() === '') return null;

    return { chatId: String(chatId), messageId: String(messageId), text, chatType };
}

function isPrivateChat(chatType) {
    if (!chatType) return true; // Không rõ loại chat — mặc định coi là private (giữ hành vi hiện có, an toàn hơn từ chối trắng mọi update thiếu field này).
    return String(chatType).toUpperCase() === 'PRIVATE';
}

const START_HELP_TEXT = [
    'Chào bạn! Đây là Bản đồ Công an số tỉnh Phú Thọ trên Zalo.',
    'Mình hỗ trợ tra cứu trụ sở Công an (địa chỉ, số điện thoại, chỉ đường) và tư vấn thủ tục',
    'hành chính về xuất nhập cảnh, cư trú của người nước ngoài.',
    '',
    'Bạn có thể hỏi ví dụ:',
    '- Công an xã Bình Xuyên ở đâu?',
    '- Làm căn cước công dân cần giấy tờ gì?',
    '- Khai báo tạm trú cho người nước ngoài thế nào?',
    '',
    '⚠️ Lưu ý: KHÔNG gửi số CCCD, số hộ chiếu hay thông tin cá nhân nhạy cảm vào đây.',
].join('\n');

function getStartHelpText() {
    return `${START_HELP_TEXT}\n\nBản đồ đầy đủ: ${getAppUrl()}`;
}

// Intent điều hướng tất định — không cần AI xử lý những câu này (mục 13.C/17 của nhiệm vụ).
function matchDeterministicIntent(rawText) {
    const text = String(rawText || '').trim().toLowerCase();
    if (['/start', 'start', '/help', 'help', 'trợ giúp', 'tro giup'].includes(text)) {
        return getStartHelpText();
    }
    if (['/bando', 'bando', 'bản đồ', 'ban do', 'địa điểm', 'dia diem'].includes(text)) {
        return `Xem bản đồ trụ sở Công an tỉnh Phú Thọ tại: ${getAppUrl()}`;
    }
    if (['đóng góp', 'dong gop'].includes(text)) {
        return `Đóng góp cập nhật địa điểm tại: ${getAppUrl()}/dong-gop`;
    }
    if (['trang web', 'website', 'web'].includes(text)) {
        return getAppUrl();
    }
    return null;
}

function getVnDateKey(now = new Date()) {
    const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    return `${vn.getUTCFullYear()}_${String(vn.getUTCMonth() + 1).padStart(2, '0')}_${String(vn.getUTCDate()).padStart(2, '0')}`;
}

// Telemetry tối thiểu — KHÔNG log chat.id thô, IP, hay toàn văn hội thoại. console.log có
// cấu trúc là đủ cho phase pilot; không thêm collection Firestore mới để tránh mở rộng
// schema telemetry chia sẻ với website (xem docs/brain/03-decisions.md quyết định liên quan).
function logZaloTelemetry(entry) {
    try {
        console.log('[zalo-telemetry]', JSON.stringify({
            channel: 'zalo',
            status: entry.status,
            latency_ms: entry.latencyMs,
            used_rag: Boolean(entry.usedRag),
            source_count: entry.sourceCount || 0,
            error_class: entry.errorClass || '',
        }));
    } catch (_) { /* logging không bao giờ được làm vỡ luồng xử lý chính */ }
}

async function checkZaloRateLimit(chatId) {
    const perChatLimit = getPositiveEnvInt('ZALO_CHAT_RATE_LIMIT', 20);
    const globalLimit = getPositiveEnvInt('ZALO_GLOBAL_RATE_LIMIT', 300);
    const redisUrl = process.env.KV_REST_API_URL;
    const redisToken = process.env.KV_REST_API_TOKEN;
    const resetAt = Date.now() + RATE_LIMIT_WINDOW_SECONDS * 1000;

    const perChat = await checkAndIncrement({
        redisUrl,
        redisToken,
        namespace: RATE_LIMIT_NAMESPACE,
        key: `chat-${zaloSession.hashChatId(chatId)}`,
        window: 'hour',
        limit: perChatLimit,
        windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
        resetAt,
        allowInMemoryFallback: true,
    });
    if (!perChat.allowed) return { allowed: false, scope: 'chat' };

    const global = await checkAndIncrement({
        redisUrl,
        redisToken,
        namespace: RATE_LIMIT_NAMESPACE,
        key: 'global',
        window: 'hour',
        limit: globalLimit,
        windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
        resetAt,
        allowInMemoryFallback: true,
    });
    if (!global.allowed) return { allowed: false, scope: 'global' };

    return { allowed: true };
}

async function processZaloMessage(incoming) {
    const { chatId, text } = incoming;
    const startedAt = Date.now();
    try {
        const deterministic = matchDeterministicIntent(text);
        if (deterministic) {
            await zaloClient.sendMessage(chatId, deterministic);
            logZaloTelemetry({ status: 'ok_deterministic', latencyMs: Date.now() - startedAt });
            return;
        }

        const validation = chatCore.validateChatRequestBody({ userMessage: text });
        if (!validation.ok) {
            await zaloClient.sendMessage(chatId, validation.detail || getFallbackReply());
            logZaloTelemetry({ status: 'rejected_input', latencyMs: Date.now() - startedAt, errorClass: validation.error });
            return;
        }

        const rateLimit = await checkZaloRateLimit(chatId);
        if (!rateLimit.allowed) {
            await zaloClient.sendMessage(chatId,
                'Bạn đang thao tác quá nhanh. Vui lòng chờ một lát rồi hỏi lại nhé.');
            logZaloTelemetry({ status: 'rate_limited', latencyMs: Date.now() - startedAt, errorClass: rateLimit.scope });
            return;
        }

        await zaloClient.sendChatAction(chatId, 'typing').catch(() => {});

        const history = await zaloSession.getSessionHistory(chatId);
        const sink = createBufferSink();
        const deadlineMs = getPositiveEnvInt('ZALO_REQUEST_DEADLINE_MS', 45000);
        const coreStartTime = Date.now();

        await chatCore.runChatCore({
            userMessage: validation.userMessage,
            history,
            // Không có IP trình duyệt thật cho kênh Zalo — dùng namespace ổn định riêng,
            // tách khỏi rate-limit IP/ngày của website (CHAT_DAILY_IP_LIMIT không áp cho Zalo,
            // Zalo có rate limit riêng theo chat.id/global ở trên).
            clientIP: `zalo:${chatId}`,
            userAgent: 'zalo-bot',
            deadlineAt: coreStartTime + deadlineMs,
            startTime: coreStartTime,
            evalMode: false,
            currentDate: getVnDateKey(),
            sink,
        });

        const result = sink.result();
        if (result.failure || !result.done || !result.done.fullText) {
            await zaloClient.sendMessage(chatId, getFallbackReply());
            logZaloTelemetry({
                status: 'ai_failure',
                latencyMs: Date.now() - startedAt,
                errorClass: result.failure ? String(result.failure.status || 'unknown') : 'empty_result',
            });
            return;
        }

        const { fullText, sources, verifiedLocations } = result.done;
        const messages = formatZaloReply({ fullText, sources, verifiedLocations });
        for (const message of messages) {
            // Gửi tuần tự (không song song) để giữ đúng thứ tự đọc cho người dùng.
            // eslint-disable-next-line no-await-in-loop
            await zaloClient.sendMessage(chatId, message);
        }

        await zaloSession.appendSessionTurn(chatId, validation.userMessage, fullText);
        logZaloTelemetry({
            status: 'ok',
            latencyMs: Date.now() - startedAt,
            usedRag: Array.isArray(sources) && sources.length > 0,
            sourceCount: Array.isArray(sources) ? sources.length : 0,
        });
    } catch (err) {
        console.error('[zalo-bot] Lỗi xử lý message:', err.message);
        await zaloClient.sendMessage(chatId, getFallbackReply()).catch(() => {});
        logZaloTelemetry({ status: 'error', latencyMs: Date.now() - startedAt, errorClass: 'unhandled_exception' });
    }
}

module.exports = async function zaloBotHandler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }

    // Kill switch: ACK ngay, không chạm Firestore/AI/Zalo API. Website (api/chat.js) hoàn
    // toàn không phụ thuộc cờ này.
    if (!isBotEnabled()) {
        return res.status(200).json({ ok: true, disabled: true });
    }

    const secretCheck = verifySecretToken(req);
    if (!secretCheck.ok) {
        if (secretCheck.reason === 'not_configured') {
            console.error('[zalo-bot] ZALO_BOT_WEBHOOK_SECRET chưa được cấu hình.');
            return res.status(503).json({ error: 'SERVER_CONFIG_ERROR' });
        }
        console.warn('[zalo-bot] Secret token không hợp lệ hoặc thiếu.');
        return res.status(403).json({ error: 'FORBIDDEN' });
    }

    const incoming = extractIncomingMessage(req.body);
    if (!incoming) {
        // Event không parse được / không hỗ trợ — ACK 200 để Zalo không lặp lại retry vô ích.
        return res.status(200).json({ ok: true, ignored: true });
    }

    if (!isPrivateChat(incoming.chatType)) {
        // GROUP/khác: ngoài phạm vi phase này (nhiệm vụ mục 30) — ACK, không trả lời, không gọi AI.
        return res.status(200).json({ ok: true, ignored: true, reason: 'unsupported_chat_type' });
    }

    if (!incoming.text || incoming.text.trim() === '') {
        return res.status(200).json({ ok: true, ignored: true, reason: 'empty_text' });
    }

    const dedupeKey = crypto.createHash('sha256').update(`${incoming.chatId}:${incoming.messageId}`).digest('hex');
    const claimed = await zaloSession.claimMessageOnce(dedupeKey);
    if (!claimed) {
        // Duplicate webhook delivery — ACK mà không xử lý lại (idempotency, mục 19 nhiệm vụ).
        return res.status(200).json({ ok: true, duplicate: true });
    }

    // ACK ngay — phần còn lại (RAG/AI + gửi tin Zalo) chạy nền qua waitUntil, không giữ
    // webhook mở trong lúc Gemini/RAG xử lý dài (mục 9 nhiệm vụ).
    res.status(200).json({ ok: true });
    waitUntil(processZaloMessage(incoming));
};

module.exports.extractIncomingMessage = extractIncomingMessage;
module.exports.verifySecretToken = verifySecretToken;
module.exports.matchDeterministicIntent = matchDeterministicIntent;
module.exports.isPrivateChat = isPrivateChat;
module.exports.isBotEnabled = isBotEnabled;
module.exports.processZaloMessage = processZaloMessage;
module.exports.checkZaloRateLimit = checkZaloRateLimit;
module.exports.getVnDateKey = getVnDateKey;
module.exports.getStartHelpText = getStartHelpText;
