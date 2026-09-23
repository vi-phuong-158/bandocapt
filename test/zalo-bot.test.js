'use strict';

// =====================================================================
// Unit tests cho lib/zalo-bot.js — transport adapter thuần, không RAG.
// =====================================================================

const assert = require('node:assert/strict');
const test = require('node:test');

const {
    isZaloBotRoute,
    verifyZaloWebhookSecret,
    parseZaloWebhook,
    buildZaloRatePrincipal,
    splitZaloText,
    sendZaloMessage,
    ZALO_MAX_TEXT_LENGTH,
} = require('../lib/zalo-bot');

// ---------------------------------------------------------------------
// isZaloBotRoute
// ---------------------------------------------------------------------

test('isZaloBotRoute: true chỉ khi POST và query __channel=zalo_bot', () => {
    assert.equal(isZaloBotRoute({ method: 'POST', query: { __channel: 'zalo_bot' } }), true);
});

test('isZaloBotRoute: false khi method không phải POST', () => {
    assert.equal(isZaloBotRoute({ method: 'GET', query: { __channel: 'zalo_bot' } }), false);
    assert.equal(isZaloBotRoute({ method: 'OPTIONS', query: { __channel: 'zalo_bot' } }), false);
});

test('isZaloBotRoute: false khi thiếu hoặc sai query channel', () => {
    assert.equal(isZaloBotRoute({ method: 'POST', query: {} }), false);
    assert.equal(isZaloBotRoute({ method: 'POST' }), false);
    assert.equal(isZaloBotRoute({ method: 'POST', query: { __channel: 'website' } }), false);
});

// ---------------------------------------------------------------------
// verifyZaloWebhookSecret
// ---------------------------------------------------------------------

test('verifyZaloWebhookSecret: chấp nhận khi header khớp đúng secret hợp lệ (8-256 ký tự)', () => {
    const secret = 'a-valid-webhook-secret-1234';
    const req = { headers: { 'x-bot-api-secret-token': secret } };
    assert.equal(verifyZaloWebhookSecret(req, secret), true);
});

test('verifyZaloWebhookSecret: từ chối khi header sai, thiếu, hoặc secret env chưa cấu hình', () => {
    const secret = 'a-valid-webhook-secret-1234';
    assert.equal(verifyZaloWebhookSecret({ headers: { 'x-bot-api-secret-token': 'wrong-token-value' } }, secret), false);
    assert.equal(verifyZaloWebhookSecret({ headers: {} }, secret), false);
    assert.equal(verifyZaloWebhookSecret({ headers: { 'x-bot-api-secret-token': secret } }, undefined), false);
    assert.equal(verifyZaloWebhookSecret({ headers: { 'x-bot-api-secret-token': secret } }, ''), false);
});

test('verifyZaloWebhookSecret: từ chối secret ngoài khoảng 8-256 ký tự (kể cả khi header khớp y hệt)', () => {
    const tooShort = '1234567'; // 7 ký tự
    const tooLong = 'a'.repeat(257);
    assert.equal(verifyZaloWebhookSecret({ headers: { 'x-bot-api-secret-token': tooShort } }, tooShort), false);
    assert.equal(verifyZaloWebhookSecret({ headers: { 'x-bot-api-secret-token': tooLong } }, tooLong), false);
});

// ---------------------------------------------------------------------
// parseZaloWebhook — official wrapped payload: body.result.event_name / body.result.message
// ---------------------------------------------------------------------

function textPayload(overrides = {}) {
    return {
        result: {
            event_name: 'message.text.received',
            message: {
                text: 'Xin chào',
                chat: { id: 1001, chat_type: 'PRIVATE' },
                from: { id: 2002, is_bot: false },
                ...overrides.message,
            },
            ...overrides.result,
        },
        ...overrides.top,
    };
}

test('parseZaloWebhook: payload chính thức hợp lệ, chat PRIVATE, trả đủ trường', () => {
    const parsed = parseZaloWebhook(textPayload());
    assert.equal(parsed.ok, true);
    assert.equal(parsed.supported, true);
    assert.equal(parsed.eventName, 'message.text.received');
    assert.equal(parsed.text, 'Xin chào');
    assert.equal(parsed.chatId, '1001');
    assert.equal(parsed.chatType, 'PRIVATE');
    assert.equal(parsed.fromId, '2002');
});

test('parseZaloWebhook: chat_type GROUP được parse đúng', () => {
    const parsed = parseZaloWebhook(textPayload({ message: { chat: { id: 5555, chat_type: 'GROUP' } } }));
    assert.equal(parsed.supported, true);
    assert.equal(parsed.chatType, 'GROUP');
    assert.equal(parsed.chatId, '5555');
});

test('parseZaloWebhook: body sai hình dạng tối thiểu -> ok:false, không throw', () => {
    assert.equal(parseZaloWebhook(null).ok, false);
    assert.equal(parseZaloWebhook({}).ok, false);
    // event_name đúng nhưng message sai hình dạng -> ok:false (không phải supported:false)
    assert.equal(parseZaloWebhook({ result: { event_name: 'message.text.received', message: 'not-an-object' } }).ok, false);
});

test('parseZaloWebhook: result thiếu event_name -> vẫn ACK an toàn (supported:false), không throw', () => {
    const parsed = parseZaloWebhook({ result: {} });
    assert.equal(parsed.ok, true);
    assert.equal(parsed.supported, false);
});

