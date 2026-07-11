'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// js/chatbot.js là script trình duyệt — stub tối thiểu các global nó chạm ở top-level
// trước khi require (location.hostname, window._turnstile*, document listener).
global.location = { hostname: 'localhost' };
global.window = {};
global.document = { addEventListener() {} };

const { detectQuickReplies } = require('../js/chatbot.js').__test;

test('detects the 3 former-region chips when bot lists all regions and asks back', () => {
    const answer = [
        '**Không nộp tại Công an phường — thủ tục thuộc Phòng Quản lý xuất nhập cảnh.**',
        'Có 3 điểm tiếp dân: Phú Thọ cũ, Vĩnh Phúc cũ và Hòa Bình cũ.',
        'Bạn thuộc khu vực nào để mình chỉ đúng điểm nộp?',
    ].join('\n');
    const replies = detectQuickReplies(answer);
    assert.deepEqual(replies.map(r => r.label), ['Phú Thọ cũ', 'Vĩnh Phúc cũ', 'Hòa Bình cũ']);
    assert.match(replies[0].send, /Phú Thọ cũ/);
});

test('does not offer region chips when regions are mentioned without a closing question', () => {
    const answer = 'Ba khu vực Phú Thọ cũ, Vĩnh Phúc cũ và Hòa Bình cũ đều có điểm tiếp dân riêng. Bạn hãy liên hệ số điện thoại tương ứng để được hướng dẫn thêm về hồ sơ và thời gian làm việc của từng điểm tiếp nhận trên địa bàn.';
    assert.deepEqual(detectQuickReplies(answer), []);
});

test('detects the full-guidance chip for narrow-mode answers', () => {
    const answer = '**Có, cần mẫu NA5 (Thông tư 22/2023/TT-BCA).**\n\nBạn cần mình hướng dẫn đầy đủ hồ sơ và cách thực hiện không?';
    const replies = detectQuickReplies(answer);
    assert.equal(replies.length, 1);
    assert.match(replies[0].send, /Hướng dẫn đầy đủ hồ sơ/);
});

test('detects nationality chips in Vietnamese and English with matching labels', () => {
    const vi = detectQuickReplies('Bạn là người nước ngoài hay công dân Việt Nam?');
    assert.deepEqual(vi.map(r => r.label), ['Người nước ngoài', 'Công dân Việt Nam']);

    const en = detectQuickReplies('Are you a foreign national or a Vietnamese citizen?');
    assert.deepEqual(en.map(r => r.label), ['Foreign national', 'Vietnamese citizen']);
    assert.match(en[0].send, /foreign national/i);
});

test('detects nationality chips when the model reverses the two options (T1.9)', () => {
    const vi = detectQuickReplies('Bạn là công dân Việt Nam hay người nước ngoài để mình hướng dẫn chi tiết nhé?');
    assert.deepEqual(vi.map(r => r.label), ['Người nước ngoài', 'Công dân Việt Nam']);
    assert.match(vi[1].send, /Tôi là công dân Việt Nam/);

    const en = detectQuickReplies('Are you a Vietnamese citizen or a foreign national?');
    assert.deepEqual(en.map(r => r.label), ['Foreign national', 'Vietnamese citizen']);
});

test('returns empty for ordinary answers and empty input', () => {
    assert.deepEqual(detectQuickReplies('Thời hạn khai báo là 12 giờ kể từ khi đến.'), []);
    assert.deepEqual(detectQuickReplies(''), []);
    assert.deepEqual(detectQuickReplies(null), []);
});
