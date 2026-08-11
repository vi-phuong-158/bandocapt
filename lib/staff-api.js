'use strict';

const crypto = require('node:crypto');
const publishedLocations = require('./published-locations');
const { callGateway } = require('./staff-gateway-client');
const { verifyGoogleIdToken } = require('./staff-auth');
const {
    SESSION_COOKIE_NAME, createStaffSession, verifyStaffSession, serializeStaffSessionCookie,
    clearStaffSessionCookie, parseCookies, requireSessionSecret,
} = require('./staff-session');
const { createCsrfToken, serializeCsrfCookie, clearCsrfCookie, verifyCsrfRequest } = require('./staff-csrf');
const { assertStaffOrigin } = require('./staff-origin');
const { toPublicSnapshot, snapshotHash } = require('./staff-location-contract');
const { sendStaffData, sendStaffError } = require('./staff-api-errors');

const STAFF_API_MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const STAFF_API_MAX_REQUEST_BYTES = 4.5 * 1024 * 1024;
const OPERATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/;
const REQUEST_TYPES = new Set(['Thêm địa điểm mới', 'Cập nhật địa điểm đang có', 'Báo địa chỉ hoặc vị trí sai', 'Báo địa điểm ngừng hoạt động']);
const TARGET_REQUEST_TYPES = new Set(['Cập nhật địa điểm đang có', 'Báo địa chỉ hoặc vị trí sai', 'Báo địa điểm ngừng hoạt động']);

let injectedGoogleVerifier = null;

function staffError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
}

function setNoStore(res) {
    res.setHeader('Cache-Control', 'no-store');
}

function setCookie(res, value) {
    const current = res.getHeader('Set-Cookie');
    res.setHeader('Set-Cookie', current ? [...(Array.isArray(current) ? current : [current]), value] : [value]);
}

function parseRequestBody(req) {
    const length = Number(req.headers['content-length']);
    if (Number.isFinite(length) && length > STAFF_API_MAX_REQUEST_BYTES) throw staffError('STAFF_REQUEST_TOO_LARGE');
    if (!req.body) return {};
    if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
        try { return JSON.parse(req.body.toString()); } catch (_) { throw staffError('INVALID_BODY'); }
    }
    if (typeof req.body !== 'object' || Array.isArray(req.body)) throw staffError('INVALID_BODY');
    return req.body;
}

function requireOperationId(value) {
    const operationId = String(value || '').trim();
    if (!OPERATION_ID_PATTERN.test(operationId)) throw staffError('OPERATION_ID_INVALID');
    return operationId;
}

function deriveGatewayRequestId({ sub, action, operationId }) {
    return crypto.createHash('sha256').update(`staff-v1|${sub}|${action}|${operationId}`, 'utf8').digest('hex');
}

function validateStaffImage(image) {
    if (image == null || image === '') return null;
    if (!image || typeof image !== 'object' || typeof image.base64 !== 'string') throw staffError('IMAGE_ENCODING_INVALID');
    const encoded = image.base64;
    if (!encoded || encoded.length % 4 !== 0 || encoded.length > Math.ceil(STAFF_API_MAX_IMAGE_BYTES * 4 / 3) + 4 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || /={1,2}[^=]/.test(encoded)) throw staffError('IMAGE_ENCODING_INVALID');
    let bytes;
    try { bytes = Buffer.from(encoded, 'base64'); } catch (_) { throw staffError('IMAGE_ENCODING_INVALID'); }
    if (!bytes.length || bytes.toString('base64') !== encoded) throw staffError('IMAGE_ENCODING_INVALID');
    if (bytes.length > STAFF_API_MAX_IMAGE_BYTES) throw staffError('STAFF_IMAGE_TOO_LARGE');
    return image;
}

function getSession(req, env) {
    const cookies = parseCookies(req.headers.cookie);
    if (!cookies[SESSION_COOKIE_NAME]) throw staffError('STAFF_SESSION_INVALID');
    return verifyStaffSession(cookies[SESSION_COOKIE_NAME], env.STAFF_SESSION_SECRET);
}

