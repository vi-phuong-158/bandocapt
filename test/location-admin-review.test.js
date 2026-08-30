const assert = require('node:assert/strict');
const test = require('node:test');

const pipeline = require('../setup/apps-script');
const workbookConfig = require('../lib/location-workbooks');
const { createLocationAdminReview, isApprover, buildApproverDiagnostic, canonicalPublishedEqual, deterministicImageUrl } = require('../setup/location-admin-review');

const ALLOWLIST = [{ unit_code: 'CA_A', unit_name: 'Công an phường A', allowed_emails: 'canbo@example.gov.vn', active: true }];
const APPROVER = 'admin@example.gov.vn';
const NOW = new Date('2026-08-15T01:00:00.000Z');

function stagingInput(overrides = {}) {
    return {
        requestId: 'REQ_1',
        requestType: pipeline.REQUEST_TYPES.create,
        unitName: 'Công an phường A',
        submitterEmail: 'canbo@example.gov.vn',
        submitterName: 'Cán bộ A',
        locationName: 'Trụ sở A',
        siteType: 'HEADQUARTERS',
        services: ['POLICE_OFFICE'],
        address: '123 đường A',
        coordinates: '21.3225,105.4027',
        imageFileId: 'file-1',
        imageMimeType: 'image/jpeg',
        ...overrides,
    };
}

function buildStaging(overrides = {}, publishedRecords = [], options = {}) {
    return pipeline.buildStagingRecord(stagingInput(overrides), ALLOWLIST, new Date('2026-08-15T00:00:00.000Z'), { publishedRecords, ...options });
}

// Mirrors what a real prior CREATE approval would have produced (image_public_url set
// deterministically from image_file_id) — a raw pipeline.buildPublishedRecord() call skips that,
// since only the admin-review engine assigns it at approval time.
function buildApprovedPublished(overrides = {}, publishedRecords = [], at = new Date('2026-01-01')) {
    const staging = buildStaging(overrides, publishedRecords);
    const withImageUrl = { ...staging, image_public_url: staging.image_file_id ? deterministicImageUrl(staging.image_file_id) : staging.image_public_url };
    return pipeline.buildPublishedRecord(withImageUrl, at);
}

function makeStores({ staging = [], published = [], audit = [] } = {}) {
    const state = {
        staging: staging.map(row => ({ ...row })),
        published: published.map(row => ({ ...row })),
        audit: audit.map(row => ({ ...row })),
    };
    const failures = {};
    const privateStore = {
        getStagingRows: () => state.staging.map(row => ({ ...row })),
        getAuditRows: () => state.audit.map(row => ({ ...row })),
        updateStagingRow: (requestId, patch) => {
            if (failures.updateStagingRow) { failures.updateStagingRow = false; throw new Error('simulated staging write failure'); }
            const row = state.staging.find(item => item.request_id === requestId);
            if (!row) throw new Error('REQUEST_NOT_FOUND');
            Object.assign(row, patch);
        },
        appendAuditRow: record => {
            if (failures.appendAuditRow) { failures.appendAuditRow = false; throw new Error('simulated audit append failure'); }
            state.audit.push({ ...record });
        },
    };
    const publicStore = {
        getAll: () => state.published.map(row => ({ ...row })),
        findById: recordId => state.published.find(row => row.record_id === recordId) || null,
        upsert: record => {
            if (failures.upsert) { failures.upsert = false; throw new Error('simulated public write failure'); }
            const index = state.published.findIndex(row => row.record_id === record.record_id);
            if (index >= 0) state.published[index] = { ...record }; else state.published.push({ ...record });
        },
        remove: recordId => {
            if (failures.remove) { failures.remove = false; throw new Error('simulated public delete failure'); }
            state.published = state.published.filter(row => row.record_id !== recordId);
        },
    };
    return { state, privateStore, publicStore, failures };
}

function makeRuntime({ failSetImagePublicOnce = false, failRevokeImagePublicOnce = false } = {}) {
    const calls = { setImagePublic: [], revokeImagePublic: [] };
    let failShare = failSetImagePublicOnce;
    let failRevoke = failRevokeImagePublicOnce;
    return {
        calls,
        runtime: {
            now: () => NOW.getTime(),
            withLock: callback => callback(),
            setImagePublic: fileId => {
                calls.setImagePublic.push(fileId);
                if (failShare) { failShare = false; throw new Error('simulated sharing failure'); }
                return deterministicImageUrl(fileId);
            },
            revokeImagePublic: fileId => {
                calls.revokeImagePublic.push(fileId);
                if (failRevoke) { failRevoke = false; throw new Error('simulated revoke failure'); }
            },
        },
    };
}

