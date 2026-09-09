'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
    getBotApiUrl,
    isRetryableStatus,
    callZaloApi,
    sendMessage,
    sendChatAction,
    setWebhook,
    getWebhookInfo,
} = require('../lib/zalo-bot-client');

test('getBotApiUrl dựng đúng dạng Telegram-style endpoint', () => {
    assert.equal(
        getBotApiUrl('123:secret', 'sendMessage'),
        'https://bot-api.zaloplatforms.com/bot123:secret/sendMessage'
    );
});

test('isRetryableStatus: chỉ 429 và 5xx được coi là transient', () => {
    assert.equal(isRetryableStatus(429), true);
    assert.equal(isRetryableStatus(500), true);
    assert.equal(isRetryableStatus(503), true);
    assert.equal(isRetryableStatus(400), false);
    assert.equal(isRetryableStatus(401), false);
    assert.equal(isRetryableStatus(404), false);
    assert.equal(isRetryableStatus(200), false);
});

test('callZaloApi: thiếu token trả lỗi rõ ràng, không gọi fetch', async () => {
    let fetchCalled = false;
    const result = await callZaloApi('sendMessage', { chat_id: '1', text: 'hi' }, {
        token: '',
        fetchImpl: async () => { fetchCalled = true; },
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'ZALO_BOT_TOKEN_MISSING');
    assert.equal(fetchCalled, false);
});

test('sendMessage: gửi đúng method/body và không lộ token trong kết quả trả về', async () => {
    let capturedUrl = null;
    let capturedBody = null;
    const fetchImpl = async (url, options) => {
        capturedUrl = url;
        capturedBody = JSON.parse(options.body);
        return { ok: true, json: async () => ({ ok: true, result: { message_id: 'm1' } }) };
    };
    const result = await sendMessage('chat-1', 'Xin chào', { token: 'TOKEN123', fetchImpl });

    assert.equal(result.ok, true);
    assert.deepEqual(result.result, { message_id: 'm1' });
    assert.deepEqual(capturedBody, { chat_id: 'chat-1', text: 'Xin chào' });
    assert.match(capturedUrl, /\/botTOKEN123\/sendMessage$/);
    assert.equal(JSON.stringify(result).includes('TOKEN123'), false, 'kết quả trả về không được chứa token');
});

test('sendChatAction: gửi đúng action mặc định "typing"', async () => {
    let capturedBody = null;
    const fetchImpl = async (url, options) => {
        capturedBody = JSON.parse(options.body);
        return { ok: true, json: async () => ({ ok: true, result: {} }) };
    };
    await sendChatAction('chat-1', undefined, { token: 't', fetchImpl });
    assert.deepEqual(capturedBody, { chat_id: 'chat-1', action: 'typing' });
});

test('setWebhook: gửi url + secret_token đúng field name', async () => {
    let capturedBody = null;
    const fetchImpl = async (url, options) => {
        capturedBody = JSON.parse(options.body);
        return { ok: true, json: async () => ({ ok: true, result: {} }) };
    };
    await setWebhook('https://bandocapt.io.vn/api/zalo-bot', 'sekret12345', { token: 't', fetchImpl });
    assert.deepEqual(capturedBody, { url: 'https://bandocapt.io.vn/api/zalo-bot', secret_token: 'sekret12345' });
});

test('callZaloApi: không retry lỗi 4xx (vd 400/401)', async () => {
    let calls = 0;
    const fetchImpl = async () => {
        calls += 1;
        return { ok: false, status: 400, json: async () => ({ ok: false, description: 'Bad Request' }) };
    };
    const result = await callZaloApi('sendMessage', {}, { token: 't', fetchImpl, maxAttempts: 3 });
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
    assert.equal(calls, 1, 'không được retry lỗi 4xx');
});

test('callZaloApi: 401 cũng không retry', async () => {
    let calls = 0;
    const fetchImpl = async () => {
        calls += 1;
        return { ok: false, status: 401, json: async () => ({ ok: false, description: 'Unauthorized' }) };
    };
    const result = await callZaloApi('sendMessage', {}, { token: 't', fetchImpl, maxAttempts: 3 });
    assert.equal(result.ok, false);
    assert.equal(result.status, 401);
    assert.equal(calls, 1);
});

test('callZaloApi: retry có giới hạn cho 429, dừng khi vẫn lỗi sau maxAttempts', async () => {
    let calls = 0;
    const fetchImpl = async () => {
        calls += 1;
        return { ok: false, status: 429, json: async () => ({ ok: false, description: 'Too Many Requests' }) };
    };
    const result = await callZaloApi('sendMessage', {}, { token: 't', fetchImpl, maxAttempts: 3 });
    assert.equal(result.ok, false);
    assert.equal(result.status, 429);
    assert.equal(calls, 3, 'phải thử đúng maxAttempts lần cho lỗi transient');
});

test('callZaloApi: retry 500 rồi thành công không tạo duplicate call ngoài kỳ vọng', async () => {
    let calls = 0;
    const fetchImpl = async () => {
        calls += 1;
        if (calls < 2) return { ok: false, status: 500, json: async () => ({ ok: false, description: 'Internal' }) };
        return { ok: true, json: async () => ({ ok: true, result: { message_id: 'ok' } }) };
    };
    const result = await callZaloApi('sendMessage', {}, { token: 't', fetchImpl, maxAttempts: 3 });
    assert.equal(result.ok, true);
    assert.equal(calls, 2);
});

test('callZaloApi: timeout được phân loại riêng, không lộ chi tiết mạng nhạy cảm', async () => {
    const fetchImpl = async (url, options) => {
        return new Promise((_, reject) => {
            options.signal.addEventListener('abort', () => {
                const err = new Error('aborted');
                err.name = 'AbortError';
                reject(err);
            });
        });
    };
    const result = await callZaloApi('sendMessage', {}, { token: 't', fetchImpl, timeoutMs: 20, maxAttempts: 1 });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'ZALO_API_TIMEOUT');
});

test('getWebhookInfo: trả envelope ok khi HTTP 200 dù data.ok vắng mặt', async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => ({ result: { url: 'https://x' } }) });
    const result = await getWebhookInfo({ token: 't', fetchImpl });
    assert.equal(result.ok, true);
    assert.deepEqual(result.result, { url: 'https://x' });
});

test('callZaloApi: HTTP 200 nhưng body ok:false vẫn coi là lỗi (không giả định HTTP status đủ)', async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => ({ ok: false, description: 'chat not found' }) });
    const result = await callZaloApi('sendMessage', {}, { token: 't', fetchImpl, maxAttempts: 1 });
    assert.equal(result.ok, false);
    assert.equal(result.detail, 'chat not found');
});
