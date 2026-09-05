const { test, expect } = require('@playwright/test');

const imageFile = {
    name: 'contribution.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
};

async function mockTurnstile(page) {
    await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js**', route => route.fulfill({
        contentType: 'application/javascript',
        body: `window.turnstile={render:function(element,options){window.__publicTurnstileOptions=options;setTimeout(function(){options.callback('e2e-captcha-token');},0);return 1;},reset:function(){setTimeout(function(){window.__publicTurnstileOptions.callback('e2e-captcha-token');},0);}};if(window.onPublicTurnstileLoad)window.onPublicTurnstileLoad();`,
    }));
}

async function mockContributionApi(page, submissions, { failFirst = false } = {}) {
    let postCount = 0;
    await page.route('**/api/location-contributions**', async route => {
        if (route.request().method() === 'GET') {
            const url = new URL(route.request().url());
            if (url.searchParams.get('config') === 'public') {
                return route.fulfill({ json: { ok: true, data: { turnstileSiteKey: '0xTEST_PUBLIC_SITE_KEY' } } });
            }
            if (url.searchParams.get('unitCode')) {
                return route.fulfill({ json: { ok: true, data: { locations: [{
                    recordId: 'record-public-1', unitCode: 'UNIT_NEW', name: 'Trụ sở Đơn vị mới', siteType: 'HEADQUARTERS',
                    services: ['IDENTITY'], address: 'Khu 1, Phú Thọ', phone: '', googleMapsUrl: 'https://www.google.com/maps/@21.3225,105.4027,16z',
                    serviceSchedule: '', servedUnits: '', imageUrl: 'https://images.example.test/current-location.jpg',
                }] } } });
            }
            return route.fulfill({ json: { ok: true, data: { units: [{ unitCode: 'UNIT_NEW', label: 'Đơn vị mới chưa có địa điểm' }] } } });
        }
        postCount += 1;
        submissions.push(route.request().postDataJSON());
        if (failFirst && postCount === 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
            return route.fulfill({ status: 503, json: { error: 'SERVICE_UNAVAILABLE' } });
        }
        return route.fulfill({ json: { ok: true, data: { status: 'PENDING', receiptId: 'receipt-e2e' } } });
    });
}

async function fillContributionForm(page) {
    await page.locator('[name=unitCode]').selectOption('UNIT_NEW');
    await page.locator('[name=siteType]').selectOption('HEADQUARTERS');
    await page.locator('[name=services][value=IDENTITY]').check();
    await page.locator('[name=locationName]').fill('Điểm tiếp dân mới');
    await page.locator('[name=address]').fill('Khu 1, Phú Thọ');
    await page.locator('[name=mapsUrl]').fill('https://www.google.com/maps/@21.3225,105.4027,16z');
    await page.locator('[name=image]').setInputFiles(imageFile);
}

