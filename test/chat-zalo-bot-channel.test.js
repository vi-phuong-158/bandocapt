'use strict';

// =====================================================================
// Zalo Bot Platform V0 — kiểm thử tích hợp qua chính api/chat.js handler.
//
// Mục tiêu: chứng minh kênh Zalo (route /api/chat?__channel=zalo_bot) dùng
// LẠI đúng pipeline RAG hiện có (không copy pipeline thứ hai), tách biệt hoàn
// toàn CORS/HMAC/Turnstile/rate-limit-theo-IP của website, và không rò rỉ
// token/secret ra log. Câu hỏi test dùng cụm "thời tiết" để rơi vào nhánh
// isClearlyOutOfScope() — một nhánh xác định, không cần mock Pinecone/Gemini.
// =====================================================================

process.env.NODE_ENV = 'development';
process.env.CHAT_LOG_HASH_SALT = 'zalo-test-hash-salt';
process.env.ZALO_BOT_WEBHOOK_SECRET = 'zalo-test-webhook-secret-1234';
process.env.ZALO_BOT_TOKEN = 'zalo-test-bot-token-SECRETVALUE';
delete process.env.FIREBASE_DB_URL;
delete process.env.FIREBASE_DB_SECRET;
delete process.env.PINECONE_API_KEY;
delete process.env.DEEPSEEK_API_KEY;
delete process.env.LLM_PRIMARY;
delete process.env.LLM_FALLBACK;
delete process.env.RAG_GOVERNANCE_FILTER;
delete process.env.EVAL_BYPASS_TOKEN;
delete process.env.TURNSTILE_SECRET_KEY;

const assert = require('node:assert/strict');
const test = require('node:test');

// --- Chặn @vercel/functions.waitUntil để test có thể await đúng tác vụ nền ---
const vercelFunctionsPath = require.resolve('@vercel/functions');
let waitUntilTasks = [];
require.cache[vercelFunctionsPath] = {
    id: vercelFunctionsPath,
    filename: vercelFunctionsPath,
    loaded: true,
    exports: {
        waitUntil(promise) {
            waitUntilTasks.push(Promise.resolve(promise).catch(() => {}));
        },
    },
};

const handler = require('../api/chat');

async function flushZaloBackgroundWork() {
    // Vòng lặp nhỏ vì runChatOrchestration tự lên lịch waitUntil bổ sung
    // (checkGroundednessAsync/logChatToFirestore) sau khi task Zalo đã chạy.
    for (let i = 0; i < 5; i++) {
        const pending = waitUntilTasks.splice(0, waitUntilTasks.length);
        if (pending.length === 0) break;
        await Promise.all(pending);
    }
}

function createRes() {
    const calls = [];
    return {
        _calls: calls,
        get headersSent() { return calls.some(c => c.type === 'status' || c.type === 'end'); },
        status(code) { calls.push({ type: 'status', code }); return this; },
        json(payload) { calls.push({ type: 'json', payload }); return this; },
        setHeader() { return this; },
        end() { calls.push({ type: 'end' }); return this; },
    };
}

function zaloRequest({ body, secret = process.env.ZALO_BOT_WEBHOOK_SECRET, forwardedFor = '203.0.113.9' }) {
    return {
        method: 'POST',
        query: { __channel: 'zalo_bot' },
        headers: {
            'content-type': 'application/json',
            'x-bot-api-secret-token': secret,
            'x-forwarded-for': forwardedFor,
            'user-agent': 'ZaloBot-Webhook/1.0',
        },
        body,
    };
}

function officialTextPayload({ text = 'Thời tiết hôm nay thế nào?', chatId = '1001', chatType = 'PRIVATE', fromId = '2002', isBot = false } = {}) {
    return {
        result: {
            event_name: 'message.text.received',
            message: {
                text,
                chat: { id: chatId, chat_type: chatType },
                from: { id: fromId, is_bot: isBot },
            },
        },
    };
}

