'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
    splitIntoSafeChunks,
    stripUnsupportedMarkdown,
    buildLocationBlock,
    buildSourceBlock,
    formatZaloReply,
    getFallbackReply,
    ZALO_MESSAGE_SAFETY_LIMIT,
    MAX_MESSAGES_PER_ANSWER,
} = require('../lib/zalo-formatter');

test('splitIntoSafeChunks: văn bản ngắn hơn giới hạn trả về nguyên vẹn 1 phần tử', () => {
    const chunks = splitIntoSafeChunks('Câu trả lời ngắn.', 1800);
    assert.deepEqual(chunks, ['Câu trả lời ngắn.']);
});

test('splitIntoSafeChunks: cắt đúng theo giới hạn, không vượt quá cho mỗi đoạn', () => {
    const paragraph = 'Đây là một câu ví dụ để kiểm tra việc cắt văn bản dài. '.repeat(80);
    const chunks = splitIntoSafeChunks(paragraph, 200);
    assert.ok(chunks.length > 1);
    chunks.forEach(chunk => assert.ok(chunk.length <= 200, `chunk dài ${chunk.length} > 200`));
    // Ghép lại (sau trim mỗi đoạn) phải khôi phục đúng nội dung, không mất/lặp ký tự.
    assert.equal(chunks.join(' ').replace(/\s+/g, ' ').trim(), paragraph.replace(/\s+/g, ' ').trim());
});

test('splitIntoSafeChunks: ưu tiên cắt theo ranh giới đoạn/câu, không cắt giữa từ khi có lựa chọn', () => {
    const text = 'Bước một: chuẩn bị hồ sơ đầy đủ theo quy định hiện hành của cơ quan có thẩm quyền tiếp nhận. '
        + 'Bước hai: nộp hồ sơ trực tiếp tại bộ phận một cửa hoặc qua cổng dịch vụ công trực tuyến quốc gia.';
    const chunks = splitIntoSafeChunks(text, 100);
    // Điểm cắt phải rơi ngay sau dấu chấm câu (không cắt giữa "trực tuyến quốc gia" chẳng hạn).
    chunks.slice(0, -1).forEach(chunk => {
        assert.match(chunk, /[.!?]$/, `đoạn "${chunk}" không kết thúc ở ranh giới câu`);
    });
});

test('splitIntoSafeChunks: Unicode tiếng Việt không bị vỡ dấu ở điểm cắt', () => {
    const text = 'Công an xã Bình Xuyên hỗ trợ đăng ký thường trú, tạm trú và cấp căn cước công dân cho người dân địa phương và người nước ngoài cư trú hợp pháp trên địa bàn. '.repeat(5);
    const chunks = splitIntoSafeChunks(text, 150);
    chunks.forEach(chunk => {
        // Không có ký tự thay thế lỗi encode (U+FFFD) và chunk phải là chuỗi hợp lệ.
        assert.equal(chunk.includes('\uFFFD'), false);
        assert.equal(typeof chunk, 'string');
    });
});

test('stripUnsupportedMarkdown: bỏ heading và bold nhưng giữ nguyên nội dung', () => {
    const input = '# Tiêu đề\n**Quan trọng**: nộp hồ sơ tại __bộ phận một cửa__.';
    const output = stripUnsupportedMarkdown(input);
    assert.equal(output.includes('#'), false);
    assert.equal(output.includes('**'), false);
    assert.equal(output.includes('__'), false);
    assert.match(output, /Tiêu đề/);
    assert.match(output, /Quan trọng: nộp hồ sơ tại bộ phận một cửa\./);
});

test('buildLocationBlock: định dạng 📍 tên/địa chỉ/maps, giới hạn số lượng hiển thị', () => {
    const locations = [
        { name: 'Công an xã Bình Xuyên', address: 'Thôn 1, xã Bình Xuyên', mapsUrl: 'https://maps.google.com/?q=1,2' },
        { name: 'Công an phường A', address: 'Địa chỉ A', mapsUrl: 'https://maps.google.com/?q=3,4' },
        { name: 'Công an phường B', address: 'Địa chỉ B', mapsUrl: '' },
        { name: 'Công an phường C', address: 'Địa chỉ C', mapsUrl: '' },
    ];
    const block = buildLocationBlock(locations);
    assert.match(block, /📍 Công an xã Bình Xuyên/);
    assert.match(block, /Địa chỉ: Thôn 1, xã Bình Xuyên/);
    assert.match(block, /Google Maps: https:\/\/maps\.google\.com\/\?q=1,2/);
    assert.match(block, /còn 1 địa điểm khác/);
});

