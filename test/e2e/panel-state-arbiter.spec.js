const { test, expect } = require('@playwright/test');

// R2a canonical panel-state contract (forward-ported onto the current single-select service-chip
// filter UX — see docs/brain/03-decisions.md, "R3A"): exactly one of three mutually-exclusive UI
// surfaces owns the screen at a time — browsing (search-panel reachable), detail (a location's
// sheet is open), or mobile-search (the mobile-only search overlay). `applyPanelChrome` in app.js
// is the sole writer of this state; see docs/redesign/CLAUDE_REVIEW_R0_V1.md (ARCH-1) for context,
// and the R1 arbiter spec (location-visibility-arbiter.spec.js) for the marker-layer half of this
// invariant.
//
// Every interaction below uses REAL pointer input (`.click()`, not `page.evaluate`) unless a
// comment says otherwise — reachability is exactly what this file is proving.

test.describe('desktop panel reachability', () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test('service filter chips are unreachable while detail is open, and reachable again through the canonical close control', async ({ page }) => {
        await page.goto('/');

        const identityChip = page.locator('.service-chip[data-service="IDENTITY"]');
        // Baseline: before any location is selected, the chip is a real, clickable target.
        await expect(identityChip).toBeVisible();

        // Fixture index 1 ("khu vực 2") normalizes to canonical service OTHER, not IDENTITY — see
        // scripts/preview-server.js + lib/location-taxonomy.js.
        const secondResult = page.locator('#results-list .result-item').nth(1);
        await secondResult.click();
        await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'expanded');

        // `#detail-panel` now fully occupies the same box as `#search-panel` (both md:inset-0,
        // detail-panel stacked above at a higher z-index). A real click at the chip's own
        // coordinates must not reach it — Playwright's actionability check enforces this the same
        // way a real mouse would. This is a pre-existing, out-of-scope desktop layout limitation
        // (R2a flagged it; R3A does not change the layout — no visual redesign) that is unrelated
        // to which filter control lives inside `#search-panel`.
        await expect(identityChip).not.toHaveAttribute('aria-pressed', 'true', { timeout: 1000 }).catch(() => {});
        await expect(async () => {
            await identityChip.click({ timeout: 800 });
        }).rejects.toThrow();
        // Confirm the click genuinely never landed: the location stays selected/open.
        await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'expanded');

        // The canonical, always-reachable way back to a browsing state where filters work: the
        // detail panel's own close control.
        await page.locator('#back-to-list-btn').click();
        await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'hidden');

        // The chip is now genuinely reachable by a real click, and the click has a real effect.
        await identityChip.click();
        await expect(identityChip).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('[data-id="PREVIEW-2"]')).toHaveCount(0);
    });

    test('select, close, select another location: panel state is correct at every step', async ({ page }) => {
        await page.goto('/');

        const first = page.locator('#results-list .result-item').first();
        const second = page.locator('#results-list .result-item').nth(1);

        await first.click();
        await expect(page.locator('#detail-title')).toHaveText('Công an khu vực 1');
        await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'expanded');

        await page.locator('#back-to-list-btn').click();
        await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'hidden');
        await expect(page.locator('#results-list .result-item').first()).toBeVisible();

        await second.click();
        await expect(page.locator('#detail-title')).toHaveText('Công an khu vực 2');
        await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'expanded');

        // Only the newly-selected marker carries the selected style; the previous one doesn't.
        const labels = await page.locator('.marker-selected .marker-label').allTextContents();
        expect(labels).toEqual(['Công an khu vực 2']);
    });
});

test.describe('mobile panel reachability', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('select, open mobile search, return to browsing: no stale panel or stale marker', async ({ page }) => {
        await page.goto('/');

        await page.click('#mobile-search-btn');
        await page.locator('#results-list .result-item').first().click();
        await expect(page.locator('#location-preview-title')).toHaveText('Công an khu vực 1');
        await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'collapsed');
        await expect(page.locator('.marker-selected .marker-label')).toHaveText('Công an khu vực 1');

        // Real tap on the mobile search entry point while a location is selected.
        await page.click('#mobile-search-btn');
        await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'hidden');
        // The deselected marker must not still be flagged as selected (the exact bug R1 fixed).
        await expect(page.locator('.marker-selected')).toHaveCount(0);

        await page.locator('#results-list .result-item').nth(1).click();
        await expect(page.locator('#location-preview-title')).toHaveText('Công an khu vực 2');
        await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'collapsed');
        await expect(page.locator('.marker-selected .marker-label')).toHaveText('Công an khu vực 2');
    });

    test('repeated transitions never show two mutually-exclusive surfaces at once', async ({ page }) => {
        await page.goto('/');

        async function activeSurfaces() {
            return page.evaluate(() => {
                const overlayOpen = !document.getElementById('mobile-overlay').classList.contains('hidden')
                    && !document.getElementById('mobile-overlay').classList.contains('opacity-0');
                const sheetState = document.getElementById('detail-panel').dataset.sheetState;
                const detailOpen = sheetState === 'collapsed' || sheetState === 'expanded';
                return { overlayOpen, detailOpen };
            });
        }

        function assertMutuallyExclusive(surfaces) {
            expect(surfaces.overlayOpen && surfaces.detailOpen).toBe(false);
        }

        assertMutuallyExclusive(await activeSurfaces());

        await page.click('#mobile-search-btn');
        assertMutuallyExclusive(await activeSurfaces());

        await page.locator('#results-list .result-item').first().click();
        assertMutuallyExclusive(await activeSurfaces());
        expect((await activeSurfaces()).detailOpen).toBe(true);

        await page.locator('#preview-expand-btn').click();
        assertMutuallyExclusive(await activeSurfaces());
        await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'expanded');

        // Opening mobile search from a fully-expanded detail must close it, not layer on top.
        await page.click('#mobile-search-btn');
        assertMutuallyExclusive(await activeSurfaces());
        expect((await activeSurfaces()).overlayOpen).toBe(true);

        await page.locator('#close-search-btn').click();
        assertMutuallyExclusive(await activeSurfaces());
        expect((await activeSurfaces()).overlayOpen).toBe(false);
        expect((await activeSurfaces()).detailOpen).toBe(false);

        // Closing the overlay returns to the idle pill state: the search panel (and its results
        // list) is off-screen again until the mobile search entry point is tapped once more.
        await page.click('#mobile-search-btn');
        assertMutuallyExclusive(await activeSurfaces());
        await page.locator('#results-list .result-item').nth(1).click();
        assertMutuallyExclusive(await activeSurfaces());
        await page.locator('#preview-close-btn').click();
        assertMutuallyExclusive(await activeSurfaces());
        expect((await activeSurfaces()).detailOpen).toBe(false);
    });

    test('Escape while idle (nothing open) does not steal focus to the search button', async ({ page }) => {
        await page.goto('/');
        // Freshly loaded: no location selected, no mobile search overlay open — already idle.
        // (Deliberately not clicking `#map` first: a stray click can land on a fixture marker and
        // open its detail panel, which would make this assertion pass for the wrong reason.)
        await expect(page.locator('#results-list .result-item').first()).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.locator('#mobile-search-btn')).not.toBeFocused();
    });
});
