'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildCitizenSummary,
    extractProcedureField,
    humanizeFeeValue,
    TTHC_DETAIL_FALLBACK,
    TTHC_FEE_FALLBACK,
} = require('../js/tthc-catalog').__test;

test('extractProcedureField đọc đúng dòng nhãn trong toàn văn thủ tục', () => {
    const text = [
        'Tên thủ tục: Cấp hộ chiếu phổ thông ở trong nước',
        'Hồ sơ: 01 tờ khai mẫu TK01.',
        'Cơ quan xử lý: Cục Quản lý xuất nhập cảnh, Bộ Công an.',
        'Kết quả: Hộ chiếu phổ thông.',
    ].join('\n');

    assert.equal(extractProcedureField(text, 'Hồ sơ'), '01 tờ khai mẫu TK01.');
    assert.equal(extractProcedureField(text, 'Cơ quan xử lý'), 'Cục Quản lý xuất nhập cảnh, Bộ Công an.');
    assert.equal(extractProcedureField(text, 'Kết quả'), 'Hộ chiếu phổ thông.');
});

test('buildCitizenSummary fallback khi guide không có đủ nhãn chuẩn', () => {
    const summary = buildCitizenSummary({
        fee: 'Không',
        text: [
            'Tên thủ tục: Việc nộp hồ sơ đăng ký cư trú',
            'Nguồn: B. CƯ TRÚ 2025.xong.docx',
            'Nội dung:',
            '1. Việc nộp hồ sơ đăng ký cư trú',
        ].join('\n'),
    });

    assert.deepEqual(
        summary.map(item => item.value),
        [
            TTHC_DETAIL_FALLBACK,
            'B. CƯ TRÚ 2025.xong.docx',
            'Không',
            TTHC_DETAIL_FALLBACK,
        ]
    );
});

test('buildCitizenSummary không lộ wording "Chưa xác minh" trong khối tóm tắt người dân', () => {
    const summary = buildCitizenSummary({
        fee: 'Chưa xác minh',
        text: [
            'Tên thủ tục: Cấp thị thực',
            'Hồ sơ: Thành phần hồ sơ xem chi tiết bên dưới.',
            'Cơ quan xử lý: Công an cấp tỉnh.',
        ].join('\n'),
    });

    const feeItem = summary.find(item => item.label === 'Lệ phí / chi phí');
    assert.equal(feeItem.value, TTHC_FEE_FALLBACK);
    assert.ok(summary.every(item => !String(item.value).includes('Chưa xác minh')));
});

test('humanizeFeeValue chuẩn hóa giá trị phí chưa xác minh', () => {
    assert.equal(humanizeFeeValue('Chưa xác minh'), TTHC_FEE_FALLBACK);
    assert.equal(humanizeFeeValue(''), TTHC_FEE_FALLBACK);
    assert.equal(humanizeFeeValue('Không'), 'Không');
});
