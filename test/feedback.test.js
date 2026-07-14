'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const handler = require('../api/feedback');
const {
    validateFeedbackBody,
    buildFeedbackRecord,
    buildTelegramFeedbackAlert,
    sanitizeFeedbackSources,
    getVnDateKey,
} = handler;

test('feedback imports shared request security without loading the chat handler', () => {
    assert.equal(require.cache[require.resolve('../api/chat')], undefined);
});

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_DB_URL = process.env.FIREBASE_DB_URL;
const ORIGINAL_DB_SECRET = process.env.FIREBASE_DB_SECRET;

function restoreEnv(name, value) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
}

test.afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
    restoreEnv('FIREBASE_DB_URL', ORIGINAL_DB_URL);
    restoreEnv('FIREBASE_DB_SECRET', ORIGINAL_DB_SECRET);
});

function createResponse() {
    return {
        headers: {},
        statusCode: 200,
        body: undefined,
        ended: false,
        setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
        end() { this.ended = true; return this; },
    };
}

// Ký token đúng công thức verifyRequestSignature (api/chat.js) để test nhánh có Origin.
function computeToken(signedMessage, requestTime, originHost, userAgent) {
    const messageDigest = crypto.createHash('sha256').update(signedMessage).digest('hex').substring(0, 32);
    const signData = `${requestTime}:${originHost}:${userAgent.length}:${messageDigest}`;
    const keyMaterial = `xnc-phu-tho:${originHost}:${userAgent.substring(0, 16)}`;
    return crypto.createHmac('sha256', keyMaterial).update(signData).digest('hex');
}

// ---------- validateFeedbackBody ----------

test('accepts a valid up-vote', () => {
    const result = validateFeedbackBody({ turn_id: 't_1_1_abc', rating: 'up' });
    assert.equal(result.ok, true);
    assert.equal(result.value.rating, 'up');
    assert.equal(result.value.category, '');
});

test('accepts a valid down-report with category and sanitizes PII', () => {
    const result = validateFeedbackBody({
        turn_id: 't_1_1_abc',
        rating: 'down',
        category: 'sai_thong_tin',
        comment: 'Liên hệ tôi qua a@b.com nhé',
        question: 'Thủ tục X?',
        answer: 'Sai rồi',
    });
    assert.equal(result.ok, true);
    assert.equal(result.value.category, 'sai_thong_tin');
    assert.match(result.value.comment, /\[redacted:email\]/);
    assert.doesNotMatch(result.value.comment, /a@b\.com/);
});

test('keeps email in contact (opt-in liên hệ lại) but still redacts it elsewhere', () => {
    const result = validateFeedbackBody({
        turn_id: 't_1_1_abc',
        rating: 'down',
        contact: 'lien he qua a@b.com nhe',
        comment: 'email cua toi la a@b.com',
    });
    assert.equal(result.ok, true);
    assert.match(result.value.contact, /a@b\.com/);
    assert.doesNotMatch(result.value.contact, /\[redacted:email\]/);
    assert.match(result.value.comment, /\[redacted:email\]/);
    assert.doesNotMatch(result.value.comment, /a@b\.com/);
});

test('contact still redacts tokens/secrets even though email is allowed', () => {
    const result = validateFeedbackBody({
        turn_id: 't_1_1_abc',
        rating: 'down',
        contact: 'api_key: sk-abcdef123456',
    });
    assert.equal(result.ok, true);
    assert.match(result.value.contact, /\[redacted:secret\]/);
    assert.doesNotMatch(result.value.contact, /sk-abcdef123456/);
});

test('rejects invalid rating', () => {
    const result = validateFeedbackBody({ turn_id: 't_1', rating: 'meh' });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'INVALID_RATING');
});

test('rejects missing or malformed turn_id', () => {
    assert.equal(validateFeedbackBody({ rating: 'up' }).error, 'INVALID_TURN_ID');
    assert.equal(validateFeedbackBody({ rating: 'up', turn_id: 'bad id!' }).error, 'INVALID_TURN_ID');
});

test('rejects unknown category', () => {
    const result = validateFeedbackBody({ turn_id: 't_1', rating: 'down', category: 'nonsense' });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'INVALID_CATEGORY');
});

test('rejects non-object body', () => {
    assert.equal(validateFeedbackBody(null).error, 'INVALID_BODY');
    assert.equal(validateFeedbackBody('x').error, 'INVALID_BODY');
});

// ---------- sanitizeFeedbackSources ----------

test('sanitizeFeedbackSources caps count and keeps only shallow fields', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ file: `f${i}`, url: 'u', procedure_id: 'p', junk: 'x' }));
    const out = sanitizeFeedbackSources(many);
    assert.equal(out.length, 8);
    assert.deepEqual(Object.keys(out[0]).sort(), ['article', 'file', 'procedure_id', 'url']);
    assert.equal(out[0].junk, undefined);
});

test('sanitizeFeedbackSources tolerates non-array', () => {
    assert.deepEqual(sanitizeFeedbackSources(null), []);
    assert.deepEqual(sanitizeFeedbackSources('x'), []);
});

// ---------- buildFeedbackRecord ----------

test('buildFeedbackRecord sets hashed ip, date_key and TTL', () => {
    const now = new Date('2026-07-10T02:00:00Z'); // 09:00 VN → date_key 2026_07_10
    const value = validateFeedbackBody({ turn_id: 't_1', rating: 'up' }).value;
    const record = buildFeedbackRecord(value, { ip: '1.2.3.4', userAgent: 'UA' }, now);
    assert.equal(record.date_key, '2026_07_10');
    assert.equal(record.rating, 'up');
    assert.match(record.ip_bucket_hash, /^[0-9a-f]{32}$/);
    assert.ok(record.expires_at > record.created_at);
});

