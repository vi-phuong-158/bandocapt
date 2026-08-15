/*
 * Google Apps Script runtime template for the location intake workflow.
 * This file is bundled with setup/apps-script.js into dist/Code.gs. Do not
 * paste this file alone into Apps Script because it depends on LocationApprovalPipeline.
 */

const LOCATION_INTAKE = Object.freeze({
    formTitle: 'CẬP NHẬT ĐỊA ĐIỂM CÔNG AN TỈNH PHÚ THỌ',
    imageQuestion: 'Ảnh địa điểm',
    reviewActions: ['APPROVE', 'REJECT', 'NEED_VERIFICATION'],
    questions: {
        unit: 'Đơn vị Công an xã/phường', request: 'Nội dung đề nghị', target: 'Mã địa điểm đang có',
        senderName: 'Họ và tên cán bộ gửi', senderPhone: 'Số điện thoại cán bộ gửi',
        locationName: 'Tên hiển thị của địa điểm', siteType: 'Loại địa điểm', address: 'Địa chỉ đầy đủ',
        mapsUrl: 'Link Google Maps của địa điểm', publicPhone: 'Số điện thoại công khai của địa điểm',
        services: 'Các chức năng, dịch vụ tại địa điểm', cccdMode: 'Hình thức tiếp nhận căn cước',
        schedule: 'Lịch và thời gian tiếp nhận', servedUnits: 'Địa bàn hoặc đơn vị được phục vụ',
        aliases: 'Tên gọi khác để hỗ trợ tìm kiếm', note: 'Nội dung cần lưu ý',
    },
});

function locationPipeline_() {
    if (!globalThis.LocationApprovalPipeline) throw new Error('Thiếu LocationApprovalPipeline. Hãy dùng setup/location-intake/dist/Code.gs.');
    return globalThis.LocationApprovalPipeline;
}

function locationProperties_() {
    return PropertiesService.getScriptProperties();
}

function configuredSpreadsheet_() {
    const id = locationProperties_().getProperty('LOCATION_SPREADSHEET_ID');
    if (!id) throw new Error('Chưa chạy setupLocationIntakeSystem.');
    return SpreadsheetApp.openById(id);
}

function gatewayRequiredProperty_(name) {
    const value = locationProperties_().getProperty(name);
    if (!value) throw new Error(`GATEWAY_PROPERTY_MISSING:${name}`);
    return String(value).trim();
}

function gatewayPrivateSpreadsheet_() {
    if (!globalThis.LocationWorkbookConfig) throw new Error('LOCATION_WORKBOOK_CONFIG_UNAVAILABLE');
    const props = locationProperties_();
    const config = globalThis.LocationWorkbookConfig.resolvePrivateLocationWorkbook({
        PRIVATE_LOCATION_SPREADSHEET_ID: props.getProperty('PRIVATE_LOCATION_SPREADSHEET_ID'),
        PUBLIC_LOCATION_SPREADSHEET_ID: props.getProperty('PUBLIC_LOCATION_SPREADSHEET_ID'),
        GOOGLE_SHEET_ID: props.getProperty('GOOGLE_SHEET_ID'),
    });
    return SpreadsheetApp.openById(config.spreadsheetId);
}

function adminPublicSpreadsheet_() {
    if (!globalThis.LocationWorkbookConfig) throw new Error('LOCATION_WORKBOOK_CONFIG_UNAVAILABLE');
    const props = locationProperties_();
    const config = globalThis.LocationWorkbookConfig.resolvePublicLocationWorkbook({
        PUBLIC_LOCATION_SPREADSHEET_ID: props.getProperty('PUBLIC_LOCATION_SPREADSHEET_ID'),
        GOOGLE_SHEET_ID: props.getProperty('GOOGLE_SHEET_ID'),
        PRIVATE_LOCATION_SPREADSHEET_ID: props.getProperty('PRIVATE_LOCATION_SPREADSHEET_ID'),
    });
    return SpreadsheetApp.openById(config.spreadsheetId);
}

// Admin review chỉ đọc email hiệu lực của người đang mở Sheet + Script Property allowlist —
// KHÔNG coi "mở được Sheet" là đủ quyền. Fail closed khi property rỗng hoặc email không khớp.
function requireLocationApprover_() {
    if (!globalThis.LocationAdminReview) throw new Error('Thiếu LocationAdminReview. Hãy dùng setup/location-intake/dist/Code.gs.');
    const csv = locationProperties_().getProperty('LOCATION_APPROVER_EMAILS');
    if (!csv) throw new Error('LOCATION_APPROVER_CONFIG_MISSING');
    const email = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
    if (!email || !globalThis.LocationAdminReview.isApprover(email, csv)) throw new Error('LOCATION_APPROVER_NOT_AUTHORIZED');
    return email;
}

function gatewaySheet_(spreadsheet, sheetName, headers) {
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) throw new Error(`PRIVATE_SHEET_MISSING:${sheetName}`);
    const existing = locationHeaders_(sheet);
    if (headers.some(header => !existing.includes(header))) throw new Error(`PRIVATE_SHEET_SCHEMA_MISMATCH:${sheetName}`);
    return sheet;
}

function gatewayRows_(spreadsheet, sheetName, headers) {
    return readLocationObjects_(gatewaySheet_(spreadsheet, sheetName, headers));
}

function gatewayAppend_(spreadsheet, sheetName, headers, record) {
    const sheet = gatewaySheet_(spreadsheet, sheetName, headers);
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length).setValues([headers.map(header => record[header] == null ? '' : record[header])]);
}

// Đọc/ghi đúng MỘT dòng theo cột khoá — admin review không được clearContents() cả sheet
// (xem replaceLocationSheet_) vì thao tác chọn một dòng để duyệt chỉ nên đổi đúng dòng đó.
function adminFindRowNumber_(sheet, headers, columnName, value) {
    const columnIndex = headers.indexOf(columnName);
    if (columnIndex < 0 || sheet.getLastRow() < 2) return -1;
    const values = sheet.getRange(2, columnIndex + 1, sheet.getLastRow() - 1, 1).getValues();
    const offset = values.findIndex(row => String(row[0] || '').trim() === String(value || '').trim());
    return offset < 0 ? -1 : offset + 2;
}

function adminUpdateRow_(sheet, headers, rowNumber, patch) {
    const current = {};
    sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0].forEach((value, index) => { current[headers[index]] = value; });
    const merged = Object.assign(current, patch);
    sheet.getRange(rowNumber, 1, 1, headers.length).setValues([headers.map(header => (merged[header] == null ? '' : merged[header]))]);
}

