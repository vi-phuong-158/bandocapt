'use strict';
// =====================================================================
// T3.7 — Shadow retrieval: so sánh truy hồi namespace CŨ (production) vs
// MỚI (ứng viên) trên bộ câu hỏi cân bằng, KHÔNG đổi production, KHÔNG gọi
// generation. Query cả hai namespace bằng cùng vector embedding rồi chấm
// truy hồi (coverage/domain/cap/governance/trap) và xuất báo cáo Markdown.
//
// Chạy:  node scripts/shadow-retrieval.js [--limit N] [--ids A,B] [--delay ms] [--out path]
// Chỉ đọc Pinecone. Cần GEMINI_API_KEY + PINECONE_API_KEY (đọc từ .env/.env.local).
// =====================================================================
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { Pinecone } = require('@pinecone-database/pinecone');

const ROOT = path.resolve(__dirname, '..');
for (const filename of ['.env', '.env.local']) {
    const file = path.join(ROOT, filename);
    if (fs.existsSync(file)) for (const [k, v] of Object.entries(dotenv.parse(fs.readFileSync(file, 'utf8')))) {
        if (String(v || '').trim()) process.env[k] = v;
    }
}

const chat = require('../api/chat.js');
const gov = require('../lib/retrieval-governance');

const EMBED_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent';
const RELEVANT_THRESHOLD = 0.62; // BOT-02, giống api/chat.js
const TOPK = 8;

function arg(name, fallback) {
    const hit = process.argv.find(a => a.startsWith(`--${name}=`)) || (() => {
        const i = process.argv.indexOf(`--${name}`);
        return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? `--${name}=${process.argv[i + 1]}` : null;
    })();
    return hit ? hit.split('=').slice(1).join('=') : fallback;
}

function norm(text) {
    return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd')
        .replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase();
}

async function embedQuery(text, delayMs) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
        const res = await fetch(`${EMBED_URL}?key=${process.env.GEMINI_API_KEY}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'models/gemini-embedding-001', content: { parts: [{ text }] }, outputDimensionality: 768, taskType: 'RETRIEVAL_QUERY' })
        });
        if (res.ok) return (await res.json()).embedding.values;
        if (res.status === 429 || res.status >= 500) {
            const backoff = delayMs * (attempt + 2);
            console.warn(`  [embed ${res.status}] chờ ${backoff}ms rồi thử lại (${attempt + 1}/4)`);
            await new Promise(r => setTimeout(r, backoff));
            continue;
        }
        throw new Error(`embed ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    throw new Error('embed thất bại sau 4 lần thử (quota?)');
}

// --- Truy hồi namespace CŨ: mô phỏng production (governance TẮT) ---
async function retrieveOld(index, vector, q) {
    const category = chat.classifyQuestion(q);
    const filterCats = chat.getFilterCategoriesForQuestionCategory(category);
    const categoryClauses = category ? filterCats.flatMap(v => [{ loai_thu_tuc: { '$eq': v } }, { linh_vuc: { '$eq': v } }]) : [];
    const base = { vector, topK: category ? TOPK : 12, includeMetadata: true };
    let res = await index.query(category ? { ...base, filter: { '$or': categoryClauses } } : base);
    if (category && !res.matches?.length) res = await index.query(base);
    const nonLocation = (res.matches || []).filter(m => !isLocation(m.metadata));
    const branch = chat.filterMatchesByQuestionCategory(nonLocation, category);
    return branch.filter(m => m.score > RELEVANT_THRESHOLD).slice(0, 3);
}

// --- Truy hồi namespace MỚI: mô phỏng api/chat.js governance path + cap mềm ---
async function retrieveNew(index, vector, q) {
    const category = chat.classifyQuestion(q);
    const filterCats = chat.getFilterCategoriesForQuestionCategory(category);
    const cap = gov.requestedCap(q);
    const categoryClauses = category ? filterCats.flatMap(v => [{ loai_thu_tuc: { '$eq': v } }, { linh_vuc: { '$eq': v } }]) : [];
    const base = { vector, topK: category ? TOPK : 12, includeMetadata: true };
    let stage = 'cat+cap';
    let res = await index.query({ ...base, filter: gov.buildCurrentProcedureFilter(categoryClauses, cap) });
    if (cap && !res.matches?.length) { res = await index.query({ ...base, filter: gov.buildCurrentProcedureFilter(categoryClauses, '') }); stage = 'cap-relaxed'; }
    if (category && !res.matches?.length) { res = await index.query({ ...base, filter: gov.buildCurrentProcedureFilter([], '') }); stage = 'current-procedure'; }
    if (!res.matches?.length) { res = await index.query({ ...base, filter: gov.buildGovernanceFilter(categoryClauses, '') }); stage = 'supplemental-fallback'; }
    const nonLocation = (res.matches || []).filter(m => !isLocation(m.metadata));
    const branch = chat.filterMatchesByQuestionCategory(nonLocation, category);
    const governed = gov.filterGovernedMatches(branch, q).filter(m => m.score > RELEVANT_THRESHOLD);
    return { stage, cap, category, filterCats, top: governed.slice(0, 3) };
}

