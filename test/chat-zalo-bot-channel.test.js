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

// Dạng "flat" — không có wrapper `result`, body.event_name/message ở top-level. Tài liệu hiện có
// (bot.zapps.me/docs/webhook/, xác minh 2026-09-26) mô tả dạng wrapped ở trên là chính thức, nhưng
// một SDK bên thứ ba độc lập cho nền tảng này tự hỗ trợ cả hai dạng, và production ACK 200 không
// kèm sendMessage (owner test 2026-09-26) khớp đúng triệu chứng "parser chỉ nhận wrapped nhưng
// Zalo gửi flat". Không có bằng chứng raw payload production để khẳng định chắc chắn shape thật;
// các test này khoá khả năng tương thích ngược mà KHÔNG hạ chuẩn bảo mật/semantics khác.
function flatTextPayload({ text = 'Thời tiết hôm nay thế nào?', chatId = '1001', chatType = 'PRIVATE', fromId = '2002', isBot = false } = {}) {
    return {
        event_name: 'message.text.received',
        message: {
            text,
            chat: { id: chatId, chat_type: chatType },
            from: { id: fromId, is_bot: isBot },
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
// 5) PRIVATE chat parse đúng, sendMessage dùng đúng chat.id
// ---------------------------------------------------------------------
test('Zalo Bot: chat PRIVATE parse đúng và reply đúng chat.id', async () => {
    const { sentMessages } = installZaloFetchMock();

    await handler(zaloRequest({ body: officialTextPayload({ chatId: '7001', chatType: 'PRIVATE', fromId: '8001' }) }), createRes());
    await flushZaloBackgroundWork();

    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0].body.chat_id, '7001');
});

// ---------------------------------------------------------------------
// T10) GROUP chat (OD-02, V1 chỉ PRIVATE) -> ACK 200, KHÔNG deterministic reply,
// KHÔNG RAG, KHÔNG sendMessage. Log chỉ metadata (chat_type, không nội dung).
// ---------------------------------------------------------------------
test('T10: Zalo Bot GROUP chat -> ACK 200 + bỏ qua an toàn, không sendMessage, không RAG', async () => {
    const { sentMessages } = installZaloFetchMock();
    const originalInfo = console.info;
    const logged = [];
    console.info = (...args) => { logged.push(args.join(' ')); originalInfo(...args); };
    const res = createRes();
    try {
        await handler(zaloRequest({ body: officialTextPayload({ chatId: '7002', chatType: 'GROUP', fromId: '8002' }) }), res);
        await flushZaloBackgroundWork();
    } finally {
        console.info = originalInfo;
    }

    assert.deepEqual(res._calls[0], { type: 'status', code: 200 });
    assert.deepEqual(res._calls[1], { type: 'json', payload: { ok: true } });
    assert.equal(sentMessages.length, 0);
    assert.match(logged.join('\n'), /error_code=GROUP_CHAT_IGNORED/);
    assert.match(logged.join('\n'), /chat_type=GROUP/);
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
        // "trợ giúp" -> HELP tĩnh, không phụ thuộc RAG/GEMINI_API_KEY, giữ test tất định.
        await handler(zaloRequest({ body: officialTextPayload({ text: 'trợ giúp' }) }), createRes());
        await flushZaloBackgroundWork();
    } finally {
        global.fetch = originalFetch;
        console.error = originalError;
    }
    assert.match(logged.join('\n'), /error_code=ZALO_SEND_FAILED/);
    assert.doesNotMatch(logged.join('\n'), /Nhập tên xã\/phường|zalo-test-bot-token|zalo-test-webhook-secret/);
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
    // "Thời tiết hôm nay thế nào?" không phải GREETING/HELP/MAP và không phải yêu cầu tra cứu
    // địa điểm -> chuyển sang shared RAG orchestration (OD-01/P0-4), rơi vào nhánh
    // isClearlyOutOfScope tất định (không cần GEMINI_API_KEY) thay vì câu FALLBACK tĩnh cũ.
    assert.ok(!joined.includes('Tôi chưa hiểu yêu cầu này.'));
    assert.ok(!joined.includes('Tôi chưa tìm thấy thông tin chính xác cho câu hỏi này.'));
    assert.match(joined, /event_type=message\.text\.received intent=OTHER result=RAG_REPLIED error_code=none http_status=200 duration_ms=/);
    assert.ok(sentMessages.length >= 1);
});

