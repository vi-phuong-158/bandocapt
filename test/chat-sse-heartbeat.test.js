'use strict';

process.env.NODE_ENV = 'development';
process.env.EVAL_BYPASS_TOKEN = 'heartbeat-test-bypass';
process.env.GEMINI_API_KEY = 'test-key';
process.env.CHAT_LOG_HASH_SALT = 'test-only-hash-salt';
process.env.EVAL_SKIP_FAQ_CACHE = '1';
delete process.env.FIREBASE_DB_URL;

const assert = require('node:assert/strict');
const test = require('node:test');
const { EventEmitter } = require('node:events');
const chat = require('../api/chat');

const ORIGINAL_FETCH = global.fetch;
test.afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
});

// -----------------------------------------------------------------
// Unit test cho helper thuần startSseHeartbeat — không cần dựng handler đầy đủ.
// -----------------------------------------------------------------
function createMockRes() {
    const res = new EventEmitter();
    res.writableEnded = false;
    res.destroyed = false;
    res.writes = [];
    res.write = chunk => { res.writes.push(String(chunk)); return true; };
    return res;
}

function parseHeartbeat(rawChunk) {
    return JSON.parse(rawChunk.replace(/^data: /, '').trim());
}

test('Test 1: heartbeat writes a status event every intervalMs while generation is pending', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    const res = createMockRes();
    const stop = chat.startSseHeartbeat(res, 5000);
    t.mock.timers.tick(5000);
    t.mock.timers.tick(5000);
    t.mock.timers.tick(5000);
    assert.equal(res.writes.length, 3, 'one heartbeat write per interval tick');
    for (const raw of res.writes) {
        assert.deepEqual(parseHeartbeat(raw), { status: 'generating' });
    }
    // Không có nội dung câu trả lời / dữ liệu nội bộ nào lọt vào heartbeat.
    res.writes.forEach(raw => {
        assert.doesNotMatch(raw, /fullText|sources|verifiedLocations|error/);
    });
    stop();
});

test('Test 2: heartbeat stops cleanly on response finish — no writes and no throw after', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    const res = createMockRes();
    chat.startSseHeartbeat(res, 5000);
    t.mock.timers.tick(5000);
    assert.equal(res.writes.length, 1);
    res.writableEnded = true;
    res.emit('finish');
    t.mock.timers.tick(30000);
    assert.equal(res.writes.length, 1, 'no further res.write() after finish');
});

test('Test 3: heartbeat stops cleanly when the client disconnects (close event) — no leak/throw', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    const res = createMockRes();
    chat.startSseHeartbeat(res, 5000);
    t.mock.timers.tick(5000);
    assert.equal(res.writes.length, 1);
    res.emit('close');
    assert.doesNotThrow(() => t.mock.timers.tick(50000));
    assert.equal(res.writes.length, 1, 'no further res.write() after close');
});

test('startSseHeartbeat: defensive check also stops writes once res.writableEnded flips without an event', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    const res = createMockRes();
    chat.startSseHeartbeat(res, 5000);
    t.mock.timers.tick(5000);
    assert.equal(res.writes.length, 1);
    res.writableEnded = true; // mô phỏng response đã kết thúc nhưng không có event 'finish'/'close'
    t.mock.timers.tick(20000);
    assert.equal(res.writes.length, 1, 'defensive writableEnded check also halts further writes');
});

test('startSseHeartbeat: returned stop() is idempotent and safe on a plain mock without EventEmitter', () => {
    const plainRes = { write() { throw new Error('should not be called'); } };
    const stop = chat.startSseHeartbeat(plainRes, 5000);
    assert.doesNotThrow(() => { stop(); stop(); stop(); });
});

// -----------------------------------------------------------------
// Test 10 (giữ nguyên): luồng thành công qua handler thật không hồi quy khi có heartbeat wiring.
// -----------------------------------------------------------------
function createRequest(userMessage) {
    return {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
        body: { captchaToken: 'heartbeat-test-bypass', userMessage, history: [] },
        socket: {},
    };
}

function runHandler(userMessage) {
    return new Promise((resolve, reject) => {
        let body = '';
        const res = Object.assign(new EventEmitter(), {
            headers: {}, statusCode: 200, headersSent: false, writableEnded: false, destroyed: false,
            setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
            status(code) { this.statusCode = code; return this; },
            json(value) { resolve({ statusCode: this.statusCode, body: JSON.stringify(value) }); },
            writeHead(code) { this.statusCode = code; this.headersSent = true; },
            write(value) { body += String(value); return true; },
            end() { this.writableEnded = true; this.emit('finish'); resolve({ statusCode: this.statusCode, body }); },
        });
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

test('Test 10: fast normal generation is unchanged with heartbeat wired (no extra/duplicate status noise)', async () => {
    global.fetch = async url => {
        if (String(url).includes('embedContent')) return { ok: false, status: 400 };
        if (String(url).includes('streamGenerateContent')) {
            return geminiStreamResponse(['Xin chào, đây là câu trả lời đầy đủ cho bài kiểm thử hồi quy.']);
        }
        throw new Error(`Unexpected fetch: ${url}`);
    };

    const result = await runHandler(`Heartbeat regression ${Date.now()}: thủ tục này thế nào?`);
    const events = parseSseEvents(result.body);
    const statusEvents = events.filter(e => e.status === 'generating');
    const done = events.find(e => e.done);

    assert.ok(done, result.body);
    assert.equal(done.error, undefined);
    // Sinh nhanh trong cùng 1 tick nên heartbeat (5s/lần) không kịp bắn thêm — chỉ còn đúng
    // event trạng thái P3.1 có sẵn trước vòng đọc stream, không có heartbeat thừa/trùng lặp.
    assert.equal(statusEvents.length, 1);
});