function isLocation(md = {}) {
    return String(md.loai_thu_tuc || md.linh_vuc || '').replace(/[\s_]+/g, '').toLowerCase() === 'truso';
}

function scoreNew(question, result) {
    const top = result.top[0];
    const flags = [];
    const isAbstain = result.top.length === 0;
    const trap = question.trap;

    if (trap === 'out_of_scope' || trap === 'superseded_paper_flow') {
        // Bẫy: KHÔNG được trả nội dung cấm; abstain hoặc off-topic là ĐẠT.
        const forbidHit = (question.forbid_topic || []).some(p => result.top.some(m => norm(m.metadata?.title).includes(norm(p))));
        return { verdict: (!forbidHit) ? 'PASS' : 'FAIL', reason: forbidHit ? 'trả nội dung cấm' : (isAbstain ? 'abstain (đúng)' : 'không dính nội dung cấm') };
    }
    if (trap === 'citizen_vs_foreign') {
        const forbidHit = (question.forbid_topic || []).some(p => result.top.some(m => norm(m.metadata?.text || m.metadata?.title).includes(norm(p))));
        return { verdict: forbidHit ? 'FAIL' : 'PASS', reason: forbidHit ? 'kéo tài liệu cư trú công dân cho câu NNN' : 'không dính tài liệu công dân' };
    }
    // Câu thường (gồm trap wrong_cap_data / citizen_scope kỳ vọng CÓ trả lời):
    if (isAbstain) return { verdict: 'FAIL', reason: 'abstain oàn (0 governed match)' };

    if (question.domain) {
        // Dùng category/filterCats đã tính trên query THẬT SỰ đi query (đã dịch nếu ngoại ngữ) —
        // không tính lại classifyQuestion trên question.q gốc, vì câu ZH/KO/EN chưa dịch không
        // khớp regex tiếng Việt và sẽ báo domain LỆCH giả (retrieval vẫn đúng, chỉ bộ chấm sai).
        const domainOk = norm(top.metadata?.loai_thu_tuc) === norm(question.domain)
            || (result.filterCats || []).map(norm).includes(norm(top.metadata?.loai_thu_tuc));
        flags.push(`domain=${domainOk ? 'ok' : `LỆCH(${top.metadata?.loai_thu_tuc})`}`);
    }
    if (question.expect_cap) {
        const capTop = gov.normalizeCap(top.metadata?.cap_normalized || top.metadata?.cap);
        flags.push(`cap=${capTop === question.expect_cap ? 'khớp' : (result.stage === 'cap-relaxed' ? `mềm(${capTop})` : `LỆCH(${capTop})`)}`);
    }
    if (question.expect_topic) {
        // Recall@3: kỳ vọng chủ đề xuất hiện trong top-3 (không đòi đúng top-1 — rerank
        // thật ở chat.js có thể đảo thứ tự). domain/cap vẫn chấm trên top-1 (định tuyến).
        const topicOk = question.expect_topic.some(p => result.top.some(m => norm(m.metadata?.title).includes(norm(p))));
        flags.push(`topic=${topicOk ? 'ok' : 'LỆCH'}`);
    }
    if (question.expect_procedure) {
        const procOk = result.top.some(m => String(m.id).includes(question.expect_procedure) || String(m.metadata?.procedure_id || '').includes(question.expect_procedure));
        flags.push(`proc=${procOk ? 'ok' : 'THIẾU'}`);
    }
    const failed = flags.some(f => /LỆCH|THIẾU/.test(f));
    return { verdict: failed ? 'WARN' : 'PASS', reason: flags.join(' '), stage: result.stage };
}

function fmtDocs(list) {
    if (!list.length) return '_(0 match — abstain)_';
    return list.map(m => `${m.score.toFixed(3)} · cap=${m.metadata?.cap_normalized || '?'} · ${String(m.metadata?.title || m.id).slice(0, 55)}`).join('<br>');
}