function adminPrivateStore_(spreadsheet) {
    const pipeline = locationPipeline_();
    const stagingHeaders = pipeline.HEADERS.staging;
    const auditHeaders = pipeline.HEADERS.audit;
    return {
        getStagingRows: () => gatewayRows_(spreadsheet, pipeline.SHEETS.staging, stagingHeaders),
        getAuditRows: () => gatewayRows_(spreadsheet, pipeline.SHEETS.audit, auditHeaders),
        updateStagingRow: (requestId, patch) => {
            const sheet = gatewaySheet_(spreadsheet, pipeline.SHEETS.staging, stagingHeaders);
            const headers = locationHeaders_(sheet);
            const rowNumber = adminFindRowNumber_(sheet, headers, 'request_id', requestId);
            if (rowNumber < 0) throw new Error('REQUEST_NOT_FOUND');
            adminUpdateRow_(sheet, headers, rowNumber, patch);
        },
        appendAuditRow: record => gatewayAppend_(spreadsheet, pipeline.SHEETS.audit, auditHeaders, record),
    };
}

function adminPublicStore_(spreadsheet) {
    const pipeline = locationPipeline_();
    const headers = pipeline.HEADERS.published;
    return {
        findById: recordId => gatewayRows_(spreadsheet, pipeline.SHEETS.published, headers)
            .find(row => String(row.record_id || '') === String(recordId || '')) || null,
        upsert: record => {
            const sheet = gatewaySheet_(spreadsheet, pipeline.SHEETS.published, headers);
            const rowHeaders = locationHeaders_(sheet);
            const rowNumber = adminFindRowNumber_(sheet, rowHeaders, 'record_id', record.record_id);
            if (rowNumber < 0) gatewayAppend_(spreadsheet, pipeline.SHEETS.published, headers, record);
            else adminUpdateRow_(sheet, rowHeaders, rowNumber, record);
        },
        remove: recordId => {
            const sheet = gatewaySheet_(spreadsheet, pipeline.SHEETS.published, headers);
            const rowHeaders = locationHeaders_(sheet);
            const rowNumber = adminFindRowNumber_(sheet, rowHeaders, 'record_id', recordId);
            if (rowNumber >= 0) sheet.deleteRow(rowNumber);
        },
    };
}

function adminSpreadsheets_() {
    return { private: gatewayPrivateSpreadsheet_(), public: adminPublicSpreadsheet_() };
}

function adminReviewEngine_(spreadsheets) {
    if (!globalThis.LocationAdminReview) throw new Error('Thiếu LocationAdminReview. Hãy dùng setup/location-intake/dist/Code.gs.');
    return globalThis.LocationAdminReview.createLocationAdminReview({
        pipeline: locationPipeline_(),
        workbookConfig: globalThis.LocationWorkbookConfig,
        runtime: {
            now: () => Date.now(),
            withLock: callback => {
                const lock = LockService.getScriptLock();
                lock.waitLock(30000);
                try { return callback(); } finally { lock.releaseLock(); }
            },
            setImagePublic: fileId => setImagePublic_(fileId),
            revokeImagePublic: fileId => revokeImagePublic_(fileId),
        },
        privateStore: adminPrivateStore_(spreadsheets.private),
        publicStore: adminPublicStore_(spreadsheets.public),
    });
}

function gatewayLedgerStore_(spreadsheet) {
    const pipeline = locationPipeline_();
    const headers = pipeline.HEADERS.ledger;
    function rows() { return gatewayRows_(spreadsheet, pipeline.SHEETS.ledger, headers); }
    function find(requestId) { return rows().find(row => String(row.request_id || '') === String(requestId || '')) || null; }
    function update(requestId, patch) {
        const sheet = gatewaySheet_(spreadsheet, pipeline.SHEETS.ledger, headers);
        const values = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 0), headers.length).getValues();
        const requestColumn = headers.indexOf('request_id');
        const rowIndex = values.findIndex(row => String(row[requestColumn] || '') === String(requestId || ''));
        if (rowIndex < 0) throw new Error('IDEMPOTENCY_LEDGER_ENTRY_MISSING');
        const row = rowIndex + 2;
        const current = {};
        headers.forEach((header, index) => { current[header] = values[rowIndex][index]; });
        const merged = Object.assign(current, patch, { updated_at: patch.updated_at || new Date().toISOString() });
        sheet.getRange(row, 1, 1, headers.length).setValues([headers.map(header => merged[header] == null ? '' : merged[header])]);
        return merged;
    }
    function create(record) { gatewayAppend_(spreadsheet, pipeline.SHEETS.ledger, headers, record); }
    return { find, update, create };
}

function gatewayBytesToHex_(bytes) {
    return (bytes || []).map(value => (Number(value) & 255).toString(16).padStart(2, '0')).join('');
}

function gatewayUtf8Bytes_(value) {
    return Utilities.newBlob(String(value == null ? '' : value), 'application/octet-stream').getBytes();
}

function gatewayRuntime_(spreadsheet) {
    const props = locationProperties_();
    const ledger = gatewayLedgerStore_(spreadsheet);
    const pipeline = locationPipeline_();
    const imageFolderId = props.getProperty('STAFF_GATEWAY_IMAGE_FOLDER_ID');
    return {
        env: {
            PRIVATE_LOCATION_SPREADSHEET_ID: props.getProperty('PRIVATE_LOCATION_SPREADSHEET_ID'),
            PUBLIC_LOCATION_SPREADSHEET_ID: props.getProperty('PUBLIC_LOCATION_SPREADSHEET_ID'),
            GOOGLE_SHEET_ID: props.getProperty('GOOGLE_SHEET_ID'),
        },
        getSecret: () => props.getProperty('LOCATION_GATEWAY_SECRET') || '',
        now: () => Date.now(),
        decodeBase64: value => Utilities.base64Decode(value),
        sha256Hex: value => gatewayBytesToHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, gatewayUtf8Bytes_(value))),
        hmacSha256Hex: (message, secret) => gatewayBytesToHex_(Utilities.computeHmacSha256Signature(gatewayUtf8Bytes_(message), gatewayUtf8Bytes_(secret))),
        withLock: callback => {
            const lock = LockService.getScriptLock();
            lock.waitLock(30000);
            try { return callback(); } finally { lock.releaseLock(); }
        },
        store: null,
        getLedger: ledger,
        imageFolderId,
        pipeline,
    };
}