function makeEngine(stores, runtimeWrap) {
    return createLocationAdminReview({
        pipeline, workbookConfig, runtime: runtimeWrap.runtime,
        privateStore: stores.privateStore, publicStore: stores.publicStore,
    });
}

// --- A: pure/unit acceptance ------------------------------------------------------------------

test('A1 CREATE approval publishes exactly one public record and finalizes private', () => {
    const staging = buildStaging({ requestId: 'REQ_A1' });
    assert.equal(staging.validation_errors, '');
    const stores = makeStores({ staging: [staging] });
    const runtimeWrap = makeRuntime();
    const engine = makeEngine(stores, runtimeWrap);
    const result = engine.reviewRequest({ requestId: staging.request_id, action: 'APPROVE', actorEmail: APPROVER });
    assert.equal(result.status, pipeline.STATUSES.approved);
    assert.equal(stores.state.published.length, 1);
    assert.equal(stores.state.published[0].record_id, staging.record_id);
    assert.equal(stores.state.audit.filter(row => row.action === 'APPROVE').length, 1);
    assert.equal(stores.state.staging[0].status, pipeline.STATUSES.approved);
    assert.deepEqual(runtimeWrap.calls.setImagePublic, ['file-1']);
});

test('A1b public system principal can be approved without Unit_Allowlist email authorization', () => {
    const staging = buildStaging({
        requestId: 'REQ_PUBLIC_APPROVAL', submitterEmail: 'public-web@bandocapt.invalid', submitterName: 'Người dân',
    }, [], { authorizedUnit: { unitCode: 'CA_A', unitName: 'Công an phường A' }, authStatus: 'PUBLIC_CAPTCHA' });
    assert.equal(staging.validation_errors, '');
    assert.equal(staging.auth_status, 'PUBLIC_CAPTCHA');
    const stores = makeStores({ staging: [staging] });
    const result = makeEngine(stores, makeRuntime()).reviewRequest({ requestId: staging.request_id, action: 'APPROVE', actorEmail: APPROVER });
    assert.equal(result.status, pipeline.STATUSES.approved);
    assert.equal(stores.state.published.length, 1);
    assert.equal(stores.state.staging[0].submitter_email, 'public-web@bandocapt.invalid');
});

test('A2 CREATE retry with public already matching expected does not duplicate, finalizes private', () => {
    const staging = buildStaging({ requestId: 'REQ_A2' });
    const expected = pipeline.buildPublishedRecord({ ...staging, image_public_url: deterministicImageUrl(staging.image_file_id) }, NOW);
    const stores = makeStores({ staging: [staging], published: [expected] });
    const runtimeWrap = makeRuntime();
    const engine = makeEngine(stores, runtimeWrap);
    const result = engine.reviewRequest({ requestId: staging.request_id, action: 'APPROVE', actorEmail: APPROVER });
    assert.equal(result.publicTouched, false);
    assert.equal(stores.state.published.length, 1);
    assert.equal(stores.state.staging[0].status, pipeline.STATUSES.approved);
});

test('A3 CREATE conflict fails closed without any mutation', () => {
    const staging = buildStaging({ requestId: 'REQ_A3' });
    const conflicting = { ...pipeline.buildPublishedRecord(staging, NOW), address: 'Địa chỉ khác hoàn toàn' };
    const stores = makeStores({ staging: [staging], published: [conflicting] });
    const runtimeWrap = makeRuntime();
    const engine = makeEngine(stores, runtimeWrap);
    assert.throws(() => engine.reviewRequest({ requestId: staging.request_id, action: 'APPROVE', actorEmail: APPROVER }), /APPROVAL_PUBLIC_CONFLICT/);
    assert.equal(stores.state.published.length, 1);
    assert.equal(stores.state.published[0].address, 'Địa chỉ khác hoàn toàn');
    assert.equal(stores.state.staging[0].status, pipeline.STATUSES.pending);
    assert.equal(stores.state.audit.length, 0);
});

test('A4 UPDATE replaces exact target, row count unchanged, record_id unchanged', () => {
    const original = buildApprovedPublished({ requestId: 'REQ_ORIG4' });
    const staging = buildStaging({
        requestId: 'REQ_A4', requestType: pipeline.REQUEST_TYPES.update, targetRecordId: original.record_id, address: 'Địa chỉ mới sau cập nhật',
    }, [original]);
    assert.equal(staging.validation_errors, '');
    const stores = makeStores({ staging: [staging], published: [original] });
    const runtimeWrap = makeRuntime();
    const engine = makeEngine(stores, runtimeWrap);
    engine.reviewRequest({ requestId: staging.request_id, action: 'APPROVE', actorEmail: APPROVER });
    assert.equal(stores.state.published.length, 1);
    assert.equal(stores.state.published[0].record_id, original.record_id);
    assert.equal(stores.state.published[0].address, 'Địa chỉ mới sau cập nhật');
});

