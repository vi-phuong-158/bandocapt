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

function configuredPrivateSpreadsheet_() {
    const id = locationProperties_().getProperty('PRIVATE_LOCATION_SPREADSHEET_ID');
    if (!id) throw new Error('Thiếu Script Property PRIVATE_LOCATION_SPREADSHEET_ID.');
    return SpreadsheetApp.openById(id);
}

function configuredPublicSpreadsheet_() {
    const id = locationProperties_().getProperty('PUBLIC_LOCATION_SPREADSHEET_ID');
    if (!id) throw new Error('Thiếu Script Property PUBLIC_LOCATION_SPREADSHEET_ID.');
    return SpreadsheetApp.openById(id);
}

// Các menu và Form hiện thuộc workbook riêng tư. Tên cũ được giữ chỉ để các helper UI không có
// quyền chọn nhầm workbook public.
function configuredSpreadsheet_() { return configuredPrivateSpreadsheet_(); }

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

function writeLocationState_(privateSpreadsheet, publicSpreadsheet, state) {
    const pipeline = locationPipeline_();
    replaceLocationSheet_(privateSpreadsheet.getSheetByName(pipeline.SHEETS.staging), pipeline.HEADERS.staging, state.stagingRecords);
    replaceLocationSheet_(publicSpreadsheet.getSheetByName(pipeline.SHEETS.published), pipeline.HEADERS.published, state.publishedRecords);
    replaceLocationSheet_(privateSpreadsheet.getSheetByName(pipeline.SHEETS.audit), pipeline.HEADERS.audit, state.auditEntries);
}

function readLocationState_(privateSpreadsheet, publicSpreadsheet) {
    const pipeline = locationPipeline_();
    return {
        stagingRecords: readLocationObjects_(privateSpreadsheet.getSheetByName(pipeline.SHEETS.staging)),
        publishedRecords: readLocationObjects_(publicSpreadsheet.getSheetByName(pipeline.SHEETS.published)),
        auditEntries: readLocationObjects_(privateSpreadsheet.getSheetByName(pipeline.SHEETS.audit)),
    };
}

function setupLocationIntakeSystem() {
    const pipeline = locationPipeline_();
    const privateSpreadsheet = configuredPrivateSpreadsheet_();
    const publicSpreadsheet = configuredPublicSpreadsheet_();
    requiredProperty_('TEMPLATE_FORM_ID');
    requiredProperty_('DESTINATION_FOLDER_ID');
    pipeline.PRIVATE_SHEET_KEYS.forEach(key => ensureLocationSheet_(privateSpreadsheet, pipeline.SHEETS[key], pipeline.HEADERS[key] || ['key', 'value', 'note']));
    pipeline.PUBLIC_SHEET_KEYS.forEach(key => ensureLocationSheet_(publicSpreadsheet, pipeline.SHEETS[key], pipeline.HEADERS[key]));
    const form = buildLocationForm_(privateSpreadsheet);
    locationProperties_().setProperties({
        LOCATION_FORM_ID: form.getId(),
        LOCATION_FORM_PUBLIC_URL: form.getPublishedUrl(), LOCATION_FORM_EDIT_URL: form.getEditUrl(),
    });
    installLocationTriggers_(form, privateSpreadsheet);
    writeLocationSetupInfo_(privateSpreadsheet, form);
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
        const privateSpreadsheet = configuredPrivateSpreadsheet_();
        const publicSpreadsheet = configuredPublicSpreadsheet_();
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
        const authorization = pipeline.authorizeSubmission(unitName, submission.submitterEmail, readLocationObjects_(privateSpreadsheet.getSheetByName(pipeline.SHEETS.allowlist)));
        if (authorization.authorized) {
            const image = uploadedImage_(answers, authorization.unitCode, submission.locationName, requestId);
            if (image.ok) Object.assign(submission, { imageFileId: image.fileId, imageDriveUrl: image.driveUrl, imageMimeType: image.mimeType });
        }
        const state = readLocationState_(privateSpreadsheet, publicSpreadsheet);
        const record = pipeline.buildStagingRecord(submission, readLocationObjects_(privateSpreadsheet.getSheetByName(pipeline.SHEETS.allowlist)), new Date(), { publishedRecords: state.publishedRecords });
        appendLocationObject_(privateSpreadsheet.getSheetByName(pipeline.SHEETS.staging), record);
        appendLocationObject_(privateSpreadsheet.getSheetByName(pipeline.SHEETS.audit), pipeline.buildAuditEntry('FORM_SUBMIT', { timestamp: record.updated_at, recordId: record.record_id, requestId: record.request_id, unitCode: record.unit_code, actorEmail: record.submitter_email, submitterEmail: record.submitter_email, nextStatus: record.status, note: record.validation_errors || record.warnings, snapshot: record }));
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
        const privateSpreadsheet = configuredPrivateSpreadsheet_();
        const publicSpreadsheet = configuredPublicSpreadsheet_();
        let state = readLocationState_(privateSpreadsheet, publicSpreadsheet);
        const row = state.stagingRecords.find(record => record.request_id === requestId);
        if (!row) throw new Error('Không tìm thấy yêu cầu cần duyệt.');
        if (action === 'APPROVE' && row.request_type !== locationPipeline_().REQUEST_TYPES.stop) {
            const imageUrl = setImagePublic_(row.image_file_id);
            row.image_public_url = imageUrl;
        }
        state = locationPipeline_().applyReviewAction(state, requestId, action, reviewerEmail, row.review_note || '', new Date());
        if (state.revokedImageFileId) revokeImagePublic_(state.revokedImageFileId);
        writeLocationState_(privateSpreadsheet, publicSpreadsheet, state);
    } finally { lock.releaseLock(); }
}

