const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const {
    countWords,
    VERBOSITY_LIMIT_NARROW,
    VERBOSITY_LIMIT_FULL,
} = require('../lib/regression-metrics');
const path = require('node:path');
const {
    parseArgs, parseConversations, conversationGradeOptions, aggregateMajority, summarizeStageTimings,
    computeTotals, unifyRunCases, checkRequiredCredentials,
} = require('../scripts/run-regression');
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

// =======================================================================
// Runner-reliability fix — tất định, KHÔNG gọi network thật (không cần credential).
// =======================================================================

test('T1/T2 (runner-level): computeTotals đếm INFRA_FAIL vào totalProviderErrors → strict-gate exit 1', () => {
    // Mô phỏng đúng path thật của runSingle(): computeTotals() rồi kiểm điều kiện gate,
    // không cần chạy executeSuiteOnce() (network thật) để test logic exit-code.
    const results = [
        { grade: { status: 'INFRA_FAIL', providerError: 'SERVER_CONFIG_ERROR', infraErrorCode: 'SERVER_CONFIG_ERROR' } },
        { grade: { status: 'PASS', providerError: null, infraErrorCode: null } },
    ];
    const { totalHardFail, totalInfraFail, totalProviderErrors } = computeTotals(results, []);
    assert.equal(totalHardFail, 0, 'INFRA_FAIL không phải content hard fail');
    assert.equal(totalInfraFail, 1);
    assert.equal(totalProviderErrors, 1, 'INFRA_FAIL vẫn phải tính vào totalProviderErrors để --strict-gate chặn được');
    // Logic gate y hệt runSingle(): strict-gate + có provider/infra error → phải fail.
    const strictArgs = { strictGate: true };
    let exitCode = 0;
    if (totalHardFail > 0) exitCode = 1;
    if (strictArgs.strictGate && totalProviderErrors > 0) exitCode = 1;
    assert.equal(exitCode, 1, 'strict-gate phải exit khác 0 khi có INFRA_FAIL — không được exit 0/PASS giả');
});

test('T3: 3 runs PASS / INFRA / PASS → FLAKY_INFRA (thiểu số), KHÔNG bị đọc thành majority content regression', () => {
    const perRun = [
        [{ id: 'TR01', verdict: 'PASS' }],
        [{ id: 'TR01', verdict: 'INFRA_FAIL', providerError: 'PINECONE_QUERY_TIMEOUT', infraErrorCode: 'PINECONE_QUERY_TIMEOUT' }],
        [{ id: 'TR01', verdict: 'PASS' }],
    ];
    const { majorityHardFails, majorityInfraFails, flakyInfraFails } = aggregateMajority(perRun, 2);
    assert.deepEqual(majorityHardFails, [], 'không có HARD_FAIL nào — không được coi là content regression');
    assert.deepEqual(majorityInfraFails, [], '1/3 infra là thiểu số, không đạt ngưỡng đa số');
    assert.deepEqual(flakyInfraFails.map(e => e.id), ['TR01']);
});

test('T4: 3 runs INFRA / INFRA / PASS → majority infra failure, gate phải block', () => {
    const perRun = [
        [{ id: 'TR01', verdict: 'INFRA_FAIL', providerError: 'PINECONE_QUERY_TIMEOUT', infraErrorCode: 'PINECONE_QUERY_TIMEOUT' }],
        [{ id: 'TR01', verdict: 'INFRA_FAIL', providerError: 'PINECONE_QUERY_TIMEOUT', infraErrorCode: 'PINECONE_QUERY_TIMEOUT' }],
        [{ id: 'TR01', verdict: 'PASS' }],
    ];
    const { majorityHardFails, majorityInfraFails, flakyInfraFails } = aggregateMajority(perRun, 2);
    assert.deepEqual(majorityHardFails, [], 'lỗi hạ tầng không phải content hard fail — không lẫn vào bucket này');
    assert.deepEqual(majorityInfraFails.map(e => e.id), ['TR01'], '2/3 đạt ngưỡng đa số → phải block');
    assert.deepEqual(flakyInfraFails, []);
    // Logic blocked y hệt runMajority() khi --strict-gate.
    const strictArgs = { strictGate: true };
    const blocked = majorityHardFails.length > 0 || (strictArgs.strictGate && majorityInfraFails.length > 0);
    assert.equal(blocked, true);
});

test('T5: 3 runs HARD_FAIL / HARD_FAIL / PASS → majority content hard fail, gate phải block (hành vi cũ giữ nguyên)', () => {
    const perRun = [
        [{ id: 'TR01', verdict: 'HARD_FAIL', failures: ['missing_required_fact:must_declare'] }],
        [{ id: 'TR01', verdict: 'HARD_FAIL', failures: ['missing_required_fact:must_declare'] }],
        [{ id: 'TR01', verdict: 'PASS' }],
    ];
    const { majorityHardFails } = aggregateMajority(perRun, 2);
    assert.deepEqual(majorityHardFails.map(e => e.id), ['TR01']);
    const blocked = majorityHardFails.length > 0;
    assert.equal(blocked, true, 'majority HARD_FAIL luôn chặn gate, không cần --strict-gate');
});