test('A5 CORRECT replaces exact target, row count unchanged, record_id unchanged', () => {
    const original = buildApprovedPublished({ requestId: 'REQ_ORIG5' });
    const staging = buildStaging({
        requestId: 'REQ_A5', requestType: pipeline.REQUEST_TYPES.correct, targetRecordId: original.record_id, coordinates: '21.4,105.5',
    }, [original]);
    const stores = makeStores({ staging: [staging], published: [original] });
    const runtimeWrap = makeRuntime();
    const engine = makeEngine(stores, runtimeWrap);
    engine.reviewRequest({ requestId: staging.request_id, action: 'APPROVE', actorEmail: APPROVER });
    assert.equal(stores.state.published.length, 1);
    assert.equal(stores.state.published[0].record_id, original.record_id);
    assert.equal(stores.state.published[0].coordinates, '21.4,105.5');
});

test('UPDATE without a replacement image preserves the authoritative public URL and private file pointer', () => {
    const originalStaging = buildStaging({ requestId: 'REQ_IMAGE_ORIGINAL' });
    const original = pipeline.buildPublishedRecord({ ...originalStaging, image_public_url: deterministicImageUrl('file-1') }, NOW);
    const approvedOriginal = { ...originalStaging, status: pipeline.STATUSES.approved, published_image_file_id: 'file-1', reviewed_at: '2026-08-15T00:30:00.000Z' };
    const edit = buildStaging({
        requestId: 'REQ_IMAGE_KEEP', requestType: pipeline.REQUEST_TYPES.update, targetRecordId: original.record_id,
        address: 'Địa chỉ chỉ đổi chữ', imageFileId: '', imageDriveUrl: '', imagePublicUrl: '', imageMimeType: '',
    }, [original]);
    assert.equal(edit.validation_errors, '');
    const stores = makeStores({ staging: [approvedOriginal, edit], published: [original] });
    const runtimeWrap = makeRuntime();
    const engine = makeEngine(stores, runtimeWrap);
    engine.reviewRequest({ requestId: edit.request_id, action: 'APPROVE', actorEmail: APPROVER });
    assert.equal(stores.state.published.length, 1);
    assert.equal(stores.state.published[0].image_url, original.image_url);
    assert.equal(stores.state.staging.find(row => row.request_id === edit.request_id).published_image_file_id, 'file-1');
    assert.deepEqual(runtimeWrap.calls.setImagePublic, []);
});

test('UPDATE without a replacement image keeps a legacy public URL even when private history has no file ID', () => {
    const original = { ...buildApprovedPublished({ requestId: 'REQ_LEGACY_ORIGINAL' }), image_url: 'https://legacy.example.test/old-image.jpg' };
    const edit = buildStaging({
        requestId: 'REQ_LEGACY_KEEP', requestType: pipeline.REQUEST_TYPES.update, targetRecordId: original.record_id,
        imageFileId: '', imageDriveUrl: '', imagePublicUrl: '', imageMimeType: '',
    }, [original]);
    const stores = makeStores({ staging: [edit], published: [original] });
    const runtimeWrap = makeRuntime();
    makeEngine(stores, runtimeWrap).reviewRequest({ requestId: edit.request_id, action: 'APPROVE', actorEmail: APPROVER });
    assert.equal(stores.state.published[0].image_url, original.image_url);
    assert.equal(stores.state.staging[0].published_image_file_id, '');
    assert.deepEqual(runtimeWrap.calls.setImagePublic, []);
});