async function main() {
    const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/shadow-retrieval-questions.json'), 'utf8'));
    const limit = arg('limit') ? Number(arg('limit')) : Infinity;
    const idFilter = arg('ids') ? new Set(arg('ids').split(',').map(s => s.trim())) : null;
    const delayMs = arg('delay') ? Number(arg('delay')) : 1200;
    let questions = spec.questions;
    if (idFilter) questions = questions.filter(q => idFilter.has(q.id));
    questions = questions.slice(0, limit);

    const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    const baseIndex = pc.index(process.env.PINECONE_INDEX_NAME || 'chatbot-tthc-xnc', process.env.PINECONE_INDEX_HOST || undefined);
    const oldIdx = baseIndex.namespace(spec.namespace_old);
    const newIdx = baseIndex.namespace(spec.namespace_new);

    const rows = [];
    const tally = { PASS: 0, WARN: 0, FAIL: 0 };
    for (let i = 0; i < questions.length; i += 1) {
        const question = questions[i];
        process.stdout.write(`[${i + 1}/${questions.length}] ${question.id} … `);
        try {
            const vector = await embedQuery(question.q, delayMs);
            const oldTop = await retrieveOld(oldIdx, vector, question.q);
            // Mirror api/chat.js T3.7: câu ngoại ngữ được dịch sang tiếng Việt cho truy hồi
            // namespace MỚI. Namespace CŨ giữ query gốc = hành vi production hiện tại.
            let newQuery = question.q, newVector = vector;
            if (chat.detectUserLanguage(question.q) !== 'vi') {
                const translated = await chat.translateQueryForRetrieval(question.q, process.env.GEMINI_API_KEY);
                if (translated) { newQuery = translated; newVector = await embedQuery(translated, delayMs); }
            }
            const newRes = await retrieveNew(newIdx, newVector, newQuery);
            newRes.translated = newQuery !== question.q ? newQuery : null;
            const graded = scoreNew(question, newRes);
            tally[graded.verdict] = (tally[graded.verdict] || 0) + 1;
            rows.push({ question, oldTop, newRes, graded });
            console.log(`${graded.verdict} — ${graded.reason}`);
        } catch (e) {
            console.log(`LỖI: ${e.message}`);
            rows.push({ question, error: e.message });
        }
        if (i < questions.length - 1) await new Promise(r => setTimeout(r, delayMs));
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outPath = arg('out') || `test/results/shadow-retrieval-${stamp}.md`;
    const lines = [];
    lines.push(`# Shadow retrieval T3.7 — ${stamp}`);
    lines.push('');
    lines.push(`- Namespace CŨ (production): \`${spec.namespace_old}\``);
    lines.push(`- Namespace MỚI (ứng viên): \`${spec.namespace_new}\``);
    lines.push(`- Số câu chạy: ${rows.length}/${spec.questions.length}  ·  Embedding \`RETRIEVAL_QUERY\`, topK ${TOPK}, ngưỡng ${RELEVANT_THRESHOLD}`);
    lines.push(`- Kết quả namespace MỚI: **PASS ${tally.PASS || 0} · WARN ${tally.WARN || 0} · FAIL ${tally.FAIL || 0}**`);
    lines.push('');
    lines.push('> PASS = truy đúng domain/cap/topic. WARN = có trả lời nhưng lệch 1 tiêu chí (soi tay). FAIL = abstain oàn hoặc bẫy không đạt.');
    lines.push('');
    lines.push('| ID | Câu hỏi | Verdict | Ghi chú | MỚI top-3 (governance) | CŨ top-3 (production) |');
    lines.push('|---|---|---|---|---|---|');
    for (const r of rows) {
        if (r.error) { lines.push(`| ${r.question.id} | ${r.question.q.slice(0, 40)} | LỖI | ${r.error} | | |`); continue; }
        const stage = r.newRes.stage !== 'cat+cap' ? ` _[${r.newRes.stage}]_` : '';
        const tr = r.newRes.translated ? ` _(dịch: ${r.newRes.translated.slice(0, 45)})_` : '';
        lines.push(`| ${r.question.id} | ${r.question.q.slice(0, 40)} | ${r.graded.verdict} | ${r.graded.reason}${stage}${tr} | ${fmtDocs(r.newRes.top)} | ${fmtDocs(r.oldTop)} |`);
    }
    lines.push('');
    lines.push('## Ghi chú');
    lines.push('- Bộ câu do Claude Code soạn (2026-07-17), cần người dùng rà kỳ vọng nghiệp vụ.');
    lines.push('- Câu `TRAP-*` kiểm governance: superseded/paper-flow/out-of-scope phải KHÔNG trả nội dung cấm; `wrong_cap_data`/`citizen_scope` kỳ vọng CÓ trả lời (không abstain oàn).');
    lines.push('- Shadow = chỉ so truy hồi, chưa chấm generation. Bước 30 câu lõi × 3 dùng `scripts/run-regression.js --majority --runs 3` trỏ namespace mới.');
    fs.writeFileSync(path.join(ROOT, outPath), lines.join('\n'), 'utf8');
    console.log(`\nBáo cáo: ${outPath}`);
    console.log(`Tổng: PASS ${tally.PASS || 0} · WARN ${tally.WARN || 0} · FAIL ${tally.FAIL || 0}`);
}

main().catch(e => { console.error(e); process.exitCode = 1; });
