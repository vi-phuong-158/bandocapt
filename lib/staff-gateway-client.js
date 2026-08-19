'use strict';

const crypto = require('node:crypto');

const DEFAULT_TIMEOUT_MS = 8000;
const MAX_ATTEMPTS = 2;
// submitRequest/writeVerificationEvent hold a project-wide Apps Script Script Lock for the whole
// operation (Sheets reads/writes plus, for submitRequest, Drive image persist). Observed production
// duration for an image-bearing submitRequest was 26.633s, then a second incident hit 39.402s — a
// prior 40000ms value left almost no margin and still produced a false 503 on the browser's first
// submit even though the Gateway went on to complete. A caller-side automatic retry would also fire a
// second HTTP attempt while the first is still holding the lock, forcing the retry to queue behind it
// instead of doing useful work. One bounded long attempt avoids that pile-up; manual user retry stays
// safe via the Gateway's own request-id/body-hash idempotency ledger.
const MUTATION_TIMEOUT_MS = 50000;
const MUTATION_MAX_ATTEMPTS = 1;
const SAFE_REMOTE_CODES = new Set([
    'EMAIL_NOT_AUTHORIZED_FOR_UNIT', 'CREATE_TARGET_RECORD_ID_NOT_ALLOWED', 'TARGET_RECORD_ID_NOT_FOUND',
    'TARGET_RECORD_UNIT_MISMATCH', 'IMAGE_ENCODING_INVALID', 'IMAGE_TYPE_NOT_ALLOWED', 'IMAGE_TOO_LARGE',
    'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD', 'TARGET_RECORD_ID_REQUIRED', 'UNIT_CODE_REQUIRED',
    'IMAGE_REQUIRED', 'SERVICES_MISSING', 'ADDRESS_MISSING', 'LOCATION_NAME_MISSING',
    'COORDINATE_NEEDS_REVIEW', 'COORDINATE_INVALID_LINK', 'COORDINATE_OUTSIDE_PHU_THO',
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
    const maxAttempts = Number(options.maxAttempts) > 0 ? Number(options.maxAttempts) : MAX_ATTEMPTS;
    let lastError;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
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
            if (!isTransportError(lastError) || attempt + 1 >= maxAttempts) throw lastError;
        } finally {
            clearTimeout(timeout);
        }
    }
    throw lastError || gatewayClientError('STAFF_GATEWAY_UNAVAILABLE');
}

module.exports = {
    DEFAULT_TIMEOUT_MS, MAX_ATTEMPTS, MUTATION_TIMEOUT_MS, MUTATION_MAX_ATTEMPTS,
    requireGatewayConfig, signGatewayBody, callGateway, safeGatewayError,
};
