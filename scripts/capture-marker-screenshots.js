const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');
const { startPreviewServer, stopPreviewServer } = require('./preview-server');

const OUT_DIR = path.resolve(__dirname, '..', 'docs', 'screenshots', 'marker-identity-cards');
if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
}

const STUB_IMAGE = path.resolve(__dirname, '..', 'assets', 'logo.png');

async function setupPage(page) {
    await page.route(/drive\.google\.com/, route => route.fulfill({
        path: STUB_IMAGE,
        contentType: 'image/png',
    }));
}

async function capture() {
    await startPreviewServer();
    const browser = await chromium.launch({ headless: true });

    try {
        // 1. Desktop Viewports
        const desktopViewports = [
            { width: 1366, height: 768, name: 'desktop-1366x768' },
            { width: 1440, height: 900, name: 'desktop-1440x900' },
        ];

        for (const vp of desktopViewports) {
            console.log(`Capturing desktop ${vp.name}...`);
            const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });

            // State A: Initial map (clusters + standalone markers)
            {
                const page = await context.newPage();
                await setupPage(page);
                await page.goto('http://127.0.0.1:4173/');
                await page.waitForSelector('#results-list .result-item');
                await page.waitForTimeout(800);
                await page.screenshot({ path: path.join(OUT_DIR, `${vp.name}-A-initial-map.png`) });

                // State B: Zoom medium
                for (let i = 0; i < 4; i++) {
                    await page.locator('#zoom-in-btn').click();
                    await page.waitForTimeout(50);
                }
                await page.waitForTimeout(600);
                await page.screenshot({ path: path.join(OUT_DIR, `${vp.name}-B-zoom-medium.png`) });

                // State C: Zoom close (cards separated clearly)
                for (let i = 0; i < 7; i++) {
                    await page.locator('#zoom-in-btn').click();
                    await page.waitForTimeout(50);
                }
                await page.waitForTimeout(600);
                await page.screenshot({ path: path.join(OUT_DIR, `${vp.name}-C-zoom-close.png`) });

                await page.close();
            }

            // State D: Selected location with image
            {
                const page = await context.newPage();
                await setupPage(page);
                await page.goto('http://127.0.0.1:4173/');
                await page.waitForSelector('#results-list .result-item');
                await page.fill('#search-input', 'thử nghiệm 2,');
                await page.waitForTimeout(300);
                await page.locator('#results-list .result-item').first().click();
                await page.waitForTimeout(600);
                await page.screenshot({ path: path.join(OUT_DIR, `${vp.name}-D-selected-location.png`) });
                await page.close();
            }

            // State E: Marker missing image (fallback logo)
            {
                const page = await context.newPage();
                await setupPage(page);
                await page.goto('http://127.0.0.1:4173/');
                await page.waitForSelector('#results-list .result-item');
                await page.fill('#search-input', 'thử nghiệm 1,');
                await page.waitForTimeout(300);
                await page.locator('#results-list .result-item').first().click();
                await page.waitForTimeout(600);
                await page.screenshot({ path: path.join(OUT_DIR, `${vp.name}-E-fallback-image.png`) });
                await page.close();
            }

            await context.close();
        }

        // 2. Mobile Viewports
        const mobileViewports = [
            { width: 320, height: 568, name: 'mobile-320x568' },
            { width: 375, height: 667, name: 'mobile-375x667' },
            { width: 390, height: 844, name: 'mobile-390x844' },
            { width: 430, height: 932, name: 'mobile-430x932' },
        ];

        for (const vp of mobileViewports) {
            console.log(`Capturing mobile ${vp.name}...`);
            const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });

            // State F: Mobile map (marker cards + search bar + bottom UI)
            {
                const page = await context.newPage();
                await setupPage(page);
                await page.goto('http://127.0.0.1:4173/');
                await page.waitForSelector('#mobile-search-btn');
                await page.waitForTimeout(800);
                await page.screenshot({ path: path.join(OUT_DIR, `${vp.name}-F-mobile-map.png`) });
                await page.close();
            }

            // State G: Mobile selected (marker + bottom sheet)
            {
                const page = await context.newPage();
                await setupPage(page);
                await page.goto('http://127.0.0.1:4173/');
                await page.waitForSelector('#mobile-search-btn');
                await page.click('#mobile-search-btn');
                await page.fill('#search-input', 'thử nghiệm 2,');
                await page.waitForTimeout(300);
                await page.locator('#results-list .result-item').first().click();
                await page.waitForTimeout(600);
                await page.screenshot({ path: path.join(OUT_DIR, `${vp.name}-G-mobile-selected.png`) });
                await page.close();
            }

            await context.close();
        }

        console.log(`\nSuccessfully captured all screenshots in ${OUT_DIR}`);
    } finally {
        await browser.close();
        await stopPreviewServer();
    }
}

capture().catch(err => {
    console.error(err);
    process.exit(1);
});
