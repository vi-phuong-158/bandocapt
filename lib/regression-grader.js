'use strict';

// =====================================================================
// lib/regression-grader.js — Bộ chấm regression 2 lớp (T1.4 + T1.5)
//
// Lớp 1 (deterministic, T1.4): required/forbidden facts, ngôn ngữ, verbosity —
//   chấm trên chính câu trả lời.
// Lớp 2 (grounding, T1.5): fact có trong tài liệu đã retrieve không, expected
//   procedure/source có trong top-4 không (Recall@4 / MRR) — cần eval trace của T1.3.
//
// Verdict: PASS | HARD_FAIL | DEFERRED_FAIL. Ca status=DEFERRED_SOURCE_GOVERNANCE
// (F01) fail thì gắn DEFERRED_FAIL, KHÔNG tính vào hard-fail gate cho tới Giai đoạn 3.
// TRUNCATED/VERBOSITY là soft warning, không phải hard fail. Lỗi provider/API báo
// riêng (providerError), không tự động tính content hard fail.
// =====================================================================

const fs = require('fs');
const path = require('path');

const DEFAULT_EXPECTATIONS_PATH = path.resolve(__dirname, '../test/regression-expectations.json');

// Ánh xạ thẩm quyền → pattern (HEURISTIC, chỉ dùng cho authority_accuracy metric,
// KHÔNG phải hard gate — wrong-authority đã được forbidden_facts bắt ở phần lớn ca).
const AUTHORITY_PATTERNS = {
    kbtt_online: /kbtt\.xuatnhapcanh\.gov\.vn|khai báo tạm trú.*trực tuyến|trang.*(?:khai báo|thông tin cư trú)/i,
    cong_an_cap_xa: /Công an (?:xã|phường)/i,
    verified_local_station: /Công an (?:phường )?Thanh Miếu|Thanh Mieu Ward Police/i,
    phong_qlxnc_cap_tinh: /Phòng Quản lý xuất nhập cảnh|Phòng QLXNC/i,
    cuc_qlxnc_or_national_online: /Cục Quản lý xuất nhập cảnh|thị thực điện tử|e-?visa|电子签/i,
    co_quan_dai_dien_ngoai_giao: /Đại sứ quán|Lãnh sự quán|embassy|consulate|cơ quan đại diện/i,
    none: null,
};

// --------------------------------------------------------------------
// Nạp expectations
// --------------------------------------------------------------------
function loadExpectations(filePath = DEFAULT_EXPECTATIONS_PATH) {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const defaults = raw.defaults || {};
    const cases = {};
    for (const [id, spec] of Object.entries(raw.cases || {})) {
        cases[id] = {
            status: 'ACTIVE',
            must_abstain: false,
            must_ask_clarification: false,
            required_facts: [],
            forbidden_facts: [],
            expected_procedure_ids: [],
            expected_source_ids: [],
            ...defaults,
            ...spec,
        };
    }
    return { schema_version: raw.schema_version, defaults, cases };
}

// Compile pattern theo đúng cờ Codex khai báo (iu). Ném lỗi rõ ràng nếu regex hỏng.
function compilePattern(src) {
    try {
        return new RegExp(src, 'iu');
    } catch (e) {
        throw new Error(`Regex không hợp lệ: /${src}/iu — ${e.message}`);
    }
}

// Một fact khớp khi: match="all" → mọi pattern khớp; match="any" → ít nhất 1 pattern khớp.
function factMatches(fact, text) {
    const patterns = (fact.patterns || []).map(compilePattern);
    if (patterns.length === 0) return true;
    if (fact.match === 'any') return patterns.some(re => re.test(text));
    return patterns.every(re => re.test(text)); // mặc định "all"
}

