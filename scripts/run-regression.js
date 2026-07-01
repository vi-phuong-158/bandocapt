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

function runChat(userMessage) {
    return new Promise((resolve, reject) => {
        let fullResponse = '';
        let sources = [];
        let error = null;
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
                resolve({ text: fullResponse, sources, error });
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
                        } catch (e) {
                            // ignore parse errors
                        }
                    }
                }
                return true;
            },
            end(payload) {
                resolve({ text: fullResponse, sources, error });
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
            results.push({
                ...q,
                response: result.text,
                sources: result.sources,
                error: result.error
            });
            console.log(`  -> Response length: ${result.text ? result.text.length : 0} chars`);
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
    for (const r of results) {
        reportMd += `## [${r.id}] ${r.question}\n`;
        reportMd += `- **Kỳ vọng:** ${r.expectation}\n`;
        reportMd += `- **Lỗi cần bắt:** \`${r.errorToCatch}\`\n\n`;
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
