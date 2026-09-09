#!/usr/bin/env node
'use strict';

// =====================================================================
// scripts/setup-zalo-webhook.js — Đăng ký webhook Zalo Bot cho môi trường hiện tại.
//
// Đọc TOKEN/URL từ biến môi trường của máy chạy lệnh (Vercel env đã pull về .env.local,
// hoặc export trực tiếp trong shell) — KHÔNG BAO GIỜ nhận secret qua tham số dòng lệnh
// (tránh lộ vào lịch sử shell/process list) và KHÔNG log giá trị token.
//
// Cách dùng:
//   ZALO_BOT_TOKEN=... ZALO_BOT_WEBHOOK_SECRET=... PUBLIC_APP_URL=https://bandocapt.io.vn \
//     node scripts/setup-zalo-webhook.js
//   node scripts/setup-zalo-webhook.js --info   # chỉ gọi getWebhookInfo, không setWebhook
// =====================================================================

require('dotenv').config({ path: '.env.local' });
const { setWebhook, getWebhookInfo } = require('../lib/zalo-bot-client');

async function main() {
    const infoOnly = process.argv.includes('--info');
    const token = process.env.ZALO_BOT_TOKEN;
    const secret = process.env.ZALO_BOT_WEBHOOK_SECRET;
    const appUrl = process.env.PUBLIC_APP_URL || 'https://bandocapt.io.vn';

    if (!token) {
        console.error('Thiếu ZALO_BOT_TOKEN trong environment. Không tiếp tục.');
        process.exitCode = 1;
        return;
    }

    if (infoOnly) {
        const info = await getWebhookInfo({ token });
        console.log('getWebhookInfo:', JSON.stringify(info, null, 2));
        if (!info.ok) process.exitCode = 1;
        return;
    }

    if (!secret) {
        console.error('Thiếu ZALO_BOT_WEBHOOK_SECRET trong environment. Không tiếp tục.');
        process.exitCode = 1;
        return;
    }
    if (secret.length < 8 || secret.length > 256) {
        console.error('ZALO_BOT_WEBHOOK_SECRET phải dài 8-256 ký tự.');
        process.exitCode = 1;
        return;
    }

    const webhookUrl = `${appUrl.replace(/\/+$/, '')}/api/zalo-bot`;
    console.log('Đăng ký webhook tại:', webhookUrl);

    const result = await setWebhook(webhookUrl, secret, { token });
    if (!result.ok) {
        console.error('setWebhook thất bại:', result.error, result.detail || '');
        process.exitCode = 1;
        return;
    }
    console.log('setWebhook thành công.');

    const info = await getWebhookInfo({ token });
    console.log('getWebhookInfo:', JSON.stringify(info, null, 2));
}

main().catch(err => {
    console.error('Lỗi không xác định:', err.message);
    process.exitCode = 1;
});