test('UPDATE with a replacement image publishes B, revokes A, and leaves a private audit trail', () => {
    const original = buildApprovedPublished({ requestId: 'REQ_REPLACE_ORIGINAL' });
    const edit = buildStaging({
        requestId: 'REQ_REPLACE_NEW', requestType: pipeline.REQUEST_TYPES.update, targetRecordId: original.record_id,
        imageFileId: 'file-new', imageMimeType: 'image/png', imagePublicUrl: '',
    }, [original]);
    const stores = makeStores({ staging: [edit], published: [original] });
    const runtimeWrap = makeRuntime();
    const result = makeEngine(stores, runtimeWrap).reviewRequest({ requestId: edit.request_id, action: 'APPROVE', actorEmail: APPROVER });
    assert.equal(stores.state.published[0].image_url, deterministicImageUrl('file-new'));
    assert.equal(stores.state.staging[0].published_image_file_id, 'file-new');
    assert.deepEqual(runtimeWrap.calls.setImagePublic, ['file-new']);
    assert.deepEqual(runtimeWrap.calls.revokeImagePublic, ['file-1']);
    assert.equal(result.imageRevoked, true);
    assert.deepEqual(stores.state.audit.map(row => row.action), ['IMAGE_REPLACEMENT_PREPARED', 'APPROVE', 'IMAGE_REVOKE']);
});

test('replacement shares B before the public record changes from A to B', () => {
    const original = buildApprovedPublished({ requestId: 'REQ_ORDER_ORIGINAL' });
    const edit = buildStaging({
        requestId: 'REQ_ORDER_REPLACE', requestType: pipeline.REQUEST_TYPES.update, targetRecordId: original.record_id,
        imageFileId: 'file-b', imageMimeType: 'image/png', imagePublicUrl: '',
    }, [original]);
    const stores = makeStores({ staging: [edit], published: [original] });
    const runtimeWrap = makeRuntime();
    const order = [];
    const share = runtimeWrap.runtime.setImagePublic;
    const upsert = stores.publicStore.upsert;
    runtimeWrap.runtime.setImagePublic = fileId => { order.push(`share:${fileId}`); return share(fileId); };
    stores.publicStore.upsert = record => { order.push(`public:${record.image_url}`); return upsert(record); };
    makeEngine(stores, runtimeWrap).reviewRequest({ requestId: edit.request_id, action: 'APPROVE', actorEmail: APPROVER });
    assert.deepEqual(order.slice(0, 2), ['share:file-b', `public:${deterministicImageUrl('file-b')}`]);
});

test('A6 STOP approval removes public target, staging REVOKED, exactly one REVOKE audit', () => {
    const original = pipeline.buildPublishedRecord(buildStaging({ requestId: 'REQ_ORIG6' }), new Date('2026-01-01'));
    const staging = buildStaging({ requestId: 'REQ_A6', requestType: pipeline.REQUEST_TYPES.stop, targetRecordId: original.record_id }, [original]);
    assert.equal(staging.validation_errors, '');
    const stores = makeStores({ staging: [staging], published: [original] });
    const runtimeWrap = makeRuntime();
    const engine = makeEngine(stores, runtimeWrap);
    engine.reviewRequest({ requestId: staging.request_id, action: 'APPROVE', actorEmail: APPROVER });
    assert.equal(stores.state.published.length, 0);
    assert.equal(stores.state.staging[0].status, pipeline.STATUSES.revoked);
    assert.equal(stores.state.audit.filter(row => row.action === 'REVOKE').length, 1);
});

test('A7 STOP retry with public already absent finalizes private without a second deletion', () => {
    const original = pipeline.buildPublishedRecord(buildStaging({ requestId: 'REQ_ORIG7' }), new Date('2026-01-01'));
    const staging = buildStaging({ requestId: 'REQ_A7', requestType: pipeline.REQUEST_TYPES.stop, targetRecordId: original.record_id }, [original]);
    const stores = makeStores({ staging: [staging], published: [] });
    const runtimeWrap = makeRuntime();
    const engine = makeEngine(stores, runtimeWrap);
    const result = engine.reviewRequest({ requestId: staging.request_id, action: 'APPROVE', actorEmail: APPROVER });
    assert.equal(result.publicTouched, false);
    assert.equal(stores.state.staging[0].status, pipeline.STATUSES.revoked);
    assert.equal(stores.state.audit.filter(row => row.action === 'REVOKE').length, 1);
});

test('A8 REJECT only touches private: PENDING -> REJECTED, one REJECT audit, public untouched', () => {
    const staging = buildStaging({ requestId: 'REQ_A8' });
    const stores = makeStores({ staging: [staging] });
    const runtimeWrap = makeRuntime();
    const engine = makeEngine(stores, runtimeWrap);
    const result = engine.reviewRequest({ requestId: staging.request_id, action: 'REJECT', actorEmail: APPROVER, note: 'thiếu ảnh rõ' });
    assert.equal(result.status, pipeline.STATUSES.rejected);
    assert.equal(stores.state.published.length, 0);
    assert.equal(stores.state.audit.length, 1);
    assert.equal(stores.state.audit[0].action, 'REJECT');
});

