const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
process.env.NODE_ENV = 'development';
process.env.VERCEL_ENV = 'development';
process.env.EVAL_BYPASS_TOKEN = 'test-bypass-token';
process.env.CHAT_LOG_HASH_SALT = 'dummy-salt-for-testing';
if (!process.env.CHAT_DIAGNOSTIC_LOG_SAMPLE_RATE) process.env.CHAT_DIAGNOSTIC_LOG_SAMPLE_RATE = '1';

const fs = require('fs');
const chatHandler = require('../api/chat');
const {
    countWords,
    VERBOSITY_LIMIT_NARROW,
    VERBOSITY_LIMIT_FULL,
} = require('../lib/regression-metrics');
// T1.4/T1.5: bộ chấm 2 lớp (deterministic + grounding) đọc từ expectations JSON.
const { loadExpectations, gradeCase } = require('../lib/regression-grader');
const EXPECTATIONS = loadExpectations();

const COMMON_FORBIDDEN_PATTERNS = [
    { label: 'does not cite citizen residence law', pattern: /luật cư trú|luat cu tru/i },
    { label: 'does not use VNeID flow', pattern: /\bvneid\b/i },
    { label: 'does not mention 23-hour deadline', pattern: /23 giờ|23 gio|23 hours/i },
    { label: 'does not mention 08-hour deadline', pattern: /08 giờ|08 gio|8 giờ sáng|8 gio sang|08 hours|8am/i },
    { label: 'does not cite thong bao luu tru', pattern: /thông báo lưu trú|thong bao luu tru/i },
    { label: 'does not cite dang ky tam tru citizen procedure', pattern: /đăng ký tạm trú|dang ky tam tru/i }
];

function parseArgs(argv) {
    const parsed = { ids: null, delayMs: 2000 };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--ids' && argv[i + 1]) {
            parsed.ids = argv[i + 1].split(',').map(item => item.trim()).filter(Boolean);
            i += 1;
            continue;
        }
        if (arg.startsWith('--ids=')) {
            parsed.ids = arg.split('=')[1].split(',').map(item => item.trim()).filter(Boolean);
            continue;
        }
        if (arg === '--delay-ms' && argv[i + 1]) {
            parsed.delayMs = Number(argv[i + 1]) || parsed.delayMs;
            i += 1;
            continue;
        }
        if (arg.startsWith('--delay-ms=')) {
            parsed.delayMs = Number(arg.split('=')[1]) || parsed.delayMs;
        }
    }
    return parsed;
}

function createRequest(body = {}, headers = {}) {
    return {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-forwarded-for': '127.0.0.1',
            ...headers,
        },
        body,
        socket: {},
    };
}

// Câu hỏi HẸP (hỏi 1 chi tiết: có/không, mức phạt, thời hạn, nơi nộp, mẫu đơn, ai thực hiện) —
// ngân sách độ dài chặt hơn câu hỏi trọn thủ tục. Đối chiếu cột "Câu hỏi test" trong
// test/cau-hoi/bo-test-regression-30-cau-nguoi-nuoc-ngoai-tthc.md khi thêm/bớt câu.
const NARROW_QUESTION_IDS = new Set([
    'TR01', 'TR05', 'GV01', 'GV06', 'TT04', 'VP01', 'VP06', 'DN02', 'HS02', 'TL01',
    'CS01', 'GD02', 'ON01', 'TYPO02', 'LOC02', 'LOC04', 'LOC07', 'KC04', 'PI01',
]);
// Soft-fail VERBOSITY: vượt ngưỡng không tính là fail cứng, nhưng phải hiện rõ trong báo cáo.
function runChat(userMessage) {
    return new Promise((resolve, reject) => {
        let fullResponse = '';
        let sources = [];
        let error = null;
        let truncated = false;
        let finishReason = '';
        let evalTrace = null;
        let streamBuffer = '';

        const res = {
            headers: {},
            statusCode: 200,
            setHeader(name, value) {
                this.headers[name.toLowerCase()] = value;
            },
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(payload) {
                if (payload.error) error = payload.error;
                resolve({ text: fullResponse, sources, error, statusCode: this.statusCode, truncated, finishReason, eval: evalTrace });
                return this;
            },
            writeHead(code) {
                this.statusCode = code;
                return this;
            },
            write(chunk) {
                streamBuffer += chunk.toString();
                const parts = streamBuffer.split('\n\n');
                streamBuffer = parts.pop();

                for (const part of parts) {
                    if (!part.startsWith('data: ')) continue;
                    const dataStr = part.substring(6);
                    if (dataStr === '[DONE]') continue;
                    try {
                        const data = JSON.parse(dataStr);
                        if (data.text) fullResponse += data.text;
                        if (data.fullText) fullResponse = data.fullText;
                        if (data.sources) sources = data.sources;
                        if (data.error) error = data.error;
                        if (data.truncated) truncated = true;
                        if (data.finishReason) finishReason = data.finishReason;
                        if (data.eval) evalTrace = data.eval;
                    } catch (_) {
                        // ignore parse errors from partial chunks
                    }
                }
                return true;
            },
            end() {
                resolve({ text: fullResponse, sources, error, statusCode: this.statusCode, truncated, finishReason, eval: evalTrace });
                return this;
            },
        };

        chatHandler(createRequest({
            captchaToken: 'test-bypass-token',
            userMessage,
            evalDebug: true // T1.5: xin eval trace để chấm grounding (chỉ bật trong eval-run non-production)
        }), res).catch(reject);
    });
}

