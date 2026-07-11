const { test, expect } = require('@playwright/test');

async function openFirstLocationPreview(page) {
    await page.click('#mobile-search-btn');
    await expect(page.locator('#results-list .result-item').first()).toBeVisible();
    await page.locator('#results-list .result-item').first().click();
    await expect.poll(() => page.locator('#detail-panel').getAttribute('data-sheet-state')).toBe('collapsed');
    await page.waitForTimeout(500);
}

test('mobile navigation replaces launchers and keeps the selected location across tabs', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const nav = page.locator('#mobile-bottom-nav');
    await expect(nav).toBeVisible();
    await expect(page.locator('#ai-chat-launcher')).toBeHidden();
    await expect(page.locator('#tthc-catalog-launcher')).toBeHidden();
    await expect(page.locator('[data-app-tab="map"]')).toHaveAttribute('aria-current', 'page');

    await openFirstLocationPreview(page);
    const selectedTitle = await page.locator('#location-preview-title').textContent();

    await page.locator('[data-app-tab="chat"]').click();
    await expect(page.locator('#ai-chat-window')).toHaveAttribute('aria-hidden', 'false');
    await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'hidden');
    await expect(page.locator('[data-app-tab="chat"]')).toHaveAttribute('aria-current', 'page');

    await page.locator('[data-app-tab="procedures"]').click();
    await expect(page.locator('#tthc-catalog-window')).toHaveAttribute('aria-hidden', 'false');
    await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'hidden');

    await page.locator('[data-app-tab="map"]').click();
    await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'collapsed');
    await expect(page.locator('#location-preview-title')).toHaveText(selectedTitle);
});

test('mobile preview, location control and persistent navigation do not overlap', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await openFirstLocationPreview(page);

    const boxes = await page.evaluate(() => ({
        preview: document.getElementById('location-preview').getBoundingClientRect().toJSON(),
        nav: document.getElementById('mobile-bottom-nav').getBoundingClientRect().toJSON(),
        location: document.getElementById('find-location-btn').getBoundingClientRect().toJSON(),
    }));

    expect(Math.round(boxes.preview.height)).toBe(164);
    expect(boxes.preview.bottom).toBeLessThanOrEqual(boxes.nav.top + 1);
    expect(boxes.location.bottom).toBeLessThanOrEqual(boxes.preview.top - 8);

    await page.locator('#preview-expand-btn').click();
    await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'expanded');
    await expect(page.locator('#detail-hero')).toBeHidden();
    await expect(page.locator('#location-preview')).toBeVisible();
    await expect(page.locator('#map-actions')).not.toBeVisible();
    await expect(page.locator('#mobile-bottom-nav')).toBeVisible();
});

test('mobile procedure deep-link activates the Procedures tab and opens the requested detail', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const procedureId = await page.evaluate(async () => {
        const catalog = await fetch('data/tthc-catalog.json').then(response => response.json());
        return catalog.procedures[0].procedureId;
    });

    await page.evaluate(id => window.TthcCatalog.openProcedure(id), procedureId);
    await expect(page.locator('[data-app-tab="procedures"]')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#tthc-catalog-window')).toHaveAttribute('aria-hidden', 'false');
    await expect(page.locator('#tthc-catalog-detail-view')).toBeVisible();
    await expect(page.locator('#ai-chat-window')).toHaveAttribute('aria-hidden', 'true');
});

test('desktop clusters at low zoom and restores individual markers at zoom 14', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await expect(page.locator('#results-list .result-item').first()).toBeVisible();

    for (let i = 0; i < 7; i += 1) await page.locator('#zoom-out-btn').click();
    await expect.poll(() => page.locator('.marker-cluster-civic').count()).toBeGreaterThan(0);

    for (let i = 0; i < 11; i += 1) await page.locator('#zoom-in-btn').click();
    await expect.poll(() => page.locator('.marker-cluster-civic').count()).toBe(0);
    await expect.poll(() => page.locator('.marker-container').count()).toBeGreaterThan(0);

    const markerBox = await page.locator('.marker-container').first().boundingBox();
    expect(markerBox.width).toBeGreaterThanOrEqual(44);
    expect(markerBox.height).toBeGreaterThanOrEqual(44);
    await expect(page.locator('#mobile-bottom-nav')).toBeHidden();
});
