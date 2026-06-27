const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const handler = require('../api/chat');

const ROOT = path.resolve(__dirname, '..');
const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = global.fetch;

function createRequest(body = {}) {
    return {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-forwarded-for': '203.0.113.7',
        },
        body,
        socket: {},
    };
}

function createResponse() {
    return {
        headers: {},
        statusCode: 200,
        body: undefined,
        setHeader(name, value) {
            this.headers[name.toLowerCase()] = value;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
        end(payload) {
            this.body = payload;
            return this;
        },
    };
}

function jsonResponse(payload, init = {}) {
    return new Response(JSON.stringify(payload), {
        status: init.status || 200,
        headers: {
            'content-type': 'application/json',
            ...(init.headers || {}),
        },
    });
}

function setSecureTestEnv() {
    process.env.NODE_ENV = 'production';
    process.env.TURNSTILE_SECRET_KEY = 'turnstile-secret';
    process.env.FIREBASE_DB_URL = 'https://quota.example.test';
    process.env.CHAT_LOG_HASH_SALT = 'test-only-hash-salt';
    delete process.env.EVAL_BYPASS_TOKEN;
}

test.afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    global.fetch = ORIGINAL_FETCH;
});

test('missing Turnstile secret returns 503 without external calls', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.TURNSTILE_SECRET_KEY;
    delete process.env.EVAL_BYPASS_TOKEN;
    let fetchCalls = 0;
    global.fetch = async () => {
        fetchCalls += 1;
        throw new Error('External call must not happen');
    };

    const res = createResponse();
    await handler(createRequest({ captchaToken: 'token', userMessage: 'Xin chao' }), res);

    assert.equal(res.statusCode, 503);
    assert.equal(res.body.error, 'SERVICE_UNAVAILABLE');
    assert.equal(fetchCalls, 0);
});

for (const failure of [401, 403, 429, 500, 'network']) {
    test(`rate-limit read failure (${failure}) returns 503 before provider calls`, async () => {
        setSecureTestEnv();
        const urls = [];
        global.fetch = async (url) => {
            const value = String(url);
            urls.push(value);
            if (value.includes('challenges.cloudflare.com')) {
                return jsonResponse({ success: true });
            }
            if (failure === 'network') {
                throw new Error('quota store unavailable');
            }
            return jsonResponse({ error: 'quota read failed' }, { status: failure });
        };

        const res = createResponse();
        await handler(createRequest({ captchaToken: 'valid-token', userMessage: 'Xin chao' }), res);

        assert.equal(res.statusCode, 503);
        assert.equal(res.body.error, 'RATE_LIMIT_UNAVAILABLE');
        assert.equal(urls.filter(url => url.includes('quota.example.test')).length, 2);
        assert.equal(urls.some(url => /pinecone|generativelanguage|openai|cohere/i.test(url)), false);
    });
}

test('rate-limit write failure returns 503 before any provider call', async () => {
    setSecureTestEnv();
    const urls = [];
    global.fetch = async (url, options = {}) => {
        const value = String(url);
        urls.push(value);
        if (value.includes('challenges.cloudflare.com')) {
            return jsonResponse({ success: true });
        }
        if (options.method === 'PUT') {
            return jsonResponse({ error: 'write failed' }, { status: 500 });
        }
        return jsonResponse(0, { headers: { etag: '"quota-v1"' } });
    };

    const res = createResponse();
    await handler(createRequest({ captchaToken: 'valid-token', userMessage: 'Xin chao' }), res);

    assert.equal(res.statusCode, 503);
    assert.equal(res.body.error, 'RATE_LIMIT_UNAVAILABLE');
    assert.equal(urls.filter(url => url.includes('quota.example.test')).length, 4);
    assert.equal(urls.some(url => /pinecone|generativelanguage|openai|cohere/i.test(url)), false);
});

test('valid rate-limit reservation allows normal request validation to continue', async () => {
    setSecureTestEnv();
    global.fetch = async (url, options = {}) => {
        if (String(url).includes('challenges.cloudflare.com')) {
            return jsonResponse({ success: true });
        }
        if (options.method === 'PUT') {
            return jsonResponse({ ok: true });
        }
        return jsonResponse(0, { headers: { etag: '"quota-v1"' } });
    };

    const res = createResponse();
    await handler(createRequest({ captchaToken: 'valid-token', userMessage: '' }), res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'BAD_REQUEST');
});