test('parseZaloWebhook: message từ bot (is_bot=true) bị bỏ qua, không đưa vào RAG', () => {
    const parsed = parseZaloWebhook(textPayload({ message: { from: { id: 9, is_bot: true } } }));
    assert.equal(parsed.ok, true);
    assert.equal(parsed.supported, false);
    assert.equal(parsed.reason, 'BOT_MESSAGE');
});

test('parseZaloWebhook: event không phải message.text.received (ảnh/sticker/voice) -> ACK an toàn, không RAG', () => {
    for (const eventName of ['message.image.received', 'message.sticker.received', 'message.voice.received']) {
        const payload = { result: { event_name: eventName, message: { text: 'x', chat: { id: 1, chat_type: 'PRIVATE' }, from: { id: 2 } } } };
        const parsed = parseZaloWebhook(payload);
        assert.equal(parsed.ok, true);
        assert.equal(parsed.supported, false, `event ${eventName} phải bị coi là unsupported`);
    }
});

test('parseZaloWebhook: thiếu text hoặc thiếu chat.id -> unsupported, không throw', () => {
    const missingText = parseZaloWebhook(textPayload({ message: { text: '' } }));
    assert.equal(missingText.supported, false);

    const missingChat = parseZaloWebhook({
        result: { event_name: 'message.text.received', message: { text: 'hi', chat: {}, from: { id: 1 } } },
    });
    assert.equal(missingChat.supported, false);
});

// ---------------------------------------------------------------------
// buildZaloRatePrincipal
// ---------------------------------------------------------------------

test('buildZaloRatePrincipal: định dạng zalo:<chat_type>:<chat_id>:<from_id>, không dùng IP', () => {
    const principal = buildZaloRatePrincipal({ chatType: 'GROUP', chatId: '5555', fromId: '2002' });
    assert.equal(principal, 'zalo:GROUP:5555:2002');
});

// ---------------------------------------------------------------------
// splitZaloText — không mất ký tự, không đổi nội dung
// ---------------------------------------------------------------------

test('splitZaloText: text <= 2000 ký tự không bị chia', () => {
    const text = 'a'.repeat(2000);
    assert.equal(text.length, ZALO_MAX_TEXT_LENGTH);
    const chunks = splitZaloText(text, ZALO_MAX_TEXT_LENGTH);
    assert.deepEqual(chunks, [text]);
});

test('splitZaloText: text ngắn hơn giới hạn giữ nguyên 1 đoạn', () => {
    assert.deepEqual(splitZaloText('xin chào', 2000), ['xin chào']);
});

test('splitZaloText: text > 2000 ký tự được chia an toàn, KHÔNG mất/đổi nội dung', () => {
    // Dựng văn bản dài có đoạn/câu/khoảng trắng để chắc chắn có ranh giới an toàn.
    const paragraph = 'Đây là một đoạn văn bản thủ tục hành chính dùng để kiểm thử việc chia nhỏ tin nhắn Zalo. '.repeat(30);
    const longText = `${paragraph}\n\n${paragraph}`;
    assert.ok(longText.length > 2000);

    const chunks = splitZaloText(longText, 2000);
    assert.ok(chunks.length > 1);
    for (const chunk of chunks) {
        assert.ok(chunk.length <= 2000, `chunk dài ${chunk.length} vượt giới hạn 2000`);
    }
    // Bất biến cốt lõi: nối lại đúng nguyên văn, không mất/đổi ký tự nào.
    assert.equal(chunks.join(''), longText);
});

test('splitZaloText: hard-cut vẫn không mất ký tự khi không có ranh giới an toàn nào trong phạm vi', () => {
    const longText = 'a'.repeat(5000); // không có khoảng trắng/xuống dòng nào
    const chunks = splitZaloText(longText, 2000);
    assert.equal(chunks.length, 3);
    assert.equal(chunks.join(''), longText);
    assert.equal(chunks[0].length, 2000);
    assert.equal(chunks[1].length, 2000);
    assert.equal(chunks[2].length, 1000);
});

// ---------------------------------------------------------------------
// sendZaloMessage
// ---------------------------------------------------------------------

test('sendZaloMessage: gọi đúng endpoint /sendMessage với chat_id và text, không lộ token trong lỗi', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
        calls.push({ url: String(url), options });
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
    };
    await sendZaloMessage({ chatId: '1001', text: 'Xin chào', token: 'super-secret-token-value', fetchImpl });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://bot-api.zaloplatforms.com/botsuper-secret-token-value/sendMessage');
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.chat_id, '1001');
    assert.equal(body.text, 'Xin chào');
});

test('sendZaloMessage: HTTP lỗi -> throw nhưng thông điệp lỗi không chứa token', async () => {
    const fetchImpl = async () => ({ ok: false, status: 500 });
    await assert.rejects(
        () => sendZaloMessage({ chatId: '1001', text: 'x', token: 'super-secret-token-value', fetchImpl }),
        (err) => {
            assert.ok(!err.message.includes('super-secret-token-value'));
            return true;
        }
    );
});

test('sendZaloMessage: thiếu token -> throw không gọi fetch', async () => {
    let called = false;
    const fetchImpl = async () => { called = true; return { ok: true, status: 200, json: async () => ({}) }; };
    await assert.rejects(() => sendZaloMessage({ chatId: '1001', text: 'x', token: undefined, fetchImpl }));
    assert.equal(called, false);
});