function onLocationStagingEdit(event) {
    if (!event || !event.range) return;
    const pipeline = locationPipeline_();
    const sheet = event.range.getSheet();
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
    const ui = SpreadsheetApp.getUi();
    const response = ui.prompt('Thu hồi địa điểm công khai', 'Nhập mã địa điểm cần thu hồi.', ui.ButtonSet.OK_CANCEL);
    if (response.getSelectedButton() !== ui.Button.OK) return;
    revokePublishedLocationById_(response.getResponseText(), Session.getEffectiveUser().getEmail() || 'reviewer');
}

function revokePublishedLocationById_(recordId, reviewerEmail) {
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
        const privateSpreadsheet = configuredPrivateSpreadsheet_();
        const publicSpreadsheet = configuredPublicSpreadsheet_();
        const result = locationPipeline_().applyRevocation(readLocationState_(privateSpreadsheet, publicSpreadsheet), String(recordId || ''), reviewerEmail, 'Thu hồi thủ công', new Date());
        if (result.revokedImageFileId) revokeImagePublic_(result.revokedImageFileId);
        writeLocationState_(privateSpreadsheet, publicSpreadsheet, result);
    } finally { lock.releaseLock(); }
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

function dualWorkbookHealth_() {
    const properties = locationProperties_();
    const privateId = String(properties.getProperty('PRIVATE_LOCATION_SPREADSHEET_ID') || '').trim();
    const publicId = String(properties.getProperty('PUBLIC_LOCATION_SPREADSHEET_ID') || '').trim();
    const result = { ok: false, errors: [], warnings: [], privacy: { privateWorkbookPrivate: false, publicWorkbookLinkReadable: false } };
    if (!privateId) result.errors.push('PRIVATE_LOCATION_SPREADSHEET_ID_MISSING');
    if (!publicId) result.errors.push('PUBLIC_LOCATION_SPREADSHEET_ID_MISSING');
    if (privateId && publicId && privateId === publicId) result.errors.push('PRIVATE_AND_PUBLIC_WORKBOOK_MUST_DIFFER');
    if (result.errors.length) return result;
    try {
        const privateSpreadsheet = SpreadsheetApp.openById(privateId);
        const publicSpreadsheet = SpreadsheetApp.openById(publicId);
        const pipeline = locationPipeline_();
        const privateSheetNames = pipeline.PRIVATE_SHEET_KEYS.filter(key => privateSpreadsheet.getSheetByName(pipeline.SHEETS[key])).map(key => pipeline.SHEETS[key]);
        const publicSheetNames = pipeline.PUBLIC_SHEET_KEYS.filter(key => publicSpreadsheet.getSheetByName(pipeline.SHEETS[key])).map(key => pipeline.SHEETS[key]);
        const requiredSheets = pipeline.validateRequiredWorkbookSheets({ privateSheetNames, publicSheetNames });
        result.errors.push(...requiredSheets.errors);
        const allowlistSheet = privateSpreadsheet.getSheetByName(pipeline.SHEETS.allowlist);
        const allowlistRows = allowlistSheet ? readLocationObjects_(allowlistSheet) : [];
        const config = pipeline.validateDualWorkbookConfig({ privateSpreadsheetId: privateId, publicSpreadsheetId: publicId, googleSheetId: publicId }, allowlistRows);
        result.errors.push(...config.errors);
        result.warnings.push(...config.warnings);
        const privateFile = DriveApp.getFileById(privateId);
        const publicFile = DriveApp.getFileById(publicId);
        result.privacy.privateWorkbookPrivate = privateFile.getSharingAccess() === DriveApp.Access.PRIVATE;
        result.privacy.publicWorkbookLinkReadable = pipeline.isPublicWorkbookLinkView(publicFile.getSharingAccess(), publicFile.getSharingPermission());
        if (!result.privacy.privateWorkbookPrivate) result.errors.push('PRIVATE_WORKBOOK_NOT_PRIVATE');
        if (!result.privacy.publicWorkbookLinkReadable) result.errors.push('PUBLIC_WORKBOOK_NOT_LINK_READABLE');
        result.sheets = {
            private: privateSheetNames,
            public: publicSheetNames,
        };
    } catch (error) {
        result.errors.push('WORKBOOK_ACCESS_CHECK_FAILED');
    }
    result.ok = result.errors.length === 0;
    return result;
}

