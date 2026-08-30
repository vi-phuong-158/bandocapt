(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(
        require('../lib/staff-location-contract'), require('./apps-script'), require('../lib/location-workbooks')
    );
    else if (root) root.StaffLocationGateway = factory(root.StaffLocationContract, root.LocationApprovalPipeline, root.LocationWorkbookConfig);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (staffLocationContract, defaultPipeline, defaultWorkbookConfig) {
    'use strict';

    const ACTIONS = Object.freeze(['resolveUnits', 'listPublicContributionUnits', 'listStaffRequestStatuses', 'submitRequest', 'submitPublicContribution', 'writeVerificationEvent']);
    const STATE = Object.freeze({ CLAIMED: 'CLAIMED', UPLOAD_PERSISTED: 'UPLOAD_PERSISTED', COMPLETED: 'COMPLETED', FAILED: 'FAILED' });
    const PRIVATE_SHEETS = Object.freeze({
        allowlist: 'Unit_Allowlist', staging: 'Location_Staging', audit: 'Approval_Audit_Log',
        verificationAudit: 'Staff_Verification_Audit', ledger: 'Idempotency_Ledger', operationalBaseline: 'Operational_Baseline',
    });
    const ALLOWED_IMAGE_TYPES = Object.freeze({ jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' });
    const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
    const FRESHNESS_WINDOW_MS = 5 * 60 * 1000;
    if (!staffLocationContract) throw gatewayError('GATEWAY_RUNTIME_NOT_CONFIGURED');
    const { SNAPSHOT_FIELDS, stableStringify } = staffLocationContract;
    const VERIFICATION_EVENTS = Object.freeze(['CONFIRM']);
    const PUBLIC_SYSTEM_PRINCIPAL = 'public-web@bandocapt.invalid';
    const PUBLIC_ALLOWED_FIELDS = Object.freeze([
        'request_id', 'operation_id', 'request_type', 'target_record_id', 'unit_code', 'location_name',
        'site_type', 'services', 'address', 'public_phone', 'maps_url_original', 'maps_url_resolved',
        'coordinates', 'submitter_name', 'submitter_phone', 'review_note', 'image',
    ]);

    function gatewayError(code, details = {}) {
        const error = new Error(code);
        error.code = code;
        Object.assign(error, details);
        return error;
    }

    function text(value) { return String(value == null ? '' : value).trim(); }

    function bytesToHex(bytes) {
        return Array.from(bytes || [], value => (Number(value) & 0xff).toString(16).padStart(2, '0')).join('');
    }

    function normalizeHex(value) {
        const normalized = text(value).toLowerCase();
        return /^[0-9a-f]{64}$/.test(normalized) ? normalized : '';
    }

    function constantTimeEqual(left, right) {
        const a = text(left).toLowerCase();
        const b = text(right).toLowerCase();
        let diff = a.length ^ b.length;
        const size = Math.max(a.length, b.length);
        for (let index = 0; index < size; index += 1) {
            diff |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
        }
        return diff === 0;
    }

    function strictBase64(value) {
        const encoded = text(value);
        if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || /={1,2}[^=]/.test(encoded)) {
            throw gatewayError('IMAGE_ENCODING_INVALID');
        }
        return encoded;
    }

    function detectImageType(bytes) {
        const input = Array.from(bytes || [], value => Number(value) & 0xff);
        if (input.length >= 3 && input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff) return ALLOWED_IMAGE_TYPES.jpeg;
        if (input.length >= 8 && input.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10') return ALLOWED_IMAGE_TYPES.png;
        if (input.length >= 12 && input.slice(0, 4).every((value, index) => value === [0x52, 0x49, 0x46, 0x46][index]) &&
            input.slice(8, 12).every((value, index) => value === [0x57, 0x45, 0x42, 0x50][index])) return ALLOWED_IMAGE_TYPES.webp;
        return '';
    }

    function validateImageBase64(input, runtime = {}) {
        const image = input && typeof input === 'object' ? input : null;
        if (!image || !text(image.base64)) return { ok: false, error: 'IMAGE_REQUIRED' };
        const encoded = strictBase64(image.base64);
        if (encoded.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 4) return { ok: false, error: 'IMAGE_TOO_LARGE' };
        let bytes;
        try {
            bytes = runtime.decodeBase64 ? runtime.decodeBase64(encoded) : (typeof Buffer !== 'undefined' ? Buffer.from(encoded, 'base64') : []);
        } catch (_) {
            return { ok: false, error: 'IMAGE_ENCODING_INVALID' };
        }
        if (!bytes || !bytes.length) return { ok: false, error: 'IMAGE_ENCODING_INVALID' };
        if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, error: 'IMAGE_TOO_LARGE' };
        const mimeType = detectImageType(bytes);
        if (!mimeType) return { ok: false, error: 'IMAGE_TYPE_NOT_ALLOWED' };
        return { ok: true, bytes, mimeType, size: bytes.length };
    }

    function sha256Hex(value, runtime = {}) {
        if (runtime.sha256Hex) return normalizeHex(runtime.sha256Hex(value));
        if (typeof require === 'function') {
            const crypto = require('node:crypto');
            return crypto.createHash('sha256').update(value).digest('hex');
        }
        throw gatewayError('CRYPTO_RUNTIME_UNAVAILABLE');
    }

    function hmacSha256Hex(message, secret, runtime = {}) {
        if (runtime.hmacSha256Hex) return normalizeHex(runtime.hmacSha256Hex(message, secret));
        if (typeof require === 'function') {
            const crypto = require('node:crypto');
            return crypto.createHmac('sha256', secret).update(message).digest('hex');
        }
        throw gatewayError('CRYPTO_RUNTIME_UNAVAILABLE');
    }

    function validateTimestamp(timestamp, now = Date.now()) {
        const value = text(timestamp);
        if (!/^\d{10,}$/.test(value)) throw gatewayError('REQUEST_TIMESTAMP_INVALID');
        const parsed = Number(value);
        if (!Number.isSafeInteger(parsed)) throw gatewayError('REQUEST_TIMESTAMP_INVALID');
        const delta = parsed - Number(now);
        if (delta < -FRESHNESS_WINDOW_MS) throw gatewayError('REQUEST_TIMESTAMP_STALE');
        if (delta > FRESHNESS_WINDOW_MS) throw gatewayError('REQUEST_TIMESTAMP_FUTURE');
        return parsed;
    }

    function verifyRawRequest(rawBody, metadata = {}, options = {}) {
        const body = typeof rawBody === 'string' ? rawBody : '';
        const secret = text(options.secret || (options.getSecret && options.getSecret()));
        if (!secret) throw gatewayError('GATEWAY_SECRET_MISSING');
        const timestamp = validateTimestamp(metadata.timestamp, options.now || Date.now());
        const supplied = normalizeHex(metadata.signature);
        if (!supplied) throw gatewayError('REQUEST_SIGNATURE_INVALID');
        const expected = hmacSha256Hex(`${timestamp}.${body}`, secret, options);
        if (!expected || !constantTimeEqual(expected, supplied)) throw gatewayError('REQUEST_SIGNATURE_INVALID');
        return { rawBody: body, timestamp };
    }

    function privateSheet(name) {
        return Object.values(PRIVATE_SHEETS).includes(name);
    }

    function requireRequestId(payload, action) {
        const requestId = text(payload.request_id || payload.operation_id);
        if (!requestId) throw gatewayError(action === 'writeVerificationEvent' ? 'OPERATION_ID_REQUIRED' : 'REQUEST_ID_REQUIRED');
        if (requestId.length > 160) throw gatewayError('REQUEST_ID_INVALID');
        return requestId;
    }

    function resultFromLedger(ledger) {
        try { return ledger && ledger.result_json ? JSON.parse(ledger.result_json) : null; } catch (_) { return null; }
    }

    function nowIso(runtime) { return new Date((runtime.now || (() => Date.now()))()).toISOString(); }

    function createStaffGateway(options = {}) {
        const pipeline = options.pipeline || defaultPipeline;
        const workbookConfig = options.workbookConfig || defaultWorkbookConfig;
        const store = options.store || {};
        const runtime = options.runtime || {};
        if (!pipeline || !workbookConfig) throw gatewayError('GATEWAY_RUNTIME_NOT_CONFIGURED');

        function withLock(callback) {
            if (runtime.withLock) return runtime.withLock(callback);
            return callback();
        }

        function resolvePrivateConfig() {
            const env = runtime.env || {};
            return workbookConfig.resolvePrivateLocationWorkbook({
                PRIVATE_LOCATION_SPREADSHEET_ID: env.PRIVATE_LOCATION_SPREADSHEET_ID,
                PUBLIC_LOCATION_SPREADSHEET_ID: env.PUBLIC_LOCATION_SPREADSHEET_ID,
                GOOGLE_SHEET_ID: env.GOOGLE_SHEET_ID,
            });
        }

        function rows(sheet) {
            if (!privateSheet(sheet)) throw gatewayError('PRIVATE_SHEET_NOT_ALLOWED');
            if (!store.getRows) throw gatewayError('PRIVATE_STORE_UNAVAILABLE');
            return store.getRows(sheet) || [];
        }

        function updateLedger(requestId, patch) {
            if (!store.updateLedger) throw gatewayError('IDEMPOTENCY_LEDGER_UNAVAILABLE');
            return store.updateLedger(requestId, patch);
        }

        function ledgerFor(requestId) {
            if (!store.findLedger) throw gatewayError('IDEMPOTENCY_LEDGER_UNAVAILABLE');
            return store.findLedger(requestId);
        }

        function ledgerClaim(action, requestId, bodyHash, createdAt) {
            const existing = ledgerFor(requestId);
            if (existing && text(existing.body_hash) !== bodyHash) throw gatewayError('IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD');
            if (!existing) {
                if (!store.createLedger) throw gatewayError('IDEMPOTENCY_LEDGER_UNAVAILABLE');
                store.createLedger({
                    request_id: requestId, action, body_hash: bodyHash, state: STATE.CLAIMED,
                    image_resource_key: '', image_file_id: '', result_json: '', last_error: '',
                    created_at: createdAt, updated_at: createdAt,
                });
            } else {
                updateLedger(requestId, { action, state: STATE.CLAIMED, last_error: '', updated_at: createdAt });
            }
            return existing;
        }

        function authorize(payload, allowlistRows) {
            const email = pipeline.normalizeEmail(payload.email || payload.submitter_email);
            const unitCode = text(payload.unit_code || payload.unitCode);
            if (!email) throw gatewayError('SUBMITTER_EMAIL_MISSING');
            if (!unitCode) throw gatewayError('UNIT_CODE_REQUIRED');
            const units = pipeline.resolveUnitsByEmail(email, allowlistRows);
            const unit = units.find(item => text(item.unitCode).toLowerCase() === unitCode.toLowerCase());
            if (!unit) throw gatewayError('EMAIL_NOT_AUTHORIZED_FOR_UNIT');
            return { email, unit };
        }

        function imageResourceKey(requestId, imageHash, prefix = 'staff-request') { return `${prefix}-${requestId}-${imageHash.slice(0, 24)}`; }

        function persistImage(payload, requestId, existingLedger, resourcePrefix = 'staff-request') {
            if (!payload.image) return { pointer: null, validation: null };
            const validation = validateImageBase64(payload.image, runtime);
            if (!validation.ok) throw gatewayError(validation.error);
            const imageHash = sha256Hex(validation.bytes, runtime);
            const resourceKey = imageResourceKey(requestId, imageHash, resourcePrefix);
            let file = existingLedger && text(existingLedger.image_file_id)
                ? { fileId: text(existingLedger.image_file_id), driveUrl: text(existingLedger.image_drive_url), mimeType: text(existingLedger.image_mime_type) }
                : null;
            if (!file && store.findDriveResource) file = store.findDriveResource(resourceKey);
            if (!file) {
                if (!store.createPrivateImage) throw gatewayError('PRIVATE_DRIVE_UNAVAILABLE');
                file = store.createPrivateImage({ resourceKey, bytes: validation.bytes, mimeType: validation.mimeType });
            }
            if (!file || !text(file.fileId)) throw gatewayError('IMAGE_PERSIST_FAILED');
            updateLedger(requestId, {
                state: STATE.UPLOAD_PERSISTED, image_resource_key: resourceKey, image_file_id: file.fileId,
                image_drive_url: text(file.driveUrl), image_mime_type: validation.mimeType, updated_at: nowIso(runtime),
            });
            return { pointer: { ...file, resourceKey, mimeType: validation.mimeType }, validation };
        }

        function preflightTarget(payload, unit, records) {
            const requestType = text(payload.request_type || payload.requestType || pipeline.REQUEST_TYPES.create);
            const targetId = text(payload.target_record_id || payload.targetRecordId);
            if (requestType === pipeline.REQUEST_TYPES.create && targetId) throw gatewayError('CREATE_TARGET_RECORD_ID_NOT_ALLOWED');
            if (requestType !== pipeline.REQUEST_TYPES.create && !targetId) throw gatewayError('TARGET_RECORD_ID_REQUIRED');
            if (!targetId) return;
            const target = (records || []).find(record => text(record.record_id) === targetId);
            if (!target) throw gatewayError('TARGET_RECORD_ID_NOT_FOUND');
            if (text(target.unit_code).toLowerCase() !== text(unit.unitCode).toLowerCase()) throw gatewayError('TARGET_RECORD_UNIT_MISMATCH');
        }

        // A location can have only one staff change request awaiting review.  This runs under
        // the Gateway lock, so a second tab cannot bypass the portal's disabled controls.
        // CREATE has no target record and remains independent because a unit may add locations.
        function assertNoPendingTargetConflict(requestId, payload, unit) {
            const targetId = text(payload.target_record_id || payload.targetRecordId);
            if (!targetId) return;
            const hasConflict = rows(PRIVATE_SHEETS.staging).some(row =>
                text(row.request_id) !== requestId &&
                text(row.status) === pipeline.STATUSES.pending &&
                text(row.target_record_id) === targetId &&
                text(row.unit_code).toLowerCase() === text(unit.unitCode).toLowerCase());
            if (hasConflict) throw gatewayError('PENDING_REQUEST_CONFLICT');
        }

        // File IDs are private operational metadata. For an edit without a replacement upload,
        // recover the latest approved pointer server-side so a later STOP can revoke sharing.
        // Legacy public rows may have no private pointer; that must not block a valid edit.
        function findPriorPublishedImageFileId(targetId) {
            const approved = rows(PRIVATE_SHEETS.staging)
                .filter(row => text(row.status) === pipeline.STATUSES.approved &&
                    (text(row.record_id) === targetId || text(row.target_record_id) === targetId))
                .sort((left, right) => String(right.reviewed_at || right.updated_at).localeCompare(String(left.reviewed_at || left.updated_at)))[0];
            return approved ? text(approved.published_image_file_id) || text(approved.image_file_id) : '';
        }

        function submitRequest(payload) {
            const requestId = requireRequestId(payload, 'submitRequest');
            const bodyHash = sha256Hex(stableStringify({ action: 'submitRequest', payload }), runtime);
            return withLock(() => {
                const previous = ledgerFor(requestId);
                if (previous && text(previous.body_hash) !== bodyHash) throw gatewayError('IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD');
                if (previous && text(previous.state) === STATE.COMPLETED) {
                    return { ...resultFromLedger(previous), idempotent: true };
                }
                const createdAt = previous && text(previous.created_at) ? previous.created_at : nowIso(runtime);
                ledgerClaim('submitRequest', requestId, bodyHash, createdAt);
                try {
                    resolvePrivateConfig();
                    const allowlistRows = rows(PRIVATE_SHEETS.allowlist);
                    const authorization = authorize(payload, allowlistRows);
                    const requestType = payload.request_type || payload.requestType;
                    // CREATE is semantically independent of the operational baseline. It must not
                    // become unavailable merely because a legacy baseline is missing or rebuilding.
                    const operationalRecords = requestType === pipeline.REQUEST_TYPES.create
                        ? [] : (store.getOperationalRecords ? store.getOperationalRecords() : []);
                    preflightTarget(payload, authorization.unit, operationalRecords);
                    assertNoPendingTargetConflict(requestId, payload, authorization.unit);
                    if (pipeline.requiresNewImage(requestType) && !payload.image) throw gatewayError('IMAGE_REQUIRED');
                    const image = persistImage(payload, requestId, previous);
                    const input = {
                        requestId,
                        requestType: payload.request_type || payload.requestType,
                        targetRecordId: payload.target_record_id || payload.targetRecordId,
                        locationName: payload.location_name || payload.locationName || payload.name,
                        siteType: payload.site_type || payload.siteType,
                        services: payload.services,
                        address: payload.address,
                        publicPhone: payload.public_phone || payload.publicPhone || payload.phone,
                        mapsUrlOriginal: payload.maps_url_original || payload.mapsUrlOriginal || payload.maps_url || payload.mapsUrl,
                        mapsUrlResolved: payload.maps_url_resolved || payload.mapsUrlResolved,
                        coordinates: payload.coordinates,
                        cccdServiceMode: payload.cccd_service_mode || payload.cccdServiceMode,
                        serviceSchedule: payload.service_schedule || payload.serviceSchedule,
                        servedUnits: payload.served_units || payload.servedUnits,
                        searchAliases: payload.search_aliases || payload.searchAliases,
                        submitterName: payload.submitter_name || payload.submitterName,
                        submitterPhone: payload.submitter_phone || payload.submitterPhone,
                        submitterEmail: authorization.email,
                        reviewNote: payload.review_note || payload.reviewNote,
                        unitCode: authorization.unit.unitCode,
                        unitName: authorization.unit.unitName,
                        publishedImageFileId: image.pointer ? '' : findPriorPublishedImageFileId(text(payload.target_record_id || payload.targetRecordId)),
                        imageFileId: image.pointer ? image.pointer.fileId : '',
                        imageDriveUrl: image.pointer ? image.pointer.driveUrl : '',
                        imageMimeType: image.pointer ? image.pointer.mimeType : '',
                    };
                    const record = pipeline.buildStagingRecord(input, allowlistRows, new Date(createdAt), { publishedRecords: operationalRecords });
                    if (record.validation_errors) throw gatewayError(record.validation_errors.split('|')[0] || 'SUBMISSION_INVALID');
                    let staging = store.findStagingByRequestId && store.findStagingByRequestId(requestId);
                    if (!staging) {
                        if (!store.appendStaging) throw gatewayError('PRIVATE_STAGING_UNAVAILABLE');
                        store.appendStaging(record);
                        staging = record;
                    }
                    let auditWarning = '';
                    try {
                        if (store.appendApprovalAudit && !(store.hasApprovalAudit && store.hasApprovalAudit(requestId))) {
                            store.appendApprovalAudit(pipeline.buildAuditEntry('FORM_SUBMIT', {
                                timestamp: record.updated_at, recordId: record.record_id, requestId, unitCode: record.unit_code,
                                actorEmail: record.submitter_email, submitterEmail: record.submitter_email,
                                nextStatus: record.status, note: record.validation_errors || record.warnings, snapshot: record,
                            }));
                        }
                    } catch (_) { auditWarning = 'AUDIT_APPEND_FAILED'; }
                    const result = { requestId, recordId: staging.record_id, status: staging.status, auditWarning };
                    updateLedger(requestId, { state: STATE.COMPLETED, result_json: JSON.stringify(result), last_error: auditWarning, updated_at: nowIso(runtime) });
                    return result;
                } catch (error) {
                    try { updateLedger(requestId, { state: STATE.FAILED, last_error: error.code || 'GATEWAY_OPERATION_FAILED', updated_at: nowIso(runtime) }); } catch (_) {}
                    throw error.code ? error : gatewayError('GATEWAY_OPERATION_FAILED');
                }
            });
        }

        function validatePublicPayload(payload) {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw gatewayError('PUBLIC_DTO_INVALID');
            const unknownFields = Object.keys(payload).filter(key => !PUBLIC_ALLOWED_FIELDS.includes(key));
            if (unknownFields.length) throw gatewayError('PUBLIC_FIELD_NOT_ALLOWED');
            const requestType = text(payload.request_type);
            if (requestType !== pipeline.REQUEST_TYPES.create) throw gatewayError('PUBLIC_REQUEST_TYPE_NOT_ALLOWED');
            if (text(payload.target_record_id)) throw gatewayError('CREATE_TARGET_RECORD_ID_NOT_ALLOWED');
            if (!text(payload.unit_code)) throw gatewayError('UNIT_CODE_REQUIRED');
            if (!text(payload.location_name)) throw gatewayError('LOCATION_NAME_MISSING');
            if (!text(payload.address)) throw gatewayError('ADDRESS_MISSING');
            if (!text(payload.maps_url_original)) throw gatewayError('COORDINATE_INVALID_LINK');
            if (typeof pipeline.isGoogleMapsUrl !== 'function' || !pipeline.isGoogleMapsUrl(payload.maps_url_original)) {
                throw gatewayError('COORDINATE_INVALID_LINK');
            }
            for (const [field, limit] of [
                ['unit_code', 160], ['location_name', 200], ['address', 500], ['public_phone', 80],
                ['maps_url_original', 2000], ['maps_url_resolved', 2000], ['coordinates', 200],
                ['submitter_name', 200], ['submitter_phone', 80], ['review_note', 2000],
            ]) {
                if (payload[field] !== undefined && typeof payload[field] !== 'string') throw gatewayError('PUBLIC_DTO_INVALID');
                if (text(payload[field]).length > limit) throw gatewayError('PUBLIC_DTO_INVALID');
            }
            if (payload.services !== undefined && (!Array.isArray(payload.services) || payload.services.some(item => typeof item !== 'string'))) {
                throw gatewayError('PUBLIC_DTO_INVALID');
            }
            if (typeof pipeline.parseCoordinates !== 'function') throw gatewayError('COORDINATE_NEEDS_REVIEW');
            const coordinate = pipeline.parseCoordinates(payload.coordinates || payload.maps_url_resolved || payload.maps_url_original);
            if (!coordinate.ok) {
                throw gatewayError(coordinate.error === 'COORDINATES_OUTSIDE_SERVICE_AREA'
                    ? 'COORDINATE_OUTSIDE_PHU_THO' : 'COORDINATE_NEEDS_REVIEW');
            }
            if (!payload.image || typeof payload.image !== 'object' || Array.isArray(payload.image)) throw gatewayError('IMAGE_REQUIRED');
            if (Object.keys(payload.image).some(key => !['base64', 'mimeType', 'filename', 'size'].includes(key))) throw gatewayError('PUBLIC_FIELD_NOT_ALLOWED');
            return requestType;
        }

        function submitPublicContribution(payload) {
            const requestId = requireRequestId(payload, 'submitPublicContribution');
            const bodyHash = sha256Hex(stableStringify({ action: 'submitPublicContribution', payload }), runtime);
            return withLock(() => {
                const previous = ledgerFor(requestId);
                if (previous && text(previous.body_hash) !== bodyHash) throw gatewayError('IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD');
                if (previous && text(previous.state) === STATE.COMPLETED) return { ...resultFromLedger(previous), idempotent: true };
                const createdAt = previous && text(previous.created_at) ? previous.created_at : nowIso(runtime);
                ledgerClaim('submitPublicContribution', requestId, bodyHash, createdAt);
                try {
                    validatePublicPayload(payload);
                    resolvePrivateConfig();
                    const allowlistRows = rows(PRIVATE_SHEETS.allowlist);
                    const unit = pipeline.resolveActiveUnitByCode(payload.unit_code, allowlistRows);
                    if (!unit) throw gatewayError('PUBLIC_UNIT_NOT_ALLOWED');
                    const image = persistImage(payload, requestId, previous, 'public-contribution');
                    const provenance = 'PUBLIC_CAPTCHA; anonymous public web contribution; awaiting admin review.';
                    const record = pipeline.buildStagingRecord({
                        requestId,
                        requestType: pipeline.REQUEST_TYPES.create,
                        targetRecordId: '',
                        locationName: payload.location_name,
                        siteType: 'HEADQUARTERS',
                        services: ['POLICE_OFFICE'],
                        address: payload.address,
                        publicPhone: payload.public_phone,
                        mapsUrlOriginal: payload.maps_url_original,
                        mapsUrlResolved: payload.maps_url_resolved,
                        coordinates: payload.coordinates,
                        submitterName: payload.submitter_name,
                        submitterPhone: payload.submitter_phone,
                        submitterEmail: PUBLIC_SYSTEM_PRINCIPAL,
                        reviewNote: [provenance, text(payload.review_note)].filter(Boolean).join(' '),
                        unitCode: unit.unitCode,
                        unitName: unit.unitName,
                        imageFileId: image.pointer.fileId,
                        imageDriveUrl: image.pointer.driveUrl,
                        imageMimeType: image.pointer.mimeType,
                    }, allowlistRows, new Date(createdAt), {
                        authorizedUnit: unit,
                        authStatus: 'PUBLIC_CAPTCHA',
                        publishedRecords: [],
                    });
                    if (record.validation_errors) throw gatewayError(record.validation_errors.split('|')[0] || 'SUBMISSION_INVALID');
                    let staging = store.findStagingByRequestId && store.findStagingByRequestId(requestId);
                    if (!staging) {
                        if (!store.appendStaging) throw gatewayError('PRIVATE_STAGING_UNAVAILABLE');
                        store.appendStaging(record);
                        staging = record;
                    }
                    if (store.appendApprovalAudit && !(store.hasApprovalAudit && store.hasApprovalAudit(requestId, 'PUBLIC_SUBMIT'))) {
                        store.appendApprovalAudit(pipeline.buildAuditEntry('PUBLIC_SUBMIT', {
                            timestamp: record.updated_at, recordId: record.record_id, requestId,
                            unitCode: record.unit_code, actorEmail: PUBLIC_SYSTEM_PRINCIPAL,
                            submitterEmail: PUBLIC_SYSTEM_PRINCIPAL, nextStatus: record.status,
                            note: record.review_note, snapshot: record,
                        }));
                    }
                    const result = { requestId, status: staging.status };
                    updateLedger(requestId, { state: STATE.COMPLETED, result_json: JSON.stringify(result), last_error: '', updated_at: nowIso(runtime) });
                    return result;
                } catch (error) {
                    try { updateLedger(requestId, { state: STATE.FAILED, last_error: error.code || 'PUBLIC_SUBMIT_FAILED', updated_at: nowIso(runtime) }); } catch (_) {}
                    throw error.code ? error : gatewayError('PUBLIC_SUBMIT_FAILED');
                }
            });
        }

        function writeVerificationEvent(payload) {
            const requestId = requireRequestId(payload, 'writeVerificationEvent');
            const bodyHash = sha256Hex(stableStringify({ action: 'writeVerificationEvent', payload }), runtime);
            return withLock(() => {
                const previous = ledgerFor(requestId);
                if (previous && text(previous.body_hash) !== bodyHash) throw gatewayError('IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD');
                if (previous && text(previous.state) === STATE.COMPLETED) return { ...resultFromLedger(previous), idempotent: true };
                const createdAt = previous && text(previous.created_at) ? previous.created_at : nowIso(runtime);
                ledgerClaim('writeVerificationEvent', requestId, bodyHash, createdAt);
                try {
                    resolvePrivateConfig();
                    const allowlistRows = rows(PRIVATE_SHEETS.allowlist);
                    const authorization = authorize(payload, allowlistRows);
                    const eventType = text(payload.event_type || payload.eventType).toUpperCase();
                    if (!VERIFICATION_EVENTS.includes(eventType)) throw gatewayError('VERIFICATION_EVENT_NOT_ALLOWED');
                    const snapshot = payload.snapshot;
                    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw gatewayError('SNAPSHOT_REQUIRED');
                    const unknownFields = Object.keys(snapshot).filter(key => !SNAPSHOT_FIELDS.includes(key));
                    if (unknownFields.length) throw gatewayError('SNAPSHOT_FIELDS_NOT_ALLOWED');
                    const snapshotHash = sha256Hex(stableStringify(snapshot), runtime);
                    if (!normalizeHex(payload.snapshot_hash || payload.snapshotHash)) throw gatewayError('SNAPSHOT_HASH_REQUIRED');
                    if (!constantTimeEqual(snapshotHash, normalizeHex(payload.snapshot_hash || payload.snapshotHash))) throw gatewayError('SNAPSHOT_HASH_MISMATCH');
                    if (snapshot.unit_code && text(snapshot.unit_code).toLowerCase() !== text(authorization.unit.unitCode).toLowerCase()) {
                        throw gatewayError('TARGET_RECORD_UNIT_MISMATCH');
                    }
                    if (store.findVerificationEvent && store.findVerificationEvent(requestId)) {
                        const result = { operationId: requestId, eventType, idempotent: true };
                        updateLedger(requestId, { state: STATE.COMPLETED, result_json: JSON.stringify(result), updated_at: nowIso(runtime) });
                        return result;
                    }
                    if (!store.appendVerificationAudit) throw gatewayError('PRIVATE_AUDIT_UNAVAILABLE');
                    store.appendVerificationAudit({
                        timestamp: nowIso(runtime), operation_id: requestId, record_id: text(snapshot.record_id),
                        unit_code: authorization.unit.unitCode, actor_email: authorization.email, event_type: eventType,
                        snapshot_hash: snapshotHash, source: 'STAFF_PORTAL_GATEWAY', note: text(payload.note).slice(0, 2000),
                    });
                    const result = { operationId: requestId, eventType, idempotent: false };
                    updateLedger(requestId, { state: STATE.COMPLETED, result_json: JSON.stringify(result), updated_at: nowIso(runtime) });
                    return result;
                } catch (error) {
                    try { updateLedger(requestId, { state: STATE.FAILED, last_error: error.code || 'AUDIT_APPEND_FAILED', updated_at: nowIso(runtime) }); } catch (_) {}
                    throw error.code ? error : gatewayError('AUDIT_APPEND_FAILED');
                }
            });
        }

        function resolveUnits(payload) {
            resolvePrivateConfig();
            const email = pipeline.normalizeEmail(payload.email);
            if (!email) return { units: [] };
            return { units: pipeline.resolveUnitsByEmail(email, rows(PRIVATE_SHEETS.allowlist)) };
        }

        function listPublicContributionUnits() {
            resolvePrivateConfig();
            if (typeof pipeline.resolveActiveUnits !== 'function') throw gatewayError('PUBLIC_UNIT_DIRECTORY_UNAVAILABLE');
            return { units: pipeline.resolveActiveUnits(rows(PRIVATE_SHEETS.allowlist)) };
        }

        // Projection only: never return private staging fields such as submitter, review, audit,
        // or Drive metadata to the browser.
        function listStaffRequestStatuses(payload) {
            resolvePrivateConfig();
            const email = pipeline.normalizeEmail(payload.email);
            if (!email) return { requests: [] };
            const allowed = new Set(pipeline.resolveUnitsByEmail(email, rows(PRIVATE_SHEETS.allowlist))
                .map(unit => text(unit.unitCode).toLowerCase()));
            const permittedTypes = new Set(Object.values(pipeline.REQUEST_TYPES));
            return {
                requests: rows(PRIVATE_SHEETS.staging)
                    .filter(row => text(row.request_id) && text(row.status) === pipeline.STATUSES.pending &&
                        allowed.has(text(row.unit_code).toLowerCase()) && permittedTypes.has(text(row.request_type)))
                    .map(row => ({
                        locationId: text(row.target_record_id),
                        unitCode: text(row.unit_code),
                        type: text(row.request_type),
                        status: pipeline.STATUSES.pending,
                        submittedAt: text(row.submitted_at),
                    }))
                    .filter(row => row.unitCode),
            };
        }

        function dispatch(body) {
            const action = text(body && body.action);
            if (!ACTIONS.includes(action)) throw gatewayError('UNKNOWN_ACTION');
            const envelopeRequestId = text(body && (body.request_id || body.operation_id));
            const payloadRequestId = text(body && body.payload && (body.payload.request_id || body.payload.operation_id));
            if (envelopeRequestId && payloadRequestId && envelopeRequestId !== payloadRequestId) {
                throw gatewayError('REQUEST_ID_MISMATCH');
            }
            const payload = body && body.payload && typeof body.payload === 'object'
                ? { ...body.payload, request_id: envelopeRequestId || payloadRequestId }
                : body;
            if (action === 'resolveUnits') return resolveUnits(payload || {});
            if (action === 'listPublicContributionUnits') return listPublicContributionUnits();
            if (action === 'listStaffRequestStatuses') return listStaffRequestStatuses(payload || {});
            if (action === 'submitRequest') return submitRequest(payload || {});
            if (action === 'submitPublicContribution') return submitPublicContribution(payload || {});
            return writeVerificationEvent(payload || {});
        }

        function assertAction(body) {
            const action = text(body && body.action);
            if (!ACTIONS.includes(action)) throw gatewayError('UNKNOWN_ACTION');
            return action;
        }

        function handleRawRequest(rawBody, metadata = {}) {
            const verified = verifyRawRequest(rawBody, metadata, {
                secret: runtime.secret,
                getSecret: runtime.getSecret,
                now: (runtime.now || (() => Date.now()))(),
                hmacSha256Hex: runtime.hmacSha256Hex,
            });
            let body;
            try { body = JSON.parse(verified.rawBody); } catch (_) { throw gatewayError('REQUEST_JSON_INVALID'); }
            if (!body || typeof body !== 'object' || Array.isArray(body)) throw gatewayError('REQUEST_JSON_INVALID');
            return dispatch(body);
        }

        function verifyRequest(rawBody, metadata = {}) {
            return verifyRawRequest(rawBody, metadata, {
                secret: runtime.secret,
                getSecret: runtime.getSecret,
                now: (runtime.now || (() => Date.now()))(),
                hmacSha256Hex: runtime.hmacSha256Hex,
            });
        }

        return Object.freeze({ assertAction, dispatch, handleRawRequest, verifyRequest, resolvePrivateConfig, submitRequest, submitPublicContribution, writeVerificationEvent, resolveUnits, listPublicContributionUnits, listStaffRequestStatuses });
    }

    createStaffGateway.ACTIONS = ACTIONS;
    createStaffGateway.STATE = STATE;
    createStaffGateway.PRIVATE_SHEETS = PRIVATE_SHEETS;
    createStaffGateway.MAX_IMAGE_BYTES = MAX_IMAGE_BYTES;
    createStaffGateway.FRESHNESS_WINDOW_MS = FRESHNESS_WINDOW_MS;
    createStaffGateway.PUBLIC_SYSTEM_PRINCIPAL = PUBLIC_SYSTEM_PRINCIPAL;
    createStaffGateway.constantTimeEqual = constantTimeEqual;
    createStaffGateway.detectImageType = detectImageType;
    createStaffGateway.validateImageBase64 = validateImageBase64;
    createStaffGateway.stableStringify = stableStringify;
    createStaffGateway.sha256Hex = sha256Hex;
    createStaffGateway.hmacSha256Hex = hmacSha256Hex;
    createStaffGateway.verifyRawRequest = verifyRawRequest;
    createStaffGateway.errors = gatewayError;
    return createStaffGateway;
});