test('A9 NEED_VERIFICATION only touches private: PENDING -> NEED_VERIFICATION, one audit, public untouched', () => {
    const staging = buildStaging({ requestId: 'REQ_A9' });
    const stores = makeStores({ staging: [staging] });
    const runtimeWrap = makeRuntime();
    const engine = makeEngine(stores, runtimeWrap);
    const result = engine.reviewRequest({ requestId: staging.request_id, action: 'NEED_VERIFICATION', actorEmail: APPROVER });
    assert.equal(result.status, pipeline.STATUSES.needVerification);
    assert.equal(stores.state.published.length, 0);
    assert.equal(stores.state.audit[0].action, 'NEED_VERIFICATION');
});

// --- F: failure injection / retry / reconciliation --------------------------------------------

test('F1 public+audit committed, staging write throws once: retry (same action) finalizes without duplicating public/audit', () => {
    const staging = buildStaging({ requestId: 'REQ_F1' });
    const stores = makeStores({ staging: [staging] });
    const runtimeWrap = makeRuntime();
    const engine = makeEngine(stores, runtimeWrap);
    stores.failures.updateStagingRow = true;
    assert.throws(() => engine.reviewRequest({ requestId: staging.request_id, action: 'APPROVE', actorEmail: APPROVER }));
    assert.equal(stores.state.published.length, 1);
    assert.equal(stores.state.audit.length, 1);
    assert.equal(stores.state.staging[0].status, pipeline.STATUSES.pending);
    engine.reviewRequest({ requestId: staging.request_id, action: 'APPROVE', actorEmail: APPROVER });
    assert.equal(stores.state.published.length, 1);
    assert.equal(stores.state.audit.length, 1);
    assert.equal(stores.state.staging[0].status, pipeline.STATUSES.approved);
});

test('F2 reconcile repairs public state when private is already final but the public write never landed', () => {
    const staging = buildStaging({ requestId: 'REQ_F2' });
    const approvedStaging = { ...staging, status: pipeline.STATUSES.approved, reviewed_by: APPROVER, reviewed_at: '2026-08-15T00:30:00.000Z' };
    const stores = makeStores({ staging: [approvedStaging], published: [] });
    const runtimeWrap = makeRuntime();
    const engine = makeEngine(stores, runtimeWrap);
    const result = engine.reconcileRequest({ requestId: staging.request_id, actorEmail: APPROVER });
    assert.equal(result.ok, true);
    assert.equal(stores.state.published.length, 1);
    assert.equal(stores.state.published[0].record_id, staging.record_id);
});

test('F3 audit append fails after public write: retry appends audit exactly once without re-publishing', () => {
    const staging = buildStaging({ requestId: 'REQ_F3' });
    const stores = makeStores({ staging: [staging] });
    const runtimeWrap = makeRuntime();
    const engine = makeEngine(stores, runtimeWrap);
    stores.failures.appendAuditRow = true;
    assert.throws(() => engine.reviewRequest({ requestId: staging.request_id, action: 'APPROVE', actorEmail: APPROVER }));
    assert.equal(stores.state.published.length, 1);
    assert.equal(stores.state.audit.length, 0);
    assert.equal(stores.state.staging[0].status, pipeline.STATUSES.pending);
    engine.reviewRequest({ requestId: staging.request_id, action: 'APPROVE', actorEmail: APPROVER });
    assert.equal(stores.state.audit.length, 1);
    assert.equal(stores.state.published.length, 1);
});

test('F4 image sharing failure blocks finalize; retry reuses the same file id and eventually finalizes', () => {
    const staging = buildStaging({ requestId: 'REQ_F4' });
    const stores = makeStores({ staging: [staging] });
    const runtimeWrap = makeRuntime({ failSetImagePublicOnce: true });
    const engine = makeEngine(stores, runtimeWrap);
    assert.throws(() => engine.reviewRequest({ requestId: staging.request_id, action: 'APPROVE', actorEmail: APPROVER }), /IMAGE_SHARING_FAILED/);
    assert.equal(stores.state.published.length, 0);
    assert.equal(stores.state.staging[0].status, pipeline.STATUSES.pending);
    assert.equal(stores.state.audit.length, 0);
    const result = engine.reviewRequest({ requestId: staging.request_id, action: 'APPROVE', actorEmail: APPROVER });
    assert.equal(result.status, pipeline.STATUSES.approved);
    assert.deepEqual(runtimeWrap.calls.setImagePublic, ['file-1', 'file-1']);
    assert.equal(stores.state.published.length, 1);
});