function gatewayStore_(spreadsheet, runtime) {
    const pipeline = locationPipeline_();
    const ledger = runtime.getLedger;
    const stagingHeaders = pipeline.HEADERS.staging;
    const auditHeaders = pipeline.HEADERS.audit;
    const verificationHeaders = pipeline.HEADERS.verificationAudit;
    const publishedRecords = () => gatewayRows_(spreadsheet, pipeline.SHEETS.staging, stagingHeaders)
        .filter(row => String(row.status || '') === pipeline.STATUSES.approved && String(row.record_id || '').trim())
        .map(row => Object.assign({}, row, { name: row.location_name, coordinates: row.coordinates }));
    function privateFolder() {
        if (!runtime.imageFolderId) throw new Error('GATEWAY_PROPERTY_MISSING:STAFF_GATEWAY_IMAGE_FOLDER_ID');
        return DriveApp.getFolderById(runtime.imageFolderId);
    }
    return {
        getRows: sheet => {
            const headers = sheet === pipeline.SHEETS.allowlist ? pipeline.HEADERS.allowlist
                : sheet === pipeline.SHEETS.staging ? stagingHeaders
                    : sheet === pipeline.SHEETS.audit ? auditHeaders : sheet === pipeline.SHEETS.verificationAudit ? verificationHeaders : pipeline.HEADERS.ledger;
            return gatewayRows_(spreadsheet, sheet, headers);
        },
        findLedger: ledger.find,
        createLedger: ledger.create,
        updateLedger: ledger.update,
        getOperationalRecords: publishedRecords,
        findStagingByRequestId: requestId => gatewayRows_(spreadsheet, pipeline.SHEETS.staging, stagingHeaders).find(row => String(row.request_id || '') === String(requestId || '')) || null,
        appendStaging: record => gatewayAppend_(spreadsheet, pipeline.SHEETS.staging, stagingHeaders, record),
        hasApprovalAudit: requestId => gatewayRows_(spreadsheet, pipeline.SHEETS.audit, auditHeaders).some(row => String(row.request_id || '') === String(requestId || '') && String(row.action || '') === 'FORM_SUBMIT'),
        appendApprovalAudit: record => gatewayAppend_(spreadsheet, pipeline.SHEETS.audit, auditHeaders, record),
        findVerificationEvent: operationId => gatewayRows_(spreadsheet, pipeline.SHEETS.verificationAudit, verificationHeaders).find(row => String(row.operation_id || '') === String(operationId || '')) || null,
        appendVerificationAudit: record => gatewayAppend_(spreadsheet, pipeline.SHEETS.verificationAudit, verificationHeaders, record),
        findDriveResource: resourceKey => {
            const files = privateFolder().getFilesByName(String(resourceKey));
            while (files.hasNext()) {
                const file = files.next();
                if (file.getDescription() === String(resourceKey)) return { fileId: file.getId(), driveUrl: file.getUrl(), mimeType: file.getMimeType() };
            }
            return null;
        },
        createPrivateImage: input => {
            const file = privateFolder().createFile(Utilities.newBlob(input.bytes, input.mimeType, String(input.resourceKey)));
            file.setName(String(input.resourceKey));
            file.setDescription(String(input.resourceKey));
            file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
            return { fileId: file.getId(), driveUrl: file.getUrl(), mimeType: file.getMimeType() };
        },
    };
}

function gatewayMetadata_(event) {
    const headers = event && event.headers || {};
    const parameters = event && event.parameter || {};
    function value(names) {
        for (const name of names) {
            const found = Object.keys(headers).find(key => String(key).toLowerCase() === name.toLowerCase());
            if (found && headers[found] != null) return Array.isArray(headers[found]) ? headers[found][0] : headers[found];
            if (parameters[name] != null) return Array.isArray(parameters[name]) ? parameters[name][0] : parameters[name];
        }
        return '';
    }
    return { timestamp: value(['X-Location-Timestamp', 'timestamp']), signature: value(['X-Location-Signature', 'signature']) };
}

function gatewayOutput_(payload) {
    return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(event) {
    try {
        const rawBody = event && event.postData ? String(event.postData.contents || '') : '';
        // Verify raw bytes and freshness before opening the private workbook or parsing JSON.
        const securityRuntime = gatewayRuntime_(null);
        const securityGateway = globalThis.StaffLocationGateway({ pipeline: locationPipeline_(), workbookConfig: globalThis.LocationWorkbookConfig, runtime: securityRuntime, store: {} });
        const verified = securityGateway.verifyRequest(rawBody, gatewayMetadata_(event));
        let body;
        try { body = JSON.parse(verified.rawBody); } catch (_) { const error = new Error('REQUEST_JSON_INVALID'); error.code = 'REQUEST_JSON_INVALID'; throw error; }
        if (!body || typeof body !== 'object' || Array.isArray(body)) { const error = new Error('REQUEST_JSON_INVALID'); error.code = 'REQUEST_JSON_INVALID'; throw error; }
        securityGateway.assertAction(body);
        const spreadsheet = gatewayPrivateSpreadsheet_();
        const runtime = gatewayRuntime_(spreadsheet);
        runtime.store = gatewayStore_(spreadsheet, runtime);
        const gateway = globalThis.StaffLocationGateway({ pipeline: locationPipeline_(), workbookConfig: globalThis.LocationWorkbookConfig, runtime, store: runtime.store });
        const result = gateway.dispatch(body);
        return gatewayOutput_({ ok: true, data: result });
    } catch (error) {
        const code = error && error.code ? error.code : 'GATEWAY_REQUEST_REJECTED';
        return gatewayOutput_({ ok: false, error: { code } });
    }
}

function requiredProperty_(name) {
    const value = locationProperties_().getProperty(name);
    if (!value) throw new Error(`Thiếu Script Property ${name}.`);
    return value;
}

function ensureLocationSheet_(spreadsheet, name, headers) {
    let sheet = spreadsheet.getSheetByName(name);
    if (!sheet) sheet = spreadsheet.insertSheet(name);
    const existing = sheet.getLastColumn() ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map(String) : [];
    const missing = headers.filter(header => !existing.includes(header));
    if (!existing.filter(Boolean).length) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    else if (missing.length) sheet.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).setFontWeight('bold').setBackground('#0f766e').setFontColor('#ffffff');
    return sheet;
}

function locationHeaders_(sheet) {
    return sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getDisplayValues()[0].map(value => String(value || '').trim());
}

function readLocationObjects_(sheet) {
    if (!sheet || sheet.getLastRow() < 2) return [];
    const headers = locationHeaders_(sheet);
    return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues().map(values => {
        const record = {};
        headers.forEach((header, index) => { record[header] = values[index]; });
        return record;
    }).filter(record => Object.values(record).some(value => String(value || '').trim()));
}

function replaceLocationSheet_(sheet, headers, records) {
    sheet.clearContents();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#0f766e').setFontColor('#ffffff');
    if (records.length) sheet.getRange(2, 1, records.length, headers.length).setValues(records.map(record => headers.map(header => record[header] || '')));
}

