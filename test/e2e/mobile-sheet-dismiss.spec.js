const { test, expect } = require('@playwright/test');

// R2b: drag-dismissing the mobile detail sheet (`#drag-handle` past the dismiss threshold) must
// clear the same selection/marker/panel state that `closeDetailPanel()` clears via every other
// close affordance (back button, preview-close button, Escape). Before R2b, `endSheetDrag`
// handled a resolved-to-HIDDEN drag by calling `setSheetState(HIDDEN, ...)` directly — bypassing
// the selection-lifecycle cleanup `closeDetailPanel()` performs (`currentlySelectedLocation`,
// `detailSuspended`, marker layer membership, `applyPanelChrome`'s BROWSING chrome). See
// docs/brain/03-decisions.md.
//
// Every drag below is a REAL pointer drag via page.mouse (down / move x N / up), which Chromium
// delivers as genuine pointerdown/pointermove/pointerup events to `#drag-handle` (confirmed via a
// throwaway instrumented run: the handler's own `event.preventDefault()` suppresses the
// browser's compatibility mousedown, and the live `--sheet-translate` CSS value tracks each
// intermediate mouse position) — the same handlers a real touch or mouse drag would fire.
// `reducedMotion: 'reduce'` and `waitForSheetTransition` avoid a real race: the sheet's own
// open/expand CSS transition (see styles.css `#detail-panel`) can still be in flight when a test
// grabs `#drag-handle`'s bounding box, making the computed drag target stale mid-animation.
// `page.evaluate` is used only to read sheet geometry (`getSheetHeight`/`getPreviewHeight`,
// exposed on `window` because app.js is a classic, non-module script) or overlay class state —
// never to invoke a product handler or fake the interaction itself.

test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });

async function waitForSheetTransition(page) {
    await page.evaluate(() => new Promise(resolve => {
        const panel = document.getElementById('detail-panel');
        const done = () => { panel.removeEventListener('transitionend', done); resolve(); };
        panel.addEventListener('transitionend', done, { once: true });
        // Safety net: nothing to wait for if no transition was queued (already settled).
        setTimeout(resolve, 500);
    }));
}

async function sheetGeometry(page) {
    return page.evaluate(() => ({
        sheetHeight: window.getSheetHeight(),
        previewHeight: window.getPreviewHeight(),
    }));
}

// A prior click that opens/expands the sheet can still be settling its own layout a tick later
// (e.g. a subsequent focus() call scrolling its target into view), which would make a boundingBox
// read taken too early stale by the time the drag actually starts. Poll until two consecutive
// reads agree instead of guessing a fixed delay.
async function stableBoundingBox(locator, { tries = 20, intervalMs = 25 } = {}) {
    let previous = await locator.boundingBox();
    for (let i = 0; i < tries; i += 1) {
        await new Promise(resolve => setTimeout(resolve, intervalMs));
        const current = await locator.boundingBox();
        if (previous && current && Math.abs(previous.y - current.y) < 0.5 && Math.abs(previous.x - current.x) < 0.5) {
            return current;
        }
        previous = current;
    }
    return previous;
}

async function dragHandleBy(page, deltaY) {
    const handle = page.locator('#drag-handle');
    const box = await stableBoundingBox(handle);
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    const steps = 10;
    for (let i = 1; i <= steps; i += 1) {
        await page.mouse.move(x, y + (deltaY * i) / steps);
    }
    await page.mouse.up();
}

// Overshoots by well more than the sheet's own height; `applySheetTranslate` clamps the translate
// to [0, sheetHeight], so this reliably lands exactly on the HIDDEN offset (distance 0) regardless
// of the sheet's starting offset — a genuine, unambiguous dismiss.
async function dragPastDismissThreshold(page) {
    await waitForSheetTransition(page);
    const { sheetHeight } = await sheetGeometry(page);
    await dragHandleBy(page, sheetHeight + 200);
}

// From EXPANDED (offset 0), lands exactly on the COLLAPSED offset — a real partial swipe, clearly
// short of the HIDDEN offset (distance previewHeight away), so it cannot resolve to a dismiss.
async function dragFromExpandedToCollapsed(page) {
    await waitForSheetTransition(page);
    const { sheetHeight, previewHeight } = await sheetGeometry(page);
    await dragHandleBy(page, sheetHeight - previewHeight);
}