test('replacement revocation failure keeps B published, preserves A in private audit, and reconcile safely retries only A', () => {
    const original = buildApprovedPublished({ requestId: 'REQ_REVOKE_ORIGINAL' });
    const edit = buildStaging({
        requestId: 'REQ_REVOKE_RETRY', requestType: pipeline.REQUEST_TYPES.update, targetRecordId: original.record_id,
        imageFileId: 'file-b', imageMimeType: 'image/png', imagePublicUrl: '',
    }, [original]);
    const stores = makeStores({ staging: [edit], published: [original] });
    const runtimeWrap = makeRuntime({ failRevokeImagePublicOnce: true });
    const engine = makeEngine(stores, runtimeWrap);
    const first = engine.reviewRequest({ requestId: edit.request_id, action: 'APPROVE', actorEmail: APPROVER });
    assert.equal(first.imageRevokeError, 'IMAGE_REVOKE_FAILED');
    assert.equal(stores.state.published[0].image_url, deterministicImageUrl('file-b'));
    assert.equal(stores.state.staging[0].status, pipeline.STATUSES.approved);
    assert.deepEqual(runtimeWrap.calls.revokeImagePublic, ['file-1']);
    const second = engine.reconcileRequest({ requestId: edit.request_id, actorEmail: APPROVER });
    assert.equal(second.imageRevoked, true);
    assert.deepEqual(runtimeWrap.calls.revokeImagePublic, ['file-1', 'file-1']);
    assert.deepEqual(stores.state.audit.map(row => row.action), ['IMAGE_REPLACEMENT_PREPARED', 'APPROVE', 'IMAGE_REVOKE']);
    assert.equal(stores.state.published[0].image_url, deterministicImageUrl('file-b'));
});

test('replacement never revokes a file still referenced by another public location', () => {
    const original = buildApprovedPublished({ requestId: 'REQ_SHARED_ORIGINAL' });
    const another = { ...buildApprovedPublished({ requestId: 'REQ_SHARED_ANOTHER', locationName: 'Trụ sở khác' }), record_id: 'LOC_SHARED', image_url: original.image_url };
    const edit = buildStaging({
        requestId: 'REQ_SHARED_REPLACE', requestType: pipeline.REQUEST_TYPES.update, targetRecordId: original.record_id,
        imageFileId: 'file-b', imageMimeType: 'image/png', imagePublicUrl: '',
    }, [original, another]);
    const stores = makeStores({ staging: [edit], published: [original, another] });
    const runtimeWrap = makeRuntime();
    const result = makeEngine(stores, runtimeWrap).reviewRequest({ requestId: edit.request_id, action: 'APPROVE', actorEmail: APPROVER });
    assert.equal(result.imageRevoked, false);
    assert.deepEqual(runtimeWrap.calls.revokeImagePublic, []);
    assert.equal(stores.state.published.find(row => row.record_id === original.record_id).image_url, deterministicImageUrl('file-b'));
    assert.equal(stores.state.published.find(row => row.record_id === another.record_id).image_url, deterministicImageUrl('file-1'));
});

test('F5 an already-approved request cannot be re-approved into a second public mutation', () => {
    const staging = buildStaging({ requestId: 'REQ_F5' });
    const stores = makeStores({ staging: [staging] });
    const runtimeWrap = makeRuntime();
    const engine = makeEngine(stores, runtimeWrap);
    engine.reviewRequest({ requestId: staging.request_id, action: 'APPROVE', actorEmail: APPROVER });
    assert.throws(() => engine.reviewRequest({ requestId: staging.request_id, action: 'APPROVE', actorEmail: APPROVER }), error => error.code === 'REQUEST_NOT_REVIEWABLE');
    assert.equal(stores.state.published.length, 1);
    assert.equal(stores.state.audit.length, 1);
    // reconcile (no PENDING gate) on the same already-done row is still a safe no-op repair call.
    engine.reconcileRequest({ requestId: staging.request_id, actorEmail: APPROVER });
    assert.equal(stores.state.published.length, 1);
    assert.equal(stores.state.audit.length, 1);
});

test('STOP: image revoke failure does not block the business transition, only the best-effort share revoke', () => {
    const original = pipeline.buildPublishedRecord(buildStaging({ requestId: 'REQ_ORIGREV' }), new Date('2026-01-01'));
    const staging = buildStaging({ requestId: 'REQ_REV', requestType: pipeline.REQUEST_TYPES.stop, targetRecordId: original.record_id }, [original]);
    const stores = makeStores({ staging: [staging], published: [original] });
    const runtimeWrap = makeRuntime({ failRevokeImagePublicOnce: true });
    const engine = makeEngine(stores, runtimeWrap);
    const result = engine.reviewRequest({ requestId: staging.request_id, action: 'APPROVE', actorEmail: APPROVER });
    assert.equal(result.status, pipeline.STATUSES.revoked);
    assert.equal(stores.state.published.length, 0);
    assert.equal(result.imageRevokeError, 'IMAGE_REVOKE_FAILED');
});