function appendLocationObject_(sheet, record) {
    const headers = locationHeaders_(sheet);
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length).setValues([headers.map(header => record[header] || '')]);
}

function writeLocationState_(spreadsheet, state) {
    const pipeline = locationPipeline_();
    replaceLocationSheet_(spreadsheet.getSheetByName(pipeline.SHEETS.staging), pipeline.HEADERS.staging, state.stagingRecords);
    replaceLocationSheet_(spreadsheet.getSheetByName(pipeline.SHEETS.published), pipeline.HEADERS.published, state.publishedRecords);
    replaceLocationSheet_(spreadsheet.getSheetByName(pipeline.SHEETS.audit), pipeline.HEADERS.audit, state.auditEntries);
}

function readLocationState_(spreadsheet) {
    const pipeline = locationPipeline_();
    return {
        stagingRecords: readLocationObjects_(spreadsheet.getSheetByName(pipeline.SHEETS.staging)),
        publishedRecords: readLocationObjects_(spreadsheet.getSheetByName(pipeline.SHEETS.published)),
        auditEntries: readLocationObjects_(spreadsheet.getSheetByName(pipeline.SHEETS.audit)),
    };
}

function setupLocationIntakeSystem() {
    const pipeline = locationPipeline_();
    // Chạy qua Apps Script API (clasp run) không có bảng đang mở; rơi về LOCATION_SPREADSHEET_ID.
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet()
        || (locationProperties_().getProperty('LOCATION_SPREADSHEET_ID') ? configuredSpreadsheet_() : null);
    if (!spreadsheet) throw new Error('Hãy chạy từ Google Sheet quản trị, hoặc đặt Script Property LOCATION_SPREADSHEET_ID.');
    requiredProperty_('TEMPLATE_FORM_ID');
    requiredProperty_('DESTINATION_FOLDER_ID');
    // Gateway-only audit/ledger sheets belong to the future PRIVATE workbook. Do not create them in
    // the legacy Form workbook while Production remains on the compatibility runtime.
    ['allowlist', 'staging', 'published', 'audit'].forEach(key => ensureLocationSheet_(spreadsheet, pipeline.SHEETS[key], pipeline.HEADERS[key]));
    ensureLocationSheet_(spreadsheet, pipeline.SHEETS.info, ['key', 'value', 'note']);
    const form = buildLocationForm_(spreadsheet);
    // KHÔNG dùng deleteAllOthers=true: cờ đó xoá luôn TEMPLATE_FORM_ID và DESTINATION_FOLDER_ID,
    // mà DESTINATION_FOLDER_ID còn cần mỗi lần nhận Form để chuyển ảnh (xem uploadedImage_).
    locationProperties_().setProperties({
        LOCATION_SPREADSHEET_ID: spreadsheet.getId(), LOCATION_FORM_ID: form.getId(),
        LOCATION_FORM_PUBLIC_URL: form.getPublishedUrl(), LOCATION_FORM_EDIT_URL: form.getEditUrl(),
    });
    installLocationTriggers_(form, spreadsheet);
    writeLocationSetupInfo_(spreadsheet, form);
    SpreadsheetApp.flush();
}

function buildLocationForm_(spreadsheet) {
    const templateFile = DriveApp.getFileById(requiredProperty_('TEMPLATE_FORM_ID'));
    const copy = templateFile.makeCopy(`${LOCATION_INTAKE.formTitle} - ${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss')}`);
    const form = FormApp.openById(copy.getId());
    const normalizeTitle_ = value => String(value == null ? '' : value).normalize('NFC').trim();
    const uploads = form.getItems(FormApp.ItemType.FILE_UPLOAD);
    const upload = uploads.find(item => normalizeTitle_(item.getTitle()) === normalizeTitle_(LOCATION_INTAKE.imageQuestion));
    if (uploads.length !== 1 || !upload) {
        const found = uploads.map(item => `“${item.getTitle()}”`).join(', ') || '(không có câu tải tệp nào)';
        copy.setTrashed(true);
        throw new Error(`Form mẫu phải có đúng một câu tải tệp tên “Ảnh địa điểm”. Thực tế: ${uploads.length} câu tải tệp — ${found}.`);
    }
    form.getItems().forEach(item => { if (item.getId() !== upload.getId()) form.deleteItem(item); });
    // Đưa tiêu đề về đúng dạng canonical để submit-time answers.get(imageQuestion) luôn khớp.
    upload.setTitle(LOCATION_INTAKE.imageQuestion);
    // Google Forms tạo bằng copy khởi đầu ở trạng thái CHƯA publish; setAcceptingResponses và
    // getPublishedUrl sẽ ném "Operation not supported on unpublished form" cho tới khi publish.
    // setPublished chỉ có ở runtime Forms mới nên feature-detect trước khi gọi.
    try { if (typeof form.setPublished === 'function') form.setPublished(true); } catch (_) {}
    form.setTitle(LOCATION_INTAKE.formTitle).setCollectEmail(true).setAllowResponseEdits(true)
        .setLimitOneResponsePerUser(false).setShuffleQuestions(false)
        .setDescription('Biểu mẫu nội bộ. Mỗi lần gửi tương ứng một địa điểm vật lý.')
        .setConfirmationMessage('Đã tiếp nhận. Dữ liệu chỉ hiển thị sau khi được phê duyệt.');
    addLocationFormQuestions_(form, spreadsheet);
    form.moveItem(upload, form.getItems().length - 1);
    try { form.removeDestination(); } catch (_) {}
    form.setDestination(FormApp.DestinationType.SPREADSHEET, spreadsheet.getId());
    // Đặt publish + accepting SAU CÙNG: dưới mô hình publish mới, thêm câu hỏi/đổi destination
    // có thể đảo form về "không nhận phản hồi". Khẳng định lại sau mọi mutation.
    try { if (typeof form.setPublished === 'function') form.setPublished(true); } catch (_) {}
    form.setAcceptingResponses(true);
    return form;
}

