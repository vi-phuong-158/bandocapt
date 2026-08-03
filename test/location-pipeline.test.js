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

test('classifies Maps coordinate conditions without losing the original URL', () => {
    assert.equal(pipeline.classifyCoordinateStatus({ mapsUrl: 'https://maps.google.com/?q=21.32,105.36' }).status, pipeline.COORDINATE_STATUSES.extracted);
    assert.equal(pipeline.classifyCoordinateStatus({ mapsUrl: 'https://maps.google.com/place/no-coordinate' }).status, pipeline.COORDINATE_STATUSES.needsReview);
    assert.equal(pipeline.classifyCoordinateStatus({ mapsUrl: 'https://example.com/?q=21.32,105.36' }).status, pipeline.COORDINATE_STATUSES.invalidLink);
    assert.equal(pipeline.classifyCoordinateStatus({ mapsUrl: 'https://maps.google.com/?q=10.77,106.7' }).status, pipeline.COORDINATE_STATUSES.outsidePhuTho);
    assert.equal(pipeline.classifyCoordinateStatus({ coordinates: '21.32,105.36', manuallyConfirmed: true }).status, pipeline.COORDINATE_STATUSES.manuallyConfirmed);
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
