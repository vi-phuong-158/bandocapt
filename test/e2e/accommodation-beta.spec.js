const { test, expect } = require('@playwright/test');

function syntheticRecord(index, overrides = {}) {
    return {
        id: `ACC_E2E_${String(index).padStart(4, '0')}`,
        name: index === 2 ? '<img src=x onerror=alert(1)>' : `Nhà trọ Synthetic ${index}`,
        address: `Khu ${index}, Việt Trì, Phú Thọ`,
        latitude: 21.325 + (index % 5) * 0.00015,
        longitude: 105.365 + (index % 5) * 0.00015,
        localityCode: 'VIET_TRI',
        policeUnitCode: 'CA_VIET_TRI',
        contactPhone: index % 2 === 0 ? '0210 123 4567' : '',
        sourceType: 'PILOT_INTERNAL',
        verificationStatus: 'ACTIVE',
        lastVerifiedAt: index % 3 === 0 ? '2026-08-20T00:00:00.000Z' : '2026-08-21T00:00:00.000Z',
        updatedAt: '2026-08-21T00:00:00.000Z',
        ownerEmail: 'private@example.com',
        ...overrides,
    };
}

async function installSyntheticConfig(page, records) {
    await page.route('**/api/google-sheet**', async route => {
        const response = await route.fetch();
        const payload = await response.json();
        payload.table.cols.push({ label: 'unit_code' });
        payload.table.rows.forEach(row => row.c.push({ v: 'CA_VIET_TRI' }));
        await route.fulfill({ response, body: JSON.stringify(payload) });
    });
    await page.route(/\/data\.[^/]+\.js$/, async route => {
        const response = await route.fetch();
        const body = await response.text();
        const replacement = `window.ACCOMMODATION_BETA_CONFIG = Object.freeze(${JSON.stringify({
            enabled: true,
            pilotLocalityCodes: ['VIET_TRI'],
            records,
        })});`;
        const patched = body.replace(/window\.ACCOMMODATION_BETA_CONFIG\s*=\s*Object\.freeze\([\s\S]*?\);/, replacement);
        await route.fulfill({ response, body: patched });
    });
}

