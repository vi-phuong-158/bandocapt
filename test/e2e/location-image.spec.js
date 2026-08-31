const path = require('node:path');
const { test, expect } = require('@playwright/test');

// Ảnh cục bộ trong repo, không phải dữ liệu Production. Chặn mọi request tới Drive nên E2E
// không phụ thuộc mạng và luôn tất định.
const STUB_IMAGE = path.join(__dirname, '..', '..', 'assets', 'logo.png');

async function stubDriveImages(page) {
    await page.route(/drive\.google\.com/, route => route.fulfill({
        path: STUB_IMAGE,
        contentType: 'image/png',
    }));
}

// Fixture preview: chỉ "Phường thử nghiệm 2," có ảnh công khai. Dấu phẩy giữ cho từ khoá là
// duy nhất (không dính "thử nghiệm 20,").
async function openLocationByAddress(page, addressFragment) {
    await page.fill('#search-input', addressFragment);
    const item = page.locator('#results-list .result-item').first();
    // `filterAndRender` chạy sau debounce 250ms. Đợi đúng nội dung đã lọc thay vì chỉ đợi
    // phần tử "visible" — danh sách CHƯA lọc vẫn hiển thị item đầu tiên trong lúc chờ debounce,
    // nên `toBeVisible()` một mình sẽ pass sớm và bấm nhầm địa điểm khác.
    await expect(item.locator('.result-address')).toContainText(addressFragment.replace(/,$/, ''));
    await item.click();
    return item;
}

function collectPageErrors(page) {
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => {
        if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
            errors.push(message.text());
        }
    });
    return errors;
}

test('desktop: public location image renders in the detail panel and opens a closable lightbox', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await stubDriveImages(page);
    const errors = collectPageErrors(page);
    await page.goto('/');

    await openLocationByAddress(page, 'thử nghiệm 2,');
    await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'expanded');

    // Ảnh nằm ngay trong phần thông tin địa điểm, đã tải thật và không tràn khỏi card.
    const heroImage = page.locator('#detail-image');
    await expect(page.locator('#detail-hero')).toBeVisible();
    await expect(heroImage).toHaveJSProperty('naturalWidth', 96);
    await expect(heroImage).toHaveAttribute('alt', 'Ảnh Công an khu vực 2');
    // Không dùng `documentElement.scrollWidth`: pane tile của Leaflet luôn tràn ra ngoài viewport
    // theo thiết kế, nên chỉ đo đúng phần card/ảnh.
    const overflow = await page.evaluate(() => {
        const hero = document.getElementById('detail-hero').getBoundingClientRect();
        const panel = document.getElementById('detail-panel').getBoundingClientRect();
        return { heroRight: hero.right, heroLeft: hero.left, panelRight: panel.right, panelLeft: panel.left, viewport: window.innerWidth };
    });
    expect(overflow.heroRight).toBeLessThanOrEqual(overflow.panelRight + 1);
    expect(overflow.heroLeft).toBeGreaterThanOrEqual(overflow.panelLeft - 1);
    expect(overflow.panelRight).toBeLessThanOrEqual(overflow.viewport + 1);

    // Bấm ảnh mở lightbox xem ảnh lớn, không điều hướng sang trang ngoài.
    await expect(page.locator('#image-lightbox')).toBeHidden();
    await page.locator('#detail-image-button').click();
    await expect(page.locator('#image-lightbox')).toBeVisible();
    await expect(page.locator('#image-lightbox-image')).toHaveJSProperty('naturalWidth', 96);
    await expect(page.locator('#image-lightbox-close')).toBeFocused();
    expect(page.url()).toBe('http://127.0.0.1:4173/');

    // Lightbox phải nằm trên mọi lớp nổi khác (nút chat/catalog dùng z-index cũ 1999-2001),
    // nếu không nút chat sẽ đè lên ảnh đang xem.
    const layering = await page.evaluate(() => {
        const zOf = id => {
            const element = document.getElementById(id);
            return element ? Number(getComputedStyle(element).zIndex) || 0 : 0;
        };
        return { lightbox: zOf('image-lightbox'), chat: zOf('ai-chat-launcher'), catalog: zOf('tthc-catalog-launcher') };
    });
    expect(layering.lightbox).toBeGreaterThan(layering.chat);
    expect(layering.lightbox).toBeGreaterThan(layering.catalog);

    // Esc đóng lightbox nhưng KHÔNG đóng luôn phần thông tin địa điểm phía dưới.
    await page.keyboard.press('Escape');
    await expect(page.locator('#image-lightbox')).toBeHidden();
    await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'expanded');
    await expect(page.locator('#detail-image-button')).toBeFocused();

    // Nút đóng.
    await page.locator('#detail-image-button').click();
    await expect(page.locator('#image-lightbox')).toBeVisible();
    await page.locator('#image-lightbox-close').click();
    await expect(page.locator('#image-lightbox')).toBeHidden();

    // Bấm vùng nền.
    await page.locator('#detail-image-button').click();
    await expect(page.locator('#image-lightbox')).toBeVisible();
    await page.locator('#image-lightbox').click({ position: { x: 8, y: 400 } });
    await expect(page.locator('#image-lightbox')).toBeHidden();

    expect(errors).toEqual([]);
});

