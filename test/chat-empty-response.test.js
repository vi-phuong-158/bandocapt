'use strict';

// Hồi quy cho lỗi "Câu hỏi này không phù hợp" giả: DeepSeek trả HTTP 200 nhưng toàn bộ output
// nằm ở reasoning_content nên stream không có chữ nào, và handler cũ gắn nhãn BLOCKED_CONTENT.

process.env.NODE_ENV = 'development';
process.env.EVAL_BYPASS_TOKEN = 'empty-response-test-bypass';
process.env.GEMINI_API_KEY = 'test-key';
process.env.CHAT_LOG_HASH_SALT = 'test-only-hash-salt';
process.env.EVAL_SKIP_FAQ_CACHE = '1';
delete process.env.FIREBASE_DB_URL;

const assert = require('node:assert/strict');
const test = require('node:test');
const { EventEmitter } = require('node:events');
const chat = require('../api/chat');

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const ORIGINAL_PRIMARY = process.env.LLM_PRIMARY;
const ORIGINAL_FALLBACK = process.env.LLM_FALLBACK;

test.afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
    if (ORIGINAL_DEEPSEEK_KEY === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = ORIGINAL_DEEPSEEK_KEY;
    if (ORIGINAL_PRIMARY === undefined) delete process.env.LLM_PRIMARY;
    else process.env.LLM_PRIMARY = ORIGINAL_PRIMARY;
    if (ORIGINAL_FALLBACK === undefined) delete process.env.LLM_FALLBACK;
    else process.env.LLM_FALLBACK = ORIGINAL_FALLBACK;
});

// -----------------------------------------------------------------
// Helper thuần
// -----------------------------------------------------------------

test('buildDeepSeekChatPayload luôn tắt thinking — reasoning không được ăn ngân sách max_tokens của câu trả lời', () => {
    const payload = chat.buildDeepSeekChatPayload({
        systemPrompt: 'system',
        contents: [
            { role: 'user', parts: [{ text: 'câu hỏi cũ' }] },
            { role: 'model', parts: [{ text: 'trả lời cũ' }] },
            { role: 'user', parts: [{ text: 'câu hỏi mới' }] },
        ],
        stream: true,
    });

    assert.deepEqual(payload.thinking, { type: 'disabled' });
    assert.equal(payload.stream, true);
    assert.equal(payload.max_tokens, 3072);
    assert.deepEqual(payload.messages.map(m => m.role), ['system', 'user', 'assistant', 'user']);
    assert.equal(payload.messages[0].content, 'system');
    assert.equal(payload.messages[3].content, 'câu hỏi mới');
});

test('buildDeepSeekChatPayload dùng chung cấu hình cho stream và non-stream, chỉ khác cờ stream', () => {
    const args = { systemPrompt: 'system', contents: [{ role: 'user', parts: [{ text: 'hỏi' }] }] };
    const streaming = chat.buildDeepSeekChatPayload({ ...args, stream: true });
    const nonStreaming = chat.buildDeepSeekChatPayload({ ...args, stream: false });

    assert.equal(nonStreaming.stream, false);
    assert.deepEqual({ ...streaming, stream: null }, { ...nonStreaming, stream: null });
});

test('classifyEmptyGenerationError: chỉ gọi là BLOCKED_CONTENT khi provider nói rõ là chặn', () => {
    // Bị chặn thật
    assert.equal(chat.classifyEmptyGenerationError({ promptFeedback: { blockReason: 'SAFETY' } }), 'BLOCKED_CONTENT');
    assert.equal(chat.classifyEmptyGenerationError({ finishReason: 'SAFETY' }), 'BLOCKED_CONTENT');
    assert.equal(chat.classifyEmptyGenerationError({ finishReason: 'PROHIBITED_CONTENT' }), 'BLOCKED_CONTENT');
    assert.equal(chat.classifyEmptyGenerationError({ finishReason: 'content_filter' }), 'BLOCKED_CONTENT');

    // Rỗng chữ vì lý do kỹ thuật — người hỏi không có lỗi gì
    assert.equal(chat.classifyEmptyGenerationError({ finishReason: 'length' }), 'EMPTY_RESPONSE');
    assert.equal(chat.classifyEmptyGenerationError({ finishReason: 'MAX_TOKENS' }), 'EMPTY_RESPONSE');
    assert.equal(chat.classifyEmptyGenerationError({ finishReason: 'stop' }), 'EMPTY_RESPONSE');
    assert.equal(chat.classifyEmptyGenerationError({}), 'EMPTY_RESPONSE');
    assert.equal(chat.classifyEmptyGenerationError(), 'EMPTY_RESPONSE');
});

