'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const {
    loadExpectations,
    factMatches,
    detectLanguage,
    gradeDeterministic,
    gradeGrounding,
    classifyVerdict,
    gradeCase,
} = require('../lib/regression-grader');

const EXPECTATIONS = loadExpectations();

// Bảo vệ tích hợp: ID trong bảng 30 câu phải khớp đúng key expectations, nếu không
// runner sẽ âm thầm bỏ chấm ca lệch (evaluateCase trả null).
test('30 ID trong bảng câu hỏi khớp đúng key expectations', () => {
    const md = fs.readFileSync(
        path.resolve(__dirname, 'cau-hoi/bo-test-regression-30-cau-nguoi-nuoc-ngoai-tthc.md'), 'utf-8');
    const ids = [];
    let inside = false;
    for (const line of md.split('\n')) {
        if (line.trim().startsWith('| STT |')) { inside = true; continue; }
        if (inside && line.trim().startsWith('|---')) continue;
        if (inside && line.trim() === '') break;
        if (!inside) continue;
        const parts = line.split('|').map(s => s.trim());
        if (parts.length >= 7) ids.push(parts[2].replace(/`/g, ''));
    }
    assert.deepEqual(new Set(ids), new Set(Object.keys(EXPECTATIONS.cases)));
    assert.equal(ids.length, 30);
});

// --------------------------------------------------------------------
// Nạp expectations
// --------------------------------------------------------------------
test('loadExpectations: đủ 30 ca, F01 deferred, TL01 active', () => {
    const ids = Object.keys(EXPECTATIONS.cases);
    assert.equal(ids.length, 30);
    assert.equal(EXPECTATIONS.cases.F01.status, 'DEFERRED_SOURCE_GOVERNANCE');
    assert.equal(EXPECTATIONS.cases.TL01.status, 'ACTIVE');
});

// --------------------------------------------------------------------
// detectLanguage
// --------------------------------------------------------------------
test('detectLanguage phân biệt vi/en/zh', () => {
    assert.equal(detectLanguage('Bạn phải khai báo tạm trú tại Công an phường.'), 'vi');
    assert.equal(detectLanguage('You must declare temporary residence at the ward police station.'), 'en');
    assert.equal(detectLanguage('您必须在线申请电子签证。'), 'zh');
});

test('detectLanguage: câu tiếng Anh có tên riêng tiếng Việt vẫn là en', () => {
    // TR09/LOC07: trả lời tiếng Anh nhưng nhắc "Công an Phường Thanh Miếu"
    assert.equal(detectLanguage('Please go to Công an Phường Thanh Miếu to declare your temporary residence.'), 'en');
});

// --------------------------------------------------------------------
// factMatches
// --------------------------------------------------------------------
test('factMatches: all cần mọi pattern, any cần ít nhất một', () => {
    const allFact = { match: 'all', patterns: ['24\\s*giờ', 'vùng sâu|vùng xa'] };
    assert.equal(factMatches(allFact, 'Trong 24 giờ tại vùng sâu vùng xa.'), true);
    assert.equal(factMatches(allFact, 'Trong 24 giờ.'), false); // thiếu "vùng sâu/xa"
    const anyFact = { match: 'any', patterns: ['\\bNA6\\b', '\\bNA7\\b', '\\bNA8\\b'] };
    assert.equal(factMatches(anyFact, 'Chuẩn bị mẫu NA8.'), true);
    assert.equal(factMatches(anyFact, 'Chuẩn bị mẫu NA5.'), false);
});

// --------------------------------------------------------------------
// LỚP 1 — deterministic
// --------------------------------------------------------------------
test('gradeDeterministic: thiếu required fact → hard failure', () => {
    const out = gradeDeterministic(EXPECTATIONS.cases.TL01, {
        text: 'Thời hạn khai báo là 12 giờ.', // thiếu 24 giờ + vùng sâu/xa + phân biệt xử lý
        wordCount: 8,
    });
    assert.ok(out.hardFailures.some(f => f.startsWith('missing_required_fact:twenty_four_hours_remote')));
});

test('gradeDeterministic: forbidden fact khớp → hard failure', () => {
    const out = gradeDeterministic(EXPECTATIONS.cases.F01, {
        text: 'Bạn điền phiếu khai báo tạm trú mẫu NA17 và nộp trực tiếp.',
        wordCount: 12,
    });
    assert.ok(out.hardFailures.some(f => f === 'forbidden_fact:obsolete_paper_flow'));
});

test('gradeDeterministic: sai ngôn ngữ → hard failure', () => {
    const out = gradeDeterministic(EXPECTATIONS.cases.TR09, {
        text: 'Bạn hãy đến Công an Phường Thanh Miếu để khai báo tạm trú nhé.', // đáng lẽ tiếng Anh
        wordCount: 12,
    });
    assert.equal(out.languageOk, false);
    assert.ok(out.hardFailures.some(f => f.startsWith('wrong_language')));
});

test('gradeDeterministic: verbosity là soft warning, không hard fail', () => {
    const out = gradeDeterministic(EXPECTATIONS.cases.ON01, {
        text: 'Bạn có thể khai báo tạm trú trực tuyến online.',
        wordCount: 999, // vượt budget 120
    });
    assert.ok(out.softWarnings.includes('VERBOSITY'));
    assert.equal(out.hardFailures.length, 0);
});

test('gradeDeterministic: globalForbidden khớp → hard failure (guard xuyên suốt)', () => {
    const out = gradeDeterministic(EXPECTATIONS.cases.TR01, {
        text: 'Bạn dùng VNeID để khai báo.', wordCount: 6,
    }, { globalForbidden: [{ label: 'no VNeID', pattern: /\bvneid\b/i }] });
    assert.ok(out.hardFailures.some(f => f === 'global_forbidden:no VNeID'));
});

test('gradeDeterministic: lỗi provider báo riêng, không hard fail', () => {
    const out = gradeDeterministic(EXPECTATIONS.cases.TR01, {
        text: '', error: 'BLOCKED_CONTENT', wordCount: 0,
    });
    assert.equal(out.providerError, 'BLOCKED_CONTENT');
    // câu rỗng → không chấm ngôn ngữ; required facts thiếu vẫn ghi nhận nhưng verdict xử lý riêng
});

// --------------------------------------------------------------------
// LỚP 2 — grounding
// --------------------------------------------------------------------
const EVAL_TRACE_GOOD = {
    matchedDocs: '[Tài liệu 1] Người nước ngoài phải khai báo tạm trú tại Công an phường nơi lưu trú.',
    matchesFinal: [
        { procedure_id: 'tthc_matt26265', source_file: 'KBTT_HD_Trang_CSLT_v2.0.pdf', rank: 1 },
        { procedure_id: 'other-1', source_file: 'x.pdf', rank: 2 },
    ],
};

test('gradeGrounding: Recall@4 và MRR cho procedure kỳ vọng (khớp mềm matt26265 ⊆ tthc_matt26265)', () => {
    const out = gradeGrounding(EXPECTATIONS.cases.TR01, EVAL_TRACE_GOOD, {
        text: 'Bạn phải khai báo tạm trú tại xã/phường nơi lưu trú.',
    });
    assert.equal(out.recallAt4, 1);
    assert.equal(out.mrr, 1); // hạng 1
    assert.equal(out.sourceRecall, 1);
    assert.equal(out.groundingFailures.length, 0);
});

test('gradeGrounding: fact khẳng định trong answer nhưng KHÔNG có trong docs → ungrounded', () => {
    const evalTrace = {
        matchedDocs: '[Tài liệu 1] Nội dung không liên quan đến nghĩa vụ khai báo.',
        matchesFinal: [{ procedure_id: 'tthc_matt26265', source_file: 'KBTT_HD_Trang_CSLT_v2.0.pdf', rank: 1 }],
    };
    const out = gradeGrounding(EXPECTATIONS.cases.TR01, evalTrace, {
        text: 'Bạn phải khai báo tạm trú ngay.', // khẳng định fact nhưng docs không có
    });
    assert.ok(out.groundingFailures.some(f => f === 'ungrounded_fact:must_declare'));
});

test('gradeGrounding: trả null khi không có eval trace', () => {
    assert.equal(gradeGrounding(EXPECTATIONS.cases.TR01, null, { text: 'x' }), null);
});

test('gradeGrounding: recall thấp khi procedure không có trong top-4', () => {
    const evalTrace = {
        matchedDocs: 'abc',
        matchesFinal: [{ procedure_id: 'khong-lien-quan', source_file: 'z.pdf', rank: 1 }],
    };
    const out = gradeGrounding(EXPECTATIONS.cases.TR01, evalTrace, { text: 'x' });
    assert.equal(out.recallAt4, 0);
    assert.equal(out.mrr, 0);
});

// --------------------------------------------------------------------
// classifyVerdict + gradeCase
// --------------------------------------------------------------------
test('classifyVerdict: F01 fail → DEFERRED_FAIL, không phải HARD_FAIL', () => {
    const det = { hardFailures: ['forbidden_fact:obsolete_paper_flow'] };
    const v = classifyVerdict(EXPECTATIONS.cases.F01, det, null);
    assert.equal(v.verdict, 'DEFERRED_FAIL');
    assert.equal(v.isDeferred, true);
});

test('classifyVerdict: ca ACTIVE fail → HARD_FAIL', () => {
    const det = { hardFailures: ['forbidden_fact:x'] };
    const v = classifyVerdict(EXPECTATIONS.cases.TR01, det, null);
    assert.equal(v.verdict, 'HARD_FAIL');
});

test('gradeCase end-to-end: ca sạch → PASS + metric grounding đầy đủ', () => {
    const graded = gradeCase(EXPECTATIONS.cases.TR01, {
        text: 'Bạn phải khai báo tạm trú tại xã/phường nơi lưu trú (địa chỉ lưu trú cụ thể).',
        wordCount: 20,
        truncated: false,
        error: null,
        eval: EVAL_TRACE_GOOD,
    });
    assert.equal(graded.verdict, 'PASS');
    assert.equal(graded.failures.length, 0);
    assert.equal(graded.grounding.recallAt4, 1);
    assert.equal(graded.language.detected, 'vi');
});

test('gradeCase end-to-end: F01 dùng phiếu giấy → DEFERRED_FAIL (không kéo hard gate)', () => {
    const graded = gradeCase(EXPECTATIONS.cases.F01, {
        text: 'Bạn điền phiếu khai báo tạm trú NA17 và nộp trực tiếp tại xã/phường.',
        wordCount: 15,
        truncated: false,
        error: null,
        eval: EVAL_TRACE_GOOD,
    });
    assert.equal(graded.verdict, 'DEFERRED_FAIL');
    assert.ok(graded.isDeferred);
});
