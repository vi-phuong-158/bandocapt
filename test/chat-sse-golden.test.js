'use strict';

// =====================================================================
// GOLDEN SSE — khoá byte-identical cho đường trả lời của /api/chat.
//
// Bộ test này KHÔNG kiểm tra nội dung nghiệp vụ. Nó chụp lại CHÍNH XÁC chuỗi
// thao tác mà handler thực hiện trên `res` (status, thứ tự header, từng chunk
// write, end) và so với fixture đã sinh trên baseline. Mục đích duy nhất: một
// refactor transport (sink inversion) không được làm đổi dù một byte nào của
// response gửi tới trình duyệt.
//
// Sinh lại fixture (chỉ khi baseline đổi có chủ đích):
//   UPDATE_SSE_GOLDEN=1 node --test test/chat-sse-golden.test.js
// =====================================================================

process.env.NODE_ENV = 'development';
process.env.EVAL_BYPASS_TOKEN = 'golden-bypass';
process.env.CHAT_LOG_HASH_SALT = 'golden-only-hash-salt';
process.env.EVAL_SKIP_FAQ_CACHE = '1';
delete process.env.FIREBASE_DB_URL;
delete process.env.FIREBASE_DB_SECRET;
delete process.env.PINECONE_API_KEY;
delete process.env.DEEPSEEK_API_KEY;
delete process.env.LLM_PRIMARY;
delete process.env.LLM_FALLBACK;
delete process.env.RAG_GOVERNANCE_FILTER;
delete process.env.EMBED_TASK_TYPE;

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const handler = require('../api/chat');

const GOLDEN_DIR = path.join(__dirname, 'golden');
const UPDATE = process.env.UPDATE_SSE_GOLDEN === '1';

// ---------------------------------------------------------------------
// Recorder: ghi lại thứ tự thao tác trên `res` đúng như handler gọi.
// ---------------------------------------------------------------------
function createRecordingResponse() {
    const ops = [];
    let headersSent = false;
    const res = {
        get headersSent() { return headersSent; },
        setHeader(name, value) {
            ops.push({ op: 'setHeader', name, value: String(value) });
            return this;
        },
        writeHead(code, headers = {}) {
            headersSent = true;
            ops.push({ op: 'writeHead', code, headers: Object.entries(headers).map(([k, v]) => [k, String(v)]) });
            return this;
        },
        status(code) {
            ops.push({ op: 'status', code });
            return this;
        },
        json(payload) {
            ops.push({ op: 'json', payload });
            headersSent = true;
            return this;
        },
        write(chunk) {
            ops.push({ op: 'write', chunk: String(chunk) });
            return true;
        },
        end(payload) {
            ops.push(payload === undefined ? { op: 'end' } : { op: 'end', payload: String(payload) });
            headersSent = true;
            return this;
        },
    };
    return { res, ops };
}

function createRequest(userMessage, extra = {}) {
    return {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'user-agent': 'golden-harness/1.0',
            'x-forwarded-for': '203.0.113.9',
        },
        body: { userMessage, history: [], captchaToken: process.env.EVAL_BYPASS_TOKEN, ...extra },
        socket: {},
    };
}

// ---------------------------------------------------------------------
// Mock mạng: mọi I/O ngoài đều tất định. Không có lời gọi thật nào.
// ---------------------------------------------------------------------
function geminiStreamBody(chunks, throwAfter = null) {
    const encoder = new TextEncoder();
    let i = 0;
    return {
        getReader() {
            return {
                read() {
                    if (throwAfter !== null && i >= throwAfter) {
                        return Promise.reject(new Error('golden-forced-stream-failure'));
                    }
                    if (i < chunks.length) {
                        return Promise.resolve({ done: false, value: encoder.encode(chunks[i++]) });
                    }
                    return Promise.resolve({ done: true, value: undefined });
                },
                cancel() { return Promise.resolve(); },
            };
        },
    };
}

function geminiChunk(text, finishReason) {
    const candidate = { content: { parts: [{ text }] } };
    if (finishReason) candidate.finishReason = finishReason;
    return `data: ${JSON.stringify({ candidates: [candidate] })}\n\n`;
}

function installFetch({ streamChunks = null, throwAfter = null, generationError = null } = {}) {
    global.fetch = async (url) => {
        const target = String(url);
        // Embedding: trả lỗi có kiểm soát → embedVector rỗng, không có RAG. Không gọi Pinecone.
        if (target.includes('embedContent')) {
            return new Response('{}', { status: 503, headers: { 'content-type': 'application/json' } });
        }
        // Generation stream.
        if (target.includes('streamGenerateContent')) {
            if (generationError) {
                return new Response(JSON.stringify({ error: { message: generationError.message } }), {
                    status: generationError.status,
                    headers: { 'content-type': 'application/json' },
                });
            }
            if (!streamChunks) throw new Error('golden: generation not expected in this scenario');
            return { ok: true, status: 200, body: geminiStreamBody(streamChunks, throwAfter) };
        }
        // Mọi thứ còn lại (Google Sheets trụ sở, utility, telemetry) → không khả dụng,
        // handler đã có nhánh fail-open/fail-closed tất định cho từng cái.
        throw new Error(`golden: unmocked fetch ${target}`);
    };
}

