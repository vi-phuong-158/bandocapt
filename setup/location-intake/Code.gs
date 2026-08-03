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
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadsheet) throw new Error('Hãy chạy từ Google Sheet quản trị.');
    requiredProperty_('TEMPLATE_FORM_ID');
    requiredProperty_('DESTINATION_FOLDER_ID');
    Object.entries(pipeline.HEADERS).forEach(([key, headers]) => ensureLocationSheet_(spreadsheet, pipeline.SHEETS[key], headers));
    ensureLocationSheet_(spreadsheet, pipeline.SHEETS.info, ['key', 'value', 'note']);
    const form = buildLocationForm_(spreadsheet);
    locationProperties_().setProperties({
        LOCATION_SPREADSHEET_ID: spreadsheet.getId(), LOCATION_FORM_ID: form.getId(),
        LOCATION_FORM_PUBLIC_URL: form.getPublishedUrl(), LOCATION_FORM_EDIT_URL: form.getEditUrl(),
    }, true);
    installLocationTriggers_(form, spreadsheet);
    writeLocationSetupInfo_(spreadsheet, form);
    SpreadsheetApp.flush();
}

function buildLocationForm_(spreadsheet) {
    const templateFile = DriveApp.getFileById(requiredProperty_('TEMPLATE_FORM_ID'));
    const copy = templateFile.makeCopy(`${LOCATION_INTAKE.formTitle} - ${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss')}`);
    const form = FormApp.openById(copy.getId());
    const uploads = form.getItems(FormApp.ItemType.FILE_UPLOAD);
    if (uploads.length !== 1 || uploads[0].getTitle() !== LOCATION_INTAKE.imageQuestion) {
        copy.setTrashed(true);
        throw new Error('Form mẫu phải có đúng một câu tải ảnh tên “Ảnh địa điểm”.');
    }
    const upload = uploads[0];
    form.getItems().forEach(item => { if (item.getId() !== upload.getId()) form.deleteItem(item); });
    form.setTitle(LOCATION_INTAKE.formTitle).setCollectEmail(true).setAllowResponseEdits(true)
        .setLimitOneResponsePerUser(false).setShuffleQuestions(false).setAcceptingResponses(true)
        .setDescription('Biểu mẫu nội bộ. Mỗi lần gửi tương ứng một địa điểm vật lý.')
        .setConfirmationMessage('Đã tiếp nhận. Dữ liệu chỉ hiển thị sau khi được phê duyệt.');
    addLocationFormQuestions_(form, spreadsheet);
    form.moveItem(upload, form.getItems().length - 1);
    try { form.removeDestination(); } catch (_) {}
    form.setDestination(FormApp.DestinationType.SPREADSHEET, spreadsheet.getId());
    return form;
}

function addLocationFormQuestions_(form, spreadsheet) {
    const pipeline = locationPipeline_();
    const units = readLocationObjects_(spreadsheet.getSheetByName(pipeline.SHEETS.allowlist)).filter(row => pipeline.normalizeLabel(row.active) !== 'false')
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

function writeLocationSetupInfo_(spreadsheet, form) {
    const sheet = spreadsheet.getSheetByName(locationPipeline_().SHEETS.info);
    replaceLocationSheet_(sheet, ['key', 'value', 'note'], [
        { key: 'form_public_url', value: form.getPublishedUrl(), note: 'Gửi link này vào nhóm Zalo' },
        { key: 'form_edit_url', value: form.getEditUrl(), note: 'Link quản trị Form' },
        { key: 'spreadsheet_url', value: spreadsheet.getUrl(), note: 'Google Sheet xử lý dữ liệu' },
        { key: 'destination_folder_id', value: requiredProperty_('DESTINATION_FOLDER_ID'), note: 'Thư mục ảnh riêng tư trước khi duyệt' },
    ]);
}

function healthCheckLocationIntake() {
    const spreadsheet = configuredSpreadsheet_(); const pipeline = locationPipeline_();
    const messages = Object.values(pipeline.SHEETS).map(name => `${spreadsheet.getSheetByName(name) ? '✓' : '✗'} ${name}`);
    messages.push(locationProperties_().getProperty('LOCATION_FORM_ID') ? '✓ Form đã cấu hình' : '✗ Chưa có Form');
    SpreadsheetApp.getUi().alert(messages.join('\n'));
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
