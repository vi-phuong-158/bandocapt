// Ranh giới ảnh công khai của địa điểm: chỉ `Published_Locations.image_url` được ra tới UI công
// khai. Mọi trường ảnh riêng tư (staging/Drive/pointer nội bộ) phải bị chặn ở tầng DTO, và UI
// phải chịu được URL rỗng/sai dạng/không thuộc host được phép.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { normalizePublishedLocations } = require('../js/location-data');
const { filterPublicGoogleVisualizationPayload } = require('../api/google-sheet');
const pipeline = require('../setup/apps-script');
const { deterministicImageUrl } = require('../setup/location-admin-review');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const stylesSource = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

const PUBLIC_COLUMNS = [
    { label: 'record_id' }, { label: 'unit_code' }, { label: 'name' }, { label: 'type' },
    { label: 'address' }, { label: 'phone' }, { label: 'coordinates' }, { label: 'image_url' },
];

function publicPayload(imageUrl) {
    return {
        table: {
            cols: PUBLIC_COLUMNS,
            rows: [{
                c: [
                    { v: 'LOC_1' }, { v: 'CA_TEST' }, { v: 'Công an Phường Thử Nghiệm' }, { v: 'Trụ sở Công an' },
                    { v: 'Số 1, Phú Thọ' }, { v: '0210000049' }, { v: '21.325,105.365' }, { v: imageUrl },
                ],
            }],
        },
    };
}

// --- Public detail: ảnh có / không / sai dạng ---

test('a published record with a public image exposes exactly that URL to the public UI', () => {
    const imageUrl = deterministicImageUrl('drive-file-1');
    const { locations } = normalizePublishedLocations(publicPayload(imageUrl));

    assert.equal(locations.length, 1);
    assert.equal(locations[0].imageUrl, imageUrl);
    assert.match(imageUrl, /^https:\/\/drive\.google\.com\/uc\?export=view&id=/);
});

test('a published record without an image still normalizes into a usable location', () => {
    const { locations, rejected } = normalizePublishedLocations(publicPayload(''));

    assert.deepEqual(rejected, []);
    assert.equal(locations.length, 1);
    assert.equal(locations[0].imageUrl, '');
    // Phần thông tin còn lại không bị ảnh hưởng bởi việc thiếu ảnh.
    assert.equal(locations[0].name, 'Công an Phường Thử Nghiệm');
    assert.equal(locations[0].address, 'Số 1, Phú Thọ');
    assert.equal(locations[0].phone, '0210000049');
});

test('a malformed or foreign image URL never becomes a rendered image', () => {
    for (const value of ['not a url', 'javascript:alert(1)', 'https://evil.test/a.jpg', '   ']) {
        const { locations, rejected } = normalizePublishedLocations(publicPayload(value));
        assert.deepEqual(rejected, [], `row rejected for image value: ${value}`);
        assert.equal(locations.length, 1);
    }

    // `isAllowedLocationImage` trong app.js là cổng duy nhất quyết định có render ảnh hay không.
    const guard = appSource.match(/function isAllowedLocationImage\(imageUrl\) \{[\s\S]*?\n\}/);
    assert.ok(guard, 'isAllowedLocationImage not found');
    const isAllowedLocationImage = new Function(`${guard[0]}; return isAllowedLocationImage;`)();

    assert.equal(isAllowedLocationImage(''), false);
    assert.equal(isAllowedLocationImage('not a url'), false);
    assert.equal(isAllowedLocationImage('javascript:alert(1)'), false);
    assert.equal(isAllowedLocationImage('https://evil.test/a.jpg'), false);
    assert.equal(isAllowedLocationImage('https://drive.google.com/uc?export=view&id=x'), true);
    assert.equal(isAllowedLocationImage('https://lh3.googleusercontent.com/x'), true);
});

// --- Ranh giới public/private ---

test('public DTO filtering strips every private image field', () => {
    const filtered = filterPublicGoogleVisualizationPayload({
        table: {
            cols: [
                { label: 'record_id' }, { label: 'name' }, { label: 'coordinates' }, { label: 'image_url' },
                { label: 'image_file_id' }, { label: 'image_drive_url' }, { label: 'image_public_url' },
                { label: 'published_image_file_id' }, { label: 'image_mime_type' }, { label: 'image_resource_key' },
                { label: 'submitter_email' }, { label: 'reviewed_by' },
            ],
            rows: [{
                c: [
                    { v: 'LOC_1' }, { v: 'Điểm A' }, { v: '21.325,105.365' }, { v: 'https://drive.google.com/uc?export=view&id=pub' },
                    { v: 'private-file-id' }, { v: 'https://drive.google.com/file/d/private-file-id/view' },
                    { v: 'https://drive.google.com/uc?export=view&id=staging' }, { v: 'published-file-id' },
                    { v: 'image/jpeg' }, { v: 'resource-key' }, { v: 'canbo@example.gov.vn' }, { v: 'duyet@example.gov.vn' },
                ],
            }],
        },
    });

    assert.deepEqual(
        filtered.table.cols.map(column => column.label),
        ['record_id', 'name', 'coordinates', 'image_url'],
    );
    const serialized = JSON.stringify(filtered);
    for (const secret of ['private-file-id', 'published-file-id', 'resource-key', 'staging', 'canbo@example.gov.vn', 'duyet@example.gov.vn', 'image/jpeg']) {
        assert.equal(serialized.includes(secret), false, `private value leaked: ${secret}`);
    }
});

