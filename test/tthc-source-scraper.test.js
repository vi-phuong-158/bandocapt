'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    buildHighRiskReview,
    detectRiskFlags,
    parseCategoryPage,
    parseDetailPage,
    parseLandingPage
} = require('../scripts/scrape-phutho-tthc');

test('detectRiskFlags không coi giấy tờ cá nhân hết hiệu lực là thủ tục hết hiệu lực', () => {
    assert.deepEqual(detectRiskFlags({
        title: 'Cấp tài khoản định danh điện tử',
        processing_time: '07 ngày nếu thẻ căn cước đã hết hiệu lực',
        fee: 'Không'
    }), []);
    assert.deepEqual(detectRiskFlags({
        title: 'Thủ tục A',
        processing_time: '03 ngày',
        fee: 'Mức thu áp dụng đến hết ngày 31/12/2026'
    }), ['dated_validity_claim']);
});

test('parseLandingPage chỉ lấy URL danh mục duy nhất', () => {
    const html = `
        <a href="/thu-tuc-hanh-chinh/Quan-ly-xuat-nhap-canh-17">XNC</a>
        <a href="/thu-tuc-hanh-chinh/Quan-ly-xuat-nhap-canh-17">XNC</a>
        <a href="/article/thu-tuc-hanh-chinh/Chi-tiet-1-17">Chi tiết</a>`;
    assert.deepEqual(parseLandingPage(html), [
        'https://congan.phutho.gov.vn/thu-tuc-hanh-chinh/Quan-ly-xuat-nhap-canh-17'
    ]);
});

test('parseCategoryPage đọc title, lĩnh vực, cấp và mức độ', () => {
    const html = `<table><tr>
        <td class="tthc-title"><a href="/article/thu-tuc-hanh-chinh/Cap-ho-chieu-2357-17">Cấp hộ chiếu</a></td>
        <td class="linhvuc">Quản lý xuất nhập cảnh</td>
        <td class="capthuchien">Cấp Tỉnh</td>
        <td class="mucdo"><span>Toàn trình</span></td>
    </tr></table>`;
    const [row] = parseCategoryPage(html, 'https://congan.phutho.gov.vn/thu-tuc-hanh-chinh/x-17');
    assert.equal(row.title, 'Cấp hộ chiếu');
    assert.equal(row.level, 'Cấp Tỉnh');
    assert.equal(row.service_level, 'Toàn trình');
    assert.equal(row.source_url, 'https://congan.phutho.gov.vn/article/thu-tuc-hanh-chinh/Cap-ho-chieu-2357-17');
});

test('parseDetailPage đọc fact, section, attachment và gắn cờ nguồn giấy', () => {
    const html = `
        <h1>Thủ tục Khai báo tạm trú bằng Phiếu khai báo tạm trú</h1>
        <table class="info-table">
          <tr><td>Lĩnh vực</td><td>Quản lý xuất nhập cảnh</td></tr>
          <tr><td>Cơ quan thực hiện</td><td>Công an cấp xã</td></tr>
          <tr><td>Thời hạn giải quyết</td><td>24 giờ/07 ngày.</td></tr>
          <tr><td>Lệ phí</td><td>Không.</td></tr>
          <tr><td>Căn cứ pháp lý</td><td>Quyết định 5568/QĐ-BCA</td></tr>
        </table>
        <h2>Trình tự thực hiện</h2><ul><li>Bước 1: khai báo.</li></ul>
        <h2>Thành phần hồ sơ</h2><ol><li>Mẫu NA17 <a href="/data/NA17.pdf">Tải mẫu NA17</a></li></ol>
        <h2>Yêu cầu, điều kiện</h2><ol><li>Khai báo ngay.</li></ol>`;
    const parsed = parseDetailPage(html, 'https://congan.phutho.gov.vn/article/thu-tuc-hanh-chinh/x-2373-17');
    assert.equal(parsed.site_id, '2373-17');
    assert.equal(parsed.processing_time, '24 giờ/07 ngày.');
    assert.match(parsed.steps, /Bước 1/);
    assert.equal(parsed.attachments[0].url, 'https://congan.phutho.gov.vn/data/NA17.pdf');
    assert.deepEqual(parsed.risk_flags.sort(), ['ambiguous_processing_time', 'paper_flow_candidate']);
    assert.equal(parsed.content_hash.length, 64);
});

test('buildHighRiskReview không tự approved và chỉ gợi ý fuzzy đủ ngưỡng', () => {
    const governance = [{ review_tier: 'HIGH', id: 'tthc_1', title: 'Cấp hộ chiếu phổ thông ở trong nước', cap: 'tinh' }];
    const procedures = [{
        title: 'Cấp hộ chiếu phổ thông ở trong nước', level: 'Cấp Tỉnh', source_url: 'https://example.test/1',
        content_hash: 'abc', processing_time: '08 ngày', fee: '', agency: '', attachments: [], risk_flags: []
    }];
    const [row] = buildHighRiskReview(governance, procedures);
    assert.equal(row.match_status, 'matched');
    assert.match(row.reviewer_note, /chưa tự động phê duyệt/i);
    assert.equal(row.scraped_processing_time, '08 ngày');
});

test('buildHighRiskReview không gợi ý thủ tục cấp tỉnh cho record trung ương', () => {
    const governance = [{ review_tier: 'HIGH', id: 'tthc_tw', title: 'Xác nhận thông tin xuất nhập cảnh tại Công an cấp tỉnh', cap: 'trung-uong' }];
    const procedures = [{
        title: 'Xác nhận thông tin xuất nhập cảnh tại Công an cấp tỉnh', level: 'Cấp Tỉnh',
        source_url: 'https://example.test/1', attachments: [], risk_flags: []
    }];
    const [row] = buildHighRiskReview(governance, procedures);
    assert.equal(row.match_status, 'unmatched');
});
