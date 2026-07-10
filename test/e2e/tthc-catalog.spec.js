const { test, expect } = require('@playwright/test');

async function openCatalog(page) {
    await page.goto('/');
    await page.click('#tthc-catalog-toggle-btn');
    await expect(page.locator('#tthc-catalog-window')).toHaveClass(/tthc-catalog-window--visible/);
}

test('catalog opens with current committed dataset', async ({ page }) => {
    await openCatalog(page);
    await expect(page.locator('#tthc-catalog-chips')).toContainText('Tất cả92');
    await expect(page.locator('#tthc-catalog-list .tthc-card').first()).toBeVisible();
});

test('catalog detail shows quick summary for a guide entry and keeps full content', async ({ page }) => {
    await openCatalog(page);

    await page.fill('#tthc-catalog-search', 'Việc nộp hồ sơ đăng ký cư trú');
    const targetCard = page.locator('#tthc-catalog-list .tthc-card').filter({
        has: page.getByText('Việc nộp hồ sơ đăng ký cư trú', { exact: true }),
    });
    await expect(targetCard).toHaveCount(1);
    await targetCard.click();

    await expect(page.locator('#tthc-catalog-detail-view')).toBeVisible();
    await expect(page.locator('.tthc-citizen-summary')).toContainText('Tóm tắt nhanh');
    await expect(page.locator('.tthc-citizen-summary')).toContainText('Nộp tại');
    await expect(page.locator('.tthc-detail-text')).toContainText('Nội dung:');
    await expect(page.locator('.tthc-detail-text')).not.toHaveText(/^$/);
});

test('catalog empty state suggests simpler keywords', async ({ page }) => {
    await openCatalog(page);

    await page.fill('#tthc-catalog-search', 'khong-ton-tai-123');
    await expect(page.locator('.tthc-empty')).toContainText('Chưa tìm thấy thủ tục phù hợp.');
    await expect(page.locator('.tthc-empty')).toContainText('hộ chiếu');
    await expect(page.locator('.tthc-empty')).toContainText('tạm trú');
    await expect(page.locator('.tthc-empty')).toContainText('căn cước');
});

test('catalog mobile detail keeps summary readable in full-screen panel', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openCatalog(page);

    const panelBox = await page.locator('#tthc-catalog-window').boundingBox();
    if (!panelBox) throw new Error('catalog window not visible');
    expect(panelBox.width).toBeGreaterThan(360);

    await page.fill('#tthc-catalog-search', 'Việc nộp hồ sơ đăng ký cư trú');
    await page.locator('#tthc-catalog-list .tthc-card').first().click();

    await expect(page.locator('.tthc-citizen-summary')).toBeVisible();
    await expect(page.locator('.tthc-citizen-summary-item')).toHaveCount(4);
    await expect(page.locator('.tthc-citizen-summary')).toContainText('Tóm tắt nhanh');
});