// --- S: security / fail-closed ------------------------------------------------------------------

test('S1/S2 isApprover fails closed on empty/missing allowlist and rejects an unlisted email', () => {
    assert.equal(isApprover('a@example.gov.vn', ''), false);
    assert.equal(isApprover('a@example.gov.vn', undefined), false);
    assert.equal(isApprover('a@example.gov.vn', 'b@example.gov.vn'), false);
    assert.equal(isApprover('a@example.gov.vn', 'A@Example.gov.vn, b@example.gov.vn'), true);
});

test('approver authorization normalizes case and whitespace across supported allowlist separators', () => {
    const expected = 'anmphongandn@gmail.com';
    for (const email of [expected, 'ANMPHONGANDN@GMAIL.COM', ` ${expected} `]) {
        assert.equal(isApprover(email, 'admin1@gmail.com,anmphongandn@gmail.com'), true);
        assert.equal(isApprover(email, 'admin1@gmail.com; anmphongandn@gmail.com'), true);
        assert.equal(isApprover(email, `admin1@gmail.com\n${expected}`), true);
    }
});

test('approver authorization fails closed for empty effective identity and empty configuration', () => {
    assert.equal(isApprover('', 'anmphongandn@gmail.com'), false);
    assert.equal(isApprover('anmphongandn@gmail.com', ''), false);
    assert.deepEqual(buildApproverDiagnostic({
        effectiveUserEmail: '', activeUserEmail: 'anmphongandn@gmail.com', approverEmailsCsv: '',
    }), {
        effectiveUserEmail: '',
        activeUserEmail: 'anmphongandn@gmail.com',
        allowlistConfigured: false,
        effectiveApproverMatch: false,
        activeApproverMatch: false,
    });
});

test('S4/S5 a public store failure (missing sheet / schema mismatch) propagates and blocks approval', () => {
    const staging = buildStaging({ requestId: 'REQ_S4' });
    const stores = makeStores({ staging: [staging] });
    stores.publicStore.findById = () => { throw new Error('ADMIN_SHEET_SCHEMA_MISMATCH:Published_Locations'); };
    const runtimeWrap = makeRuntime();
    const engine = makeEngine(stores, runtimeWrap);
    assert.throws(() => engine.reviewRequest({ requestId: staging.request_id, action: 'APPROVE', actorEmail: APPROVER }), /ADMIN_SHEET_SCHEMA_MISMATCH/);
    assert.equal(stores.state.staging[0].status, pipeline.STATUSES.pending);
});

test('S6 a cross-unit target drift is rejected before any public mutation', () => {
    const original = pipeline.buildPublishedRecord(buildStaging({ requestId: 'REQ_ORIGS6' }), new Date('2026-01-01'));
    // Submission-time target belonged to CA_A (passes buildStagingRecord's own guard); by approval
    // time the public record now belongs to a different unit — simulates drift/race, not a bug in submit.
    const staging = buildStaging({ requestId: 'REQ_S6', requestType: pipeline.REQUEST_TYPES.update, targetRecordId: original.record_id }, [original]);
    const driftedTarget = { ...original, unit_code: 'CA_OTHER' };
    const stores = makeStores({ staging: [staging], published: [driftedTarget] });
    const runtimeWrap = makeRuntime();
    const engine = makeEngine(stores, runtimeWrap);
    assert.throws(() => engine.reviewRequest({ requestId: staging.request_id, action: 'APPROVE', actorEmail: APPROVER }), /TARGET_RECORD_UNIT_MISMATCH/);
    assert.equal(stores.state.published[0].unit_code, 'CA_OTHER');
    assert.equal(stores.state.staging[0].status, pipeline.STATUSES.pending);
});

test('S7 a row with validation_errors cannot be approved even if status is manually reset to PENDING', () => {
    const blocked = buildStaging({ requestId: 'REQ_S7', locationName: '' });
    assert.ok(blocked.validation_errors);
    assert.equal(blocked.status, pipeline.STATUSES.blocked);
    const forcedPending = { ...blocked, status: pipeline.STATUSES.pending };
    const stores = makeStores({ staging: [forcedPending] });
    const runtimeWrap = makeRuntime();
    const engine = makeEngine(stores, runtimeWrap);
    assert.throws(() => engine.reviewRequest({ requestId: blocked.request_id, action: 'APPROVE', actorEmail: APPROVER }), /RECORD_INVALID/);
    assert.equal(stores.state.published.length, 0);
});

