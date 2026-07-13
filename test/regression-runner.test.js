const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const {
    countWords,
    VERBOSITY_LIMIT_NARROW,
    VERBOSITY_LIMIT_FULL,
} = require('../lib/regression-metrics');
const { parseArgs, parseConversations, conversationGradeOptions, aggregateMajority, summarizeStageTimings } = require('../scripts/run-regression');
const { gradeCase, compilePattern } = require('../lib/regression-grader');

test('regression word count handles whitespace and CJK text', () => {
    assert.equal(countWords('A short English answer.'), 4);
    assert.ok(countWords('您必须在12小时内申报。然后等待系统确认。') > 1);
});

test('regression verbosity limits match the answer-first prompt budgets', () => {
    assert.equal(VERBOSITY_LIMIT_NARROW, 120);
    assert.equal(VERBOSITY_LIMIT_FULL, 250);
    const chatSource = fs.readFileSync(require.resolve('../api/chat'), 'utf8');
    assert.match(chatSource, /TỐI ĐA 250 TỪ/);
    assert.match(chatSource, /tự rút gọn nếu vượt giới hạn/);
});

test('T2 review summarizes eval stage timing with median and p95', () => {
    const rows = summarizeStageTimings([
        { eval: { timings: { generation_ms: 100 } } },
        { eval: { timings: { generation_ms: 300 } } },
        { eval: { timings: { generation_ms: 200 } } },
    ]);
    const generation = rows.find(row => row.stage === 'generation_ms');
    assert.deepEqual(generation, { stage: 'generation_ms', samples: 3, median: 200, p95: 300 });
});

test('--strict-gate flag is parsed, default stays lenient (T1.10)', () => {
    assert.equal(parseArgs([]).strictGate, false);
    assert.equal(parseArgs(['--strict-gate']).strictGate, true);
    assert.deepEqual(parseArgs(['--strict-gate', '--ids', 'H16,H17']).ids, ['H16', 'H17']);
});

test('--majority / --runs flags (T1.11)', () => {
    // Mặc định: 1 run, không đa số.
    assert.equal(parseArgs([]).runs, 1);
    assert.equal(parseArgs([]).majority, false);
    // --majority không nêu runs → mặc định 3 (đa số 2/3).
    assert.equal(parseArgs(['--majority']).runs, 3);
    assert.equal(parseArgs(['--majority']).majority, true);
    // --runs > 1 tự bật đa số.
    assert.equal(parseArgs(['--runs', '5']).runs, 5);
    assert.equal(parseArgs(['--runs', '5']).majority, true);
    assert.equal(parseArgs(['--runs=3']).runs, 3);
});

test('aggregateMajority: rớt ≥ ngưỡng = hard fail thật, rớt lẻ = flaky (T1.11)', () => {
    const perRun = [
        [{ id: 'A', verdict: 'HARD_FAIL', failures: ['a1'] }, { id: 'B', verdict: 'PASS' }, { id: 'C', verdict: 'HARD_FAIL', failures: ['c1'] }],
        [{ id: 'A', verdict: 'HARD_FAIL', failures: ['a2'] }, { id: 'B', verdict: 'HARD_FAIL', failures: ['b1'] }, { id: 'C', verdict: 'PASS' }],
        [{ id: 'A', verdict: 'PASS' }, { id: 'B', verdict: 'PASS' }, { id: 'C', verdict: 'PASS' }],
    ];
    const out = aggregateMajority(perRun, 2);
    // A rớt 2/3 → hard fail thật; B & C rớt 1/3 → flaky (không chặn).
    assert.deepEqual(out.majorityHardFails.map(e => e.id), ['A']);
    assert.deepEqual(out.flakyHardFails.map(e => e.id).sort(), ['B', 'C']);
    // Ma trận verdict giữ đúng ký hiệu theo từng run.
    const a = out.rows.find(e => e.id === 'A');
    assert.deepEqual(a.verdicts, ['F', 'F', '.']);
    assert.equal(a.failuresByRun.length, 2);
});

test('aggregateMajority: provider error đa số vs lẻ tẻ tách riêng (T1.11)', () => {
    const perRun = [
        [{ id: 'X', verdict: 'PASS', providerError: 'BLOCKED_CONTENT' }, { id: 'Y', verdict: 'PASS', providerError: 'BLOCKED_CONTENT' }],
        [{ id: 'X', verdict: 'PASS', providerError: 'BLOCKED_CONTENT' }, { id: 'Y', verdict: 'PASS' }],
        [{ id: 'X', verdict: 'PASS' }, { id: 'Y', verdict: 'PASS' }],
    ];
    const out = aggregateMajority(perRun, 2);
    assert.deepEqual(out.majorityProvErrs.map(e => e.id), ['X']); // 2/3
    assert.deepEqual(out.flakyProvErrs.map(e => e.id), ['Y']);    // 1/3
    assert.deepEqual(out.majorityHardFails, []);                  // provider error KHÔNG phải content hard fail
    assert.equal(out.rows.find(e => e.id === 'X').verdicts[0], 'E');
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

test('H16 nhánh công dân tắt global forbidden: nhắc VNeID/Cổng DVC là hợp lệ (T1.11)', () => {
    const conversations = parseConversations();
    const h16 = conversations.find(c => c.id === 'H16');
    const h17 = conversations.find(c => c.id === 'H17');
    assert.deepEqual(conversationGradeOptions(h16), {}, 'H16 công dân không áp global forbidden');
    assert.ok(Array.isArray(conversationGradeOptions(h17).globalForbidden), 'H17 người nước ngoài giữ global forbidden');

    // Nguyên văn ý chính câu trả lời ĐÚNG của bot (chuỗi 2 run 1) có nhắc VNeID.
    const answer = '**Bạn cần trình báo mất hộ chiếu ngay.** Đơn trình báo mẫu TK05, nộp trực tiếp tại Cơ quan Quản lý xuất nhập cảnh Công an cấp tỉnh, hoặc qua Cổng Dịch vụ công quốc gia / VNeID. Lệ phí trình báo: miễn phí; cấp lại hộ chiếu 400.000 đồng.';
    const graded = gradeCase(h16.expectation, {
        text: answer, wordCount: 55, truncated: false, error: null, eval: null,
    }, conversationGradeOptions(h16));
    assert.equal(graded.verdict, 'PASS', graded.failures.join('; '));
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
