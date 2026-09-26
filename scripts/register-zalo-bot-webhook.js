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

async function main() {
    const missing = REQUIRED_ENVS.filter(name => !process.env[name]);
    if (missing.length > 0) {
        console.error(`Thiếu biến môi trường bắt buộc: ${missing.join(', ')}`);
        process.exitCode = 1;
        return;
    }

    const token = process.env.ZALO_BOT_TOKEN;
    const secret = process.env.ZALO_BOT_WEBHOOK_SECRET;
    const url = process.env.ZALO_BOT_WEBHOOK_URL;

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
        if (body && typeof body.description === 'string') {
            console.error(`Mô tả từ Zalo: ${body.description}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log('Đăng ký webhook Zalo Bot Platform thành công.');
    if (body && typeof body === 'object') {
        // Chỉ in các trường phản hồi không nhạy cảm — không có token/secret nào
        // trong response setWebhook, nhưng vẫn chọn lọc tường minh thay vì in nguyên body.
        const { ok, result, description } = body;
        console.log(JSON.stringify({ ok, result, description }, null, 2));
    }
}

if (require.main === module) {
    main().catch(err => {
        console.error('Lỗi khi đăng ký webhook Zalo Bot:', err.message);
        process.exitCode = 1;
    });
}

module.exports = { isSetWebhookSuccess };