test('desktop: a location without a public image still renders and exposes no image control', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await stubDriveImages(page);
    const errors = collectPageErrors(page);
    await page.goto('/');

    await openLocationByAddress(page, 'thử nghiệm 1,');
    await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'expanded');

    // Phần thông tin vẫn hoạt động bình thường, ảnh chỉ rơi về logo và không bấm được.
    await expect(page.locator('#detail-title')).toHaveText('Công an khu vực 1');
    await expect(page.locator('#detail-address')).toHaveText('Phường thử nghiệm 1, Phú Thọ');
    await expect(page.locator('#detail-image-button')).toBeDisabled();
    await expect(page.locator('#detail-image')).toHaveAttribute('alt', 'Biểu trưng Công an nhân dân');

    await page.locator('#detail-image-button').evaluate(button => button.click());
    await expect(page.locator('#image-lightbox')).toBeHidden();

    expect(errors).toEqual([]);
});

test('desktop: an unreachable public image falls back to the logo without breaking the detail panel', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    // Ảnh mất quyền truy cập / đã bị xoá.
    await page.route(/drive\.google\.com/, route => route.fulfill({ status: 404, body: 'gone' }));
    const errors = collectPageErrors(page);
    await page.goto('/');

    await openLocationByAddress(page, 'thử nghiệm 2,');

    await expect(page.locator('#detail-title')).toHaveText('Công an khu vực 2');
    await expect(page.locator('#detail-address')).toHaveText('Phường thử nghiệm 2, Phú Thọ');
    // Không còn ảnh hỏng: rơi về logo và tắt luôn lối mở lightbox.
    await expect(page.locator('#detail-image')).toHaveAttribute('alt', 'Biểu trưng Công an nhân dân');
    await expect(page.locator('#detail-image-button')).toBeDisabled();
    await page.locator('#detail-image-button').evaluate(button => button.click());
    await expect(page.locator('#image-lightbox')).toBeHidden();

    // Lỗi tải ảnh chỉ được cảnh báo, không phải lỗi trang.
    expect(errors.filter(entry => !entry.includes('404') && !entry.includes('Failed to load'))).toEqual([]);
});

test('mobile: public location image and lightbox stay inside the viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubDriveImages(page);
    const errors = collectPageErrors(page);
    await page.goto('/');

    await page.click('#mobile-search-btn');
    await openLocationByAddress(page, 'thử nghiệm 2,');
    await expect.poll(async () => page.locator('#detail-panel').getAttribute('data-sheet-state')).toBe('collapsed');

    await page.locator('#preview-expand-btn').click();
    await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'expanded');
    await expect(page.locator('#detail-hero')).toBeVisible();

    // Chỉ đo card/ảnh: pane tile của Leaflet vốn tràn ra ngoài viewport theo thiết kế.
    const layout = await page.evaluate(() => ({
        hero: document.getElementById('detail-hero').getBoundingClientRect().toJSON(),
        panel: document.getElementById('detail-panel').getBoundingClientRect().toJSON(),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
    }));
    expect(layout.hero.right).toBeLessThanOrEqual(layout.panel.right + 1);
    expect(layout.hero.left).toBeGreaterThanOrEqual(layout.panel.left - 1);
    // Ảnh không được đẩy card cao quá viewport trên mobile.
    expect(layout.hero.height).toBeLessThanOrEqual(layout.panel.height);
    expect(layout.panel.right).toBeLessThanOrEqual(layout.viewportWidth + 1);
    expect(layout.panel.height).toBeLessThanOrEqual(layout.viewportHeight);

    await page.locator('#detail-image-button').click();
    await expect(page.locator('#image-lightbox')).toBeVisible();
    const lightbox = await page.evaluate(() => {
        const image = document.getElementById('image-lightbox-image').getBoundingClientRect();
        return { right: image.right, bottom: image.bottom, width: window.innerWidth, height: window.innerHeight };
    });
    expect(lightbox.right).toBeLessThanOrEqual(lightbox.width);
    expect(lightbox.bottom).toBeLessThanOrEqual(lightbox.height);

    await page.locator('#image-lightbox-close').click();
    await expect(page.locator('#image-lightbox')).toBeHidden();
    await expect(page.locator('#detail-panel')).toHaveAttribute('data-sheet-state', 'expanded');

    expect(errors).toEqual([]);
});
