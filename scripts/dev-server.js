// Dev server: serve root directory + route /api/google-sheet through the production guard.
// Dùng cho local development — không cần build trước, không cần Vercel.
// Đọc PUBLIC_LOCATION_SPREADSHEET_ID (hoặc compatibility GOOGLE_SHEET_ID) từ .env (nếu có).

const fs   = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const googleSheetHandler = require('../api/google-sheet');

// Đọc .env đơn giản (không cần dotenv package)
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
}

const PORT     = Number(process.env.PORT || 3000);
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

async function proxyGoogleSheet(req, res) {
    // Adapt Node's ServerResponse to the small Vercel response surface used by the production handler.
    // This keeps local public reads on exactly the same resolver, schema guard and field allowlist.
    res.status = statusCode => {
        res.statusCode = statusCode;
        return res;
    };
    res.json = payload => {
        if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(payload));
        return res;
    };
    return googleSheetHandler({ method: req.method, query: {} }, res);
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    // API proxy
    if (url.pathname === '/api/google-sheet') {
        return proxyGoogleSheet(req, res);
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
    console.log(`Dev server: http://127.0.0.1:${PORT}  (public location source resolved per request)`);
});
