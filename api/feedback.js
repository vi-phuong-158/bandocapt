/**
 * api/feedback.js — Vercel Serverless Function
 * Nhận báo cáo / phản hồi của người dùng về câu trả lời của chatbot để admin đọc và điều chỉnh.
 *
 * Tái dùng nguyên các lớp bảo mật của api/chat.js (CORS whitelist, HMAC request signing,
 * sanitize PII) để không dựng cơ chế mới và không lệch pha với chat. Lưu vào Firebase
 * Realtime DB `chat_feedback/<date_key>` — cùng hạ tầng telemetry fallback đang dùng.
 *
 * Ngoại lệ privacy có kiểm soát: khác telemetry mặc định (không lưu Q/A), endpoint này CÓ lưu
 * câu hỏi + câu trả lời của lượt bị báo cáo, vì người dùng CHỦ ĐỘNG bấm gửi (opt-in đồng ý).
 * Nội dung vẫn qua sanitizeDiagnosticText (lọc email/token/số hộ chiếu) và có TTL expires_at.
 */

'use strict';

const crypto = require('crypto');
const { waitUntil } = require('@vercel/functions');
const {
    isAllowedOrigin,
    resolveClientIp,
    verifyRequestSignature,
    sanitizeDiagnosticText,
    sendTelegramAlert,
} = require('./chat');

const FEEDBACK_RTDB_PATH = 'chat_feedback';
const FEEDBACK_IP_COUNT_PATH = 'feedback_ip_counts';
const VALID_RATINGS = new Set(['up', 'down']);
const VALID_CATEGORIES = new Set([
    'sai_thong_tin',   // Sai thông tin
    'thieu_thong_tin', // Thiếu thông tin
    'khong_lien_quan', // Không liên quan
    'ngon_tu',         // Ngôn từ không phù hợp
    'khac',            // Khác
]);
const MAX_COMMENT_LENGTH = 1000;
const MAX_CONTACT_LENGTH = 200;
const MAX_QA_LENGTH = 4000;
const MAX_SOURCES = 8;
const MAX_TURN_ID_LENGTH = 64;
const FEEDBACK_RETENTION_DAYS = 90;
const DEFAULT_DAILY_IP_LIMIT = 30;