// ---------------------------------------------------------------------
// Mock fetch: rate-limit Firebase ETag/CAS (usage_zalo_bot) + Zalo sendMessage.
// Không mock Pinecone/Gemini/DeepSeek — kịch bản "thời tiết" không chạm mạng đó.
// ---------------------------------------------------------------------
function installZaloFetchMock() {
    const rateLimitUrls = [];
    const sentMessages = [];
    global.fetch = async (url, options = {}) => {
        const target = String(url);
        if (target.includes('/usage_zalo_bot/')) {
            rateLimitUrls.push(target);
            const method = (options.method || 'GET').toUpperCase();
            if (method === 'GET') {
                return {
                    ok: true,
                    status: 200,
                    headers: { get: () => 'etag-1' },
                    json: async () => null, // chưa có counter -> count=0
                };
            }
            // PUT ghi counter mới
            return { ok: true, status: 200, json: async () => ({}) };
        }
        if (target.includes('bot-api.zaloplatforms.com') && target.includes('/sendMessage')) {
            sentMessages.push({ url: target, body: JSON.parse(options.body) });
            return { ok: true, status: 200, json: async () => ({ ok: true }) };
        }
        throw new Error(`zalo-bot test: unmocked fetch ${target}`);
    };
    return { rateLimitUrls, sentMessages };
}

test.beforeEach(() => {
    waitUntilTasks = [];
});

// ---------------------------------------------------------------------
// 1) Valid official wrapped webhook payload, PRIVATE chat -> ACK ngay + reply đúng chat.id
// ---------------------------------------------------------------------
test('Zalo Bot: payload chính thức hợp lệ (PRIVATE) -> ACK 200 ngay, sendMessage đúng chat.id', async () => {
    const { sentMessages } = installZaloFetchMock();
    const res = createRes();
    await handler(zaloRequest({ body: officialTextPayload({ chatId: '1001', chatType: 'PRIVATE' }) }), res);

    // Ack đã gửi ngay trong lần gọi handler, KHÔNG cần đợi RAG xong.
    assert.deepEqual(res._calls[0], { type: 'status', code: 200 });
    assert.deepEqual(res._calls[1], { type: 'json', payload: { ok: true } });

    await flushZaloBackgroundWork();

    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0].body.chat_id, '1001');
    assert.ok(sentMessages[0].body.text.length > 0);
});

// ---------------------------------------------------------------------
// 2) Invalid/missing webhook secret -> reject, không xử lý RAG
// ---------------------------------------------------------------------
test('Zalo Bot: secret sai hoặc thiếu -> 403, không gọi RAG/sendMessage', async () => {
    const { sentMessages } = installZaloFetchMock();
    const res = createRes();
    await handler(zaloRequest({ body: officialTextPayload(), secret: 'wrong-secret-value-1234' }), res);

    assert.deepEqual(res._calls[0], { type: 'status', code: 403 });
    await flushZaloBackgroundWork();
    assert.equal(sentMessages.length, 0);
    assert.equal(waitUntilTasks.length, 0);
});

test('Zalo Bot: thiếu header secret hoàn toàn -> 403', async () => {
    const res = createRes();
    const req = zaloRequest({ body: officialTextPayload() });
    delete req.headers['x-bot-api-secret-token'];
    await handler(req, res);
    assert.deepEqual(res._calls[0], { type: 'status', code: 403 });
});

// ---------------------------------------------------------------------
// 3) Bot-generated message -> ignore
// ---------------------------------------------------------------------
test('Zalo Bot: tin nhắn từ bot (is_bot=true) -> ACK, không đưa vào RAG', async () => {
    const { sentMessages } = installZaloFetchMock();
    const res = createRes();
    await handler(zaloRequest({ body: officialTextPayload({ isBot: true }) }), res);

    assert.deepEqual(res._calls[0], { type: 'status', code: 200 });
    await flushZaloBackgroundWork();
    assert.equal(sentMessages.length, 0);
});

// ---------------------------------------------------------------------
// 4) Non-text event -> ACK/no RAG
// ---------------------------------------------------------------------
test('Zalo Bot: event không phải message.text.received -> ACK, không RAG, không throw 500', async () => {
    const { sentMessages } = installZaloFetchMock();
    const res = createRes();
    const payload = {
        result: {
            event_name: 'message.image.received',
            message: { text: '', chat: { id: '1001', chat_type: 'PRIVATE' }, from: { id: '2002' } },
        },
    };
    await handler(zaloRequest({ body: payload }), res);

    assert.deepEqual(res._calls[0], { type: 'status', code: 200 });
    await flushZaloBackgroundWork();
    assert.equal(sentMessages.length, 0);
});

