'use strict';

function resolveStaffAllowedOrigins(env = process.env) {
    const explicit = String(env.STAFF_ALLOWED_ORIGINS || '')
        .split(',').map(value => value.trim()).filter(Boolean);
    const derived = [env.VERCEL_PROJECT_PRODUCTION_URL, env.VERCEL_URL]
        .filter(Boolean).map(value => String(value).startsWith('http') ? String(value) : `https://${value}`);
    return new Set([...explicit, ...derived]);
}

function assertStaffOrigin(req, env = process.env) {
    const origin = String(req.headers.origin || '');
    if (!origin || !resolveStaffAllowedOrigins(env).has(origin)) {
        const error = new Error('STAFF_ORIGIN_REJECTED');
        error.code = 'STAFF_ORIGIN_REJECTED';
        throw error;
    }
    return origin;
}

module.exports = { resolveStaffAllowedOrigins, assertStaffOrigin };
