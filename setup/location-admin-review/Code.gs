/*
 * Container-bound Apps Script runtime for dual-workbook location review.
 *
 * Build with `npm run build:location-admin-review`; do not paste this file alone.
 * This project intentionally has no doPost(), Web App manifest, Staff Gateway adapter,
 * HMAC verifier, Form setup, or legacy intake menu.
 */

function locationPipeline_() {
    if (!globalThis.LocationApprovalPipeline) throw new Error('ADMIN_REVIEW_PIPELINE_UNAVAILABLE');
    return globalThis.LocationApprovalPipeline;
}

function adminProperties_() {
    return PropertiesService.getScriptProperties();
}

function adminPrivateSpreadsheet_() {
    if (!globalThis.LocationWorkbookConfig) throw new Error('LOCATION_WORKBOOK_CONFIG_UNAVAILABLE');
    const props = adminProperties_();
    const config = globalThis.LocationWorkbookConfig.resolvePrivateLocationWorkbook({
        PRIVATE_LOCATION_SPREADSHEET_ID: props.getProperty('PRIVATE_LOCATION_SPREADSHEET_ID'),
        PUBLIC_LOCATION_SPREADSHEET_ID: props.getProperty('PUBLIC_LOCATION_SPREADSHEET_ID'),
        GOOGLE_SHEET_ID: props.getProperty('GOOGLE_SHEET_ID'),
    });
    return SpreadsheetApp.openById(config.spreadsheetId);
}

function adminPublicSpreadsheet_() {
    if (!globalThis.LocationWorkbookConfig) throw new Error('LOCATION_WORKBOOK_CONFIG_UNAVAILABLE');
    const props = adminProperties_();
    const config = globalThis.LocationWorkbookConfig.resolvePublicLocationWorkbook({
        PUBLIC_LOCATION_SPREADSHEET_ID: props.getProperty('PUBLIC_LOCATION_SPREADSHEET_ID'),
        GOOGLE_SHEET_ID: props.getProperty('GOOGLE_SHEET_ID'),
        PRIVATE_LOCATION_SPREADSHEET_ID: props.getProperty('PRIVATE_LOCATION_SPREADSHEET_ID'),
    });
    return SpreadsheetApp.openById(config.spreadsheetId);
}

function requireLocationApprover_() {
    if (!globalThis.LocationAdminReview) throw new Error('ADMIN_REVIEW_RUNTIME_NOT_CONFIGURED');
    const csv = adminProperties_().getProperty('LOCATION_APPROVER_EMAILS');
    if (!csv) throw new Error('LOCATION_APPROVER_CONFIG_MISSING');
    const email = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
    if (!email || !globalThis.LocationAdminReview.isApprover(email, csv)) {
        throw new Error('LOCATION_APPROVER_NOT_AUTHORIZED');
    }
    return email;
}

function adminHeaders_(sheet) {
    return sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1))
        .getDisplayValues()[0].map(value => String(value || '').trim());
}

function adminReadRows_(sheet) {
    if (!sheet || sheet.getLastRow() < 2) return [];
    const headers = adminHeaders_(sheet);
    return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues()
        .map(values => {
            const record = {};
            headers.forEach((header, index) => { record[header] = values[index]; });
            return record;
        })
        .filter(record => Object.values(record).some(value => String(value || '').trim()));
}

function adminRequireSheet_(spreadsheet, sheetName, requiredHeaders) {
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) throw new Error(`ADMIN_SHEET_MISSING:${sheetName}`);
    const headers = adminHeaders_(sheet);
    if (requiredHeaders.some(header => !headers.includes(header))) {
        throw new Error(`ADMIN_SHEET_SCHEMA_MISMATCH:${sheetName}`);
    }
    return sheet;
}

function adminWriteValues_(range, values) {
    range.setNumberFormat('@');
    range.setValues(values);
}

function adminAppend_(spreadsheet, sheetName, headers, record) {
    const sheet = adminRequireSheet_(spreadsheet, sheetName, headers);
    adminWriteValues_(sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length), [
        headers.map(header => record[header] == null ? '' : record[header]),
    ]);
}

function adminFindRowNumber_(sheet, headers, columnName, value) {
    const columnIndex = headers.indexOf(columnName);
    if (columnIndex < 0 || sheet.getLastRow() < 2) return -1;
    const values = sheet.getRange(2, columnIndex + 1, sheet.getLastRow() - 1, 1).getValues();
    const offset = values.findIndex(row => String(row[0] || '').trim() === String(value || '').trim());
    return offset < 0 ? -1 : offset + 2;
}

