'use strict';

// =====================================================================
// ZALO BOT UX HARDENING — end-to-end qua api/chat.js handler thật: câu trả lời shared RAG
// (Markdown kiểu website: **đậm**, ### tiêu đề, - bullet, [nhãn](url)) phải tới Zalo ở dạng
// text sạch. Pinecone được giả lập, Gemini trả SSE cố định — không gọi mạng thật.
// =====================================================================

process.env.NODE_ENV = 'development';
process.env.CHAT_LOG_HASH_SALT = 'zalo-ux-test-hash-salt';
process.env.ZALO_BOT_WEBHOOK_SECRET = 'zalo-ux-test-webhook-secret-1234';
process.env.ZALO_BOT_TOKEN = 'zalo-ux-test-bot-token-SECRETVALUE';
process.env.GEMINI_API_KEY = 'zalo-ux-test-gemini-key';
process.env.PINECONE_API_KEY = 'zalo-ux-test-pinecone-key';
process.env.PINECONE_INDEX_NAME = 'test-index';
process.env.EVAL_SKIP_FAQ_CACHE = '1';
delete process.env.PINECONE_INDEX_HOST;
delete process.env.PINECONE_NAMESPACE;
delete process.env.PUBLIC_LOCATION_SPREADSHEET_ID;
delete process.env.FIREBASE_DB_URL;
delete process.env.FIREBASE_DB_SECRET;
delete process.env.DEEPSEEK_API_KEY;
delete process.env.LLM_PRIMARY;
delete process.env.LLM_FALLBACK;
delete process.env.RAG_GOVERNANCE_FILTER;
delete process.env.RAG_FAIL_CLOSED;
delete process.env.EVAL_BYPASS_TOKEN;
delete process.env.TURNSTILE_SECRET_KEY;

const assert = require('node:assert/strict');
const test = require('node:test');

const FAKE_PINECONE_MATCH = {
    id: 'tthc_cccd_general_procedure',
    score: 0.9,
    metadata: {
        text: [
            'Thủ tục: Cấp, đổi, cấp lại thẻ Căn cước',
            'Hồ sơ: Tờ khai CC01, giấy tờ tuỳ thân, ảnh chân dung.',
            'Trình tự: Nộp hồ sơ, chụp ảnh, thu nhận vân tay, nhận giấy hẹn trả kết quả.',
            'Thời hạn giải quyết: 07 ngày làm việc.',
        ].join('\n'),
        title: 'Cấp, đổi, cấp lại thẻ Căn cước',
        loai_thu_tuc: 'can_cuoc',
        linh_vuc: 'can_cuoc',
    },
};
class FakePineconeIndex {
    namespace() { return this; }
    async query() { return { matches: [FAKE_PINECONE_MATCH] }; }
}
class FakePinecone {
    index() { return new FakePineconeIndex(); }
}
const pineconePath = require.resolve('@pinecone-database/pinecone');
require.cache[pineconePath] = { id: pineconePath, filename: pineconePath, loaded: true, exports: { Pinecone: FakePinecone } };

const vercelFunctionsPath = require.resolve('@vercel/functions');
let waitUntilTasks = [];
require.cache[vercelFunctionsPath] = {
    id: vercelFunctionsPath,
    filename: vercelFunctionsPath,
    loaded: true,
    exports: { waitUntil(promise) { waitUntilTasks.push(Promise.resolve(promise).catch(() => {})); } },
};

const handler = require('../api/chat');

// Đúng khuôn "CẤU TRÚC A" mà SYSTEM_PROMPT_BASE yêu cầu model sinh cho website.
const MARKDOWN_RAG_ANSWER = [
    '**Bạn cần chuẩn bị Tờ khai CC01 và ảnh chân dung.**',
    '',
    '### Hồ sơ',
    '**📋 Hồ sơ cần chuẩn bị**',
    '- Tờ khai **CC01**',
    '- Ảnh chân dung',
    '',
    '**📝 Trình tự thực hiện**',
    '1. Nộp hồ sơ tại **Công an cấp xã**.',
    '2. Thời gian giải quyết: 07 ngày làm việc.',
    '',
    '- [Tra cứu thủ tục](https://www.bandocapt.io.vn/)',
].join('\n');

function sseResponse(text) {
    const body = [
        `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] })}`,
        `data: ${JSON.stringify({ candidates: [{ finishReason: 'STOP' }] })}`,
        '',
    ].join('\n');
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

function installFetchMock() {
    const sentMessages = [];
    const unexpected = [];
    global.fetch = async (url, options = {}) => {
        const target = String(url);
        if (target.includes('/usage_zalo_bot/')) {
            const method = (options.method || 'GET').toUpperCase();
            if (method === 'GET') return { ok: true, status: 200, headers: { get: () => 'etag-1' }, json: async () => null };
            return { ok: true, status: 200, json: async () => ({}) };
        }
        if (target.includes('bot-api.zaloplatforms.com') && target.includes('/sendMessage')) {
            sentMessages.push(JSON.parse(options.body));
            return { ok: true, status: 200, json: async () => ({ ok: true }) };
        }
        if (target.includes('gemini-embedding-001')) return Response.json({ embedding: { values: [0.1, 0.2, 0.3] } });
        if (target.includes(':streamGenerateContent') || target.includes(':generateContent')) return sseResponse(MARKDOWN_RAG_ANSWER);
        unexpected.push(target.replace(/key=[^&]+/, 'key=***'));
        throw new Error('zalo-bot-ux test: unmocked fetch');
    };
    return { sentMessages, unexpected };
}

async function flushBackgroundWork() {
    for (let i = 0; i < 6; i++) {
        const pending = waitUntilTasks.splice(0, waitUntilTasks.length);
        if (pending.length === 0) break;
        await Promise.all(pending);
    }
}

test('UX-E2E: câu trả lời shared RAG có Markdown tới Zalo ở dạng text sạch, giữ URL/emoji/xuống dòng', async () => {
    const { sentMessages } = installFetchMock();
    const res = {
        _calls: [],
        status(code) { this._calls.push({ code }); return this; },
        json(payload) { this._calls.push({ payload }); return this; },
        setHeader() { return this; },
        end() { return this; },
    };
    await handler({
        method: 'POST',
        query: { __channel: 'zalo_bot' },
        headers: { 'content-type': 'application/json', 'x-bot-api-secret-token': process.env.ZALO_BOT_WEBHOOK_SECRET },
        body: {
            event_name: 'message.text.received',
            message: { text: 'Làm căn cước cần giấy tờ gì?', chat: { id: '9001', chat_type: 'PRIVATE' }, from: { id: '9002', is_bot: false } },
        },
    }, res);
    await flushBackgroundWork();

    assert.equal(res._calls[0].code, 200);
    assert.equal(sentMessages.length, 1);
    const text = sentMessages[0].text;
    assert.match(text, /Tờ khai CC01/, 'phải là câu trả lời RAG thật, không phải câu fallback');
    assert.doesNotMatch(text, /\*\*|__|^#{1,6}\s|\]\(|`/m, `còn ký hiệu Markdown:\n${text}`);
    assert.match(text, /^📋 Hồ sơ cần chuẩn bị$/m);
    assert.match(text, /^• Ảnh chân dung$/m);
    assert.match(text, /^1\. Nộp hồ sơ tại Công an cấp xã\.$/m);
    // URL không có trong tài liệu đã xác minh bị lib/output-validator.js gỡ (chống bịa link),
    // để lại `[Tra cứu thủ tục]()` — Zalo chỉ được thấy nhãn, không thấy ký hiệu link rỗng.
    assert.match(text, /^• Tra cứu thủ tục$/m);
});
