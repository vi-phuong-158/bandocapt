'use strict';

// Gán source_type/source_priority cho corpus luật (law_*) và hướng dẫn (guide_*) trong
// namespace production. Đây KHÔNG phải thủ tục hiện hành (không có phí/thời hạn/biểu mẫu
// vận hành) nên KHÔNG cần approved/current_procedure — chỉ cần gắn nhãn tường minh để
// governance filter (lib/retrieval-governance.js) phân biệt được với tthc.
// Không đổi vector/text/review_status; chỉ ghi 2 field metadata, có backup + verify.
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { Pinecone } = require('@pinecone-database/pinecone');
const { classify, PRIORITY_BY_CLASS } = require('./inventory-corpus');

const ROOT = path.resolve(__dirname, '..');
const BACKUP_DIR = path.join(ROOT, 'data/pinecone-backups');
const TARGET_CLASSES = new Set(['law', 'guide']);

for (const filename of ['.env', '.env.local']) {
    const envPath = path.join(ROOT, filename);
    if (!fs.existsSync(envPath)) continue;
    for (const [key, value] of Object.entries(dotenv.parse(fs.readFileSync(envPath, 'utf8')))) {
        if (String(value || '').trim()) process.env[key] = value;
    }
}

function stamp() {
    return new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '').replace('T', '_');
}

// Trả về kế hoạch cập nhật cho 1 record, hoặc null nếu ngoài phạm vi (tthc/tru_so/other)
// hoặc đã đúng sẵn (idempotent — chạy lại không ghi thừa).
function planUpdate(id, metadata = {}) {
    const klass = classify(id, metadata.source_type);
    if (!TARGET_CLASSES.has(klass)) return null;
    const wantSourceType = klass;
    const wantPriority = PRIORITY_BY_CLASS[klass];
    if (metadata.source_type === wantSourceType && metadata.source_priority === wantPriority) return null;
    return {
        id,
        klass,
        before: { source_type: metadata.source_type || null, source_priority: metadata.source_priority || null },
        after: { source_type: wantSourceType, source_priority: wantPriority },
        metadata: { ...metadata, source_type: wantSourceType, source_priority: wantPriority }
    };
}

async function listIds(index) {
    const ids = []; let token;
    do {
        const page = await index.listPaginated({ limit: 100, paginationToken: token });
        ids.push(...(page.vectors || []).map(vector => vector.id));
        token = page.pagination?.next;
    } while (token);
    return ids;
}

async function fetchAll(index, ids) {
    const out = {};
    for (let i = 0; i < ids.length; i += 100) {
        const res = await index.fetch(ids.slice(i, i + 100));
        Object.assign(out, res.records || {});
    }
    return out;
}

async function main() {
    if (!process.env.PINECONE_API_KEY) throw new Error('Thiếu PINECONE_API_KEY; không ghi dữ liệu.');
    const apply = process.argv.includes('--apply');
    const namespace = process.env.PINECONE_NAMESPACE || 'chatbot-tthc-xnc';
    const name = process.env.PINECONE_INDEX_NAME || 'chatbot-tthc-xnc';
    const host = process.env.PINECONE_INDEX_HOST || undefined;
    const index = new Pinecone({ apiKey: process.env.PINECONE_API_KEY }).index(name, host).namespace(namespace);

    const allIds = await listIds(index);
    const targetIds = allIds.filter(id => /^(law|guide)[_:]/.test(id));
    const fetched = await fetchAll(index, targetIds);

    const plan = [];
    for (const id of targetIds) {
        const record = fetched[id];
        if (!record?.metadata) continue;
        const update = planUpdate(id, record.metadata);
        if (update) plan.push(update);
    }
    const byClass = plan.reduce((acc, u) => { acc[u.klass] = (acc[u.klass] || 0) + 1; return acc; }, {});

    if (!apply) {
        console.log(JSON.stringify({ mode: 'dry-run', namespace, scanned: targetIds.length, toUpdate: plan.length, alreadyCorrect: targetIds.length - plan.length, byClass }, null, 2));
        return;
    }

    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const backupPath = path.join(BACKUP_DIR, `${stamp()}-backfill-law-guide-governance-${namespace}.json`);
    fs.writeFileSync(backupPath, JSON.stringify({
        namespace,
        updates: plan.map(u => ({ id: u.id, klass: u.klass, before: u.before, after: u.after }))
    }, null, 2), 'utf8');

    let done = 0;
    for (const update of plan) {
        await index.update({ id: update.id, metadata: update.metadata });
        done += 1;
        if (done % 25 === 0 || done === plan.length) console.log(`Đã cập nhật ${done}/${plan.length}`);
    }

    const after = await fetchAll(index, plan.map(u => u.id));
    for (const update of plan) {
        const actual = after[update.id]?.metadata;
        if (actual?.source_type !== update.after.source_type || actual?.source_priority !== update.after.source_priority) {
            throw new Error(`Xác minh thất bại: ${update.id}.`);
        }
    }

    console.log(JSON.stringify({ mode: 'apply', namespace, updated: plan.length, byClass, backup: path.relative(ROOT, backupPath) }, null, 2));
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });

module.exports = { planUpdate, TARGET_CLASSES };
