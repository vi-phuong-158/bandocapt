'use strict';

// T3.4/T3.5 — nhập chính xác các thủ tục cấp xã đã được người dùng duyệt vào
// namespace MỚI. Không ghi namespace production hiện hành.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { Pinecone } = require('@pinecone-database/pinecone');
const { parseCsv } = require('./scrape-phutho-tthc');

const ROOT = path.resolve(__dirname, '..');
const SNAPSHOT_PATH = path.join(ROOT, 'data', 'tthc-phutho-source.json');
const REVIEW_PATH = path.join(ROOT, 'data', 'tthc-phutho-xa-review.csv');
const DECISIONS_PATH = path.join(ROOT, 'data', 'tthc-phutho-xa-review-decisions.json');
const BACKUP_DIR = path.join(ROOT, 'data', 'pinecone-backups');
const EMBED_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent';

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

function asText(value) {
    return String(value || '').trim() || 'N/A';
}

function categoryKey(category) {
    const value = String(category || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
    if (value.includes('cu tru')) return 'cu_tru';
    if (value.includes('xuat nhap canh')) return 'xuat_nhap_canh';
    return value.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'tthc';
}

function textForProcedure(source, row) {
    const attachments = (source.attachments || []).map(item => item.title).filter(Boolean).join('; ') || 'N/A';
    return [
        `Tên thủ tục: ${asText(source.title)}`,
        `Lĩnh vực: ${asText(source.category)}`,
        `Cấp thực hiện: ${asText(source.level)}`,
        `Mức độ dịch vụ công: ${asText(row.service_level)}`,
        `Cơ quan thực hiện: ${asText(source.agency)}`,
        `Đối tượng thực hiện: ${asText(source.target_audience)}`,
        `Kết quả: ${asText(source.result)}`,
        `Thời hạn giải quyết: ${asText(source.processing_time)}`,
        `Phí, lệ phí: ${asText(source.fee)}`,
        `Cách thức thực hiện: ${asText(source.method)}`,
        `Trình tự thực hiện:\n${asText(source.steps)}`,
        `Thành phần hồ sơ:\n${asText(source.documents)}`,
        `Yêu cầu, điều kiện:\n${asText(source.requirements)}`,
        `Căn cứ pháp lý:\n${asText(source.legal_basis)}`,
        `Biểu mẫu, tệp đính kèm: ${attachments}`,
        `Nộp hồ sơ trực tuyến: ${asText(source.online_submission_url)}`,
        `Nguồn chính thức: ${asText(source.source_url)}`
    ].join('\n\n');
}

function buildApprovedRecords(snapshot, reviewRows, manifest, verifiedAt, snapshotBuffer) {
    const snapshotHash = crypto.createHash('sha256').update(snapshotBuffer || Buffer.from(JSON.stringify(snapshot, null, 2) + '\n')).digest('hex');
    if (snapshotHash !== manifest.source_snapshot_sha256) {
        throw new Error('Snapshot đã đổi sau khi duyệt. Tạo lại bảng đối chiếu và xin duyệt lại trước khi nhập.');
    }
    const sourceById = new Map((snapshot.procedures || []).map(item => [item.site_id, item]));
    const rows = reviewRows.filter(row => row.final_decision === 'approve');
    if (rows.length !== 42) throw new Error(`Cần đúng 42 dòng approve, nhận ${rows.length}.`);
    const records = rows.map(row => {
        const source = sourceById.get(row.site_id);
        const decision = manifest.decisions_by_site_id?.[row.site_id];
        if (!source || !decision || decision.final_decision !== 'approve') {
            throw new Error(`Thiếu nguồn hoặc manifest duyệt cho site_id=${row.site_id}.`);
        }
        if (decision.source_content_hash !== source.content_hash || row.content_hash !== source.content_hash) {
            throw new Error(`Hash nguồn không khớp cho site_id=${row.site_id}.`);
        }
        const text = textForProcedure(source, row);
        const contentHash = crypto.createHash('sha256').update(text).digest('hex');
        return {
            id: row.proposed_id,
            text,
            metadata: {
                text,
                title: source.title,
                procedure_id: row.proposed_id,
                source_type: 'tthc',
                loai_thu_tuc: categoryKey(source.category),
                linh_vuc: source.category,
                cap: 'xa',
                cap_normalized: 'xa',
                service_level: row.service_level,
                authority: source.agency,
                thoi_han: source.processing_time,
                le_phi: source.fee || 'N/A',
                phi: 'N/A',
                mau_don: row.form_codes || 'N/A',
                review_status: 'approved',
                source_priority: 'current_procedure',
                valid_from: 'N/A',
                valid_to: 'N/A',
                procedure_version: source.content_hash,
                last_verified_at: verifiedAt,
                content_hash: contentHash,
                phutho_source_hash: source.content_hash,
                official_url: source.source_url,
                online_submission_url: source.online_submission_url || 'N/A',
                source_decision: 'TTHC Công an tỉnh Phú Thọ — cấp xã'
            }
        };
    });
    if (new Set(records.map(record => record.id)).size !== records.length) throw new Error('Trùng ID trong danh sách nhập.');
    return records;
}

async function embedDocument(text) {
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            const response = await fetch(`${EMBED_URL}?key=${process.env.GEMINI_API_KEY}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'models/gemini-embedding-001', content: { parts: [{ text }] },
                    outputDimensionality: 768, taskType: 'RETRIEVAL_DOCUMENT'
                })
            });
            if (!response.ok) throw new Error(`Embedding HTTP ${response.status}: ${await response.text()}`);
            const values = (await response.json()).embedding?.values || [];
            if (values.length !== 768) throw new Error(`Embedding có ${values.length} chiều, cần 768.`);
            return values;
        } catch (error) {
            lastError = error;
            if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 800 * attempt));
        }
    }
    throw lastError;
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

async function verifyAll(index, records) {
    for (let offset = 0; offset < records.length; offset += 50) {
        const batch = records.slice(offset, offset + 50);
        const fetched = await index.fetch(batch.map(record => record.id));
        for (const record of batch) {
            const actual = fetched.records?.[record.id];
            if (!actual || actual.values?.length !== 768 || actual.metadata?.content_hash !== record.metadata.content_hash
                || actual.metadata?.review_status !== 'approved') {
                throw new Error(`Xác minh thất bại: ${record.id}.`);
            }
        }
    }
}

function isVerifiedImportedRecord(actual, expected) {
    return Boolean(actual
        && actual.values?.length === 768
        && actual.metadata?.content_hash === expected.metadata.content_hash
        && actual.metadata?.review_status === 'approved');
}

async function main() {
    if (!process.env.PINECONE_API_KEY || !process.env.GEMINI_API_KEY) throw new Error('Thiếu PINECONE_API_KEY hoặc GEMINI_API_KEY.');
    const apply = process.argv.includes('--apply');
    const resume = process.argv.includes('--resume');
    const delayFlag = process.argv.indexOf('--delay-ms');
    const delayMs = delayFlag >= 0 ? Math.max(0, Number(process.argv[delayFlag + 1]) || 0) : 0;
    const targetFlag = process.argv.indexOf('--target');
    const sourceNamespace = process.env.PINECONE_NAMESPACE || 'chatbot-tthc-xnc';
    const targetNamespace = targetFlag >= 0 ? process.argv[targetFlag + 1] : `${sourceNamespace}-xa-rd-20260715`;
    if (!targetNamespace || targetNamespace === sourceNamespace) throw new Error('Namespace đích phải mới và khác namespace production.');
    const snapshotBuffer = fs.readFileSync(SNAPSHOT_PATH);
    const snapshot = JSON.parse(snapshotBuffer);
    const reviewRows = parseCsv(fs.readFileSync(REVIEW_PATH, 'utf8'));
    const manifest = JSON.parse(fs.readFileSync(DECISIONS_PATH, 'utf8'));
    const records = buildApprovedRecords(snapshot, reviewRows, manifest, new Date().toISOString(), snapshotBuffer);
    const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    const indexName = process.env.PINECONE_INDEX_NAME || 'chatbot-tthc-xnc';
    const target = pc.index(indexName, process.env.PINECONE_INDEX_HOST || undefined).namespace(targetNamespace);
    const existingIds = await listIds(target);
    if (existingIds.length && !resume) throw new Error(`Namespace đích ${targetNamespace} đã có ${existingIds.length} record; dùng namespace mới hoặc --resume.`);
    if (!apply) {
        console.log(JSON.stringify({ mode: 'dry-run', sourceNamespace, targetNamespace, approved: records.length, existingTargetRecords: existingIds.length, delayMs, ids: records.map(record => record.id) }, null, 2));
        return;
    }
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const backupPath = path.join(BACKUP_DIR, `${stamp()}-phutho-xa-import-${targetNamespace}-manifest.json`);
    fs.writeFileSync(backupPath, JSON.stringify({ targetNamespace, sourceSnapshotSha256: manifest.source_snapshot_sha256, records: records.map(record => ({ id: record.id, metadata: record.metadata })) }, null, 2), 'utf8');
    let done = 0; let reused = 0; let embedded = 0;
    for (const record of records) {
        const already = existingIds.includes(record.id);
        if (already && resume) {
            const current = (await target.fetch([record.id])).records?.[record.id];
            if (isVerifiedImportedRecord(current, record)) { done += 1; reused += 1; continue; }
        }
        const values = await embedDocument(record.text);
        await target.upsert([{ id: record.id, values, metadata: record.metadata }]);
        done += 1; embedded += 1;
        if (done % 10 === 0 || done === records.length) console.log(`Đã nhập ${done}/${records.length}`);
        if (delayMs > 0 && done < records.length) await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    await verifyAll(target, records);
    console.log(JSON.stringify({ mode: 'apply', targetNamespace, imported: records.length, embedded, reused, backup: path.relative(ROOT, backupPath), next: 'T3.6/T3.7: kiểm thử retrieval namespace mới trước khi đổi production.' }, null, 2));
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });

module.exports = { buildApprovedRecords, categoryKey, isVerifiedImportedRecord, listIds, textForProcedure };
