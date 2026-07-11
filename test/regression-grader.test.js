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

// --------------------------------------------------------------------
// T1.11: fixture nguyên văn từ baseline T1.7b — 3 ca fail bền vững do THƯỚC ĐO.
// --------------------------------------------------------------------
test('T1.11 LOC07: trả lời tiếng Anh chứa địa chỉ trụ sở tiếng Việt phải được nhận là en', () => {
    // Nguyên văn bot trả lời (fail wrong_language cả 3/3 run baseline T1.7b).
    // Kỳ vọng gốc chính là "Trả tiếng Anh, tên trụ sở tiếng Việt" — địa chỉ Việt là BẮT BUỘC.
    const answer = [
        '**Công an Phường Thanh Miếu (Thanh Miếu Ward Police)**',
        '',
        '- 📍 Address: Số 1028 Đường Hùng Vương, phường Thanh Miếu, tỉnh Phú Thọ',
        '- ☎️ Phone: 02103863928',
        '- 🕒 Working hours: Not available in data',
        '- [📍 Google Maps](https://www.google.com/maps/search/?api=1&query=21.304528,105.415528)',
    ].join('\n');
    assert.equal(detectLanguage(answer), 'en');

    const graded = gradeDeterministic(EXPECTATIONS.cases.LOC07, { text: answer, wordCount: 39 });
    assert.equal(graded.hardFailures.length, 0, `${graded.hardFailures}`);

    // Chiều ngược: trả lời thuần tiếng Việt cho câu hỏi tiếng Anh VẪN bị bắt wrong_language.
    const viAnswer = 'Trụ sở Công an Phường Thanh Miếu nằm tại số 1028 Đường Hùng Vương, bạn có thể đến trực tiếp để được hướng dẫn thủ tục nhé.';
    const gradedVi = gradeDeterministic(EXPECTATIONS.cases.LOC07, { text: viAnswer, wordCount: 26 });
    assert.ok(gradedVi.hardFailures.some(f => f.startsWith('wrong_language')), `${gradedVi.hardFailures}`);
});

test('T1.11 TR01: câu trả lời hẹp đúng luật không còn bị bắt ask_location vô điều kiện', () => {
    // Nguyên văn bot (fail missing_required_fact:ask_location 3/3 run): thủ tục kbtt là
    // TRỰC TUYẾN, chế độ hẹp 120 từ — không bắt buộc hỏi xã/phường.
    const answer = '**Có, phải khai báo tạm trú.** Mọi người nước ngoài đến lưu trú tại Việt Nam đều phải được khai báo tạm trú trong thời hạn 12 giờ (địa bàn thông thường) hoặc 24 giờ (vùng sâu, vùng xa) kể từ khi đến.\n\nBạn cần mình hướng dẫn đầy đủ hồ sơ và cách thực hiện không?';
    const graded = gradeDeterministic(EXPECTATIONS.cases.TR01, { text: answer, wordCount: 57 });
    assert.equal(graded.hardFailures.length, 0, `${graded.hardFailures}`);

    // must_declare vẫn là hàng rào cứng: thiếu kết luận "phải khai báo" → fail như cũ.
    const evasive = gradeDeterministic(EXPECTATIONS.cases.TR01, {
        text: 'Khách Trung Quốc ở 3 ngày thì bạn nên tham khảo quy định về cư trú.', wordCount: 16,
    });
    assert.ok(evasive.hardFailures.includes('missing_required_fact:must_declare'), `${evasive.hardFailures}`);
});

