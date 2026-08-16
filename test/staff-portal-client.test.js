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

test('target DTO omits an absent replacement image but keeps a selected image', () => {
    const record = { record_id: 'R1', snapshotHash: 'd'.repeat(64) };
    const withoutImage = client.buildTargetPayload({ locationName: 'A', image: undefined }, 'Cập nhật địa điểm đang có', record);
    const withImage = client.buildTargetPayload({ locationName: 'A', image: { base64: 'aGVsbG8=' } }, 'Cập nhật địa điểm đang có', record);
    assert.equal('image' in withoutImage, false);
    assert.deepEqual(withImage.image, { base64: 'aGVsbG8=' });
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

test('portal unifies existing-location edits and only requires an image for create', () => {
    assert.match(portalSource, /button\('Chỉnh sửa thông tin', 'staff-button', \(\) => openModal\('update', item\)\)/);
    assert.doesNotMatch(portalSource, /button\('Báo địa chỉ\/vị trí sai'/);
    assert.match(portalSource, /update: 'Chỉnh sửa thông tin'/);
    assert.match(portalSource, /const requiresLocationFields = \['create', 'update'\]\.includes\(modal\.mode\)/);
    assert.match(portalSource, /const requiresNewImage = modal\.mode === 'create'/);
    assert.match(portalSource, /servicesField\(form, source\.services, requiresLocationFields\)/);
    assert.match(portalSource, /Dịch vụ\$\{required \? ' \(bắt buộc\)' : ''\}/);
    assert.match(portalSource, /grid\.setAttribute\('aria-required', 'true'\)/);
    assert.doesNotMatch(portalSource, /input\.required = required &&/);
    assert.match(portalSource, /if \(requiresLocationFields && !values\.coordinates\) throw clientError\('COORDINATE_NEEDS_REVIEW'\)/);
    assert.match(portalSource, /imageInput\.required = requiresNewImage/);
    assert.match(portalSource, /if \(state\.modal\.mode === 'create' && !file\) throw clientError\('IMAGE_REQUIRED'\)/);
    assert.match(portalSource, /Thay ảnh địa điểm \(không bắt buộc\)/);
    assert.match(portalSource, /Ảnh hiện tại sẽ được giữ nguyên/);
    assert.match(portalSource, /staff-current-image/);
});

test('portal keeps service and image validation contracts', () => {
    assert.match(portalSource, /requiresLocationFields && !values\.services\.length/);
    assert.match(portalSource, /imageInput\.accept = 'image\/jpeg,image\/png,image\/webp'/);
    assert.match(portalSource, /StaffImage\.prepareImage\(file\)/);
});

test('submit progress UX gives immediate feedback without fake percentages or persisted state', () => {
    assert.match(portalSource, /processing:\s*null/);
    assert.match(portalSource, /function busyButtonLabel\(mode\)/);
    assert.match(portalSource, /'Đang xác nhận\.\.\.'/);
    assert.match(portalSource, /'Đang gửi\.\.\.'/);
    assert.match(portalSource, /primaryButton\.textContent = busyButtonLabel\(state\.modal\.mode\)/);
    assert.match(portalSource, /setFormControlsDisabled\(form, closeButton, true\)/);
    assert.match(portalSource, /function processingMessageForElapsed\(seconds\)/);
    assert.match(portalSource, /Đang chuẩn bị và gửi dữ liệu\.\.\./);
    assert.match(portalSource, /Hệ thống đang xử lý yêu cầu\.\.\./);
    assert.match(portalSource, /Yêu cầu vẫn đang được xử lý, vui lòng tiếp tục chờ\.\.\./);
    assert.match(portalSource, /const overlay = el\('div', 'staff-processing-overlay'\)/);
    assert.match(portalSource, /overlay\.setAttribute\('role', 'status'\)/);
    assert.match(portalSource, /overlay\.setAttribute\('aria-live', 'polite'\)/);
    assert.match(portalSource, /overlay\.setAttribute\('aria-busy', 'true'\)/);
    assert.match(portalSource, /document\.body\.appendChild\(overlay\)/);
    // No fake/simulated progress percentage anywhere in the portal source.
    assert.doesNotMatch(portalSource, /\d+\s*%/);
    // No persisted loading state — only in-memory state, per the same rule already enforced for form values.
    assert.doesNotMatch(portalSource, /localStorage|sessionStorage|IndexedDB/);
});

test('processing timer starts on submit and is stopped on every exit path (no orphan interval)', () => {
    assert.match(portalSource, /function startProcessingTimer\(onTick, overlay\)/);
    assert.match(portalSource, /function stopProcessingTimer\(\)/);
    assert.match(portalSource, /clearInterval\(state\.processing\.intervalId\)/);
    assert.match(portalSource, /startProcessingTimer\(seconds => \{/);
    // Stopped on the success path, before the modal closes.
    assert.match(portalSource, /stopProcessingTimer\(\);\s*\n\s*state\.modal = null;\s*\n\s*state\.busy = false;\s*\n\s*renderAuthorized\(\);\s*\n\s*\} catch/);
    // Stopped as the very first statement of the catch block, covering every error exit (revoked, stale snapshot, generic).
    assert.match(portalSource, /\} catch \(error\) \{\s*\n\s*stopProcessingTimer\(\);\s*\n\s*state\.busy = false;/);
});

test('processing overlay is an accessible live region with a decorative, non-spammy spinner and timer', () => {
    assert.match(portalSource, /overlay\.setAttribute\('role', 'status'\)/);
    assert.match(portalSource, /overlay\.setAttribute\('aria-live', 'polite'\)/);
    assert.match(portalSource, /state\.processing\?\.overlay\?\.remove\(\)/);
    assert.match(portalSource, /spinner\.setAttribute\('aria-hidden', 'true'\)/);
    assert.match(portalSource, /elapsed\.setAttribute\('aria-hidden', 'true'\)/);
});
