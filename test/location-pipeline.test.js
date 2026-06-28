const assert = require('node:assert/strict');
const test = require('node:test');

const pipeline = require('../setup/apps-script');

function createAllowlist() {
    return [
        {
            unit_code: 'cong_an_phuong_tien_cat',
            unit_name: 'Công an phường Tiên Cát',
            allowed_emails: 'tiencat@example.gov.vn',
            active: 'true',
        },
        {
            unit_code: 'cong_an_xa_thuy_van',
            unit_name: 'Công an xã Thụy Vân',
            allowed_emails: 'thuyvan@example.gov.vn',
            active: 'true',
        },
    ];
}

function createSubmission(overrides = {}) {
    return {
        submitterEmail: 'tiencat@example.gov.vn',
        unitName: 'Công an phường Tiên Cát',
        type: 'Trụ sở Công an',
        address: 'Khu 1, Phường Tiên Cát, Phú Thọ',
        phone: '02103846114',
        coordinates: 'https://maps.google.com/?q=21.3225,105.4027',
        imageUrl: 'https://drive.google.com/file/d/abc/view',
        searchAliases: 'Tien Cat|Gia Cam',
        ...overrides,
    };
}

test('allowlist email creates pending staging record only for matching unit', () => {
    const now = new Date('2026-06-27T10:00:00.000Z');
    const record = pipeline.buildStagingRecord(createSubmission(), createAllowlist(), now, { suffix: 't1' });

    assert.equal(record.status, pipeline.STATUSES.pending);
    assert.equal(record.validation_error_codes, '');
    assert.equal(record.unit_code, 'cong_an_phuong_tien_cat');
    assert.equal(record.reviewed_by, '');
    assert.equal(record.search_aliases, 'Tien Cat|Gia Cam');
});

test('email outside allowlist is rejected before publication', () => {
    const record = pipeline.buildStagingRecord(createSubmission({
        submitterEmail: 'outsider@example.com',
    }), createAllowlist(), new Date('2026-06-27T10:00:00.000Z'), { suffix: 't2' });

    assert.equal(record.status, pipeline.STATUSES.rejected);
    assert.match(record.validation_error_codes, /SUBMITTER_NOT_ALLOWED/);
});

test('email of unit A cannot submit data for unit B', () => {
    const record = pipeline.buildStagingRecord(createSubmission({
        unitName: 'Công an xã Thụy Vân',
    }), createAllowlist(), new Date('2026-06-27T10:00:00.000Z'), { suffix: 't3' });

    assert.equal(record.status, pipeline.STATUSES.rejected);
    assert.match(record.validation_error_codes, /UNIT_MISMATCH/);
});

test('valid submission stays out of published data until approved', () => {
    const stagingRecord = pipeline.buildStagingRecord(createSubmission(), createAllowlist(), new Date('2026-06-27T10:00:00.000Z'), { suffix: 't4' });
    const state = {
        stagingRecords: [stagingRecord],
        publishedRecords: [],
        auditEntries: [],
    };

    assert.equal(state.publishedRecords.length, 0);

    const approved = pipeline.applyApproval(state, stagingRecord.record_id, 'reviewer@example.gov.vn', 'looks good', new Date('2026-06-27T10:05:00.000Z'));
    assert.equal(approved.publishedRecords.length, 1);
    assert.equal(approved.publishedRecords[0].record_id, stagingRecord.record_id);
    assert.equal(approved.publishedRecords[0].search_aliases, 'Tien Cat|Gia Cam');
    assert.equal(approved.stagingRecords[0].status, pipeline.STATUSES.approved);
});

