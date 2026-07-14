'use strict';

const crypto = require('crypto');

const ALLOWED_ORIGINS = [
    'https://bandocapt.vercel.app',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
];

function getAllowedOrigins() {
    const configuredOrigins = (process.env.ALLOWED_ORIGINS || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);

    return new Set([...ALLOWED_ORIGINS, ...configuredOrigins]);
}

function isAllowedOrigin(origin, req) {
    if (getAllowedOrigins().has(origin)) return true;
    if (!process.env.VERCEL) return false;

    try {
        const originUrl = new URL(origin);
        const requestHost = req.headers['x-forwarded-host'] || req.headers.host;
        return Boolean(requestHost) && originUrl.host === requestHost;
    } catch (_) {
        return false;
    }
}

function resolveClientIp(req) {
    return (
        req.headers['x-vercel-forwarded-for']?.split(',')[0].trim() ||
        req.headers['x-real-ip']?.split(',')[0].trim() ||
        req.headers['x-forwarded-for']?.split(',')[0].trim() ||
        req.socket?.remoteAddress ||
        'unknown'
    );
}

function sha256Hex(value) {
    return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function verifyRequestSignature({ token, requestTime, userMessage, userAgent, origin }) {
    if (!token || !requestTime) return false;
    if (!/^[0-9a-f]{64}$/.test(token)) return false;

    const timestamp = Number.parseInt(requestTime, 10);
    if (!Number.isFinite(timestamp)) return false;

    const originHost = (() => {
        try {
            return new URL(origin || 'http://localhost').hostname;
        } catch (_) {
            return 'localhost';
        }
    })();

    if (Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) return false;

    const messageDigest = sha256Hex(userMessage).substring(0, 32);
    const signData = `${requestTime}:${originHost}:${userAgent.length}:${messageDigest}`;
    const keyMaterial = `xnc-phu-tho:${originHost}:${userAgent.substring(0, 16)}`;
    const expectedSig = crypto.createHmac('sha256', keyMaterial).update(signData).digest('hex');
    const expectedBuffer = Buffer.from(expectedSig, 'utf8');
    const tokenBuffer = Buffer.from(token, 'utf8');

    return expectedBuffer.length === tokenBuffer.length &&
        crypto.timingSafeEqual(expectedBuffer, tokenBuffer);
}

function sanitizeDiagnosticText(value, maxLength = 4000, { redactEmail = true } = {}) {
    let text = String(value || '');

    if (redactEmail) {
        text = text.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted:email]');
    }
    text = text.replace(/\b(Bearer)\s+[A-Za-z0-9._\-+/=]{8,}\b/gi, '$1 [redacted:token]');
    text = text.replace(/\b((?:access|refresh|id|request|auth)[_-]?token|api[_-]?key|client[_-]?secret|secret|password|pwd|private[_-]?key|x-request-token)\b\s*[:=]\s*["']?[^\s"',;]{6,}["']?/gi, '$1=[redacted:secret]');
    text = text.replace(/((?:số hộ chiếu|so ho chieu|passport(?:\s*(?:number|no|#))?))\s*[:#-]?\s*([A-Z0-9]{6,12})/gi, '$1: [redacted:passport]');
    text = text.replace(/\b[A-Z]{1,2}[0-9]{6,8}\b/g, '[redacted:passport]');

    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

async function sendTelegramAlert(text, fetchImpl = fetch, timeoutMs = 8000) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new Error('TELEGRAM_ALERT_TIMEOUT')), timeoutMs);
    try {
        await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: String(text || '').substring(0, 3500),
                disable_web_page_preview: true
            }),
            signal: controller.signal
        });
    } catch (error) {
        console.warn('[P3.4] Telegram alert error (non-blocking):', error.message);
    } finally {
        clearTimeout(timeoutId);
    }
}

module.exports = {
    isAllowedOrigin,
    resolveClientIp,
    sanitizeDiagnosticText,
    sendTelegramAlert,
    verifyRequestSignature,
};
