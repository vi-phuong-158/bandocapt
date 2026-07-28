const { test, expect } = require('@playwright/test');

test.describe('Project Info Modal E2E Test', () => {
    test('opens modal, closes via close button, Escape, and backdrop, restores focus, and verifies Báo Phú Thọ link', async ({ page }) => {
        await page.goto('/');

        const openBtn = page.locator('#project-info-btn');
        const modal = page.locator('#project-info-modal');
        const backdrop = page.locator('#project-info-backdrop');
        const closeBtn = page.locator('#project-info-close-btn');
        const baoPhuThoLink = modal.locator('a[href="https://baophutho.vn/van-hanh-ung-dung-nbsp-ban-do-cong-an-so-tinh-phu-tho-258512.htm"]');

        // Ban đầu modal ẩn và aria-expanded="false" / aria-hidden="true"
        await expect(modal).toHaveAttribute('aria-hidden', 'true');
        await expect(openBtn).toHaveAttribute('aria-expanded', 'false');

        // 1. Mở modal bằng nút Thông tin công trình
        await openBtn.click();
        await expect(modal).not.toHaveClass(/hidden/);
        await expect(modal).toHaveAttribute('aria-hidden', 'false');
        await expect(openBtn).toHaveAttribute('aria-expanded', 'true');
        await expect(closeBtn).toBeFocused();

        // Kiểm tra link Báo Phú Thọ trong modal có đầy đủ URL, target và rel
        await expect(baoPhuThoLink).toBeVisible();
        await expect(baoPhuThoLink).toHaveAttribute('target', '_blank');
        await expect(baoPhuThoLink).toHaveAttribute('rel', 'noopener noreferrer');

        // 2. Đóng bằng nút đóng (#project-info-close-btn)
        await closeBtn.click();
        await expect(modal).toHaveAttribute('aria-hidden', 'true');
        await expect(openBtn).toHaveAttribute('aria-expanded', 'false');
        await expect(openBtn).toBeFocused();

        // 3. Mở lại, nhấn Escape, xác nhận modal ẩn và restore focus
        await openBtn.click();
        await expect(modal).toHaveAttribute('aria-hidden', 'false');
        await page.keyboard.press('Escape');
        await expect(modal).toHaveAttribute('aria-hidden', 'true');
        await expect(openBtn).toHaveAttribute('aria-expanded', 'false');
        await expect(openBtn).toBeFocused();

        // 4. Mở lại, bấm backdrop, xác nhận modal ẩn và restore focus
        await openBtn.click();
        await expect(modal).toHaveAttribute('aria-hidden', 'false');
        await backdrop.click({ position: { x: 10, y: 10 } });
        await expect(modal).toHaveAttribute('aria-hidden', 'true');
        await expect(openBtn).toHaveAttribute('aria-expanded', 'false');
        await expect(openBtn).toBeFocused();
    });
});