test.describe('public location contribution form', () => {
    test('CREATE keeps address, Maps, image, site type, and services required', async ({ page }) => {
        await mockTurnstile(page);
        const submissions = [];
        await mockContributionApi(page, submissions);
        await page.goto('/dong-gop/');
        await page.locator('[name=unitCode]').selectOption('UNIT_NEW');

        for (const selector of ['[name=siteType]', '[name=address]', '[name=mapsUrl]', '[name=image]']) {
            await expect(page.locator(selector)).toHaveJSProperty('required', true);
            await expect(page.locator(selector)).toHaveAttribute('aria-required', 'true');
        }
        await expect(page.locator('#services-field')).toHaveAttribute('aria-required', 'true');
        await expect(page.locator('[name=services]').first()).toBeVisible();
        await expect(page.locator('[data-required-mark="address"]')).toBeVisible();
        await expect(page.locator('[data-required-mark="maps"]')).toBeVisible();
        await expect(page.locator('[data-required-mark="image"]')).toBeVisible();
        await expect(page.locator('[data-required-mark="services"]')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Gửi đóng góp' })).toBeDisabled();
    });

    test('mobile form loads without login, submits once, and shows pending-only success', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await mockTurnstile(page);
        const submissions = [];
        await mockContributionApi(page, submissions);
        await page.goto('/dong-gop/');

        await expect(page.getByRole('heading', { name: 'Đóng góp địa điểm' })).toBeVisible();
        await expect(page.locator('[name=unitCode]')).toBeEnabled();
        await expect(page.locator('[name=unitCode] option')).toHaveCount(2);
        await expect(page.getByText(/Đăng nhập|Google Sign-In|Google Sign-In/i)).toHaveCount(0);

        await fillContributionForm(page);
        const submit = page.getByRole('button', { name: 'Gửi đóng góp' });
        await expect(submit).toBeEnabled();
        await submit.click();
        await expect(page.locator('#public-contribution-status')).toHaveText(
            'Đã tiếp nhận yêu cầu. Thông tin chỉ thay đổi trên bản đồ sau khi được kiểm tra và phê duyệt.',
        );
        expect(submissions).toHaveLength(1);
        expect(submissions[0].requestType).toBe('Thêm địa điểm mới');
        expect(submissions[0].targetRecordId).toBe('');
        await expect(submit).toBeDisabled();
    });

    test('desktop error is safe, retry preserves the operation id, and double submit is guarded', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
        await mockTurnstile(page);
        const submissions = [];
        await mockContributionApi(page, submissions, { failFirst: true });
        await page.goto('/dong-gop/');
        await fillContributionForm(page);

        const submit = page.getByRole('button', { name: 'Gửi đóng góp' });
        const firstSubmit = submit.click();
        await expect(submit).toBeDisabled();
        await firstSubmit;
        await expect(page.locator('#public-contribution-status')).toContainText('Chưa gửi được đóng góp');
        expect(submissions).toHaveLength(1);
        const firstOperationId = submissions[0].operationId;

        await submit.click();
        await expect(page.locator('#public-contribution-status')).toHaveText(
            'Đã tiếp nhận yêu cầu. Thông tin chỉ thay đổi trên bản đồ sau khi được kiểm tra và phê duyệt.',
        );
        expect(submissions).toHaveLength(2);
        expect(submissions[1].operationId).toBe(firstOperationId);
        await expect(page.locator('.public-contribution-card')).toBeVisible();
    });

    test('update and stop use only the selected public target in the selected unit', async ({ page }) => {
        await mockTurnstile(page);
        const submissions = [];
        await mockContributionApi(page, submissions);
        await page.goto('/dong-gop/');
        await page.locator('[name=unitCode]').selectOption('UNIT_NEW');

        await page.locator('[name=requestType]').selectOption('Cập nhật địa điểm đang có');
        await expect(page.locator('[name=targetRecordId]')).toBeEnabled();
        await expect(page.locator('[name=targetRecordId]')).toHaveJSProperty('required', true);
        await expect(page.locator('[name=targetRecordId]')).toHaveAttribute('aria-required', 'true');
        await page.locator('[name=targetRecordId]').selectOption('record-public-1');
        await expect(page.locator('[name=address]')).toHaveJSProperty('required', false);
        await expect(page.locator('[name=mapsUrl]')).toHaveJSProperty('required', false);
        await expect(page.locator('[name=image]')).toHaveJSProperty('required', false);
        await page.locator('[name=address]').fill('Khu 2, Phú Thọ');
        await page.getByRole('button', { name: 'Gửi đóng góp' }).click();
        expect(submissions[0].requestType).toBe('Cập nhật địa điểm đang có');
        expect(submissions[0].targetRecordId).toBe('record-public-1');
        expect(submissions[0].image).toBeUndefined();

        await page.locator('[name=unitCode]').selectOption('UNIT_NEW');
        await page.locator('[name=requestType]').selectOption('Báo địa điểm ngừng hoạt động');
        await expect(page.locator('#location-fields')).toBeHidden();
        await expect(page.locator('[name=mapsUrl]')).toHaveJSProperty('required', false);
        await expect(page.locator('[name=image]')).toHaveJSProperty('required', false);
        await page.locator('[name=targetRecordId]').selectOption('record-public-1');
        await page.getByRole('button', { name: 'Gửi đóng góp' }).click();
        expect(submissions[1].requestType).toBe('Báo địa điểm ngừng hoạt động');
        expect(submissions[1].targetRecordId).toBe('record-public-1');
        expect(submissions[1].image).toBeUndefined();
    });

    test('UPDATE shows existing data as optional context and prefills services, address, Maps, and image state', async ({ page }) => {
        await mockTurnstile(page);
        const submissions = [];
        await mockContributionApi(page, submissions);
        await page.goto('/dong-gop/');
        await page.locator('[name=unitCode]').selectOption('UNIT_NEW');
        await page.locator('[name=requestType]').selectOption('Cập nhật địa điểm đang có');
        await page.locator('[name=targetRecordId]').selectOption('record-public-1');

        for (const selector of ['[name=siteType]', '[name=address]', '[name=mapsUrl]', '[name=image]']) {
            await expect(page.locator(selector)).toHaveJSProperty('required', false);
            await expect(page.locator(selector)).toHaveAttribute('aria-required', 'false');
        }
        await expect(page.locator('#services-field')).toHaveAttribute('aria-required', 'false');
        await expect(page.locator('[name=address]')).toHaveValue('Khu 1, Phú Thọ');
        await expect(page.locator('[name=mapsUrl]')).toHaveValue('https://www.google.com/maps/@21.3225,105.4027,16z');
        await expect(page.locator('[name=services][value=IDENTITY]')).toBeChecked();
        await expect(page.locator('[data-required-mark="address"]')).toBeHidden();
        await expect(page.locator('[data-required-mark="maps"]')).toBeHidden();
        await expect(page.locator('[data-required-mark="image"]')).toBeHidden();
        await expect(page.locator('[data-required-mark="services"]')).toBeHidden();
        await expect(page.locator('[data-optional-mark="address"]')).toBeVisible();
        await expect(page.locator('#address-help')).toHaveText('Giữ nguyên nếu địa chỉ không thay đổi.');
        await expect(page.locator('#maps-help')).toHaveText('Thông tin hiện tại đang được hiển thị. Chỉ thay đổi khi vị trí trên bản đồ đã thay đổi.');
        await expect(page.locator('#image-help')).toHaveText('Chỉ tải ảnh mới nếu muốn thay ảnh hiện tại.');
        await expect(page.locator('#current-image-status')).toHaveText('Địa điểm này đã có ảnh. Không cần tải lại ảnh nếu ảnh hiện tại vẫn đúng.');
    });

    test('partial update with only phone changed submits successfully without re-entering image or maps link', async ({ page }) => {
        await mockTurnstile(page);
        const submissions = [];
        await mockContributionApi(page, submissions);
        await page.goto('/dong-gop/');
        await page.locator('[name=unitCode]').selectOption('UNIT_NEW');

        await page.locator('[name=requestType]').selectOption('Cập nhật địa điểm đang có');
        await expect(page.locator('[name=targetRecordId]')).toBeEnabled();
        await page.locator('[name=targetRecordId]').selectOption('record-public-1');

        await page.locator('[name=publicPhone]').fill('0912345678');
        const submit = page.getByRole('button', { name: 'Gửi đóng góp' });
        await expect(submit).toBeEnabled();
        await submit.click();

        await expect(page.locator('#public-contribution-status')).toHaveText(
            'Đã tiếp nhận yêu cầu. Thông tin chỉ thay đổi trên bản đồ sau khi được kiểm tra và phê duyệt.',
        );
        expect(submissions).toHaveLength(1);
        expect(submissions[0].requestType).toBe('Cập nhật địa điểm đang có');
        expect(submissions[0].targetRecordId).toBe('record-public-1');
        expect(submissions[0].publicPhone).toBe('0912345678');
        expect(submissions[0].image).toBeUndefined();
    });
});
