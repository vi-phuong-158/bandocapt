const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './test/e2e',
    globalSetup: './test/e2e/global-setup.js',
    timeout: 30000,
    expect: {
        timeout: 5000,
    },
    use: {
        baseURL: 'http://127.0.0.1:4173',
        // Môi trường có sẵn Chromium hệ thống (vd container cloud) trỏ binary qua env này
        // thay vì tải browser theo version pin của @playwright/test.
        ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
            ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } }
            : {}),
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },
});
