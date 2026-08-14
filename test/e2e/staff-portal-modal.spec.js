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
});