function getPositiveEnvInt(name, fallback) {
    const value = parseInt(process.env[name], 10);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

// HMAC-hash IP để pseudonymize — không bao giờ lưu plaintext. Cùng công thức với api/chat.js.
function hashForLog(value) {
    if (!value) return '';
    const salt = process.env.CHAT_LOG_HASH_SALT || 'local-dev-chat-log-salt';
    return crypto.createHmac('sha256', salt).update(String(value)).digest('hex').substring(0, 32);
}

// Khóa ngày theo giờ Việt Nam (UTC+7) để trùng khớp với logs của api/chat.js.
function getVnDateKey(now = new Date()) {
    const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    return `${vn.getUTCFullYear()}_${(vn.getUTCMonth() + 1).toString().padStart(2, '0')}_${vn.getUTCDate().toString().padStart(2, '0')}`;
}

function trimString(value, maxLength) {
    return String(value == null ? '' : value).trim().slice(0, maxLength);
}

function sanitizeFeedbackSources(sources) {
    if (!Array.isArray(sources)) return [];
    return sources.slice(0, MAX_SOURCES).map(source => {
        const item = source && typeof source === 'object' ? source : {};
        return {
            file: trimString(item.file, 200),
            article: trimString(item.article, 200),
            url: trimString(item.url, 500),
            procedure_id: trimString(item.procedure_id, 120),
        };
    });
}

/**
 * Validate + chuẩn hóa body. Trả { ok, status?, error?, detail?, value? }.
 * value là dữ liệu đã sanitize sẵn sàng để build record.
 */
function validateFeedbackBody(body) {
    if (!body || typeof body !== 'object') {
        return { ok: false, status: 400, error: 'INVALID_BODY', detail: 'Body không hợp lệ.' };
    }

    const rating = trimString(body.rating, 8);
    if (!VALID_RATINGS.has(rating)) {
        return { ok: false, status: 400, error: 'INVALID_RATING', detail: 'rating phải là up hoặc down.' };
    }

    const turnId = trimString(body.turn_id, MAX_TURN_ID_LENGTH);
    if (!turnId || !/^[A-Za-z0-9_.:-]+$/.test(turnId)) {
        return { ok: false, status: 400, error: 'INVALID_TURN_ID', detail: 'Thiếu hoặc sai turn_id.' };
    }

    let category = trimString(body.category, 32);
    if (category && !VALID_CATEGORIES.has(category)) {
        return { ok: false, status: 400, error: 'INVALID_CATEGORY', detail: 'category không hợp lệ.' };
    }
    if (!category) category = '';

    const lang = trimString(body.lang, 8);

    return {
        ok: true,
        value: {
            rating,
            turnId,
            category,
            lang,
            // Sanitize toàn bộ nội dung tự do trước khi lưu (fail-closed với PII).
            comment: sanitizeDiagnosticText(trimString(body.comment, MAX_COMMENT_LENGTH), MAX_COMMENT_LENGTH),
            contact: sanitizeDiagnosticText(trimString(body.contact, MAX_CONTACT_LENGTH), MAX_CONTACT_LENGTH),
            question: sanitizeDiagnosticText(trimString(body.question, MAX_QA_LENGTH), MAX_QA_LENGTH),
            answer: sanitizeDiagnosticText(trimString(body.answer, MAX_QA_LENGTH), MAX_QA_LENGTH),
            sources: sanitizeFeedbackSources(body.sources),
        },
    };
}

function buildFeedbackRecord(value, meta, now = new Date()) {
    const retentionDays = getPositiveEnvInt('FEEDBACK_RETENTION_DAYS', FEEDBACK_RETENTION_DAYS);
    return {
        turn_id: value.turnId,
        rating: value.rating,
        category: value.category,
        comment: value.comment,
        contact: value.contact,
        question: value.question,
        answer: value.answer,
        sources: value.sources,
        lang: value.lang,
        ip_bucket_hash: hashForLog(meta.ip),
        user_agent_hash: hashForLog(meta.userAgent),
        date_key: getVnDateKey(now),
        created_at: now.getTime(),
        retention_days: retentionDays,
        expires_at: new Date(now.getTime() + retentionDays * 24 * 60 * 60 * 1000).getTime(),
    };
}

function getRtdbConfig() {
    const dbUrl = process.env.FIREBASE_DB_URL || '';
    if (!dbUrl) return null;
    const auth = process.env.FIREBASE_DB_SECRET ? `?auth=${process.env.FIREBASE_DB_SECRET}` : '';
    return { dbUrl, auth };
}

// Rate limit best-effort theo IP/ngày. Không atomic (không cần chính xác tuyệt đối như quota chat
// tốn phí LLM) — chỉ để chặn spam. Lỗi đọc → fail-open (không chặn) để không mất phản hồi thật.
async function isFeedbackRateLimited(dbUrl, auth, ipBucket, dateKey) {
    const limit = getPositiveEnvInt('FEEDBACK_DAILY_IP_LIMIT', DEFAULT_DAILY_IP_LIMIT);
    const url = `${dbUrl}/${FEEDBACK_IP_COUNT_PATH}/${dateKey}/${ipBucket}.json${auth}`;
    try {
        const res = await fetch(url);
        const current = res.ok ? Number(await res.json()) || 0 : 0;
        if (current >= limit) return true;
        await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(current + 1),
        });
        return false;
    } catch (err) {
        console.warn('[api/feedback] Không kiểm tra được rate limit (fail-open):', err.message);
        return false;
    }
}