test('a genuinely BLOCKED row is not reviewable via the primary action, and reconcile reports nothing to do', () => {
    const blocked = buildStaging({ requestId: 'REQ_BLOCKED', locationName: '' });
    const stores = makeStores({ staging: [blocked] });
    const runtimeWrap = makeRuntime();
    const engine = makeEngine(stores, runtimeWrap);
    assert.throws(() => engine.reviewRequest({ requestId: blocked.request_id, action: 'APPROVE', actorEmail: APPROVER }), error => error.code === 'REQUEST_NOT_REVIEWABLE');
    const result = engine.reconcileRequest({ requestId: blocked.request_id, actorEmail: APPROVER });
    assert.equal(result.nothingToReconcile, true);
    assert.equal(stores.state.published.length, 0);
});

test('S8 an already REJECTED/REVOKED request cannot be re-approved into a new public mutation', () => {
    const rejected = { ...buildStaging({ requestId: 'REQ_S8' }), status: pipeline.STATUSES.rejected };
    const stores = makeStores({ staging: [rejected] });
    const runtimeWrap = makeRuntime();
    const engine = makeEngine(stores, runtimeWrap);
    assert.throws(() => engine.reviewRequest({ requestId: rejected.request_id, action: 'APPROVE', actorEmail: APPROVER }), error => error.code === 'REQUEST_NOT_REVIEWABLE');
    assert.equal(stores.state.published.length, 0);
});

test('a NEED_VERIFICATION row is not further reviewable via the primary action (decided, not guessed — no resubmission flow exists yet)', () => {
    const needsVerification = { ...buildStaging({ requestId: 'REQ_NV' }), status: pipeline.STATUSES.needVerification };
    const stores = makeStores({ staging: [needsVerification] });
    const runtimeWrap = makeRuntime();
    const engine = makeEngine(stores, runtimeWrap);
    assert.throws(() => engine.reviewRequest({ requestId: needsVerification.request_id, action: 'APPROVE', actorEmail: APPROVER }), error => error.code === 'REQUEST_NOT_REVIEWABLE');
});

test('REQUEST_ID_MISSING and REQUEST_NOT_FOUND fail closed', () => {
    const stores = makeStores({ staging: [buildStaging({ requestId: 'REQ_EXISTS' })] });
    const runtimeWrap = makeRuntime();
    const engine = makeEngine(stores, runtimeWrap);
    assert.throws(() => engine.reviewRequest({ requestId: '', action: 'APPROVE', actorEmail: APPROVER }), /REQUEST_ID_MISSING/);
    assert.throws(() => engine.reviewRequest({ requestId: 'REQ_UNKNOWN', action: 'APPROVE', actorEmail: APPROVER }), /REQUEST_NOT_FOUND/);
    assert.throws(() => engine.reconcileRequest({ requestId: '', actorEmail: APPROVER }), /REQUEST_ID_MISSING/);
    assert.throws(() => engine.reconcileRequest({ requestId: 'REQ_UNKNOWN', actorEmail: APPROVER }), /REQUEST_NOT_FOUND/);
});

test('actor email is required for both review and reconcile (no anonymous/implicit actor)', () => {
    const stores = makeStores({ staging: [buildStaging({ requestId: 'REQ_ACTOR' })] });
    const runtimeWrap = makeRuntime();
    const engine = makeEngine(stores, runtimeWrap);
    assert.throws(() => engine.reviewRequest({ requestId: 'REQ_ACTOR', action: 'APPROVE', actorEmail: '' }), /ACTOR_EMAIL_MISSING/);
    assert.throws(() => engine.reconcileRequest({ requestId: 'REQ_ACTOR', actorEmail: '' }), /ACTOR_EMAIL_MISSING/);
});

test('canonicalPublishedEqual ignores updated_at/verified_at but catches real content drift', () => {
    const a = pipeline.buildPublishedRecord(buildStaging({ requestId: 'REQ_CMP' }), new Date('2026-01-01'));
    const b = pipeline.buildPublishedRecord(buildStaging({ requestId: 'REQ_CMP' }), new Date('2026-06-01'));
    assert.equal(canonicalPublishedEqual(pipeline, a, b), true);
    assert.equal(canonicalPublishedEqual(pipeline, a, { ...b, address: 'khác' }), false);
});
