'use strict';

const crypto = require('node:crypto');
const {
    isAllowedOrigin,
    resolveClientIp,
    verifyRequestSignature,
} = require('../lib/request-security');
const { resolveMapsCoordinates } = require('../lib/staff-maps-resolver');
const { callGateway, DEFAULT_TIMEOUT_MS, MUTATION_TIMEOUT_MS, MUTATION_MAX_ATTEMPTS } = require('../lib/staff-gateway-client');
const { checkAndIncrement } = require('../lib/rate-limit-store');

const MAX_REQUEST_BYTES = 4.5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const DEFAULT_DAILY_IP_LIMIT = 10;
const DEFAULT_PUBLIC_TURNSTILE_SITE_KEY = '0x4AAAAAACxYIuZq7j7f9a7N';
const OPERATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/;
const TEXT_LIMITS = Object.freeze({
    operationId: 120, unitCode: 160, locationName: 200, address: 500, mapsUrl: 2000,
    publicPhone: 80, submitterName: 200, submitterPhone: 80, note: 2000,
});
const BODY_FIELDS = new Set([
    'operationId', 'requestType', 'unitCode', 'targetRecordId', 'locationName', 'address', 'mapsUrl',
    'publicPhone', 'submitterName', 'submitterPhone', 'note', 'image', 'captchaToken',
]);

function apiError(code, status = 400) {
    const error = new Error(code);
    error.code = code;
    error.status = status;
    return error;
}

function setNoStore(res) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
}

function isProtectedDeployment(env = process.env) {
    return env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production' || env.VERCEL_ENV === 'preview';
}

function getPositiveEnvInt(name, fallback, env = process.env) {
    const value = Number.parseInt(env[name], 10);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getQueryParam(req, name) {
    try {
        return new URL(String(req?.url || ''), 'http://localhost').searchParams.get(name) || '';
    } catch (_) {
        return '';
    }
}

function publicConfig(env = process.env) {
    const configuredSiteKey = String(env.TURNSTILE_SITE_KEY || '').trim();
    return {
        turnstileSiteKey: /^0x[A-Za-z0-9_-]{8,200}$/.test(configuredSiteKey)
            ? configuredSiteKey
            : DEFAULT_PUBLIC_TURNSTILE_SITE_KEY,
    };
}

function getVnDayWindow(now = new Date()) {
    const timestamp = now.getTime();
    const vn = new Date(timestamp + 7 * 60 * 60 * 1000);
    const dateKey = `${vn.getUTCFullYear()}_${String(vn.getUTCMonth() + 1).padStart(2, '0')}_${String(vn.getUTCDate()).padStart(2, '0')}`;
    const nextMidnight = Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate() + 1) - 7 * 60 * 60 * 1000;
    return {
        dateKey,
        windowSeconds: Math.max(1, Math.ceil((nextMidnight - timestamp) / 1000)),
        resetAt: new Date(nextMidnight).toISOString(),
    };
}

function hashForLog(value, env = process.env) {
    const salt = String(env.CHAT_LOG_HASH_SALT || 'local-dev-location-contribution-salt');
    return crypto.createHmac('sha256', salt).update(String(value || '')).digest('hex').slice(0, 32);
}

function deriveGatewayRequestId(operationId) {
    return crypto.createHash('sha256').update(`public-location-v1|${operationId}`, 'utf8').digest('hex');
}

function parseBody(body) {
    if (typeof body === 'string' || Buffer.isBuffer(body)) {
        try { return JSON.parse(body.toString()); } catch (_) { throw apiError('INVALID_BODY'); }
    }
    return body;
}

function normalizeText(value, field, required = false) {
    if (value === undefined || value === null) {
        if (required) throw apiError(`${field.toUpperCase()}_MISSING`);
        return '';
    }
    if (typeof value !== 'string') throw apiError('INVALID_DTO');
    const normalized = value.trim();
    if (normalized.length > TEXT_LIMITS[field]) throw apiError('INVALID_DTO');
    if (required && !normalized) throw apiError(`${field.toUpperCase()}_MISSING`);
    return normalized;
}

function validateImage(image) {
    if (!image || typeof image !== 'object' || Array.isArray(image)) throw apiError('IMAGE_REQUIRED');
    const unknown = Object.keys(image).filter(key => !['base64', 'mimeType', 'filename', 'size'].includes(key));
    if (unknown.length) throw apiError('INVALID_DTO');
    if (typeof image.base64 !== 'string' || !image.base64 || image.base64.length % 4 !== 0 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(image.base64) || /={1,2}[^=]/.test(image.base64)) {
        throw apiError('IMAGE_ENCODING_INVALID');
    }
    let bytes;
    try { bytes = Buffer.from(image.base64, 'base64'); } catch (_) { throw apiError('IMAGE_ENCODING_INVALID'); }
    if (!bytes.length || bytes.toString('base64') !== image.base64) throw apiError('IMAGE_ENCODING_INVALID');
    if (bytes.length > MAX_IMAGE_BYTES) throw apiError('IMAGE_TOO_LARGE');
    return { base64: image.base64, mimeType: typeof image.mimeType === 'string' ? image.mimeType.slice(0, 80) : '' };
}