// ---------------------------------------------------------------------
// T09) Câu hỏi TTHC thật (không phải location, không static intent) -> chuyển tới shared RAG
// orchestration NGUYÊN VẸN (không có câu trả lời tĩnh "Tôi chưa hiểu yêu cầu này." cũ). Dùng
// RAG_FAIL_CLOSED=1 + embedContent lỗi có kiểm soát để đi hết pipeline RAG thật (không mock
// Pinecone/Gemini generation) và dừng ở nhánh abstention tất định — đúng cách
// test/chat-sse-golden.test.js (kịch bản "rag-abstained") đã khoá cho website, chứng minh
// Zalo dùng CHUNG một pipeline, không phải bản sao.
// ---------------------------------------------------------------------
function installZaloAndEmbedFailureFetchMock() {
    const sentMessages = [];
    global.fetch = async (url, options = {}) => {
        const target = String(url);
        if (target.includes('/usage_zalo_bot/')) {
            const method = (options.method || 'GET').toUpperCase();
            if (method === 'GET') {
                return { ok: true, status: 200, headers: { get: () => 'etag-1' }, json: async () => null };
            }
            return { ok: true, status: 200, json: async () => ({}) };
        }
        if (target.includes('bot-api.zaloplatforms.com') && target.includes('/sendMessage')) {
            sentMessages.push({ url: target, body: JSON.parse(options.body) });
            return { ok: true, status: 200, json: async () => ({ ok: true }) };
        }
        // Embedding lỗi có kiểm soát -> embedVector rỗng -> không gọi Pinecone, không có
        // ngữ cảnh grounded -> RAG_FAIL_CLOSED bắt buộc abstain thay vì tự sinh câu trả lời.
        if (target.includes('embedContent')) {
            return { ok: false, status: 503, json: async () => ({}) };
        }
        throw new Error(`zalo-bot RAG-fallback test: unmocked fetch ${target}`);
    };
    return { sentMessages };
}

test('T09: câu hỏi TTHC thật được chuyển tới shared RAG orchestration (không phải câu FALLBACK tĩnh)', async () => {
    const originalGeminiKey = process.env.GEMINI_API_KEY;
    const originalRagFailClosed = process.env.RAG_FAIL_CLOSED;
    process.env.GEMINI_API_KEY = 'zalo-test-golden-key';
    process.env.RAG_FAIL_CLOSED = '1';
    const { sentMessages } = installZaloAndEmbedFailureFetchMock();
    try {
        await handler(zaloRequest({ body: officialTextPayload({ text: 'Thủ tục đăng ký thường trú cần giấy tờ gì?', chatId: '3003' }) }), createRes());
        await flushZaloBackgroundWork();
    } finally {
        if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalGeminiKey;
        if (originalRagFailClosed === undefined) delete process.env.RAG_FAIL_CLOSED; else process.env.RAG_FAIL_CLOSED = originalRagFailClosed;
    }

    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0].body.chat_id, '3003');
    // Câu trả lời đến từ shared RAG abstention (getRagAbstentionReply), KHÔNG phải câu tĩnh
    // "Tôi chưa hiểu yêu cầu này." và KHÔNG phải một câu trả lời địa điểm bịa ra.
    assert.match(sentMessages[0].body.text, /Danh mục thủ tục hành chính/);
    assert.doesNotMatch(sentMessages[0].body.text, /Tôi chưa hiểu yêu cầu này\./);
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

// =======================================================================
// REAL WEBHOOK PAYLOAD COMPATIBILITY — production ACK 200 nhưng không có sendMessage nào ra đi
// (owner test 2026-09-26: "Xin chào", "Công an phường Thanh Miếu ở đâu"). Tài liệu hiện có
// (bot.zapps.me/docs/webhook/) mô tả dạng wrapped { result: { event_name, message } } là chính
// thức, nhưng một SDK bên thứ ba độc lập cho nền tảng này tự hỗ trợ CẢ dạng flat { event_name,
// message } — khớp đúng triệu chứng "parser cũ chỉ nhận wrapped". Các test dưới đây khoá khả năng
// tương thích ngược qua toàn bộ handler thật (không bypass parser), ở cả hai dạng envelope.
// =======================================================================

test('T08: PRIVATE text dạng flat -> reply path chạy đầy đủ (ACK, không duplicate reply)', async () => {
    const { sentMessages } = installZaloFetchMock();
    await handler(zaloRequest({ body: flatTextPayload({ text: 'trợ giúp', chatId: '1101' }) }), createRes());
    await flushZaloBackgroundWork();
    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0].body.chat_id, '1101');
    assert.match(sentMessages[0].body.text, /Nhập tên xã\/phường/);
});

