'use strict';

const crypto = require('node:crypto');

const SESSION_COOKIE_NAME = 'staff_session';
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const MIN_SESSION_SECRET_LENGTH = 32;

function sessionError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
}

function requireSessionSecret(secret) {
    const value = String(secret || '');
    if (value.length < MIN_SESSION_SECRET_LENGTH) throw sessionError('STAFF_SESSION_CONFIG_INVALID');
    return value;
}

function base64url(value) {
    return Buffer.from(value).toString('base64url');
}

function signPayload(payload, secret) {
    return crypto.createHmac('sha256', requireSessionSecret(secret)).update(payload).digest('base64url');
}

function safeEqual(left, right) {
    const a = Buffer.from(String(left || ''));
    const b = Buffer.from(String(right || ''));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createStaffSession({ sub, email, name = '', now = Date.now(), ttlSeconds = SESSION_TTL_SECONDS }, secret) {
    const sessionSecret = requireSessionSecret(secret);
    const normalizedSub = String(sub || '').trim();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedName = String(name || '').trim().slice(0, 200);
    if (!normalizedSub || !normalizedEmail || normalizedSub.length > 512 || normalizedEmail.length > 320) {
        throw sessionError('STAFF_SESSION_INVALID');
    }
    const iat = Math.floor(Number(now) / 1000);
    const exp = iat + Math.max(1, Number(ttlSeconds) || SESSION_TTL_SECONDS);
    const payload = base64url(JSON.stringify({ v: 1, sub: normalizedSub, email: normalizedEmail, name: normalizedName, iat, exp }));
    return `${payload}.${signPayload(payload, sessionSecret)}`;
}

function verifyStaffSession(token, secret, now = Date.now()) {
    const sessionSecret = requireSessionSecret(secret);
    const parts = String(token || '').split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) throw sessionError('STAFF_SESSION_INVALID');
    if (!safeEqual(parts[1], signPayload(parts[0], sessionSecret))) throw sessionError('STAFF_SESSION_INVALID');

    let payload;
    try { payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); } catch (_) {
        throw sessionError('STAFF_SESSION_INVALID');
    }
    const nowSeconds = Math.floor(Number(now) / 1000);
    if (payload?.v !== 1 || typeof payload.sub !== 'string' || !payload.sub ||
        typeof payload.email !== 'string' || !payload.email ||
        (payload.name !== undefined && typeof payload.name !== 'string') ||
        !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp) ||
        payload.exp <= nowSeconds || payload.iat > nowSeconds + 60) {
        throw sessionError('STAFF_SESSION_INVALID');
    }
    // `name` was added after the first sessions were issued; tolerate tokens signed before that so
    // an in-flight session does not get invalidated purely by this rollout.
    return Object.freeze({ v: 1, sub: payload.sub, email: payload.email.toLowerCase(), name: typeof payload.name === 'string' ? payload.name : '', iat: payload.iat, exp: payload.exp });
}

function serializeCookie(name, value, attributes) {
    return `${name}=${value}; ${attributes.join('; ')}`;
}

function serializeStaffSessionCookie(token) {
    return serializeCookie(SESSION_COOKIE_NAME, token, [
        'Path=/', 'HttpOnly', 'Secure', 'SameSite=Strict', `Max-Age=${SESSION_TTL_SECONDS}`,
    ]);
}

function clearStaffSessionCookie() {
    return serializeCookie(SESSION_COOKIE_NAME, '', ['Path=/', 'HttpOnly', 'Secure', 'SameSite=Strict', 'Max-Age=0']);
}

function parseCookies(header) {
    return String(header || '').split(';').reduce((result, part) => {
        const index = part.indexOf('=');
        if (index < 0) return result;
        result[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
        return result;
    }, {});
}

module.exports = {
    SESSION_COOKIE_NAME,
    SESSION_TTL_SECONDS,
    MIN_SESSION_SECRET_LENGTH,
    requireSessionSecret,
    createStaffSession,
    verifyStaffSession,
    serializeStaffSessionCookie,
    clearStaffSessionCookie,
    parseCookies,
};
