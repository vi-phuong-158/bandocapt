const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Pinecone } = require('@pinecone-database/pinecone');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const RECORD_ID = 'tthc_matt26265';
const QUERY_TEXT = 'khai báo tạm trú người nước ngoài online cho cơ sở lưu trú';
const OFFICIAL_URL = 'https://kbtt.xuatnhapcanh.gov.vn';
const EMBED_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent';

function sha256(value) {
    return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function buildCleanRecord(previousMetadata = {}) {
    const title = 'Khai báo tạm trú cho người nước ngoài tại Việt Nam qua Trang thông tin điện tử';
    const text = [
        `Tên thủ tục: ${title}`,
        'Loại thủ tục: Tạm trú',
        'Nhánh truy xuất: Khai báo tạm trú người nước ngoài cho cơ sở lưu trú',
        'Cấp xử lý/phối hợp: Cơ sở lưu trú khai báo trực tuyến; Công an cấp xã nơi có cơ sở lưu trú tiếp nhận, quản lý thông tin tạm trú theo quy định.',
        'Mức độ dịch vụ: Khai báo trực tuyến qua hệ thống KBTT',
        'Đối tượng chính: Cơ sở lưu trú, chủ hộ, người đại diện nơi người nước ngoài tạm trú.',
        'Hạn khai báo: Trong 12 giờ kể từ khi người nước ngoài đến cơ sở lưu trú; địa bàn vùng sâu, vùng xa trong 24 giờ.',
        'Lệ phí: Không',
        'Phí: Không',
        'Hồ sơ/thông tin khai báo: Thông tin hộ chiếu hoặc giấy tờ đi lại của người nước ngoài, ngày đến, ngày dự kiến rời đi, số phòng/nơi ở và các trường thông tin lưu trú trên hệ thống.',
        'Trình tự thực hiện:',
        `1. Đăng ký hoặc đăng nhập tài khoản cơ sở lưu trú tại ${OFFICIAL_URL}.`,
        '2. Chọn chức năng khai báo tạm trú cho người nước ngoài.',
        '3. Nhập thông tin trực tiếp hoặc quét hộ chiếu/OCR, kiểm tra và chuẩn hóa dữ liệu.',
        '4. Khai báo ngày đến, ngày dự kiến rời đi, số phòng/nơi ở và lưu hồ sơ.',
        '5. Theo dõi, tra cứu danh sách khai báo trên hệ thống KBTT.',
        `Cách thức thực hiện: Trực tuyến tại ${OFFICIAL_URL}.`,
        'Yêu cầu/điều kiện thực hiện: Phải khai báo ngay khi người nước ngoài đến lưu trú, bảo đảm đúng hạn 12 giờ hoặc 24 giờ theo địa bàn.',
        'Kết quả: Thông tin tạm trú của người nước ngoài được cập nhật và lưu trữ trên hệ thống khai báo tạm trú.',
        'Căn cứ pháp lý: Điều 33 Luật Nhập cảnh, xuất cảnh, quá cảnh, cư trú của người nước ngoài tại Việt Nam số 47/2014/QH13; Luật số 51/2019/QH14; Thông tư số 53/2016/TT-BCA.',
        `Nguồn xác minh vận hành: Hướng dẫn KBTT dành cho cơ sở lưu trú tại ${OFFICIAL_URL}.`
    ].join('\n');

    return {
        ...previousMetadata,
        procedure_id: 'matt26265',
        source_type: 'tthc',
        loai_thu_tuc: 'tam_tru',
        linh_vuc: previousMetadata.linh_vuc || 'cu_tru',
        doi_tuong_chinh: 'nguoi_khai_bao_tam_tru',
        subject_scope: 'nguoi_nuoc_ngoai',
        retrieval_intent: 'tam_tru_khai_bao_nguoi_nuoc_ngoai',
        title,
        cap: 'xa',
        official_url: OFFICIAL_URL,
        le_phi: 'Không',
        phi: 'Không',
        thoi_han: 'Trong 12 giờ kể từ khi người nước ngoài đến cơ sở lưu trú; địa bàn vùng sâu, vùng xa trong 24 giờ.',
        mau_don: 'Khai báo điện tử trên hệ thống KBTT; trường hợp dùng phiếu khai báo thì theo mẫu NA17.',
        text,
        content_hash: sha256(text)
    };
}

async function fetchEmbedding(text) {
    const response = await fetch(`${EMBED_URL}?key=${process.env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'models/gemini-embedding-001',
            content: { parts: [{ text }] },
            outputDimensionality: 768
        })
    });

    if (!response.ok) {
        throw new Error(`Embedding request failed: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    return data.embedding?.values || [];
}

async function main() {
    if (!process.env.PINECONE_API_KEY || !process.env.GEMINI_API_KEY) {
        throw new Error('Missing PINECONE_API_KEY or GEMINI_API_KEY in environment.');
    }

    const indexName = process.env.PINECONE_INDEX_NAME || 'chatbot-tthc-xnc';
    const indexHost = process.env.PINECONE_INDEX_HOST || undefined;
    const namespace = process.env.PINECONE_NAMESPACE || 'chatbot-tthc-xnc';
    const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    const index = pc.index(indexName, indexHost).namespace(namespace);
    const backupDir = path.resolve(__dirname, '../data/pinecone-backups');
    fs.mkdirSync(backupDir, { recursive: true });

    const beforeFetch = await index.fetch([RECORD_ID]);
    const beforeRecord = beforeFetch.records?.[RECORD_ID];
    if (!beforeRecord) {
        throw new Error(`Record ${RECORD_ID} not found in namespace ${namespace}.`);
    }

    const stamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '').replace('T', '_');
    const prePath = path.join(backupDir, `${stamp}-pre-repair-${RECORD_ID}.json`);
    fs.writeFileSync(prePath, JSON.stringify({ id: RECORD_ID, ...beforeRecord }, null, 2), 'utf8');

    const cleanMetadata = buildCleanRecord(beforeRecord.metadata || {});
    const values = await fetchEmbedding(cleanMetadata.text);
    if (!values.length) {
        throw new Error('Embedding returned empty vector.');
    }

    await index.upsert([{
        id: RECORD_ID,
        values,
        metadata: cleanMetadata
    }]);

    const afterFetch = await index.fetch([RECORD_ID]);
    const afterRecord = afterFetch.records?.[RECORD_ID];
    const postPath = path.join(backupDir, `${stamp}-post-repair-${RECORD_ID}.json`);
    fs.writeFileSync(postPath, JSON.stringify({ id: RECORD_ID, ...afterRecord }, null, 2), 'utf8');

    if (!afterRecord?.metadata?.text || /\?{3,}/.test(afterRecord.metadata.text)) {
        throw new Error('Post-update record still appears corrupted.');
    }
    if (afterRecord.metadata.retrieval_intent !== 'tam_tru_khai_bao_nguoi_nuoc_ngoai') {
        throw new Error('retrieval_intent verification failed.');
    }
    if (afterRecord.metadata.content_hash !== sha256(afterRecord.metadata.text)) {
        throw new Error('content_hash verification failed.');
    }
    if (JSON.stringify(beforeRecord.values) === JSON.stringify(afterRecord.values)) {
        throw new Error('Vector values did not change after re-embedding.');
    }

    const queryVector = await fetchEmbedding(QUERY_TEXT);
    const queryResponse = await index.query({
        vector: queryVector,
        topK: 3,
        includeMetadata: true
    });
    const topMatch = queryResponse.matches?.[0];
    if (!topMatch || topMatch.id !== RECORD_ID) {
        throw new Error(`Top-1 verification failed for query "${QUERY_TEXT}". Got ${topMatch?.id || 'none'}.`);
    }

    console.log(JSON.stringify({
        preBackup: prePath,
        postBackup: postPath,
        topMatch: {
            id: topMatch.id,
            score: topMatch.score,
            retrieval_intent: topMatch.metadata?.retrieval_intent,
            official_url: topMatch.metadata?.official_url
        }
    }, null, 2));
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
