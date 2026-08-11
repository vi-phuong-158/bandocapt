const { test, expect } = require('@playwright/test');

test.describe('staff portal route', () => {
    for (const route of ['/can-bo', '/can-bo/']) {
        test(`${route} serves the portal entry`, async ({ page }) => {
            const response = await page.goto(route);
            expect(response.status()).toBe(200);
            await expect(page).toHaveTitle(/Cổng cập nhật địa điểm/);
            await expect(page.locator('#staff-portal')).toBeVisible();
            await expect(page.locator('script[src*="accounts.google.com/gsi/client"]')).toHaveCount(1);
        });
    }
});