function parseQuestions() {
    const mdPath = path.resolve(__dirname, '../test/cau-hoi/bo-test-regression-30-cau-nguoi-nuoc-ngoai-tthc.md');
    const content = fs.readFileSync(mdPath, 'utf-8');
    const lines = content.split('\n');
    let insideTable = false;
    const questions = [];

    for (const line of lines) {
        if (line.trim().startsWith('| STT |')) {
            insideTable = true;
            continue;
        }
        if (insideTable && line.trim().startsWith('|---')) continue;
        if (insideTable && line.trim() === '') {
            insideTable = false;
            continue;
        }
        if (!insideTable) continue;

        const parts = line.split('|').map(s => s.trim());
        if (parts.length < 7) continue;
        questions.push({
            id: parts[2].replace(/`/g, ''),
            group: parts[3],
            question: parts[4],
            expectation: parts[5],
            errorToCatch: parts[6].replace(/`/g, '')
        });
    }

    return questions;
}

// T1.4/T1.5: chấm 1 ca bằng bộ chấm 2 lớp (deterministic + grounding) đọc từ
// expectations JSON. Trả object tương thích report cũ (status/failures) + trường
// giàu hơn (verdict, softWarnings, grounding metric, authority).
function evaluateCase(result) {
    const expectation = EXPECTATIONS.cases[result.id];
    if (!expectation) return null;
    const graded = gradeCase(expectation, {
        text: result.response || '',
        wordCount: result.wordCount,
        truncated: result.truncated,
        error: result.error,
        eval: result.eval,
    }, { globalForbidden: COMMON_FORBIDDEN_PATTERNS });
    return {
        status: graded.verdict,            // PASS | HARD_FAIL | DEFERRED_FAIL
        failures: graded.failures,
        isDeferred: graded.isDeferred,
        softWarnings: graded.softWarnings,
        providerError: graded.providerError,
        language: graded.language,
        authority: graded.authority,
        grounding: graded.grounding,
    };
}

