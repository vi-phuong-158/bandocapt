(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.StaffApiClient = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const mutationPaths = new Set(['/api/staff/auth/google', '/api/staff/auth/logout', '/api/staff/requests', '/api/staff/verification']);
    const operationIds = new Map();

    class StaffApiError extends Error {
        constructor(code, status) {
            super(code || 'STAFF_REQUEST_FAILED');
            this.name = 'StaffApiError';
            this.code = code || 'STAFF_REQUEST_FAILED';
            this.status = status || 0;
        }
    }

    function stableValue(value) {
        if (Array.isArray(value)) return value.map(stableValue);
        if (value && typeof value === 'object') return Object.keys(value).sort().reduce((out, key) => {
            out[key] = stableValue(value[key]);
            return out;
        }, {});
        return value;
    }

    function payloadFingerprint(payload) {
        return JSON.stringify(stableValue(payload));
    }

    function operationIdFor(payload) {
        const fingerprint = payloadFingerprint(payload);
        if (!operationIds.has(fingerprint)) {
            const random = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
            operationIds.set(fingerprint, `op_${random.replace(/[^A-Za-z0-9_-]/g, '')}`.slice(0, 120));
        }
        return operationIds.get(fingerprint);
    }

    function clean(value) {
        return typeof value === 'string' ? value.trim() : value;
    }

    function optional(fields, name, value) {
        const cleaned = Array.isArray(value) ? value.filter(Boolean) : clean(value);
        if (cleaned !== undefined && cleaned !== null && cleaned !== '' && (!Array.isArray(cleaned) || cleaned.length)) fields[name] = cleaned;
    }

    function buildCreatePayload(form, unitCode) {
        const payload = { requestType: 'Thêm địa điểm mới', unitCode: clean(unitCode) };
        optional(payload, 'locationName', form.locationName);
        optional(payload, 'siteType', form.siteType);
        optional(payload, 'services', form.services);
        optional(payload, 'address', form.address);
        optional(payload, 'publicPhone', form.publicPhone);
        optional(payload, 'mapsUrl', form.mapsUrl);
        optional(payload, 'coordinates', form.coordinates);
        optional(payload, 'cccdServiceMode', form.cccdServiceMode);
        optional(payload, 'serviceSchedule', form.serviceSchedule);
        optional(payload, 'servedUnits', form.servedUnits);
        optional(payload, 'searchAliases', form.searchAliases);
        optional(payload, 'submitterName', form.submitterName);
        optional(payload, 'submitterPhone', form.submitterPhone);
        optional(payload, 'reviewNote', form.reviewNote);
        optional(payload, 'image', form.image);
        return withOperationId(payload);
    }

    function buildTargetPayload(form, requestType, record) {
        const payload = {
            requestType,
            targetRecordId: record.record_id,
            snapshotHash: record.snapshotHash,
        };
        optional(payload, 'locationName', form.locationName);
        optional(payload, 'siteType', form.siteType);
        optional(payload, 'services', form.services);
        optional(payload, 'address', form.address);
        optional(payload, 'publicPhone', form.publicPhone);
        optional(payload, 'mapsUrl', form.mapsUrl);
        optional(payload, 'coordinates', form.coordinates);
        optional(payload, 'cccdServiceMode', form.cccdServiceMode);
        optional(payload, 'serviceSchedule', form.serviceSchedule);
        optional(payload, 'servedUnits', form.servedUnits);
        optional(payload, 'searchAliases', form.searchAliases);
        optional(payload, 'reviewNote', form.reviewNote);
        optional(payload, 'image', form.image);
        return withOperationId(payload);
    }

    function buildStopPayload(note, record) {
        return withOperationId({
            requestType: 'Báo địa điểm ngừng hoạt động',
            targetRecordId: record.record_id,
            snapshotHash: record.snapshotHash,
            reviewNote: clean(note) || '',
        });
    }

    function buildVerificationPayload(note, record) {
        return withOperationId({
            recordId: record.record_id,
            snapshotHash: record.snapshotHash,
            eventType: 'CONFIRM',
            note: clean(note) || '',
        });
    }

    function withOperationId(payload) {
        return { operationId: operationIdFor(payload), ...payload };
    }

    async function request(path, options = {}, transport) {
        const method = options.method || 'GET';
        const headers = { Accept: 'application/json', ...(options.headers || {}) };
        if (mutationPaths.has(path) && options.csrfToken) headers['X-Staff-CSRF'] = options.csrfToken;
        if (options.body !== undefined) {
            headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(options.body);
        }
        let response;
        try {
            const fetcher = transport || (typeof globalThis !== 'undefined' ? globalThis.fetch : null);
            if (typeof fetcher !== 'function') throw new Error('FETCH_UNAVAILABLE');
            response = await fetcher(path, { ...options, method, headers, credentials: 'same-origin' });
        } catch (_) {
            throw new StaffApiError('STAFF_GATEWAY_UNAVAILABLE', 0);
        }
        let body = null;
        try { body = await response.json(); } catch (_) { /* map non-JSON response below */ }
        if (!response.ok || !body?.ok) throw new StaffApiError(body?.error?.code || 'STAFF_REQUEST_FAILED', response.status);
        return body.data || {};
    }

    function createClient(fetchImpl) {
        const call = (path, options) => request(path, options, fetchImpl);
        let csrfToken = '';
        return {
            async getCsrf() { const data = await call('/api/staff/auth/csrf'); csrfToken = data.csrfToken || ''; return data; },
            async getConfig() { return call('/api/staff/auth/config'); },
            async getSession() { return call('/api/staff/session'); },
            async signIn(credential) { return call('/api/staff/auth/google', { method: 'POST', csrfToken, body: { credential } }); },
            async logout() { const result = await call('/api/staff/auth/logout', { method: 'POST', csrfToken, body: {} }); csrfToken = ''; return result; },
            async getLocations() { return call('/api/staff/locations'); },
            async submitRequest(payload) { return call('/api/staff/requests', { method: 'POST', csrfToken, body: payload }); },
            async verify(payload) { return call('/api/staff/verification', { method: 'POST', csrfToken, body: payload }); },
            async refreshCsrf() { return this.getCsrf(); },
            get csrfToken() { return csrfToken; },
        };
    }

    return {
        StaffApiError,
        stableValue,
        payloadFingerprint,
        operationIdFor,
        buildCreatePayload,
        buildTargetPayload,
        buildStopPayload,
        buildVerificationPayload,
        request,
        createClient,
    };
});
