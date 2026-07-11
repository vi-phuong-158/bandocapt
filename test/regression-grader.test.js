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

// --------------------------------------------------------------------
// T1.8 — chống false-positive của bộ chấm (đối chứng từ baseline T1.7).
// Các chuỗi answer dưới đây là NGUYÊN VĂN câu bot trả lời trong run 1
// (test/results/regression-run-2026-07-11_06-31-01.md) từng bị chấm oan.
// --------------------------------------------------------------------
test('T1.8 forbidden negation-aware: GV01 phủ định đúng KHÔNG bị bắt, khẳng định sai VẪN bị bắt', () => {
    // Run 1: bot trả đúng "không thuộc Công an xã/phường" nhưng dính forbidden_fact:wrong_ward_authority.
    const correct = gradeDeterministic(EXPECTATIONS.cases.GV01, {
        text: '**Nộp tại Phòng Quản lý xuất nhập cảnh - Công an tỉnh Phú Thọ.** Thủ tục này không thuộc Công an xã/phường.',
        wordCount: 25,
    });
    assert.ok(!correct.hardFailures.some(f => f.startsWith('forbidden_fact:')), `bắt oan: ${correct.hardFailures}`);

    const wrong = gradeDeterministic(EXPECTATIONS.cases.GV01, {
        text: 'Bạn nộp hồ sơ gia hạn visa tại Công an phường nơi cư trú. Phòng Quản lý xuất nhập cảnh không xử lý.',
        wordCount: 25,
    });
    assert.ok(wrong.hardFailures.includes('forbidden_fact:wrong_ward_authority'));
});

test('T1.8 forbidden negation-aware: GV06 "Không nộp tại Công an phường" là câu ĐÚNG', () => {
    const correct = gradeDeterministic(EXPECTATIONS.cases.GV06, {
        text: '**Không nộp tại Công an phường — thủ tục gia hạn visa thuộc thẩm quyền của Phòng Quản lý xuất nhập cảnh Công an tỉnh.**',
        wordCount: 25,
    });
    assert.ok(!correct.hardFailures.some(f => f.startsWith('forbidden_fact:')), `bắt oan: ${correct.hardFailures}`);

    const wrong = gradeDeterministic(EXPECTATIONS.cases.GV06, {
        text: 'Được, bạn nộp tại Công an phường Thanh Miếu, Công an phường sẽ tiếp nhận hồ sơ gia hạn.',
        wordCount: 20,
    });
    assert.ok(wrong.hardFailures.includes('forbidden_fact:ward_accepts_extension'));
});

test('T1.8 required nới diễn đạt tương đương: VP06 "không có hình thức lùi ngày" và DN02 "không miễn nghĩa vụ" đạt', () => {
    const vp06 = gradeDeterministic(EXPECTATIONS.cases.VP06, {
        text: 'Theo quy định hiện hành, **không có hình thức "khai báo lùi ngày"** — bạn buộc phải khai báo tạm trú đúng thời điểm.',
        wordCount: 25,
    });
    assert.ok(!vp06.hardFailures.includes('missing_required_fact:refuse_backdating'), `${vp06.hardFailures}`);

    const dn02 = gradeDeterministic(EXPECTATIONS.cases.DN02, {
        text: '**Có, phải khai báo.** Việc có giấy phép lao động không miễn nghĩa vụ khai báo tạm trú cho người nước ngoài.',
        wordCount: 25,
    });
    assert.ok(!dn02.hardFailures.includes('missing_required_fact:work_permit_does_not_replace'), `${dn02.hardFailures}`);
});

test('T1.8 TL01 mã hóa lại: trả hạn 12/24h thẳng → đạt; nhầm sang "thời gian xử lý" → forbidden', () => {
    // Ý định T1.1: chỉ fail khi bot NHẦM hạn khai báo với thời gian xử lý, không bắt
    // câu trả lời đúng phải chứa cụm "phân biệt" tường minh.
    const plain = gradeDeterministic(EXPECTATIONS.cases.TL01, {
        text: '**Trong 12 giờ** đối với địa bàn thông thường, hoặc **24 giờ** đối với vùng sâu, vùng xa, kể từ khi người nước ngoài đến.',
        wordCount: 25,
    });
    assert.equal(plain.hardFailures.length, 0, `${plain.hardFailures}`);

    const confused = gradeDeterministic(EXPECTATIONS.cases.TL01, {
        text: 'Cơ quan Công an sẽ xử lý hồ sơ khai báo trong 12 giờ làm việc; vùng sâu, vùng xa là 24 giờ.',
        wordCount: 25,
    });
    assert.ok(confused.hardFailures.includes('forbidden_fact:deadline_confused_with_processing'), `${confused.hardFailures}`);
});

test('T1.8 grounding_patterns: EV07 trả tiếng Trung, docs tiếng Việt → dò bằng pattern Việt, không còn ungrounded oan', () => {
    const trace = {
        matchedDocs: 'Thủ tục cấp thị thực điện tử theo đề nghị của người nước ngoài, nộp trực tuyến qua Cổng dịch vụ công.',
        matchesFinal: [{ procedure_id: '5568-tw-06', source_file: '5568/QD-BCA', rank: 1 }],
    };
    const out = gradeGrounding(EXPECTATIONS.cases.EV07, trace, {
        text: '**可以。** 外国人可在线申请越南电子签证（e-visa）。',
    });
    assert.equal(out.groundingFailures.length, 0, `${out.groundingFailures}`);
});

test('T1.8 grounding_patterns: docs KHÔNG có bằng chứng → vẫn ungrounded (không mất khả năng bắt hallucination)', () => {
    const trace = {
        matchedDocs: 'Tài liệu chỉ nói về đăng ký xe máy, hoàn toàn không liên quan.',
        matchesFinal: [{ procedure_id: '5568-tw-06', source_file: '5568/QD-BCA', rank: 1 }],
    };
    const out = gradeGrounding(EXPECTATIONS.cases.EV07, trace, {
        text: '**可以。** 外国人可在线申请越南电子签证（e-visa）。',
    });
    assert.ok(out.groundingFailures.includes('ungrounded_fact:chinese_evisa'));
});

test('T1.8 grounding_patterns: ON01 docs diễn đạt khác câu trả lời vẫn được coi là có căn cứ', () => {
    const trace = {
        matchedDocs: 'Hướng dẫn khai báo tạm trú cho người nước ngoài qua trang kbtt.xuatnhapcanh.gov.vn dành cho cơ sở lưu trú.',
        matchesFinal: [{ procedure_id: 'matt26265', source_file: 'KBTT_HD_Trang_CSLT_v2.0.pdf', rank: 1 }],
    };
    const out = gradeGrounding(EXPECTATIONS.cases.ON01, trace, {
        text: '**Có, được.** Cơ sở lưu trú khai báo tạm trú trực tuyến qua hệ thống KBTT.',
    });
    assert.equal(out.groundingFailures.length, 0, `${out.groundingFailures}`);
});
