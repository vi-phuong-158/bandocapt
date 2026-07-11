const assert = require('node:assert/strict');
const test = require('node:test');

const {
    countWords,
    VERBOSITY_LIMIT_NARROW,
    VERBOSITY_LIMIT_FULL,
} = require('../lib/regression-metrics');
const { parseArgs, parseConversations } = require('../scripts/run-regression');
const { gradeCase, compilePattern } = require('../lib/regression-grader');

test('regression word count handles whitespace and CJK text', () => {
    assert.equal(countWords('A short English answer.'), 4);
    assert.ok(countWords('您必须在12小时内申报。然后等待系统确认。') > 1);
});

test('regression verbosity limits match the answer-first prompt budgets', () => {
    assert.equal(VERBOSITY_LIMIT_NARROW, 120);
    assert.equal(VERBOSITY_LIMIT_FULL, 250);
});

test('--strict-gate flag is parsed, default stays lenient (T1.10)', () => {
    assert.equal(parseArgs([]).strictGate, false);
    assert.equal(parseArgs(['--strict-gate']).strictGate, true);
    assert.deepEqual(parseArgs(['--strict-gate', '--ids', 'H16,H17']).ids, ['H16', 'H17']);
});

test('conversation fixtures load with valid schema and compilable patterns (T1.10)', () => {
    const conversations = parseConversations();
    const ids = conversations.map(c => c.id);
    assert.ok(ids.includes('H16') && ids.includes('H17'), `expected H16/H17, got ${ids}`);
    for (const conv of conversations) {
        assert.ok(Array.isArray(conv.turns) && conv.turns.length >= 2, `${conv.id} cần >= 2 lượt`);
        assert.ok(conv.expectation, `${conv.id} thiếu expectation`);
        for (const fact of [...(conv.expectation.required_facts || []), ...(conv.expectation.forbidden_facts || [])]) {
            for (const pattern of fact.patterns || []) compilePattern(pattern); // ném lỗi nếu regex hỏng
        }
    }
});

test('H16 expectation: citizen passport answer passes, deterministic no-data reply hard-fails', () => {
    const h16 = parseConversations().find(c => c.id === 'H16');
    const good = gradeCase(h16.expectation, {
        text: 'Bạn cần trình báo mất hộ chiếu tại Công an cấp xã nơi thuận tiện, sau đó làm thủ tục đề nghị cấp lại hộ chiếu phổ thông.',
        wordCount: 26, truncated: false, error: null, eval: null,
    });
    assert.equal(good.verdict, 'PASS', good.failures.join('; '));

    const deterministic = gradeCase(h16.expectation, {
        text: 'Mình chưa có dữ liệu trụ sở được xác minh cho địa danh này. Vui lòng cung cấp thêm thông tin hoặc kiểm tra lại tên địa danh (xã/phường) nhé.',
        wordCount: 30, truncated: false, error: null, eval: null,
    });
    assert.equal(deterministic.verdict, 'HARD_FAIL');
    assert.ok(deterministic.failures.some(f => f.includes('deterministic_no_data_reply')));

    const reAsked = gradeCase(h16.expectation, {
        text: 'Bạn là công dân Việt Nam hay người nước ngoài để mình hướng dẫn chi tiết nhé?',
        wordCount: 17, truncated: false, error: null, eval: null,
    });
    assert.equal(reAsked.verdict, 'HARD_FAIL', 'hỏi lại quốc tịch sau khi đã trả lời = mất ngữ cảnh');
});

test('H17 expectation: foreigner branch with QLXNC + diplomatic mission passes', () => {
    const h17 = parseConversations().find(c => c.id === 'H17');
    const good = gradeCase(h17.expectation, {
        text: 'Người nước ngoài mất hộ chiếu cần trình báo tại Phòng Quản lý xuất nhập cảnh Công an tỉnh Phú Thọ và liên hệ đại sứ quán/lãnh sự quán nước mình để được cấp giấy tờ thay thế.',
        wordCount: 40, truncated: false, error: null, eval: null,
    });
    assert.equal(good.verdict, 'PASS', good.failures.join('; '));

    const missingEmbassy = gradeCase(h17.expectation, {
        text: 'Bạn hãy đến trình báo tại Phòng Quản lý xuất nhập cảnh Công an tỉnh Phú Thọ để được hướng dẫn tiếp.',
        wordCount: 23, truncated: false, error: null, eval: null,
    });
    assert.equal(missingEmbassy.verdict, 'HARD_FAIL');
    assert.ok(missingEmbassy.failures.some(f => f.includes('diplomatic_mission_contact')));
});