async function selectFirstResult(page) {
    await page.click('#mobile-search-btn');
    await page.locator('#results-list .result-item').first().click();
    await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'collapsed');
}

async function expandSheet(page) {
    await page.locator('#preview-expand-btn').click();
    await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'expanded');
}

// classList membership check, not a substring regex: `#mobile-overlay` always carries the
// responsive utility class `md:hidden`, which a naive `/hidden/` pattern would false-match.
async function isMobileOverlayOpen(page) {
    return page.evaluate(() => {
        const overlay = document.getElementById('mobile-overlay');
        return !overlay.classList.contains('hidden') && !overlay.classList.contains('opacity-0');
    });
}

test.describe('mobile detail sheet drag-dismiss', () => {
    test('full drag-dismiss clears selection, marker, and panel chrome — no residue', async ({ page }) => {
        await page.goto('/');
        await selectFirstResult(page);
        const firstTitle = await page.locator('#location-preview-title').textContent();
        await expect(page.locator('.marker-selected .marker-label')).toHaveText(firstTitle);

        await dragPastDismissThreshold(page);

        await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'hidden');
        await expect(page.locator('body')).toHaveAttribute('data-panel-state', 'browsing');
        await expect(page.locator('.marker-selected')).toHaveCount(0);
    });

    test('partial drag from expanded to collapsed keeps the selection intact', async ({ page }) => {
        await page.goto('/');
        await selectFirstResult(page);
        await expandSheet(page);
        const firstTitle = await page.locator('#detail-title').textContent();

        await dragFromExpandedToCollapsed(page);

        await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'collapsed');
        await expect(page.locator('body')).toHaveAttribute('data-panel-state', 'detail');
        await expect(page.locator('#location-preview-title')).toHaveText(firstTitle);
        await expect(page.locator('.marker-selected .marker-label')).toHaveText(firstTitle);
    });

    test('dismiss A then select B: only B ends up selected, no residue of A', async ({ page }) => {
        await page.goto('/');
        await selectFirstResult(page);
        const firstTitle = await page.locator('#location-preview-title').textContent();

        await dragPastDismissThreshold(page);
        await expect(page.locator('.marker-selected')).toHaveCount(0);

        await page.click('#mobile-search-btn');
        await page.locator('#results-list .result-item').nth(1).click();
        const secondTitle = await page.locator('#location-preview-title').textContent();
        expect(secondTitle).not.toBe(firstTitle);

        await expect(page.locator('.marker-selected')).toHaveCount(1);
        await expect(page.locator('.marker-selected .marker-label')).toHaveText(secondTitle);
    });

    test('switching nav tabs away and back preserves a live (not dismissed) selection', async ({ page }) => {
        await page.goto('/');
        await selectFirstResult(page);
        const firstTitle = await page.locator('#location-preview-title').textContent();

        await page.locator('[data-app-tab="chat"]').click();
        await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'hidden');

        await page.locator('[data-app-tab="map"]').click();
        await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'collapsed');
        await expect(page.locator('#location-preview-title')).toHaveText(firstTitle);
        await expect(page.locator('.marker-selected .marker-label')).toHaveText(firstTitle);
    });

    test('a location dismissed via drag is not resurrected by switching nav tabs away and back', async ({ page }) => {
        await page.goto('/');
        await selectFirstResult(page);

        await dragPastDismissThreshold(page);
        await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'hidden');
        await expect(page.locator('.marker-selected')).toHaveCount(0);

        await page.locator('[data-app-tab="chat"]').click();
        await page.locator('[data-app-tab="map"]').click();

        await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'hidden');
        await expect(page.locator('.marker-selected')).toHaveCount(0);
    });

    test('dismiss then open mobile search and select B: R2a mutual exclusion still holds, no stale A', async ({ page }) => {
        await page.goto('/');
        await selectFirstResult(page);

        await dragPastDismissThreshold(page);

        await page.click('#mobile-search-btn');
        await expect.poll(() => isMobileOverlayOpen(page)).toBe(true);
        await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'hidden');

        await page.locator('#results-list .result-item').nth(1).click();
        await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'collapsed');
        await expect(page.locator('.marker-selected')).toHaveCount(1);
    });
});
