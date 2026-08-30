const { test, expect } = require('@playwright/test');

const imageFile = {
    name: 'location.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
};

const VALID_MAPS_URL = 'https://maps.app.goo.gl/staff-portal-test';

const locationItem = {
    record: {
        record_id: 'RECORD-1',
        unit_code: 'UNIT_A',
        name: 'Công an phường Tiên Cát',
        site_type: 'HEADQUARTERS',
        services: ['POLICE_OFFICE'],
        address: 'Khu 1, phường Tiên Cát',
        phone: '0210 000 000',
        google_maps_url: '',
        coordinates: '21.3225,105.4027',
        cccd_service_mode: '',
        service_schedule: '',
        served_units: '',
        search_aliases: '',
        image_url: 'https://lh3.googleusercontent.com/d/public-location-image=w1000',
    },
    snapshotHash: 'a'.repeat(64),
};

const DEFAULT_UNITS = [{ unitCode: 'UNIT_A', unitName: 'Đơn vị A' }];

async function mockStaffApi(page, mutations, { units = DEFAULT_UNITS, userName = '', mapsResolve, location = locationItem, pendingRequests = [] } = {}) {
    await page.route('**/api/staff/auth/csrf', route => route.fulfill({ json: { ok: true, data: { csrfToken: 'csrf-test' } } }));
    await page.route('**/api/staff/session', route => route.fulfill({
        json: { ok: true, data: { user: { email: 'staff@example.test', name: userName }, units } },
    }));
    await page.route('**/api/staff/locations', route => route.fulfill({ json: { ok: true, data: { locations: [location], pendingRequests } } }));
    await page.route('**/api/staff/requests', async route => {
        mutations.push({ path: '/api/staff/requests', body: route.request().postDataJSON() });
        await route.fulfill({ json: { ok: true, data: {} } });
    });
    await page.route('**/api/staff/verification', async route => {
        mutations.push({ path: '/api/staff/verification', body: route.request().postDataJSON() });
        await route.fulfill({ json: { ok: true, data: {} } });
    });
    await page.route('**/api/staff/maps/resolve', async route => {
        if (mapsResolve) return mapsResolve(route);
        return route.fulfill({ json: { ok: true, data: { coordinates: { lat: 21.3225, lng: 105.4027 } } } });
    });
    // Keep successful-image assertions hermetic. The placeholder-specific tests below register
    // a later abort route for this same URL, which deliberately takes precedence.
    await page.route('https://lh3.googleusercontent.com/d/public-location-image=w1000', route => route.fulfill({
        contentType: imageFile.mimeType,
        body: imageFile.buffer,
    }));
    await page.route('https://accounts.google.com/**', route => route.abort());
}

async function openMode(page, mode) {
    const buttons = {
        create: '+ Thêm địa điểm mới',
        update: 'Chỉnh sửa thông tin',
        stop: 'Báo ngừng hoạt động',
        confirm: 'Xác nhận thông tin đúng',
    };
    await page.getByRole('button', { name: buttons[mode] }).click();
    return page.locator('.staff-modal-backdrop');
}

async function assertModalButtonTypes(backdrop) {
    await expect(backdrop.locator('form button.staff-button-primary')).toHaveAttribute('type', 'submit');
    await expect(backdrop.locator('form button.staff-button').filter({ hasText: 'Hủy' })).toHaveAttribute('type', 'button');
    await expect(backdrop.locator('.staff-modal-header button')).toHaveAttribute('type', 'button');
}

async function mockDelayedRequestsRoute(page, mutations, delayMs) {
    await page.unroute('**/api/staff/requests').catch(() => {});
    await page.route('**/api/staff/requests', async route => {
        await new Promise(resolve => setTimeout(resolve, delayMs));
        mutations.push({ path: '/api/staff/requests', body: route.request().postDataJSON() });
        await route.fulfill({ json: { ok: true, data: {} } });
    });
}

async function fillValidCreateForm(form) {
    await form.locator('[name=locationName]').fill('Địa điểm mới');
    await form.locator('[name=address]').fill('Địa chỉ mới');
    await form.locator('[name=siteType]').selectOption('HEADQUARTERS');
    await form.locator('[name=services]').first().check();
    await form.locator('[name=mapsUrl]').fill(VALID_MAPS_URL);
    await expect(form.locator('.staff-maps-status-success')).toBeVisible();
    await form.locator('[name=submitterName]').fill('Cán bộ kiểm thử');
    await form.locator('[name=image]').setInputFiles(imageFile);
}

