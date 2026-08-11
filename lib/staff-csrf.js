'use strict';

const crypto = require('node:crypto');
const { parseCookies } = require('./staff-session');

const CSRF_COOKIE_NAME = 'staff_csrf';

function safeEqual(left, right) {
    const a = Buffer.from(String(left || ''));
    const b = Buffer.from(String(right || ''));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createCsrfToken() {
    return crypto.randomBytes(32).toString('hex');
}

function serializeCsrfCookie(token) {
    return `${CSRF_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Secure; SameSite=Strict`;
}

function clearCsrfCookie() {
    return `${CSRF_COOKIE_NAME}=; Path=/; Secure; SameSite=Strict; Max-Age=0`;
}

function verifyCsrfRequest(req) {
    const cookies = parseCookies(req.headers.cookie);
    const header = req.headers['x-staff-csrf'];
    if (!cookies[CSRF_COOKIE_NAME] || !header) {
        const error = new Error('CSRF_TOKEN_MISSING');
        error.code = 'CSRF_TOKEN_MISSING';
        throw error;
    }
    if (!safeEqual(cookies[CSRF_COOKIE_NAME], header)) {
        const error = new Error('CSRF_TOKEN_INVALID');
        error.code = 'CSRF_TOKEN_INVALID';
        throw error;
    }
    return true;
}

module.exports = { CSRF_COOKIE_NAME, createCsrfToken, serializeCsrfCookie, clearCsrfCookie, verifyCsrfRequest };
