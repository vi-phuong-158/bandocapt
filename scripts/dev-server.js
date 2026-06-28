// Dev server: serve root directory + proxy /api/google-sheet tới Google Sheets thật.
// Dùng cho local development — không cần build trước, không cần Vercel.
// Đọc GOOGLE_SHEET_ID từ .env (nếu có).

const fs   = require('node:fs');
const http = require('node:http');
const path = require('node:path');

// Đọc .env đơn giản (không cần dotenv package)
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
}

const PORT     = Number(process.env.PORT || 3000);
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET    = 'Published_Locations';
const ROOT     = path.resolve(__dirname, '..');

const MIME = {
    '.css':  'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js':   'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png':  'image/png',
    '.ico':  'image/x-icon',
    '.svg':  'image/svg+xml',
    '.woff2':'font/woff2',
};

async function proxyGoogleSheet(res) {
    if (!SHEET_ID) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'GOOGLE_SHEET_ID not set in .env' }));
        return;
    }
    try {
        const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(SHEET_ID)}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(SHEET)}`;
        const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const text = await r.text();
        const match = text.match(/google\.visualization\.Query\.setResponse\((.+)\);\s*$/s);
        if (!match) throw new Error('INVALID_GOOGLE_RESPONSE');
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(match[1]); // JSON của payload (không có wrapper function)
    } catch (e) {
        console.error('[dev-server] Google Sheet error:', e.message);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
    }
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    // API proxy
    if (url.pathname === '/api/google-sheet') {
        return proxyGoogleSheet(res);
    }

    // Static files từ root
    let rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const filePath = path.resolve(ROOT, rel);
    if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
        res.writeHead(403).end('Forbidden');
        return;
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        res.writeHead(404).end('Not found: ' + rel);
        return;
    }
    res.writeHead(200, {
        'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
    });
    fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`Dev server: http://127.0.0.1:${PORT}  (SHEET_ID: ${SHEET_ID ? SHEET_ID.slice(0,8) + '…' : 'NOT SET'})`);
});