test('private image columns are not resolvable by the public normalizer either', () => {
    const { locations } = normalizePublishedLocations({
        table: {
            cols: [
                { label: 'record_id' }, { label: 'name' }, { label: 'coordinates' },
                { label: 'image_file_id' }, { label: 'published_image_file_id' }, { label: 'image_drive_url' },
            ],
            rows: [{
                c: [
                    { v: 'LOC_1' }, { v: 'Điểm A' }, { v: '21.325,105.365' },
                    { v: 'private-file-id' }, { v: 'published-file-id' }, { v: 'https://drive.google.com/file/d/private-file-id/view' },
                ],
            }],
        },
    });

    assert.equal(locations.length, 1);
    // Không có alias nào map các cột riêng tư này sang `imageUrl`.
    assert.equal(locations[0].imageUrl, '');
    assert.equal(JSON.stringify(locations).includes('private-file-id'), false);
    assert.equal(JSON.stringify(locations).includes('published-file-id'), false);
});

test('the public UI reads only the published image field, never a private one', () => {
    // Nguồn duy nhất của ảnh trong app.js là `loc.imageUrl` (map từ `image_url`).
    assert.match(appSource, /function applyDetailImage\(loc\) \{[\s\S]*?isAllowedLocationImage\(loc\.imageUrl\)/);
    assert.match(appSource, /detailImage\.src = loc\.imageUrl;/);
    for (const privateField of ['image_file_id', 'published_image_file_id', 'image_drive_url', 'image_public_url', 'imageFileId', 'publishedImageFileId', 'imageDriveUrl']) {
        assert.equal(appSource.includes(privateField), false, `private image field referenced in app.js: ${privateField}`);
    }
    // Lightbox dùng lại đúng ảnh của hero, không tự dựng URL từ ID nào khác.
    assert.match(appSource, /imageLightboxImage\.src = detailImage\.src;/);
});

test('a STOP/unpublished record cannot render an image through the public path', () => {
    // STOP xoá hẳn dòng khỏi `Published_Locations`, nên payload công khai không còn bản ghi —
    // không có bản ghi thì không có marker, không có detail, không có ảnh.
    const removed = { table: { cols: PUBLIC_COLUMNS, rows: [] } };
    const { locations } = normalizePublishedLocations(removed);
    assert.deepEqual(locations, []);

    // Và một dòng staging (PENDING/REJECTED/NEED_VERIFICATION) chỉ tồn tại ở workbook riêng tư:
    // kể cả nếu payload mang cột staging, DTO công khai vẫn cắt sạch trường ảnh của nó.
    const staging = filterPublicGoogleVisualizationPayload({
        table: {
            cols: [{ label: 'record_id' }, { label: 'status' }, { label: 'image_public_url' }, { label: 'image_file_id' }],
            rows: [{ c: [{ v: 'REQ_1' }, { v: 'PENDING' }, { v: 'https://drive.google.com/uc?export=view&id=staging' }, { v: 'staging-file' }] }],
        },
    });
    assert.deepEqual(staging.table.cols.map(column => column.label), ['record_id', 'status']);
    assert.equal(JSON.stringify(staging).includes('staging'), false);
});

// --- UPDATE semantics đọc bằng đúng đường công khai ---

test('UPDATE without a new image keeps the previously published image visible in the public UI', () => {
    const original = pipeline.buildPublishedRecord({
        record_id: 'LOC_1', unit_code: 'CA_TEST', location_name: 'Công an Phường Thử Nghiệm',
        site_type: 'HEADQUARTERS', services: 'POLICE_OFFICE', address: 'Số 1, Phú Thọ',
        public_phone: '0210000049', coordinates: '21.325,105.365',
        image_public_url: deterministicImageUrl('file-1'),
    });
    // Cùng phép tính giữ ảnh mà Admin Review dùng khi request không mang ảnh mới.
    const retained = pipeline.buildPublishedRecord({
        record_id: 'LOC_1', unit_code: 'CA_TEST', location_name: 'Công an Phường Thử Nghiệm',
        site_type: 'HEADQUARTERS', services: 'POLICE_OFFICE', address: 'Địa chỉ đã đổi, Phú Thọ',
        public_phone: '0210000049', coordinates: '21.325,105.365',
        image_public_url: original.image_url,
    });

    assert.equal(retained.image_url, deterministicImageUrl('file-1'));
    const { locations } = normalizePublishedLocations(publicPayload(retained.image_url));
    assert.equal(locations[0].imageUrl, deterministicImageUrl('file-1'));
});

test('UPDATE with a new image makes the public UI read the new URL, not the old one', () => {
    const replaced = pipeline.buildPublishedRecord({
        record_id: 'LOC_1', unit_code: 'CA_TEST', location_name: 'Công an Phường Thử Nghiệm',
        site_type: 'HEADQUARTERS', services: 'POLICE_OFFICE', address: 'Số 1, Phú Thọ',
        public_phone: '0210000049', coordinates: '21.325,105.365',
        image_public_url: deterministicImageUrl('file-new'),
    });

    const { locations } = normalizePublishedLocations(publicPayload(replaced.image_url));
    assert.equal(locations[0].imageUrl, deterministicImageUrl('file-new'));
    assert.equal(locations[0].imageUrl.includes('file-1'), false);
    // URL công khai gắn với file ID nên ảnh mới là một URL khác — client không thể hiện ảnh cũ
    // từ cache của URL cũ.
    assert.notEqual(deterministicImageUrl('file-new'), deterministicImageUrl('file-1'));
});

// --- Hành vi UI: lỗi ảnh, lightbox, hiệu năng ---

test('a failed public image falls back to the logo and disables the enlarge control', () => {
    assert.match(appSource, /detailImage\.addEventListener\("error"[\s\S]*?showDetailImageFallback\(\)/);
    assert.match(appSource, /function showDetailImageFallback\(\) \{[\s\S]*?detailImage\.src = 'assets\/logo\.png';[\s\S]*?detailImageButton\.disabled = true;/);
    // Không rơi vào vòng lặp lỗi khi chính logo cũng không tải được.
    assert.match(appSource, /detailImage\.addEventListener\("error", \(\) => \{\s*if \(!detailImageIsPublic\) return;/);
});

test('the lightbox is closable by Escape, backdrop and button, and Escape does not also close the detail panel', () => {
    assert.match(appSource, /if \(!imageLightbox\.hidden\) \{\s*closeImageLightbox\(\);\s*\} else if \(activeSheetState !== SHEET_STATES\.HIDDEN\)/);
    assert.match(appSource, /imageLightbox\.addEventListener\("click", event => \{\s*if \(event\.target === imageLightbox\) closeImageLightbox\(\);/);
    assert.match(appSource, /imageLightboxClose\.addEventListener\("click"/);
    // Đóng detail panel thì lightbox không được sống sót.
    assert.match(appSource, /function closeDetailPanel\([\s\S]*?closeImageLightbox\(\);/);
});

test('lightbox markup and styling are accessible and self-contained', () => {
    assert.match(indexSource, /id="image-lightbox"[^>]*role="dialog"[^>]*aria-modal="true"/);
    assert.match(indexSource, /id="image-lightbox-close"[^>]*aria-label="Đóng ảnh"/);
    assert.match(indexSource, /id="detail-image-button"[^>]*aria-label="Xem ảnh lớn của địa điểm"/);
    // Gradient trang trí không được chặn cú bấm vào ảnh.
    assert.match(indexSource, /bg-gradient-to-t[^"]*pointer-events-none/);
    // Ảnh lớn giữ đúng tỷ lệ và không vượt viewport; không thêm dependency UI nào.
    assert.match(stylesSource, /\.image-lightbox-image \{[\s\S]*?max-width: 100%;[\s\S]*?max-height: 100%;[\s\S]*?object-fit: contain;/);
    assert.match(stylesSource, /\.image-lightbox \{[\s\S]*?z-index: var\(--z-lightbox\);/);
});

test('map load does not preload images for every location', () => {
    // Ảnh chỉ được gán src khi mở đúng một địa điểm; vòng lặp dựng marker không chạm tới ảnh.
    const markerLoop = appSource.match(/normalized\.locations\.forEach\(\(item\) => \{[\s\S]*?locations\.push\(loc\);/);
    assert.ok(markerLoop, 'marker build loop not found');
    assert.equal(/\.src\s*=/.test(markerLoop[0]), false, 'marker loop assigns an image src');
    assert.match(appSource, /detailImage\.loading = 'lazy';/);
    // Không nhúng bytes ảnh vào payload công khai.
    assert.equal(appSource.includes('base64'), false);
});
