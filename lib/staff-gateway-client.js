'use strict';

const crypto = require('node:crypto');

const DEFAULT_TIMEOUT_MS = 8000;
const MAX_ATTEMPTS = 2;
const SAFE_REMOTE_CODES = new Set([
    'EMAIL_NOT_AUTHORIZED_FOR_UNIT', 'CREATE_TARGET_RECORD_ID_NOT_ALLOWED', 'TARGET_RECORD_ID_NOT_FOUND',
    'TARGET_RECORD_UNIT_MISMATCH', 'IMAGE_ENCODING_INVALID', 'IMAGE_TYPE_NOT_ALLOWED', 'IMAGE_TOO_LARGE',
    'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD', 'TARGET_RECORD_ID_REQUIRED', 'UNIT_CODE_REQUIRED',
    'SUBMITTER_EMAIL_MISSING', 'EVENT_TYPE_NOT_ALLOWED', 'SNAPSHOT_REQUIRED', 'SNAPSHOT_UNKNOWN_FIELD',
    'SNAPSHOT_HASH_REQUIRED', 'SNAPSHOT_HASH_MISMATCH', 'OPERATION_ID_REQUIRED', 'REQUEST_ID_REQUIRED',
]);

function gatewayClientError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
}

function requireGatewayConfig(env = process.env) {
    const url = String(env.STAFF_GATEWAY_URL || '').trim().replace(/\/+$/, '');
    const secret = String(env.LOCATION_GATEWAY_SECRET || '');
    if (!url || !/\/exec$/i.test(url) || !secret) throw gatewayClientError('STAFF_GATEWAY_CONFIG_INVALID');
    return { url, secret };
}

function signGatewayBody(rawBody, timestamp, secret) {
    return crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');
}

function safeGatewayError(code) {
    return SAFE_REMOTE_CODES.has(code) ? code : 'STAFF_GATEWAY_REJECTED';
}

function isTransportError(error) {
    return error?.code === 'STAFF_GATEWAY_UNAVAILABLE';
}

function normalizeTransportError(error) {
    return error?.code && (String(error.code).startsWith('STAFF_GATEWAY_') || SAFE_REMOTE_CODES.has(error.code))
        ? error
        : gatewayClientError('STAFF_GATEWAY_UNAVAILABLE');
}

async function callGateway(action, payload, options = {}) {
    const env = options.env || process.env;
    const { url, secret } = requireGatewayConfig(env);
    const requestId = String(options.requestId || payload?.request_id || payload?.operation_id || '');
    const rawBody = JSON.stringify({ action, request_id: requestId, payload: payload || {} });
    const fetchImpl = options.fetchImpl || fetch;
    const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_TIMEOUT_MS;
    let lastError;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        const timestamp = Date.now();
        const signature = signGatewayBody(rawBody, timestamp, secret);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const endpoint = new URL(url);
            endpoint.searchParams.set('timestamp', String(timestamp));
            endpoint.searchParams.set('signature', signature);
            const response = await fetchImpl(endpoint.toString(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: rawBody,
                signal: controller.signal,
            });
            let envelope;
            try { envelope = await response.json(); } catch (_) { throw gatewayClientError('STAFF_GATEWAY_INVALID_RESPONSE'); }
            if (!envelope || typeof envelope !== 'object' || typeof envelope.ok !== 'boolean') {
                throw gatewayClientError('STAFF_GATEWAY_INVALID_RESPONSE');
            }
            if (!envelope.ok) {
                const error = gatewayClientError(safeGatewayError(String(envelope.error?.code || '')));
                error.gatewayCode = String(envelope.error?.code || '');
                throw error;
            }
            if (!response.ok) throw gatewayClientError('STAFF_GATEWAY_INVALID_RESPONSE');
            return envelope.data || {};
        } catch (error) {
            lastError = normalizeTransportError(error);
            if (!isTransportError(lastError) || attempt + 1 >= MAX_ATTEMPTS) throw lastError;
        } finally {
            clearTimeout(timeout);
        }
    }
    throw lastError || gatewayClientError('STAFF_GATEWAY_UNAVAILABLE');
}

module.exports = { DEFAULT_TIMEOUT_MS, requireGatewayConfig, signGatewayBody, callGateway, safeGatewayError };