async function stubChatDependencies(page) {
    await page.route('**/*', async route => {
        const pathname = new URL(route.request().url()).pathname;
        if (pathname !== '/' && pathname !== '/index.html') {
            await route.continue();
            return;
        }
        const response = await route.fetch();
        const body = await response.text();
        await route.fulfill({ response, body: body.replace(/\s+integrity="[^"]*"/g, '') });
    });
    await page.route('**/marked.min.js*', route => route.fulfill({
        status: 200, contentType: 'application/javascript', body: 'window.marked = { parse: text => String(text) };',
    }));
    await page.route('**/purify.min.js*', route => route.fulfill({
        status: 200, contentType: 'application/javascript', body: 'window.DOMPurify = { sanitize: html => String(html), addHook: () => {} };',
    }));
    await page.route(/\/js\/lazy-features\.[^/]+\.js$/, async route => {
        const response = await route.fetch();
        const body = await response.text();
        await route.fulfill({ response, body: body.replace(/\s*integrity:\s*'[^']+',/g, '') });
    });
}

async function waitForBetaControl(page) {
    await expect(page.locator('#accommodation-beta-toggle')).toBeVisible();
    await expect(page.locator('#results-list .result-item').first()).toBeVisible();
}

test('Beta OFF is additive-safe and does not load the Beta module', async ({ page }) => {
    const consoleErrors = [];
    const requests = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('request', request => requests.push(request.url()));
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await expect(page.locator('#results-list .result-item').first()).toBeVisible();
    await expect(page.locator('#accommodation-beta-toggle')).toHaveCount(0);
    expect(requests.some(url => url.includes('accommodation-beta'))).toBe(false);
    expect(consoleErrors).toEqual([]);
    await page.locator('#search-input').fill('Công an khu vực 1');
    await expect(page.locator('#results-list .result-item').first()).toBeVisible();
});

test('Beta ON toggles an independent cluster and renders safe detail fields', async ({ page }) => {
    const records = [
        ...Array.from({ length: 20 }, (_, index) => syntheticRecord(index)),
        syntheticRecord(90, { id: 'ACC_E2E_BAD_COORD', latitude: 18.0 }),
        syntheticRecord(91, { id: 'ACC_E2E_UNKNOWN_LOCALITY', localityCode: 'UNKNOWN_LOCALITY' }),
    ];
    const dialogs = [];
    page.on('dialog', dialog => dialogs.push(dialog.type()));
    await installSyntheticConfig(page, records);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await waitForBetaControl(page);
    await page.locator('#accommodation-beta-toggle').click();
    await expect(page.locator('#accommodation-beta-toggle')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => page.locator('.marker-cluster-accommodation').count()).toBeGreaterThan(0);
    await page.locator('.marker-cluster-accommodation').first().click();
    await expect.poll(() => page.locator('.marker-accommodation').count()).toBeGreaterThan(0);

    await page.locator('#search-input').fill('Khu 2');
    await expect(page.locator('#results-list .result-item').first()).toBeVisible();
    await expect(page.locator('#results-list .result-title').first()).toHaveText('<img src=x onerror=alert(1)>');
    await page.locator('#results-list .result-item').first().click();
    await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'expanded');
    await expect(page.locator('#detail-badge')).toHaveText('Nhà trọ an toàn · Beta');
    await expect(page.locator('#detail-title')).toHaveText('<img src=x onerror=alert(1)>');
    await expect(page.locator('#detail-service-meta')).toContainText('Công an phụ trách');
    await expect(page.locator('#detail-service-meta')).toContainText('21/08/2026');
    await expect(page.locator('#detail-service-meta')).not.toContainText('private@example.com');
    await expect(page.locator('#action-directions')).toHaveAttribute('href', /google\.com\/maps\/dir/);
    await expect(page.locator('.accommodation-chat-cta')).toBeVisible();
    await expect(page.locator('#detail-phone')).toHaveText('0210 123 4567');
    expect(dialogs).toEqual([]);

    await page.locator('#back-to-list-btn').click();
    await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'hidden');
    await page.locator('#accommodation-beta-toggle').click();
    await expect(page.locator('#accommodation-beta-toggle')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.marker-accommodation')).toHaveCount(0);
    await page.locator('#accommodation-beta-toggle').click();
    await page.locator('#accommodation-beta-toggle').click();
    await expect(page.locator('#accommodation-beta-toggle')).toHaveAttribute('aria-pressed', 'false');
});

test('Beta context changes A→B and clears for a new non-accommodation chat', async ({ page }) => {
    const requestBodies = [];
    const lazyErrors = [];
    page.on('console', message => { if (message.type() === 'error') lazyErrors.push(message.text()); });
    page.on('pageerror', error => lazyErrors.push(`pageerror ${error.message}`));
    page.on('requestfailed', request => { if (request.url().includes('cdn') || request.url().includes('chatbot')) lazyErrors.push(`failed ${request.url()} ${request.failure()?.errorText || ''}`); });
    await stubChatDependencies(page);
    await page.route(/\/api\/chat(?:\?.*)?$/, async route => {
        requestBodies.push(route.request().postDataJSON());
        await route.fulfill({
            status: 200,
            contentType: 'text/event-stream',
            body: 'data: {"done":true,"fullText":"Đã nhận câu hỏi."}\n\n',
        });
    });
    await installSyntheticConfig(page, [syntheticRecord(1), syntheticRecord(2, { name: 'Nhà trọ Synthetic 2' })]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await waitForBetaControl(page);
    await page.locator('#mobile-search-btn').click();
    await expect(page.locator('#search-panel')).toHaveClass(/translate-y-0/);
    await page.locator('#accommodation-beta-toggle').click();
    await page.locator('#search-input').fill('Synthetic 1');
    await expect(page.locator('#results-list .result-title').first()).toHaveText('Nhà trọ Synthetic 1');
    await page.locator('#results-list .result-item').first().click();
    await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'collapsed');
    await page.locator('#preview-expand-btn').click();
    await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'expanded');
    await page.locator('#detail-content').evaluate(element => { element.scrollTop = element.scrollHeight; });
    await page.locator('.accommodation-chat-cta').click();
    await expect(page.locator('#ai-chat-window')).toHaveAttribute('aria-hidden', 'false');
    await expect(page.locator('#fakeChatInput')).toHaveValue('Tôi cần hướng dẫn thủ tục khai báo tạm trú.');
    await expect(page.locator('#chatSendBtn')).toBeEnabled();
    await expect.poll(() => page.evaluate(() => typeof window.GeminiAI?.stream)).toBe('function');
    await page.locator('#chatSendBtn').click();
    await expect.poll(() => requestBodies.length).toBe(1);
    expect(requestBodies[0].residenceContext).toEqual({
        accommodationName: 'Nhà trọ Synthetic 1', localityCode: 'VIET_TRI', policeUnitCode: 'CA_VIET_TRI',
    });

    await page.locator('#ai-chat-close-btn').click();
    await page.locator('#mobile-search-btn').click();
    await expect(page.locator('#search-panel')).toHaveClass(/translate-y-0/);
    await page.locator('#search-input').fill('Khu 2');
    await expect(page.locator('#results-list .result-title').first()).toHaveText('Nhà trọ Synthetic 2');
    await page.locator('#results-list .result-item').first().click();
    await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'collapsed');
    await page.locator('#preview-expand-btn').click();
    await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'expanded');
    await page.locator('#detail-content').evaluate(element => { element.scrollTop = element.scrollHeight; });
    await page.locator('.accommodation-chat-cta').click();
    await expect(page.locator('#ai-chat-window')).toHaveAttribute('aria-hidden', 'false');
    await page.locator('#chatSendBtn').click();
    await expect.poll(() => requestBodies.length).toBe(2);
    expect(requestBodies[1].residenceContext).toEqual({
        accommodationName: 'Nhà trọ Synthetic 2', localityCode: 'VIET_TRI', policeUnitCode: 'CA_VIET_TRI',
    });

    await page.locator('#ai-chat-close-btn').click();
    await page.locator('[data-app-tab="chat"]').click();
    await expect(page.locator('#ai-chat-window')).toHaveAttribute('aria-hidden', 'false');
    await page.locator('#fakeChatInput').fill('Thủ tục khác');
    await page.locator('#chatSendBtn').click();
    await expect.poll(() => requestBodies.length).toBe(3);
    expect(requestBodies[2].residenceContext).toBeUndefined();
    expect(lazyErrors).toEqual([]);
});

