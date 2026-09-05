const { chromium } = require('@playwright/test');
const { startPreviewServer, stopPreviewServer } = require('./preview-server');

function createSyntheticLocations(count) {
    const cols = [
        { label: 'record_id' },
        { label: 'Tên đơn vị' },
        { label: 'Loại đơn vị' },
        { label: 'Địa chỉ' },
        { label: 'Số điện thoại' },
        { label: 'Tọa độ' },
        { label: 'Hình ảnh' },
    ];
    const rows = [];
    for (let i = 0; i < count; i++) {
        const lat = 20.95 + (i % 50) * 0.012 + (Math.floor(i / 50) % 20) * 0.002;
        const lng = 104.95 + Math.floor(i / 50) * 0.012 + (i % 20) * 0.002;
        rows.push({
            c: [
                { v: `SYN-${i + 1}` },
                { v: `Công an địa phương ${i + 1}` },
                { v: i % 4 === 0 ? 'Điểm CCCD' : 'Trụ sở Công an' },
                { v: `Địa chỉ số ${i + 1}, Phú Thọ` },
                { v: '0210 000 000' },
                { v: `${lat.toFixed(6)},${lng.toFixed(6)}` },
                { v: i % 5 === 0 ? `https://drive.google.com/uc?export=view&id=syn_img_${i}` : '' },
            ],
        });
    }
    return { table: { cols, rows } };
}

async function runBenchmarkForCount(count) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    let imageRequests = 0;
    page.on('request', req => {
        const url = req.url();
        if (req.resourceType() === 'image' || url.includes('.png') || url.includes('googleusercontent') || url.includes('drive.google')) {
            imageRequests++;
        }
    });

    const dataset = createSyntheticLocations(count);
    await page.route('**/api/google-sheet*', route => {
        route.fulfill({
            status: 200,
            contentType: 'application/json; charset=utf-8',
            body: JSON.stringify(dataset),
        });
    });

    // Mock images so network doesn't stall
    await page.route(/drive\.google\.com|googleusercontent\.com/, route => {
        route.fulfill({
            status: 200,
            contentType: 'image/png',
            body: Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
        });
    });

    const startTime = Date.now();
    await page.goto('http://127.0.0.1:4173/');
    await page.waitForSelector('#results-list .result-item', { timeout: 15000 });
    const loadTimeMs = Date.now() - startTime;

    // Wait 1s for leaflet clusters to settle
    await page.waitForTimeout(1000);

    const metrics = await page.evaluate(() => {
        const domMarkers = document.querySelectorAll('.marker-container').length;
        const domClusters = document.querySelectorAll('.marker-cluster-civic').length;
        return { domMarkers, domClusters };
    });

    // Test pan/zoom usability
    const panStart = Date.now();
    await page.mouse.move(600, 400);
    await page.mouse.down();
    await page.mouse.move(500, 300, { steps: 5 });
    await page.mouse.up();
    const panTimeMs = Date.now() - panStart;

    await browser.close();

    return {
        count,
        loadTimeMs,
        panTimeMs,
        initialMarkerDomCount: metrics.domMarkers,
        initialClusterCount: metrics.domClusters,
        initialImageRequests: imageRequests,
        passed: metrics.domMarkers < count && imageRequests < count,
    };
}

async function main() {
    await startPreviewServer();
    try {
        console.log('=== BENCHMARK: Marker Identity Cards Performance & Network Acceptance ===\n');
        const counts = [100, 1000, 5000];
        const results = [];

        for (const count of counts) {
            process.stdout.write(`Benchmarking ${count} locations... `);
            const result = await runBenchmarkForCount(count);
            results.push(result);
            console.log(`DONE in ${result.loadTimeMs}ms`);
            console.log(`  - Initial DOM markers: ${result.initialMarkerDomCount}`);
            console.log(`  - Initial Clusters: ${result.initialClusterCount}`);
            console.log(`  - Initial Image Requests: ${result.initialImageRequests}`);
            console.log(`  - Pan Interaction: ${result.panTimeMs}ms`);
            console.log(`  - Clustering Protection: ${result.passed ? 'PASS (clusters prevent DOM & request explosion)' : 'FAIL'}\n`);
        }

        console.log('=== SUMMARY RESULTS ===');
        console.table(results);

        const allPassed = results.every(r => r.passed);
        if (!allPassed) {
            console.error('FAIL: Performance or network gate violated!');
            process.exit(1);
        }
        console.log('ALL PERFORMANCE & NETWORK CHECKS PASSED!\n');
    } finally {
        await stopPreviewServer();
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