function adminUpdateRow_(sheet, headers, rowNumber, patch) {
    const current = {};
    sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0]
        .forEach((value, index) => { current[headers[index]] = value; });
    const merged = Object.assign(current, patch);
    adminWriteValues_(sheet.getRange(rowNumber, 1, 1, headers.length), [
        headers.map(header => merged[header] == null ? '' : merged[header]),
    ]);
}

function adminPrivateStore_(spreadsheet) {
    const pipeline = locationPipeline_();
    const stagingHeaders = pipeline.HEADERS.staging;
    const auditHeaders = pipeline.HEADERS.audit;
    return {
        getStagingRows: () => adminReadRows_(adminRequireSheet_(spreadsheet, pipeline.SHEETS.staging, stagingHeaders)),
        getAuditRows: () => adminReadRows_(adminRequireSheet_(spreadsheet, pipeline.SHEETS.audit, auditHeaders)),
        updateStagingRow: (requestId, patch) => {
            const sheet = adminRequireSheet_(spreadsheet, pipeline.SHEETS.staging, stagingHeaders);
            const headers = adminHeaders_(sheet);
            const rowNumber = adminFindRowNumber_(sheet, headers, 'request_id', requestId);
            if (rowNumber < 0) throw new Error('REQUEST_NOT_FOUND');
            adminUpdateRow_(sheet, headers, rowNumber, patch);
        },
        appendAuditRow: record => adminAppend_(spreadsheet, pipeline.SHEETS.audit, auditHeaders, record),
    };
}

function adminPublicStore_(spreadsheet) {
    const pipeline = locationPipeline_();
    const headers = pipeline.HEADERS.published;
    const rows = () => adminReadRows_(adminRequireSheet_(spreadsheet, pipeline.SHEETS.published, headers));
    return {
        getAll: rows,
        findById: recordId => rows().find(row => String(row.record_id || '') === String(recordId || '')) || null,
        upsert: record => {
            const sheet = adminRequireSheet_(spreadsheet, pipeline.SHEETS.published, headers);
            const rowHeaders = adminHeaders_(sheet);
            const rowNumber = adminFindRowNumber_(sheet, rowHeaders, 'record_id', record.record_id);
            if (rowNumber < 0) adminAppend_(spreadsheet, pipeline.SHEETS.published, headers, record);
            else adminUpdateRow_(sheet, rowHeaders, rowNumber, record);
        },
        remove: recordId => {
            const sheet = adminRequireSheet_(spreadsheet, pipeline.SHEETS.published, headers);
            const rowHeaders = adminHeaders_(sheet);
            const rowNumber = adminFindRowNumber_(sheet, rowHeaders, 'record_id', recordId);
            if (rowNumber >= 0) sheet.deleteRow(rowNumber);
        },
    };
}

function setImagePublic_(fileId) {
    const file = DriveApp.getFileById(fileId);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return `https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}`;
}

function revokeImagePublic_(fileId) {
    if (fileId) DriveApp.getFileById(fileId).setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
}

function adminReviewEngine_() {
    const privateSpreadsheet = adminPrivateSpreadsheet_();
    const publicSpreadsheet = adminPublicSpreadsheet_();
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
        privateStore: adminPrivateStore_(privateSpreadsheet),
        publicStore: adminPublicStore_(publicSpreadsheet),
    });
}

function adminSelectedStagingRequestId_() {
    const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const privateSpreadsheet = adminPrivateSpreadsheet_();
    globalThis.LocationAdminReviewContainer.requireActivePrivateWorkbook({
        activeSpreadsheetId: activeSpreadsheet && activeSpreadsheet.getId(),
        configuredPrivateWorkbookId: privateSpreadsheet.getId(),
    });
    const sheet = activeSpreadsheet.getActiveSheet();
    if (sheet.getName() !== locationPipeline_().SHEETS.staging) {
        throw new Error('ADMIN_REVIEW_STAGING_SHEET_REQUIRED');
    }
    const row = sheet.getActiveRange().getRow();
    if (row < 2) throw new Error('ADMIN_REVIEW_DATA_ROW_REQUIRED');
    const headers = adminHeaders_(sheet);
    const requestId = String(sheet.getRange(row, headers.indexOf('request_id') + 1).getValue() || '').trim();
    if (!requestId) throw new Error('REQUEST_ID_MISSING');
    return requestId;
}

function adminPromptNote_(ui, title) {
    const response = ui.prompt(title, 'Ghi chú (có thể để trống):', ui.ButtonSet.OK_CANCEL);
    return response.getSelectedButton() === ui.Button.OK ? String(response.getResponseText() || '').trim() : null;
}

