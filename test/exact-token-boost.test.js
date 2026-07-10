'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { extractExactTokens, boostExactTokenMatches } = require('../api/chat.js');

test('extractExactTokens: bắt mã mẫu đơn NA/TT', () => {
    assert.deepEqual(extractExactTokens('Điền mẫu NA17 ở đâu?').sort(), ['NA17']);
    assert.deepEqual(extractExactTokens('cần tờ khai TT01 và NA5').sort(), ['NA5', 'TT01']);
});

test('extractExactTokens: bắt số hiệu văn bản có và không có năm', () => {
    assert.ok(extractExactTokens('theo Nghị định 47/2014 thì sao').includes('47/2014'));
    assert.ok(extractExactTokens('Quyết định 5568/QĐ-BCA quy định gì').includes('5568/QD-BCA'));
    assert.ok(extractExactTokens('Quyet dinh 5568/QD-BCA quy dinh gi').includes('5568/QD-BCA'));
});

test('extractExactTokens: trả rỗng cho câu không có token và input rỗng', () => {
    assert.deepEqual(extractExactTokens('thủ tục gia hạn tạm trú mất bao lâu'), []);
    assert.deepEqual(extractExactTokens(''), []);
    assert.deepEqual(extractExactTokens(null), []);
});

test('boostExactTokenMatches: đôn match chứa token lên đầu và đánh dấu', () => {
    const matches = [
        { score: 0.70, metadata: { text: 'thủ tục chung về cư trú' } },
        { score: 0.66, metadata: { text: 'Quyết định 5568/QĐ-BCA về TTHC', source_decision: '5568/QD-BCA' } },
    ];
    const out = boostExactTokenMatches(matches, ['5568/QD-BCA']);
    assert.equal(out[0].metadata.source_decision, '5568/QD-BCA');
    assert.equal(out[0]._exactTokenBoost, true);
    assert.ok(!out[1]._exactTokenBoost);
});

test('boostExactTokenMatches: khớp được giữa QĐ người dùng và QD trong metadata', () => {
    const tokens = extractExactTokens('Quyết định 5568/QĐ-BCA quy định gì?');
    const matches = [
        { score: 0.50, metadata: { source_decision: '5568/QD-BCA', text: '' } },
    ];
    const out = boostExactTokenMatches(matches, tokens);
    assert.equal(out[0]._exactTokenBoost, true);
});

test('boostExactTokenMatches: cứu match dưới ngưỡng nhưng vẫn trên sàn mềm 0.45', () => {
    const matches = [
        { score: 0.71, metadata: { text: 'nội dung khác' } },
        { score: 0.50, metadata: { text: 'mẫu NA17 khai báo tạm trú', mau_don: 'NA17' } },
    ];
    const out = boostExactTokenMatches(matches, ['NA17']);
    assert.equal(out[0]._exactTokenBoost, true);
    assert.equal(out[0].score, 0.50);
});

test('boostExactTokenMatches: KHÔNG boost match dưới sàn mềm (nhiễu)', () => {
    const matches = [
        { score: 0.30, metadata: { text: 'nhắc thoáng 47/2014 nhưng không liên quan' } },
    ];
    const out = boostExactTokenMatches(matches, ['47/2014']);
    assert.ok(!out[0]._exactTokenBoost);
});

test('boostExactTokenMatches: không token hoặc mảng rỗng → giữ nguyên', () => {
    const matches = [{ score: 0.7, metadata: { text: 'a' } }];
    assert.equal(boostExactTokenMatches(matches, []), matches);
    assert.deepEqual(boostExactTokenMatches([], ['NA5']), []);
});