function locationIntakeStatus_() {
    const health = dualWorkbookHealth_();
    const messages = [`${health.ok ? '✓' : '✗'} dual-workbook health: ${health.ok ? 'PASS' : health.errors.join(', ')}`];
    (health.sheets?.private || []).forEach(name => messages.push(`✓ ${name} (riêng tư)`));
    (health.sheets?.public || []).forEach(name => messages.push(`✓ ${name} (công khai)`));
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
}

// Entry point cho Apps Script API (`clasp run`): không chạm UI, trả giá trị để kiểm chứng
// tự động. Dùng cho smoke test trên tài nguyên test, không thay thế luồng duyệt bằng menu.
function apiHealthCheckLocationIntake() {
    return dualWorkbookHealth_();
}

function apiReviewLocationRequest(requestId, action, reviewerEmail) {
    reviewLocationRequest_(String(requestId || ''), String(action || ''),
        String(reviewerEmail || Session.getEffectiveUser().getEmail() || 'reviewer'));
    return apiLocationIntakeSnapshot();
}

function apiLocationIntakeSnapshot() {
    return readLocationState_(configuredPrivateSpreadsheet_(), configuredPublicSpreadsheet_());
}

// Bản API-safe của revokeSelectedPublishedLocation: nhận record_id qua tham số thay vì dòng
// đang chọn, để thu hồi chạy được qua clasp run. Cùng logic khoá + trả ảnh về private.
function apiRevokePublishedLocation(recordId, reviewerEmail) {
    revokePublishedLocationById_(String(recordId || ''), String(reviewerEmail || Session.getEffectiveUser().getEmail() || 'reviewer'));
    return apiLocationIntakeSnapshot();
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
    return readLocationObjects_(configuredPrivateSpreadsheet_().getSheetByName(pipeline.SHEETS.allowlist));
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