// ---------------------------------------------------------------------
// 5/6) PRIVATE và GROUP chat parse đúng, sendMessage dùng đúng chat.id
// ---------------------------------------------------------------------
test('Zalo Bot: chat PRIVATE và GROUP đều parse đúng và reply đúng chat.id tương ứng', async () => {
    const { sentMessages } = installZaloFetchMock();

    await handler(zaloRequest({ body: officialTextPayload({ chatId: '7001', chatType: 'PRIVATE', fromId: '8001' }) }), createRes());
    await flushZaloBackgroundWork();

    await handler(zaloRequest({ body: officialTextPayload({ chatId: '7002', chatType: 'GROUP', fromId: '8002' }) }), createRes());
    await flushZaloBackgroundWork();

    assert.equal(sentMessages.length, 2);
    assert.equal(sentMessages[0].body.chat_id, '7001');
    assert.equal(sentMessages[1].body.chat_id, '7002');
});

// ---------------------------------------------------------------------
// 8/9) Output 2000 ký tự không bị chia / >2000 được split an toàn — được khoá
// ở mức unit (test/zalo-bot.test.js splitZaloText). Ở đây chỉ xác nhận đường
// tích hợp thực sự dùng splitZaloText trước khi gửi (không tự cắt tuỳ tiện):
// kịch bản "thời tiết" luôn ngắn hơn 2000 ký tự nên phải luôn ra đúng 1 tin.
// ---------------------------------------------------------------------
test('Zalo Bot: câu trả lời ngắn (out-of-scope reply) được gửi trong đúng 1 tin nhắn', async () => {
    const { sentMessages } = installZaloFetchMock();
    await handler(zaloRequest({ body: officialTextPayload({ chatId: '9001' }) }), createRes());
    await flushZaloBackgroundWork();
    assert.equal(sentMessages.length, 1);
    assert.ok(sentMessages[0].body.text.length <= 2000);
});

test('Zalo Bot: lỗi sendMessage được xử lý an toàn và log mã lỗi không chứa nội dung', async () => {
    installZaloFetchMock();
    const originalFetch = global.fetch;
    const originalError = console.error;
    const logged = [];
    global.fetch = async (url, options = {}) => {
        if (String(url).includes('/usage_zalo_bot/')) return originalFetch(url, options);
        if (String(url).includes('/sendMessage')) throw new Error(`failed ${url} ${options.body}`);
        return originalFetch(url, options);
    };
    console.error = (...args) => logged.push(args.join(' '));
    try {
        await handler(zaloRequest({ body: officialTextPayload({ text: 'xin chào bot có nội dung riêng' }) }), createRes());
        await flushZaloBackgroundWork();
    } finally {
        global.fetch = originalFetch;
        console.error = originalError;
    }
    assert.match(logged.join('\n'), /error_code=ZALO_SEND_FAILED/);
    assert.doesNotMatch(logged.join('\n'), /nội dung riêng|Tôi là trợ lý|zalo-test-bot-token|zalo-test-webhook-secret/);
});

// ---------------------------------------------------------------------
// 10) Token/secret không xuất hiện trong error/log
// ---------------------------------------------------------------------
test('Zalo Bot: token/secret không bao giờ xuất hiện trong console log', async () => {
    const { sentMessages } = installZaloFetchMock();
    const originalWarn = console.warn;
    const originalError = console.error;
    const originalInfo = console.info;
    const logged = [];
    console.warn = (...args) => logged.push(args.join(' '));
    console.error = (...args) => logged.push(args.join(' '));
    console.info = (...args) => logged.push(args.join(' '));
    try {
        // Secret sai (cố tình đoán gần đúng) — kiểm tra cả secret thật lẫn giá trị sai không lộ ra log.
        await handler(zaloRequest({ body: officialTextPayload(), secret: 'zalo-test-webhook-secret-9999' }), createRes());
        // Luồng hợp lệ, có gửi tin — vẫn không được log token bot.
        await handler(zaloRequest({ body: officialTextPayload({ chatId: '1234' }) }), createRes());
        await flushZaloBackgroundWork();
    } finally {
        console.warn = originalWarn;
        console.error = originalError;
        console.info = originalInfo;
    }

    const joined = logged.join('\n');
    assert.ok(!joined.includes(process.env.ZALO_BOT_WEBHOOK_SECRET));
    assert.ok(!joined.includes('zalo-test-webhook-secret-9999'));
    assert.ok(!joined.includes(process.env.ZALO_BOT_TOKEN));
    assert.ok(!joined.includes('Thời tiết hôm nay thế nào?'));
    assert.ok(!joined.includes('Tôi chưa hiểu yêu cầu này.'));
    assert.match(joined, /event_type=message\.text\.received intent=FALLBACK result=REPLIED error_code=none http_status=200 duration_ms=/);
    assert.ok(sentMessages.length >= 1);
});