function addLocationFormQuestions_(form, spreadsheet) {
    const pipeline = locationPipeline_();
    const units = readLocationObjects_(spreadsheet.getSheetByName(pipeline.SHEETS.allowlist)).filter(row => pipeline.normalizeBoolean(row.active))
        .map(row => String(row.unit_name || '').trim()).filter(Boolean).sort((a, b) => a.localeCompare(b, 'vi'));
    if (!units.length) throw new Error('Unit_Allowlist chưa có đơn vị hoạt động.');
    const q = LOCATION_INTAKE.questions;
    form.addListItem().setTitle(q.unit).setChoiceValues(units).setRequired(true);
    form.addTextItem().setTitle(q.senderName).setRequired(true);
    form.addTextItem().setTitle(q.senderPhone).setRequired(true);
    form.addMultipleChoiceItem().setTitle(q.request).setChoiceValues(Object.values(pipeline.REQUEST_TYPES)).setRequired(true);
    form.addTextItem().setTitle(q.target).setHelpText('Bắt buộc khi cập nhật, báo sai, ngừng hoạt động hoặc xác nhận.');
    form.addTextItem().setTitle(q.locationName).setRequired(true);
    form.addListItem().setTitle(q.siteType).setChoiceValues(['HEADQUARTERS', 'SECONDARY_OFFICE', 'CITIZEN_ID_POINT', 'MOBILE_POINT', 'PUBLIC_SERVICE_CENTER', 'OTHER']).setRequired(true);
    form.addParagraphTextItem().setTitle(q.address).setRequired(true);
    form.addTextItem().setTitle(q.mapsUrl).setRequired(true);
    form.addTextItem().setTitle(q.publicPhone);
    form.addCheckboxItem().setTitle(q.services).setChoiceValues(['POLICE_OFFICE', 'CITIZEN_ID', 'E_IDENTIFICATION', 'RESIDENCE', 'VEHICLE_REGISTRATION', 'DUTY', 'CRIME_REPORT', 'OTHER']).setRequired(true);
    form.addListItem().setTitle(q.cccdMode).setChoiceValues(['NOT_PROVIDED', 'PERMANENT', 'SCHEDULED', 'CAMPAIGN', 'MOBILE', 'TEMPORARILY_PAUSED', 'UNKNOWN']).setRequired(true);
    form.addParagraphTextItem().setTitle(q.schedule);
    form.addParagraphTextItem().setTitle(q.servedUnits);
    form.addTextItem().setTitle(q.aliases);
    form.addParagraphTextItem().setTitle(q.note);
}

function installLocationTriggers_(form, spreadsheet) {
    ['onLocationFormSubmit', 'onLocationStagingEdit'].forEach(name => ScriptApp.getProjectTriggers().filter(trigger => trigger.getHandlerFunction() === name).forEach(trigger => ScriptApp.deleteTrigger(trigger)));
    ScriptApp.newTrigger('onLocationFormSubmit').forForm(form).onFormSubmit().create();
    ScriptApp.newTrigger('onLocationStagingEdit').forSpreadsheet(spreadsheet).onEdit().create();
}

function answerMap_(response) {
    const answers = new Map();
    response.getItemResponses().forEach(itemResponse => answers.set(itemResponse.getItem().getTitle(), itemResponse.getResponse()));
    return answers;
}

function answer_(answers, title) {
    const value = answers.get(title);
    return Array.isArray(value) ? value.map(String).join('|') : String(value || '').trim();
}

function arrayAnswer_(answers, title) {
    const value = answers.get(title);
    return Array.isArray(value) ? value.map(String).filter(Boolean) : String(value || '').split('|').filter(Boolean);
}

function resolveGoogleMapsUrl_(value) {
    let url = String(value || '').trim();
    for (let attempt = 0; attempt < 8 && url; attempt += 1) {
        try {
            const response = UrlFetchApp.fetch(url, { followRedirects: false, muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' } });
            const location = response.getAllHeaders().Location || response.getAllHeaders().location;
            if (response.getResponseCode() >= 300 && response.getResponseCode() < 400 && location) { url = String(location); continue; }
            return url;
        } catch (_) { return url; }
    }
    return url;
}

function uploadedImage_(answers, unitCode, locationName, requestId) {
    const uploadValue = answers.get(LOCATION_INTAKE.imageQuestion);
    const ids = Array.isArray(uploadValue) ? uploadValue.map(String).filter(Boolean) : (uploadValue ? [String(uploadValue)] : []);
    const image = locationPipeline_().validateImageSubmission((ids || []).map(id => ({ mimeType: DriveApp.getFileById(id).getMimeType() })));
    if (!image.ok) return { ok: false, error: image.error };
    try {
        const file = DriveApp.getFileById(ids[0]);
        const mimeType = file.getMimeType();
        if (!locationPipeline_().validateImageMimeType(mimeType)) return { ok: false, error: 'IMAGE_MIME_NOT_ALLOWED' };
        const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' }[mimeType] || 'img';
        file.setName(`${locationPipeline_().slugify(unitCode).toUpperCase()}_${locationPipeline_().slugify(locationName).toUpperCase()}_${locationPipeline_().slugify(requestId).toUpperCase()}.${extension}`);
        file.moveTo(DriveApp.getFolderById(requiredProperty_('DESTINATION_FOLDER_ID')));
        return { ok: true, fileId: file.getId(), driveUrl: file.getUrl(), mimeType };
    } catch (error) { return { ok: false, error: 'IMAGE_MOVE_FAILED' }; }
}

function onLocationFormSubmit(event) {
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
        const pipeline = locationPipeline_();
        const spreadsheet = configuredSpreadsheet_();
        const answers = answerMap_(event.response);
        const q = LOCATION_INTAKE.questions;
        const response = event.response;
        const requestId = `REQ_${response.getId() || Utilities.getUuid()}`;
        const unitName = answer_(answers, q.unit);
        const submission = {
            requestId, requestType: answer_(answers, q.request), targetRecordId: answer_(answers, q.target),
            unitName, submitterEmail: response.getRespondentEmail(), submitterName: answer_(answers, q.senderName), submitterPhone: answer_(answers, q.senderPhone),
            locationName: answer_(answers, q.locationName), siteType: answer_(answers, q.siteType), address: answer_(answers, q.address),
            mapsUrlOriginal: answer_(answers, q.mapsUrl), publicPhone: answer_(answers, q.publicPhone), services: arrayAnswer_(answers, q.services),
            cccdServiceMode: answer_(answers, q.cccdMode), serviceSchedule: answer_(answers, q.schedule), servedUnits: answer_(answers, q.servedUnits),
            searchAliases: answer_(answers, q.aliases), reviewNote: answer_(answers, q.note), submittedAt: response.getTimestamp(),
        };
        submission.mapsUrlResolved = resolveGoogleMapsUrl_(submission.mapsUrlOriginal);
        const authorization = pipeline.authorizeSubmission(unitName, submission.submitterEmail, readLocationObjects_(spreadsheet.getSheetByName(pipeline.SHEETS.allowlist)));
        if (authorization.authorized) {
            const image = uploadedImage_(answers, authorization.unitCode, submission.locationName, requestId);
            if (image.ok) Object.assign(submission, { imageFileId: image.fileId, imageDriveUrl: image.driveUrl, imageMimeType: image.mimeType });
        }
        const state = readLocationState_(spreadsheet);
        const record = pipeline.buildStagingRecord(submission, readLocationObjects_(spreadsheet.getSheetByName(pipeline.SHEETS.allowlist)), new Date(), { publishedRecords: state.publishedRecords });
        appendLocationObject_(spreadsheet.getSheetByName(pipeline.SHEETS.staging), record);
        appendLocationObject_(spreadsheet.getSheetByName(pipeline.SHEETS.audit), pipeline.buildAuditEntry('FORM_SUBMIT', { timestamp: record.updated_at, recordId: record.record_id, requestId: record.request_id, unitCode: record.unit_code, actorEmail: record.submitter_email, submitterEmail: record.submitter_email, nextStatus: record.status, note: record.validation_errors || record.warnings, snapshot: record }));
    } finally { lock.releaseLock(); }
}

function setImagePublic_(fileId) {
    const file = DriveApp.getFileById(fileId);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return `https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}`;
}

function revokeImagePublic_(fileId) {
    if (!fileId) return;
    DriveApp.getFileById(fileId).setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
}

function reviewLocationRequest_(requestId, action, reviewerEmail) {
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
        const spreadsheet = configuredSpreadsheet_();
        let state = readLocationState_(spreadsheet);
        const row = state.stagingRecords.find(record => record.request_id === requestId);
        if (!row) throw new Error('Không tìm thấy yêu cầu cần duyệt.');
        if (action === 'APPROVE' && row.request_type !== locationPipeline_().REQUEST_TYPES.stop) {
            const imageUrl = setImagePublic_(row.image_file_id);
            row.image_public_url = imageUrl;
        }
        state = locationPipeline_().applyReviewAction(state, requestId, action, reviewerEmail, row.review_note || '', new Date());
        if (state.revokedImageFileId) revokeImagePublic_(state.revokedImageFileId);
        writeLocationState_(spreadsheet, state);
    } finally { lock.releaseLock(); }
}