test('reject does not change currently published data', () => {
    const published = pipeline.buildPublishedRecord({
        record_id: 'existing_1',
        unit_code: 'cong_an_phuong_tien_cat',
        name: 'Công an phường Tiên Cát',
        type: 'police_station',
        address: 'Địa chỉ cũ',
        phone: '02103846114',
        coordinates: 'https://maps.google.com/?q=21.3225,105.4027',
        image_url: '',
        submitter_email: 'tiencat@example.gov.vn',
    }, 'reviewer@example.gov.vn', '2026-06-27T09:00:00.000Z');

    const newSubmission = pipeline.buildStagingRecord(createSubmission({
        address: 'Địa chỉ mới chờ duyệt',
    }), createAllowlist(), new Date('2026-06-27T10:00:00.000Z'), { suffix: 't5' });

    const next = pipeline.applyRejection({
        stagingRecords: [newSubmission],
        publishedRecords: [published],
        auditEntries: [],
    }, newSubmission.record_id, 'reviewer@example.gov.vn', 'invalid paperwork', new Date('2026-06-27T10:10:00.000Z'));

    assert.equal(next.publishedRecords.length, 1);
    assert.equal(next.publishedRecords[0].address, 'Địa chỉ cũ');
    assert.equal(next.stagingRecords[0].status, pipeline.STATUSES.rejected);
});

test('revoke removes published marker on next refresh', () => {
    const stagingRecord = pipeline.buildStagingRecord(createSubmission(), createAllowlist(), new Date('2026-06-27T10:00:00.000Z'), { suffix: 't6' });
    const approved = pipeline.applyApproval({
        stagingRecords: [stagingRecord],
        publishedRecords: [],
        auditEntries: [],
    }, stagingRecord.record_id, 'reviewer@example.gov.vn', '', new Date('2026-06-27T10:05:00.000Z'));

    const revoked = pipeline.applyRevocation(approved, stagingRecord.record_id, 'reviewer@example.gov.vn', 'bad coordinates', new Date('2026-06-27T10:06:00.000Z'));

    assert.equal(revoked.publishedRecords.length, 0);
    assert.equal(revoked.stagingRecords[0].status, pipeline.STATUSES.revoked);
});

test('rollback path can restore previous approved record for the same unit', () => {
    const allowlist = createAllowlist();
    const goodRecord = pipeline.buildStagingRecord(createSubmission({
        address: 'Địa chỉ đúng',
    }), allowlist, new Date('2026-06-27T09:00:00.000Z'), { suffix: 'good' });

    const approvedGood = pipeline.applyApproval({
        stagingRecords: [goodRecord],
        publishedRecords: [],
        auditEntries: [],
    }, goodRecord.record_id, 'reviewer@example.gov.vn', 'initial publish', new Date('2026-06-27T09:05:00.000Z'));

    const badRecord = pipeline.buildStagingRecord(createSubmission({
        address: 'Địa chỉ sai',
    }), allowlist, new Date('2026-06-27T10:00:00.000Z'), { suffix: 'bad' });

    const withBadPending = {
        stagingRecords: [...approvedGood.stagingRecords, badRecord],
        publishedRecords: approvedGood.publishedRecords,
        auditEntries: approvedGood.auditEntries,
    };

    const approvedBad = pipeline.applyApproval(withBadPending, badRecord.record_id, 'reviewer@example.gov.vn', 'mistaken publish', new Date('2026-06-27T10:05:00.000Z'));
    assert.equal(approvedBad.publishedRecords[0].address, 'Địa chỉ sai');

    const revokedBad = pipeline.applyRevocation(approvedBad, badRecord.record_id, 'reviewer@example.gov.vn', 'rollback bad publish', new Date('2026-06-27T10:06:00.000Z'));
    const restored = pipeline.applyApproval(revokedBad, goodRecord.record_id, 'reviewer@example.gov.vn', 'restore previous good version', new Date('2026-06-27T10:07:00.000Z'));

    assert.equal(restored.publishedRecords.length, 1);
    assert.equal(restored.publishedRecords[0].record_id, goodRecord.record_id);
    assert.equal(restored.publishedRecords[0].address, 'Địa chỉ đúng');
});
