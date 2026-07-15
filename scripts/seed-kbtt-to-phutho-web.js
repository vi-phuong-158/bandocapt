'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { Pinecone } = require('@pinecone-database/pinecone');

const ROOT = path.resolve(__dirname, '..');
for (const filename of ['.env', '.env.local']) {
    const file = path.join(ROOT, filename);
    if (fs.existsSync(file)) for (const [key, value] of Object.entries(dotenv.parse(fs.readFileSync(file, 'utf8')))) {
        if (String(value || '').trim()) process.env[key] = value;
    }
}
const namespace = process.env.PINECONE_CANDIDATE_NAMESPACE || 'chatbot-tthc-xnc-web-rd-20260715';
const EMBED_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent';

function buildRecord() {
    const title = 'Khai báo tạm trú cho người nước ngoài tại Việt Nam qua Trang thông tin điện tử';
    const text = [
        `Tên thủ tục: ${title}`,
        'Nhánh truy xuất: Khai báo tạm trú người nước ngoài cho cơ sở lưu trú.',
        'Kênh nộp: Trực tuyến tại https://kbtt.xuatnhapcanh.gov.vn.',
        'Hỗ trợ tại địa phương: Công an cấp xã nơi có cơ sở lưu trú.',
        'Thời hạn: Trong 12 giờ kể từ khi người nước ngoài đến cơ sở lưu trú; vùng sâu, vùng xa trong 24 giờ.',
        'Lệ phí: Không.',
        'Thông tin khai báo: hộ chiếu hoặc giấy tờ đi lại, ngày đến, ngày dự kiến rời đi, số phòng hoặc nơi ở.',
        'Trình tự: đăng nhập tài khoản cơ sở lưu trú, chọn khai báo tạm trú, nhập hoặc quét thông tin hộ chiếu, kiểm tra và gửi khai báo, theo dõi kết quả trên hệ thống KBTT.',
        'Nguồn xác minh vận hành: Hướng dẫn KBTT dành cho cơ sở lưu trú.'
    ].join('\n');
    const hash = crypto.createHash('sha256').update(text).digest('hex');
    return {
        id: 'tthc_matt26265', text,
        metadata: {
            text, title, procedure_id: 'matt26265', source_type: 'tthc',
            loai_thu_tuc: 'tam_tru', linh_vuc: 'Quản lý xuất nhập cảnh', cap: 'Cấp Xã', cap_normalized: 'xa',
            canonical_procedure_key: 'tam-tru-khai-bao-nguoi-nuoc-ngoai', retrieval_intent: 'tam_tru_khai_bao_nguoi_nuoc_ngoai',
            authority: 'Phòng Quản lý xuất nhập cảnh Công an tỉnh Phú Thọ', support_authority: 'Công an cấp xã nơi có cơ sở lưu trú',
            submission_channel: 'https://kbtt.xuatnhapcanh.gov.vn', official_url: 'https://kbtt.xuatnhapcanh.gov.vn',
            thoi_han: 'Trong 12 giờ; vùng sâu, vùng xa trong 24 giờ', le_phi: 'Không', phi: 'Không', mau_don: 'Khai báo điện tử trên hệ thống KBTT',
            review_status: 'approved', source_priority: 'current_procedure', valid_from: 'N/A', valid_to: 'N/A',
            procedure_version: hash, content_hash: hash, last_verified_at: new Date().toISOString(),
            source_decision: 'KBTT — hướng dẫn vận hành trực tuyến đã duyệt; không dùng Phiếu/NA17.'
        }
    };
}

async function main() {
    const apply = process.argv.includes('--apply'); const record = buildRecord();
    if (!apply) return console.log(JSON.stringify({ mode: 'dry-run', namespace, id: record.id, content_hash: record.metadata.content_hash }, null, 2));
    if (!process.env.PINECONE_API_KEY || (!process.argv.includes('--reuse-existing-vector') && !process.env.GEMINI_API_KEY)) throw new Error('Thiếu PINECONE_API_KEY hoặc GEMINI_API_KEY.');
    const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    const indexName = process.env.PINECONE_INDEX_NAME || 'chatbot-tthc-xnc';
    const host = process.env.PINECONE_INDEX_HOST || undefined;
    let values = [];
    if (process.argv.includes('--reuse-existing-vector')) {
        const sourceNamespace = process.env.PINECONE_SOURCE_NAMESPACE || 'chatbot-tthc-xnc';
        const source = pc.index(indexName, host).namespace(sourceNamespace);
        values = (await source.fetch([record.id])).records?.[record.id]?.values || [];
    } else {
        const response = await fetch(`${EMBED_URL}?key=${process.env.GEMINI_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'models/gemini-embedding-001', content: { parts: [{ text: record.text }] }, outputDimensionality: 768, taskType: 'RETRIEVAL_DOCUMENT' }) });
        if (!response.ok) throw new Error(`Embedding HTTP ${response.status}: ${await response.text()}`);
        values = (await response.json()).embedding?.values || [];
    }
    if (values.length !== 768) throw new Error(`Embedding không hợp lệ: ${values.length}.`);
    const index = pc.index(indexName, host).namespace(namespace);
    await index.upsert([{ id: record.id, values, metadata: record.metadata }]);
    console.log(JSON.stringify({ mode: 'apply', namespace, id: record.id, vector_dimensions: values.length }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { buildRecord };