async function persistFeedback(dbUrl, auth, record) {
    const url = `${dbUrl}/${FEEDBACK_RTDB_PATH}/${record.date_key}.json${auth}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
    });
    if (!res.ok) throw new Error(`RTDB responded ${res.status}`);
}

module.exports = async function handler(req, res) {
    // --- CORS: chỉ chấp nhận origin trong whitelist (dùng chung logic với api/chat.js) ---
    const origin = req.headers.origin;
    if (origin && isAllowedOrigin(origin, req)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (origin) {
        return res.status(403).json({ error: 'FORBIDDEN', detail: 'Origin not allowed.' });
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, X-Request-Token, X-Request-Time'
    );

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', detail: 'Use POST.' });
    }

    const validation = validateFeedbackBody(req.body);
    if (!validation.ok) {
        return res.status(validation.status).json({ error: validation.error, detail: validation.detail });
    }
    const { value } = validation;

    // --- HMAC request signing (chống spam endpoint) — chỉ bắt buộc khi có Origin (request từ browser) ---
    const userAgent = req.headers['user-agent'] || '';
    if (origin) {
        const token = req.headers['x-request-token'];
        const requestTime = req.headers['x-request-time'];
        if (!token || !requestTime) {
            return res.status(403).json({ error: 'MISSING_TOKEN', detail: 'Thiếu request token.' });
        }
        // Ký trên chuỗi định danh lượt phản hồi — client ký đúng cùng chuỗi này.
        const signedMessage = `${value.turnId}:${value.rating}`;
        if (!verifyRequestSignature({ token, requestTime, userMessage: signedMessage, userAgent, origin })) {
            return res.status(403).json({ error: 'INVALID_TOKEN', detail: 'Request token không hợp lệ.' });
        }
    }

    const clientIP = resolveClientIp(req);
    const now = new Date();
    const dateKey = getVnDateKey(now);
    const ipBucket = hashForLog(clientIP);

    const rtdb = getRtdbConfig();
    if (rtdb) {
        if (await isFeedbackRateLimited(rtdb.dbUrl, rtdb.auth, ipBucket, dateKey)) {
            return res.status(429).json({ error: 'RATE_LIMIT', detail: 'Bạn đã gửi quá nhiều phản hồi hôm nay.' });
        }
        const record = buildFeedbackRecord(value, { ip: clientIP, userAgent }, now);
        try {
            await persistFeedback(rtdb.dbUrl, rtdb.auth, record);
        } catch (err) {
            console.warn('[api/feedback] Không ghi được phản hồi vào RTDB:', err.message);
            return res.status(503).json({ error: 'SERVICE_UNAVAILABLE', detail: 'Không lưu được phản hồi. Vui lòng thử lại sau.' });
        }
        // P3.4: cảnh báo Telegram khi có báo cáo 👎 mới (opt-in; no-op nếu thiếu env).
        if (value.rating === 'down' && typeof sendTelegramAlert === 'function') {
            const catLabel = value.category ? ` [${value.category}]` : '';
            waitUntil(sendTelegramAlert(`👎 Báo cáo chatbot mới${catLabel}\nCâu hỏi: ${value.question || '(không kèm)'}\nMô tả: ${value.comment || '(không có)'}`));
        }
    } else {
        // Chưa cấu hình FIREBASE_DB_URL (thường là local dev) — không lưu được nhưng không phá UX.
        console.warn('[api/feedback] FIREBASE_DB_URL chưa cấu hình — bỏ qua việc lưu phản hồi.');
    }

    return res.status(200).json({ ok: true });
};

module.exports.validateFeedbackBody = validateFeedbackBody;
module.exports.buildFeedbackRecord = buildFeedbackRecord;
module.exports.sanitizeFeedbackSources = sanitizeFeedbackSources;
module.exports.getVnDateKey = getVnDateKey;
module.exports.VALID_CATEGORIES = VALID_CATEGORIES;
