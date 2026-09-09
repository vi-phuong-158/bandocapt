'use strict';

process.env.NODE_ENV = 'development';
process.env.CHAT_LOG_HASH_SALT = 'test-only-hash-salt';
process.env.PUBLIC_APP_URL = 'https://bandocapt.io.vn';
process.env.ZALO_BOT_ENABLED = 'true';
process.env.ZALO_BOT_WEBHOOK_SECRET = 'test-webhook-secret-12345';
process.env.ZALO_BOT_TOKEN = 'test-bot-token';
process.env.GEMINI_API_KEY = 'test-key';
delete process.env.KV_REST_API_URL;
delete process.env.KV_REST_API_TOKEN;
delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
delete process.env.FIREBASE_PROJECT_ID;

const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');

const zaloSession = require('../lib/zalo-session');
const chatCore = require('../api/chat.js');
const zaloClient = require('../lib/zalo-bot-client');
const { clearLocalRateLimitStore } = require('../lib/rate-limit-store');
const zaloBotHandler = require('../lib/zalo-bot-handler');

// `@vercel/functions`'s `waitUntil` is a getter-only, non-configurable export — it cannot be
// monkeypatched from a test. The real handler fires background work via
// `waitUntil(processZaloMessage(incoming))` without awaiting it, so tests that must observe
// the completed background effect (send calls, session writes) invoke the exported
// `processZaloMessage` directly instead of racing the untestable `waitUntil` call. Tests that
// only assert the webhook's synchronous ACK/short-circuit behavior still go through the full
// `zaloBotHandler(req, res)` entry point.

function fakeReq({ method = 'POST', headers = {}, body = {} } = {}) {
    return { method, headers: { 'x-bot-api-secret-token': 'test-webhook-secret-12345', ...headers }, body };
}

function fakeRes() {
    return {
        statusCode: null,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
    };
}

function privateTextEvent({ chatId = 'chat-1', messageId = 'msg-1', text = 'xin chào', chatType = 'PRIVATE' } = {}) {
    return {
        update_id: 1,
        message: {
            message_id: messageId,
            chat: { id: chatId, chat_type: chatType },
            from: { id: chatId },
            text,
            date: Date.now(),
        },
    };
}

// Fake Firestore trong bộ nhớ dùng chung cho một test (mô phỏng session/dedupe thật, không
// mạng, không firebase-admin) — cùng kiểu fake đã kiểm chứng trong test/zalo-bot-session.test.js.
function createFakeDb() {
    const store = new Map();
    return {
        collection(name) {
            return {
                doc(id) {
                    const key = `${name}/${id}`;
                    return {
                        async get() {
                            const data = store.get(key);
                            return { exists: data !== undefined, data: () => data };
                        },
                        async set(value) { store.set(key, value); },
                        async create(value) {
                            if (store.has(key)) {
                                const err = new Error('already exists');
                                err.code = 6;
                                throw err;
                            }
                            store.set(key, value);
                        },
                    };
                },
            };
        },
    };
}

let originalRunChatCore;
let originalValidate;
let originalGetSessionHistory;
let originalAppendSessionTurn;
let originalClaimMessageOnce;
let originalSendMessage;
let originalSendChatAction;

test.beforeEach(() => {
    clearLocalRateLimitStore();
    originalRunChatCore = chatCore.runChatCore;
    originalValidate = chatCore.validateChatRequestBody;
    originalGetSessionHistory = zaloSession.getSessionHistory;
    originalAppendSessionTurn = zaloSession.appendSessionTurn;
    originalClaimMessageOnce = zaloSession.claimMessageOnce;
    originalSendMessage = zaloClient.sendMessage;
    originalSendChatAction = zaloClient.sendChatAction;
    zaloClient.sendChatAction = async () => ({ ok: true });
});

test.afterEach(() => {
    chatCore.runChatCore = originalRunChatCore;
    chatCore.validateChatRequestBody = originalValidate;
    zaloSession.getSessionHistory = originalGetSessionHistory;
    zaloSession.appendSessionTurn = originalAppendSessionTurn;
    zaloSession.claimMessageOnce = originalClaimMessageOnce;
    zaloClient.sendMessage = originalSendMessage;
    zaloClient.sendChatAction = originalSendChatAction;
});

