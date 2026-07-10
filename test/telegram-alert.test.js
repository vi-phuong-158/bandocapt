'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { sendTelegramAlert } = require('../api/chat.js');

test('sendTelegramAlert: no-op khi thiếu env (không gọi fetch)', async () => {
    const prevToken = process.env.TELEGRAM_BOT_TOKEN;
    const prevChat = process.env.TELEGRAM_CHAT_ID;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    let called = false;
    await sendTelegramAlert('test', async () => { called = true; return { ok: true }; });
    assert.equal(called, false);
    if (prevToken !== undefined) process.env.TELEGRAM_BOT_TOKEN = prevToken;
    if (prevChat !== undefined) process.env.TELEGRAM_CHAT_ID = prevChat;
});

test('sendTelegramAlert: gọi Telegram API với chat_id và text khi có env', async () => {
    const prevToken = process.env.TELEGRAM_BOT_TOKEN;
    const prevChat = process.env.TELEGRAM_CHAT_ID;
    process.env.TELEGRAM_BOT_TOKEN = 'TOKEN123';
    process.env.TELEGRAM_CHAT_ID = 'CHAT456';
    let capturedUrl = '';
    let capturedBody = null;
    await sendTelegramAlert('cảnh báo test', async (url, opts) => {
        capturedUrl = url;
        capturedBody = JSON.parse(opts.body);
        return { ok: true };
    });
    assert.match(capturedUrl, /api\.telegram\.org\/botTOKEN123\/sendMessage/);
    assert.equal(capturedBody.chat_id, 'CHAT456');
    assert.equal(capturedBody.text, 'cảnh báo test');
    if (prevToken !== undefined) process.env.TELEGRAM_BOT_TOKEN = prevToken; else delete process.env.TELEGRAM_BOT_TOKEN;
    if (prevChat !== undefined) process.env.TELEGRAM_CHAT_ID = prevChat; else delete process.env.TELEGRAM_CHAT_ID;
});

test('sendTelegramAlert: nuốt lỗi fetch, không throw', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'T';
    process.env.TELEGRAM_CHAT_ID = 'C';
    await assert.doesNotReject(sendTelegramAlert('x', async () => { throw new Error('network down'); }));
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
});
