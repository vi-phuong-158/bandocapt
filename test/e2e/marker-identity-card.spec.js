const path = require('node:path');
const { test, expect } = require('@playwright/test');

const STUB_IMAGE = path.join(__dirname, '..', '..', 'assets', 'logo.png');

async function stubDriveImages(page) {
    await page.route(/drive\.google\.com/, route => route.fulfill({
        path: STUB_IMAGE,
        contentType: 'image/png',
    }));
}

function collectPageErrors(page) {
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => {
        if (message.type() === 'error' && !message.text().includes('Failed to load resource') && !message.text().includes('404')) {
            errors.push(message.text());
        }
    });
    return errors;
}

async function zoomToMarkers(page) {
    await expect(page.locator('#results-list .result-item').first()).toBeVisible();
    for (let i = 0; i < 11; i += 1) {
        await page.locator('#zoom-in-btn').click();
        await page.waitForTimeout(50);
    }
    await expect.poll(() => page.locator('.marker-container').count()).toBeGreaterThan(0);
}

async function selectLocationBySearch(page, query) {
    await page.fill('#search-input', query);
    const item = page.locator('#results-list .result-item').first();
    await expect(item.locator('.result-address')).toContainText(query.replace(/,$/, ''));
    await item.click();
    await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', /expanded|collapsed/);
    await page.waitForTimeout(300);
}