// =====================================================================
// A. Webhook security
// =====================================================================

test('A1. secret hợp lệ + bot enabled -> event được chấp nhận (không phải 403/503)', async () => {
    const res = fakeRes();
    await zaloBotHandler(fakeReq({ body: privateTextEvent({ text: '/start' }) }), res);
    assert.equal(res.statusCode, 200);
    assert.notEqual(res.body?.error, 'FORBIDDEN');
});

test('A2. secret sai -> 403 FORBIDDEN', async () => {
    const res = fakeRes();
    await zaloBotHandler(fakeReq({ headers: { 'x-bot-api-secret-token': 'wrong-secret' }, body: privateTextEvent() }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error, 'FORBIDDEN');
});

test('A3. thiếu header secret -> 403 FORBIDDEN', async () => {
    const res = fakeRes();
    const req = fakeReq({ body: privateTextEvent() });
    delete req.headers['x-bot-api-secret-token'];
    await zaloBotHandler(req, res);
    assert.equal(res.statusCode, 403);
});

test('A4. ZALO_BOT_WEBHOOK_SECRET chưa cấu hình -> 503 SERVER_CONFIG_ERROR', async () => {
    const original = process.env.ZALO_BOT_WEBHOOK_SECRET;
    delete process.env.ZALO_BOT_WEBHOOK_SECRET;
    try {
        const res = fakeRes();
        await zaloBotHandler(fakeReq({ body: privateTextEvent() }), res);
        assert.equal(res.statusCode, 503);
        assert.equal(res.body.error, 'SERVER_CONFIG_ERROR');
    } finally {
        process.env.ZALO_BOT_WEBHOOK_SECRET = original;
    }
});

test('A5. ZALO_BOT_ENABLED=false -> ACK 200 disabled, không gọi AI/Zalo API, website không bị ảnh hưởng', async () => {
    const original = process.env.ZALO_BOT_ENABLED;
    process.env.ZALO_BOT_ENABLED = 'false';
    let sendCalled = false;
    let coreCalled = false;
    zaloClient.sendMessage = async () => { sendCalled = true; return { ok: true }; };
    chatCore.runChatCore = async () => { coreCalled = true; };
    try {
        const res = fakeRes();
        // Cố tình dùng secret sai để chứng minh: khi disabled, handler trả về ngay ở bước
        // kill-switch, KHÔNG bao giờ chạy tới bước kiểm tra secret hay AI.
        await zaloBotHandler(fakeReq({ headers: { 'x-bot-api-secret-token': 'wrong' }, body: privateTextEvent() }), res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.disabled, true);
        assert.equal(sendCalled, false);
        assert.equal(coreCalled, false);
    } finally {
        process.env.ZALO_BOT_ENABLED = original;
    }
});

test('A6. method không phải POST -> 405', async () => {
    const res = fakeRes();
    await zaloBotHandler(fakeReq({ method: 'GET' }), res);
    assert.equal(res.statusCode, 405);
});

// =====================================================================
// B. Event parsing
// =====================================================================

test('B1. tin nhắn text private hợp lệ được parse đúng chat_id/message_id/text', () => {
    const parsed = zaloBotHandler.extractIncomingMessage(privateTextEvent({ chatId: 'c1', messageId: 'm1', text: 'hello' }));
    assert.deepEqual(parsed, { chatId: 'c1', messageId: 'm1', text: 'hello', chatType: 'PRIVATE' });
});

test('B1b. hỗ trợ dạng bọc thêm { result: { message } }', () => {
    const wrapped = { result: privateTextEvent({ chatId: 'c2', messageId: 'm2' }) };
    const parsed = zaloBotHandler.extractIncomingMessage(wrapped);
    assert.equal(parsed.chatId, 'c2');
    assert.equal(parsed.messageId, 'm2');
});

test('B2. event không hỗ trợ (không có message) -> null, ACK 200 ignored', async () => {
    assert.equal(zaloBotHandler.extractIncomingMessage({ update_id: 1, some_other_event: {} }), null);
    const res = fakeRes();
    await zaloBotHandler(fakeReq({ body: { update_id: 1, some_other_event: {} } }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ignored, true);
});

test('B3. tin nhắn rỗng -> ACK 200 ignored, không gọi AI', async () => {
    let called = false;
    chatCore.runChatCore = async () => { called = true; };
    const res = fakeRes();
    await zaloBotHandler(fakeReq({ body: privateTextEvent({ text: '' }) }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ignored, true);
    assert.equal(called, false);
});

test('B4. payload malformed (null/không phải object) -> parse trả null, không throw', async () => {
    assert.equal(zaloBotHandler.extractIncomingMessage(null), null);
    assert.equal(zaloBotHandler.extractIncomingMessage('not-an-object'), null);
    assert.equal(zaloBotHandler.extractIncomingMessage({}), null);
    const res = fakeRes();
    await zaloBotHandler(fakeReq({ body: null }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ignored, true);
});

test('B5. tin nhắn quá dài -> ACK ngay (kiểm tra qua handler), xử lý nền trả lời từ chối lịch sự (không phải AI)', async () => {
    // Phần "ACK 200 ngay" và "xử lý nền" là hai bước tách biệt qua waitUntil (không thể await
    // trực tiếp — xem ghi chú đầu file). Kiểm tra ACK qua handler thật, kiểm tra nội dung xử lý
    // nền bằng cách gọi thẳng processZaloMessage — đúng hàm mà waitUntil sẽ gọi.
    let coreCalled = false;
    chatCore.runChatCore = async () => { coreCalled = true; };
    zaloSession.getSessionHistory = async () => [];
    zaloSession.appendSessionTurn = async () => {};
    const longText = 'a'.repeat(1500);

    const res = fakeRes();
    await zaloBotHandler(fakeReq({ body: privateTextEvent({ text: longText, messageId: 'b5-msg' }) }), res);
    assert.equal(res.statusCode, 200, 'webhook phải ACK ngay bất kể độ dài tin nhắn');
    assert.equal(res.body.ok, true);

    const sent = [];
    zaloClient.sendMessage = async (chatId, text) => { sent.push(text); return { ok: true }; };
    await zaloBotHandler.processZaloMessage({ chatId: 'chat-1', messageId: 'b5-msg', text: longText });

    assert.equal(coreCalled, false, 'không được gọi AI cho input quá dài');
    assert.equal(sent.length, 1);
    assert.match(sent[0], /quá dài/);
});

test('B6. GROUP chat -> ACK, bỏ qua, không gọi AI (ngoài scope phase này)', async () => {
    let coreCalled = false;
    chatCore.runChatCore = async () => { coreCalled = true; };
    const res = fakeRes();
    await zaloBotHandler(fakeReq({ body: privateTextEvent({ chatType: 'GROUP' }) }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.reason, 'unsupported_chat_type');
    assert.equal(coreCalled, false);
});

// =====================================================================
// C. Deduplication
// =====================================================================

test('C1. webhook gửi cùng message_id hai lần: lần 2 bị coi là duplicate, AI chỉ chạy một lần', async () => {
    const db = createFakeDb();
    zaloSession.claimMessageOnce = (key) => originalClaimMessageOnce(key, { db });
    zaloSession.getSessionHistory = async () => [];
    zaloSession.appendSessionTurn = async () => {};

    let coreCalls = 0;
    chatCore.runChatCore = async ({ sink }) => {
        coreCalls += 1;
        sink.open({});
        sink.event({ done: true, fullText: 'Câu trả lời AI.', sources: [], verifiedLocations: [] });
        sink.close();
    };
    const sent = [];
    zaloClient.sendMessage = async (chatId, text) => { sent.push(text); return { ok: true }; };

    const chatId = 'dup-chat';
    const messageId = 'dup-msg-1';
    const text = 'câu hỏi thật sự dài để không khớp intent tất định nào cả xin chào';
    const dedupeKey = crypto.createHash('sha256').update(`${chatId}:${messageId}`).digest('hex');

    // Lượt xử lý THẬT đầu tiên: đúng thứ tự webhook thật làm (claim rồi mới xử lý nền qua
    // waitUntil) — gọi trực tiếp để có kết quả xác định, không phụ thuộc việc quan sát
    // waitUntil (không thể mock, xem ghi chú đầu file).
    const firstClaim = await zaloSession.claimMessageOnce(dedupeKey);
    assert.equal(firstClaim, true);
    await zaloBotHandler.processZaloMessage({ chatId, messageId, text });

    // Zalo GỬI LẠI đúng cùng message (retry thật): webhook phải tự nhận diện và chặn ở tầng
    // dedupe của chính handler, không xử lý lại — đây là cái thật sự chứng minh idempotency.
    const res2 = fakeRes();
    await zaloBotHandler(fakeReq({ body: privateTextEvent({ chatId, messageId, text }) }), res2);

    assert.equal(res2.body.duplicate, true, 'lần gửi thứ hai phải được nhận diện là duplicate');
    assert.equal(coreCalls, 1, 'AI (runChatCore) chỉ được gọi đúng một lần');
    assert.equal(sent.length, 1, 'Bot chỉ trả lời đúng một lần');
});

test('C2. cùng nội dung text nhưng message_id khác nhau -> KHÔNG bị coi là duplicate, xử lý cả hai', async () => {
    const db = createFakeDb();
    zaloSession.claimMessageOnce = (key) => originalClaimMessageOnce(key, { db });
    zaloSession.getSessionHistory = async () => [];
    zaloSession.appendSessionTurn = async () => {};

    let coreCalls = 0;
    chatCore.runChatCore = async ({ sink }) => {
        coreCalls += 1;
        sink.open({});
        sink.event({ done: true, fullText: 'Trả lời.', sources: [], verifiedLocations: [] });
        sink.close();
    };
    zaloClient.sendMessage = async () => ({ ok: true });

    const text = 'câu hỏi giống hệt nhau về thủ tục hành chính xin cảm ơn nhiều';
    const claim1 = await zaloSession.claimMessageOnce(
        crypto.createHash('sha256').update('c-x:id-1').digest('hex'));
    const claim2 = await zaloSession.claimMessageOnce(
        crypto.createHash('sha256').update('c-x:id-2').digest('hex'));
    assert.equal(claim1, true);
    assert.equal(claim2, true, 'message_id khác nhau phải claim độc lập, không bị chặn nhầm');

    await zaloBotHandler.processZaloMessage({ chatId: 'c-x', messageId: 'id-1', text });
    await zaloBotHandler.processZaloMessage({ chatId: 'c-x', messageId: 'id-2', text });

    assert.equal(coreCalls, 2, 'message_id khác nhau phải được xử lý độc lập');
});

// =====================================================================
// D. Deterministic intents (/start, /help, /bando)
// =====================================================================

test('D1. matchDeterministicIntent: /start trả về giới thiệu + cảnh báo + link bản đồ', () => {
    const text = zaloBotHandler.matchDeterministicIntent('/start');
    assert.match(text, /Bản đồ Công an số tỉnh Phú Thọ/);
    assert.match(text, /KHÔNG gửi số CCCD/);
    assert.match(text, /bandocapt\.io\.vn/);
});

test('D2. matchDeterministicIntent: /bando trả link bản đồ, không cần AI', () => {
    const text = zaloBotHandler.matchDeterministicIntent('/bando');
    assert.match(text, /bandocapt\.io\.vn/);
});

test('D3. /start không gọi AI (xử lý tất định qua processZaloMessage)', async () => {
    let coreCalled = false;
    chatCore.runChatCore = async () => { coreCalled = true; };
    const sent = [];
    zaloClient.sendMessage = async (chatId, text) => { sent.push(text); return { ok: true }; };

    await zaloBotHandler.processZaloMessage({ chatId: 'c-start', messageId: 'm', text: '/start' });

    assert.equal(coreCalled, false);
    assert.equal(sent.length, 1);
    assert.match(sent[0], /Bản đồ Công an số tỉnh Phú Thọ/);
});

// =====================================================================
// E. Session / multi-turn context
// =====================================================================

test('E1. lượt hai giữ được ngữ cảnh: history của lượt trước được truyền vào runChatCore', async () => {
    const store = new Map();
    zaloSession.getSessionHistory = async (chatId) => store.get(chatId) || [];
    zaloSession.appendSessionTurn = async (chatId, userText, modelText) => {
        const prev = store.get(chatId) || [];
        store.set(chatId, prev.concat([
            { role: 'user', parts: [{ text: userText }] },
            { role: 'model', parts: [{ text: modelText }] },
        ]));
    };

    const capturedHistories = [];
    chatCore.runChatCore = async ({ history, sink }) => {
        capturedHistories.push(history);
        sink.open({});
        if (capturedHistories.length === 1) {
            sink.event({ done: true, fullText: 'Bạn có phải người nước ngoài không?', sources: [], verifiedLocations: [] });
        } else {
            sink.event({ done: true, fullText: 'Bạn cần chuẩn bị các giấy tờ sau...', sources: [], verifiedLocations: [] });
        }
        sink.close();
    };
    zaloClient.sendMessage = async () => ({ ok: true });

    await zaloBotHandler.processZaloMessage({ chatId: 'ctx-1', messageId: 'm1', text: 'Tôi bị mất hộ chiếu và cần được hướng dẫn cụ thể' });
    await zaloBotHandler.processZaloMessage({ chatId: 'ctx-1', messageId: 'm2', text: 'Người nước ngoài' });

    assert.equal(capturedHistories.length, 2);
    assert.deepEqual(capturedHistories[0], []);
    assert.equal(capturedHistories[1].length, 2);
    assert.match(capturedHistories[1][0].parts[0].text, /mất hộ chiếu/);
    assert.match(capturedHistories[1][1].parts[0].text, /người nước ngoài không/);
});

// =====================================================================
// F. Location — verified location trình bày đúng định dạng
// =====================================================================

test('F1. câu hỏi địa điểm với verifiedLocations -> tin nhắn có 📍 tên/địa chỉ/Maps, không hallucinate', async () => {
    chatCore.runChatCore = async ({ sink }) => {
        sink.open({});
        sink.event({
            done: true,
            fullText: 'Công an xã Bình Xuyên hỗ trợ bạn tại địa chỉ dưới đây.',
            sources: [],
            verifiedLocations: [{ name: 'Công an xã Bình Xuyên', address: 'Thôn 1, xã Bình Xuyên', mapsUrl: 'https://maps.google.com/?q=21,105' }],
        });
        sink.close();
    };
    const sent = [];
    zaloClient.sendMessage = async (chatId, text) => { sent.push(text); return { ok: true }; };
    zaloSession.getSessionHistory = async () => [];
    zaloSession.appendSessionTurn = async () => {};

    await zaloBotHandler.processZaloMessage({ chatId: 'loc-1', messageId: 'm', text: 'Công an xã Bình Xuyên ở đâu?' });

    assert.equal(sent.length, 1);
    assert.match(sent[0], /📍 Công an xã Bình Xuyên/);
    assert.match(sent[0], /Thôn 1, xã Bình Xuyên/);
    assert.match(sent[0], /maps\.google\.com/);
});

// =====================================================================
// G. AI failure / fallback
// =====================================================================

test('G1. runChatCore gọi sink.fail (Gemini/Pinecone lỗi) -> gửi fallback sạch, không lộ chi tiết lỗi', async () => {
    chatCore.runChatCore = async ({ sink }) => {
        sink.fail(500, { error: 'SERVER_CONFIG_ERROR', detail: 'boom internal detail' });
    };
    const sent = [];
    zaloClient.sendMessage = async (chatId, text) => { sent.push(text); return { ok: true }; };
    zaloSession.getSessionHistory = async () => [];
    zaloSession.appendSessionTurn = async () => {};

    await zaloBotHandler.processZaloMessage({ chatId: 'fail-1', messageId: 'm', text: 'thủ tục cấp căn cước công dân cần giấy tờ gì' });

    assert.equal(sent.length, 1);
    assert.match(sent[0], /bandocapt\.io\.vn/);
    assert.equal(sent[0].includes('boom internal detail'), false);
    assert.equal(sent[0].includes('SERVER_CONFIG_ERROR'), false);
});

test('G2. runChatCore throw exception -> fallback sạch, không có stack trace lộ ra người dùng', async () => {
    chatCore.runChatCore = async () => {
        throw new Error('Pinecone timeout at internal-host:1234 with secret=abc');
    };
    const sent = [];
    zaloClient.sendMessage = async (chatId, text) => { sent.push(text); return { ok: true }; };
    zaloSession.getSessionHistory = async () => [];
    zaloSession.appendSessionTurn = async () => {};

    await zaloBotHandler.processZaloMessage({ chatId: 'fail-2', messageId: 'm', text: 'khai báo tạm trú cho người nước ngoài thế nào' });

    assert.equal(sent.length, 1);
    assert.match(sent[0], /bandocapt\.io\.vn/);
    assert.equal(sent[0].includes('Pinecone'), false);
    assert.equal(sent[0].includes('secret='), false);
    assert.equal(sent[0].toLowerCase().includes('error:'), false);
});

test('G3. runChatCore trả done rỗng (không có fullText) -> vẫn fallback, không gửi tin trống', async () => {
    chatCore.runChatCore = async ({ sink }) => {
        sink.open({});
        sink.event({ done: true, fullText: '', sources: [], verifiedLocations: [] });
        sink.close();
    };
    const sent = [];
    zaloClient.sendMessage = async (chatId, text) => { sent.push(text); return { ok: true }; };
    zaloSession.getSessionHistory = async () => [];
    zaloSession.appendSessionTurn = async () => {};

    await zaloBotHandler.processZaloMessage({ chatId: 'fail-3', messageId: 'm', text: 'câu hỏi bất kỳ về thủ tục hành chính' });

    assert.equal(sent.length, 1);
    assert.match(sent[0], /bandocapt\.io\.vn/);
});

// =====================================================================
// Zalo API failure (client-level 400/401/429/500/timeout) — không được làm crash xử lý nền.
// =====================================================================

test('Z1. Zalo sendMessage trả lỗi (429) -> processZaloMessage không throw, chạy xong bình thường', async () => {
    chatCore.runChatCore = async ({ sink }) => {
        sink.open({});
        sink.event({ done: true, fullText: 'Câu trả lời hợp lệ.', sources: [], verifiedLocations: [] });
        sink.close();
    };
    zaloClient.sendMessage = async () => ({ ok: false, status: 429, error: 'ZALO_API_ERROR', detail: 'Too Many Requests' });
    zaloSession.getSessionHistory = async () => [];
    zaloSession.appendSessionTurn = async () => {};

    await assert.doesNotReject(zaloBotHandler.processZaloMessage({ chatId: 'z-1', messageId: 'm', text: 'câu hỏi hợp lệ về thủ tục' }));
});

// =====================================================================
// isPrivateChat / isBotEnabled — helper trực tiếp
// =====================================================================

test('isPrivateChat: PRIVATE hoặc thiếu field -> true; GROUP -> false', () => {
    assert.equal(zaloBotHandler.isPrivateChat('PRIVATE'), true);
    assert.equal(zaloBotHandler.isPrivateChat(undefined), true);
    assert.equal(zaloBotHandler.isPrivateChat('GROUP'), false);
    assert.equal(zaloBotHandler.isPrivateChat('group'), false);
});

test('isBotEnabled: chỉ true khi ZALO_BOT_ENABLED === "true"', () => {
    const original = process.env.ZALO_BOT_ENABLED;
    process.env.ZALO_BOT_ENABLED = 'true';
    assert.equal(zaloBotHandler.isBotEnabled(), true);
    process.env.ZALO_BOT_ENABLED = 'TRUE';
    assert.equal(zaloBotHandler.isBotEnabled(), false);
    process.env.ZALO_BOT_ENABLED = '';
    assert.equal(zaloBotHandler.isBotEnabled(), false);
    delete process.env.ZALO_BOT_ENABLED;
    assert.equal(zaloBotHandler.isBotEnabled(), false);
    process.env.ZALO_BOT_ENABLED = original;
});