test.describe('staff portal modal submit regression', () => {
    test('location card exposes only confirm, edit and stop actions', async ({ page }) => {
        const mutations = [];
        await mockStaffApi(page, mutations);
        await page.goto('/can-bo');
        const actions = page.locator('.staff-card-actions button');
        await expect(actions).toHaveText(['Xác nhận thông tin đúng', 'Chỉnh sửa thông tin', 'Báo ngừng hoạt động']);
        await expect(page.getByRole('button', { name: 'Báo địa chỉ/vị trí sai' })).toHaveCount(0);
    });

    test('all modal modes use native submit and preserve cancel/close buttons', async ({ page }) => {
        const mutations = [];
        await mockStaffApi(page, mutations);
        await page.goto('/can-bo');
        await expect(page.locator('.staff-location-list')).toBeVisible();

        for (const mode of ['create', 'update', 'stop', 'confirm']) {
            const backdrop = await openMode(page, mode);
            await assertModalButtonTypes(backdrop);
            await backdrop.locator('button.staff-button').filter({ hasText: 'Hủy' }).click();
            await expect(page.locator('.staff-modal-backdrop')).toHaveCount(0);
        }
    });

    test('valid submit reaches the correct staff API path for every mode', async ({ page }) => {
        const mutations = [];
        await mockStaffApi(page, mutations);
        await page.goto('/can-bo');
        await expect(page.locator('.staff-location-list')).toBeVisible();

        for (const mode of ['create', 'update', 'stop', 'confirm']) {
            const backdrop = await openMode(page, mode);
            const form = backdrop.locator('form');
            if (mode === 'create') {
                await fillValidCreateForm(form);
            } else if (mode === 'update') {
                await expect(form.locator('.staff-maps-status-success')).toBeVisible();
                await expect(form.locator('[name=image]')).not.toHaveAttribute('required', '');
                await expect(form.locator('.staff-current-image')).toHaveAttribute('src', locationItem.record.image_url);
            }
            await form.locator('button.staff-button-primary').click();
            await expect(page.locator('.staff-modal-backdrop')).toHaveCount(0);
        }

        expect(mutations.map(mutation => mutation.path)).toEqual([
            '/api/staff/requests',
            '/api/staff/requests',
            '/api/staff/requests',
            '/api/staff/verification',
        ]);
        expect(mutations[1].body.requestType).toBe('Cập nhật địa điểm đang có');
        expect('image' in mutations[1].body).toBe(false);
    });

    test('native required fields and service validation still prevent invalid requests', async ({ page }) => {
        const mutations = [];
        await mockStaffApi(page, mutations);
        await page.goto('/can-bo');
        await expect(page.locator('.staff-location-list')).toBeVisible();

        const backdrop = await openMode(page, 'create');
        const form = backdrop.locator('form');
        expect(await form.evaluate(node => node.checkValidity())).toBe(false);
        await form.locator('button.staff-button-primary').click();
        await expect.poll(() => mutations.length).toBe(0);

        await form.locator('[name=locationName]').fill('Địa điểm mới');
        await form.locator('[name=address]').fill('Địa chỉ mới');
        await form.locator('[name=siteType]').selectOption('HEADQUARTERS');
        await form.locator('[name=mapsUrl]').fill(VALID_MAPS_URL);
        await expect(form.locator('.staff-maps-status-success')).toBeVisible();
        await form.locator('[name=submitterName]').fill('Cán bộ kiểm thử');
        await form.locator('[name=image]').setInputFiles(imageFile);
        expect(await form.evaluate(node => node.checkValidity())).toBe(true);
        await form.locator('button.staff-button-primary').click();
        await expect(backdrop.locator('.staff-notice-warning')).toBeVisible();
        expect(mutations).toHaveLength(0);
    });

    test('a resolved maps URL but no service selected is still blocked before any request', async ({ page }) => {
        const mutations = [];
        await mockStaffApi(page, mutations);
        await page.goto('/can-bo');
        await expect(page.locator('.staff-location-list')).toBeVisible();

        const backdrop = await openMode(page, 'create');
        const form = backdrop.locator('form');
        await form.locator('[name=locationName]').fill('Địa điểm mới');
        await form.locator('[name=address]').fill('Địa chỉ mới');
        await form.locator('[name=siteType]').selectOption('HEADQUARTERS');
        await form.locator('[name=mapsUrl]').fill(VALID_MAPS_URL);
        await expect(form.locator('.staff-maps-status-success')).toBeVisible();
        await form.locator('[name=submitterName]').fill('Cán bộ kiểm thử');
        await form.locator('[name=image]').setInputFiles(imageFile);
        await form.locator('button.staff-button-primary').click();
        await expect(backdrop.locator('.staff-notice-warning')).toContainText('dịch vụ');
        expect(mutations).toHaveLength(0);
    });

    test('recoverable server error keeps the modal open, preserves entered fields and requires re-selecting the image', async ({ page }) => {
        const mutations = [];
        await mockStaffApi(page, mutations);
        let requestAttempts = 0;
        await page.unroute('**/api/staff/requests');
        await page.route('**/api/staff/requests', async route => {
            requestAttempts += 1;
            if (requestAttempts === 1) {
                await route.fulfill({ status: 503, json: { ok: false, error: { code: 'STAFF_GATEWAY_UNAVAILABLE' } } });
                return;
            }
            mutations.push({ path: '/api/staff/requests', body: route.request().postDataJSON() });
            await route.fulfill({ json: { ok: true, data: {} } });
        });
        await page.goto('/can-bo');
        await expect(page.locator('.staff-location-list')).toBeVisible();

        const backdrop = await openMode(page, 'create');
        const form = backdrop.locator('form');
        await fillValidCreateForm(form);
        await form.locator('button.staff-button-primary').click();

        // Modal stays open with the error shown, not silently reset as if the button had done nothing.
        await expect(page.locator('.staff-modal-backdrop')).toHaveCount(1);
        await expect(backdrop.locator('.staff-notice-warning')).toContainText('Hệ thống tạm thời chưa kết nối được dữ liệu');
        await expect(backdrop.locator('.staff-notice-warning')).toContainText('chọn lại ảnh');

        // Text/select/services values the user typed survive the re-render — nothing to redo.
        await expect(form.locator('[name=locationName]')).toHaveValue('Địa điểm mới');
        await expect(form.locator('[name=address]')).toHaveValue('Địa chỉ mới');
        await expect(form.locator('[name=siteType]')).toHaveValue('HEADQUARTERS');
        await expect(form.locator('[name=coordinates]')).toHaveValue('21.3225,105.4027');
        await expect(form.locator('[name=mapsUrl]')).toHaveValue(VALID_MAPS_URL);
        await expect(form.locator('[name=submitterName]')).toHaveValue('Cán bộ kiểm thử');
        await expect(form.locator('[name=services]').first()).toBeChecked();

        // The file input itself cannot be restored by the browser and must not carry over silently.
        expect(await form.locator('[name=image]').evaluate(node => node.files.length)).toBe(0);

        // Re-selecting only the image and submitting again succeeds and reaches the Gateway exactly once more.
        await form.locator('[name=image]').setInputFiles(imageFile);
        await form.locator('button.staff-button-primary').click();
        await expect(page.locator('.staff-modal-backdrop')).toHaveCount(0);
        expect(mutations.map(mutation => mutation.path)).toEqual(['/api/staff/requests']);
        expect(requestAttempts).toBe(2);
    });
});

