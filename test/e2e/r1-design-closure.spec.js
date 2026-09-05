const { test, expect } = require('@playwright/test');

test.describe.configure({ timeout: 45000 });

test.describe('R1 Map-First Design Closure - Focused 10 Invariants', () => {

    test('1. Desktop BROWSING -> DETAIL -> BROWSING lifecycle', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto('/');

        // Verify service-first prompt exists
        await expect(page.locator('.service-prompt-header')).toBeVisible();
        await expect(page.locator('.service-prompt-header')).toContainText('Bạn cần làm thủ tục gì?');

        // Type query
        const searchInput = page.locator('#search-input');
        await expect(searchInput).toHaveAttribute('placeholder', 'Tìm Công an xã/phường, địa chỉ hoặc dịch vụ');
        await searchInput.fill('khu vực 1');

        // Results update
        const firstResult = page.locator('#results-list .result-item').first();
        await expect(firstResult).toBeVisible();
        await expect(firstResult).toContainText('Công an khu vực 1');

        // Click result opens detail
        await firstResult.click();
        await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'expanded');
        await expect(page.locator('#detail-title')).toHaveText('Công an khu vực 1');

        // Back to list returns to browsing
        const backBtn = page.locator('#back-to-list-btn');
        await expect(backBtn).toBeVisible();
        await backBtn.click();
        await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'hidden');
        await expect(page.locator('body')).toHaveAttribute('data-panel-state', 'browsing');
    });

    test('2. Search panel accessibility contract (inert & aria-hidden per viewport and state)', async ({ page }) => {
        // Desktop verification
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto('/');

        const searchPanel = page.locator('#search-panel');
        // Desktop + BROWSING: active
        await expect(searchPanel).toHaveAttribute('aria-hidden', 'false');
        expect(await searchPanel.evaluate(el => el.hasAttribute('inert'))).toBe(false);

        // Desktop + DETAIL: inert + aria-hidden
        const firstResult = page.locator('#results-list .result-item').first();
        await firstResult.click();
        await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'expanded');
        await expect(searchPanel).toHaveAttribute('aria-hidden', 'true');
        expect(await searchPanel.evaluate(el => el.hasAttribute('inert'))).toBe(true);

        // Close detail -> returns to active
        await page.locator('#back-to-list-btn').click();
        await expect(searchPanel).toHaveAttribute('aria-hidden', 'false');
        expect(await searchPanel.evaluate(el => el.hasAttribute('inert'))).toBe(false);

        // Mobile verification
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto('/');

        // Mobile + BROWSING: inert + aria-hidden (offscreen/hidden)
        await expect(searchPanel).toHaveAttribute('aria-hidden', 'true');
        expect(await searchPanel.evaluate(el => el.hasAttribute('inert'))).toBe(true);

        // Mobile + MOBILE_SEARCH: active
        await page.click('#mobile-search-btn');
        await expect(searchPanel).toHaveAttribute('aria-hidden', 'false');
        expect(await searchPanel.evaluate(el => el.hasAttribute('inert'))).toBe(false);

        // Close mobile search -> returns to inert + aria-hidden
        await page.click('#close-search-btn');
        await expect(searchPanel).toHaveAttribute('aria-hidden', 'true');
        expect(await searchPanel.evaluate(el => el.hasAttribute('inert'))).toBe(true);
    });

    test('3. Search by service matches canonical service labels (căn cước -> IDENTITY)', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto('/');

        const searchInput = page.locator('#search-input');
        // Search "căn cước"
        await searchInput.fill('căn cước');

        // Results should include locations that offer IDENTITY (e.g. index 0 "Công an khu vực 1" has "Điểm CCCD")
        const results = page.locator('#results-list .result-item');
        await expect(results.first()).toBeVisible();
        await expect(results.first()).toContainText('Công an khu vực 1');

        // Clear query -> all results return
        await searchInput.fill('');
        await expect(page.locator('#results-list .result-item').nth(1)).toContainText('Công an khu vực 2');
    });

    test('4. No fake working hours: serviceSchedule missing -> hours container hidden', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto('/');

        // Open first item (fixture has no serviceSchedule)
        await page.locator('#results-list .result-item').first().click();
        await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'expanded');

        // detail-hours-container must be hidden
        const hoursContainer = page.locator('#detail-hours-container');
        await expect(hoursContainer).toBeHidden();

        // Must NOT render fallback standard hours
        const detailText = await page.locator('#detail-content').textContent();
        expect(detailText).not.toContain('07h30–11h30');
        expect(detailText).not.toContain('13h00–16h30');
    });

    test('5. Procedure note is rendered independently of working hours', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto('/');

        // Item 1 ("Công an khu vực 1") is an Identity location without serviceSchedule
        await page.locator('#results-list .result-item').first().click();
        await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'expanded');

        // Procedure note should be visible
        const procedureNote = page.locator('#detail-procedure-note');
        await expect(procedureNote).toBeVisible();
        await expect(procedureNote).toContainText('CCCD/CMND');

        // Working hours container remains hidden
        await expect(page.locator('#detail-hours-container')).toBeHidden();
    });

    test('6. Missing or unusable phone hides phone link and Call CTA, directions is full-width', async ({ page }) => {
        // Intercept API response to return a location with "Cập nhật sau..." phone
        await page.route('**/api/google-sheet*', async route => {
            const json = {
                table: {
                    cols: [
                        { label: 'record_id' },
                        { label: 'Tên đơn vị' },
                        { label: 'Loại đơn vị' },
                        { label: 'Địa chỉ' },
                        { label: 'Số điện thoại' },
                        { label: 'Tọa độ' },
                        { label: 'Hình ảnh' }
                    ],
                    rows: [
                        {
                            c: [
                                { v: 'NO-PHONE-1' },
                                { v: 'Công an xã Không Phone' },
                                { v: 'Trụ sở Công an' },
                                { v: 'Xã Thử Nghiệm, Phú Thọ' },
                                { v: 'Cập nhật sau...' },
                                { v: '21.250000,105.290000' },
                                { v: '' }
                            ]
                        }
                    ]
                }
            };
            await route.fulfill({
                status: 200,
                contentType: 'application/json; charset=utf-8',
                body: JSON.stringify(json)
            });
        });

        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto('/');

        await page.locator('#results-list .result-item').first().click();
        await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'expanded');

        // Phone link and Call CTA should be hidden
        await expect(page.locator('#detail-phone-link')).toHaveClass(/detail-action--unavailable/);
        await expect(page.locator('#action-call')).toHaveClass(/detail-action--unavailable/);

        // Actions grid should have grid-cols-1 for full-width directions
        await expect(page.locator('#detail-actions-grid')).toHaveClass(/grid-cols-1/);
        await expect(page.locator('#action-directions')).toBeVisible();
    });

    test('7. Valid usable phone renders Call CTA and 2-column actions grid', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto('/');

        // Preview fixture has valid phone '0210 000 000'
        await page.locator('#results-list .result-item').first().click();
        await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'expanded');

        // Phone link and Call CTA should be visible
        await expect(page.locator('#detail-phone-link')).not.toHaveClass(/detail-action--unavailable/);
        await expect(page.locator('#action-call')).not.toHaveClass(/detail-action--unavailable/);
        await expect(page.locator('#action-call')).toHaveAttribute('href', 'tel:0210000000');

        // Actions grid should have grid-cols-2
        await expect(page.locator('#detail-actions-grid')).toHaveClass(/grid-cols-2/);
        await expect(page.locator('#action-directions')).toBeVisible();
    });

    test('8. Multi-viewport resilience: zero horizontal overflow and zero page errors across viewports', async ({ page }) => {
        const viewports = [
            { width: 320, height: 568 },
            { width: 375, height: 667 },
            { width: 390, height: 844 },
            { width: 430, height: 932 },
            { width: 1366, height: 768 },
            { width: 1440, height: 900 },
        ];

        const pageErrors = [];
        page.on('pageerror', err => pageErrors.push(err.message));

        for (const vp of viewports) {
            await page.setViewportSize({ width: vp.width, height: vp.height });
            await page.goto('/');

            const hasOverflow = await page.evaluate(() => {
                return document.documentElement.scrollWidth > document.documentElement.clientWidth;
            });
            expect(hasOverflow).toBe(false);
        }
        expect(pageErrors).toEqual([]);
    });

    test('9. Desktop back preserves query, active service filter, and result list', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto('/');

        // Set service filter
        const identityChip = page.locator('.service-chip[data-service="IDENTITY"]');
        await identityChip.click();
        await expect(identityChip).toHaveAttribute('aria-pressed', 'true');

        // Enter search query
        const searchInput = page.locator('#search-input');
        await searchInput.fill('khu vực');

        // Open detail
        const firstResult = page.locator('#results-list .result-item').first();
        await expect(firstResult).toBeVisible();
        await firstResult.click();
        await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'expanded');

        // Click Back to list
        const backBtn = page.locator('#back-to-list-btn');
        await expect(backBtn).toBeVisible();
        await backBtn.click();

        // Verify detail is closed
        await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'hidden');

        // Verify query and filter are preserved
        await expect(searchInput).toHaveValue('khu vực');
        await expect(identityChip).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('#results-list .result-item').first()).toBeVisible();
    });

    test('10. Internal enums and leaked fields do not appear in UI', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto('/');

        // Select first result
        await page.locator('#results-list .result-item').first().click();
        await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'expanded');

        const detailHtml = await page.locator('#detail-content').innerHTML();

        // Raw internal enums must never appear in citizen-facing HTML
        expect(detailHtml).not.toContain('POLICE_OFFICE');
        expect(detailHtml).not.toContain('CITIZEN_ID_POINT');
        expect(detailHtml).not.toContain('TEMPORARILY_PAUSED');
        expect(detailHtml).not.toContain('NOT_PROVIDED');
        expect(detailHtml).not.toContain('UNKNOWN');
        expect(detailHtml).not.toContain('PUBLIC_SERVICE_CENTER');
        expect(detailHtml).not.toContain('SECONDARY_OFFICE');
        expect(detailHtml).not.toContain('MOBILE_POINT');
    });

});
