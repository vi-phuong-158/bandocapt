(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.LocationApprovalPipeline = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const SHEETS = Object.freeze({
        allowlist: 'Unit_Allowlist',
        staging: 'Location_Staging',
        published: 'Published_Locations',
        audit: 'Approval_Audit_Log',
        info: 'Intake_Setup_Info',
    });

    const STATUSES = Object.freeze({
        pending: 'PENDING',
        blocked: 'BLOCKED',
        needVerification: 'NEED_VERIFICATION',
        approved: 'APPROVED',
        rejected: 'REJECTED',
        revoked: 'REVOKED',
    });

    const REQUEST_TYPES = Object.freeze({
        create: 'Thêm địa điểm mới',
        update: 'Cập nhật địa điểm đang có',
        correct: 'Báo địa chỉ hoặc vị trí sai',
        stop: 'Báo địa điểm ngừng hoạt động',
        confirm: 'Xác nhận thông tin hiện tại là đúng',
    });

    const COORDINATE_STATUSES = Object.freeze({
        extracted: 'EXTRACTED',
        needsReview: 'NEEDS_REVIEW',
        invalidLink: 'INVALID_LINK',
        outsidePhuTho: 'OUTSIDE_PHU_THO',
        manuallyConfirmed: 'MANUALLY_CONFIRMED',
    });

    const PUBLIC_FIELDS = Object.freeze([
        'record_id', 'unit_code', 'name', 'type', 'address', 'phone', 'coordinates', 'image_url',
        'search_aliases', 'updated_at', 'site_type', 'services', 'google_maps_url',
        'cccd_service_mode', 'service_schedule', 'served_units', 'status', 'verified_at',
    ]);

    const HEADERS = Object.freeze({
        allowlist: ['unit_code', 'unit_name', 'allowed_emails', 'active', 'notes'],
        staging: [
            'record_id', 'request_id', 'request_type', 'target_record_id', 'unit_code', 'unit_name',
            'location_name', 'type', 'site_type', 'services', 'address', 'public_phone',
            'maps_url_original', 'maps_url_resolved', 'coordinates', 'coordinate_status',
            'image_file_id', 'image_drive_url', 'image_public_url', 'image_mime_type',
            'cccd_service_mode', 'service_schedule', 'served_units', 'search_aliases',
            'submitter_name', 'submitter_phone', 'submitter_email', 'auth_status',
            'validation_errors', 'warnings', 'status', 'review_action', 'review_note',
            'reviewed_by', 'reviewed_at', 'submitted_at', 'updated_at', 'published_image_file_id',
        ],
        published: PUBLIC_FIELDS,
        audit: [
            'timestamp', 'action', 'record_id', 'request_id', 'unit_code', 'actor_email',
            'submitter_email', 'previous_status', 'next_status', 'note', 'snapshot_json',
        ],
    });

    const PHU_THO_BOUNDS = Object.freeze({ minLat: 20.25, maxLat: 21.85, minLng: 104.65, maxLng: 106.85 });
    const IMAGE_MIME_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
    const FORMULA_PREFIX = /^[=+\-@]/;

    function normalizeLabel(value) {
        return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[đĐ]/g, 'd').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    }

    function slugify(value) {
        return normalizeLabel(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown';
    }

    function normalizeEmail(value) {
        return String(value || '').trim().toLowerCase();
    }

    function splitEmails(value) {
        return String(value || '').split(/[,;\n]/).map(normalizeEmail).filter(Boolean);
    }

    function normalizeBoolean(value) {
        if (value === true) return true;
        return !['0', 'false', 'off', 'no', 'inactive', 'disabled'].includes(normalizeLabel(value));
    }

    function unique(values) {
        return Array.from(new Set((values || []).filter(Boolean)));
    }

    function asIsoString(value) {
        const date = value instanceof Date ? value : new Date(value || Date.now());
        return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
    }

    function sanitizeSheetCell(value) {
        const text = String(value == null ? '' : value);
        return FORMULA_PREFIX.test(text) ? `'${text}` : text;
    }

    function sanitizeUserFields(record) {
        const result = { ...record };
        [
            'unit_name', 'location_name', 'address', 'public_phone', 'maps_url_original', 'maps_url_resolved',
            'service_schedule', 'served_units', 'search_aliases', 'submitter_name', 'submitter_phone',
            'review_note', 'image_drive_url', 'image_public_url',
        ].forEach(field => {
            if (Object.prototype.hasOwnProperty.call(result, field)) result[field] = sanitizeSheetCell(result[field]);
        });
        return result;
    }

    function normalizeServices(value, legacyType = '', useLegacyFallback = true) {
        const input = Array.isArray(value) ? value : String(value || '').split(/[|,;]/);
        const map = {
            'tru so cong an': 'POLICE_OFFICE', 'police office': 'POLICE_OFFICE',
            'cap can cuoc': 'CITIZEN_ID', 'cccd': 'CITIZEN_ID', 'citizen id': 'CITIZEN_ID',
            'ho tro dinh danh dien tu': 'E_IDENTIFICATION', 'cu tru': 'RESIDENCE',
            'dang ky xe': 'VEHICLE_REGISTRATION', 'truc ban': 'DUTY',
            'tiep nhan tin bao to giac': 'CRIME_REPORT',
        };
        const normalized = input.map(item => {
            const label = normalizeLabel(item);
            return map[label] || String(item || '').trim().toUpperCase().replace(/\s+/g, '_');
        }).filter(Boolean);
        if (!normalized.length && useLegacyFallback) normalized.push(normalizeLocationType(legacyType) === 'id_center' ? 'CITIZEN_ID' : 'POLICE_OFFICE');
        return unique(normalized);
    }

    function normalizeLocationType(value) {
        return /cccd|can cuoc|id[ _]center/i.test(normalizeLabel(value)) ? 'id_center' : 'police_station';
    }

    function deriveLegacyType(services, siteType) {
        return services.includes('CITIZEN_ID') && !services.includes('POLICE_OFFICE') && siteType !== 'HEADQUARTERS'
            ? 'id_center' : 'police_station';
    }

    function isGoogleMapsUrl(value) {
        try {
            const url = new URL(String(value || '').trim());
            const host = url.hostname.toLowerCase();
            return url.protocol === 'https:' && (
                host === 'maps.app.goo.gl' || host === 'goo.gl' || host.endsWith('.google.com') ||
                host === 'google.com' || host.endsWith('.google.com.vn')
            );
        } catch (_) {
            return false;
        }
    }

    function parseCoordinates(input, bounds = PHU_THO_BOUNDS) {
        const source = String(input || '').trim();
        if (!source) return { ok: false, error: 'COORDINATES_MISSING' };
        let text = source;
        try { text = decodeURIComponent(source); } catch (_) {}
        const patterns = [
            /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
            /[?&](?:q|query|ll|destination|center)=(-?\d+(?:\.\d+)?)(?:%2C|,|\s)+(-?\d+(?:\.\d+)?)/i,
            /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/i,
            /(?:^|[^\d.-])(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)(?:$|[^\d.])/
        ];
        const match = patterns.map(pattern => text.match(pattern)).find(Boolean);
        if (!match) return { ok: false, error: 'COORDINATES_FORMAT_INVALID' };
        const lat = Number(match[1]);
        const lng = Number(match[2]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            return { ok: false, error: 'COORDINATES_OUT_OF_RANGE' };
        }
        if (bounds && (lat < bounds.minLat || lat > bounds.maxLat || lng < bounds.minLng || lng > bounds.maxLng)) {
            return { ok: false, error: 'COORDINATES_OUTSIDE_SERVICE_AREA', lat, lng };
        }
        return { ok: true, lat, lng };
    }

    function classifyCoordinateStatus({ mapsUrl, coordinates, manuallyConfirmed = false } = {}) {
        if (manuallyConfirmed) {
            const parsed = parseCoordinates(coordinates);
            return parsed.ok ? { ...parsed, status: COORDINATE_STATUSES.manuallyConfirmed } : { ...parsed, status: COORDINATE_STATUSES.needsReview };
        }
        if (mapsUrl && !isGoogleMapsUrl(mapsUrl)) return { ok: false, status: COORDINATE_STATUSES.invalidLink, error: 'MAPS_URL_INVALID' };
        const parsed = parseCoordinates(coordinates || mapsUrl);
        if (parsed.ok) return { ...parsed, status: COORDINATE_STATUSES.extracted };
        if (parsed.error === 'COORDINATES_OUTSIDE_SERVICE_AREA') return { ...parsed, status: COORDINATE_STATUSES.outsidePhuTho };
        return { ...parsed, status: COORDINATE_STATUSES.needsReview };
    }

    function validateImageMimeType(mimeType) {
        return IMAGE_MIME_TYPES.includes(String(mimeType || '').toLowerCase());
    }

    function validateImageSubmission(files) {
        const input = Array.isArray(files) ? files : [];
        if (!input.length) return { ok: false, error: 'IMAGE_REQUIRED' };
        if (input.length !== 1) return { ok: false, error: 'IMAGE_COUNT_MUST_BE_ONE' };
        if (!validateImageMimeType(input[0].mimeType)) return { ok: false, error: 'IMAGE_MIME_NOT_ALLOWED' };
        return { ok: true };
    }

    function buildAllowlistMap(rows) {
        const byUnitName = new Map();
        (rows || []).forEach(row => {
            const unitName = String(row.unit_name || '').trim();
            if (!unitName || !normalizeBoolean(row.active)) return;
            byUnitName.set(normalizeLabel(unitName), {
                unitCode: String(row.unit_code || slugify(unitName)).trim(),
                unitName,
                allowedEmails: splitEmails(row.allowed_emails),
            });
        });
        return { byUnitName };
    }

    function authorizeSubmission(unitName, submitterEmail, allowlistRows) {
        const entry = buildAllowlistMap(allowlistRows).byUnitName.get(normalizeLabel(unitName));
        if (!entry) return { authorized: false, unitCode: slugify(unitName), error: 'UNIT_NOT_IN_ALLOWLIST' };
        if (!entry.allowedEmails.length) return { authorized: false, unitCode: entry.unitCode, error: 'UNIT_EMAIL_NOT_CONFIGURED' };
        if (!entry.allowedEmails.includes(normalizeEmail(submitterEmail))) {
            return { authorized: false, unitCode: entry.unitCode, error: 'EMAIL_NOT_AUTHORIZED_FOR_UNIT' };
        }
        return { authorized: true, unitCode: entry.unitCode, unitName: entry.unitName, error: '' };
    }

    function normalizeSubmission(input = {}, now = new Date()) {
        const requestType = String(input.requestType || REQUEST_TYPES.create).trim();
        const locationName = String(input.locationName || input.name || '').trim();
        const services = normalizeServices(input.services, input.type, false);
        const coordinate = classifyCoordinateStatus({
            mapsUrl: input.mapsUrlResolved || input.mapsUrlOriginal || input.mapsUrl,
            coordinates: input.coordinates,
            manuallyConfirmed: input.coordinateStatus === COORDINATE_STATUSES.manuallyConfirmed,
        });
        return {
            requestId: String(input.requestId || `REQ_${asIsoString(now).replace(/[-:.TZ]/g, '')}`).trim(),
            requestType,
            targetRecordId: String(input.targetRecordId || '').trim(),
            recordId: String(input.recordId || '').trim(),
            submittedAt: asIsoString(input.submittedAt || now),
            submitterEmail: normalizeEmail(input.submitterEmail || input.email),
            submitterName: String(input.submitterName || '').trim(),
            submitterPhone: String(input.submitterPhone || '').trim(),
            unitName: String(input.unitName || '').trim(),
            unitCode: String(input.unitCode || '').trim(),
            locationName,
            siteType: String(input.siteType || '').trim().toUpperCase() || 'HEADQUARTERS',
            services,
            type: deriveLegacyType(services, String(input.siteType || '').trim().toUpperCase()),
            address: String(input.address || '').trim(),
            publicPhone: String(input.publicPhone || input.phone || '').trim(),
            mapsUrlOriginal: String(input.mapsUrlOriginal || input.mapsUrl || '').trim(),
            mapsUrlResolved: String(input.mapsUrlResolved || '').trim(),
            coordinates: coordinate.ok ? `${coordinate.lat},${coordinate.lng}` : String(input.coordinates || '').trim(),
            coordinateStatus: input.coordinateStatus || coordinate.status,
            imageFileId: String(input.imageFileId || '').trim(),
            imageDriveUrl: String(input.imageDriveUrl || '').trim(),
            imagePublicUrl: String(input.imagePublicUrl || input.imageUrl || '').trim(),
            imageMimeType: String(input.imageMimeType || '').toLowerCase(),
            cccdServiceMode: String(input.cccdServiceMode || 'UNKNOWN').trim().toUpperCase(),
            serviceSchedule: String(input.serviceSchedule || '').trim(),
            servedUnits: String(input.servedUnits || '').trim(),
            searchAliases: String(input.searchAliases || '').trim(),
            reviewNote: String(input.reviewNote || '').trim(),
        };
    }

    function buildRecordId(unitCode, locationName, now = new Date()) {
        return `${String(unitCode || 'unit').toUpperCase()}_${slugify(locationName).toUpperCase()}_${asIsoString(now).replace(/[-:.TZ]/g, '').slice(0, 14)}`.slice(0, 160);
    }

    function haversineMeters(a, b) {
        const rad = Math.PI / 180;
        const lat1 = Number(a.lat); const lng1 = Number(a.lng); const lat2 = Number(b.lat); const lng2 = Number(b.lng);
        if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return Infinity;
        const dLat = (lat2 - lat1) * rad; const dLng = (lng2 - lng1) * rad;
        const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
        return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    }

    function parseRecordCoordinates(record) {
        const parsed = parseCoordinates(record.coordinates);
        return parsed.ok ? parsed : { lat: Number(record.lat), lng: Number(record.lng) };
    }

    function detectDuplicateWarnings(candidate, publishedRecords = []) {
        const warnings = [];
        const candidateCoordinates = parseRecordCoordinates(candidate);
        for (const published of publishedRecords) {
            if (published.record_id === candidate.recordId && candidate.requestType === REQUEST_TYPES.create) warnings.push('DUPLICATE_RECORD_ID');
            if (published.record_id === candidate.targetRecordId) continue;
            const publishedCoordinates = parseRecordCoordinates(published);
            if (normalizeLabel(published.name) === normalizeLabel(candidate.locationName) && candidateCoordinates.ok && publishedCoordinates.ok &&
                haversineMeters(candidateCoordinates, publishedCoordinates) <= 50) warnings.push(`POSSIBLE_DUPLICATE:${published.record_id}`);
        }
        return unique(warnings);
    }

    function requiresExistingTarget(requestType) {
        return requestType !== REQUEST_TYPES.create;
    }

    function buildStagingRecord(input, allowlistRows, now = new Date(), options = {}) {
        const submission = normalizeSubmission(input, now);
        const publishedRecords = options.publishedRecords || [];
        const authorization = authorizeSubmission(submission.unitName, submission.submitterEmail, allowlistRows);
        const errors = [];
        if (!submission.submitterEmail) errors.push('SUBMITTER_EMAIL_MISSING');
        if (!submission.unitName) errors.push('UNIT_NAME_MISSING');
        if (!authorization.authorized) errors.push(authorization.error);
        if (!submission.locationName && submission.requestType !== REQUEST_TYPES.stop) errors.push('LOCATION_NAME_MISSING');
        if (!submission.services.length && submission.requestType !== REQUEST_TYPES.stop) errors.push('SERVICES_MISSING');
        if (!submission.address && submission.requestType !== REQUEST_TYPES.stop) errors.push('ADDRESS_MISSING');
        if (requiresExistingTarget(submission.requestType) && !submission.targetRecordId) errors.push('TARGET_RECORD_ID_REQUIRED');
        if (requiresExistingTarget(submission.requestType) && submission.targetRecordId && !publishedRecords.some(record => record.record_id === submission.targetRecordId)) errors.push('TARGET_RECORD_ID_NOT_FOUND');
        if (submission.requestType !== REQUEST_TYPES.stop && ![COORDINATE_STATUSES.extracted, COORDINATE_STATUSES.manuallyConfirmed].includes(submission.coordinateStatus)) errors.push(`COORDINATE_${submission.coordinateStatus}`);
        if (submission.imageMimeType && !validateImageMimeType(submission.imageMimeType)) errors.push('IMAGE_MIME_NOT_ALLOWED');
        if (!submission.imageFileId && submission.requestType !== REQUEST_TYPES.stop) errors.push('IMAGE_REQUIRED');
        const recordId = submission.targetRecordId || submission.recordId || buildRecordId(authorization.unitCode || submission.unitCode, submission.locationName, now);
        const warnings = detectDuplicateWarnings({ ...submission, recordId }, publishedRecords);
        const isoNow = asIsoString(now);
        return sanitizeUserFields({
            record_id: recordId,
            request_id: submission.requestId,
            request_type: submission.requestType,
            target_record_id: submission.targetRecordId,
            unit_code: authorization.unitCode || submission.unitCode || slugify(submission.unitName),
            unit_name: authorization.unitName || submission.unitName,
            location_name: submission.locationName,
            type: submission.type,
            site_type: submission.siteType,
            services: submission.services.join('|'),
            address: submission.address,
            public_phone: submission.publicPhone,
            maps_url_original: submission.mapsUrlOriginal,
            maps_url_resolved: submission.mapsUrlResolved,
            coordinates: submission.coordinates,
            coordinate_status: submission.coordinateStatus,
            image_file_id: submission.imageFileId,
            image_drive_url: submission.imageDriveUrl,
            image_public_url: submission.imagePublicUrl,
            image_mime_type: submission.imageMimeType,
            cccd_service_mode: submission.cccdServiceMode,
            service_schedule: submission.serviceSchedule,
            served_units: submission.servedUnits,
            search_aliases: submission.searchAliases,
            submitter_name: submission.submitterName,
            submitter_phone: submission.submitterPhone,
            submitter_email: submission.submitterEmail,
            auth_status: authorization.authorized ? 'AUTHORIZED' : 'UNAUTHORIZED',
            validation_errors: unique(errors).join('|'),
            warnings: warnings.join('|'),
            status: errors.length ? STATUSES.blocked : STATUSES.pending,
            review_action: '', review_note: submission.reviewNote, reviewed_by: '', reviewed_at: '',
            submitted_at: submission.submittedAt, updated_at: isoNow, published_image_file_id: '',
        });
    }

    function buildPublishedRecord(stagingRecord, reviewedAt = new Date()) {
        const services = normalizeServices(stagingRecord.services, stagingRecord.type);
        return {
            record_id: stagingRecord.target_record_id || stagingRecord.record_id,
            unit_code: stagingRecord.unit_code,
            name: stagingRecord.location_name,
            type: deriveLegacyType(services, stagingRecord.site_type),
            address: stagingRecord.address,
            phone: stagingRecord.public_phone,
            coordinates: stagingRecord.coordinates,
            image_url: stagingRecord.image_public_url,
            search_aliases: stagingRecord.search_aliases,
            updated_at: asIsoString(reviewedAt),
            site_type: stagingRecord.site_type,
            services: services.join('|'),
            google_maps_url: stagingRecord.maps_url_resolved || stagingRecord.maps_url_original,
            cccd_service_mode: stagingRecord.cccd_service_mode,
            service_schedule: stagingRecord.service_schedule,
            served_units: stagingRecord.served_units,
            status: 'published',
            verified_at: asIsoString(reviewedAt),
        };
    }

    function buildAuditEntry(action, payload) {
        return {
            timestamp: payload.timestamp, action, record_id: payload.recordId, request_id: payload.requestId || '',
            unit_code: payload.unitCode, actor_email: payload.actorEmail || '', submitter_email: payload.submitterEmail || '',
            previous_status: payload.previousStatus || '', next_status: payload.nextStatus || '', note: payload.note || '',
            snapshot_json: JSON.stringify(payload.snapshot || {}),
        };
    }

    function cloneRecords(records) {
        return (records || []).map(record => ({ ...record }));
    }

    function findStagingIndex(records, requestOrRecordId) {
        const byRequest = records.findIndex(record => record.request_id === requestOrRecordId);
        return byRequest >= 0 ? byRequest : records.findIndex(record => record.record_id === requestOrRecordId);
    }

    function findPublishedImageFileId(stagingRecords, recordId) {
        const approved = stagingRecords.filter(record => record.record_id === recordId && record.status === STATUSES.approved)
            .sort((a, b) => String(b.reviewed_at).localeCompare(String(a.reviewed_at)))[0];
        return approved?.published_image_file_id || approved?.image_file_id || '';
    }

    function applyApproval(state, requestOrRecordId, reviewerEmail, note = '', reviewedAt = new Date()) {
        const stagingRecords = cloneRecords(state.stagingRecords);
        const publishedRecords = cloneRecords(state.publishedRecords);
        const auditEntries = cloneRecords(state.auditEntries);
        const stageIndex = findStagingIndex(stagingRecords, requestOrRecordId);
        if (stageIndex < 0) throw new Error(`RECORD_NOT_FOUND:${requestOrRecordId}`);
        const previous = { ...stagingRecords[stageIndex] };
        if (previous.validation_errors) throw new Error(`RECORD_INVALID:${previous.request_id || previous.record_id}`);
        const targetId = previous.target_record_id || previous.record_id;
        const publishedIndex = publishedRecords.findIndex(record => record.record_id === targetId);
        if (requiresExistingTarget(previous.request_type) && publishedIndex < 0) throw new Error(`TARGET_RECORD_ID_NOT_FOUND:${targetId}`);
        const isoNow = asIsoString(reviewedAt);
        if (previous.request_type === REQUEST_TYPES.stop) {
            const removed = publishedRecords.splice(publishedIndex, 1)[0];
            const staged = { ...previous, status: STATUSES.revoked, review_action: '', review_note: note, reviewed_by: reviewerEmail, reviewed_at: isoNow, updated_at: isoNow };
            stagingRecords[stageIndex] = staged;
            auditEntries.push(buildAuditEntry('REVOKE', { timestamp: isoNow, recordId: targetId, requestId: staged.request_id, unitCode: staged.unit_code, actorEmail: reviewerEmail, submitterEmail: staged.submitter_email, previousStatus: previous.status, nextStatus: STATUSES.revoked, note, snapshot: { staging: staged, removed } }));
            return { stagingRecords, publishedRecords, auditEntries, revokedImageFileId: findPublishedImageFileId(stagingRecords, targetId), removedPublishedRecord: removed };
        }
        const published = buildPublishedRecord(previous, isoNow);
        if (publishedIndex >= 0) publishedRecords[publishedIndex] = published;
        else publishedRecords.push(published);
        const staged = { ...previous, record_id: targetId, status: STATUSES.approved, review_action: '', review_note: note, reviewed_by: reviewerEmail, reviewed_at: isoNow, updated_at: isoNow, published_image_file_id: previous.image_file_id };
        stagingRecords[stageIndex] = staged;
        auditEntries.push(buildAuditEntry('APPROVE', { timestamp: isoNow, recordId: targetId, requestId: staged.request_id, unitCode: staged.unit_code, actorEmail: reviewerEmail, submitterEmail: staged.submitter_email, previousStatus: previous.status, nextStatus: STATUSES.approved, note, snapshot: { staging: staged, published } }));
        return { stagingRecords, publishedRecords, auditEntries, revokedImageFileId: '' };
    }

    function applyReviewAction(state, requestOrRecordId, action, reviewerEmail, note = '', reviewedAt = new Date()) {
        if (action === 'APPROVE') return applyApproval(state, requestOrRecordId, reviewerEmail, note, reviewedAt);
        const stagingRecords = cloneRecords(state.stagingRecords);
        const publishedRecords = cloneRecords(state.publishedRecords);
        const auditEntries = cloneRecords(state.auditEntries);
        const stageIndex = findStagingIndex(stagingRecords, requestOrRecordId);
        if (stageIndex < 0) throw new Error(`RECORD_NOT_FOUND:${requestOrRecordId}`);
        const previous = { ...stagingRecords[stageIndex] };
        const status = action === 'NEED_VERIFICATION' ? STATUSES.needVerification : STATUSES.rejected;
        const isoNow = asIsoString(reviewedAt);
        const staged = { ...previous, status, review_action: '', review_note: note, reviewed_by: reviewerEmail, reviewed_at: isoNow, updated_at: isoNow };
        stagingRecords[stageIndex] = staged;
        auditEntries.push(buildAuditEntry(action, { timestamp: isoNow, recordId: staged.record_id, requestId: staged.request_id, unitCode: staged.unit_code, actorEmail: reviewerEmail, submitterEmail: staged.submitter_email, previousStatus: previous.status, nextStatus: status, note, snapshot: staged }));
        return { stagingRecords, publishedRecords, auditEntries, revokedImageFileId: '' };
    }

    function applyRevocation(state, recordId, reviewerEmail, note = '', reviewedAt = new Date()) {
        const stagingRecords = cloneRecords(state.stagingRecords);
        const publishedRecords = cloneRecords(state.publishedRecords);
        const auditEntries = cloneRecords(state.auditEntries);
        const index = publishedRecords.findIndex(record => record.record_id === recordId);
        if (index < 0) throw new Error(`PUBLISHED_RECORD_NOT_FOUND:${recordId}`);
        const isoNow = asIsoString(reviewedAt);
        const removed = publishedRecords.splice(index, 1)[0];
        auditEntries.push(buildAuditEntry('REVOKE', { timestamp: isoNow, recordId, unitCode: removed.unit_code, actorEmail: reviewerEmail, previousStatus: removed.status, nextStatus: STATUSES.revoked, note, snapshot: removed }));
        return { stagingRecords, publishedRecords, auditEntries, revokedImageFileId: findPublishedImageFileId(stagingRecords, recordId), removedPublishedRecord: removed };
    }

    function migrateLegacyLocations(records = []) {
        const report = { total: records.length, valid: 0, missingRecordId: 0, possibleDuplicates: 0, missingCoordinates: 0, outsideBounds: 0 };
        const migrated = records.map((record, index) => {
            const copy = { ...record };
            if (!copy.record_id) { copy.record_id = `LEGACY_${String(index + 1).padStart(4, '0')}`; report.missingRecordId += 1; }
            copy.services = normalizeServices(copy.services, copy.type).join('|');
            const coordinate = classifyCoordinateStatus({ coordinates: copy.coordinates, mapsUrl: copy.google_maps_url });
            copy.coordinate_status = coordinate.status;
            if (coordinate.status === COORDINATE_STATUSES.needsReview) report.missingCoordinates += 1;
            if (coordinate.status === COORDINATE_STATUSES.outsidePhuTho) report.outsideBounds += 1;
            if ([COORDINATE_STATUSES.extracted, COORDINATE_STATUSES.manuallyConfirmed].includes(coordinate.status)) report.valid += 1;
            return copy;
        });
        migrated.forEach(record => { if (detectDuplicateWarnings({ recordId: record.record_id, requestType: REQUEST_TYPES.create, locationName: record.name, coordinates: record.coordinates }, migrated).some(warning => warning.startsWith('POSSIBLE_DUPLICATE'))) report.possibleDuplicates += 1; });
        return { records: migrated, report };
    }

    return {
        SHEETS, STATUSES, REQUEST_TYPES, COORDINATE_STATUSES, HEADERS, PUBLIC_FIELDS, PHU_THO_BOUNDS, IMAGE_MIME_TYPES,
        normalizeLabel, slugify, normalizeEmail, splitEmails, sanitizeSheetCell, sanitizeUserFields, normalizeServices,
        normalizeLocationType, deriveLegacyType, isGoogleMapsUrl, parseCoordinates, classifyCoordinateStatus,
        validateImageMimeType, validateImageSubmission, buildAllowlistMap, authorizeSubmission, normalizeSubmission,
        buildRecordId, haversineMeters, detectDuplicateWarnings, buildStagingRecord, buildPublishedRecord,
        buildAuditEntry, applyApproval, applyReviewAction, applyRevocation, migrateLegacyLocations,
    };
});