test.describe('staff portal pending status and public images', () => {
    test('refetches authoritative pending status after submit and blocks competing card actions', async ({ page }) => {
        const mutations = [];
        await mockStaffApi(page, mutations);
        let locationReads = 0;
        await page.unroute('**/api/staff/locations');
        await page.route('**/api/staff/locations', route => {
            locationReads += 1;
            const pendingRequests = locationReads > 1
                ? [{ locationId: 'RECORD-1', unitCode: 'UNIT_A', type: 'Cập nhật địa điểm đang có', status: 'PENDING', submittedAt: '2026-08-23T01:02:03.000Z' }]
                : [];
            return route.fulfill({ json: { ok: true, data: { locations: [locationItem], pendingRequests } } });
        });
        await page.goto('/can-bo');
        await expect(page.locator('.staff-location-image')).toHaveAttribute('src', 'https://lh3.googleusercontent.com/d/public-location-image=w1000');

        const backdrop = await openMode(page, 'stop');
        await backdrop.locator('button.staff-button-primary').click();
        await expect(page.locator('.staff-modal-backdrop')).toHaveCount(0);
        await expect(page.getByText('Đang chờ duyệt')).toHaveCount(5);
        await expect(page.getByText('Yêu cầu chỉnh sửa thông tin đã được gửi.')).toBeVisible();
        await expect(page.getByText(/Đã gửi.*2026/)).toBeVisible();
        await expect(page.locator('.staff-card-actions button')).toHaveText(['Đang chờ duyệt', 'Đang chờ duyệt', 'Đang chờ duyệt']);
        await expect.poll(() => page.locator('.staff-card-actions button').evaluateAll(buttons => buttons.map(button => button.disabled))).toEqual([true, true, true]);
        expect(mutations.map(mutation => mutation.path)).toEqual(['/api/staff/requests']);
        expect(locationReads).toBeGreaterThanOrEqual(2);
    });

    test('falls back from an unavailable public image without breaking the location card', async ({ page }) => {
        const mutations = [];
        await mockStaffApi(page, mutations);
        await page.route('https://lh3.googleusercontent.com/d/public-location-image=w1000', route => route.abort());
        await page.goto('/can-bo');
        await expect(page.locator('.staff-location-list')).toBeVisible();
        await expect(page.locator('.staff-location-image.staff-image-placeholder')).toContainText('Không thể tải ảnh đã duyệt');
        await expect(page.getByRole('heading', { name: 'Công an phường Tiên Cát' })).toBeVisible();
    });

    test('keeps the approved image in the card and modal when a private replacement is pending', async ({ page }) => {
        const mutations = [];
        await mockStaffApi(page, mutations, {
            pendingRequests: [{
                locationId: 'RECORD-1', unitCode: 'UNIT_A', type: 'Cập nhật địa điểm đang có', status: 'PENDING',
                submittedAt: '2026-08-23T01:02:03.000Z', image_file_id: 'private-replacement-id', image_public_url: 'https://drive.google.com/uc?export=view&id=private-replacement-id',
            }],
        });
        await page.goto('/can-bo');
        await expect(page.locator('.staff-location-image')).toHaveAttribute('src', 'https://lh3.googleusercontent.com/d/public-location-image=w1000');
        await expect(page.locator('.staff-pending-request strong')).toContainText('Đang chờ duyệt');
        await expect(page.getByRole('button', { name: 'Đang chờ duyệt' })).toHaveCount(3);
        await expect(page.locator('body')).not.toContainText('private-replacement-id');
        await expect(page.locator('.staff-location-image')).toHaveAttribute('src', /public-location-image/);
    });

    test('shows the same clean fallback in the update modal when the approved image request fails', async ({ page }) => {
        const mutations = [];
        await mockStaffApi(page, mutations);
        await page.route('https://lh3.googleusercontent.com/d/public-location-image=w1000', route => route.abort());
        await page.goto('/can-bo');
        await openMode(page, 'update');
        await expect(page.locator('.staff-current-image.staff-image-placeholder')).toContainText('Không thể tải ảnh đã duyệt hiện tại');
        await expect(page.getByText('Ảnh hiện tại sẽ được giữ nguyên')).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Chỉnh sửa thông tin' })).toBeVisible();
    });

    test('uses a stable placeholder for a location with no approved image', async ({ page }) => {
        const mutations = [];
        await mockStaffApi(page, mutations, { location: { ...locationItem, record: { ...locationItem.record, image_url: '' } } });
        await page.goto('/can-bo');
        await expect(page.locator('.staff-location-image.staff-image-placeholder')).toContainText('Chưa có ảnh đã duyệt');
        await openMode(page, 'update');
        await expect(page.locator('.staff-current-image.staff-image-placeholder')).toContainText('Địa điểm hiện chưa có ảnh đã duyệt');
    });

    test('mobile card and update modal keep the approved image inside the viewport', async ({ page }) => {
        const mutations = [];
        await page.setViewportSize({ width: 390, height: 844 });
        await mockStaffApi(page, mutations);
        await page.goto('/can-bo');
        const layout = await page.locator('.staff-location-card').evaluate(card => {
            const image = card.querySelector('.staff-location-image').getBoundingClientRect();
            const cardBox = card.getBoundingClientRect();
            return { imageRight: image.right, cardRight: cardBox.right, viewport: window.innerWidth };
        });
        expect(layout.imageRight).toBeLessThanOrEqual(layout.cardRight + 1);
        expect(layout.cardRight).toBeLessThanOrEqual(layout.viewport + 1);
        await openMode(page, 'update');
        await expect(page.locator('.staff-modal-card')).toBeVisible();
        await expect(page.locator('.staff-modal-card')).toHaveCSS('overflow-y', 'auto');
        await expect(page.locator('.staff-current-image')).toHaveAttribute('src', /public-location-image/);
    });
});

