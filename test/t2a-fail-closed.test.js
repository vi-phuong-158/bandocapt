'use strict';

// T2A: Fail-closed khi thiếu RAG + hợp nhất standaloneQuery.
// Env eval-dev phải đặt TRƯỚC khi require api/chat (bypass Turnstile + rate limit).

process.env.NODE_ENV = 'development';
process.env.EVAL_BYPASS_TOKEN = 'test-bypass-token';
process.env.CHAT_LOG_HASH_SALT = 'test-only-hash-salt';
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-key';
delete process.env.FIREBASE_DB_URL;

const assert = require('node:assert/strict');
const test = require('node:test');

const chatHandler = require('../api/chat');
const { shouldAbstainForMissingRag, getRagAbstentionReply, getRagAbstentionReason } = chatHandler;

const ORIGINAL_FETCH = global.fetch;

test.afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
    delete process.env.RAG_FAIL_CLOSED;
    delete process.env.PINECONE_API_KEY;
});

// ---------------------------------------------------------------------------
// shouldAbstainForMissingRag — cổng thuần: chỉ abstain khi TẤT CẢ nguồn đều rỗng
// ---------------------------------------------------------------------------

test('abstain CHỈ khi không có docs, không trụ sở xác minh, không khối XNC', () => {
    assert.equal(shouldAbstainForMissingRag({
        hasMatchedDocs: false, hasVerifiedLocation: false, hasXncAuthorityBlock: false,
    }), true);
});

test('KHÔNG abstain khi có bất kỳ nguồn grounded nào', () => {
    const combos = [
        { hasMatchedDocs: true, hasVerifiedLocation: false, hasXncAuthorityBlock: false },
        { hasMatchedDocs: false, hasVerifiedLocation: true, hasXncAuthorityBlock: false },
        { hasMatchedDocs: false, hasVerifiedLocation: false, hasXncAuthorityBlock: true },
        { hasMatchedDocs: true, hasVerifiedLocation: true, hasXncAuthorityBlock: true },
    ];
    for (const c of combos) {
        assert.equal(shouldAbstainForMissingRag(c), false, JSON.stringify(c));
    }
});

// ---------------------------------------------------------------------------
// getRagAbstentionReply — theo ngôn ngữ, tương thích grader must_abstain, không số liệu
// ---------------------------------------------------------------------------

test('thông báo abstain theo đúng ngôn ngữ người dùng', () => {
    assert.match(getRagAbstentionReply('vi'), /Công an phường\/xã/);
    assert.match(getRagAbstentionReply('en'), /Ward\/Commune Police/);
    assert.match(getRagAbstentionReply('zh'), /公安/);
    assert.match(getRagAbstentionReply('ko'), /공안/);
    // Mặc định (không xác định) → tiếng Anh.
    assert.equal(getRagAbstentionReply('fr'), getRagAbstentionReply('en'));
});

test('thông báo VI khớp pattern must_abstain (TR05) và không chứa số liệu', () => {
    const vi = getRagAbstentionReply('vi');
    // TR05 required_facts (match any): "liên hệ ... Công an" + "chưa (tìm thấy) ... căn cứ".
    assert.match(vi, /liên hệ[^.!?\n]{0,40}Công an/);
    assert.match(vi, /chưa (?:tìm thấy|có|có thông tin về)[^.!?\n]{0,30}(?:mức (?:xử )?phạt|căn cứ)/);
    // Không được chứa số phạt/tiền → tránh forbidden + tránh bị redact.
    assert.doesNotMatch(vi, /\d/);
});

test('phân loại đủ bốn abstentionReason theo đúng thứ tự ưu tiên', () => {
    assert.equal(getRagAbstentionReason({ hasPineconeConfig: false, embedVectorLength: 0, pineconeErrored: true }), 'no_pinecone_config');
    assert.equal(getRagAbstentionReason({ hasPineconeConfig: true, embedVectorLength: 0, pineconeErrored: true }), 'embedding_failed');
    assert.equal(getRagAbstentionReason({ hasPineconeConfig: true, embedVectorLength: 768, pineconeErrored: true }), 'pinecone_error');
    assert.equal(getRagAbstentionReason({ hasPineconeConfig: true, embedVectorLength: 768, pineconeErrored: false }), 'no_relevant_match');
});

// ---------------------------------------------------------------------------
// Integration: handler thật, fetch bị chặn (embedding fail → không có RAG)
// ---------------------------------------------------------------------------

function createRequest(body) {
    return {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
        body,
        socket: {},
    };
}

function runHandler(body) {
    return new Promise((resolve, reject) => {
        let buffer = '';
        const res = {
            headers: {},
            statusCode: 200,
            setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
            status(code) { this.statusCode = code; return this; },
            json(payload) { resolve({ statusCode: this.statusCode, body: JSON.stringify(payload) }); return this; },
            writeHead(code) { this.statusCode = code; return this; },
            write(chunk) { buffer += chunk.toString(); return true; },
            end() { resolve({ statusCode: this.statusCode, body: buffer }); return this; },
        };
        chatHandler(createRequest(body), res).catch(reject);
    });
}

function parseSseEvents(body) {
    return String(body || '')
        .split('\n\n')
        .filter(part => part.startsWith('data: '))
        .map(part => JSON.parse(part.substring(6)));
}