test('Beta controls stay usable across required viewport sizes', async ({ page }) => {
    test.setTimeout(60000);
    await installSyntheticConfig(page, Array.from({ length: 20 }, (_, index) => syntheticRecord(index)));
    for (const width of [320, 375, 390, 430, 768, 1024]) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto('/');
        await waitForBetaControl(page);
        if (width < 768) {
            await page.locator('#mobile-search-btn').click();
            await expect(page.locator('#search-panel')).toHaveClass(/translate-y-0/);
        }
        await expect(page.locator('#accommodation-beta-toggle')).toBeVisible();
        await page.locator('#accommodation-beta-toggle').click();
        await expect(page.locator('#accommodation-beta-toggle')).toHaveAttribute('aria-pressed', 'true');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
        await page.locator('#accommodation-beta-toggle').click();
    }
});

test('Synthetic 100/1,000/5,000 records remain measurable without crash', async ({ page }) => {
    test.setTimeout(90000);
    const state = { records: [] };
    await page.route(/\/data\.[^/]+\.js$/, async route => {
        const response = await route.fetch();
        const body = await response.text();
        const replacement = `window.ACCOMMODATION_BETA_CONFIG = Object.freeze(${JSON.stringify({
            enabled: true, pilotLocalityCodes: ['VIET_TRI'], records: state.records,
        })});`;
        await route.fulfill({ response, body: body.replace(/window\.ACCOMMODATION_BETA_CONFIG\s*=\s*Object\.freeze\([\s\S]*?\);/, replacement) });
    });
    for (const count of [100, 1000, 5000]) {
        state.records = Array.from({ length: count }, (_, index) => syntheticRecord(index));
        await page.goto('/');
        await waitForBetaControl(page);
        await page.locator('#accommodation-beta-toggle').click();
        await expect.poll(() => page.evaluate(() => window.__accommodationBetaMetrics?.recordCount)).toBe(count);
        const metrics = await page.evaluate(() => window.__accommodationBetaMetrics);
        expect(metrics.validationAndLoadMs).toBeGreaterThanOrEqual(0);
        expect(metrics.markerCreationMs).toBeGreaterThanOrEqual(0);
        await page.reload();
    }
});
