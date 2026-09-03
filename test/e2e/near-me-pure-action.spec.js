const { test, expect } = require('@playwright/test');

// PR #66 decision (see docs/brain/03-decisions.md, "R3A"): "Gần tôi" (`#find-location-btn`) is a
// pure sort/center action over the current filtered/searched result set — it must never hide or
// remove a marker/result the current search + service-chip filter already kept visible (the old
// Top-5 cut this replaced). `app.js` `centerOnNearestVisible` only reads `loc._visible` and calls
// `map.fitBounds`; it never writes `_visible` or removes a marker itself.
//
// Real geolocation is provided via Playwright's context geolocation API (a standard way to mock a
// browser API before the page loads), not by calling any app.js function directly — the click on
// `#find-location-btn` and everything downstream of it is a real, unmodified user interaction.

test.describe('near-me pure action', () => {
    test.use({
        viewport: { width: 1280, height: 800 },
        geolocation: { latitude: 21.25, longitude: 105.29 },
        permissions: ['geolocation'],
    });

    test('near-me sorts/centers without hiding any marker in the unfiltered set, and preserves a live selection', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('#results-list .result-item')).toHaveCount(30);

        const first = page.locator('#results-list .result-item').first();
        await first.click();
        const selectedTitle = await page.locator('#detail-title').textContent();
        await expect.poll(() => page.locator('#detail-panel').getAttribute('data-sheet-state')).toBe('expanded');
        await expect(page.locator('.marker-selected .marker-label')).toHaveText(selectedTitle);

        await page.locator('#find-location-btn').click();
        await expect.poll(() => page.locator('#location-icon').textContent()).toBe('my_location');

        // No Top-5 cut revival: the full unfiltered set is still rendered/markered.
        await expect(page.locator('#results-list .result-item')).toHaveCount(30);

        // The selection invariant is not broken by near-me: `find-location-btn`'s handler
        // deliberately re-opens `currentlySelectedLocation` after re-centering (see app.js), so the
        // same location stays the only one selected.
        await expect(page.locator('#detail-title')).toHaveText(selectedTitle);
        await expect.poll(() => page.locator('#detail-panel').getAttribute('data-sheet-state')).toBe('expanded');
        await expect(page.locator('.marker-selected')).toHaveCount(1);
        await expect(page.locator('.marker-selected .marker-label')).toHaveText(selectedTitle);
    });

    test('near-me respects the active service filter: it does not add its own hiding on top of the chip', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('#results-list .result-item')).toHaveCount(30);

        // Fixture rows where (index % 4 === 0) normalize to canonical service IDENTITY — 8 of the
        // 30 rows (indexes 0, 4, 8, ..., 28). See scripts/preview-server.js.
        await page.locator('.service-chip[data-service="IDENTITY"]').click();
        const filteredCount = await page.locator('#results-list .result-item').count();
        expect(filteredCount).toBe(8);
        expect(filteredCount).toBeLessThan(30);

        await page.locator('#find-location-btn').click();
        await expect.poll(() => page.locator('#location-icon').textContent()).toBe('my_location');

        // Same filtered set, not narrowed further by near-me (and not reset back to all 30 either).
        await expect(page.locator('#results-list .result-item')).toHaveCount(filteredCount);
    });
});