function validateBody(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw apiError('INVALID_BODY');
    if (Object.keys(body).some(key => !BODY_FIELDS.has(key))) throw apiError('UNKNOWN_FIELD');
    const operationId = normalizeText(body.operationId, 'operationId', true);
    if (!OPERATION_ID_PATTERN.test(operationId)) throw apiError('OPERATION_ID_INVALID');
    const requestType = normalizeText(body.requestType, 'requestType', true);
    if (requestType !== 'Thêm địa điểm mới') throw apiError('PUBLIC_REQUEST_TYPE_NOT_ALLOWED');
    if (body.targetRecordId !== undefined && String(body.targetRecordId || '').trim()) throw apiError('CREATE_TARGET_RECORD_ID_NOT_ALLOWED');
    return {
        operationId,
        requestType,
        unitCode: normalizeText(body.unitCode, 'unitCode', true),
        locationName: normalizeText(body.locationName, 'locationName', true),
        address: normalizeText(body.address, 'address', true),
        mapsUrl: normalizeText(body.mapsUrl, 'mapsUrl', true),
        publicPhone: normalizeText(body.publicPhone, 'publicPhone'),
        submitterName: normalizeText(body.submitterName, 'submitterName'),
        submitterPhone: normalizeText(body.submitterPhone, 'submitterPhone'),
        note: normalizeText(body.note, 'note'),
        image: validateImage(body.image),
        captchaToken: typeof body.captchaToken === 'string' ? body.captchaToken.trim().slice(0, 4096) : '',
    };
}

function toSafeUnits(dataset) {
    const seen = new Set();
    const source = Array.isArray(dataset?.units) ? dataset.units : (dataset?.locations || []);
    return source
        .map(location => ({
            unitCode: String(location?.unitCode || location?.unit_code || '').trim(),
            label: String(location?.unitName || location?.unit_name || location?.name || '').trim(),
        }))
        .filter(unit => {
            const key = unit.unitCode.toLowerCase();
            if (!key || !unit.label || seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .sort((a, b) => a.label.localeCompare(b.label, 'vi'));
}

async function verifyTurnstile(token, clientIp, env = process.env, fetchImpl = fetch) {
    const isEvalBypass = !isProtectedDeployment(env) && env.EVAL_BYPASS_TOKEN && token === env.EVAL_BYPASS_TOKEN;
    if (isEvalBypass) return true;
    if (!token || !env.TURNSTILE_SECRET_KEY) return false;
    const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token });
    if (clientIp && clientIp !== 'unknown') body.set('remoteip', clientIp);
    try {
        const response = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
        });
        return Boolean(response.ok && (await response.json())?.success === true);
    } catch (_) { return false; }
}

async function reserveRateLimitQuota({ redisUrl, redisToken, dateKey, ipBucket, limit, windowSeconds, resetAt, fetchImpl = fetch, allowInMemoryFallback = false }) {
    const result = await checkAndIncrement({
        redisUrl,
        redisToken,
        namespace: 'bandocapt:public-location:v1',
        key: ipBucket,
        window: dateKey,
        limit,
        windowSeconds,
        resetAt,
        allowInMemoryFallback,
        fetchImpl,
    });
    return result.allowed
        ? { ok: true, ...result }
        : { ok: false, reason: result.reason, ...result };
}