test.describe('staff portal form simplification', () => {
    test('E1: a single-unit account shows the unit read-only, with no free-text unit input anywhere', async ({ page }) => {
        const mutations = [];
        await mockStaffApi(page, mutations, { units: DEFAULT_UNITS });
        await page.goto('/can-bo');
        await expect(page.locator('.staff-location-list')).toBeVisible();

        const backdrop = await openMode(page, 'create');
        const form = backdrop.locator('form');
        await expect(form.locator('.staff-readonly-value').first()).toHaveText('Đơn vị A');
        await expect(form.locator('select[name=unitCode]')).toHaveCount(0);
        await expect(form.locator('input[type=text][name=unitCode]')).toHaveCount(0);
        // The only "unitCode" the form carries is the hidden, non-editable, server-verified one.
        await expect(form.locator('[name=unitCode]')).toHaveAttribute('type', 'hidden');
        await expect(form.locator('[name=unitCode]')).toHaveValue('UNIT_A');
        // No free-text email input exists anywhere in the authenticated shell.
        await expect(page.locator('input[name=email]')).toHaveCount(0);
        await expect(page.getByText('staff@example.test')).toBeVisible();
    });

    test('E5: a multi-unit account shows a dropdown restricted to exactly the authorized units', async ({ page }) => {
        const mutations = [];
        const units = [
            { unitCode: 'UNIT_A', unitName: 'Đơn vị A' },
            { unitCode: 'UNIT_B', unitName: 'Đơn vị B' },
        ];
        await mockStaffApi(page, mutations, { units });
        await page.goto('/can-bo');
        await expect(page.locator('.staff-location-list')).toBeVisible();

        const backdrop = await openMode(page, 'create');
        const form = backdrop.locator('form');
        const unitSelect = form.locator('select[name=unitCode]');
        await expect(unitSelect).toBeVisible();
        const optionValues = await unitSelect.locator('option').evaluateAll(options => options.map(o => o.value));
        expect(optionValues.sort()).toEqual(['UNIT_A', 'UNIT_B']);
    });

    test('E2: pasting a Google Maps link shows a loading state then read-only resolved coordinates', async ({ page }) => {
        const mutations = [];
        let resolveRoute;
        const pending = new Promise(resolve => { resolveRoute = resolve; });
        await mockStaffApi(page, mutations, {
            mapsResolve: async route => {
                await pending;
                return route.fulfill({ json: { ok: true, data: { coordinates: { lat: 21.3225, lng: 105.4027 } } } });
            },
        });
        await page.goto('/can-bo');
        await expect(page.locator('.staff-location-list')).toBeVisible();

        const backdrop = await openMode(page, 'create');
        const form = backdrop.locator('form');
        await form.locator('[name=mapsUrl]').fill(VALID_MAPS_URL);
        await expect(form.locator('.staff-maps-status-row').filter({ hasText: 'Đang xác định vị trí' })).toBeVisible();
        resolveRoute();
        await expect(form.locator('.staff-maps-status-success')).toContainText('21.322500');
        await expect(form.locator('.staff-maps-status-success')).toContainText('105.402700');
        await expect(form.locator('[name=coordinates]')).toHaveValue('21.3225,105.4027');
    });

    test('E3: a resolver failure shows a warning and reveals the manual coordinate fallback', async ({ page }) => {
        const mutations = [];
        await mockStaffApi(page, mutations, {
            mapsResolve: route => route.fulfill({ status: 400, json: { ok: false, error: { code: 'COORDINATE_NEEDS_REVIEW' } } }),
        });
        await page.goto('/can-bo');
        await expect(page.locator('.staff-location-list')).toBeVisible();

        const backdrop = await openMode(page, 'create');
        const form = backdrop.locator('form');
        await form.locator('[name=mapsUrl]').fill(VALID_MAPS_URL);
        await expect(form.locator('.staff-maps-status-error')).toContainText('Chưa lấy được tọa độ');
        await expect(form.locator('.staff-maps-manual')).toBeVisible();

        const manualInput = form.locator('#staff-coordinates-manual');
        await manualInput.fill('21.3225,105.4027');
        await expect(form.locator('[name=coordinates]')).toHaveValue('21.3225,105.4027');
    });

    test('the manual coordinate toggle is reachable proactively, without waiting for a failure', async ({ page }) => {
        const mutations = [];
        await mockStaffApi(page, mutations);
        await page.goto('/can-bo');
        await expect(page.locator('.staff-location-list')).toBeVisible();

        const backdrop = await openMode(page, 'create');
        const form = backdrop.locator('form');
        await expect(form.locator('.staff-maps-manual')).toBeHidden();
        await form.locator('.staff-maps-manual-toggle').click();
        await expect(form.locator('.staff-maps-manual')).toBeVisible();
    });

    test('E4: create submit never lets the client type unit/email/coordinates — the request carries authoritative values', async ({ page }) => {
        const mutations = [];
        await mockStaffApi(page, mutations);
        await page.goto('/can-bo');
        await expect(page.locator('.staff-location-list')).toBeVisible();

        const backdrop = await openMode(page, 'create');
        const form = backdrop.locator('form');
        await fillValidCreateForm(form);
        await form.locator('button.staff-button-primary').click();
        await expect(page.locator('.staff-modal-backdrop')).toHaveCount(0);

        const submitted = mutations.find(mutation => mutation.path === '/api/staff/requests');
        expect(submitted.body.unitCode).toBe('UNIT_A');
        expect(submitted.body.coordinates).toBe('21.3225,105.4027');
        expect('email' in submitted.body).toBe(false);
    });

    test('a HEADQUARTERS site type auto-fills the location name from the unit, without overwriting a name the user already typed', async ({ page }) => {
        const mutations = [];
        await mockStaffApi(page, mutations);
        await page.goto('/can-bo');
        await expect(page.locator('.staff-location-list')).toBeVisible();

        const backdrop = await openMode(page, 'create');
        const form = backdrop.locator('form');
        // HEADQUARTERS is the default selection, so the auto-fill applies immediately on open.
        await expect(form.locator('[name=locationName]')).toHaveValue('Đơn vị A');

        // Switching away and typing a custom name, then back to HEADQUARTERS, must not clobber it.
        await form.locator('[name=siteType]').selectOption('MOBILE_POINT');
        await form.locator('[name=locationName]').fill('Điểm lưu động riêng');
        await form.locator('[name=siteType]').selectOption('HEADQUARTERS');
        await expect(form.locator('[name=locationName]')).toHaveValue('Điểm lưu động riêng');
    });

    test('a verified session display name renders the submitter name as read-only, not an editable input', async ({ page }) => {
        const mutations = [];
        await mockStaffApi(page, mutations, { userName: 'Cán Bộ Xác Thực' });
        await page.goto('/can-bo');
        await expect(page.locator('.staff-location-list')).toBeVisible();

        const backdrop = await openMode(page, 'create');
        const form = backdrop.locator('form');
        await expect(form.locator('.staff-readonly-value', { hasText: 'Cán Bộ Xác Thực' })).toBeVisible();
        await expect(form.locator('input[name=submitterName]')).toHaveCount(0);
    });

    test('missing a verified display name falls back to the existing editable submitter name input', async ({ page }) => {
        const mutations = [];
        await mockStaffApi(page, mutations, { userName: '' });
        await page.goto('/can-bo');
        await expect(page.locator('.staff-location-list')).toBeVisible();

        const backdrop = await openMode(page, 'create');
        const form = backdrop.locator('form');
        await expect(form.locator('input[name=submitterName]')).toBeVisible();
    });

    test('update mode preloads the existing coordinates without any resolver network call', async ({ page }) => {
        const mutations = [];
        let resolveCalls = 0;
        await mockStaffApi(page, mutations, {
            mapsResolve: async route => { resolveCalls += 1; return route.fulfill({ json: { ok: true, data: { coordinates: { lat: 0, lng: 0 } } } }); },
        });
        await page.goto('/can-bo');
        await expect(page.locator('.staff-location-list')).toBeVisible();

        const backdrop = await openMode(page, 'update');
        const form = backdrop.locator('form');
        await expect(form.locator('.staff-maps-status-success')).toContainText('21.322500');
        await expect(form.locator('[name=coordinates]')).toHaveValue('21.3225,105.4027');
        expect(resolveCalls).toBe(0);
    });
});