// Câu thủ tục thuần (không địa danh, không kích hoạt thẩm quyền XNC).
const PROCEDURE_Q = 'Thủ tục đăng ký thường trú cần chuẩn bị những giấy tờ gì?';
// Câu thuộc thẩm quyền XNC (người nước ngoài mất hộ chiếu) → có khối verified XNC.
const XNC_Q = 'Tôi là người nước ngoài bị mất hộ chiếu, cần làm gì?';

test('RAG_FAIL_CLOSED=1: câu thủ tục thiếu RAG → abstain tất định, không gọi model', async () => {
    process.env.RAG_FAIL_CLOSED = '1';
    process.env.PINECONE_API_KEY = 'test-key'; // để reason = embedding_failed (không phải no_pinecone_config)
    const urls = [];
    global.fetch = async url => {
        urls.push(String(url));
        throw new Error('network blocked in test');
    };

    const result = await runHandler({ captchaToken: 'test-bypass-token', userMessage: PROCEDURE_Q, history: [] });

    assert.ok(result.body.includes('RAG_ABSTAINED'), `phải abstain, got: ${result.body.slice(0, 300)}`);
    assert.ok(result.body.includes('"abstentionReason":"embedding_failed"'),
        `reason phải là embedding_failed, got: ${result.body.slice(0, 300)}`);
    assert.ok(result.body.includes('Công an phường/xã'), 'phải là thông báo abstain tiếng Việt');
    assert.equal(urls.some(url => /gemini-2\.5-flash:(?:streamGenerateContent|generateContent)/.test(url)), false,
        `không được gọi model generation: ${urls.join(', ')}`);
});

test('eval-mode: abstention vẫn trả retrieval trace rỗng để grader không bỏ qua grounding', async () => {
    process.env.RAG_FAIL_CLOSED = '1';
    process.env.PINECONE_API_KEY = 'test-key';
    global.fetch = async () => { throw new Error('network blocked in test'); };

    const result = await runHandler({
        captchaToken: 'test-bypass-token', userMessage: PROCEDURE_Q, history: [], evalDebug: true,
    });
    const done = parseSseEvents(result.body).find(event => event.done);

    assert.equal(done.finishReason, 'RAG_ABSTAINED');
    assert.equal(done.eval.standaloneQuery, PROCEDURE_Q);
    assert.equal(done.eval.classifyQuery, PROCEDURE_Q);
    assert.deepEqual(done.eval.matchesFinal, []);
    assert.equal(done.eval.matchedDocs, '');
    assert.ok(done.eval.timings);
    assert.ok(Number.isFinite(done.eval.timings.total_ms));
});

test('RAG_FAIL_CLOSED=1: không cấu hình Pinecone → reason=no_pinecone_config', async () => {
    process.env.RAG_FAIL_CLOSED = '1';
    delete process.env.PINECONE_API_KEY;
    global.fetch = async () => { throw new Error('network blocked in test'); };

    const result = await runHandler({ captchaToken: 'test-bypass-token', userMessage: PROCEDURE_Q, history: [] });

    assert.ok(result.body.includes('"abstentionReason":"no_pinecone_config"'),
        `got: ${result.body.slice(0, 300)}`);
});

test('KHÔNG over-refuse: câu thẩm quyền XNC vẫn đi tiếp (không abstain) dù thiếu RAG', async () => {
    process.env.RAG_FAIL_CLOSED = '1';
    process.env.PINECONE_API_KEY = 'test-key';
    global.fetch = async () => { throw new Error('network blocked in test'); };

    const result = await runHandler({ captchaToken: 'test-bypass-token', userMessage: XNC_Q, history: [] });

    assert.ok(!result.body.includes('RAG_ABSTAINED'),
        `khối XNC phải chặn abstain, got: ${result.body.slice(0, 300)}`);
});

test('standaloneQuery giữ ngữ cảnh follow-up ngắn để nhánh XNC không bị abstain', async () => {
    process.env.RAG_FAIL_CLOSED = '1';
    process.env.PINECONE_API_KEY = 'test-key';
    const rewritten = 'Tôi là người nước ngoài bị mất hộ chiếu, cần làm gì?';
    global.fetch = async url => {
        const value = String(url);
        if (value.includes('gemini-2.5-flash-lite:generateContent')) {
            return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: rewritten }] } }] }) };
        }
        throw new Error('network blocked in test');
    };

    const result = await runHandler({
        captchaToken: 'test-bypass-token',
        userMessage: 'Tôi cần làm gì?',
        history: [{ role: 'user', parts: [{ text: 'Tôi là người nước ngoài bị mất hộ chiếu.' }] }],
        evalDebug: true,
    });

    assert.ok(!result.body.includes('RAG_ABSTAINED'),
        `query đã rewrite phải kích hoạt khối XNC, got: ${result.body.slice(0, 300)}`);
});

test('mặc định (RAG_FAIL_CLOSED tắt): không abstain, giữ nguyên hành vi cũ', async () => {
    delete process.env.RAG_FAIL_CLOSED;
    process.env.PINECONE_API_KEY = 'test-key';
    global.fetch = async () => { throw new Error('network blocked in test'); };

    const result = await runHandler({ captchaToken: 'test-bypass-token', userMessage: PROCEDURE_Q, history: [] });

    assert.ok(!result.body.includes('RAG_ABSTAINED'),
        `flag tắt phải giữ hành vi cũ (không abstain), got: ${result.body.slice(0, 300)}`);
});
