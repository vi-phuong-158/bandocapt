'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isSetWebhookSuccess } = require('../scripts/register-zalo-bot-webhook');

test('isSetWebhookSuccess: HTTP không ok -> thất bại', () => {
    assert.equal(isSetWebhookSuccess({ ok: false, status: 400 }, { ok: false, description: 'bad' }), false);
});

test('isSetWebhookSuccess: HTTP ok nhưng body.ok=false -> thất bại (bug đã fix)', () => {
    // Trường hợp thực tế phát hiện: Zalo trả HTTP 2xx kèm body.ok=false khi
    // secret_token sai định dạng — trước fix, script này báo "thành công" sai.
    const body = { ok: false, description: 'Bad request: The secret_token must be 8-256 characters, only A-Z, a-z, 0-9, _ and - are allowed' };
    assert.equal(isSetWebhookSuccess({ ok: true, status: 200 }, body), false);
});

test('isSetWebhookSuccess: HTTP ok và body.ok=true -> thành công', () => {
    assert.equal(isSetWebhookSuccess({ ok: true, status: 200 }, { ok: true, result: true, description: 'Webhook was set' }), true);
});

test('isSetWebhookSuccess: HTTP ok và body không parse được (null) -> vẫn coi là thành công', () => {
    assert.equal(isSetWebhookSuccess({ ok: true, status: 200 }, null), true);
});
