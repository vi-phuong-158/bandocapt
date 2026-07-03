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

const GRADED_CASES = {
    TR01: {
        required: [
            { label: 'mentions foreigner temporary residence declaration duty', patterns: [/khai báo tạm trú|khai bao tam tru/i, /người nước ngoài|nguoi nuoc ngoai|foreign guest/i] },
            { label: 'answers yes / obligation', patterns: [/\bcó\b|\bco\b|\bmust\b|\bneed to\b|\bphải\b|\bphai\b/i] }
        ]
    },
    TR02: {
        required: [
            { label: 'mentions Thanh Mieu verified office', patterns: [/thanh miếu|thanh mieu/i, /công an phường thanh miếu|cong an phuong thanh mieu|thanh mieu ward police station/i] }
        ]
    },
    TR03: {
        required: [
            { label: 'uses official KBTT url', patterns: [/https:\/\/kbtt\.xuatnhapcanh\.gov\.vn/i] },
            { label: 'mentions accommodation facility responsibility', patterns: [/cơ sở lưu trú|co so luu tru|khách sạn|khach san|accommodation facilit|hotel/i] }
        ]
    },
    ON01: {
        required: [
            { label: 'confirms online declaration path', patterns: [/online|trực tuyến|truc tuyen/i, /https:\/\/kbtt\.xuatnhapcanh\.gov\.vn/i] }
        ]
    },
    TL01: {
        required: [
            { label: 'contains 12 hours / 12 gio deadline', patterns: [/12 giờ|12 gio|12 hours/i] },
            { label: 'contains 24 hours / 24 gio deadline', patterns: [/24 giờ|24 gio|24 hours/i] }
        ]
    },
    GD02: {
        required: [
            { label: 'does not exempt child from declaration', patterns: [/khai báo tạm trú|khai bao tam tru|temporary residence declaration/i, /trẻ em|tre em|con|child/i] }
        ]
    },
    TR09: {
        required: [
            { label: 'responds in English', patterns: [/temporary residence|declare|police station|ward police/i] },
            { label: 'mentions Thanh Mieu verified office', patterns: [/thanh miếu|thanh mieu/i, /công an phường thanh miếu|cong an phuong thanh mieu|thanh mieu ward police station/i] }
        ]
    }
};

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
                resolve({ text: fullResponse, sources, error, statusCode: this.statusCode, truncated, finishReason });
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
                    } catch (_) {
                        // ignore parse errors from partial chunks
                    }
                }
                return true;
            },
            end() {
                resolve({ text: fullResponse, sources, error, statusCode: this.statusCode, truncated, finishReason });
                return this;
            },
        };

        chatHandler(createRequest({
            captchaToken: 'test-bypass-token',
            userMessage
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

function extractHaystack(result) {
    const sourceText = (result.sources || []).map(src => [
        src.file,
        src.van_ban,
        src.document_title,
        src.article,
        src.url
    ].filter(Boolean).join(' ')).join('\n');
    return `${result.response || ''}\n${sourceText}`;
}

function evaluateCase(result) {
    const spec = GRADED_CASES[result.id];
    if (!spec) return null;

    const failures = [];
    const haystack = extractHaystack(result);
    const responseOnly = result.response || '';

    for (const forbidden of COMMON_FORBIDDEN_PATTERNS) {
        if (forbidden.pattern.test(haystack)) {
            failures.push(forbidden.label);
        }
    }

    if (result.error) {
        failures.push(`unexpected error: ${result.error}`);
    }

    for (const rule of spec.required) {
        const matched = rule.patterns.every(pattern => pattern.test(responseOnly));
        if (!matched) failures.push(rule.label);
    }

    return {
        status: failures.length === 0 ? 'PASS' : 'FAIL',
        failures
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
        try {
            const result = await runChat(q.question);
            const graded = evaluateCase({
                id: q.id,
                response: result.text,
                sources: result.sources,
                error: result.error,
            });
            const wordCount = countWords(result.text);
            const verbosityLimit = NARROW_QUESTION_IDS.has(q.id) ? VERBOSITY_LIMIT_NARROW : VERBOSITY_LIMIT_FULL;

            results.push({
                ...q,
                response: result.text,
                sources: result.sources,
                error: result.error,
                truncated: result.truncated,
                finishReason: result.finishReason,
                wordCount,
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
                wordCount,
                verbosity: false,
                verbosityLimit,
                grade: evaluateCase({ id: q.id, response: '', sources: [], error: e.message })
            });
        }

        if (args.delayMs > 0 && i < questions.length - 1) {
            await new Promise(resolve => setTimeout(resolve, args.delayMs));
        }
    }

    const gradedResults = results.filter(result => result.grade);
    const passCount = gradedResults.filter(result => result.grade.status === 'PASS').length;
    const failCount = gradedResults.length - passCount;
    const now = new Date();
    const stamp = now.toISOString().replace(/:/g, '-').replace(/\..+/, '').replace('T', '_');
    const reportPath = path.resolve(__dirname, `../test/results/regression-run-${stamp}.md`);
    const latestPath = path.resolve(__dirname, '../test/results/regression-latest.md');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });

    let reportMd = `# Báo cáo Regression Run (${now.toISOString()})\n\n`;
    reportMd += `- Tổng số câu chạy: ${results.length}\n`;
    reportMd += `- Số ca tự chấm: ${gradedResults.length}\n`;
    reportMd += `- PASS: ${passCount}\n`;
    reportMd += `- FAIL: ${failCount}\n\n`;

    if (gradedResults.length > 0) {
        reportMd += `## Tóm tắt tự chấm\n`;
        for (const result of gradedResults) {
            reportMd += `- ${result.id}: ${result.grade.status}`;
            if (result.grade.failures.length > 0) {
                reportMd += ` — ${result.grade.failures.join('; ')}`;
            }
            reportMd += '\n';
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
    reportMd += `| ID | Số từ | Ngân sách | VERBOSITY | TRUNCATED | ERROR |\n|---|---:|---:|---|---|---|\n`;
    for (const r of results) {
        reportMd += `| ${r.id} | ${r.wordCount} | ${r.verbosityLimit} | ${r.verbosity ? '⚠️' : ''} | ${r.truncated ? '❌' : ''} | ${r.error || ''} |\n`;
    }
    reportMd += `\n---\n\n`;

    for (const result of results) {
        reportMd += `## [${result.id}] ${result.question}\n`;
        reportMd += `- **Kỳ vọng:** ${result.expectation}\n`;
        reportMd += `- **Lỗi cần bắt:** \`${result.errorToCatch}\`\n`;
        reportMd += `- **Độ dài:** ${result.wordCount} từ / ngân sách ${result.verbosityLimit}${result.verbosity ? ' — ⚠️ VERBOSITY' : ''}${result.truncated ? ` — ❌ TRUNCATED (${result.finishReason})` : ''}\n`;
        if (result.grade) {
            reportMd += `- **Tự chấm:** ${result.grade.status}\n`;
            if (result.grade.failures.length > 0) {
                reportMd += `- **Assertion fail:** ${result.grade.failures.join('; ')}\n`;
            }
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

    if (failCount > 0) {
        process.exitCode = 1;
    }
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
