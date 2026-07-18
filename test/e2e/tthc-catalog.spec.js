const { test, expect } = require('@playwright/test');

async function openCatalog(page) {
    await page.goto('/');
    const mobileTab = page.locator('[data-app-tab="procedures"]');
    if (await mobileTab.isVisible()) await mobileTab.click();
    else await page.click('#tthc-catalog-toggle-btn');
    await expect(page.locator('#tthc-catalog-window')).toHaveClass(/tthc-catalog-window--visible/);
}

test('catalog opens with current committed dataset', async ({ page }) => {
    await openCatalog(page);
    await expect(page.getByRole('heading', { name: 'Bạn cần làm thủ tục gì?' })).toBeVisible();
    await expect(page.locator('.tthc-tile').first()).toBeVisible();
    await expect(page.locator('.tthc-suggest').first()).toHaveCSS('min-height', '44px');
});

test('catalog search keeps keyboard focus until the user submits the full query', async ({ page }) => {
    await openCatalog(page);

    const search = page.locator('#tthc-catalog-search');
    await search.click();
    await search.type('h');
    await expect(search).toBeFocused();
    await expect(page.locator('#tthc-catalog-home-view')).toBeVisible();
    await search.type('ộ chiếu');
    await expect(search).toHaveValue('hộ chiếu');
    await search.press('Enter');

    await expect(page.locator('#tthc-catalog-list-view')).toBeVisible();
    await expect(page.locator('.tthc-list-head')).toContainText('hộ chiếu');
});

test('catalog detail shows quick summary for a guide entry and keeps full content', async ({ page }) => {
    await openCatalog(page);

    await page.fill('#tthc-catalog-search', 'Việc nộp hồ sơ đăng ký cư trú');
    await page.locator('#tthc-catalog-search').press('Enter');
    const targetRow = page.locator('#tthc-catalog-list .tthc-row').filter({
        has: page.getByText('Việc nộp hồ sơ đăng ký cư trú', { exact: true }),
    });
    await expect(targetRow).toHaveCount(1);
    await targetRow.click();

    await expect(page.locator('#tthc-catalog-detail-view')).toBeVisible();
    await expect(page.locator('.tthc-summary-grid')).toContainText('Nộp tại');
    await expect(page.locator('.tthc-summary-grid .tthc-sum')).toHaveCount(4);
    await expect(page.locator('.tthc-acc-body')).toContainText('Trường hợp nộp hồ sơ trực tiếp');
});

test('catalog empty state suggests simpler keywords', async ({ page }) => {
    await openCatalog(page);

    await page.fill('#tthc-catalog-search', 'khong-ton-tai-123');
    await page.locator('#tthc-catalog-search').press('Enter');
    await expect(page.locator('.tthc-empty')).toContainText('Chưa tìm thấy thủ tục phù hợp.');
    await expect(page.locator('.tthc-empty')).toContainText('hộ chiếu');
    await expect(page.locator('.tthc-empty')).toContainText('tạm trú');
    await expect(page.locator('.tthc-empty')).toContainText('căn cước');
});

test('catalog mobile detail keeps summary readable above persistent navigation', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openCatalog(page);

    const panelBox = await page.locator('#tthc-catalog-window').boundingBox();
    if (!panelBox) throw new Error('catalog window not visible');
    expect(panelBox.width).toBeGreaterThan(360);

    await page.fill('#tthc-catalog-search', 'Việc nộp hồ sơ đăng ký cư trú');
    await page.locator('#tthc-catalog-search').press('Enter');
    await page.locator('#tthc-catalog-list .tthc-row').first().click();

    await expect(page.locator('.tthc-summary-grid')).toBeVisible();
    await expect(page.locator('.tthc-summary-grid .tthc-sum')).toHaveCount(4);
    const summaryColumnCount = await page.locator('.tthc-summary-grid').evaluate(element =>
        getComputedStyle(element).gridTemplateColumns.split(' ').length
    );
    expect(summaryColumnCount).toBe(1);
});

test('external procedure deep-link replaces stale list context', async ({ page }) => {
    await openCatalog(page);

    await page.fill('#tthc-catalog-search', 'hộ chiếu');
    await page.locator('#tthc-catalog-search').press('Enter');
    await page.locator('#tthc-catalog-list .tthc-row').first().click();
    await page.locator('#tthc-catalog-close-btn').click();

    await page.evaluate(title => window.TthcCatalog.openByTitle(title), 'Cấp đổi giấy chứng nhận căn cước');
    await expect(page.locator('#tthc-catalog-detail-view')).toBeVisible();

    await page.locator('#tthc-catalog-back-btn').click();
    await expect(page.locator('#tthc-catalog-list-view')).toBeVisible();
    await expect(page.locator('#tthc-catalog-subtitle')).toHaveText('Căn cước');
});
