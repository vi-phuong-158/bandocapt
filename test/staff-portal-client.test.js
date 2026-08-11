const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const client = require('../js/staff-api-client');
const image = require('../js/staff-image');

const portalSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'staff-portal.js'), 'utf8');
const signinSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'staff-google-signin.js'), 'utf8');

test('client operation IDs are stable for the same retry payload', () => {
    const first = client.buildTargetPayload({ locationName: 'A', address: 'B' }, 'Cập nhật địa điểm đang có', { record_id: 'R1', snapshotHash: 'a'.repeat(64) });
    const second = client.buildTargetPayload({ address: 'B', locationName: 'A' }, 'Cập nhật địa điểm đang có', { record_id: 'R1', snapshotHash: 'a'.repeat(64) });
    assert.equal(first.operationId, second.operationId);
    assert.match(first.operationId, /^[A-Za-z0-9_-]{1,120}$/);
});

test('request DTO builders enforce create/target/verification boundaries', () => {
    const create = client.buildCreatePayload({ locationName: 'A', email: 'not-authority', targetRecordId: 'bad', snapshotHash: 'bad' }, 'UNIT_A');
    assert.equal(create.requestType, 'Thêm địa điểm mới');
    assert.equal(create.unitCode, 'UNIT_A');
    assert.equal('targetRecordId' in create, false);
    assert.equal('snapshotHash' in create, false);
    assert.equal('email' in create, false);

    const target = client.buildTargetPayload({ locationName: 'A', reviewNote: 'note', actor: 'bad' }, 'Báo địa chỉ hoặc vị trí sai', { record_id: 'R1', snapshotHash: 'b'.repeat(64) });
    assert.deepEqual({ targetRecordId: target.targetRecordId, snapshotHash: target.snapshotHash }, { targetRecordId: 'R1', snapshotHash: 'b'.repeat(64) });
    assert.equal('actor' in target, false);

    const verification = client.buildVerificationPayload('ok', { record_id: 'R1', snapshotHash: 'c'.repeat(64) });
    assert.deepEqual(verification, { operationId: verification.operationId, recordId: 'R1', snapshotHash: 'c'.repeat(64), eventType: 'CONFIRM', note: 'ok' });
});

test('portal renders API text with safe DOM APIs and does not decode or persist Google credentials', () => {
    assert.match(portalSource, /textContent/);
    assert.doesNotMatch(portalSource, /innerHTML|insertAdjacentHTML/);
    assert.doesNotMatch(portalSource, /localStorage|sessionStorage|IndexedDB|console\.(log|debug)/);
    assert.doesNotMatch(portalSource, /google\.accounts\.id\.prompt/);
    assert.doesNotMatch(signinSource, /atob|jwt|decode/);
});

test('image compression target stays below the Vercel 3 MiB decoded limit', () => {
    assert.equal(image.TARGET_BYTES, 2.5 * 1024 * 1024);
    assert.equal(image.ACCEPTED_TYPES.has('image/jpeg'), true);
    assert.equal(image.ACCEPTED_TYPES.has('image/svg+xml'), false);
});