function onLocationStagingEdit(event) {
    if (!event || !event.range) return;
    const pipeline = locationPipeline_();
    const sheet = event.range.getSheet();
    // An toàn dual-workbook: trigger single-workbook cũ này không được chạy trên PRIVATE workbook
    // (writeLocationState_ giả định Published_Locations/Approval_Audit_Log nằm chung một bảng tính
    // và sẽ clearContents() nhầm sheet của kiến trúc mới). Bỏ qua im lặng nếu trùng private ID.
    try {
        const privateId = locationProperties_().getProperty('PRIVATE_LOCATION_SPREADSHEET_ID');
        if (privateId && sheet.getParent().getId() === privateId) return;
    } catch (_) { /* misconfigured private ID không được chặn runtime legacy hợp lệ */ }
    if (sheet.getName() !== pipeline.SHEETS.staging || event.range.getRow() < 2) return;
    const actionColumn = locationHeaders_(sheet).indexOf('review_action') + 1;
    if (event.range.getColumn() !== actionColumn) return;
    const action = String(event.value || '').toUpperCase();
    if (!LOCATION_INTAKE.reviewActions.includes(action)) return;
    const requestColumn = locationHeaders_(sheet).indexOf('request_id') + 1;
    reviewLocationRequest_(String(sheet.getRange(event.range.getRow(), requestColumn).getValue() || ''), action, Session.getEffectiveUser().getEmail() || 'reviewer');
}

function approveSelectedLocationRequest() { reviewSelectedLocationRequest_('APPROVE'); }
function rejectSelectedLocationRequest() { reviewSelectedLocationRequest_('REJECT'); }
function verifySelectedLocationRequest() { reviewSelectedLocationRequest_('NEED_VERIFICATION'); }
function reviewSelectedLocationRequest_(action) {
    const spreadsheet = configuredSpreadsheet_();
    const sheet = spreadsheet.getActiveSheet();
    if (sheet.getName() !== locationPipeline_().SHEETS.staging || sheet.getActiveRange().getRow() < 2) throw new Error('Hãy chọn một dòng trong Location_Staging.');
    const requestColumn = locationHeaders_(sheet).indexOf('request_id') + 1;
    reviewLocationRequest_(String(sheet.getRange(sheet.getActiveRange().getRow(), requestColumn).getValue() || ''), action, Session.getEffectiveUser().getEmail() || 'reviewer');
}

function revokeSelectedPublishedLocation() {
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
        const spreadsheet = configuredSpreadsheet_(); const sheet = spreadsheet.getActiveSheet();
        if (sheet.getName() !== locationPipeline_().SHEETS.published || sheet.getActiveRange().getRow() < 2) throw new Error('Hãy chọn một dòng trong Published_Locations.');
        const recordColumn = locationHeaders_(sheet).indexOf('record_id') + 1;
        const result = locationPipeline_().applyRevocation(readLocationState_(spreadsheet), String(sheet.getRange(sheet.getActiveRange().getRow(), recordColumn).getValue() || ''), Session.getEffectiveUser().getEmail() || 'reviewer', 'Thu hồi thủ công', new Date());
        if (result.revokedImageFileId) revokeImagePublic_(result.revokedImageFileId);
        writeLocationState_(spreadsheet, result);
    } finally { lock.releaseLock(); }
}

// ---------------------------------------------------------------------------------------------
// Dual-workbook admin review (PRIVATE Location_Staging -> PUBLIC Published_Locations).
// Đây là lớp mỏng trên setup/location-admin-review.js: chỉ đọc dòng đang chọn, xác thực người
// duyệt, rồi giao toàn bộ transition/reconciliation cho engine đó. Xem docs/brain/03-decisions.md.
// ---------------------------------------------------------------------------------------------

function adminSelectedStagingRequestId_() {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const privateSpreadsheet = gatewayPrivateSpreadsheet_();
    if (!spreadsheet || spreadsheet.getId() !== privateSpreadsheet.getId()) {
        throw new Error('Hãy mở workbook riêng tư (private) chứa Location_Staging trước khi dùng menu này.');
    }
    const sheet = spreadsheet.getActiveSheet();
    if (sheet.getName() !== locationPipeline_().SHEETS.staging) throw new Error('Hãy chọn một dòng trong Location_Staging.');
    const row = sheet.getActiveRange().getRow();
    if (row < 2) throw new Error('Hãy chọn một dòng dữ liệu (không phải dòng tiêu đề).');
    const headers = locationHeaders_(sheet);
    const requestId = String(sheet.getRange(row, headers.indexOf('request_id') + 1).getValue() || '').trim();
    if (!requestId) throw new Error('REQUEST_ID_MISSING');
    return requestId;
}