test.describe('staff portal submit progress UX', () => {
    test('CREATE submit gives immediate busy feedback in a centered viewport overlay', async ({ page }) => {
        const mutations = [];
        await mockStaffApi(page, mutations);
        await mockDelayedRequestsRoute(page, mutations, 800);
        await page.goto('/can-bo');
        await expect(page.locator('.staff-location-list')).toBeVisible();

        const backdrop = await openMode(page, 'create');
        const form = backdrop.locator('form');
        await fillValidCreateForm(form);
        const primaryButton = form.locator('button.staff-button-primary');
        await primaryButton.click();

        await expect(primaryButton).toHaveText('Đang gửi...');
        await expect(primaryButton).toBeDisabled();
        const overlay = page.locator('.staff-processing-overlay');
        const panel = overlay.locator('.staff-processing-panel');
        await expect(overlay).toBeVisible();
        await expect(overlay).toHaveAttribute('role', 'status');
        await expect(overlay).toHaveAttribute('aria-busy', 'true');
        await expect(panel).toContainText('Đã chờ:');
        await expect(panel).not.toContainText('%');
        const box = await panel.boundingBox();
        const viewport = page.viewportSize();
        expect(box).not.toBeNull();
        expect(box.y).toBeGreaterThan(0);
        expect(box.y + box.height).toBeLessThan(viewport.height);
        expect(await panel.evaluate(node => node.closest('form'))).toBeNull();

        await expect(page.locator('.staff-modal-backdrop')).toHaveCount(0, { timeout: 5000 });
    });

    test('elapsed seconds counter increments while the request is still in flight', async ({ page }) => {
        const mutations = [];
        await mockStaffApi(page, mutations);
        await mockDelayedRequestsRoute(page, mutations, 2500);
        await page.goto('/can-bo');
        await expect(page.locator('.staff-location-list')).toBeVisible();

        const backdrop = await openMode(page, 'create');
        const form = backdrop.locator('form');
        await fillValidCreateForm(form);
        await form.locator('button.staff-button-primary').click();

        const elapsed = page.locator('.staff-processing-elapsed');
        await expect(elapsed).toHaveText('Đã chờ: 0 giây');
        await expect(elapsed).toHaveText(/Đã chờ: [1-9]\d* giây/, { timeout: 3000 });

        await expect(page.locator('.staff-modal-backdrop')).toHaveCount(0, { timeout: 5000 });
    });

    test('rapid double form-submit fires exactly one Gateway request', async ({ page }) => {
        const mutations = [];
        await mockStaffApi(page, mutations);
        await mockDelayedRequestsRoute(page, mutations, 500);
        await page.goto('/can-bo');
        await expect(page.locator('.staff-location-list')).toBeVisible();

        const backdrop = await openMode(page, 'create');
        const form = backdrop.locator('form');
        await fillValidCreateForm(form);
        await form.evaluate(node => { node.requestSubmit(); node.requestSubmit(); });

        await expect(page.locator('.staff-modal-backdrop')).toHaveCount(0, { timeout: 5000 });
        expect(mutations.filter(mutation => mutation.path === '/api/staff/requests')).toHaveLength(1);
    });

    test('UPDATE submit without a replacement image shows the centered overlay', async ({ page }) => {
        const mutations = [];
        await mockStaffApi(page, mutations);
        await mockDelayedRequestsRoute(page, mutations, 800);
        await page.goto('/can-bo');
        await expect(page.locator('.staff-location-list')).toBeVisible();

        const backdrop = await openMode(page, 'update');
        const form = backdrop.locator('form');
        await form.locator('[name=locationName]').fill('Công an phường Tiên Cát đã cập nhật');
        await form.locator('button.staff-button-primary').click();
        await expect(page.locator('.staff-processing-overlay')).toBeVisible();
        await expect(page.locator('.staff-processing-panel')).toBeVisible();
        await expect(page.locator('.staff-modal-backdrop')).toHaveCount(0, { timeout: 5000 });
        expect(mutations).toHaveLength(1);
        expect('image' in mutations[0].body).toBe(false);
    });

    test('every interactive control is disabled while a request is in flight', async ({ page }) => {
        const mutations = [];
        await mockStaffApi(page, mutations);
        await mockDelayedRequestsRoute(page, mutations, 800);
        await page.goto('/can-bo');
        await expect(page.locator('.staff-location-list')).toBeVisible();

        const backdrop = await openMode(page, 'create');
        const form = backdrop.locator('form');
        await fillValidCreateForm(form);
        const primaryButton = form.locator('button.staff-button-primary');
        await primaryButton.click();

        await expect(form.locator('[name=locationName]')).toBeDisabled();
        await expect(form.locator('[name=services]').first()).toBeDisabled();
        await expect(form.locator('[name=image]')).toBeDisabled();
        await expect(primaryButton).toBeDisabled();
        await expect(form.locator('button.staff-button').filter({ hasText: 'Hủy' })).toBeDisabled();
        await expect(backdrop.locator('.staff-modal-header button')).toBeDisabled();

        await expect(page.locator('.staff-modal-backdrop')).toHaveCount(0, { timeout: 5000 });
    });

    test('success clears the processing panel, closes the modal and shows the success notice', async ({ page }) => {
        const mutations = [];
        await mockStaffApi(page, mutations);
        await mockDelayedRequestsRoute(page, mutations, 800);
        await page.goto('/can-bo');
        await expect(page.locator('.staff-location-list')).toBeVisible();

        const backdrop = await openMode(page, 'create');
        const form = backdrop.locator('form');
        await fillValidCreateForm(form);
        await form.locator('button.staff-button-primary').click();
        await expect(page.locator('.staff-processing-overlay')).toBeVisible();

        await expect(page.locator('.staff-modal-backdrop')).toHaveCount(0, { timeout: 5000 });
        await expect(page.locator('.staff-notice-success')).toContainText('Yêu cầu đã được gửi và đang chờ duyệt.');
    });

    test('server error stops the spinner, clears the processing panel and restores the normal button/field state', async ({ page }) => {
        const mutations = [];
        await mockStaffApi(page, mutations);
        await page.unroute('**/api/staff/requests');
        await page.route('**/api/staff/requests', route => route.fulfill({ status: 503, json: { ok: false, error: { code: 'STAFF_GATEWAY_UNAVAILABLE' } } }));
        await page.goto('/can-bo');
        await expect(page.locator('.staff-location-list')).toBeVisible();

        const backdrop = await openMode(page, 'create');
        const form = backdrop.locator('form');
        await fillValidCreateForm(form);
        const primaryButton = form.locator('button.staff-button-primary');
        await primaryButton.click();

        await expect(backdrop.locator('.staff-notice-warning')).toBeVisible();
        await expect(page.locator('.staff-processing-overlay')).toHaveCount(0);
        await expect(primaryButton).toHaveText('Gửi yêu cầu');
        await expect(primaryButton).toBeEnabled();
        await expect(form.locator('[name=locationName]')).toBeEnabled();
        await expect(form.locator('[name=locationName]')).toHaveValue('Địa điểm mới');
        expect(mutations).toHaveLength(0);
    });

    test('confirm mode shows "Đang xác nhận..." while busy and posts to /api/staff/verification exactly once', async ({ page }) => {
        const mutations = [];
        await mockStaffApi(page, mutations);
        await page.unroute('**/api/staff/verification');
        await page.route('**/api/staff/verification', async route => {
            await new Promise(resolve => setTimeout(resolve, 500));
            mutations.push({ path: '/api/staff/verification', body: route.request().postDataJSON() });
            await route.fulfill({ json: { ok: true, data: {} } });
        });
        await page.goto('/can-bo');
        await expect(page.locator('.staff-location-list')).toBeVisible();

        const backdrop = await openMode(page, 'confirm');
        const form = backdrop.locator('form');
        const primaryButton = form.locator('button.staff-button-primary');
        await primaryButton.click();

        await expect(primaryButton).toHaveText('Đang xác nhận...');
        await expect(primaryButton).toBeDisabled();

        await expect(page.locator('.staff-modal-backdrop')).toHaveCount(0, { timeout: 5000 });
        expect(mutations.map(mutation => mutation.path)).toEqual(['/api/staff/verification']);
    });

    test('reduced-motion and a mobile viewport keep processing visible without scrolling', async ({ page }) => {
        const mutations = [];
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.setViewportSize({ width: 390, height: 640 });
        await mockStaffApi(page, mutations);
        await mockDelayedRequestsRoute(page, mutations, 800);
        await page.goto('/can-bo');
        await expect(page.locator('.staff-location-list')).toBeVisible();

        const backdrop = await openMode(page, 'create');
        const form = backdrop.locator('form');
        await fillValidCreateForm(form);
        await form.locator('button.staff-button-primary').click();
        const panel = page.locator('.staff-processing-panel');
        await expect(panel).toBeVisible();
        await expect(page.locator('.staff-spinner')).toHaveCSS('animation-name', 'none');
        const box = await panel.boundingBox();
        expect(box).not.toBeNull();
        expect(box.y).toBeGreaterThan(0);
        expect(box.y + box.height).toBeLessThan(640);
        expect(await page.evaluate(() => window.scrollY)).toBe(0);

        await expect(page.locator('.staff-modal-backdrop')).toHaveCount(0, { timeout: 5000 });
    });
});