test('T5b: HARD_FAIL đa số kèm infraErrorCode vẫn giữ HARD_FAIL/BLOCK, nhưng đánh dấu rõ infraFailRuns để report không đọc nhầm', () => {
    // Case thật đã điều tra: Pinecone timeout bị nuốt, model vẫn sinh ungrounded content.
    const perRun = [
        [{ id: 'TR01', verdict: 'HARD_FAIL', infraErrorCode: 'PINECONE_QUERY_TIMEOUT', failures: ['ungrounded_fact:must_declare'] }],
        [{ id: 'TR01', verdict: 'HARD_FAIL', infraErrorCode: 'PINECONE_QUERY_TIMEOUT', failures: ['ungrounded_fact:must_declare'] }],
        [{ id: 'TR01', verdict: 'PASS' }],
    ];
    const { majorityHardFails } = aggregateMajority(perRun, 2);
    assert.deepEqual(majorityHardFails.map(e => e.id), ['TR01']);
    const row = majorityHardFails[0];
    assert.equal(row.infraFailRuns.length, 2, 'cả 2 run HARD_FAIL đều kèm infraErrorCode — phải lộ ra trong report');
});

test('T6 (runner-level): unifyRunCases mang infraErrorCode từ grade sang aggregateMajority', () => {
    const results = [{ id: 'TR01', grade: { status: 'INFRA_FAIL', providerError: 'SERVER_CONFIG_ERROR', infraErrorCode: 'SERVER_CONFIG_ERROR', failures: [] } }];
    const unified = unifyRunCases({ results, conversationResults: [] });
    assert.equal(unified[0].infraErrorCode, 'SERVER_CONFIG_ERROR');
});

test('T7: parseArgs hiện có không hỏng — flag cũ vẫn hoạt động y hệt sau fix (regression-runner-reliability không đổi CLI)', () => {
    assert.equal(parseArgs([]).strictGate, false);
    assert.equal(parseArgs([]).majority, false);
    assert.equal(parseArgs([]).runs, 1);
    assert.deepEqual(parseArgs(['--ids', 'TR01,TR02']).ids, ['TR01', 'TR02']);
    assert.equal(parseArgs(['--delay-ms', '500']).delayMs, 500);
});

test('T8: canonical live-gate command (npm run regression:live) resolve đúng strict + majority + 3 run', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf-8'));
    const liveScript = pkg.scripts['regression:live'];
    assert.ok(liveScript, 'package.json cần script "regression:live" — canonical command cho live merge gate');
    assert.match(liveScript, /^node scripts\/run-regression\.js /);
    // Parse chính argv mà npm script đó thực thi để xác nhận nó thật sự bật đủ 3 cờ.
    const argv = liveScript.replace(/^node scripts\/run-regression\.js /, '').trim().split(/\s+/);
    const resolved = parseArgs(argv);
    assert.equal(resolved.strictGate, true);
    assert.equal(resolved.majority, true);
    assert.equal(resolved.runs, 3);
    // Single-run debug command vẫn giữ nguyên, không bị canonical command ảnh hưởng.
    assert.equal(parseArgs([]).strictGate, false);
    assert.equal(parseArgs([]).majority, false);
});

test('T9: checkRequiredCredentials không bao giờ in giá trị credential thật, chỉ SET/UNSET', () => {
    const fakeSecretValue = 'sk-super-secret-do-not-log-1234567890';
    const withCred = checkRequiredCredentials({ GEMINI_API_KEY: fakeSecretValue, PINECONE_API_KEY: fakeSecretValue });
    for (const line of withCred.status) {
        assert.ok(/^[A-Z_]+: (SET|UNSET)$/.test(line), `dòng report phải đúng dạng "NAME: SET|UNSET", thực tế: "${line}"`);
        assert.ok(!line.includes(fakeSecretValue), 'KHÔNG được in giá trị credential thật ra report');
    }
    assert.equal(withCred.ok, true);

    const missing = checkRequiredCredentials({});
    assert.equal(missing.ok, false);
    assert.deepEqual(missing.missing, ['GEMINI_API_KEY']);
    for (const line of missing.status) {
        assert.ok(/^[A-Z_]+: (SET|UNSET)$/.test(line));
    }
});

test('checkRequiredCredentials: PINECONE/DEEPSEEK chỉ thông tin, không chặn preflight (topology fallback)', () => {
    // Chỉ GEMINI_API_KEY bị api/chat.js chặn cứng bằng SERVER_CONFIG_ERROR trước mọi nhánh
    // provider (dùng tối thiểu cho embedding) — Pinecone/DeepSeek đều có đường graceful-degrade
    // theo topology hiện tại, nên preflight không được chặn cứng chỉ vì hai biến này UNSET.
    const geminiOnly = checkRequiredCredentials({ GEMINI_API_KEY: 'set' });
    assert.equal(geminiOnly.ok, true);
    assert.ok(geminiOnly.status.includes('PINECONE_API_KEY: UNSET'));
    assert.ok(geminiOnly.status.includes('DEEPSEEK_API_KEY: UNSET'));
});
