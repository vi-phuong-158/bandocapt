(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.LocationApprovalPipeline = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const SHEETS = Object.freeze({
        formResponses: 'Form_Responses',
        allowlist: 'Unit_Allowlist',
        staging: 'Location_Staging',
        published: 'Published_Locations',
        audit: 'Approval_Audit_Log',
    });

    const STATUSES = Object.freeze({
        pending: 'pending',
        approved: 'approved',
        rejected: 'rejected',
        revoked: 'revoked',
    });

    const AUDIT_ACTIONS = Object.freeze({
        submit: 'submit',
        submitRejected: 'submit_rejected',
        approve: 'approve',
        reject: 'reject',
        revoke: 'revoke',
    });

    const PHU_THO_BOUNDS = Object.freeze({
        minLat: 20.25,
        maxLat: 21.85,
        minLng: 104.65,
        maxLng: 106.85,
    });

    const HEADERS = Object.freeze({
        allowlist: [
            'unit_code',
            'unit_name',
            'allowed_emails',
            'active',
            'notes',
        ],
        staging: [
            'record_id',
            'unit_code',
            'name',
            'type',
            'address',
            'phone',
            'coordinates',
            'image_url',
            'submitter_email',
            'status',
            'validation_error_codes',
            'reviewed_by',
            'reviewed_at',
            'updated_at',
            'submitted_at',
            'review_note',
        ],
        published: [
            'record_id',
            'unit_code',
            'name',
            'type',
            'address',
            'phone',
            'coordinates',
            'image_url',
            'submitter_email',
            'status',
            'reviewed_by',
            'reviewed_at',
            'updated_at',
        ],
        audit: [
            'timestamp',
            'action',
            'record_id',
            'unit_code',
            'actor_email',
            'submitter_email',
            'previous_status',
            'next_status',
            'note',
            'staging_snapshot_json',
            'published_snapshot_json',
        ],
    });

    function normalizeLabel(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[đĐ]/g, 'd')
            .replace(/[_-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    function slugify(value) {
        return normalizeLabel(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown_unit';
    }

    function normalizeEmail(value) {
        return String(value || '').trim().toLowerCase();
    }

    function splitEmails(value) {
        return String(value || '')
            .split(/[,\n;]/)
            .map(normalizeEmail)
            .filter(Boolean);
    }

    function normalizeBoolean(value) {
        const normalized = normalizeLabel(value);
        if (!normalized) return true;
        return !['0', 'false', 'off', 'no', 'inactive', 'disabled'].includes(normalized);
    }

    function safeJsonStringify(value) {
        return JSON.stringify(value || {});
    }

    function cloneRecords(records) {
        return (records || []).map(record => ({ ...record }));
    }

    function asIsoString(value) {
        const date = value instanceof Date ? value : new Date(value || Date.now());
        return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
    }

    function normalizeLocationType(value) {
        const normalized = normalizeLabel(value);
        if (/cccd|can cuoc|id center/.test(normalized)) return 'id_center';
        return 'police_station';
    }

    function parseCoordinates(input, bounds = PHU_THO_BOUNDS) {
        const value = String(input || '').trim();
        if (!value) return { ok: false, error: 'COORDINATES_MISSING' };

        const decoded = (() => {
            try { return decodeURIComponent(value); } catch (_) { return value; }
        })();

        const patterns = [
            /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
            /[?&](?:q|query|ll|destination)=(-?\d+(?:\.\d+)?)(?:%2C|,|\s)+(-?\d+(?:\.\d+)?)/i,
            /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/i,
            /(?:^|[^\d.-])(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)(?:$|[^\d.])/,
        ];

        let match = null;
        for (const pattern of patterns) {
            match = decoded.match(pattern);
            if (match) break;
        }
        if (!match) return { ok: false, error: 'COORDINATES_FORMAT_INVALID' };

        const lat = Number(match[1]);
        const lng = Number(match[2]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return { ok: false, error: 'COORDINATES_NOT_NUMERIC' };
        }
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            return { ok: false, error: 'COORDINATES_OUT_OF_RANGE' };
        }
        if (bounds && (
            lat < bounds.minLat || lat > bounds.maxLat ||
            lng < bounds.minLng || lng > bounds.maxLng
        )) {
            return { ok: false, error: 'COORDINATES_OUTSIDE_SERVICE_AREA' };
        }

        return { ok: true, lat, lng };
    }

    function isValidPhone(value) {
        return /^[0-9]{8,15}$/.test(String(value || '').trim());
    }

    function isValidImageUrl(value) {
        const input = String(value || '').trim();
        if (!input) return true;
        try {
            const url = new URL(input);
            return url.protocol === 'https:';
        } catch (_) {
            return false;
        }
    }

    function findNamedValue(namedValues, aliases) {
        if (!namedValues || typeof namedValues !== 'object') return '';
        const aliasSet = aliases.map(normalizeLabel);
        for (const [key, rawValue] of Object.entries(namedValues)) {
            if (!aliasSet.includes(normalizeLabel(key))) continue;
            const first = Array.isArray(rawValue) ? rawValue[0] : rawValue;
            return String(first || '').trim();
        }
        return '';
    }

    function buildAllowlistMap(rows) {
        const byEmail = new Map();
        const byUnitCode = new Map();

        (rows || []).forEach(row => {
            const active = normalizeBoolean(row.active);
            const unitName = String(row.unit_name || '').trim();
            if (!active || !unitName) return;

            const unitCode = String(row.unit_code || slugify(unitName)).trim();
            const entry = {
                unitCode,
                unitName,
                allowedEmails: splitEmails(row.allowed_emails),
                active: true,
            };

            if (!entry.allowedEmails.length) return;
            byUnitCode.set(unitCode, entry);
            entry.allowedEmails.forEach(email => byEmail.set(email, entry));
        });

        return { byEmail, byUnitCode };
    }

    function normalizeSubmission(input, now = new Date()) {
        const submittedAt = asIsoString(input.submittedAt || input.timestamp || now);
        const unitName = String(input.unitName || input.name || '').trim();
        return {
            recordId: String(input.recordId || '').trim(),
            submittedAt,
            submitterEmail: normalizeEmail(input.submitterEmail || input.email),
            unitName,
            unitCode: String(input.unitCode || slugify(unitName)).trim(),
            type: normalizeLocationType(input.type),
            address: String(input.address || '').trim(),
            phone: String(input.phone || '').trim(),
            coordinates: String(input.coordinates || '').trim(),
            imageUrl: String(input.imageUrl || '').trim(),
        };
    }

    function validateSubmission(submission, allowlistRows) {
        const normalized = normalizeSubmission(submission);
        const allowlist = buildAllowlistMap(allowlistRows);
        const authorized = allowlist.byEmail.get(normalized.submitterEmail) || null;
        const errors = [];

        if (!normalized.submitterEmail) errors.push('SUBMITTER_EMAIL_MISSING');
        if (!normalized.unitName) errors.push('UNIT_NAME_MISSING');
        if (!normalized.address) errors.push('ADDRESS_MISSING');
        if (!normalized.phone) errors.push('PHONE_MISSING');
        if (!normalized.coordinates) errors.push('COORDINATES_MISSING');

        if (!authorized) {
            errors.push('SUBMITTER_NOT_ALLOWED');
        } else {
            const submittedUnit = normalizeLabel(normalized.unitName);
            const allowedUnit = normalizeLabel(authorized.unitName);
            if (submittedUnit !== allowedUnit) {
                errors.push('UNIT_MISMATCH');
            }
        }

        if (normalized.phone && !isValidPhone(normalized.phone)) {
            errors.push('PHONE_INVALID');
        }

        if (!isValidImageUrl(normalized.imageUrl)) {
            errors.push('IMAGE_URL_INVALID');
        }

        const parsedCoordinates = parseCoordinates(normalized.coordinates);
        if (!parsedCoordinates.ok) {
            errors.push(parsedCoordinates.error);
        }

        return {
            normalized,
            authorized,
            parsedCoordinates,
            errors: Array.from(new Set(errors)),
        };
    }

    function buildRecordId(unitCode, now = new Date(), suffix = 'manual') {
        const iso = asIsoString(now).replace(/[-:.TZ]/g, '').slice(0, 14);
        return `${unitCode || 'unit'}_${iso}_${String(suffix || 'manual').toLowerCase()}`;
    }

    function buildStagingRecord(submission, allowlistRows, now = new Date(), options = {}) {
        const { normalized, authorized, errors } = validateSubmission(submission, allowlistRows);
        const recordId = normalized.recordId || buildRecordId(authorized?.unitCode || normalized.unitCode, now, options.suffix || 'submit');
        const status = errors.length ? STATUSES.rejected : STATUSES.pending;
        const isoNow = asIsoString(now);

        return {
            record_id: recordId,
            unit_code: authorized?.unitCode || normalized.unitCode,
            name: authorized?.unitName || normalized.unitName,
            type: normalized.type,
            address: normalized.address,
            phone: normalized.phone,
            coordinates: normalized.coordinates,
            image_url: normalized.imageUrl,
            submitter_email: normalized.submitterEmail,
            status,
            validation_error_codes: errors.join('|'),
            reviewed_by: '',
            reviewed_at: '',
            updated_at: isoNow,
            submitted_at: normalized.submittedAt,
            review_note: '',
        };
    }

    function buildPublishedRecord(stagingRecord, reviewerEmail, reviewedAt) {
        return {
            record_id: stagingRecord.record_id,
            unit_code: stagingRecord.unit_code,
            name: stagingRecord.name,
            type: stagingRecord.type,
            address: stagingRecord.address,
            phone: stagingRecord.phone,
            coordinates: stagingRecord.coordinates,
            image_url: stagingRecord.image_url,
            submitter_email: stagingRecord.submitter_email,
            status: 'published',
            reviewed_by: reviewerEmail,
            reviewed_at: reviewedAt,
            updated_at: reviewedAt,
        };
    }

    function buildAuditEntry(action, payload) {
        return {
            timestamp: payload.timestamp,
            action,
            record_id: payload.recordId,
            unit_code: payload.unitCode,
            actor_email: payload.actorEmail,
            submitter_email: payload.submitterEmail,
            previous_status: payload.previousStatus || '',
            next_status: payload.nextStatus || '',
            note: payload.note || '',
            staging_snapshot_json: safeJsonStringify(payload.stagingSnapshot),
            published_snapshot_json: safeJsonStringify(payload.publishedSnapshot),
        };
    }

    function applyApproval(state, recordId, reviewerEmail, note = '', reviewedAt = new Date()) {
        const stagingRecords = cloneRecords(state.stagingRecords);
        const publishedRecords = cloneRecords(state.publishedRecords);
        const auditEntries = cloneRecords(state.auditEntries);
        const isoNow = asIsoString(reviewedAt);
        const stageIndex = stagingRecords.findIndex(record => record.record_id === recordId);
        if (stageIndex < 0) throw new Error(`RECORD_NOT_FOUND:${recordId}`);

        const previousStaging = { ...stagingRecords[stageIndex] };
        const stagingRecord = { ...previousStaging };
        if (stagingRecord.validation_error_codes) {
            throw new Error(`RECORD_INVALID:${recordId}`);
        }
        if (stagingRecord.status === STATUSES.rejected) {
            throw new Error(`RECORD_REJECTED:${recordId}`);
        }

        const previousPublishedIndex = publishedRecords.findIndex(record => record.unit_code === stagingRecord.unit_code);
        const previousPublished = previousPublishedIndex >= 0 ? { ...publishedRecords[previousPublishedIndex] } : null;
        const publishedRecord = buildPublishedRecord(stagingRecord, reviewerEmail, isoNow);

        if (previousPublishedIndex >= 0) publishedRecords[previousPublishedIndex] = publishedRecord;
        else publishedRecords.push(publishedRecord);

        stagingRecord.status = STATUSES.approved;
        stagingRecord.reviewed_by = reviewerEmail;
        stagingRecord.reviewed_at = isoNow;
        stagingRecord.updated_at = isoNow;
        stagingRecord.review_note = note;
        stagingRecords[stageIndex] = stagingRecord;

        auditEntries.push(buildAuditEntry(AUDIT_ACTIONS.approve, {
            timestamp: isoNow,
            recordId,
            unitCode: stagingRecord.unit_code,
            actorEmail: reviewerEmail,
            submitterEmail: stagingRecord.submitter_email,
            previousStatus: previousStaging.status,
            nextStatus: STATUSES.approved,
            note,
            stagingSnapshot: stagingRecord,
            publishedSnapshot: { previous: previousPublished, next: publishedRecord },
        }));

        return { stagingRecords, publishedRecords, auditEntries };
    }

    function applyRejection(state, recordId, reviewerEmail, note = '', reviewedAt = new Date()) {
        const stagingRecords = cloneRecords(state.stagingRecords);
        const publishedRecords = cloneRecords(state.publishedRecords);
        const auditEntries = cloneRecords(state.auditEntries);
        const isoNow = asIsoString(reviewedAt);
        const stageIndex = stagingRecords.findIndex(record => record.record_id === recordId);
        if (stageIndex < 0) throw new Error(`RECORD_NOT_FOUND:${recordId}`);

        const previous = { ...stagingRecords[stageIndex] };
        const stagingRecord = {
            ...previous,
            status: STATUSES.rejected,
            reviewed_by: reviewerEmail,
            reviewed_at: isoNow,
            updated_at: isoNow,
            review_note: note,
        };
        stagingRecords[stageIndex] = stagingRecord;

        auditEntries.push(buildAuditEntry(AUDIT_ACTIONS.reject, {
            timestamp: isoNow,
            recordId,
            unitCode: stagingRecord.unit_code,
            actorEmail: reviewerEmail,
            submitterEmail: stagingRecord.submitter_email,
            previousStatus: previous.status,
            nextStatus: STATUSES.rejected,
            note,
            stagingSnapshot: stagingRecord,
            publishedSnapshot: null,
        }));

        return { stagingRecords, publishedRecords, auditEntries };
    }

    function applyRevocation(state, recordId, reviewerEmail, note = '', reviewedAt = new Date()) {
        const stagingRecords = cloneRecords(state.stagingRecords);
        const publishedRecords = cloneRecords(state.publishedRecords);
        const auditEntries = cloneRecords(state.auditEntries);
        const isoNow = asIsoString(reviewedAt);
        const publishedIndex = publishedRecords.findIndex(record => record.record_id === recordId);
        if (publishedIndex < 0) throw new Error(`PUBLISHED_RECORD_NOT_FOUND:${recordId}`);

        const removed = { ...publishedRecords[publishedIndex] };
        publishedRecords.splice(publishedIndex, 1);

        const stageIndex = stagingRecords.findIndex(record => record.record_id === recordId);
        let stagingSnapshot = null;
        let previousStatus = '';
        if (stageIndex >= 0) {
            previousStatus = stagingRecords[stageIndex].status;
            stagingSnapshot = {
                ...stagingRecords[stageIndex],
                status: STATUSES.revoked,
                reviewed_by: reviewerEmail,
                reviewed_at: isoNow,
                updated_at: isoNow,
                review_note: note,
            };
            stagingRecords[stageIndex] = stagingSnapshot;
        }

        auditEntries.push(buildAuditEntry(AUDIT_ACTIONS.revoke, {
            timestamp: isoNow,
            recordId,
            unitCode: removed.unit_code,
            actorEmail: reviewerEmail,
            submitterEmail: removed.submitter_email,
            previousStatus: previousStatus || removed.status,
            nextStatus: STATUSES.revoked,
            note,
            stagingSnapshot,
            publishedSnapshot: removed,
        }));

        return { stagingRecords, publishedRecords, auditEntries };
    }

    function extractSubmissionFromEvent(event, now = new Date()) {
        const namedValues = event?.namedValues || event || {};
        return normalizeSubmission({
            submittedAt: findNamedValue(namedValues, ['Timestamp', 'Thời gian', 'Thoi gian']) || now,
            submitterEmail: findNamedValue(namedValues, ['Email Address', 'Địa chỉ email', 'Địa chỉ Email', 'Username']),
            unitName: findNamedValue(namedValues, ['Tên Đơn vị', 'Tên đơn vị', 'Đơn vị', 'Don vi']),
            type: findNamedValue(namedValues, ['Loại địa điểm', 'Loại đơn vị', 'Loai dia diem']),
            address: findNamedValue(namedValues, ['Địa chỉ chi tiết hiện tại', 'Địa chỉ', 'Dia chi']),
            phone: findNamedValue(namedValues, ['Số điện thoại trực ban / liên hệ', 'Số điện thoại', 'So dien thoai']),
            coordinates: findNamedValue(namedValues, ['Link vị trí trên Google Maps', 'Google Maps', 'Tọa độ', 'Toa do']),
            imageUrl: findNamedValue(namedValues, ['Hình ảnh đại diện Trụ sở / Nơi làm việc', 'Hình ảnh', 'Link ảnh', 'Link anh']),
        }, now);
    }

    function getSpreadsheet() {
        if (typeof SpreadsheetApp === 'undefined') {
            throw new Error('SpreadsheetApp is not available outside Google Apps Script.');
        }
        return SpreadsheetApp.getActiveSpreadsheet();
    }

    function ensureSheet(spreadsheet, name, headers) {
        let sheet = spreadsheet.getSheetByName(name);
        if (!sheet) sheet = spreadsheet.insertSheet(name);
        if (headers && headers.length) {
            const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
            const mismatch = headers.some((header, index) => String(currentHeaders[index] || '') !== header);
            if (mismatch) {
                sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
                sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#e8eaed');
            }
        }
        return sheet;
    }

    function getSheetObjects(sheet) {
        const values = sheet.getDataRange().getValues();
        if (!values.length) return [];
        const headers = values[0].map(header => String(header || '').trim());
        return values.slice(1)
            .filter(row => row.some(cell => String(cell || '').trim() !== ''))
            .map(row => headers.reduce((record, header, index) => {
                record[header] = row[index];
                return record;
            }, {}));
    }

    function replaceSheetData(sheet, headers, rows) {
        sheet.clearContents();
        if (!headers.length) return;
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#e8eaed');
        if (!(rows || []).length) return;

        const values = rows.map(row => headers.map(header => row[header] ?? ''));
        sheet.getRange(2, 1, values.length, headers.length).setValues(values);
    }

    function appendRowObject(sheet, headers, record) {
        sheet.appendRow(headers.map(header => record[header] ?? ''));
    }

    function bootstrapLocationPipeline() {
        const spreadsheet = getSpreadsheet();
        ensureSheet(spreadsheet, SHEETS.allowlist, HEADERS.allowlist);
        ensureSheet(spreadsheet, SHEETS.staging, HEADERS.staging);
        ensureSheet(spreadsheet, SHEETS.published, HEADERS.published);
        ensureSheet(spreadsheet, SHEETS.audit, HEADERS.audit);
    }

    function readPipelineState(spreadsheet) {
        bootstrapLocationPipeline();
        return {
            stagingRecords: getSheetObjects(spreadsheet.getSheetByName(SHEETS.staging)),
            publishedRecords: getSheetObjects(spreadsheet.getSheetByName(SHEETS.published)),
            auditEntries: getSheetObjects(spreadsheet.getSheetByName(SHEETS.audit)),
            allowlistRows: getSheetObjects(spreadsheet.getSheetByName(SHEETS.allowlist)),
        };
    }

    function writePipelineState(spreadsheet, state) {
        replaceSheetData(spreadsheet.getSheetByName(SHEETS.staging), HEADERS.staging, state.stagingRecords);
        replaceSheetData(spreadsheet.getSheetByName(SHEETS.published), HEADERS.published, state.publishedRecords);
        replaceSheetData(spreadsheet.getSheetByName(SHEETS.audit), HEADERS.audit, state.auditEntries);
    }

    function getActorEmail() {
        if (typeof Session === 'undefined') return 'manual-admin';
        return Session.getActiveUser().getEmail() || 'manual-admin';
    }

    function promptForNote(title) {
        if (typeof SpreadsheetApp === 'undefined') return '';
        const ui = SpreadsheetApp.getUi();
        const result = ui.prompt(title, 'Nhập ghi chú (có thể để trống):', ui.ButtonSet.OK_CANCEL);
        if (result.getSelectedButton() !== ui.Button.OK) {
            throw new Error('ACTION_CANCELLED');
        }
        return result.getResponseText().trim();
    }

    function getSelectedRecordId(expectedSheetName) {
        const spreadsheet = getSpreadsheet();
        const sheet = spreadsheet.getActiveSheet();
        if (!sheet || sheet.getName() !== expectedSheetName) {
            throw new Error(`SELECT_${expectedSheetName.toUpperCase()}_ROW`);
        }
        const row = sheet.getActiveRange().getRow();
        if (row <= 1) throw new Error('HEADER_ROW_SELECTED');

        const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        const recordIdIndex = headers.findIndex(header => String(header || '').trim() === 'record_id');
        if (recordIdIndex < 0) throw new Error('RECORD_ID_HEADER_MISSING');

        return String(sheet.getRange(row, recordIdIndex + 1).getValue() || '').trim();
    }

    function onFormSubmit(event) {
        const spreadsheet = getSpreadsheet();
        bootstrapLocationPipeline();

        const allowlistRows = getSheetObjects(spreadsheet.getSheetByName(SHEETS.allowlist));
        const submission = extractSubmissionFromEvent(event, new Date());
        const stagingRecord = buildStagingRecord(submission, allowlistRows, new Date(), { suffix: 'form' });

        appendRowObject(spreadsheet.getSheetByName(SHEETS.staging), HEADERS.staging, stagingRecord);
        appendRowObject(spreadsheet.getSheetByName(SHEETS.audit), HEADERS.audit, buildAuditEntry(
            stagingRecord.status === STATUSES.pending ? AUDIT_ACTIONS.submit : AUDIT_ACTIONS.submitRejected,
            {
                timestamp: stagingRecord.updated_at,
                recordId: stagingRecord.record_id,
                unitCode: stagingRecord.unit_code,
                actorEmail: stagingRecord.submitter_email,
                submitterEmail: stagingRecord.submitter_email,
                previousStatus: '',
                nextStatus: stagingRecord.status,
                note: stagingRecord.validation_error_codes,
                stagingSnapshot: stagingRecord,
                publishedSnapshot: null,
            }
        ));
    }

    function approveSelectedStagingRow() {
        const spreadsheet = getSpreadsheet();
        const recordId = getSelectedRecordId(SHEETS.staging);
        const note = promptForNote('Phê duyệt bản ghi staging');
        const nextState = applyApproval(readPipelineState(spreadsheet), recordId, getActorEmail(), note, new Date());
        writePipelineState(spreadsheet, nextState);
    }

    function rejectSelectedStagingRow() {
        const spreadsheet = getSpreadsheet();
        const recordId = getSelectedRecordId(SHEETS.staging);
        const note = promptForNote('Từ chối bản ghi staging');
        const nextState = applyRejection(readPipelineState(spreadsheet), recordId, getActorEmail(), note, new Date());
        writePipelineState(spreadsheet, nextState);
    }

    function revokeSelectedPublishedRow() {
        const spreadsheet = getSpreadsheet();
        const recordId = getSelectedRecordId(SHEETS.published);
        const note = promptForNote('Thu hồi bản ghi công khai');
        const nextState = applyRevocation(readPipelineState(spreadsheet), recordId, getActorEmail(), note, new Date());
        writePipelineState(spreadsheet, nextState);
    }

    function onOpen() {
        if (typeof SpreadsheetApp === 'undefined') return;
        SpreadsheetApp.getUi()
            .createMenu('Bản đồ số')
            .addItem('Khởi tạo pipeline sheet', 'bootstrapLocationPipeline')
            .addSeparator()
            .addItem('Phê duyệt dòng staging đang chọn', 'approveSelectedStagingRow')
            .addItem('Từ chối dòng staging đang chọn', 'rejectSelectedStagingRow')
            .addItem('Thu hồi dòng published đang chọn', 'revokeSelectedPublishedRow')
            .addToUi();
    }

    return {
        SHEETS,
        HEADERS,
        STATUSES,
        AUDIT_ACTIONS,
        normalizeLabel,
        slugify,
        normalizeEmail,
        splitEmails,
        normalizeSubmission,
        extractSubmissionFromEvent,
        buildAllowlistMap,
        parseCoordinates,
        validateSubmission,
        buildStagingRecord,
        buildPublishedRecord,
        applyApproval,
        applyRejection,
        applyRevocation,
        bootstrapLocationPipeline,
        onFormSubmit,
        approveSelectedStagingRow,
        rejectSelectedStagingRow,
        revokeSelectedPublishedRow,
        onOpen,
    };
});