test('T09b: PRIVATE text dạng wrapped -> reply path chạy đầy đủ (ACK, không duplicate reply)', async () => {
    const { sentMessages } = installZaloFetchMock();
    await handler(zaloRequest({ body: officialTextPayload({ text: 'trợ giúp', chatId: '1102' }) }), createRes());
    await flushZaloBackgroundWork();
    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0].body.chat_id, '1102');
    assert.match(sentMessages[0].body.text, /Nhập tên xã\/phường/);
});

test('T10b: GROUP chat dạng flat -> ACK + bỏ qua an toàn (chính sách V1, không phải lỗi parser)', async () => {
    const { sentMessages } = installZaloFetchMock();
    const res = createRes();
    await handler(zaloRequest({ body: flatTextPayload({ chatType: 'GROUP', chatId: '1103' }) }), res);
    await flushZaloBackgroundWork();
    assert.deepEqual(res._calls[0], { type: 'status', code: 200 });
    assert.equal(sentMessages.length, 0);
});

test('T11: sendMessage dùng đúng chat.id, KHÔNG dùng from.id làm đích, ở cả hai dạng envelope', async () => {
    const { sentMessages } = installZaloFetchMock();
    await handler(zaloRequest({ body: officialTextPayload({ text: 'trợ giúp', chatId: '9991', fromId: '8881' }) }), createRes());
    await handler(zaloRequest({ body: flatTextPayload({ text: 'trợ giúp', chatId: '9992', fromId: '8882' }) }), createRes());
    await flushZaloBackgroundWork();
    assert.equal(sentMessages.length, 2);
    assert.equal(sentMessages[0].body.chat_id, '9991');
    assert.equal(sentMessages[1].body.chat_id, '9992');
    const bodies = sentMessages.map(m => m.body.chat_id);
    assert.ok(!bodies.includes('8881') && !bodies.includes('8882'), 'sendMessage không được dùng from.id làm chat_id');
});

test('T13: log webhook_shape=flat không rò rỉ nội dung/token/secret/chat_id/from_id', async () => {
    installZaloFetchMock();
    const originalInfo = console.info;
    const originalWarn = console.warn;
    const logged = [];
    console.info = (...args) => { logged.push(args.join(' ')); };
    console.warn = (...args) => { logged.push(args.join(' ')); };
    try {
        await handler(zaloRequest({ body: flatTextPayload({ text: 'nội dung nhạy cảm không được log', chatId: '7771', fromId: '6661' }) }), createRes());
        await flushZaloBackgroundWork();
    } finally {
        console.info = originalInfo;
        console.warn = originalWarn;
    }
    const joined = logged.join('\n');
    assert.match(joined, /webhook_shape=flat/);
    assert.match(joined, /action=REPLY_PATH_RAG|action=REPLY_PATH_DETERMINISTIC/);
    assert.ok(!joined.includes('nội dung nhạy cảm không được log'));
    assert.ok(!joined.includes('7771'));
    assert.ok(!joined.includes('6661'));
    assert.ok(!joined.includes(process.env.ZALO_BOT_WEBHOOK_SECRET));
    assert.ok(!joined.includes(process.env.ZALO_BOT_TOKEN));
});

test('T14b: sendMessage HTTP 200 nhưng body {ok:false} vẫn bị coi là thất bại (đường tích hợp thật)', async () => {
    installZaloFetchMock();
    const originalFetch = global.fetch;
    const originalError = console.error;
    const logged = [];
    global.fetch = async (url, options = {}) => {
        if (String(url).includes('/usage_zalo_bot/')) return originalFetch(url, options);
        if (String(url).includes('/sendMessage')) {
            return { ok: true, status: 200, json: async () => ({ ok: false, description: 'chat not found' }) };
        }
        return originalFetch(url, options);
    };
    console.error = (...args) => logged.push(args.join(' '));
    try {
        await handler(zaloRequest({ body: officialTextPayload({ text: 'trợ giúp' }) }), createRes());
        await flushZaloBackgroundWork();
    } finally {
        global.fetch = originalFetch;
        console.error = originalError;
    }
    assert.match(logged.join('\n'), /action=SEND_MESSAGE_FAILED/);
    assert.match(logged.join('\n'), /error_code=ZALO_SEND_FAILED/);
    assert.doesNotMatch(logged.join('\n'), /chat not found/);
});

test('T15: "Xin chào" (dạng flat, đúng như owner test production) -> deterministic V1 greeting', async () => {
    const { sentMessages } = installZaloFetchMock();
    await handler(zaloRequest({ body: flatTextPayload({ text: 'Xin chào', chatId: '2201' }) }), createRes());
    await flushZaloBackgroundWork();
    assert.equal(sentMessages.length, 1);
    assert.match(sentMessages[0].body.text, /trợ lý Bản đồ Công an Phú Thọ/);
});