// ---------------------------------------------------------------------
// 11) Zalo trusted request bypass Turnstile; website request KHÔNG bị bypass
// ---------------------------------------------------------------------
test('Zalo Bot: request đã xác thực bỏ qua Turnstile hoàn toàn (không cần TURNSTILE_SECRET_KEY/captchaToken)', async () => {
    installZaloFetchMock();
    assert.equal(process.env.TURNSTILE_SECRET_KEY, undefined);
    const res = createRes();
    await handler(zaloRequest({ body: officialTextPayload({ chatId: '4242' }) }), res);
    // Không có TURNSTILE_SECRET_KEY và không có captchaToken nào trong payload Zalo,
    // nhưng vẫn ACK 200 thành công — chứng minh Turnstile không được gọi cho kênh này.
    assert.deepEqual(res._calls[0], { type: 'status', code: 200 });
});

test('Website: request thường (không phải Zalo) vẫn bị chặn khi thiếu HMAC request token', async () => {
    const res = createRes();
    const req = {
        method: 'POST',
        headers: {
            origin: 'https://bandocapt.vercel.app',
            'content-type': 'application/json',
            'user-agent': 'Mozilla/5.0 test',
        },
        body: { userMessage: 'Xin chào', history: [], captchaToken: 'anything' },
        socket: {},
    };
    // req.query không tồn tại/không có __channel=zalo_bot -> phải rơi vào luồng website,
    // và luồng website vẫn đòi HMAC request token như trước khi có kênh Zalo.
    await handler(req, res);
    assert.deepEqual(res._calls[0], { type: 'status', code: 403 });
    assert.equal(res._calls[1].payload.error, 'MISSING_TOKEN');
});

// ---------------------------------------------------------------------
// 12) Zalo rate-limit principal KHÔNG dựa trên IP webhook server của Zalo
// ---------------------------------------------------------------------
test('Zalo Bot: rate-limit key theo principal (chat_type/chat_id/from_id), không theo IP', async () => {
    const { rateLimitUrls } = installZaloFetchMock();

    // Cùng chat/from, IP khác nhau -> phải rơi vào ĐÚNG MỘT bucket rate-limit.
    await handler(zaloRequest({ body: officialTextPayload({ chatId: '5001', fromId: '6001' }), forwardedFor: '1.2.3.4' }), createRes());
    await flushZaloBackgroundWork();
    await handler(zaloRequest({ body: officialTextPayload({ chatId: '5001', fromId: '6001' }), forwardedFor: '9.9.9.9' }), createRes());
    await flushZaloBackgroundWork();

    const urlsForSamePrincipal = rateLimitUrls.filter(u => true);
    assert.ok(urlsForSamePrincipal.length >= 2);
    // Bỏ qua phần method GET/PUT lặp lại, chỉ so khớp path — cùng principal phải ra cùng URL.
    const uniqueForSamePrincipal = new Set(rateLimitUrls);
    assert.equal(uniqueForSamePrincipal.size, 1, 'IP khác nhau nhưng cùng chat/from phải dùng chung 1 rate-limit bucket');

    // Chat khác -> bucket khác (principal khác).
    await handler(zaloRequest({ body: officialTextPayload({ chatId: '5002', fromId: '6001' }), forwardedFor: '1.2.3.4' }), createRes());
    await flushZaloBackgroundWork();
    const uniqueAfterDifferentChat = new Set(rateLimitUrls);
    assert.equal(uniqueAfterDifferentChat.size, 2, 'chat_id khác phải tạo bucket rate-limit khác');
});