test('headquarters with invalid coordinates are skipped instead of randomized', () => {
    const source = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

    assert.doesNotMatch(source, /21\.325\s*\+\s*\(Math\.random\(\)/);
    assert.match(source, /LocationData\.normalizePublishedLocations/);
});

test('DOMPurify is pinned to the patched CDN asset with matching SRI', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const expected = 'https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.4.7/purify.min.js';
    const integrity = 'sha384-6gdBb4YMPz19eGx6Wf1vmT47Jh7wZArqJc84JuA3BRnoZQwt/X5qLfIip51LgpB/';

    assert.match(html, new RegExp(`${expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" integrity="${integrity}`));
});

test('no hardcoded cross-project Firebase RTDB URL remains', () => {
    const source = fs.readFileSync(path.join(ROOT, 'api', 'chat.js'), 'utf8');
    assert.doesNotMatch(source, /chatbot-gemini-8c78b/);
});

test('telemetry payload omits question, answer and raw IP by default', () => {
    delete process.env.CHAT_DIAGNOSTIC_LOG;
    const payload = handler.buildTelemetryPayload({
        question: 'so ho chieu cua toi la X',
        answer: 'cau tra loi nhay cam',
        ip: '203.0.113.7',
        user_agent: 'Mozilla/5.0',
        language: 'vi',
        sources: [{ file: 'NĐ 282', score: 0.9 }],
        latency_ms: 12,
    });

    assert.equal(payload.question, undefined);
    assert.equal(payload.answer, undefined);
    assert.equal(payload.ip, undefined);
    assert.equal(payload.diagnostic, undefined);
    // IP phải được hash, không lưu plaintext.
    assert.ok(payload.ip_bucket_hash && payload.ip_bucket_hash !== '203.0.113.7');
    assert.equal(payload.source_count, 1);
});

test('telemetry includes content only when diagnostic flag is enabled', () => {
    process.env.CHAT_DIAGNOSTIC_LOG = 'on';
    try {
        const payload = handler.buildTelemetryPayload({
            question: 'cau hoi',
            answer: 'cau tra loi',
            ip: '203.0.113.7',
            user_agent: 'Mozilla/5.0',
            language: 'vi',
            sources: [],
            latency_ms: 5,
        });
        assert.equal(payload.question, 'cau hoi');
        assert.equal(payload.answer, 'cau tra loi');
        assert.equal(payload.diagnostic, true);
        // Ngay cả khi bật chẩn đoán, IP vẫn không lưu plaintext.
        assert.equal(payload.ip, undefined);
    } finally {
        delete process.env.CHAT_DIAGNOSTIC_LOG;
    }
});

test('rate-limit keys and operational logs do not contain raw IP or message content', async () => {
    setSecureTestEnv();
    const urls = [];
    global.fetch = async (url) => {
        urls.push(String(url));
        if (String(url).includes('challenges.cloudflare.com')) {
            return jsonResponse({ success: true });
        }
        return jsonResponse({ error: 'quota unavailable' }, { status: 500 });
    };

    const res = createResponse();
    await handler(createRequest({ captchaToken: 'valid-token', userMessage: 'passport-sensitive-value' }), res);

    assert.equal(res.statusCode, 503);
    assert.equal(urls.some(url => url.includes('203.0.113.7') || url.includes('203_0_113_7')), false);

    const source = fs.readFileSync(path.join(ROOT, 'api', 'chat.js'), 'utf8');
    assert.doesNotMatch(source, /console\.(?:log|warn|error)\([^\n]*\$\{clientIP\}/);
    assert.doesNotMatch(source, /console\.(?:log|warn|error)\([^\n]*userMessage\.substring/);
});

test('OpenStreetMap attribution is enabled (ToS compliance)', () => {
    const appSource = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');

    assert.doesNotMatch(appSource, /attributionControl:\s*false/);
    assert.match(appSource, /attribution:\s*['"`].*OpenStreetMap/);
    assert.doesNotMatch(css, /\.leaflet-control-attribution[^}]*display:\s*none/);
});
