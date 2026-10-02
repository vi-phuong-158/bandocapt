#!/usr/bin/env node
'use strict';

// =====================================================================
// Đăng ký webhook Zalo Bot Platform (V0) — gọi setWebhook một lần.
// Không in token/secret ra console ở bất kỳ nhánh nào, kể cả khi lỗi.
//
//   ZALO_BOT_TOKEN=... ZALO_BOT_WEBHOOK_SECRET=... ZALO_BOT_WEBHOOK_URL=... \
//     node scripts/register-zalo-bot-webhook.js
// hoặc: npm run zalo:webhook:set
// =====================================================================

const REQUIRED_ENVS = ['ZALO_BOT_TOKEN', 'ZALO_BOT_WEBHOOK_SECRET', 'ZALO_BOT_WEBHOOK_URL'];

// HTTP 200 không đủ để coi là thành công — Zalo Bot Platform có thể trả HTTP 2xx
// kèm body { ok: false, description } khi setWebhook bị từ chối (vd secret_token
// sai định dạng). Phải kiểm tra cả hai tầng, nếu không sẽ báo "thành công" giả.
function isSetWebhookSuccess(response, body) {
    if (!response.ok) return false;
    if (body && body.ok === false) return false;
    return true;
}

function getWebhookUrl(env = process.env) {
    const value = env.ZALO_BOT_WEBHOOK_URL;
    if (env.VERCEL_ENV !== 'preview' || !env.VERCEL_AUTOMATION_BYPASS_SECRET) return value;
    const url = new URL(value);
    url.searchParams.set('x-vercel-protection-bypass', env.VERCEL_AUTOMATION_BYPASS_SECRET);
    return url.href;
}

async function main() {
    const missing = REQUIRED_ENVS.filter(name => !process.env[name]);
    if (missing.length > 0) {
        console.error(`Thiếu biến môi trường bắt buộc: ${missing.join(', ')}`);
        process.exitCode = 1;
        return;
    }

    const token = process.env.ZALO_BOT_TOKEN;
    const secret = process.env.ZALO_BOT_WEBHOOK_SECRET;
    const url = getWebhookUrl();

    if (secret.length < 8 || secret.length > 256) {
        console.error('ZALO_BOT_WEBHOOK_SECRET phải dài từ 8 đến 256 ký tự.');
        process.exitCode = 1;
        return;
    }

    let parsedUrl;
    try {
        parsedUrl = new URL(url);
    } catch (_) {
        console.error('ZALO_BOT_WEBHOOK_URL không phải một URL hợp lệ.');
        process.exitCode = 1;
        return;
    }
    if (parsedUrl.protocol !== 'https:') {
        console.error('ZALO_BOT_WEBHOOK_URL phải dùng https.');
        process.exitCode = 1;
        return;
    }

    const endpoint = `https://bot-api.zaloplatforms.com/bot${token}/setWebhook`;

    let response;
    try {
        response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, secret_token: secret }),
        });
    } catch (e) {
        console.error('Không gọi được setWebhook (lỗi mạng).');
        process.exitCode = 1;
        return;
    }

    const body = await response.json().catch(() => null);

    if (!isSetWebhookSuccess(response, body)) {
        console.error(`setWebhook thất bại: HTTP ${response.status}.`);
        process.exitCode = 1;
        return;
    }

    console.log('Đăng ký webhook Zalo Bot Platform thành công.');
    // Provider responses can echo a Preview URL containing a protection bypass secret.
    console.log(JSON.stringify({ ok: true }));
}

if (require.main === module) {
    main().catch(err => {
        console.error('ZALO_WEBHOOK_REGISTRATION_FAILED');
        process.exitCode = 1;
    });
}

module.exports = { isSetWebhookSuccess, getWebhookUrl };