// ---------------------------------------------------------------------
// T16 — "Công an phường Thanh Miếu ở đâu" (đúng câu owner test production 2026-09-26): mock
// Google Sheets GViz với MỘT bản ghi Published_Locations hợp lệ, đi qua toàn bộ handler thật
// (không bypass parser/location resolver) ở cả hai dạng envelope.
// ---------------------------------------------------------------------
function buildPublishedLocationsGvizPayload(rows) {
    return {
        table: {
            cols: [
                { label: 'record_id' },
                { label: 'Tên đơn vị' },
                { label: 'Loại đơn vị' },
                { label: 'Địa chỉ' },
                { label: 'Số điện thoại' },
                { label: 'Tọa độ' },
                { label: 'search_aliases' },
            ],
            rows: rows.map(row => ({
                c: [
                    { v: row.id },
                    { v: row.name },
                    { v: row.type || 'Trụ sở' },
                    { v: row.address },
                    { v: row.phone || '' },
                    { v: row.coordinates },
                    { v: row.searchAliases || '' },
                ],
            })),
        },
    };
}

function installZaloAndPublishedLocationsFetchMock() {
    const { rateLimitUrls, sentMessages } = installZaloFetchMock();
    const originalFetch = global.fetch;
    const gvizPayload = buildPublishedLocationsGvizPayload([
        { id: 'thanh-mieu-1', name: 'Công an phường Thanh Miếu', address: 'Địa chỉ Thanh Miếu', phone: '02101112222', coordinates: '21.31,105.41' },
    ]);
    global.fetch = async (url, options = {}) => {
        const target = String(url);
        if (target.includes('docs.google.com/spreadsheets')) {
            return new Response(`google.visualization.Query.setResponse(${JSON.stringify(gvizPayload)});`);
        }
        return originalFetch(url, options);
    };
    return { rateLimitUrls, sentMessages, restore: () => { global.fetch = originalFetch; } };
}

test('T16: "Công an phường Thanh Miếu ở đâu" -> location resolver trả đúng bản ghi Published_Locations (wrapped)', async () => {
    const originalSheetId = process.env.PUBLIC_LOCATION_SPREADSHEET_ID;
    process.env.PUBLIC_LOCATION_SPREADSHEET_ID = 'zalo-test-published-locations-workbook';
    const { resetPublishedLocationsCache } = require('../lib/published-locations');
    resetPublishedLocationsCache();
    const { sentMessages } = installZaloAndPublishedLocationsFetchMock();
    try {
        await handler(zaloRequest({ body: officialTextPayload({ text: 'Công an phường Thanh Miếu ở đâu', chatId: '2301' }) }), createRes());
        await flushZaloBackgroundWork();
    } finally {
        resetPublishedLocationsCache();
        if (originalSheetId === undefined) delete process.env.PUBLIC_LOCATION_SPREADSHEET_ID; else process.env.PUBLIC_LOCATION_SPREADSHEET_ID = originalSheetId;
    }
    assert.equal(sentMessages.length, 1);
    assert.match(sentMessages[0].body.text, /Công an phường Thanh Miếu/);
    assert.match(sentMessages[0].body.text, /Địa chỉ Thanh Miếu/);
});

test('T16b: "Công an phường Thanh Miếu ở đâu" -> location resolver trả đúng bản ghi Published_Locations (flat)', async () => {
    const originalSheetId = process.env.PUBLIC_LOCATION_SPREADSHEET_ID;
    process.env.PUBLIC_LOCATION_SPREADSHEET_ID = 'zalo-test-published-locations-workbook';
    const { resetPublishedLocationsCache } = require('../lib/published-locations');
    resetPublishedLocationsCache();
    const { sentMessages } = installZaloAndPublishedLocationsFetchMock();
    try {
        await handler(zaloRequest({ body: flatTextPayload({ text: 'Công an phường Thanh Miếu ở đâu', chatId: '2302' }) }), createRes());
        await flushZaloBackgroundWork();
    } finally {
        resetPublishedLocationsCache();
        if (originalSheetId === undefined) delete process.env.PUBLIC_LOCATION_SPREADSHEET_ID; else process.env.PUBLIC_LOCATION_SPREADSHEET_ID = originalSheetId;
    }
    assert.equal(sentMessages.length, 1);
    assert.match(sentMessages[0].body.text, /Công an phường Thanh Miếu/);
    assert.match(sentMessages[0].body.text, /Địa chỉ Thanh Miếu/);
});