function adminErrorMessage_(error) {
    const code = error && error.code || error && error.message;
    const messages = {
        ADMIN_REVIEW_ACTIVE_WORKBOOK_MISMATCH: 'Hãy mở đúng Private Workbook chứa Location_Staging trước khi dùng menu này.',
        ADMIN_REVIEW_PRIVATE_WORKBOOK_MISSING: 'Thiếu cấu hình Private Workbook.',
        ADMIN_REVIEW_STAGING_SHEET_REQUIRED: 'Hãy chọn một dòng trong Location_Staging.',
        ADMIN_REVIEW_DATA_ROW_REQUIRED: 'Hãy chọn một dòng dữ liệu, không phải dòng tiêu đề.',
        LOCATION_APPROVER_CONFIG_MISSING: 'Chưa cấu hình LOCATION_APPROVER_EMAILS.',
        LOCATION_APPROVER_NOT_AUTHORIZED: 'Tài khoản hiện tại không được phép duyệt.',
        REQUEST_ID_MISSING: 'Không đọc được request_id của dòng đã chọn.',
    };
    return messages[code] || code || 'ADMIN_REVIEW_FAILED';
}

function adminReviewSelectedAction_(action) {
    const ui = SpreadsheetApp.getUi();
    try {
        const requestId = adminSelectedStagingRequestId_();
        const actorEmail = requireLocationApprover_();
        let note = '';
        if (action !== 'APPROVE') {
            note = adminPromptNote_(ui, action === 'REJECT' ? 'Từ chối yêu cầu' : 'Yêu cầu xác minh thêm');
            if (note === null) return;
        }
        const result = adminReviewEngine_().reviewRequest({ requestId, action, actorEmail, note });
        ui.alert(`Đã xử lý yêu cầu ${result.requestId}.`);
    } catch (error) { ui.alert(adminErrorMessage_(error)); }
}

function approveSelectedAdminRequest() { adminReviewSelectedAction_('APPROVE'); }
function rejectSelectedAdminRequest() { adminReviewSelectedAction_('REJECT'); }
function needVerificationSelectedAdminRequest() { adminReviewSelectedAction_('NEED_VERIFICATION'); }

function reconcileSelectedAdminRequest() {
    const ui = SpreadsheetApp.getUi();
    try {
        const result = adminReviewEngine_().reconcileRequest({
            requestId: adminSelectedStagingRequestId_(), actorEmail: requireLocationApprover_(), note: 'Đối soát',
        });
        ui.alert(result.nothingToReconcile ? 'Không có gì để đối soát.' : `Đã đối soát yêu cầu ${result.requestId}.`);
    } catch (error) { ui.alert(adminErrorMessage_(error)); }
}

function healthCheckAdminReview() {
    const ui = SpreadsheetApp.getUi();
    try {
        const privateSpreadsheet = adminPrivateSpreadsheet_();
        const publicSpreadsheet = adminPublicSpreadsheet_();
        requireLocationApprover_();
        const pipeline = locationPipeline_();
        adminRequireSheet_(privateSpreadsheet, pipeline.SHEETS.staging, pipeline.HEADERS.staging);
        adminRequireSheet_(privateSpreadsheet, pipeline.SHEETS.audit, pipeline.HEADERS.audit);
        adminRequireSheet_(publicSpreadsheet, pipeline.SHEETS.published, pipeline.HEADERS.published);
        if (privateSpreadsheet.getId() === publicSpreadsheet.getId()) throw new Error('LOCATION_WORKBOOK_BOUNDARY_VIOLATION');
        ui.alert('✓ Admin authorized\n✓ Private/Public workbook boundary\n✓ Required review sheets and schema');
    } catch (error) { ui.alert(adminErrorMessage_(error)); }
}

function onOpen() {
    SpreadsheetApp.getUi().createMenu('Bản đồ CA - Duyệt địa điểm')
        .addItem('Duyệt yêu cầu đã chọn', 'approveSelectedAdminRequest')
        .addItem('Từ chối yêu cầu đã chọn', 'rejectSelectedAdminRequest')
        .addItem('Yêu cầu xác minh thêm', 'needVerificationSelectedAdminRequest')
        .addItem('Đối soát / hoàn tất yêu cầu đã chọn', 'reconcileSelectedAdminRequest')
        .addSeparator().addItem('Kiểm tra cấu hình duyệt', 'healthCheckAdminReview').addToUi();
}
