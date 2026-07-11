'use strict';

// T1.9: câu trả lời quốc tịch ("Người Việt Nam"...) sau khi bot hỏi KHÔNG được coi là địa danh
// và KHÔNG được rơi vào nhánh trả lời tất định DETERMINISTIC_NO_MATCH (kết thúc trước RAG).

const assert = require('node:assert/strict');
const test = require('node:test');

// Env eval-dev phải đặt TRƯỚC khi require api/chat.
process.env.NODE_ENV = 'development';
process.env.EVAL_BYPASS_TOKEN = 'test-bypass-token';
process.env.CHAT_LOG_HASH_SALT = 'test-only-hash-salt';
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-key';
delete process.env.FIREBASE_DB_URL;

const {
    isLocationLookupRequested,
    isBarePlaceNameQuery,
    isNationalityAnswerContext,
} = require('../lib/published-locations');
const chatHandler = require('../api/chat');

const ORIGINAL_FETCH = global.fetch;

const NATIONALITY_QUESTION_VI = 'Bạn là công dân Việt Nam hay người nước ngoài để mình hướng dẫn chi tiết nhé?';
const NATIONALITY_QUESTION_EN = 'Are you a foreign national or a Vietnamese citizen?';

function historyAfterNationalityQuestion(question = NATIONALITY_QUESTION_VI) {
    return [
        { role: 'user', parts: [{ text: 'Tôi bị mất hộ chiếu, phải làm sao?' }] },
        { role: 'model', parts: [{ text: question }] },
    ];
}

test.afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
});

test('nationality answers are never treated as location lookups (T1.9)', () => {
    const historyVi = historyAfterNationalityQuestion();
    const historyEn = historyAfterNationalityQuestion(NATIONALITY_QUESTION_EN);

    for (const answer of ['Người Việt Nam', 'Công dân Việt Nam', 'Người nước ngoài', 'Tôi là công dân Việt Nam', 'Tôi là người nước ngoài']) {
        assert.equal(isLocationLookupRequested(answer, historyVi), false, `vi: ${answer}`);
        assert.equal(isBarePlaceNameQuery(answer), false, `vi bare: ${answer}`);
        assert.equal(isNationalityAnswerContext(answer, historyVi), true, `vi ctx: ${answer}`);
    }
    for (const answer of ['Vietnamese citizen', 'Foreigner', 'I am a foreign national', 'I am a Vietnamese citizen']) {
        assert.equal(isLocationLookupRequested(answer, historyEn), false, `en: ${answer}`);
        assert.equal(isNationalityAnswerContext(answer, historyEn), true, `en ctx: ${answer}`);
    }

    // Cả khi KHÔNG có history (người dùng gõ thẳng), pattern quốc tịch vẫn không phải địa danh.
    assert.equal(isLocationLookupRequested('Người Việt Nam', []), false);
    assert.equal(isLocationLookupRequested('Người nước ngoài', []), false);
});

test('short free-form answer right after nationality question stays out of location flow', () => {
    const history = historyAfterNationalityQuestion();
    // "Việt Nam" trần không khớp pattern quốc tịch, nhưng ngữ cảnh bot-vừa-hỏi-quốc-tịch phải chặn.
    assert.equal(isLocationLookupRequested('Việt Nam', history), false);
    assert.equal(isNationalityAnswerContext('Việt Nam', history), true);
});

test('true location behaviour is unchanged (non-regression)', () => {
    const locationQuestionHistory = [
        { role: 'user', parts: [{ text: 'Tôi muốn làm căn cước công dân thì làm thế nào' }] },
        { role: 'model', parts: [{ text: 'Bạn ở xã/phường nào để mình chỉ đúng trụ sở Công an và đường đi nhé?' }] },
    ];
    assert.equal(isLocationLookupRequested('Thanh Miếu', []), true);
    assert.equal(isLocationLookupRequested('Thanh Mieu', locationQuestionHistory), true);
    assert.equal(isBarePlaceNameQuery('Sông Lô'), true);

    // Sau câu hỏi quốc tịch mà người dùng lại khai nơi ở → vẫn đi luồng địa điểm.
    const nationalityHistory = historyAfterNationalityQuestion();
    assert.equal(isNationalityAnswerContext('Tôi ở phường Thanh Miếu', nationalityHistory), false);
    assert.equal(isLocationLookupRequested('Tôi ở phường Thanh Miếu', nationalityHistory), true);
});

// ---------------------------------------------------------------------------
// Integration: gọi handler thật với fetch bị chặn — chứng minh lượt "Người Việt Nam"
// đi qua nhánh tất định (không DETERMINISTIC_NO_MATCH), còn địa danh trần thì vẫn vào.
// ---------------------------------------------------------------------------

function createRequest(body) {
    return {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-forwarded-for': '127.0.0.1',
        },
        body,
        socket: {},
    };
}

function runHandler(body) {
    return new Promise((resolve, reject) => {
        let buffer = '';
        const res = {
            headers: {},
            statusCode: 200,
            setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
            status(code) { this.statusCode = code; return this; },
            json(payload) { resolve({ statusCode: this.statusCode, body: JSON.stringify(payload) }); return this; },
            writeHead(code) { this.statusCode = code; return this; },
            write(chunk) { buffer += chunk.toString(); return true; },
            end() { resolve({ statusCode: this.statusCode, body: buffer }); return this; },
        };
        chatHandler(createRequest(body), res).catch(reject);
    });
}

test('H16 turn "Người Việt Nam" is not answered by the deterministic no-data branch', async () => {
    global.fetch = async () => { throw new Error('network blocked in test'); };

    const result = await runHandler({
        captchaToken: 'test-bypass-token',
        userMessage: 'Người Việt Nam',
        history: historyAfterNationalityQuestion(),
    });

    assert.ok(!result.body.includes('DETERMINISTIC_NO_MATCH'),
        `must not end deterministically, got: ${result.body.slice(0, 300)}`);
    assert.ok(!result.body.includes('chưa có dữ liệu trụ sở'),
        `must not reply with the no-data location message, got: ${result.body.slice(0, 300)}`);
});

test('bare unknown place name still hits the deterministic branch (control)', async () => {
    global.fetch = async () => { throw new Error('network blocked in test'); };

    const result = await runHandler({
        captchaToken: 'test-bypass-token',
        userMessage: 'Suối Hoa',
        history: [],
    });

    assert.ok(result.body.includes('DETERMINISTIC_NO_MATCH'),
        `expected deterministic branch, got: ${result.body.slice(0, 300)}`);
});
