const { test, expect } = require('@playwright/test');

test('public contribution CTA is discoverable, contained, and stacked with desktop chat', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    const cta = page.locator('#public-contribution-cta');
    const chat = page.locator('#ai-chat-toggle-btn');
    const mapActions = page.locator('#map-actions');

    await expect(cta).toBeVisible();
    await expect(cta).toContainText('Đóng góp địa điểm');
    await expect(cta).toHaveAttribute('href', 'dong-gop/');
    await expect(chat).toBeVisible();
    await expect(mapActions).toBeVisible();

    const boxes = await page.evaluate(() => ({
        cta: document.getElementById('public-contribution-cta').getBoundingClientRect().toJSON(),
        chat: document.getElementById('ai-chat-toggle-btn').getBoundingClientRect().toJSON(),
        mapActions: document.getElementById('map-actions').getBoundingClientRect().toJSON(),
        viewport: { width: window.innerWidth, height: window.innerHeight },
    }));
    expect(boxes.cta.bottom).toBeLessThanOrEqual(boxes.chat.top);
    expect(boxes.cta.right).toBeLessThanOrEqual(boxes.mapActions.left);
    expect(boxes.cta.left).toBeGreaterThanOrEqual(0);
    expect(boxes.cta.right).toBeLessThanOrEqual(boxes.viewport.width);

    await Promise.all([
        page.waitForURL(/\/dong-gop\/?$/),
        cta.click(),
    ]);
    await expect(page.locator('h1')).toContainText('Đóng góp');
});

test('public contribution CTA stays usable above mobile navigation at supported widths', async ({ page }) => {
    for (const width of [320, 375, 390, 430]) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto('/');

        const cta = page.locator('#public-contribution-cta');
        await expect(cta).toBeVisible();
        await expect(cta).toContainText('Đóng góp địa điểm');
        await expect(page.locator('#mobile-bottom-nav')).toBeVisible();
        await expect(page.locator('#ai-chat-launcher')).toBeHidden();

        const boxes = await page.evaluate(() => ({
            cta: document.getElementById('public-contribution-cta').getBoundingClientRect().toJSON(),
            nav: document.getElementById('mobile-bottom-nav').getBoundingClientRect().toJSON(),
            viewport: { width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth },
        }));
        expect(boxes.cta.height).toBeGreaterThanOrEqual(44);
        expect(boxes.cta.bottom).toBeLessThanOrEqual(boxes.nav.top - 8);
        expect(boxes.cta.left).toBeGreaterThanOrEqual(8);
        expect(boxes.cta.right).toBeLessThanOrEqual(boxes.viewport.width - 8);
        expect(boxes.viewport.scrollWidth).toBeLessThanOrEqual(boxes.viewport.width);
    }
});

test('contribution CTA is absent on its destination while chat behavior remains available', async ({ page }) => {
    await page.goto('/dong-gop/');
    await expect(page.locator('#public-contribution-cta')).toHaveCount(0);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.locator('#ai-chat-toggle-btn').click();
    await expect(page.locator('#ai-chat-window')).toHaveAttribute('aria-hidden', 'false');
    await expect(page.locator('#ai-chat-window')).toHaveClass(/ai-chat-window--visible/);
    const openBoxes = await page.evaluate(() => ({
        cta: document.getElementById('public-contribution-cta').getBoundingClientRect().toJSON(),
        chatWindow: document.getElementById('ai-chat-window').getBoundingClientRect().toJSON(),
    }));
    expect(openBoxes.cta.bottom).toBeLessThanOrEqual(openBoxes.chatWindow.bottom + 1);

    await page.locator('#ai-chat-close-btn').click();
    await expect(page.locator('#ai-chat-window')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('#public-contribution-cta')).toBeVisible();
});
