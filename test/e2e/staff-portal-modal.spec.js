const { test, expect } = require('@playwright/test');

const imageFile = {
    name: 'location.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
};

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
    },
    snapshotHash: 'a'.repeat(64),
};

async function mockStaffApi(page, mutations) {
    await page.route('**/api/staff/auth/csrf', route => route.fulfill({ json: { ok: true, data: { csrfToken: 'csrf-test' } } }));
    await page.route('**/api/staff/session', route => route.fulfill({
        json: { ok: true, data: { user: { email: 'staff@example.test' }, units: [{ unitCode: 'UNIT_A', unitName: 'Đơn vị A' }] } },
    }));
    await page.route('**/api/staff/locations', route => route.fulfill({ json: { ok: true, data: { locations: [locationItem] } } }));
    await page.route('**/api/staff/requests', async route => {
        mutations.push({ path: '/api/staff/requests', body: route.request().postDataJSON() });
        await route.fulfill({ json: { ok: true, data: {} } });
    });
    await page.route('**/api/staff/verification', async route => {
        mutations.push({ path: '/api/staff/verification', body: route.request().postDataJSON() });
        await route.fulfill({ json: { ok: true, data: {} } });
    });
    await page.route('https://accounts.google.com/**', route => route.abort());
}

async function openMode(page, mode) {
    const buttons = {
        create: '+ Thêm địa điểm mới',
        update: 'Cập nhật thông tin',
        correct: 'Báo địa chỉ/vị trí sai',
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
    await form.locator('[name=coordinates]').fill('21.3225,105.4027');
    await form.locator('[name=submitterName]').fill('Cán bộ kiểm thử');
    await form.locator('[name=services]').first().check();
    await form.locator('[name=image]').setInputFiles(imageFile);
}

test.describe('staff portal modal submit regression', () => {
    test('all modal modes use native submit and preserve cancel/close buttons', async ({ page }) => {
        const mutations = [];
        await mockStaffApi(page, mutations);
        await page.goto('/can-bo');
        await expect(page.locator('.staff-location-list')).toBeVisible();

        for (const mode of ['create', 'update', 'correct', 'stop', 'confirm']) {
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

        for (const mode of ['create', 'update', 'correct', 'stop', 'confirm']) {
            const backdrop = await openMode(page, mode);
            const form = backdrop.locator('form');
            if (mode === 'create') {
                await form.locator('[name=locationName]').fill('Địa điểm mới');
                await form.locator('[name=address]').fill('Địa chỉ mới');
                await form.locator('[name=siteType]').selectOption('HEADQUARTERS');
                await form.locator('[name=coordinates]').fill('21.3225,105.4027');
                await form.locator('[name=submitterName]').fill('Cán bộ kiểm thử');
                await form.locator('[name=services]').first().check();
            }
            if (['create', 'update', 'correct'].includes(mode)) await form.locator('[name=image]').setInputFiles(imageFile);
            await form.locator('button.staff-button-primary').click();
            await expect(page.locator('.staff-modal-backdrop')).toHaveCount(0);
        }

        expect(mutations.map(mutation => mutation.path)).toEqual([
            '/api/staff/requests',
            '/api/staff/requests',
            '/api/staff/requests',
            '/api/staff/requests',
            '/api/staff/verification',
        ]);
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
        await form.locator('[name=coordinates]').fill('21.3225,105.4027');
        await form.locator('[name=submitterName]').fill('Cán bộ kiểm thử');
        await form.locator('[name=image]').setInputFiles(imageFile);
        expect(await form.evaluate(node => node.checkValidity())).toBe(true);
        await form.locator('button.staff-button-primary').click();
        await expect(backdrop.locator('.staff-notice-warning')).toBeVisible();
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
        await form.locator('[name=locationName]').fill('Địa điểm mới');
        await form.locator('[name=address]').fill('Địa chỉ mới');
        await form.locator('[name=siteType]').selectOption('HEADQUARTERS');
        await form.locator('[name=coordinates]').fill('21.3225,105.4027');
        await form.locator('[name=submitterName]').fill('Cán bộ kiểm thử');
        await form.locator('[name=services]').first().check();
        await form.locator('[name=image]').setInputFiles(imageFile);
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

test.describe('staff portal submit progress UX', () => {
    test('submit gives immediate busy feedback: button text, disabled state and a visible processing panel', async ({ page }) => {
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
        await expect(backdrop.locator('.staff-processing-panel')).toBeVisible();
        await expect(backdrop.locator('.staff-processing-panel')).toContainText('Đã chờ:');
        await expect(backdrop.locator('.staff-processing-panel')).not.toContainText('%');

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

        const elapsed = backdrop.locator('.staff-processing-elapsed');
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
        await expect(backdrop.locator('.staff-processing-panel')).toBeVisible();

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
        await expect(backdrop.locator('.staff-processing-panel')).toHaveCount(0);
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
});