test('T1.11 TT01: RAG đủ dữ liệu → trả trọn hồ sơ không cần ask_eligibility, budget 350 hết VERBOSITY lặp', () => {
    assert.equal(EXPECTATIONS.cases.TT01.verbosity_budget, 350);
    const answer = 'Hồ sơ gồm văn bản đề nghị mẫu NA6 (tổ chức) hoặc NA7 (cá nhân bảo lãnh), tờ khai NA8, hộ chiếu và giấy tờ chứng minh mục đích cư trú. Nộp tại Phòng Quản lý xuất nhập cảnh.';
    const graded = gradeDeterministic(EXPECTATIONS.cases.TT01, { text: answer, wordCount: 40 });
    assert.equal(graded.hardFailures.length, 0, `${graded.hardFailures}`);

    // Thiếu hẳn mẫu NA6/NA7/NA8 → vẫn fail required như cũ.
    const missingForms = gradeDeterministic(EXPECTATIONS.cases.TT01, {
        text: 'Bạn cần chuẩn bị hồ sơ và nộp tại cơ quan quản lý xuất nhập cảnh.', wordCount: 15,
    });
    assert.ok(missingForms.hardFailures.includes('missing_required_fact:temporary_residence_card_documents'), `${missingForms.hardFailures}`);
});

test('T1.11 KC04: chỉ bắt hỏi lại quốc tịch khi câu hỏi chưa rõ đối tượng', () => {
    // Nguyên văn bot trong baseline: chỉ hỏi lại quốc tịch bằng tiếng Anh → giờ phải PASS.
    const graded = gradeDeterministic(EXPECTATIONS.cases.KC04, {
        text: 'Are you a foreign national or a Vietnamese citizen? This determines which procedure applies to your lost passport.',
        wordCount: 18,
    });
    assert.equal(graded.hardFailures.length, 0, `${graded.hardFailures}`);

    // Không hỏi làm rõ mà đi thẳng vào phán đoán → thiếu ask_nationality, fail.
    const noClarify = gradeDeterministic(EXPECTATIONS.cases.KC04, {
        text: 'You should go to the nearest police station immediately and report the loss.',
        wordCount: 13,
    });
    assert.ok(noClarify.hardFailures.includes('missing_required_fact:ask_nationality'), `${noClarify.hardFailures}`);
});

// --------------------------------------------------------------------
// T1.11 run-1: 5 ca abstain/diễn-đạt-tương-đương bị bắt oan + provider error.
// Fixture là NGUYÊN VĂN câu bot trả lời trong run 2026-07-11_11-54-09.
// --------------------------------------------------------------------
test('T1.11 TR05: abstain đúng bằng diễn đạt tương đương phải PASS, phán mức phạt bịa vẫn bị bắt', () => {
    const abstain = gradeDeterministic(EXPECTATIONS.cases.TR05, {
        text: 'Theo dữ liệu hiện có, mình chưa có thông tin về mức xử phạt khi khai báo tạm trú cho người nước ngoài quá hạn. Việc chậm 2 ngày là vi phạm thời hạn, nhưng mức phạt cụ thể không nằm trong tài liệu mình có.',
        wordCount: 45,
    });
    assert.equal(abstain.hardFailures.length, 0, `${abstain.hardFailures}`);

    const inventedFine = gradeDeterministic(EXPECTATIONS.cases.TR05, {
        text: 'Bạn sẽ bị phạt từ 4.000.000 đến 6.000.000 đồng vì chậm khai báo tạm trú.',
        wordCount: 17,
    });
    assert.ok(inventedFine.hardFailures.some(f => f.includes('ungrounded_fine') || f.includes('no_unsupported_fine')), `${inventedFine.hardFailures}`);
});

test('T1.11 GV02: vai trò doanh nghiệp qua "ký số/xác nhận" đủ sponsor_context, thiếu hẳn vẫn fail', () => {
    const good = gradeDeterministic(EXPECTATIONS.cases.GV02, {
        text: '**Mẫu NA5** – mục III phải điền đầy đủ; người nước ngoài tự ký, chữ ký trùng với hộ chiếu; doanh nghiệp ký số phần xác nhận.',
        wordCount: 30,
    });
    assert.ok(!good.hardFailures.includes('missing_required_fact:sponsor_context'), `${good.hardFailures}`);

    const noSponsor = gradeDeterministic(EXPECTATIONS.cases.GV02, {
        text: 'Bạn cần chuẩn bị mẫu NA5 và hộ chiếu còn hạn rồi nộp tại Phòng Quản lý xuất nhập cảnh.',
        wordCount: 20,
    });
    assert.ok(noSponsor.hardFailures.includes('missing_required_fact:sponsor_context'), `${noSponsor.hardFailures}`);
});