// -----------------------------------------------------------------
// Handler thật
// -----------------------------------------------------------------

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
        const req = {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
            body: { captchaToken: 'empty-response-test-bypass', userMessage, history: [] },
            socket: {},
        };
        chat(req, res).catch(reject);
    });
}

function sseStream(payload) {
    const encoder = new TextEncoder();
    return new ReadableStream({
        start(controller) { controller.enqueue(encoder.encode(payload)); controller.close(); }
    });
}

// DeepSeek đốt hết ngân sách vào reasoning_content: delta.content rỗng suốt, finish_reason='length'.
function deepSeekReasoningOnlyStream() {
    const payload = [
        `data: ${JSON.stringify({ choices: [{ delta: { role: 'assistant', reasoning_content: 'đang suy luận...' } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: 'vẫn đang suy luận...' }, finish_reason: 'length' }] })}\n\n`,
        'data: [DONE]\n\n',
    ].join('');
    return { ok: true, status: 200, body: sseStream(payload) };
}

function parseSseEvents(body) {
    return String(body).split('\n\n').filter(item => item.startsWith('data: '))
        .map(item => JSON.parse(item.slice(6)));
}

test('DeepSeek stream chỉ có reasoning_content: retry non-stream cùng provider cứu được câu trả lời', async () => {
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
    delete process.env.LLM_PRIMARY;
    delete process.env.LLM_FALLBACK; // strict mode: providerOrder chỉ có ['deepseek']

    const deepSeekBodies = [];
    global.fetch = async (url, options = {}) => {
        if (String(url).includes('embedContent')) return { ok: false, status: 400 };
        if (String(url).includes('api.deepseek.com')) {
            const parsed = JSON.parse(options.body);
            deepSeekBodies.push(parsed);
            if (parsed.stream) return deepSeekReasoningOnlyStream();
            return {
                ok: true,
                status: 200,
                json: async () => ({ choices: [{ message: { content: 'Đây là câu trả lời sau khi thử lại non-stream.' }, finish_reason: 'stop' }] }),
            };
        }
        throw new Error(`Unexpected fetch: ${url}`);
    };

    const result = await runHandler(`Empty stream retry ${Date.now()}: thủ tục cấp căn cước thế nào?`);
    const events = parseSseEvents(result.body);
    const done = events.find(e => e.done);

    assert.equal(events.find(e => e.error), undefined, result.body);
    assert.ok(done, result.body);
    assert.match(done.fullText, /câu trả lời sau khi thử lại/);
    assert.equal(done.finishReason, 'EMPTY_STREAM_RETRY');

    // Đúng 2 lượt DeepSeek: stream hỏng rồi non-stream cứu; cả hai đều phải tắt thinking.
    assert.equal(deepSeekBodies.length, 2);
    assert.equal(deepSeekBodies[0].stream, true);
    assert.equal(deepSeekBodies[1].stream, false);
    deepSeekBodies.forEach(payload => assert.deepEqual(payload.thinking, { type: 'disabled' }));
});

test('Lượt cứu chạm trần token vẫn giữ finish reason của provider để nối câu chốt, không nuốt thành nhãn EMPTY_STREAM_*', async () => {
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
    delete process.env.LLM_PRIMARY;
    delete process.env.LLM_FALLBACK;

    global.fetch = async (url, options = {}) => {
        if (String(url).includes('embedContent')) return { ok: false, status: 400 };
        if (String(url).includes('api.deepseek.com')) {
            if (JSON.parse(options.body).stream) return deepSeekReasoningOnlyStream();
            return {
                ok: true,
                status: 200,
                json: async () => ({ choices: [{
                    message: { content: 'Bạn cần chuẩn bị hồ sơ theo quy định. Cơ quan tiếp nhận sẽ hướng dẫn' },
                    finish_reason: 'length',
                }] }),
            };
        }
        throw new Error(`Unexpected fetch: ${url}`);
    };

    const result = await runHandler(`Rescue truncated ${Date.now()}: thủ tục cấp căn cước thế nào?`);
    const done = parseSseEvents(result.body).find(e => e.done);

    assert.ok(done, result.body);
    assert.equal(done.finishReason, 'length', 'giữ finish reason của provider khi lượt cứu bị cắt cụt');
    assert.equal(done.truncated, true);
});