async function resolveAuthorizedUnits(session, deps) {
    const result = await deps.gatewayCall('resolveUnits', { email: session.email }, { env: deps.env });
    const units = Array.isArray(result?.units) ? result.units.filter(unit => unit && unit.unitCode && unit.unitName) : [];
    if (!units.length) throw staffError('STAFF_ACCESS_REVOKED');
    return units.map(unit => ({ unitCode: String(unit.unitCode), unitName: String(unit.unitName) }));
}

function assertMutationTrust(req, env) {
    assertStaffOrigin(req, env);
    verifyCsrfRequest(req);
}

async function requireProtectedRequest(req, deps, { mutation = false } = {}) {
    if (mutation) assertMutationTrust(req, deps.env);
    const session = getSession(req, deps.env);
    const units = await resolveAuthorizedUnits(session, deps);
    return { session, units };
}

function findAuthorizedUnit(units, unitCode) {
    const normalized = String(unitCode || '').trim().toLowerCase();
    return units.find(unit => unit.unitCode.toLowerCase() === normalized) || null;
}

function currentRecord(locations, recordId) {
    return locations.find(location => String(location.id || location.recordId || '') === String(recordId || '')) || null;
}

function assertTargetOwner(record, units) {
    if (!record) throw staffError('TARGET_RECORD_ID_NOT_FOUND');
    if (!findAuthorizedUnit(units, record.unitCode)) throw staffError('TARGET_RECORD_UNIT_MISMATCH');
}

async function getCachedPublicLocations(deps) {
    return deps.getLocations({ env: deps.env });
}

async function getAuthoritativePublicLocations(deps) {
    try {
        return await deps.getLocations({ env: deps.env, forceRefresh: true, allowStale: false });
    } catch (_) {
        throw staffError('STAFF_PUBLIC_SOURCE_UNAVAILABLE');
    }
}

function buildRequestPayload(body, session, unit, requestId) {
    const fields = {
        request_id: requestId,
        operation_id: requestId,
        request_type: body.requestType,
        target_record_id: body.targetRecordId,
        email: session.email,
        unit_code: unit.unitCode,
        unit_name: unit.unitName,
        location_name: body.locationName,
        site_type: body.siteType,
        services: body.services,
        address: body.address,
        public_phone: body.publicPhone,
        maps_url_original: body.mapsUrl,
        coordinates: body.coordinates,
        cccd_service_mode: body.cccdServiceMode,
        service_schedule: body.serviceSchedule,
        served_units: body.servedUnits,
        search_aliases: body.searchAliases,
        submitter_name: body.submitterName,
        submitter_phone: body.submitterPhone,
        review_note: body.reviewNote,
        image: validateStaffImage(body.image),
    };
    return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined && value !== ''));
}

function mapGatewayBaselineError(error, hasCurrentTarget) {
    if (hasCurrentTarget && error?.gatewayCode === 'TARGET_RECORD_ID_NOT_FOUND') {
        return staffError('STAFF_OPERATIONAL_BASELINE_NOT_READY');
    }
    return error;
}

