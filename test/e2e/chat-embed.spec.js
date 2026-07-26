const { test, expect } = require('@playwright/test');

test('chat embed is a chat-only responsive host and the main page still loads', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await page.addInitScript(() => {
        window.marked = { parse: value => `<p>${String(value)}</p>` };
        window.DOMPurify = { sanitize: value => value, addHook() {} };
    });
    await page.route('**/js/chatbot.*.js', async route => {
        const response = await route.fetch();
        const body = (await response.text()).replace(
            "const isLocalHost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';",
            'const isLocalHost = false;'
        );
        await route.fulfill({ contentType: 'application/javascript', body });
    });
    await page.route('https://challenges.cloudflare.com/**', route => route.fulfill({
        contentType: 'application/javascript',
        body: `window.turnstile={render:function(_target,options){window.__releaseTurnstileToken=function(){options.callback('test-token');};return 1;}};window.__releaseTurnstileLoad=function(){window.onTurnstileLoad();};`,
    }));

    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/chat-embed.html?client=capphutho');
    await expect(page.locator('#ai-chat-window')).toHaveClass(/ai-chat-window--visible/);
    await expect(page.locator('#chatHistory')).toBeVisible();
    await expect(page.locator('#fakeChatInput')).toBeVisible();
    await expect(page.locator('#fakeChatInput')).toBeDisabled();
    await expect(page.locator('#ai-chat-launcher')).toHaveCount(0);
    await expect(page.locator('#mobile-bottom-nav')).toHaveCount(0);
    await expect(page.locator('#map')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.evaluate(() => window.__releaseTurnstileLoad());
    await page.evaluate(() => window.__releaseTurnstileToken());
    await expect(page.locator('#fakeChatInput')).toBeEnabled();
    expect(consoleErrors.filter(message => !message.includes('favicon'))).toEqual([]);

    await page.goto('/');
    await expect(page.locator('#map')).toBeVisible();
});
