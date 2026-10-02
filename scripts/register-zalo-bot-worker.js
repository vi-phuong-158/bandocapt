#!/usr/bin/env node
'use strict';

const { Client } = require('@upstash/qstash');
const { assertQStashConfig, workerUrl } = require('../lib/zalo-qstash');
const { storeNamespace } = require('../lib/zalo-batch-store');

async function registerWorkerSchedule({ env = process.env, client } = {}) {
    assertQStashConfig(env);
    if (!env.KV_REST_API_URL || !env.KV_REST_API_TOKEN || !env.CHAT_LOG_HASH_SALT?.trim()) throw new Error('ZALO_STORE_UNCONFIGURED');
    const qstash = client || new Client({ token: env.QSTASH_TOKEN });
    return qstash.schedules.create({
        destination: workerUrl(env), scheduleId: storeNamespace(env).replace(/:/g, '-'),
        body: JSON.stringify({ type: 'sweep' }),
        headers: { 'Content-Type': 'text/plain', ...(env.VERCEL_AUTOMATION_BYPASS_SECRET ? { 'x-vercel-protection-bypass': env.VERCEL_AUTOMATION_BYPASS_SECRET } : {}) },
        ...(env.VERCEL_AUTOMATION_BYPASS_SECRET ? { redact: { header: ['x-vercel-protection-bypass'] } } : {}),
        cron: '* * * * *', retries: 3, timeout: 60,
    });
}

if (require.main === module) {
    require('dotenv').config({ path: '.env.local', quiet: true });
    registerWorkerSchedule().then(() => console.info('Zalo worker sweep schedule configured (every minute).'))
        .catch(() => { console.error('ZALO_WORKER_SCHEDULE_FAILED: check service configuration and destination access.'); process.exitCode = 1; });
}

module.exports = { registerWorkerSchedule };