test.describe('staff portal retained flows (update/stop/confirm)', () => {
    test('S1/S2/S3: stop modal asks only for a note — no image, maps, coordinates, services or address field exist in the DOM', async ({ page }) => {
        const mutations = [];
        let resolveCalls = 0;
        await mockStaffApi(page, mutations, { mapsResolve: async route => { resolveCalls += 1; return route.fulfill({ json: { ok: true, data: { coordinates: { lat: 0, lng: 0 } } } }); } });
        await page.goto('/can-bo');
        await expect(page.locator('.staff-location-list')).toBeVisible();

        const backdrop = await openMode(page, 'stop');
        const form = backdrop.locator('form');
        await expect(form.locator('[name=image]')).toHaveCount(0);
        await expect(form.locator('[name=mapsUrl]')).toHaveCount(0);
        await expect(form.locator('[name=coordinates]')).toHaveCount(0);
        await expect(form.locator('[name=services]')).toHaveCount(0);
        await expect(form.locator('[name=address]')).toHaveCount(0);
        await expect(form.locator('[name=locationName]')).toHaveCount(0);
        await expect(form.locator('[name=reviewNote]')).toBeVisible();

        await form.locator('button.staff-button-primary').click();
        await expect(page.locator('.staff-modal-backdrop')).toHaveCount(0);
        expect(mutations.map(mutation => mutation.path)).toEqual(['/api/staff/requests']);
        expect(resolveCalls).toBe(0);
    });

    test('F1/F2/F3: confirm modal asks only for a note — no image, maps, coordinates, services or address field exist in the DOM', async ({ page }) => {
        const mutations = [];
        let resolveCalls = 0;
        await mockStaffApi(page, mutations, { mapsResolve: async route => { resolveCalls += 1; return route.fulfill({ json: { ok: true, data: { coordinates: { lat: 0, lng: 0 } } } }); } });
        await page.goto('/can-bo');
        await expect(page.locator('.staff-location-list')).toBeVisible();

        const backdrop = await openMode(page, 'confirm');
        const form = backdrop.locator('form');
        await expect(form.locator('[name=image]')).toHaveCount(0);
        await expect(form.locator('[name=mapsUrl]')).toHaveCount(0);
        await expect(form.locator('[name=coordinates]')).toHaveCount(0);
        await expect(form.locator('[name=services]')).toHaveCount(0);
        await expect(form.locator('[name=address]')).toHaveCount(0);
        await expect(form.locator('[name=locationName]')).toHaveCount(0);
        await expect(form.locator('[name=note]')).toBeVisible();

        await form.locator('button.staff-button-primary').click();
        await expect(page.locator('.staff-modal-backdrop')).toHaveCount(0);
        expect(mutations.map(mutation => mutation.path)).toEqual(['/api/staff/verification']);
        expect(resolveCalls, 'confirm must never call the maps resolver').toBe(0);
    });

    test('U2: edit mode re-resolves a replacement Maps URL and submits the updated coordinate without requiring an image', async ({ page }) => {
        const mutations = [];
        const NEW_MAPS_URL = 'https://maps.app.goo.gl/a-different-place';
        await mockStaffApi(page, mutations, {
            mapsResolve: async (route) => {
                const body = route.request().postDataJSON();
                if (body.mapsUrl === NEW_MAPS_URL) return route.fulfill({ json: { ok: true, data: { coordinates: { lat: 21.313428, lng: 105.411249 } } } });
                return route.fulfill({ json: { ok: true, data: { coordinates: { lat: 21.3225, lng: 105.4027 } } } });
            },
        });
        await page.goto('/can-bo');
        await expect(page.locator('.staff-location-list')).toBeVisible();

        const backdrop = await openMode(page, 'update');
        const form = backdrop.locator('form');
        // Preloaded from the existing record — matches the "no change" behavior already proven for update.
        await expect(form.locator('.staff-maps-status-success')).toContainText('21.322500');
        await expect(form.locator('[name=coordinates]')).toHaveValue('21.3225,105.4027');

        // Staff edits the location and pastes a replacement Maps link.
        await form.locator('[name=mapsUrl]').fill(NEW_MAPS_URL);
        await expect(form.locator('.staff-maps-status-success')).toContainText('21.313428');
        await expect(form.locator('[name=coordinates]')).toHaveValue('21.313428,105.411249');

        await form.locator('button.staff-button-primary').click();
        await expect(page.locator('.staff-modal-backdrop')).toHaveCount(0);

        const submitted = mutations.find(mutation => mutation.path === '/api/staff/requests');
        expect(submitted.body.coordinates).toBe('21.313428,105.411249');
        expect(submitted.body.mapsUrl).toBe(NEW_MAPS_URL);
        expect(submitted.body.requestType).toBe('Cập nhật địa điểm đang có');
        expect('image' in submitted.body).toBe(false);
        expect(submitted.body.targetRecordId).toBe(locationItem.record.record_id);
        expect(submitted.body.snapshotHash).toBe(locationItem.snapshotHash);
    });
});