test('DeepSeek rỗng chữ hoàn toàn: báo EMPTY_RESPONSE, KHÔNG đổ lỗi câu hỏi bằng BLOCKED_CONTENT', async () => {
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
    delete process.env.LLM_PRIMARY;
    delete process.env.LLM_FALLBACK;

    global.fetch = async (url, options = {}) => {
        if (String(url).includes('embedContent')) return { ok: false, status: 400 };
        if (String(url).includes('api.deepseek.com')) {
            if (JSON.parse(options.body).stream) return deepSeekReasoningOnlyStream();
            return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '' } }] }) };
        }
        throw new Error(`Unexpected fetch: ${url}`);
    };

    const result = await runHandler(`Empty response ${Date.now()}: thủ tục cấp căn cước thế nào?`);
    const events = parseSseEvents(result.body);
    const error = events.find(e => e.error);

    assert.ok(error, result.body);
    assert.equal(error.error, 'EMPTY_RESPONSE');
});

test('Strict mode không rời DeepSeek sang Gemini khi rỗng chữ (đúng quyết định 2026-07-23)', async () => {
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
    delete process.env.LLM_PRIMARY;
    delete process.env.LLM_FALLBACK;

    let geminiGenerationCalls = 0;
    global.fetch = async (url, options = {}) => {
        if (String(url).includes('embedContent')) return { ok: false, status: 400 };
        if (String(url).includes('generativelanguage.googleapis.com')) {
            geminiGenerationCalls += 1;
            return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Gemini đã trả lời' }] } }] }) };
        }
        if (String(url).includes('api.deepseek.com')) {
            if (JSON.parse(options.body).stream) return deepSeekReasoningOnlyStream();
            return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '' } }] }) };
        }
        throw new Error(`Unexpected fetch: ${url}`);
    };

    const result = await runHandler(`Strict no crossover ${Date.now()}: thủ tục cấp căn cước thế nào?`);
    const events = parseSseEvents(result.body);

    assert.equal(events.find(e => e.error)?.error, 'EMPTY_RESPONSE', result.body);
    assert.equal(geminiGenerationCalls, 0, 'strict mode: không được gọi Gemini cho generation');
});

test('Stable mode (LLM_FALLBACK=gemini): rỗng chữ thì chuyển sang provider kế tiếp', async () => {
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
    process.env.LLM_PRIMARY = 'deepseek';
    process.env.LLM_FALLBACK = 'gemini';

    global.fetch = async (url, options = {}) => {
        if (String(url).includes('embedContent')) return { ok: false, status: 400 };
        if (String(url).includes('generativelanguage.googleapis.com')) {
            return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Gemini đã soạn câu trả lời thay thế.' }] } }] }) };
        }
        if (String(url).includes('api.deepseek.com')) {
            if (JSON.parse(options.body).stream) return deepSeekReasoningOnlyStream();
            return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '' } }] }) };
        }
        throw new Error(`Unexpected fetch: ${url}`);
    };

    const result = await runHandler(`Stable fallback ${Date.now()}: thủ tục cấp căn cước thế nào?`);
    const events = parseSseEvents(result.body);
    const done = events.find(e => e.done);

    assert.equal(events.find(e => e.error), undefined, result.body);
    assert.ok(done, result.body);
    assert.match(done.fullText, /Gemini đã soạn câu trả lời thay thế/);
    assert.equal(done.finishReason, 'EMPTY_STREAM_FALLBACK');
});

test('Gemini bị safety filter chặn thật: vẫn giữ nguyên nhãn BLOCKED_CONTENT', async () => {
    delete process.env.DEEPSEEK_API_KEY;
    process.env.LLM_PRIMARY = 'gemini';
    delete process.env.LLM_FALLBACK;

    global.fetch = async url => {
        if (String(url).includes('embedContent')) return { ok: false, status: 400 };
        if (String(url).includes('streamGenerateContent')) {
            const payload = `data: ${JSON.stringify({
                promptFeedback: { blockReason: 'SAFETY' },
                candidates: [{ finishReason: 'SAFETY', safetyRatings: [] }],
            })}\n\n`;
            return { ok: true, status: 200, body: sseStream(payload) };
        }
        if (String(url).includes('generateContent')) {
            return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [] } }] }) };
        }
        throw new Error(`Unexpected fetch: ${url}`);
    };

    const result = await runHandler(`Real block ${Date.now()}: thủ tục cấp căn cước thế nào?`);
    const events = parseSseEvents(result.body);

    assert.equal(events.find(e => e.error)?.error, 'BLOCKED_CONTENT', result.body);
});