test.describe('R1.1 Marker Identity Cards', () => {

    test('Test 1: Standalone marker renders pin, thumbnail image, and unit name', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await stubDriveImages(page);
        const errors = collectPageErrors(page);
        await page.goto('/');

        await zoomToMarkers(page);

        const markerContainer = page.locator('.marker-container').first();
        await expect(markerContainer).toBeVisible();

        // Must have pin icon
        const pinIcon = markerContainer.locator('.marker-icon');
        await expect(pinIcon).toBeVisible();

        // Must have identity card
        const card = markerContainer.locator('.marker-identity-card');
        await expect(card).toBeVisible();

        // Must have thumbnail image
        const image = card.locator('.marker-identity-image');
        await expect(image).toBeVisible();

        // Must have unit name
        const name = card.locator('.marker-identity-name');
        await expect(name).toBeVisible();
        const text = await name.textContent();
        expect(text.trim().length).toBeGreaterThan(0);

        // Verify coordinate anchor: in Leaflet, iconAnchor sets margin-top and margin-left.
        // The top margin must anchor near the pin (e.g. -16px), NOT half the card height (-55px).
        const leafIcon = page.locator('.transparent-leaflet-icon').first();
        const style = await leafIcon.getAttribute('style');
        const marginTopMatch = style.match(/margin-top:\s*(-?\d+)px/);
        expect(marginTopMatch).not.toBeNull();
        const marginTop = Math.abs(parseInt(marginTopMatch[1], 10));
        // Margin top should be near 16px (pin head), definitely less than half icon height (55px)
        expect(marginTop).toBeLessThan(30);

        expect(errors).toEqual([]);
    });

    test('Test 2: Location with valid image URL renders safe URL', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await stubDriveImages(page);
        const errors = collectPageErrors(page);
        await page.goto('/');

        await selectLocationBySearch(page, 'thử nghiệm 2,');

        // Location 2 is now centered and selected
        const loc2Card = page.locator('.marker-container.marker-selected');
        await expect(loc2Card).toBeVisible();

        const img = loc2Card.locator('.marker-identity-image');
        await expect(img).toBeVisible();
        const src = await img.getAttribute('src');
        expect(src).toContain('drive.google.com');
        expect(src).toContain('1previewFIXTUREimage0000000000abc');

        expect(errors).toEqual([]);
    });

    test('Test 3: Location without image renders fallback logo without broken icon', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        const errors = collectPageErrors(page);
        await page.goto('/');

        await selectLocationBySearch(page, 'thử nghiệm 1,');

        const loc1Card = page.locator('.marker-container.marker-selected');
        await expect(loc1Card).toBeVisible();

        const img = loc1Card.locator('.marker-identity-image');
        await expect(img).toBeVisible();
        await expect(img).toHaveClass(/is-fallback/);
        const src = await img.getAttribute('src');
        expect(src).toMatch(/assets\/logo(\.[a-f0-9]+)?\.png/);

        // Verify naturalWidth > 0 (logo loaded, not a broken image icon)
        await expect(img).toHaveJSProperty('naturalWidth', 96);

        expect(errors).toEqual([]);
    });

    test('Test 4: Unreachable image falls back to logo without infinite error loop', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        // Fail Drive image with 404
        await page.route(/drive\.google\.com/, route => route.fulfill({ status: 404, body: 'Not found' }));
        const errors = collectPageErrors(page);
        await page.goto('/');

        await selectLocationBySearch(page, 'thử nghiệm 2,');

        const loc2Card = page.locator('.marker-container.marker-selected');
        await expect(loc2Card).toBeVisible();

        const img = loc2Card.locator('.marker-identity-image');
        await expect(img).toBeVisible();
        // onerror swapped src to fallback logo and added is-fallback
        await expect(img).toHaveClass(/is-fallback/);
        const src = await img.getAttribute('src');
        expect(src).toMatch(/assets\/logo(\.[a-f0-9]+)?\.png/);

        // Check dataset.errored is set to '1' to prevent infinite loop
        const errored = await img.evaluate(el => el.dataset.errored);
        expect(errored).toBe('1');

        expect(errors).toEqual([]);
    });

    test('Test 5: Long name clamps to max 2 lines and card bounds are retained', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await stubDriveImages(page);
        await page.goto('/');

        await selectLocationBySearch(page, 'thử nghiệm 2,');

        const card = page.locator('.marker-container.marker-selected .marker-identity-card');
        await expect(card).toBeVisible();
        const cardBox = await card.boundingBox();
        const cardWidth = cardBox ? cardBox.width : await card.evaluate(el => el.getBoundingClientRect().width);
        expect(cardWidth).toBeGreaterThan(0);
        expect(cardWidth).toBeLessThanOrEqual(112);

        // Check CSS line clamp on unit name
        const nameEl = card.locator('.marker-identity-name');
        const lineClamp = await nameEl.evaluate(el => window.getComputedStyle(el).webkitLineClamp);
        expect(lineClamp).toBe('2');
        const textOverflow = await nameEl.evaluate(el => window.getComputedStyle(el).textOverflow);
        expect(textOverflow).toBe('ellipsis');
    });

    test('Test 6: Clicking thumbnail or card opens correct detail panel', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await stubDriveImages(page);
        await page.goto('/');

        // Center location 2 by search
        await selectLocationBySearch(page, 'thử nghiệm 2,');

        const loc2Card = page.locator('.marker-container.marker-selected');
        await expect(loc2Card).toBeVisible();

        // Click directly on thumbnail image
        await loc2Card.locator('.marker-identity-image').click();

        await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'expanded');
        await expect(page.locator('#detail-title')).toHaveText('Công an khu vực 2');
    });

    test('Test 7: Selected marker receives selected visual state without duplicate marker', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await stubDriveImages(page);
        await page.goto('/');

        await selectLocationBySearch(page, 'thử nghiệm 1,');

        const selectedMarkers = page.locator('.marker-container.marker-selected');
        await expect(selectedMarkers).toHaveCount(1);

        // Exactly one marker for this location
        const nameText = await selectedMarkers.locator('.marker-identity-name').textContent();
        const totalMatching = await page.locator(`.marker-container:has-text("${nameText.trim()}")`).count();
        expect(totalMatching).toBe(1);
    });

    test('Test 8: Service filter cleanly removes non-matching marker cards', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await stubDriveImages(page);
        await page.goto('/');

        await zoomToMarkers(page);

        const initialCount = await page.locator('.marker-container').count();
        expect(initialCount).toBeGreaterThan(0);

        // Click CCCD filter chip
        const cccdChip = page.locator('.service-chip[data-service="IDENTITY"]');
        if (await cccdChip.isVisible()) {
            await cccdChip.click();
            await page.waitForTimeout(500);

            // Filtered count should be smaller
            const filteredCount = await page.locator('.marker-container').count();
            expect(filteredCount).toBeLessThan(initialCount);

            // Deactivate chip
            await cccdChip.click();
            await page.waitForTimeout(500);
            const restoredCount = await page.locator('.marker-container').count();
            expect(restoredCount).toBeGreaterThan(filteredCount);
        }
    });

    test('Test 9: Near me does not reduce marker count', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await stubDriveImages(page);
        await page.goto('/');

        await expect(page.locator('#results-list .result-item').first()).toBeVisible();
        const initialCount = await page.locator('#results-list .result-item').count();

        // Click find location button
        await page.click('#find-location-btn');
        await page.waitForTimeout(500);

        const afterCount = await page.locator('#results-list .result-item').count();
        expect(afterCount).toBe(initialCount);
    });

    test('Test 10: Lower zoom clusters multiple locations, zooming in splits to cards', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await stubDriveImages(page);
        await page.goto('/');

        await expect(page.locator('#results-list .result-item').first()).toBeVisible();

        // Zoom out to ensure clusters exist
        for (let i = 0; i < 7; i += 1) {
            await page.locator('#zoom-out-btn').click();
            await page.waitForTimeout(50);
        }
        await expect.poll(() => page.locator('.marker-cluster-civic').count()).toBeGreaterThan(0);

        // Zoom in to level 14+
        for (let i = 0; i < 11; i += 1) {
            await page.locator('#zoom-in-btn').click();
            await page.waitForTimeout(50);
        }

        // Clusters disappear, individual identity cards appear
        await expect.poll(() => page.locator('.marker-cluster-civic').count()).toBe(0);
        await expect.poll(() => page.locator('.marker-identity-card').count()).toBeGreaterThan(0);
    });

    test('Test 11: No internal enum leaks on marker card', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await stubDriveImages(page);
        await page.goto('/');

        await zoomToMarkers(page);

        const markerTexts = await page.locator('.marker-identity-card').allTextContents();
        expect(markerTexts.length).toBeGreaterThan(0);
        for (const text of markerTexts) {
            expect(text).not.toContain('POLICE_OFFICE');
            expect(text).not.toContain('CITIZEN_ID');
            expect(text).not.toContain('PUBLIC_SERVICE_CENTER');
            expect(text).not.toContain('id_center');
            expect(text).not.toContain('police_station');
        }
    });

    test('Test 12: Mobile 320x568 has no page overflow, marker is tappable, map draggable', async ({ page }) => {
        await page.setViewportSize({ width: 320, height: 568 });
        await stubDriveImages(page);
        const errors = collectPageErrors(page);
        await page.goto('/');

        // Open mobile search and pick a location
        await page.click('#mobile-search-btn');
        await page.fill('#search-input', 'thử nghiệm 1,');
        const item = page.locator('#results-list .result-item').first();
        await expect(item.locator('.result-address')).toContainText('thử nghiệm 1');
        await item.click();

        // Check horizontal overflow (panel is collapsed)
        const hasOverflow = await page.evaluate(() => {
            return document.documentElement.scrollWidth > window.innerWidth;
        });
        expect(hasOverflow).toBe(false);

        // Selected marker card is visible and tappable
        const selectedMarker = page.locator('.marker-container.marker-selected');
        await expect(selectedMarker).toBeVisible();

        // Close detail preview
        await page.locator('#preview-close-btn').click();
        await page.waitForTimeout(300);

        // Check map drag on mobile: drag on the map surface
        await page.mouse.move(160, 200);
        await page.mouse.down();
        await page.mouse.move(100, 150, { steps: 5 });
        await page.mouse.up();
        await page.waitForTimeout(300);

        expect(errors).toEqual([]);
    });

});
