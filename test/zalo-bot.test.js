'use strict';

// =====================================================================
// Unit tests cho lib/zalo-bot.js — transport adapter thuần, không RAG.
// =====================================================================

const assert = require('node:assert/strict');
const test = require('node:test');

const {
    isZaloBotRoute,
    verifyZaloWebhookSecret,
    normalizeZaloWebhookEnvelope,
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

// Dạng "flat" (không có wrapper `result`): body.event_name / body.message trực tiếp ở top-level.
// Tài liệu hiện có (bot.zapps.me/docs/webhook/, xác minh 2026-09-26) mô tả dạng wrapped ở trên là
// chính thức, nhưng SDK bên thứ ba độc lập cho nền tảng này (NightOwl-VN/zalobot-sdk) tự hỗ trợ cả
// hai dạng — và production ACK 200 không kèm sendMessage khớp đúng triệu chứng "parser chỉ chấp
// nhận wrapped nhưng Zalo gửi flat". Không có bằng chứng raw payload production để khẳng định chắc
// chắn; test này khoá hành vi tương thích ngược (chấp nhận cả hai) mà không hạ chuẩn bảo mật.
function flatTextPayload(overrides = {}) {
    return {
        event_name: 'message.text.received',
        message: {
            text: 'Xin chào',
            chat: { id: 1001, chat_type: 'PRIVATE' },
            from: { id: 2002, is_bot: false },
            ...overrides.message,
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
    // {} không có `result` object -> chuẩn hoá thành envelope FLAT rỗng (không có event_name) ->
    // ok:true/supported:false/UNSUPPORTED_EVENT (ACK an toàn), không phải INVALID_BODY -- đây là
    // hệ quả CÓ CHỦ ĐÍCH của việc chấp nhận cả hai dạng payload (P0 fix), không phải hồi quy: {}
    // không tự chọn là "hình dạng sai" tuyệt đối, nó là một envelope flat hợp lệ nhưng rỗng.
    const emptyParsed = parseZaloWebhook({});
    assert.equal(emptyParsed.ok, true);
    assert.equal(emptyParsed.supported, false);
    assert.equal(emptyParsed.envelopeShape, 'flat');
    // event_name đúng nhưng message sai hình dạng -> ok:false (không phải supported:false), ở cả
    // hai dạng envelope.
    assert.equal(parseZaloWebhook({ result: { event_name: 'message.text.received', message: 'not-an-object' } }).ok, false);
    assert.equal(parseZaloWebhook({ event_name: 'message.text.received', message: 'not-an-object' }).ok, false);
});

// ---------------------------------------------------------------------
// T01–T14 — Real webhook payload compatibility (wrapped vs flat envelope)
// ---------------------------------------------------------------------

test('T01: wrapped fixture (body.result.event_name/message) -> parsed.supported=true, envelopeShape=wrapped', () => {
    const parsed = parseZaloWebhook(textPayload());
    assert.equal(parsed.supported, true);
    assert.equal(parsed.envelopeShape, 'wrapped');
});

test('T02: flat fixture (body.event_name/message) -> parsed.supported=true, envelopeShape=flat', () => {
    const parsed = parseZaloWebhook(flatTextPayload());
    assert.equal(parsed.supported, true);
    assert.equal(parsed.envelopeShape, 'flat');
});

test('T03: wrapped và flat normalize ra cùng semantic output (text/chatType/chatId/fromId)', () => {
    const wrapped = parseZaloWebhook(textPayload());
    const flat = parseZaloWebhook(flatTextPayload());
    assert.equal(wrapped.text, flat.text);
    assert.equal(wrapped.chatType, flat.chatType);
    assert.equal(wrapped.chatId, flat.chatId);
    assert.equal(wrapped.fromId, flat.fromId);
    assert.equal(wrapped.eventName, flat.eventName);
});

test('normalizeZaloWebhookEnvelope: wrapped -> envelope=body.result; flat -> envelope=body; invalid -> null', () => {
    const body = { result: { event_name: 'x' } };
    assert.deepEqual(normalizeZaloWebhookEnvelope(body), { envelope: body.result, shape: 'wrapped' });
    const flatBody = { event_name: 'x' };
    assert.deepEqual(normalizeZaloWebhookEnvelope(flatBody), { envelope: flatBody, shape: 'flat' });
    assert.equal(normalizeZaloWebhookEnvelope(null).envelope, null);
    assert.equal(normalizeZaloWebhookEnvelope(null).shape, 'invalid');
    // result không phải object (vd string/null) -> vẫn coi là flat, không phải invalid.
    assert.deepEqual(normalizeZaloWebhookEnvelope({ result: 'oops', event_name: 'x' }), { envelope: { result: 'oops', event_name: 'x' }, shape: 'flat' });
});

test('T04: invalid body (null/không phải object) -> ok:false, không throw, cả hai dạng envelope', () => {
    assert.doesNotThrow(() => parseZaloWebhook(null));
    assert.doesNotThrow(() => parseZaloWebhook(undefined));
    assert.doesNotThrow(() => parseZaloWebhook('a string'));
    assert.equal(parseZaloWebhook(null).ok, false);
});

test('T05: unsupported event ở dạng flat -> ACK an toàn (supported:false), không throw', () => {
    const parsed = parseZaloWebhook(flatTextPayload({ top: { event_name: 'message.image.received' } }));
    assert.equal(parsed.ok, true);
    assert.equal(parsed.supported, false);
    assert.equal(parsed.envelopeShape, 'flat');
});

test('T06: unsupported event ở dạng wrapped -> ACK an toàn (supported:false), không throw', () => {
    const parsed = parseZaloWebhook(textPayload({ result: { event_name: 'message.image.received' } }));
    assert.equal(parsed.ok, true);
    assert.equal(parsed.supported, false);
    assert.equal(parsed.envelopeShape, 'wrapped');
});

test('T07: BOT_MESSAGE bị bỏ qua ở cả hai dạng envelope', () => {
    const wrapped = parseZaloWebhook(textPayload({ message: { from: { id: 9, is_bot: true } } }));
    assert.equal(wrapped.supported, false);
    assert.equal(wrapped.reason, 'BOT_MESSAGE');
    const flat = parseZaloWebhook(flatTextPayload({ message: { from: { id: 9, is_bot: true } } }));
    assert.equal(flat.supported, false);
    assert.equal(flat.reason, 'BOT_MESSAGE');
});

test('T10: GROUP chat parse đúng ở cả hai dạng envelope (policy ignore áp dụng ở tầng handler, không phải parser)', () => {
    const wrapped = parseZaloWebhook(textPayload({ message: { chat: { id: 5555, chat_type: 'GROUP' } } }));
    assert.equal(wrapped.chatType, 'GROUP');
    const flat = parseZaloWebhook(flatTextPayload({ message: { chat: { id: 5555, chat_type: 'GROUP' } } }));
    assert.equal(flat.chatType, 'GROUP');
});

test('T11: chatId luôn lấy từ message.chat.id, không phải message.from.id, ở cả hai dạng', () => {
    const wrapped = parseZaloWebhook(textPayload({ message: { chat: { id: 7777, chat_type: 'PRIVATE' }, from: { id: 8888, is_bot: false } } }));
    assert.equal(wrapped.chatId, '7777');
    assert.notEqual(wrapped.chatId, '8888');
    const flat = parseZaloWebhook(flatTextPayload({ message: { chat: { id: 7777, chat_type: 'PRIVATE' }, from: { id: 8888, is_bot: false } } }));
    assert.equal(flat.chatId, '7777');
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

// T15: HTTP 200 nhưng body application-level báo thất bại (ok:false) phải bị coi là lỗi,
// không chỉ tin theo status code.
test('sendZaloMessage: HTTP 200 nhưng body {ok:false} -> vẫn throw, không log body/token', async () => {
    const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ ok: false, description: 'chat not found' }) });
    await assert.rejects(
        () => sendZaloMessage({ chatId: '1001', text: 'x', token: 'super-secret-token-value', fetchImpl }),
        (err) => {
            assert.ok(!err.message.includes('super-secret-token-value'));
            assert.ok(!err.message.includes('chat not found'));
            return true;
        }
    );
});

test('sendZaloMessage: HTTP 200 với body {ok:true} vẫn coi là thành công', async () => {
    const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) });
    await assert.doesNotReject(() => sendZaloMessage({ chatId: '1001', text: 'x', token: 'tok', fetchImpl }));
});

test('sendZaloMessage: body không có field ok (hoặc fetch mock không có .json) vẫn coi là thành công', async () => {
    const fetchImpl = async () => ({ ok: true, status: 200 }); // không có .json() — mock đời cũ
    await assert.doesNotReject(() => sendZaloMessage({ chatId: '1001', text: 'x', token: 'tok', fetchImpl }));
});
