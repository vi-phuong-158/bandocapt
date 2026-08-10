const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const port = Number(process.env.PORT || 4173);
const root = path.resolve(__dirname, '..', 'dist');
const mimeTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
};

function createLocationFixture() {
    const cols = [
        { label: 'record_id' },
        { label: 'Tên đơn vị' },
        { label: 'Loại đơn vị' },
        { label: 'Địa chỉ' },
        { label: 'Số điện thoại' },
        { label: 'Tọa độ' },
        { label: 'Hình ảnh' },
    ];
    const rows = Array.from({ length: 30 }, (_, index) => {
        const lat = 21.25 + (index % 6) * 0.018;
        const lng = 105.29 + Math.floor(index / 6) * 0.022;
        return {
            c: [
                { v: `PREVIEW-${index + 1}` },
                { v: `Công an khu vực ${index + 1}` },
                { v: index % 4 === 0 ? 'Điểm CCCD' : 'Trụ sở Công an' },
                { v: `Phường thử nghiệm ${index + 1}, Phú Thọ` },
                { v: '0210 000 000' },
                { v: `${lat.toFixed(6)},${lng.toFixed(6)}` },
                { v: '' },
            ],
        };
    });
    return { table: { cols, rows } };
}

const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    if (requestUrl.pathname === '/api/google-sheet') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(createLocationFixture()));
        return;
    }

    const relativePath = requestUrl.pathname === '/' ? 'index.html' : requestUrl.pathname.slice(1);
    const filePath = path.resolve(root, relativePath);
    if (!filePath.startsWith(root + path.sep) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        res.writeHead(404).end('Not found');
        return;
    }

    res.writeHead(200, {
        'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
    });
    fs.createReadStream(filePath).pipe(res);
});

function startPreviewServer() {
    return new Promise((resolve, reject) => {
        const onError = error => {
            server.off('listening', onListening);
            reject(error);
        };
        const onListening = () => {
            server.off('error', onError);
            console.log(`Preview server: http://127.0.0.1:${port}`);
            resolve(server);
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, '127.0.0.1');
    });
}

function stopPreviewServer() {
    if (!server.listening) return Promise.resolve();
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    return new Promise(resolve => server.close(resolve));
}

if (require.main === module) {
    let shuttingDown = false;
    const shutdown = () => {
        if (shuttingDown) return;
        shuttingDown = true;
        stopPreviewServer();
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
    startPreviewServer().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}

module.exports = { startPreviewServer, stopPreviewServer };