function createStaffApi(overrides = {}) {
    const deps = {
        env: overrides.env || process.env,
        now: overrides.now || (() => Date.now()),
        gatewayCall: overrides.gatewayCall || callGateway,
        getLocations: overrides.getLocations || publishedLocations.getPublishedLocations,
        verifyToken: overrides.verifyToken || ((credential, audience) => verifyGoogleIdToken({ credential, clientId: audience, verifier: injectedGoogleVerifier })),
    };

    async function csrf(req, res) {
        setNoStore(res);
        if (req.method !== 'GET') return res.status(405).json({ ok: false, error: { code: 'METHOD_NOT_ALLOWED' } });
        const token = createCsrfToken();
        setCookie(res, serializeCsrfCookie(token));
        return sendStaffData(res, { csrfToken: token });
    }

    async function google(req, res) {
        setNoStore(res);
        try {
            if (req.method !== 'POST') throw staffError('METHOD_NOT_ALLOWED');
            assertMutationTrust(req, deps.env);
            const body = parseRequestBody(req);
            const credential = typeof body.credential === 'string' ? body.credential : '';
            if (!credential || Object.keys(body).some(key => !['credential'].includes(key))) throw staffError('GOOGLE_TOKEN_INVALID');
            requireSessionSecret(deps.env.STAFF_SESSION_SECRET);
            if (!deps.env.GOOGLE_CLIENT_ID) throw staffError('STAFF_AUTH_CONFIG_INVALID');
            const identity = await deps.verifyToken(credential, deps.env.GOOGLE_CLIENT_ID);
            const units = await resolveAuthorizedUnits(identity, deps).catch(error => {
                if (error.code === 'STAFF_ACCESS_REVOKED') return [];
                throw error;
            });
            if (!units.length) throw staffError('STAFF_NOT_AUTHORIZED');
            const token = createStaffSession({ sub: identity.sub, email: identity.email, now: deps.now() }, deps.env.STAFF_SESSION_SECRET);
            setCookie(res, serializeStaffSessionCookie(token));
            return sendStaffData(res, { user: { email: identity.email }, units });
        } catch (error) { return sendStaffError(res, error); }
    }

    async function logout(req, res) {
        setNoStore(res);
        try {
            if (req.method !== 'POST') throw staffError('METHOD_NOT_ALLOWED');
            assertMutationTrust(req, deps.env);
            setCookie(res, clearStaffSessionCookie());
            setCookie(res, clearCsrfCookie());
            return sendStaffData(res, {});
        } catch (error) { return sendStaffError(res, error); }
    }

    async function session(req, res) {
        setNoStore(res);
        try {
            if (req.method !== 'GET') throw staffError('METHOD_NOT_ALLOWED');
            const { session: current, units } = await requireProtectedRequest(req, deps);
            return sendStaffData(res, { user: { email: current.email }, units });
        } catch (error) {
            if (error.code === 'STAFF_ACCESS_REVOKED') setCookie(res, clearStaffSessionCookie());
            return sendStaffError(res, error);
        }
    }

    async function locations(req, res) {
        setNoStore(res);
        try {
            if (req.method !== 'GET') throw staffError('METHOD_NOT_ALLOWED');
            const { units } = await requireProtectedRequest(req, deps);
            const allowed = new Set(units.map(unit => unit.unitCode.toLowerCase()));
            const data = await getCachedPublicLocations(deps);
            const locations = (data.locations || []).filter(location => allowed.has(String(location.unitCode || '').toLowerCase()))
                .map(location => {
                    const record = toPublicSnapshot(location);
                    return { record, snapshotHash: snapshotHash(record) };
                });
            return sendStaffData(res, { locations });
        } catch (error) {
            if (error.code === 'STAFF_ACCESS_REVOKED') setCookie(res, clearStaffSessionCookie());
            return sendStaffError(res, error);
        }
    }

    async function verification(req, res) {
        setNoStore(res);
        try {
            if (req.method !== 'POST') throw staffError('METHOD_NOT_ALLOWED');
            const { session: current, units } = await requireProtectedRequest(req, deps, { mutation: true });
            const body = parseRequestBody(req);
            const operationId = requireOperationId(body.operationId);
            if (body.eventType !== 'CONFIRM') throw staffError('EVENT_TYPE_NOT_ALLOWED');
            const recordId = String(body.recordId || '').trim();
            const submittedHash = String(body.snapshotHash || '').trim().toLowerCase();
            if (!recordId || !/^[A-Za-z0-9_-]{1,160}$/.test(recordId)) throw staffError('TARGET_RECORD_ID_INVALID');
            if (!/^[0-9a-f]{64}$/.test(submittedHash)) throw staffError('SNAPSHOT_HASH_INVALID');
            const data = await getAuthoritativePublicLocations(deps);
            const location = currentRecord(data.locations || [], recordId);
            assertTargetOwner(location, units);
            const record = toPublicSnapshot(location);
            const currentHash = snapshotHash(record);
            if (currentHash !== submittedHash) throw staffError('STALE_PUBLIC_SNAPSHOT');
            const requestId = deriveGatewayRequestId({ sub: current.sub, action: 'writeVerificationEvent', operationId });
            const result = await deps.gatewayCall('writeVerificationEvent', {
                request_id: requestId, operation_id: operationId, email: current.email,
                unit_code: location.unitCode, event_type: 'CONFIRM', snapshot: record,
                snapshot_hash: currentHash, note: typeof body.note === 'string' ? body.note.slice(0, 2000) : '',
            }, { env: deps.env, requestId });
            return sendStaffData(res, result);
        } catch (error) {
            if (error.code === 'STAFF_ACCESS_REVOKED') setCookie(res, clearStaffSessionCookie());
            return sendStaffError(res, error);
        }
    }

    async function requests(req, res) {
        setNoStore(res);
        try {
            if (req.method !== 'POST') throw staffError('METHOD_NOT_ALLOWED');
            const { session: current, units } = await requireProtectedRequest(req, deps, { mutation: true });
            const body = parseRequestBody(req);
            const requestType = String(body.requestType || '').trim();
            if (!REQUEST_TYPES.has(requestType)) throw staffError('REQUEST_TYPE_INVALID');
            const operationId = requireOperationId(body.operationId);
            const targetId = String(body.targetRecordId || '').trim();
            const submittedHash = String(body.snapshotHash || '').trim().toLowerCase();
            if (requestType === 'Thêm địa điểm mới' && targetId) throw staffError('CREATE_TARGET_RECORD_ID_NOT_ALLOWED');
            if (requestType === 'Thêm địa điểm mới' && submittedHash) throw staffError('CREATE_SNAPSHOT_HASH_NOT_ALLOWED');
            if (TARGET_REQUEST_TYPES.has(requestType) && (!targetId || !/^[A-Za-z0-9_-]{1,160}$/.test(targetId))) throw staffError('TARGET_RECORD_ID_REQUIRED');
            if (TARGET_REQUEST_TYPES.has(requestType) && !/^[0-9a-f]{64}$/.test(submittedHash)) throw staffError('SNAPSHOT_HASH_REQUIRED');

            let currentTarget = null;
            if (TARGET_REQUEST_TYPES.has(requestType)) {
                const data = await getAuthoritativePublicLocations(deps);
                currentTarget = currentRecord(data.locations || [], targetId);
                assertTargetOwner(currentTarget, units);
                if (snapshotHash(toPublicSnapshot(currentTarget)) !== submittedHash) throw staffError('STALE_PUBLIC_SNAPSHOT');
            }
            const unit = currentTarget
                ? findAuthorizedUnit(units, currentTarget.unitCode)
                : findAuthorizedUnit(units, body.unitCode);
            if (!unit) throw staffError('EMAIL_NOT_AUTHORIZED_FOR_UNIT');
            const action = 'submitRequest';
            const requestId = deriveGatewayRequestId({ sub: current.sub, action, operationId });
            const payload = buildRequestPayload(body, current, unit, requestId);
            try {
                return sendStaffData(res, await deps.gatewayCall(action, payload, { env: deps.env, requestId }));
            } catch (error) { throw mapGatewayBaselineError(error, Boolean(currentTarget)); }
        } catch (error) {
            if (error.code === 'STAFF_ACCESS_REVOKED') setCookie(res, clearStaffSessionCookie());
            return sendStaffError(res, error);
        }
    }

    return { csrf, google, logout, session, locations, requests, verification };
}

function setGoogleVerifierForTests(verifier) { injectedGoogleVerifier = verifier; }

module.exports = {
    STAFF_API_MAX_IMAGE_BYTES,
    STAFF_API_MAX_REQUEST_BYTES,
    OPERATION_ID_PATTERN,
    deriveGatewayRequestId,
    validateStaffImage,
    parseRequestBody,
    createStaffApi,
    setGoogleVerifierForTests,
};
