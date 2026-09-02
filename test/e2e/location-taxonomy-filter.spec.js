const { test, expect } = require('@playwright/test');

// R0.5 taxonomy adapter contract: the public map/filter must classify a location by canonical
// `siteType` + `services` (lib/location-taxonomy.js) when present, falling back to the old
// free-text `type` column / legacy service codes only for rows that don't carry canonical data.
// See docs/redesign/CLAUDE_REVIEW_R0_V1.md (M2) for the bug this closes: before this fix, a
// PUBLIC_SERVICE_CENTER + [IDENTITY] record silently fell into the "Công an" bucket.
const FIXTURE = {
    table: {
        cols: [
            { label: 'record_id' },
            { label: 'name' },
            { label: 'type' },
            { label: 'address' },
            { label: 'phone' },
            { label: 'coordinates' },
            { label: 'site_type' },
            { label: 'services' },
        ],
        rows: [
            // Pre-migration row: no site_type/services columns filled in. Must classify exactly
            // like before this change (free-text `type` column implies a police office).
            {
                c: [
                    { v: 'LEGACY-POLICE-1' }, { v: 'Công an phường Legacy Một' }, { v: 'Trụ sở Công an' },
                    { v: 'Phường Legacy 1, Phú Thọ' }, { v: '0210 000 001' }, { v: '21.30,105.40' },
                    { v: '' }, { v: '' },
                ],
            },
            // Pre-migration row whose free-text `type` matches the legacy CCCD regex.
            {
                c: [
                    { v: 'LEGACY-CCCD-1' }, { v: 'Điểm cấp CCCD Legacy Một' }, { v: 'Điểm cấp CCCD lưu động' },
                    { v: 'Phường Legacy 2, Phú Thọ' }, { v: '0210 000 002' }, { v: '21.31,105.41' },
                    { v: '' }, { v: '' },
                ],
            },
            // Canonical row: PUBLIC_SERVICE_CENTER + [IDENTITY]. The regression case.
            {
                c: [
                    { v: 'CANONICAL-1' }, { v: 'Điểm tiếp nhận thủ tục hành chính – Canonical Test' }, { v: '' },
                    { v: 'Phường Canonical, Phú Thọ' }, { v: '0210 000 003' }, { v: '21.32,105.42' },
                    { v: 'PUBLIC_SERVICE_CENTER' }, { v: 'IDENTITY' },
                ],
            },
        ],
    },
};

async function withCanonicalFixture(page) {
    await page.route('**/api/google-sheet**', route => route.fulfill({ json: FIXTURE }));
}

test('canonical PUBLIC_SERVICE_CENTER + IDENTITY location classifies as Điểm CCCD, never defaults to Công an', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await withCanonicalFixture(page);
    await page.goto('/');
    await expect(page.locator('#results-list .result-item')).toHaveCount(3);

    // Both quick filters are checked by default, so all three rows show. Turning "Công an" off
    // must NOT hide the canonical record — proving it was never bucketed as a police office.
    await page.locator('label:has(#filter-police)').click();
    await expect(page.locator('[data-id="CANONICAL-1"]')).toBeVisible();
    await expect(page.locator('[data-id="LEGACY-CCCD-1"]')).toBeVisible();
    await expect(page.locator('[data-id="LEGACY-POLICE-1"]')).toHaveCount(0);

    // Restore "Công an", then turn "Điểm CCCD" off: the canonical record must now disappear,
    // confirming it was classified as CCCD and not simultaneously (mis)classified as police.
    await page.locator('label:has(#filter-police)').click();
    await page.locator('label:has(#filter-id)').click();
    await expect(page.locator('[data-id="CANONICAL-1"]')).toHaveCount(0);
    await expect(page.locator('[data-id="LEGACY-CCCD-1"]')).toHaveCount(0);
    await expect(page.locator('[data-id="LEGACY-POLICE-1"]')).toBeVisible();
});

test('canonical location gets the CCCD marker icon and detail badge, not the police one', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await withCanonicalFixture(page);
    await page.goto('/');

    await page.locator('[data-id="CANONICAL-1"]').click();
    await expect(page.locator('#detail-badge')).toHaveText('Điểm cấp CCCD');

    const markerClass = await page.evaluate(() => {
        const label = Array.from(document.querySelectorAll('.marker-label'))
            .find(el => el.textContent === 'Điểm tiếp nhận thủ tục hành chính – Canonical Test');
        return label ? label.closest('.marker-container').className : null;
    });
    expect(markerClass).toContain('marker-id');
    expect(markerClass).not.toContain('marker-police');
});

test('legacy rows without canonical site_type/services keep their pre-existing classification', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await withCanonicalFixture(page);
    await page.goto('/');

    await page.locator('[data-id="LEGACY-POLICE-1"]').click();
    await expect(page.locator('#detail-badge')).toHaveText('Trụ sở Công an');
    await page.locator('#back-to-list-btn').click();

    await page.locator('[data-id="LEGACY-CCCD-1"]').click();
    await expect(page.locator('#detail-badge')).toHaveText('Điểm cấp CCCD');
});