test('buildLocationBlock: mảng rỗng trả chuỗi rỗng, không render khối 📍 giả', () => {
    assert.equal(buildLocationBlock([]), '');
    assert.equal(buildLocationBlock(undefined), '');
});

test('buildSourceBlock: chỉ tên + url công khai, không có score/procedure_id/kb_version', () => {
    const sources = [
        { title: 'Nghị định 282/2025/NĐ-CP', url: 'https://vbpl.vn/abc', score: 0.91, procedure_id: 'tthc_1', kb_version: 'v3' },
        { file: 'Thông tư 55/2021', url: '', score: 0.5 },
    ];
    const block = buildSourceBlock(sources);
    assert.match(block, /^Nguồn:/);
    assert.match(block, /Nghị định 282\/2025\/NĐ-CP \(https:\/\/vbpl\.vn\/abc\)/);
    assert.match(block, /Thông tư 55\/2021/);
    assert.equal(block.includes('0.91'), false);
    assert.equal(block.includes('tthc_1'), false);
    assert.equal(block.includes('kb_version'), false);
    assert.equal(block.includes('v3'), false);
});

test('buildSourceBlock: khử trùng lặp theo nhãn và giới hạn tối đa 3 nguồn', () => {
    const sources = Array.from({ length: 5 }, (_, i) => ({ title: `Nguồn ${i % 2}`, url: `https://x/${i}` }));
    const block = buildSourceBlock(sources);
    const lines = block.split('\n').filter(l => l.startsWith('•'));
    assert.ok(lines.length <= 3);
});

test('formatZaloReply: câu trả lời ngắn -> đúng 1 tin nhắn, có địa điểm + nguồn', () => {
    const messages = formatZaloReply({
        fullText: 'Bạn cần chuẩn bị CMND/CCCD và đơn xin xác nhận cư trú.',
        sources: [{ title: 'Luật Cư trú', url: 'https://vbpl.vn/luat' }],
        verifiedLocations: [{ name: 'Công an xã Bình Xuyên', address: 'Địa chỉ X', mapsUrl: 'https://maps/1' }],
    });
    assert.equal(messages.length, 1);
    assert.match(messages[0], /Bạn cần chuẩn bị/);
    assert.match(messages[0], /📍 Công an xã Bình Xuyên/);
    assert.match(messages[0], /Nguồn:/);
});

test('formatZaloReply: câu trả lời rất dài bị giới hạn tối đa MAX_MESSAGES_PER_ANSWER tin nhắn', () => {
    const longText = 'Đây là một đoạn hướng dẫn thủ tục rất dài dùng để kiểm tra giới hạn số tin nhắn. '.repeat(200);
    const messages = formatZaloReply({ fullText: longText, sources: [], verifiedLocations: [] });
    assert.ok(messages.length <= MAX_MESSAGES_PER_ANSWER);
    assert.equal(messages.length, MAX_MESSAGES_PER_ANSWER);
    messages.forEach(m => assert.ok(m.length <= ZALO_MESSAGE_SAFETY_LIMIT + 5));
    assert.match(messages[messages.length - 1], /bandocapt\.io\.vn/);
});

test('formatZaloReply: fullText rỗng và không có nguồn/địa điểm -> mảng rỗng (không gửi tin trống)', () => {
    assert.deepEqual(formatZaloReply({ fullText: '', sources: [], verifiedLocations: [] }), []);
    assert.deepEqual(formatZaloReply({}), []);
});

test('getFallbackReply: chứa link bandocapt.io.vn (hoặc PUBLIC_APP_URL) và không phải câu lỗi kỹ thuật', () => {
    const reply = getFallbackReply();
    assert.match(reply, /bandocapt\.io\.vn/);
    assert.equal(reply.toLowerCase().includes('stack'), false);
    assert.equal(reply.toLowerCase().includes('undefined'), false);
});