test('buildTelegramFeedbackAlert includes chatbot answer', () => {
    const alert = buildTelegramFeedbackAlert({
        category: 'sai_thong_tin',
        question: 'Hoi ve ho chieu?',
        answer: 'Day la cau tra loi chatbot da tra ve.',
        comment: 'Sai can sua',
    });

    assert.match(alert, /Bao cao chatbot moi \[sai_thong_tin\]/);
    assert.match(alert, /Cau hoi: Hoi ve ho chieu\?/);
    assert.match(alert, /Cau tra loi chatbot: Day la cau tra loi chatbot da tra ve\./);
    assert.match(alert, /Mo ta: Sai can sua/);
});

test('getVnDateKey rolls to next day after 17:00 UTC', () => {
    assert.equal(getVnDateKey(new Date('2026-07-10T17:30:00Z')), '2026_07_11');
});

// ---------- handler ----------

test('handler answers OPTIONS preflight with 200', async () => {
    const res = createResponse();
    await handler({ method: 'OPTIONS', headers: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.ended, true);
});

test('handler rejects non-POST with 405', async () => {
    const res = createResponse();
    await handler({ method: 'GET', headers: {} }, res);
    assert.equal(res.statusCode, 405);
});

test('handler rejects disallowed origin with 403', async () => {
    const res = createResponse();
    await handler({ method: 'POST', headers: { origin: 'https://evil.example' }, body: {} }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error, 'FORBIDDEN');
});

test('handler validates body before anything else', async () => {
    const res = createResponse();
    await handler({ method: 'POST', headers: {}, body: { rating: 'nope' } }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'INVALID_RATING');
});

test('handler requires request token when origin is present', async () => {
    const res = createResponse();
    await handler({
        method: 'POST',
        headers: { origin: 'http://localhost:3000' },
        body: { turn_id: 't_1', rating: 'up' },
    }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error, 'MISSING_TOKEN');
});

test('handler requires request token even without an Origin header (non-browser caller)', async () => {
    const res = createResponse();
    await handler({
        method: 'POST',
        headers: {},
        body: { turn_id: 't_1', rating: 'up' },
    }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error, 'MISSING_TOKEN');
});

test('handler stores feedback and returns ok with a valid signature', async () => {
    process.env.FIREBASE_DB_URL = 'https://db.example';
    delete process.env.FIREBASE_DB_SECRET;

    const posts = [];
    global.fetch = async (url, opts = {}) => {
        const method = opts.method || 'GET';
        if (method === 'GET') return { ok: true, json: async () => 0 };            // rate-limit count
        if (method === 'PUT') return { ok: true, json: async () => null };         // rate-limit increment
        posts.push({ url: String(url), body: JSON.parse(opts.body) });             // persist POST
        return { ok: true, json: async () => ({ name: 'pushid' }) };
    };

    const requestTime = String(Date.now());
    const token = computeToken('t_9:down', requestTime, 'localhost', '');
    const res = createResponse();
    await handler({
        method: 'POST',
        headers: {
            origin: 'http://localhost:3000',
            'x-request-token': token,
            'x-request-time': requestTime,
        },
        body: { turn_id: 't_9', rating: 'down', category: 'sai_thong_tin', comment: 'sai' },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { ok: true });
    assert.equal(posts.length, 1);
    assert.match(posts[0].url, /chat_feedback\//);
    assert.equal(posts[0].body.rating, 'down');
    assert.equal(posts[0].body.category, 'sai_thong_tin');
});

// Header ký hợp lệ dùng chung cho các test không set Origin (originHost fallback 'localhost'
// trong verifyRequestSignature) — kể từ khi HMAC bắt buộc vô điều kiện, các test này phải ký
// đúng mới chạm tới nhánh logic đang kiểm tra (rate limit / persist).
function signedHeadersNoOrigin(turnId, rating) {
    const requestTime = String(Date.now());
    const token = computeToken(`${turnId}:${rating}`, requestTime, 'localhost', '');
    return { 'x-request-token': token, 'x-request-time': requestTime };
}

test('handler returns 429 when the daily IP limit is reached', async () => {
    process.env.FIREBASE_DB_URL = 'https://db.example';
    process.env.FEEDBACK_DAILY_IP_LIMIT = '2';
    global.fetch = async () => ({ ok: true, json: async () => 5 }); // count above limit

    const res = createResponse();
    await handler({
        method: 'POST',
        headers: signedHeadersNoOrigin('t_1', 'up'),
        body: { turn_id: 't_1', rating: 'up' },
    }, res);
    assert.equal(res.statusCode, 429);
    assert.equal(res.body.error, 'RATE_LIMIT');
    delete process.env.FEEDBACK_DAILY_IP_LIMIT;
});

test('handler returns 200 without storing when no DB is configured', async () => {
    delete process.env.FIREBASE_DB_URL;
    let called = false;
    global.fetch = async () => { called = true; return { ok: true, json: async () => 0 }; };

    const res = createResponse();
    await handler({
        method: 'POST',
        headers: signedHeadersNoOrigin('t_1', 'up'),
        body: { turn_id: 't_1', rating: 'up' },
    }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { ok: true });
    assert.equal(called, false);
});

test('handler returns 503 when persistence fails', async () => {
    process.env.FIREBASE_DB_URL = 'https://db.example';
    global.fetch = async (url, opts = {}) => {
        const method = opts.method || 'GET';
        if (method === 'POST') return { ok: false, status: 500 }; // persist fails
        return { ok: true, json: async () => 0 };
    };

    const res = createResponse();
    await handler({
        method: 'POST',
        headers: signedHeadersNoOrigin('t_1', 'up'),
        body: { turn_id: 't_1', rating: 'up' },
    }, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.error, 'SERVICE_UNAVAILABLE');
});
