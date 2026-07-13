'use strict';

process.env.NODE_ENV = 'development';
process.env.EVAL_BYPASS_TOKEN = 't2b-test-bypass';
process.env.GEMINI_API_KEY = 'test-key';
process.env.CHAT_LOG_HASH_SALT = 'test-only-hash-salt';
process.env.EVAL_SKIP_FAQ_CACHE = '1';
delete process.env.FIREBASE_DB_URL;

const assert = require('node:assert/strict');
const test = require('node:test');
const chat = require('../api/chat');

const ORIGINAL_FETCH = global.fetch;

test.afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
    delete process.env.RAG_FAIL_CLOSED;
    delete process.env.PINECONE_API_KEY;
    delete process.env.LLM_PRIMARY;
    delete process.env.LLM_FALLBACK;
    delete process.env.DEEPSEEK_API_KEY;
});

function createRequest(userMessage) {
    return {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
        body: { captchaToken: 't2b-test-bypass', userMessage, history: [] },
        socket: {},
    };
}

function runHandler(userMessage) {
    return new Promise((resolve, reject) => {
        let body = '';
        const res = {
            headers: {}, statusCode: 200, headersSent: false,
            setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
            status(code) { this.statusCode = code; return this; },
            json(value) { resolve({ statusCode: this.statusCode, body: JSON.stringify(value) }); },
            writeHead(code) { this.statusCode = code; this.headersSent = true; },
            write(value) { body += String(value); return true; },
            end() { resolve({ statusCode: this.statusCode, body }); },
        };
        chat(createRequest(userMessage), res).catch(reject);
    });
}

function geminiStreamResponse(parts) {
    const encoder = new TextEncoder();
    const payload = parts.map((text, index) => `data: ${JSON.stringify({
        candidates: [{
            content: { parts: [{ text }] },
            ...(index === parts.length - 1 ? { finishReason: 'STOP' } : {}),
        }],
    })}\n\n`).join('');
    const stream = new ReadableStream({ start(controller) { controller.enqueue(encoder.encode(payload)); controller.close(); } });
    return { ok: true, status: 200, body: stream };
}

function parseSseEvents(body) {
    return String(body).split('\n\n').filter(item => item.startsWith('data: '))
        .map(item => JSON.parse(item.slice(6)));
}

test('T2B-1 handler emits only validated chunks and done.fullText is their exact concatenation', async () => {
    global.fetch = async url => {
        if (String(url).includes('embedContent')) return { ok: false, status: 400 };
        if (String(url).includes('streamGenerateContent')) {
            return geminiStreamResponse([
                'Bạn có thể gọi 0210.123',
                '.4567. Phí 200 USD. Thời hạn 5 ngày làm việc.',
            ]);
        }
        throw new Error(`Unexpected fetch: ${url}`);
    };

    const result = await runHandler(`T2B integration ${Date.now()}: thủ tục này thế nào?`);
    const events = parseSseEvents(result.body);
    const textChunks = events.filter(event => Object.hasOwn(event, 'text')).map(event => event.text);
    const done = events.find(event => event.done);
    const emitted = textChunks.join('');

    assert.ok(done, result.body);
    assert.equal(done.fullText, emitted);
    for (const chunk of textChunks) {
        assert.doesNotMatch(chunk, /0210\.123\.4567|200 USD|5 ngày làm việc/);
    }
    assert.doesNotMatch(emitted, /0210\.123\.4567|200 USD|5 ngày làm việc/);
    assert.match(emitted, /chưa được xác minh|chưa xác minh/);
});

test('T2C provider order defaults to Gemini and only enables configured DeepSeek fallback', () => {
    const oldPrimary = process.env.LLM_PRIMARY;
    const oldFallback = process.env.LLM_FALLBACK;
    const oldKey = process.env.DEEPSEEK_API_KEY;
    try {
        delete process.env.LLM_PRIMARY;
        delete process.env.LLM_FALLBACK;
        delete process.env.DEEPSEEK_API_KEY;
        assert.deepEqual(chat.getChatProviderOrder(), ['gemini']);
        process.env.DEEPSEEK_API_KEY = 'test-key';
        assert.deepEqual(chat.getChatProviderOrder(), ['gemini', 'deepseek']);
        process.env.LLM_PRIMARY = 'deepseek';
        process.env.LLM_FALLBACK = 'gemini';
        assert.deepEqual(chat.getChatProviderOrder(), ['deepseek', 'gemini']);
    } finally {
        if (oldPrimary === undefined) delete process.env.LLM_PRIMARY; else process.env.LLM_PRIMARY = oldPrimary;
        if (oldFallback === undefined) delete process.env.LLM_FALLBACK; else process.env.LLM_FALLBACK = oldFallback;
        if (oldKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = oldKey;
    }
});

test('T2C only permits failover for provider/network retry classes', () => {
    assert.equal(chat.isRetryableProviderFailure({ status: 429 }), true);
    assert.equal(chat.isRetryableProviderFailure({ status: 500 }), true);
    assert.equal(chat.isRetryableProviderFailure({ status: 400 }), false);
    assert.equal(chat.isRetryableProviderFailure({ status: 401 }), false);
});