// --------------------------------------------------------------------
// Nhận diện ngôn ngữ (heuristic theo mật độ) — đủ để phân biệt vi/en/zh,
// không nhầm khi câu tiếng Anh có tên riêng tiếng Việt ("Công an Thanh Miếu").
// --------------------------------------------------------------------
const VI_DIACRITIC = /[ăâêôơưđàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i;
const CJK = /[一-鿿]/g;

function detectLanguage(text) {
    const s = String(text || '');
    const cjkCount = (s.match(CJK) || []).length;
    if (cjkCount >= 2) return 'zh';
    // Câu tra trụ sở tiếng Anh được phép giữ nguyên tên/địa chỉ tiếng Việt. Khi các
    // nhãn trình bày cốt lõi là tiếng Anh, không để phần dữ liệu địa chỉ có dấu kéo
    // detector sang vi (LOC07: Address/Phone/Google Maps Directions).
    const englishContactLabels = (s.match(/(?:^|\n)\s*[-*]?\s*(?:📍|☎️)?\s*\*{0,2}(?:Address|Phone|Google Maps(?: Directions)?)\*{0,2}\s*:/gim) || []).length;
    if (englishContactLabels >= 1) return 'en';
    const words = s.split(/\s+/).filter(Boolean);
    if (words.length === 0) return 'en';
    // T1.11: chỉ đo mật độ dấu trên từ KHÔNG viết hoa đầu — tên riêng/địa chỉ tiếng Việt
    // ("Phường Thanh Miếu", "Đường Hùng Vương") là nội dung hợp lệ trong câu trả lời tiếng Anh
    // (LOC07 kỳ vọng "tên trụ sở tiếng Việt") và không được kéo câu sang 'vi'.
    const structural = words
        .map(w => w.replace(/^[^\p{L}\p{N}]+/u, ''))
        .filter(w => w && !/^\p{Lu}/u.test(w));
    const sample = structural.length >= 5 ? structural : words;
    const viWords = sample.filter(w => VI_DIACRITIC.test(w)).length;
    // Ngưỡng 0.30: câu tiếng Việt mật độ dấu thường >0.5; câu tiếng Anh chỉ lẫn vài
    // từ hành chính thường ("phường", "tỉnh") vẫn ở dưới ngưỡng → phân loại đúng 'en'.
    return (viWords / sample.length) >= 0.30 ? 'vi' : 'en';
}

// --------------------------------------------------------------------
// LỚP 1 — Deterministic (T1.4)
// --------------------------------------------------------------------
function gradeDeterministic(expectation, result, options = {}) {
    const text = String(result.text || '');
    const hardFailures = [];
    const softWarnings = [];

    // Lỗi provider/API — báo riêng, KHÔNG tính content hard fail.
    const providerError = result.error || null;

    // T1.11: provider error + không có nội dung → bỏ chấm content (mọi required fact sẽ
    // "thiếu" một cách vô nghĩa trên text rỗng). Strict gate vẫn chặn run qua providerError.
    const skipContentChecks = Boolean(providerError) && !text.trim();

    if (!skipContentChecks) {
        // required_facts: phải hiện diện trong câu trả lời.
        for (const fact of expectation.required_facts || []) {
            if (!factMatches(fact, text)) hardFailures.push(`missing_required_fact:${fact.id}`);
        }

        // forbidden_facts (per-ca): bất kỳ pattern nào khớp → fail.
        for (const forbidden of expectation.forbidden_facts || []) {
            const hit = (forbidden.patterns || []).map(compilePattern).some(re => re.test(text));
            if (hit) hardFailures.push(`forbidden_fact:${forbidden.id}`);
        }

        // globalForbidden: guard hallucination xuyên suốt (VNeID, luật cư trú, mốc 23h/08h…),
        // áp cho mọi ca vì expectations per-ca không phủ hết. Mỗi phần tử { label, pattern }.
        for (const g of options.globalForbidden || []) {
            const re = g.pattern instanceof RegExp ? g.pattern : compilePattern(g.pattern);
            if (re.test(text)) hardFailures.push(`global_forbidden:${g.label}`);
        }
    }

    // Ngôn ngữ — chỉ chấm khi có câu trả lời (câu rỗng do provider error để providerError xử lý).
    const detectedLanguage = detectLanguage(text);
    let languageOk = true;
    if (text.trim() && expectation.expected_language) {
        languageOk = detectedLanguage === expectation.expected_language;
        if (!languageOk) hardFailures.push(`wrong_language:expected_${expectation.expected_language}_got_${detectedLanguage}`);
    }

    // Verbosity — soft.
    const budget = expectation.verbosity_budget;
    if (typeof budget === 'number' && typeof result.wordCount === 'number' && result.wordCount > budget) {
        softWarnings.push('VERBOSITY');
    }
    if (result.truncated) softWarnings.push('TRUNCATED');

    return { hardFailures, softWarnings, providerError, detectedLanguage, languageOk };
}

// --------------------------------------------------------------------
// LỚP 2 — Grounding (T1.5). Trả null nếu không có eval trace.
// --------------------------------------------------------------------
function normalizeId(s) {
    return String(s || '').toLowerCase().replace(/\s+/g, '');
}
// Khớp mềm 2 chiều: "matt26265" ⊆ "tthc_matt26265".
function idPresent(expected, actualList) {
    const e = normalizeId(expected);
    return actualList.some(a => {
        const n = normalizeId(a);
        return n === e || n.includes(e) || e.includes(n);
    });
}

function gradeGrounding(expectation, evalTrace, result) {
    if (!evalTrace) return null;
    const finalMatches = evalTrace.matchesFinal || [];
    const finalProcedureIds = finalMatches.map(m => m.procedure_id).filter(Boolean);
    const finalSourceIds = finalMatches
        .map(m => m.source_file || m.procedure_id)
        .filter(Boolean);
    const matchedDocs = String(evalTrace.matchedDocs || '');
    const groundingFailures = [];

    // Recall@4 + MRR trên procedure ids kỳ vọng.
    const expectedProcs = expectation.expected_procedure_ids || [];
    let recallAt4 = null;
    let mrr = null;
    if (expectedProcs.length > 0) {
        const hits = expectedProcs.filter(id => idPresent(id, finalProcedureIds));
        recallAt4 = hits.length / expectedProcs.length;
        // MRR: hạng đầu tiên trong danh sách đã xếp (matchesFinal có .rank) khớp bất kỳ expected id.
        let bestRank = Infinity;
        for (const m of finalMatches) {
            if (expectedProcs.some(id => idPresent(id, [m.procedure_id].filter(Boolean)))) {
                bestRank = Math.min(bestRank, m.rank || Infinity);
            }
        }
        mrr = bestRank === Infinity ? 0 : 1 / bestRank;
    }

    // Source recall (presence trong top-4).
    const expectedSources = expectation.expected_source_ids || [];
    let sourceRecall = null;
    if (expectedSources.length > 0) {
        const hits = expectedSources.filter(id => idPresent(id, finalSourceIds));
        sourceRecall = hits.length / expectedSources.length;
    }

    // Fact grounding: fact grounding_required=true ĐÃ được khẳng định trong câu trả lời
    // thì phải tồn tại trong tài liệu đã retrieve; nếu không → nghi hallucination.
    // T1.8: nếu fact có `grounding_patterns` thì dò TÀI LIỆU bằng bộ pattern đó (match any)
    // thay vì tái dùng `patterns` của câu trả lời — vì corpus là tiếng Việt còn câu trả lời
    // có thể là en/zh (EV07/KC04) hoặc diễn đạt khác từ ngữ tài liệu (TR01/ON01/GD02).
    for (const fact of expectation.required_facts || []) {
        if (!fact.grounding_required) continue;
        const assertedInAnswer = factMatches(fact, String(result.text || ''));
        if (!assertedInAnswer) continue; // thiếu hẳn → đã tính ở lớp deterministic
        const groundingExempt = fact.grounding_exempt_patterns?.length
            && factMatches({ match: 'any', patterns: fact.grounding_exempt_patterns }, String(result.text || ''));
        // An evidence-based abstention is not itself a legal claim that must occur in retrieved documents.
        if (groundingExempt) continue;
        const docFact = (fact.grounding_patterns && fact.grounding_patterns.length)
            ? { match: 'any', patterns: fact.grounding_patterns }
            : fact;
        const groundedInDocs = factMatches(docFact, matchedDocs);
        if (!groundedInDocs) groundingFailures.push(`ungrounded_fact:${fact.id}`);
    }

    return { recallAt4, mrr, sourceRecall, groundingFailures, finalProcedureIds, finalSourceIds };
}

// --------------------------------------------------------------------
// Authority accuracy (metric advisory, không vào gate).
// --------------------------------------------------------------------
function gradeAuthority(expectation, result) {
    const tags = (expectation.expected_authorities || []).filter(t => t && t !== 'none');
    if (tags.length === 0) return { expected: [], hit: null };
    const text = String(result.text || '');
    const hit = tags.some(tag => {
        const re = AUTHORITY_PATTERNS[tag];
        return re ? re.test(text) : false;
    });
    return { expected: tags, hit };
}

// --------------------------------------------------------------------
// Kết hợp verdict
// --------------------------------------------------------------------
function classifyVerdict(expectation, deterministic, grounding) {
    const failures = [
        ...deterministic.hardFailures,
        ...(grounding ? grounding.groundingFailures : []),
    ];
    const isDeferred = expectation.status === 'DEFERRED_SOURCE_GOVERNANCE';
    let verdict;
    if (failures.length === 0) {
        verdict = 'PASS';
    } else {
        verdict = isDeferred ? 'DEFERRED_FAIL' : 'HARD_FAIL';
    }
    return { verdict, isDeferred, failures };
}

// --------------------------------------------------------------------
// API tổng: chấm 1 ca.
//   result = { text, wordCount, truncated, error, eval }
// --------------------------------------------------------------------
function gradeCase(expectation, result, options = {}) {
    const deterministic = gradeDeterministic(expectation, result, options);
    const grounding = gradeGrounding(expectation, result.eval || null, result);
    const authority = gradeAuthority(expectation, result);
    const verdict = classifyVerdict(expectation, deterministic, grounding);
    return {
        verdict: verdict.verdict,
        isDeferred: verdict.isDeferred,
        failures: verdict.failures,
        softWarnings: deterministic.softWarnings,
        providerError: deterministic.providerError,
        language: { detected: deterministic.detectedLanguage, ok: deterministic.languageOk },
        authority,
        grounding: grounding
            ? {
                recallAt4: grounding.recallAt4,
                mrr: grounding.mrr,
                sourceRecall: grounding.sourceRecall,
                groundingFailures: grounding.groundingFailures,
            }
            : null,
    };
}

module.exports = {
    loadExpectations,
    compilePattern,
    factMatches,
    detectLanguage,
    gradeDeterministic,
    gradeGrounding,
    gradeAuthority,
    classifyVerdict,
    gradeCase,
    AUTHORITY_PATTERNS,
    DEFAULT_EXPECTATIONS_PATH,
};