// ---------------------------------------------------------------------
// Kịch bản
// ---------------------------------------------------------------------
const SCENARIOS = [
    {
        name: 'out-of-scope',
        note: 'Câu ngoài phạm vi → SSE tất định, 4 header, finishReason OUT_OF_SCOPE',
        env: {},
        message: 'Giá bitcoin hôm nay bao nhiêu?',
        fetch: {},
    },
    {
        name: 'missing-api-key',
        note: 'Thiếu GEMINI_API_KEY giữa orchestration → 500 JSON, không mở stream',
        env: { GEMINI_API_KEY: null },
        message: 'Thủ tục cấp căn cước cần giấy tờ gì?',
        fetch: {},
    },
    {
        name: 'rag-abstained',
        note: 'RAG_FAIL_CLOSED=1, không có ngữ cảnh grounded → SSE tất định RAG_ABSTAINED',
        env: { GEMINI_API_KEY: 'golden-key', RAG_FAIL_CLOSED: '1' },
        message: 'Thủ tục đăng ký thường trú cần giấy tờ gì?',
        fetch: {},
    },
    {
        name: 'bare-place-no-match',
        note: 'Địa danh thuần, không tra được trụ sở → SSE tất định DETERMINISTIC_NO_MATCH',
        env: { GEMINI_API_KEY: 'golden-key' },
        message: 'Xã Hy Cương',
        fetch: {},
    },
    {
        name: 'stream-generation',
        note: 'Luồng generation đầy đủ: writeHead → status:generating → segment đã validate → done',
        env: { GEMINI_API_KEY: 'golden-key' },
        message: 'Cho hỏi thủ tục gia hạn tạm trú cho người nước ngoài làm thế nào?',
        fetch: {
            streamChunks: [
                geminiChunk('Anh chị vui lòng liên hệ trực tiếp cơ quan có thẩm quyền để được hướng dẫn. '),
                geminiChunk('Cán bộ tiếp nhận sẽ hướng dẫn hồ sơ cụ thể theo từng trường hợp.', 'STOP'),
            ],
        },
    },
    {
        name: 'stream-empty-generation',
        note: 'Provider không sinh chữ nào → event error, không có done',
        env: { GEMINI_API_KEY: 'golden-key' },
        message: 'Cho hỏi thủ tục gia hạn thị thực cho người nước ngoài thế nào?',
        fetch: { streamChunks: [geminiChunk('', 'SAFETY')] },
    },
    {
        name: 'stream-error-after-headers',
        note: 'Lỗi sau khi header đã gửi → nhánh headersSent=true: STREAM_ERROR trên SSE, không phải 500 JSON',
        env: { GEMINI_API_KEY: 'golden-key' },
        message: 'Cho hỏi thủ tục gia hạn tạm trú cho người nước ngoài làm thế nào?',
        fetch: {
            streamChunks: [geminiChunk('Anh chị vui lòng liên hệ cơ quan có thẩm quyền để được hướng dẫn. ')],
            throwAfter: 1,
        },
    },
    {
        name: 'procedure-gap',
        note: 'Hỏi cấp lại thẻ tạm trú bị mất nhưng không có đúng biến thể tài liệu → SSE tất định DETERMINISTIC_PROCEDURE_GAP',
        env: { GEMINI_API_KEY: 'golden-key' },
        message: 'Tôi bị mất thẻ tạm trú thì làm lại thế nào?',
        fetch: {},
    },
    {
        name: 'provider-http-error',
        note: 'Provider trả HTTP 400 → sink.fail(status, …) giữa orchestration, không mở stream',
        env: { GEMINI_API_KEY: 'golden-key' },
        message: 'Cho hỏi thủ tục gia hạn tạm trú cho người nước ngoài làm thế nào?',
        fetch: { generationError: { status: 400, message: 'golden-forced-bad-request' } },
    },
];

const ORIGINAL_FETCH = global.fetch;
const TRACKED_ENV = ['GEMINI_API_KEY', 'RAG_FAIL_CLOSED'];

async function runScenario(scenario) {
    const saved = {};
    TRACKED_ENV.forEach(key => { saved[key] = process.env[key]; });
    Object.entries(scenario.env).forEach(([key, value]) => {
        if (value === null) delete process.env[key];
        else process.env[key] = value;
    });
    if (!('GEMINI_API_KEY' in scenario.env)) process.env.GEMINI_API_KEY = 'golden-key';
    if (!('RAG_FAIL_CLOSED' in scenario.env)) delete process.env.RAG_FAIL_CLOSED;

    installFetch(scenario.fetch);
    const { res, ops } = createRecordingResponse();
    try {
        await handler(createRequest(scenario.message), res);
    } finally {
        global.fetch = ORIGINAL_FETCH;
        TRACKED_ENV.forEach(key => {
            if (saved[key] === undefined) delete process.env[key];
            else process.env[key] = saved[key];
        });
    }
    return ops;
}

for (const scenario of SCENARIOS) {
    test(`golden SSE: ${scenario.name}`, async () => {
        const ops = await runScenario(scenario);
        const fixturePath = path.join(GOLDEN_DIR, `${scenario.name}.json`);
        const actual = { note: scenario.note, ops };

        if (UPDATE) {
            fs.writeFileSync(fixturePath, `${JSON.stringify(actual, null, 2)}\n`, 'utf8');
            return;
        }

        assert.ok(fs.existsSync(fixturePath), `thiếu fixture ${fixturePath} — chạy UPDATE_SSE_GOLDEN=1`);
        const expected = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
        assert.deepEqual(actual.ops, expected.ops, `golden mismatch cho ${scenario.name}`);

        // Kiểm tra riêng phần thân stream: chuỗi byte nối liền phải khớp tuyệt đối.
        const bodyOf = list => list.filter(op => op.op === 'write').map(op => op.chunk).join('');
        assert.equal(bodyOf(actual.ops), bodyOf(expected.ops), `thân SSE lệch byte ở ${scenario.name}`);
    });
}

test('golden SSE: bộ khoá phủ tối thiểu 5 kịch bản', () => {
    assert.ok(SCENARIOS.length >= 5, 'cần ít nhất 5 kịch bản khoá byte-identical');
});
