const { test, expect } = require('@playwright/test');

// R1 state arbiter contract (forward-ported onto the current single-select service-chip filter
// UX — see docs/brain/03-decisions.md, "R3A"): `loc._visible` and marker layer membership
// (clusterGroup vs selectedLayer) must change atomically, through one function
// (`setLocationVisible`), so marker/list/preview/detail can never disagree about whether a
// location is currently shown or currently selected. See docs/redesign/CLAUDE_REVIEW_R0_V1.md
// (ARCH-1) for context.

// Real click on a service-filter chip (`#service-filter-primary .service-chip[data-service]`).
async function clickServiceChip(page, code) {
    await page.locator(`.service-chip[data-service="${code}"]`).click();
}

// Desktop-only, pre-existing, out-of-scope layout limitation (see panel-state-arbiter.spec.js):
// `#detail-panel` visually covers `#search-panel` — including its service chips — whenever a
// location is selected on desktop, so a real pointer click cannot reach a chip in that state. This
// is the same reachability gap R1's original checkbox-era `toggleFilterCheckbox` worked around; it
// is unrelated to which filter control lives inside `#search-panel` and out of scope for R3A (no
// visual redesign). Dispatches a real DOM click on the chip element directly — the actual
// production click handler (event delegation on `#service-filter-group`) still runs for real; only
// the click's origin (pointer vs `element.click()`) is synthetic.
async function clickServiceChipWhileDetailOpen(page, code) {
    await page.evaluate((service) => {
        document.querySelector(`.service-chip[data-service="${service}"]`).click();
    }, code);
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

test('changing the service filter to exclude the selected location clears it cleanly, then a fresh selection is clean', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    // Fixture rows where (index % 4 === 0) normalize to canonical service IDENTITY (legacy "Điểm
    // CCCD"); every other row (this one, index 1 / "khu vực 2") normalizes to OTHER (legacy "Trụ
    // sở Công an") — see scripts/preview-server.js + lib/location-taxonomy.js.
    const secondResult = page.locator('#results-list .result-item').nth(1);
    await expect(secondResult).toBeVisible();
    await secondResult.click();
    await expect(page.locator('#detail-title')).toHaveText('Công an khu vực 2');
    await expect.poll(() => page.locator('#detail-panel').getAttribute('data-sheet-state')).toBe('expanded');
    await expect(page.locator('.marker-selected .marker-label')).toHaveText('Công an khu vực 2');

    // Activating IDENTITY excludes this OTHER-classified location: must hide it and close its
    // detail panel — proving taxonomy classification and the R1 visibility arbiter stay in
    // lockstep under the current single-select filter model.
    await clickServiceChipWhileDetailOpen(page, 'IDENTITY');
    await expect.poll(() => page.locator('#detail-panel').getAttribute('data-sheet-state')).toBe('hidden');
    await expect(page.locator('.marker-selected')).toHaveCount(0);
    await expect(page.locator('[data-id="PREVIEW-2"]')).toHaveCount(0);

    // Browsing state now: the chip is genuinely reachable by a real click. Clear the filter and
    // make a fresh selection — it must be the only one flagged selected, no residue of "khu vực 2".
    await clickServiceChip(page, 'IDENTITY');
    await expect(page.locator('[data-id="PREVIEW-2"]')).toBeVisible();
    const first = page.locator('#results-list .result-item').first();
    await first.click();
    await expect(page.locator('#detail-title')).toHaveText('Công an khu vực 1');
    await expect(page.locator('.marker-selected')).toHaveCount(1);
    await expect(page.locator('.marker-selected .marker-label')).toHaveText('Công an khu vực 1');
});

test('a canonical PUBLIC_SERVICE_CENTER + IDENTITY location auto-closes when a non-matching service chip is activated', async ({ page }) => {
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
    await expect(page.locator('#detail-badge')).toHaveText('Điểm tiếp nhận thủ tục hành chính');
    await expect.poll(() => page.locator('#detail-panel').getAttribute('data-sheet-state')).toBe('expanded');
    await expect(page.locator('.marker-selected')).toHaveCount(1);

    // This location's only canonical service is IDENTITY: activating a different, non-matching
    // primary chip must hide it and close its detail panel — proving classification (PR #66
    // taxonomy) and visibility (R1, forward-ported) stay in lockstep.
    await clickServiceChipWhileDetailOpen(page, 'RESIDENCE');
    await expect.poll(() => page.locator('#detail-panel').getAttribute('data-sheet-state')).toBe('hidden');
    await expect(page.locator('.marker-selected')).toHaveCount(0);
    await expect(result).toHaveCount(0);
});
