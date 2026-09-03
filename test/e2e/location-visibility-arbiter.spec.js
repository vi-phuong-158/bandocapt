const { test, expect } = require('@playwright/test');

// R1 state arbiter contract: `loc._visible` and marker layer membership (clusterGroup vs
// selectedLayer) must change atomically, through one function, so marker/list/preview/detail can
// never disagree about whether a location is currently shown or currently selected. See
// docs/brain/03-decisions.md and docs/redesign/CLAUDE_REVIEW_R0_V1.md (ARCH-1) for context.

// Toggles a quick-filter checkbox the same way its `change` listener expects, without going
// through its (desktop-hidden-while-detail-is-open) `<label>`. On desktop, `#detail-panel` sits
// visually on top of `#search-panel` — including its quick filters — whenever a location is
// selected, so a real mouse click cannot reach the checkbox in that state today (pre-R2a). The
// underlying `change` handler is exercised for real; only the input mechanism is synthetic.
async function toggleFilterCheckbox(page, id) {
    await page.evaluate((checkboxId) => {
        const el = document.getElementById(checkboxId);
        el.checked = !el.checked;
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }, id);
}

test('opening mobile search while a location is selected returns its marker to the cluster group', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    const firstResult = page.locator('#results-list .result-item').first();
    await expect(firstResult).toBeVisible();
    await firstResult.click();
    await expect(page.locator('#detail-title')).toHaveText('Công an khu vực 1');
    await expect.poll(() => page.locator('#detail-panel').getAttribute('data-sheet-state')).toBe('expanded');

    // `#mobile-search-btn` is CSS-hidden on desktop, but the state transition it triggers is what's
    // under test: before the fix, this deselected `currentlySelectedLocation` and only called
    // `marker.setIcon(...)`, never moving the marker back out of `selectedLayer`.
    await page.evaluate(() => window.showMobileSearch());
    await expect.poll(() => page.locator('#detail-panel').getAttribute('data-sheet-state')).toBe('hidden');

    // `selectedLayer` is a plain `L.layerGroup`: it ignores `removeOutsideVisibleBounds` and keeps
    // rendering its markers regardless of the viewport. `clusterGroup` (a MarkerClusterGroup, see
    // app.js) removes its markers once panned out of view. Dragging the map far away is therefore
    // a deterministic membership probe — no dependency on this fixture's clustering radius/spacing.
    //
    // The fixture's own farthest-east rows can legitimately linger a drag or two longer than
    // "Công an khu vực 1" (they're geographically closer to wherever the pan is heading), so the
    // assertion below targets that one marker by label rather than requiring every one of the 30
    // fixture markers to have cleared — that's the only marker this test is actually about.
    const box = await page.locator('#map').boundingBox();
    const cy = box.y + box.height / 2;
    for (let i = 0; i < 5; i += 1) {
        await page.mouse.move(box.x + box.width - 20, cy);
        await page.mouse.down();
        await page.mouse.move(box.x + 20, cy, { steps: 10 });
        await page.mouse.up();
    }
    await expect.poll(async () => {
        const labels = await page.locator('.marker-label').allTextContents();
        return labels.includes('Công an khu vực 1');
    }).toBe(false);
});

test('a location deselected via mobile search can be reselected normally', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    await page.click('#mobile-search-btn');
    await page.locator('#results-list .result-item').first().click();
    await expect.poll(() => page.locator('#detail-panel').getAttribute('data-sheet-state')).toBe('collapsed');

    // Real user flow on mobile: tap the search bar again while the preview sheet is still showing.
    await page.click('#mobile-search-btn');
    await expect.poll(() => page.locator('#detail-panel').getAttribute('data-sheet-state')).toBe('hidden');

    await expect(page.locator('#results-list .result-item').first()).toBeVisible();
    await page.locator('#results-list .result-item').first().click();
    await expect(page.locator('#location-preview-title')).toHaveText('Công an khu vực 1');
    await expect.poll(() => page.locator('#detail-panel').getAttribute('data-sheet-state')).toBe('collapsed');
});

test('a selected location auto-closes its detail panel when a quick filter makes it invisible', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    // Fixture rows where (index % 4 === 0) are typed "Điểm CCCD"; every other row (this one,
    // index 1 / "khu vực 2") is "Trụ sở Công an" — see scripts/preview-server.js.
    const secondResult = page.locator('#results-list .result-item').nth(1);
    await expect(secondResult).toBeVisible();
    await secondResult.click();
    await expect(page.locator('#detail-title')).toHaveText('Công an khu vực 2');
    await expect.poll(() => page.locator('#detail-panel').getAttribute('data-sheet-state')).toBe('expanded');

    await toggleFilterCheckbox(page, 'filter-police');
    await expect.poll(() => page.locator('#detail-panel').getAttribute('data-sheet-state')).toBe('hidden');
});

test('a canonical PUBLIC_SERVICE_CENTER + IDENTITY location auto-closes when the CCCD filter is turned off', async ({ page }) => {
    const fixture = {
        table: {
            cols: [
                { label: 'record_id' }, { label: 'name' }, { label: 'type' }, { label: 'address' },
                { label: 'phone' }, { label: 'coordinates' }, { label: 'site_type' }, { label: 'services' },
            ],
            rows: [{
                c: [
                    { v: 'CANONICAL-ARBITER-1' }, { v: 'Điểm tiếp nhận thủ tục hành chính – Arbiter Test' }, { v: '' },
                    { v: 'Phường Canonical, Phú Thọ' }, { v: '0210 000 004' }, { v: '21.33,105.43' },
                    { v: 'PUBLIC_SERVICE_CENTER' }, { v: 'IDENTITY' },
                ],
            }],
        },
    };
    await page.route('**/api/google-sheet**', route => route.fulfill({ json: fixture }));
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    const result = page.locator('[data-id="CANONICAL-ARBITER-1"]');
    await expect(result).toBeVisible();
    await result.click();
    await expect(page.locator('#detail-badge')).toHaveText('Điểm cấp CCCD');
    await expect.poll(() => page.locator('#detail-panel').getAttribute('data-sheet-state')).toBe('expanded');

    // This location is CCCD-only (not police): turning off "Điểm CCCD" must hide it and close its
    // detail panel — proving classification (R0.5) and visibility (R1) stay in lockstep.
    await toggleFilterCheckbox(page, 'filter-id');
    await expect.poll(() => page.locator('#detail-panel').getAttribute('data-sheet-state')).toBe('hidden');
    await expect(result).toHaveCount(0);
});
