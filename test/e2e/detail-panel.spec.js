const { test, expect } = require('@playwright/test');

async function openFirstMobileResult(page) {
    await page.click('#mobile-search-btn');
    await expect(page.locator('#search-panel')).toHaveClass(/translate-y-0/);
    await expect(page.locator('#results-list .result-item').first()).toBeVisible();
    await page.locator('#results-list .result-item').first().click();
    await expect.poll(async () => page.locator('#detail-panel').getAttribute('data-sheet-state')).toBe('collapsed');
}

test('mobile detail panel closes reliably by button and drag gestures', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    await openFirstMobileResult(page);
    await page.locator('#preview-close-btn').click();
    await expect.poll(async () => page.locator('#detail-panel').getAttribute('data-sheet-state')).toBe('hidden');

    await openFirstMobileResult(page);
    await page.evaluate(() => {
        const handle = document.getElementById('drag-handle');
        const box = handle.getBoundingClientRect();
        const x = box.x + box.width / 2;
        const startY = box.y + box.height / 2;
        const endY = box.y + box.height + 350;
        handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 2, pointerType: 'touch', clientX: x, clientY: startY, button: 0 }));
        handle.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 2, pointerType: 'touch', clientX: x, clientY: endY, button: 0 }));
        handle.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 2, pointerType: 'touch', clientX: x, clientY: endY, button: 0 }));
    });
    await expect.poll(async () => page.locator('#detail-panel').getAttribute('data-sheet-state')).toBe('hidden');
});

test('mobile pointer cancel returns the sheet to a stable open state', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    await openFirstMobileResult(page);
    await page.evaluate(() => {
        const handle = document.getElementById('drag-handle');
        handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientY: 120, button: 0 }));
        handle.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientY: 220, button: 0 }));
        handle.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1, clientY: 220, button: 0 }));
    });

    await expect.poll(async () => page.locator('#detail-panel').getAttribute('data-sheet-state')).toBe('collapsed');
});

test('desktop escape closes detail panel and restores focus to the trigger', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    const firstResult = page.locator('#results-list .result-item').first();
    await expect(firstResult).toBeVisible();
    await firstResult.click();
    await expect.poll(async () => page.locator('#detail-panel').getAttribute('data-sheet-state')).toBe('expanded');

    await page.keyboard.press('Escape');
    await expect.poll(async () => page.locator('#detail-panel').getAttribute('data-sheet-state')).toBe('hidden');
    await expect(firstResult).toBeFocused();
});
