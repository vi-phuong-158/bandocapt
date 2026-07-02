const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
process.env.NODE_ENV = 'development';
process.env.VERCEL_ENV = 'development';
process.env.EVAL_BYPASS_TOKEN = 'test-bypass-token';
process.env.CHAT_LOG_HASH_SALT = 'dummy-salt-for-testing';
if (!process.env.CHAT_DIAGNOSTIC_LOG_SAMPLE_RATE) process.env.CHAT_DIAGNOSTIC_LOG_SAMPLE_RATE = '1';

const fs = require('fs');
const chatHandler = require('../api/chat');

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
const VERBOSITY_LIMIT_NARROW = 250;
const VERBOSITY_LIMIT_FULL = 400;

function countWords(text) {
    return String(text || '').split(/\s+/).filter(Boolean).length;
}

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
                resolve({ text: fullResponse, sources, error, truncated, finishReason });
                return this;
            },
            writeHead(code, headers = {}) {
                this.statusCode = code;
                return this;
            },
            write(chunk) {
                streamBuffer += chunk.toString();
                const parts = streamBuffer.split('\n\n');
                streamBuffer = parts.pop();

                for (const part of parts) {
                    if (part.startsWith('data: ')) {
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
                        } catch (e) {
                            // ignore parse errors
                        }
                    }
                }
                return true;
            },
            end(payload) {
                resolve({ text: fullResponse, sources, error, truncated, finishReason });
                return this;
            },
        };

        chatHandler(createRequest({
            captchaToken: 'test-bypass-token',
            userMessage
        }), res).catch(reject);
    });
}

async function main() {
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
        if (insideTable && line.trim().startsWith('|---')) {
            continue;
        }
        if (insideTable && line.trim() === '') {
            insideTable = false;
            continue;
        }
        if (insideTable) {
            const parts = line.split('|').map(s => s.trim());
            if (parts.length >= 6) {
                const id = parts[2].replace(/`/g, '');
                const question = parts[4];
                const expectation = parts[5];
                const errorToCatch = parts[6].replace(/`/g, '');
                questions.push({ id, question, expectation, errorToCatch });
            }
        }
    }

    console.log(`Parsed ${questions.length} questions. Starting regression run...\n`);
    const results = [];

    for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        console.log(`[${i+1}/${questions.length}] Running ID: ${q.id} - ${q.question}`);
        try {
            const result = await runChat(q.question);
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
            });
            console.log(`  -> Response length: ${result.text ? result.text.length : 0} chars, ${wordCount} words${wordCount > verbosityLimit ? ' [VERBOSITY]' : ''}${result.truncated ? ' [TRUNCATED]' : ''}`);
            if (result.error) {
                console.log(`  -> Error: ${result.error}`);
            }
        } catch (e) {
            console.error(`  -> Exception: ${e.message}`);
        }
        await new Promise(r => setTimeout(r, 2000));
    }

    const now = new Date();
    const stamp = now.toISOString().replace(/:/g, '-').replace(/\..+/, '').replace('T', '_');
    const reportPath = path.resolve(__dirname, `../test/results/regression-run-${stamp}.md`);
    const latestPath = path.resolve(__dirname, '../test/results/regression-latest.md');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });

    let reportMd = `# Báo cáo Regression Run (${now.toISOString()})\n\n`;

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

    for (const r of results) {
        reportMd += `## [${r.id}] ${r.question}\n`;
        reportMd += `- **Kỳ vọng:** ${r.expectation}\n`;
        reportMd += `- **Lỗi cần bắt:** \`${r.errorToCatch}\`\n`;
        reportMd += `- **Độ dài:** ${r.wordCount} từ / ngân sách ${r.verbosityLimit}${r.verbosity ? ' — ⚠️ VERBOSITY' : ''}${r.truncated ? ` — ❌ TRUNCATED (${r.finishReason})` : ''}\n\n`;
        if (r.error) {
            reportMd += `**[ERROR]** ${r.error}\n\n`;
        }
        reportMd += `**Bot trả lời:**\n\n\`\`\`text\n${r.response}\n\`\`\`\n\n`;
        if (r.sources && r.sources.length > 0) {
            reportMd += `**Trích dẫn:**\n`;
            for (const src of r.sources) {
                const title = src.file || src.van_ban || src.document_title || 'Không rõ';
                const article = src.article ? ` - ${src.article}` : '';
                reportMd += `- ${title}${article} (Score: ${src.score})\n`;
            }
            reportMd += `\n`;
        }
        reportMd += `---\n\n`;
    }

    fs.writeFileSync(reportPath, reportMd, 'utf-8');
    fs.writeFileSync(latestPath, reportMd, 'utf-8');
    console.log(`\nRegression run complete. Report saved to ${reportPath}`);
    console.log(`Also updated pointer file: ${latestPath}`);
}

main().catch(console.error);
