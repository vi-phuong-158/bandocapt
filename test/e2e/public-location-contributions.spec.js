const { test, expect } = require('@playwright/test');

const imageFile = {
    name: 'contribution.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
};

async function mockTurnstile(page) {
    await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js**', route => route.fulfill({
        contentType: 'application/javascript',
        body: `window.turnstile={render:function(element,options){setTimeout(function(){options.callback('e2e-captcha-token');},0);return 1;},reset:function(){}};if(window.onPublicTurnstileLoad)window.onPublicTurnstileLoad();`,
    }));
}

async function mockContributionApi(page, submissions, { failFirst = false } = {}) {
    let postCount = 0;
    await page.route('**/api/location-contributions**', async route => {
        if (route.request().method() === 'GET') {
            if (new URL(route.request().url()).searchParams.get('config') === 'public') {
                return route.fulfill({ json: { ok: true, data: { turnstileSiteKey: '0xTEST_PUBLIC_SITE_KEY' } } });
            }
            return route.fulfill({ json: { ok: true, data: { units: [{ unitCode: 'UNIT_NEW', label: 'Đơn vị mới chưa có địa điểm' }] } } });
        }
        postCount += 1;
        submissions.push(route.request().postDataJSON());
        if (failFirst && postCount === 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
            return route.fulfill({ status: 503, json: { error: 'SERVICE_UNAVAILABLE' } });
        }
        return route.fulfill({ json: { ok: true, data: { status: 'PENDING', receiptId: 'receipt-e2e' } } });
    });
}

async function fillContributionForm(page) {
    await page.locator('[name=unitCode]').selectOption('UNIT_NEW');
    await page.locator('[name=locationName]').fill('Điểm tiếp dân mới');
    await page.locator('[name=address]').fill('Khu 1, Phú Thọ');
    await page.locator('[name=mapsUrl]').fill('https://www.google.com/maps/@21.3225,105.4027,16z');
    await page.locator('[name=image]').setInputFiles(imageFile);
}

test.describe('public location contribution form', () => {
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
            'Đã tiếp nhận đóng góp. Thông tin sẽ chỉ hiển thị trên bản đồ sau khi được kiểm tra và phê duyệt.',
        );
        expect(submissions).toHaveLength(1);
        expect(submissions[0].requestType).toBe('Thêm địa điểm mới');
        expect(submissions[0].targetRecordId).toBeUndefined();
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
            'Đã tiếp nhận đóng góp. Thông tin sẽ chỉ hiển thị trên bản đồ sau khi được kiểm tra và phê duyệt.',
        );
        expect(submissions).toHaveLength(2);
        expect(submissions[1].operationId).toBe(firstOperationId);
        await expect(page.locator('.public-contribution-card')).toBeVisible();
    });
});