function publicError(error) {
    const code = error?.code || error?.gatewayCode;
    if (code === 'PUBLIC_UNIT_NOT_ALLOWED') return apiError('UNIT_NOT_ALLOWED', 400);
    if (code === 'COORDINATE_INVALID_LINK' || code === 'COORDINATE_OUTSIDE_PHU_THO' || code === 'COORDINATE_NEEDS_REVIEW') return apiError(code, 400);
    if (code === 'IMAGE_REQUIRED' || code === 'IMAGE_ENCODING_INVALID' || code === 'IMAGE_TYPE_NOT_ALLOWED' || code === 'IMAGE_TOO_LARGE') return apiError(code, 400);
    if (code === 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD') return apiError(code, 409);
    if (code === 'STAFF_GATEWAY_UNAVAILABLE' || code === 'STAFF_GATEWAY_CONFIG_INVALID') return apiError('SERVICE_UNAVAILABLE', 503);
    return apiError('SERVICE_UNAVAILABLE', 503);
}

function contributionPayload(value, requestId, coordinates) {
    return {
        request_id: requestId,
        operation_id: value.operationId,
        request_type: value.requestType,
        unit_code: value.unitCode,
        location_name: value.locationName,
        address: value.address,
        public_phone: value.publicPhone,
        maps_url_original: value.mapsUrl,
        maps_url_resolved: value.mapsUrl,
        coordinates: `${coordinates.lat},${coordinates.lng}`,
        submitter_name: value.submitterName,
        submitter_phone: value.submitterPhone,
        review_note: value.note,
        image: value.image,
    };
}

async function handler(req, res) {
    const headers = req.headers || {};
    const origin = headers.origin;
    setNoStore(res);
    if (!origin || !isAllowedOrigin(origin, req)) return res.status(403).json({ error: 'FORBIDDEN' });
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Request-Token, X-Request-Time');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method === 'GET') {
        if (getQueryParam(req, 'config') === 'public') {
            return res.status(200).json({ ok: true, data: publicConfig() });
        }
        try {
            const units = await callGateway('listPublicContributionUnits', {}, {
                timeoutMs: DEFAULT_TIMEOUT_MS, maxAttempts: 1,
            });
            return res.status(200).json({ ok: true, data: { units: toSafeUnits(units) } });
        } catch (_) { return res.status(503).json({ error: 'SERVICE_UNAVAILABLE' }); }
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    const declaredLength = Number(headers['content-length']);
    const measuredLength = Number.isFinite(declaredLength) && declaredLength > 0
        ? declaredLength
        : Buffer.byteLength(typeof req.body === 'string' || Buffer.isBuffer(req.body) ? String(req.body) : JSON.stringify(req.body || {}));
    if (measuredLength > MAX_REQUEST_BYTES) return res.status(413).json({ error: 'REQUEST_TOO_LARGE' });

    let value;
    try { value = validateBody(parseBody(req.body)); } catch (error) { return res.status(error.status || 400).json({ error: error.code || 'INVALID_DTO' }); }
    const requestToken = headers['x-request-token'];
    const requestTime = headers['x-request-time'];
    if (!requestToken || !requestTime) return res.status(403).json({ error: 'MISSING_TOKEN' });
    if (!verifyRequestSignature({ token: requestToken, requestTime, userMessage: value.operationId, userAgent: headers['user-agent'] || '', origin })) {
        return res.status(403).json({ error: 'INVALID_TOKEN' });
    }
    const clientIp = resolveClientIp(req);
    if (!await verifyTurnstile(value.captchaToken, clientIp)) return res.status(403).json({ error: 'CAPTCHA_FAILED' });
    const env = process.env;
    const redisUrl = env.KV_REST_API_URL || '';
    const redisToken = env.KV_REST_API_TOKEN || '';
    if (isProtectedDeployment(env) && (!redisUrl || !redisToken || !String(env.CHAT_LOG_HASH_SALT || '').trim())) {
        return res.status(503).json({ error: 'SERVICE_UNAVAILABLE' });
    }
    const window = getVnDayWindow();
    const quota = await reserveRateLimitQuota({
        redisUrl, redisToken, dateKey: window.dateKey, windowSeconds: window.windowSeconds, resetAt: window.resetAt,
        ipBucket: hashForLog(`rate-limit:${clientIp}`), allowInMemoryFallback: !isProtectedDeployment(env),
        limit: getPositiveEnvInt('PUBLIC_LOCATION_DAILY_IP_LIMIT', DEFAULT_DAILY_IP_LIMIT),
    });
    if (!quota.ok) return res.status(quota.reason === 'limit_exceeded' ? 429 : 503).json({ error: quota.reason === 'limit_exceeded' ? 'RATE_LIMIT_EXCEEDED' : 'SERVICE_UNAVAILABLE' });
    try {
        const coordinates = await resolveMapsCoordinates(value.mapsUrl);
        const requestId = deriveGatewayRequestId(value.operationId);
        const result = await callGateway('submitPublicContribution', contributionPayload(value, requestId, coordinates), {
            env, requestId, timeoutMs: MUTATION_TIMEOUT_MS, maxAttempts: MUTATION_MAX_ATTEMPTS,
        });
        return res.status(200).json({ ok: true, data: { status: 'PENDING', receiptId: requestId.slice(0, 20), ...(result?.idempotent ? { idempotent: true } : {}) } });
    } catch (error) {
        const mapped = publicError(error);
        return res.status(mapped.status).json({ error: mapped.code });
    }
}

module.exports = handler;
module.exports.MAX_REQUEST_BYTES = MAX_REQUEST_BYTES;
module.exports.MAX_IMAGE_BYTES = MAX_IMAGE_BYTES;
module.exports.deriveGatewayRequestId = deriveGatewayRequestId;
module.exports.validateBody = validateBody;
module.exports.toSafeUnits = toSafeUnits;
module.exports.publicConfig = publicConfig;
module.exports.verifyTurnstile = verifyTurnstile;
module.exports.reserveRateLimitQuota = reserveRateLimitQuota;
module.exports.hashForLog = hashForLog;
module.exports.getVnDayWindow = getVnDayWindow;
