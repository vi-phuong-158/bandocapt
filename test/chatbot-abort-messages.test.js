'use strict';

// js/chatbot.js là script trình duyệt — stub tối thiểu các global nó chạm ở top-level
// trước khi require (location.hostname, window._turnstile*, document listener).
global.location = { hostname: 'localhost' };
global.window = {};
global.document = { addEventListener() {} };

const test = require('node:test');
const assert = require('node:assert/strict');

const { getChatErrorMessage, CHATBOT_TEXT } = require('../js/chatbot.js').__test;

test('USER_CANCELLED maps to a neutral stop message, not the generic TIMEOUT text', () => {
    const message = getChatErrorMessage('USER_CANCELLED');
    assert.equal(message, 'Đã dừng phản hồi.');
    assert.notEqual(message, getChatErrorMessage('TIMEOUT'));
});

test('IDLE_TIMEOUT and REQUEST_TIMEOUT have distinct, specific messages', () => {
    const idle = getChatErrorMessage('IDLE_TIMEOUT');
    const requestTimeout = getChatErrorMessage('REQUEST_TIMEOUT');
    assert.match(idle, /gián đoạn quá lâu/);
    assert.match(requestTimeout, /chưa hoàn tất phản hồi/);
    assert.notEqual(idle, requestTimeout);
});

test('legacy TIMEOUT code still resolves for backward compatibility', () => {
    assert.equal(getChatErrorMessage('TIMEOUT'), 'Phản hồi quá lâu. Vui lòng thử lại.');
});

test('CHATBOT_TEXT carries the neutral stop-with-partial notice used for the Stop button', () => {
    assert.equal(CHATBOT_TEXT.stopped, 'Đã dừng phản hồi.');
    assert.equal(CHATBOT_TEXT.stoppedPartial, 'Phản hồi đã được dừng trước khi hoàn tất.');
});