function adminPromptNote_(ui, title) {
    const response = ui.prompt(title, 'Ghi chú (có thể để trống):', ui.ButtonSet.OK_CANCEL);
    if (response.getSelectedButton() !== ui.Button.OK) return null; // Cancel -> không mutate.
    return String(response.getResponseText() || '').trim();
}

function adminErrorMessage_(error) {
    const code = error && error.code;
    if (code === 'REQUEST_NOT_REVIEWABLE') return error.message;
    const messages = {
        ADMIN_REVIEW_RUNTIME_NOT_CONFIGURED: 'Thiếu cấu hình engine duyệt.',
        LOCATION_APPROVER_CONFIG_MISSING: 'Chưa cấu hình Script Property LOCATION_APPROVER_EMAILS.',
        LOCATION_APPROVER_NOT_AUTHORIZED: 'Tài khoản của bạn không có trong danh sách được phép duyệt.',
        REQUEST_ID_MISSING: 'Không đọc được request_id của dòng đã chọn.',
        REQUEST_NOT_FOUND: 'Không tìm thấy yêu cầu này trong Location_Staging.',
        RECORD_INVALID: 'Yêu cầu còn lỗi dữ liệu (validation_errors), không thể duyệt.',
        TARGET_RECORD_ID_MISSING: 'Yêu cầu thiếu mã bản ghi đích.',
        TARGET_RECORD_ID_NOT_FOUND: 'Không tìm thấy bản ghi công khai đang có để cập nhật/xoá.',
        TARGET_RECORD_UNIT_MISMATCH: 'Bản ghi công khai thuộc đơn vị khác — từ chối để tránh ghi đè chéo đơn vị.',
        CREATE_TARGET_RECORD_ID_NOT_ALLOWED: 'Yêu cầu "Thêm địa điểm mới" không được có mã bản ghi đích.',
        APPROVAL_PUBLIC_CONFLICT: 'Bản ghi công khai hiện có nội dung khác dữ liệu đang chờ duyệt — cần rà soát thủ công, không tự ghi đè.',
        IMAGE_SHARING_FAILED: 'Duyệt chưa hoàn tất: chưa công khai được ảnh. Hãy thử lại bằng "Đối soát / hoàn tất yêu cầu đã chọn".',
        IMAGE_SHARING_RUNTIME_UNAVAILABLE: 'Thiếu cấu hình để công khai ảnh.',
    };
    return (code && messages[code]) || (error && error.message) || String(error);
}

function adminReviewSelectedAction_(action) {
    const ui = SpreadsheetApp.getUi();
    try {
        const requestId = adminSelectedStagingRequestId_();
        const actorEmail = requireLocationApprover_();
        let note = '';
        if (action !== 'APPROVE') {
            const titles = { REJECT: 'Từ chối yêu cầu', NEED_VERIFICATION: 'Yêu cầu xác minh thêm' };
            const entered = adminPromptNote_(ui, titles[action] || action);
            if (entered === null) return; // Cancel -> không mutate.
            note = entered;
        }
        const engine = adminReviewEngine_(adminSpreadsheets_());
        const result = engine.reviewRequest({ requestId, action, actorEmail, note });
        const labels = { APPROVE: 'Đã duyệt', REJECT: 'Đã từ chối', NEED_VERIFICATION: 'Đã chuyển sang yêu cầu xác minh thêm' };
        const imageNote = result.imageRevokeError ? ' (Lưu ý: thu hồi chia sẻ ảnh chưa thành công, thử lại bằng "Đối soát".)' : '';
        ui.alert(`${labels[action] || action} yêu cầu ${requestId}.${imageNote}`);
    } catch (error) {
        ui.alert(adminErrorMessage_(error));
    }
}

function approveSelectedAdminRequest() { adminReviewSelectedAction_('APPROVE'); }
function rejectSelectedAdminRequest() { adminReviewSelectedAction_('REJECT'); }
function needVerificationSelectedAdminRequest() { adminReviewSelectedAction_('NEED_VERIFICATION'); }

function reconcileSelectedAdminRequest() {
    const ui = SpreadsheetApp.getUi();
    try {
        const requestId = adminSelectedStagingRequestId_();
        const actorEmail = requireLocationApprover_();
        const engine = adminReviewEngine_(adminSpreadsheets_());
        const result = engine.reconcileRequest({ requestId, actorEmail, note: 'Đối soát' });
        if (result.nothingToReconcile) { ui.alert(`Yêu cầu ${requestId} đang BLOCKED do lỗi dữ liệu — không có gì để đối soát.`); return; }
        const imageNote = result.imageRevokeError ? ' (Lưu ý: thu hồi chia sẻ ảnh chưa thành công, thử lại sau.)' : '';
        ui.alert(`Đã đối soát yêu cầu ${requestId} (trạng thái hiện tại: ${result.status}).${imageNote}`);
    } catch (error) {
        ui.alert(adminErrorMessage_(error));
    }
}

function adminSheetStatusLine_(spreadsheet, sheetName, headers) {
    try { gatewaySheet_(spreadsheet, sheetName, headers); return `✓ ${sheetName} exists/schema valid`; }
    catch (error) { return `✗ ${sheetName} exists/schema valid (${error.message})`; }
}

// Read-only. KHÔNG hiển thị workbook ID, HMAC secret hay session secret — chỉ trạng thái boolean.
function adminReviewStatus_() {
    const lines = [];
    try { requireLocationApprover_(); lines.push('✓ Admin authorized'); }
    catch (error) { lines.push(`✗ Admin authorized (${error.message})`); }

    let privateSpreadsheet = null;
    try { privateSpreadsheet = gatewayPrivateSpreadsheet_(); lines.push('✓ Private workbook configured'); }
    catch (error) { lines.push(`✗ Private workbook configured (${error.message})`); }

    let publicSpreadsheet = null;
    try { publicSpreadsheet = adminPublicSpreadsheet_(); lines.push('✓ Public workbook configured'); }
    catch (error) { lines.push(`✗ Public workbook configured (${error.message})`); }

    lines.push(privateSpreadsheet && publicSpreadsheet && privateSpreadsheet.getId() !== publicSpreadsheet.getId()
        ? '✓ Workbook IDs distinct' : '✗ Workbook IDs distinct');

    const pipeline = locationPipeline_();
    lines.push(privateSpreadsheet ? adminSheetStatusLine_(privateSpreadsheet, pipeline.SHEETS.staging, pipeline.HEADERS.staging) : '✗ Location_Staging exists/schema valid');
    lines.push(privateSpreadsheet ? adminSheetStatusLine_(privateSpreadsheet, pipeline.SHEETS.audit, pipeline.HEADERS.audit) : '✗ Approval_Audit_Log exists/schema valid');
    lines.push(publicSpreadsheet ? adminSheetStatusLine_(publicSpreadsheet, pipeline.SHEETS.published, pipeline.HEADERS.published) : '✗ Published_Locations exists/schema valid');
    return lines;
}