test('T1.11 DN02: "không có ngoại lệ về giấy phép lao động" là chính ý không-thay-thế', () => {
    const good = gradeDeterministic(EXPECTATIONS.cases.DN02, {
        text: '**Có, lao động nước ngoài có giấy phép lao động vẫn phải khai báo tạm trú.** Quy định này áp dụng cho mọi trường hợp người nước ngoài đến lưu trú tại Việt Nam, không có ngoại lệ về giấy phép lao động.',
        wordCount: 45,
    });
    assert.equal(good.hardFailures.length, 0, `${good.hardFailures}`);

    const wrong = gradeDeterministic(EXPECTATIONS.cases.DN02, {
        text: 'Đã có giấy phép lao động thì không cần khai báo tạm trú nữa.',
        wordCount: 14,
    });
    assert.ok(wrong.hardFailures.length > 0, `${wrong.hardFailures}`);

    // Chuỗi 2 run 1: paraphrase thứ 3 "không phân biệt có giấy phép lao động hay chưa".
    const paraphrase = gradeDeterministic(EXPECTATIONS.cases.DN02, {
        text: '**Có, vẫn phải khai báo tạm trú.** Quy định áp dụng cho mọi người nước ngoài lưu trú tại Việt Nam, không phân biệt có giấy phép lao động hay chưa.',
        wordCount: 33,
    });
    assert.equal(paraphrase.hardFailures.length, 0, `${paraphrase.hardFailures}`);
});

test('T1.11 VP06: "không có quy định cho phép khai báo lùi ngày" là lời từ chối hợp lệ', () => {
    const good = gradeDeterministic(EXPECTATIONS.cases.VP06, {
        text: '**Không, không có quy định cho phép khai báo lùi ngày tạm trú.** Việc khai báo tạm trú phải được thực hiện đúng thời hạn theo quy định của pháp luật.',
        wordCount: 32,
    });
    assert.equal(good.hardFailures.length, 0, `${good.hardFailures}`);

    const badAdvice = gradeDeterministic(EXPECTATIONS.cases.VP06, {
        text: 'Bạn có thể khai lùi ngày bằng cách sửa ngày đến để tránh bị phạt.',
        wordCount: 16,
    });
    assert.ok(badAdvice.hardFailures.some(f => f.includes('backdating_instructions')), `${badAdvice.hardFailures}`);
});

test('T1.11 ON01: "khai báo qua mạng" + link kbtt chính thức là câu trả lời đúng', () => {
    const good = gradeDeterministic(EXPECTATIONS.cases.ON01, {
        text: '**Có, hoàn toàn có thể khai báo tạm trú cho người nước ngoài qua mạng.** Cơ sở lưu trú hoặc chủ hộ thực hiện trên hệ thống https://kbtt.xuatnhapcanh.gov.vn.',
        wordCount: 35,
    });
    assert.equal(good.hardFailures.length, 0, `${good.hardFailures}`);

    // Chuỗi 2 run 1: bot viết "khai báo trực tuyến" (không có nguyên cụm "khai báo tạm trú").
    const online = gradeDeterministic(EXPECTATIONS.cases.ON01, {
        text: '**Có, được.** Cơ sở lưu trú hoặc chủ hộ khai báo trực tuyến qua hệ thống KBTT tại https://kbtt.xuatnhapcanh.gov.vn trong vòng 12 giờ kể từ khi người nước ngoài đến.',
        wordCount: 40,
    });
    assert.equal(online.hardFailures.length, 0, `${online.hardFailures}`);

    const paperFlow = gradeDeterministic(EXPECTATIONS.cases.ON01, {
        text: 'Bạn phải nộp mẫu NA17 bản giấy hoặc gửi fax đến Công an phường để khai báo tạm trú.',
        wordCount: 20,
    });
    assert.ok(paperFlow.hardFailures.some(f => f.includes('obsolete_paper_flow')), `${paperFlow.hardFailures}`);
});

