const { test, expect } = require('@playwright/test');

test.describe('Mobile Real-Device UX Fixes', () => {

    test('Chatbot opens successfully and remains functional even when external CDNs fail', async ({ page }) => {
        // Block external CDNs: jsdelivr, cloudflare cdnjs, cloudflare challenges
        await page.route(/cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|challenges\.cloudflare\.com/, route => {
            route.abort('failed');
        });

        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto('/');

        // Bam vao tab Hoi dap AI o thanh bottom nav
        const chatTab = page.locator('[data-app-tab="chat"]');
        await expect(chatTab).toBeVisible();
        await chatTab.click();

        // Chatbot window mo thanh cong, KHONG hien thong bao loi tai
        const chatWindow = page.locator('#ai-chat-window');
        await expect(chatWindow).toHaveAttribute('aria-hidden', 'false');
        await expect(page.locator('#lazy-feature-error')).toHaveCount(0);

        // Input khong bi disable vinh vien, nguoi dung co the go
        const input = page.locator('#fakeChatInput');
        await expect(input).toBeEnabled();
        await input.fill('Thủ tục cấp hộ chiếu');
        expect(await input.inputValue()).toBe('Thủ tục cấp hộ chiếu');

        // Starter chips co mat va co the bam duoc
        const starterChip = page.locator('.ai-chat-starter .ai-chat-quick-reply').first();
        await expect(starterChip).toBeVisible();
    });

    const VIEWPORTS = [
        { name: 'Samsung Galaxy (360x800)', width: 360, height: 800 },
        { name: 'iPhone tieu chuan (375x812)', width: 375, height: 812 },
        { name: 'iPhone 12/13/14 (390x844)', width: 390, height: 844 },
        { name: 'Pixel / Xiaomi (412x915)', width: 412, height: 915 },
        { name: 'iPhone Pro Max (430x932)', width: 430, height: 932 },
    ];

    for (const vp of VIEWPORTS) {
        test('Floating action tier positioned correctly on ' + vp.name, async ({ page }) => {
            await page.setViewportSize({ width: vp.width, height: vp.height });
            await page.goto('/');

            const bottomNav = page.locator('#mobile-bottom-nav');
            const findLocationBtn = page.locator('#find-location-btn');
            const contributionCta = page.locator('#public-contribution-cta');

            await expect(bottomNav).toBeVisible();
            await expect(findLocationBtn).toBeVisible();
            await expect(contributionCta).toBeVisible();

            // Kiem tra khong bi duplicate CTA: khong ton tai #mobile-contribution-cta cu va chi co 1 canonical CTA
            expect(await page.locator('#mobile-contribution-cta').count()).toBe(0);
            await expect(page.locator('#public-contribution-cta')).toHaveCount(1);

            const boxes = await page.evaluate(() => {
                const nav = document.getElementById('mobile-bottom-nav').getBoundingClientRect();
                const fab = document.getElementById('find-location-btn').getBoundingClientRect();
                const cta = document.getElementById('public-contribution-cta').getBoundingClientRect();
                return {
                    nav: { top: nav.top, bottom: nav.bottom, height: nav.height },
                    fab: { top: fab.top, bottom: fab.bottom, height: fab.height, left: fab.left, right: fab.right },
                    cta: { top: cta.top, bottom: cta.bottom, height: cta.height, left: cta.left, right: cta.right },
                };
            });

            // 1. Ca FAB va CTA deu nam TREN bottom nav voi khoang cach an toan (12px - 24px)
            const fabGap = boxes.nav.top - boxes.fab.bottom;
            const ctaGap = boxes.nav.top - boxes.cta.bottom;

            expect(fabGap).toBeGreaterThanOrEqual(12);
            expect(fabGap).toBeLessThanOrEqual(24);
            expect(ctaGap).toBeGreaterThanOrEqual(12);
            expect(ctaGap).toBeLessThanOrEqual(24);

            // 2. Khong de nhau: CTA o mep trai, FAB o mep phai
            expect(boxes.cta.right).toBeLessThan(boxes.fab.left);

            // 3. Kich thuoc hit target dat chuan
            expect(boxes.fab.height).toBeGreaterThanOrEqual(48);
            expect(boxes.cta.height).toBeGreaterThanOrEqual(44);

            // 4. CTA dan toi dong-gop/
            await expect(contributionCta).toHaveAttribute('href', 'dong-gop/');
        });
    }

    test('Floating action tier shifts up when location preview is opened', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto('/');

        // Mo preview dia diem dau tien
        await page.click('#mobile-search-btn');
        await expect(page.locator('#results-list .result-item').first()).toBeVisible();
        await page.locator('#results-list .result-item').first().click();
        await expect.poll(() => page.locator('#detail-panel').getAttribute('data-sheet-state')).toBe('collapsed');

        const boxes = await page.evaluate(() => {
            const preview = document.getElementById('location-preview').getBoundingClientRect();
            const fab = document.getElementById('find-location-btn').getBoundingClientRect();
            const cta = document.getElementById('public-contribution-cta').getBoundingClientRect();
            return {
                preview: { top: preview.top, bottom: preview.bottom },
                fab: { top: fab.top, bottom: fab.bottom },
                cta: { top: cta.top, bottom: cta.bottom },
            };
        });

        // Ca FAB va CTA dat len tren preview, khong bi che khuat
        expect(boxes.fab.bottom).toBeLessThanOrEqual(boxes.preview.top);
        expect(boxes.cta.bottom).toBeLessThanOrEqual(boxes.preview.top);
    });

    test('Mobile marker visual density: compact unselected pins, no label clutter, highlighted identity card when selected', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto('/');

        // Cho ket qua va ban do load
        await expect(page.locator('#results-list .result-item').first()).toBeVisible();

        // Zoom vao khu vuc trung tam Viet Tri (noi co nhieu marker)
        for (let i = 0; i < 4; i++) {
            await page.evaluate(() => window.map?.zoomIn?.());
            await page.waitForTimeout(200);
        }

        // Kiem tra marker unselected tren mobile:
        // Cac marker chua chon phai co class marker-mobile-compact
        const unselectedPins = page.locator('.marker-container.marker-mobile-compact:not(.marker-selected)');
        await expect(unselectedPins.first()).toBeVisible();

        // Tren mobile o zoom thong thuong: unselected marker khong hien card lon
        const isCardVisible = await page.evaluate(() => {
            const card = document.querySelector('.marker-container.marker-mobile-compact:not(.marker-selected) .marker-identity-card');
            if (!card) return false;
            const style = window.getComputedStyle(card);
            return style.display !== 'none' && style.opacity !== '0' && style.visibility !== 'hidden';
        });
        expect(isCardVisible).toBe(false);

        // Click vao 1 marker tren ban do
        await unselectedPins.first().click({ force: true });
        await page.waitForTimeout(300);

        // Marker duoc chon phai co class marker-selected va identity card
        const selectedMarker = page.locator('.marker-container.marker-selected');
        await expect(selectedMarker).toBeVisible();

        const identityCard = selectedMarker.locator('.marker-identity-card');
        await expect(identityCard).toBeVisible();

        // Ten tru so hien thi ro rang tren identity card
        const nameText = await identityCard.locator('.marker-identity-name').textContent();
        expect(nameText.trim().length).toBeGreaterThan(0);

        // Dong preview -> marker quay lai trang thai unselected compact
        await page.locator('#preview-close-btn').click();
        await page.waitForTimeout(300);

        await expect(page.locator('.marker-container.marker-selected')).toHaveCount(0);
    });

    test('Desktop view preserves regular full-sized markers and labels without regression', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto('/');

        // Bottom nav cua mobile phai an tren desktop
        await expect(page.locator('#mobile-bottom-nav')).toBeHidden();

        // Cho ban do va ket qua khoi tao hoan tat
        await expect(page.locator('#results-list .result-item').first()).toBeVisible();

        // Zoom 14+ tren desktop: identity cards hien thi day du
        for (let i = 0; i < 8; i++) {
            await page.locator('#zoom-in-btn').click();
            await page.waitForTimeout(100);
        }

        await expect.poll(() => page.locator('.marker-identity-card').count()).toBeGreaterThan(0);
    });
});