function healthCheckAdminReview() {
    SpreadsheetApp.getUi().alert(adminReviewStatus_().join('\n'));
}

function writeLocationSetupInfo_(spreadsheet, form) {
    const sheet = spreadsheet.getSheetByName(locationPipeline_().SHEETS.info);
    replaceLocationSheet_(sheet, ['key', 'value', 'note'], [
        { key: 'form_public_url', value: form.getPublishedUrl(), note: 'Gửi link này vào nhóm Zalo' },
        { key: 'form_edit_url', value: form.getEditUrl(), note: 'Link quản trị Form' },
        { key: 'spreadsheet_url', value: spreadsheet.getUrl(), note: 'Google Sheet xử lý dữ liệu' },
        { key: 'destination_folder_id', value: requiredProperty_('DESTINATION_FOLDER_ID'), note: 'Thư mục ảnh riêng tư trước khi duyệt' },
    ]);
}

function locationIntakeStatus_() {
    const spreadsheet = configuredSpreadsheet_(); const pipeline = locationPipeline_();
    const messages = Object.values(pipeline.SHEETS).map(name => `${spreadsheet.getSheetByName(name) ? '✓' : '✗'} ${name}`);
    messages.push(locationProperties_().getProperty('LOCATION_FORM_ID') ? '✓ Form đã cấu hình' : '✗ Chưa có Form');
    return messages;
}

function healthCheckLocationIntake() {
    SpreadsheetApp.getUi().alert(locationIntakeStatus_().join('\n'));
}

function onOpen() {
    SpreadsheetApp.getUi().createMenu('Bản đồ CA - Địa điểm')
        .addItem('Khởi tạo Form và pipeline', 'setupLocationIntakeSystem')
        .addSeparator().addItem('Duyệt yêu cầu đã chọn', 'approveSelectedLocationRequest')
        .addItem('Từ chối yêu cầu đã chọn', 'rejectSelectedLocationRequest')
        .addItem('Yêu cầu xác minh', 'verifySelectedLocationRequest')
        .addItem('Thu hồi địa điểm công khai', 'revokeSelectedPublishedLocation')
        .addSeparator().addItem('Kiểm tra hệ thống', 'healthCheckLocationIntake').addToUi();
    // Dual-workbook admin review — dành cho PRIVATE workbook (Location_Staging). Mỗi hành động tự
    // kiểm tra active spreadsheet trước khi chạy (xem adminSelectedStagingRequestId_).
    SpreadsheetApp.getUi().createMenu('Bản đồ CA - Duyệt địa điểm')
        .addItem('Duyệt yêu cầu đã chọn', 'approveSelectedAdminRequest')
        .addItem('Từ chối yêu cầu đã chọn', 'rejectSelectedAdminRequest')
        .addItem('Yêu cầu xác minh thêm', 'needVerificationSelectedAdminRequest')
        .addItem('Đối soát / hoàn tất yêu cầu đã chọn', 'reconcileSelectedAdminRequest')
        .addSeparator().addItem('Kiểm tra cấu hình duyệt', 'healthCheckAdminReview').addToUi();
}

// Entry point cho Apps Script API (`clasp run`): không chạm UI, trả giá trị để kiểm chứng
// tự động. Dùng cho smoke test trên tài nguyên test, không thay thế luồng duyệt bằng menu.
function apiHealthCheckLocationIntake() {
    return locationIntakeStatus_();
}

function apiReviewLocationRequest(requestId, action, reviewerEmail) {
    reviewLocationRequest_(String(requestId || ''), String(action || ''),
        String(reviewerEmail || Session.getEffectiveUser().getEmail() || 'reviewer'));
    return apiLocationIntakeSnapshot();
}

function apiLocationIntakeSnapshot() {
    return readLocationState_(configuredSpreadsheet_());
}

// Bản API-safe của revokeSelectedPublishedLocation: nhận record_id qua tham số thay vì dòng
// đang chọn, để thu hồi chạy được qua clasp run. Cùng logic khoá + trả ảnh về private.
function apiRevokePublishedLocation(recordId, reviewerEmail) {
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
        const spreadsheet = configuredSpreadsheet_();
        const result = locationPipeline_().applyRevocation(readLocationState_(spreadsheet), String(recordId || ''),
            String(reviewerEmail || Session.getEffectiveUser().getEmail() || 'reviewer'), 'Thu hồi thủ công (API)', new Date());
        if (result.revokedImageFileId) revokeImagePublic_(result.revokedImageFileId);
        writeLocationState_(spreadsheet, result);
        return apiLocationIntakeSnapshot();
    } finally { lock.releaseLock(); }
}

// Trả danh sách lựa chọn đơn vị đang hiển thị trong Form thật, để kiểm chứng bộ lọc
// active=FALSE (đơn vị ngừng không được xuất hiện cho người gửi chọn).
function apiFormUnitChoices() {
    const form = FormApp.openById(requiredProperty_('LOCATION_FORM_ID'));
    const item = form.getItems(FormApp.ItemType.LIST)
        .find(it => it.getTitle() === LOCATION_INTAKE.questions.unit);
    if (!item) return { error: 'UNIT_QUESTION_NOT_FOUND' };
    return item.asListItem().getChoices().map(choice => choice.getValue());
}

function apiUnitAllowlist() {
    const pipeline = locationPipeline_();
    return readLocationObjects_(configuredSpreadsheet_().getSheetByName(pipeline.SHEETS.allowlist));
}

function apiFormInfo() {
    const props = locationProperties_();
    return {
        formId: props.getProperty('LOCATION_FORM_ID'),
        publicUrl: props.getProperty('LOCATION_FORM_PUBLIC_URL'),
        editUrl: props.getProperty('LOCATION_FORM_EDIT_URL'),
    };
}

// Tạm dừng/bật lại nhận phản hồi của Form (bảo trì, dọn tài nguyên test). Lưu ý: bật lại vẫn
// cần "Phục hồi" thư mục tải tệp nếu Form bị mất liên kết (xem OPERATIONS.md).
function apiSetFormAccepting(accepting) {
    const form = FormApp.openById(requiredProperty_('LOCATION_FORM_ID'));
    form.setAcceptingResponses(accepting === true || String(accepting).toLowerCase() === 'true');
    return { formId: form.getId(), accepting: form.isAcceptingResponses() };
}