function renderSources(sources = []) {
    if (!sources.length) return '_Không có trích dẫn._\n';
    return sources.map(src => {
        const title = src.file || src.van_ban || src.document_title || 'Không rõ';
        const article = src.article ? ` - ${src.article}` : '';
        const url = src.url ? ` - ${src.url}` : '';
        const score = src.score !== undefined ? ` (Score: ${src.score})` : '';
        return `- ${title}${article}${url}${score}`;
    }).join('\n') + '\n';
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const selectedIds = args.ids ? new Set(args.ids) : null;
    const questions = parseQuestions().filter(q => !selectedIds || selectedIds.has(q.id));

    console.log(`Parsed ${questions.length} questions. Starting regression run...`);
    if (selectedIds) {
        console.log(`Selected IDs: ${Array.from(selectedIds).join(', ')}`);
    }

    const results = [];

    for (let i = 0; i < questions.length; i += 1) {
        const q = questions[i];
        console.log(`[${i + 1}/${questions.length}] Running ID: ${q.id} - ${q.question}`);
        const t0 = Date.now();
        try {
            const result = await runChat(q.question);
            const latencyMs = Date.now() - t0;
            const wordCount = countWords(result.text);
            const expectation = EXPECTATIONS.cases[q.id];
            const verbosityLimit = (expectation && typeof expectation.verbosity_budget === 'number')
                ? expectation.verbosity_budget
                : (NARROW_QUESTION_IDS.has(q.id) ? VERBOSITY_LIMIT_NARROW : VERBOSITY_LIMIT_FULL);
            const graded = evaluateCase({
                id: q.id,
                response: result.text,
                sources: result.sources,
                error: result.error,
                wordCount,
                truncated: result.truncated,
                eval: result.eval,
            });

            results.push({
                ...q,
                response: result.text,
                sources: result.sources,
                error: result.error,
                truncated: result.truncated,
                finishReason: result.finishReason,
                eval: result.eval,
                wordCount,
                latencyMs,
                verbosity: wordCount > verbosityLimit,
                verbosityLimit,
                grade: graded,
            });

            console.log(`  -> Response length: ${result.text ? result.text.length : 0} chars, ${wordCount} words${wordCount > verbosityLimit ? ' [VERBOSITY]' : ''}${result.truncated ? ' [TRUNCATED]' : ''}`);
            if (graded) {
                console.log(`  -> Grade: ${graded.status}${graded.failures.length ? ` (${graded.failures.join('; ')})` : ''}`);
            }
            if (result.error) {
                console.log(`  -> Error: ${result.error}`);
            }
        } catch (e) {
            const latencyMs = Date.now() - t0;
            console.error(`  -> Exception: ${e.message}`);
            const wordCount = 0;
            const verbosityLimit = NARROW_QUESTION_IDS.has(q.id) ? VERBOSITY_LIMIT_NARROW : VERBOSITY_LIMIT_FULL;
            results.push({
                ...q,
                response: '',
                sources: [],
                error: e.message,
                truncated: false,
                finishReason: '',
                eval: null,
                wordCount,
                latencyMs,
                verbosity: false,
                verbosityLimit,
                grade: evaluateCase({ id: q.id, response: '', sources: [], error: e.message, wordCount: 0, truncated: false, eval: null })
            });
        }

        if (args.delayMs > 0 && i < questions.length - 1) {
            await new Promise(resolve => setTimeout(resolve, args.delayMs));
        }
    }

    const gradedResults = results.filter(result => result.grade);
    const passCount = gradedResults.filter(result => result.grade.status === 'PASS').length;
    const hardFailCount = gradedResults.filter(result => result.grade.status === 'HARD_FAIL').length;
    const deferredFailCount = gradedResults.filter(result => result.grade.status === 'DEFERRED_FAIL').length;
    const failCount = hardFailCount + deferredFailCount;
    // Gate chính thức: 0 hard fail. Deferred (F01) KHÔNG chặn gate cho tới Giai đoạn 3.
    const providerErrorCount = gradedResults.filter(result => result.grade.providerError).length;
    // Grounding metric tổng hợp (chỉ trên ca có eval trace + có kỳ vọng procedure/source).
    const groundingResults = gradedResults.filter(r => r.grade.grounding);
    const avg = (arr) => arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : null;
    const recallVals = groundingResults.map(r => r.grade.grounding.recallAt4).filter(v => typeof v === 'number');
    const mrrVals = groundingResults.map(r => r.grade.grounding.mrr).filter(v => typeof v === 'number');
    const sourceRecallVals = groundingResults.map(r => r.grade.grounding.sourceRecall).filter(v => typeof v === 'number');
    const meanRecall = avg(recallVals);
    const meanMrr = avg(mrrVals);
    const meanSourceRecall = avg(sourceRecallVals);
    // Authority accuracy (advisory, không vào gate): tỉ lệ ca có kỳ vọng thẩm quyền được nêu đúng.
    const authorityResults = gradedResults.filter(r => r.grade.authority && r.grade.authority.expected.length > 0);
    const authorityHits = authorityResults.filter(r => r.grade.authority.hit).length;
    // Latency (ms) — đo bao quanh runChat, gồm cả retrieval + generation.
    const latencies = results.map(r => r.latencyMs).filter(n => Number.isFinite(n)).sort((a, b) => a - b);
    const latAvg = latencies.length ? Math.round(latencies.reduce((s, n) => s + n, 0) / latencies.length) : 0;
    const latMedian = latencies.length ? latencies[Math.floor(latencies.length / 2)] : 0;
    const latP95 = latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))] : 0;
    const now = new Date();
    const stamp = now.toISOString().replace(/:/g, '-').replace(/\..+/, '').replace('T', '_');
    const reportPath = path.resolve(__dirname, `../test/results/regression-run-${stamp}.md`);
    const latestPath = path.resolve(__dirname, '../test/results/regression-latest.md');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });

    const pct = (v) => v === null ? 'N/A' : `${(v * 100).toFixed(1)}%`;
    let reportMd = `# Báo cáo Regression Run (${now.toISOString()})\n\n`;
    reportMd += `- Tổng số câu chạy: ${results.length}\n`;
    reportMd += `- Số ca tự chấm: ${gradedResults.length}/30\n`;
    reportMd += `- **PASS: ${passCount}** — **HARD_FAIL: ${hardFailCount}** — DEFERRED_FAIL: ${deferredFailCount} — PROVIDER_ERROR: ${providerErrorCount}\n`;
    reportMd += `- **Gate (0 hard fail): ${hardFailCount === 0 ? '✅ ĐẠT' : '❌ KHÔNG ĐẠT'}** — deferred (F01) không chặn gate tới Giai đoạn 3\n`;
    reportMd += `- Grounding: Recall@4 TB ${pct(meanRecall)} · MRR TB ${meanMrr === null ? 'N/A' : meanMrr.toFixed(3)} · Source recall TB ${pct(meanSourceRecall)}\n`;
    reportMd += `- Authority accuracy: ${authorityResults.length ? `${authorityHits}/${authorityResults.length} (${pct(authorityHits / authorityResults.length)})` : 'N/A'}\n`;
    reportMd += `- Latency: TB ${latAvg} ms · median ${latMedian} ms · p95 ${latP95} ms\n\n`;

    if (gradedResults.length > 0) {
        reportMd += `## Tóm tắt tự chấm\n`;
        for (const result of gradedResults) {
            const g = result.grade;
            reportMd += `- ${result.id}: ${g.status}`;
            if (g.grounding && typeof g.grounding.recallAt4 === 'number') {
                reportMd += ` [R@4 ${pct(g.grounding.recallAt4)}]`;
            }
            if (g.failures.length > 0) reportMd += ` — ${g.failures.join('; ')}`;
            reportMd += '\n';
        }
        reportMd += '\n';
    }

    // Phân loại chi tiết theo verdict — đọc nhanh phần cần sửa, không phải cuộn qua 30 câu.
    const hardFails = gradedResults.filter(r => r.grade.status === 'HARD_FAIL');
    const deferredFails = gradedResults.filter(r => r.grade.status === 'DEFERRED_FAIL');
    const softCases = results.filter(r => r.grade && (r.grade.softWarnings.length > 0 || r.verbosity || r.truncated));
    const providerErrors = results.filter(r => r.grade && r.grade.providerError);

    if (hardFails.length > 0) {
        reportMd += `## ❌ Hard fail (${hardFails.length}) — CHẶN GATE\n`;
        for (const r of hardFails) {
            reportMd += `- **${r.id}** — ${r.grade.failures.join('; ') || 'không rõ nguyên nhân'}\n`;
        }
        reportMd += '\n';
    }
    if (deferredFails.length > 0) {
        reportMd += `## 🟡 Deferred fail (${deferredFails.length}) — không chặn gate tới Giai đoạn 3\n`;
        for (const r of deferredFails) {
            reportMd += `- **${r.id}** — ${r.grade.failures.join('; ') || 'không rõ nguyên nhân'}\n`;
        }
        reportMd += '\n';
    }
    if (softCases.length > 0) {
        reportMd += `## ⚠️ Soft warning (${softCases.length}) — không fail gate\n`;
        for (const r of softCases) {
            const tags = new Set(r.grade.softWarnings);
            if (r.verbosity) tags.add('VERBOSITY');
            if (r.truncated) tags.add('TRUNCATED');
            const detail = [];
            if (tags.has('VERBOSITY')) detail.push(`VERBOSITY ${r.wordCount}/${r.verbosityLimit} từ`);
            if (tags.has('TRUNCATED')) detail.push(`TRUNCATED (${r.finishReason || 'n/a'})`);
            for (const w of tags) if (w !== 'VERBOSITY' && w !== 'TRUNCATED') detail.push(w);
            reportMd += `- **${r.id}** — ${detail.join('; ')}\n`;
        }
        reportMd += '\n';
    }
    if (providerErrors.length > 0) {
        reportMd += `## 🔌 Provider error (${providerErrors.length}) — báo riêng, không tính content hard fail\n`;
        for (const r of providerErrors) {
            reportMd += `- **${r.id}** — ${r.grade.providerError}\n`;
        }
        reportMd += '\n';
    }

    // Bảng tổng hợp độ dài/ngắt câu — để so sánh trước–sau khi sửa prompt mà không phải đọc từng câu.
    const wordCounts = results.map(r => r.wordCount).filter(n => Number.isFinite(n)).sort((a, b) => a - b);
    const avgWords = wordCounts.length ? Math.round(wordCounts.reduce((s, n) => s + n, 0) / wordCounts.length) : 0;
    const medianWords = wordCounts.length ? wordCounts[Math.floor(wordCounts.length / 2)] : 0;
    reportMd += `## Tổng hợp\n\n`;
    reportMd += `- Số câu: ${results.length} — TB: **${avgWords} từ**, median: **${medianWords} từ**\n`;
    reportMd += `- VERBOSITY (vượt ngân sách từ): ${results.filter(r => r.verbosity).length} — TRUNCATED (chạm trần token): ${results.filter(r => r.truncated).length} — ERROR: ${results.filter(r => r.error).length}\n\n`;
    reportMd += `| ID | Verdict | Số từ | Ngân sách | Latency (ms) | VERBOSITY | TRUNCATED | ERROR |\n|---|---|---:|---:|---:|---|---|---|\n`;
    for (const r of results) {
        const verdict = r.grade ? r.grade.status : '';
        reportMd += `| ${r.id} | ${verdict} | ${r.wordCount} | ${r.verbosityLimit} | ${Number.isFinite(r.latencyMs) ? r.latencyMs : ''} | ${r.verbosity ? '⚠️' : ''} | ${r.truncated ? '❌' : ''} | ${r.error || ''} |\n`;
    }
    reportMd += `\n---\n\n`;

    for (const result of results) {
        reportMd += `## [${result.id}] ${result.question}\n`;
        reportMd += `- **Kỳ vọng:** ${result.expectation}\n`;
        reportMd += `- **Lỗi cần bắt:** \`${result.errorToCatch}\`\n`;
        reportMd += `- **Độ dài:** ${result.wordCount} từ / ngân sách ${result.verbosityLimit}${result.verbosity ? ' — ⚠️ VERBOSITY' : ''}${result.truncated ? ` — ❌ TRUNCATED (${result.finishReason})` : ''}\n`;
        if (Number.isFinite(result.latencyMs)) reportMd += `- **Latency:** ${result.latencyMs} ms\n`;
        if (result.grade) {
            reportMd += `- **Tự chấm:** ${result.grade.status}\n`;
            if (result.grade.failures.length > 0) {
                reportMd += `- **Assertion fail:** ${result.grade.failures.join('; ')}\n`;
            }
            const gr = result.grade.grounding;
            if (gr) {
                const parts = [];
                if (typeof gr.recallAt4 === 'number') parts.push(`Recall@4 ${(gr.recallAt4 * 100).toFixed(0)}%`);
                if (typeof gr.mrr === 'number') parts.push(`MRR ${gr.mrr.toFixed(2)}`);
                if (typeof gr.sourceRecall === 'number') parts.push(`Source ${(gr.sourceRecall * 100).toFixed(0)}%`);
                if (gr.groundingFailures && gr.groundingFailures.length) parts.push(`ungrounded: ${gr.groundingFailures.join(', ')}`);
                if (parts.length) reportMd += `- **Grounding:** ${parts.join(' · ')}\n`;
            }
            if (result.grade.providerError) reportMd += `- **Provider error:** ${result.grade.providerError}\n`;
        }
        reportMd += '\n';
        if (result.error) {
            reportMd += `**[ERROR]** ${result.error}\n\n`;
        }
        reportMd += `**Bot trả lời:**\n\n\`\`\`text\n${result.response}\n\`\`\`\n\n`;
        reportMd += `**Trích dẫn:**\n${renderSources(result.sources)}\n`;
        reportMd += `---\n\n`;
    }

    fs.writeFileSync(reportPath, reportMd, 'utf-8');
    fs.writeFileSync(latestPath, reportMd, 'utf-8');

    console.log(`Regression run complete. Report saved to ${reportPath}`);
    console.log(`Also updated pointer file: ${latestPath}`);

    // Chỉ hard fail mới đánh exit 1 (chặn gate). Deferred/provider error báo riêng, không fail CI.
    if (hardFailCount > 0) {
        process.exitCode = 1;
    }
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