test('T1.11 TR09: hướng dẫn cổng KBTT chính thức là đích hợp lệ ngang trụ sở xác minh', () => {
    const onlineFirst = gradeDeterministic(EXPECTATIONS.cases.TR09, {
        text: '**You declare online through the national system at https://kbtt.xuatnhapcanh.gov.vn.** No need to go to a police station; the entire process is done electronically by the host.',
        wordCount: 30,
    });
    assert.equal(onlineFirst.hardFailures.length, 0, `${onlineFirst.hardFailures}`);

    const noDestination = gradeDeterministic(EXPECTATIONS.cases.TR09, {
        text: 'You should declare temporary residence for your foreign guest as soon as possible after arrival.',
        wordCount: 16,
    });
    assert.ok(noDestination.hardFailures.includes('missing_required_fact:english_station'), `${noDestination.hardFailures}`);
});

test('T1.11 provider error + text rỗng: báo providerError, KHÔNG quy thành content hard fail', () => {
    const blocked = gradeCase(EXPECTATIONS.cases.DN01 || EXPECTATIONS.cases.TR01, {
        text: '', wordCount: 0, truncated: false, error: 'BLOCKED_CONTENT', eval: null,
    });
    assert.equal(blocked.providerError, 'BLOCKED_CONTENT');
    assert.equal(blocked.failures.length, 0, `${blocked.failures}`);

    // Có text (dù lỗi ghi kèm) → content vẫn được chấm bình thường.
    const partial = gradeCase(EXPECTATIONS.cases.TR01, {
        text: 'Không sao đâu, không cần làm gì cả.', wordCount: 9, truncated: false, error: 'SOME_WARNING', eval: null,
    });
    assert.ok(partial.failures.includes('missing_required_fact:must_declare'), `${partial.failures}`);
});

test('T1.11 H16: câu hedging "chưa có dữ liệu trụ sở xác minh của Công an tỉnh" trong câu trả lời tốt không bị bắt oan', () => {
    const { parseConversations } = require('../scripts/run-regression');
    const h16 = parseConversations().find(c => c.id === 'H16');
    // Nguyên văn đoạn cuối câu trả lời ĐÚNG của bot trong run 1 (kèm hồ sơ TK05 phía trên).
    const good = gradeCase(h16.expectation, {
        text: '**Bạn cần trình báo mất hộ chiếu ngay.** Đơn trình báo mất hộ chiếu phổ thông (mẫu TK05). Nộp tại Cơ quan Quản lý xuất nhập cảnh hoặc Cổng Dịch vụ công; nếu xin cấp lại hộ chiếu, lệ phí 400.000 đồng. Hiện mình chưa có dữ liệu trụ sở xác minh của Công an tỉnh Phú Thọ. Bạn ở xã/phường nào để mình chỉ đúng địa chỉ nhé?',
        wordCount: 70, truncated: false, error: null, eval: null,
    });
    assert.equal(good.verdict, 'PASS', good.failures.join('; '));

    // Chuỗi tất định no_match nguyên bản VẪN bị bắt.
    const deterministic = gradeCase(h16.expectation, {
        text: 'Mình chưa có dữ liệu trụ sở được xác minh cho địa danh này. Vui lòng cung cấp thêm thông tin hoặc kiểm tra lại tên địa danh (xã/phường) nhé.',
        wordCount: 30, truncated: false, error: null, eval: null,
    });
    assert.equal(deterministic.verdict, 'HARD_FAIL');
});
