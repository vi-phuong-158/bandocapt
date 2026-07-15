'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCommuneReview, extractFormCodes, summary } = require('../scripts/generate-phutho-xa-review');
const { buildApprovalManifest } = require('../scripts/approve-phutho-xa-review');
const { buildApprovedRecords, categoryKey, isVerifiedImportedRecord } = require('../scripts/import-phutho-xa-to-pinecone');
const fs = require('node:fs');
const path = require('node:path');
const { parseCsv } = require('../scripts/scrape-phutho-tthc');

function procedure(overrides = {}) {
    return {
        site_id: '1-2', title: 'Đăng ký cư trú', category: 'Cư trú', level: 'Cấp Xã',
        service_level: 'Toàn trình', agency: 'Công an cấp xã', processing_time: '03 ngày',
        fee: 'Không', documents: 'Tờ khai TT01', attachments: [], online_submission_url: '',
        source_url: 'https://example.test/1', content_hash: 'abc', risk_flags: [], ...overrides
    };
}

test('buildCommuneReview chỉ lấy cấp xã và đề xuất cập nhật khi tiêu đề khớp', () => {
    const rows = buildCommuneReview([
        procedure(),
        procedure({ site_id: '2-3', level: 'Cấp Tỉnh' })
    ], [{ review_tier: 'HIGH', cap: 'xa', id: 'tthc_xa-01', title: 'Đăng ký cư trú' }]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].existing_id, 'tthc_xa-01');
    assert.equal(rows[0].recommended_action, 'update_existing');
    assert.equal(rows[0].review_status, 'ready_for_approval');
});

test('nguồn Phiếu/NA17 được liệt kê nhưng đề xuất loại khỏi corpus hiện hành', () => {
    const [row] = buildCommuneReview([
        procedure({
            title: 'Khai báo tạm trú bằng Phiếu khai báo tạm trú',
            documents: 'Mẫu NA17',
            risk_flags: ['paper_flow_candidate', 'ambiguous_processing_time']
        })
    ], []);
    assert.equal(row.recommended_action, 'exclude_superseded');
    assert.equal(row.review_status, 'decision_recorded');
    assert.equal(row.final_decision, 'reject');
    assert.match(row.adjustment_needed, /không nhập corpus/i);
    assert.deepEqual(row.form_codes, ['NA17']);
});

test('extractFormCodes loại trùng và summary đếm đúng hành động', () => {
    assert.deepEqual(extractFormCodes(procedure({
        documents: 'Dùng TK01 và TK01',
        attachments: [{ title: 'Mẫu TT01', url: '/TT01.pdf' }]
    })), ['TK01', 'TT01']);
    const stats = summary([
        { category: 'A', recommended_action: 'create_new', review_status: 'ready_for_approval' },
        { category: 'A', recommended_action: 'update_existing', review_status: 'ready_for_approval' },
        { category: 'B', recommended_action: 'exclude_superseded', review_status: 'needs_review' }
    ]);
    assert.deepEqual({ total: stats.total, active: stats.activeCandidates, excluded: stats.excluded }, { total: 3, active: 2, excluded: 1 });
});

test('buildApprovalManifest chỉ chấp nhận đúng phạm vi 42 hiện hành và 1 Phiếu/NA17 bị loại', () => {
    const rows = Array.from({ length: 42 }, (_, index) => ({
        site_id: `xa-${index}`, proposed_id: `tthc_xa_${index}`, recommended_action: 'create_new', content_hash: `hash-${index}`
    }));
    rows.push({ site_id: '2373-17', proposed_id: 'tthc_phutho_xa_2373-17', recommended_action: 'exclude_superseded', content_hash: 'paper' });
    const manifest = buildApprovalManifest(rows, Buffer.from('snapshot'), '2026-07-15T00:00:00.000Z');
    assert.equal(Object.keys(manifest.decisions_by_site_id).length, 43);
    assert.equal(manifest.decisions_by_site_id['xa-0'].final_decision, 'approve');
    assert.equal(manifest.decisions_by_site_id['2373-17'].final_decision, 'reject');
});

test('buildApprovedRecords chỉ tạo 42 record đã duyệt và giữ facts nguồn cấp xã', () => {
    const root = path.resolve(__dirname, '..');
    const snapshotBuffer = fs.readFileSync(path.join(root, 'data/tthc-phutho-source.json'));
    const snapshot = JSON.parse(snapshotBuffer);
    const review = parseCsv(fs.readFileSync(path.join(root, 'data/tthc-phutho-xa-review.csv'), 'utf8'));
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data/tthc-phutho-xa-review-decisions.json'), 'utf8'));
    const records = buildApprovedRecords(snapshot, review, manifest, '2026-07-15T00:00:00.000Z', snapshotBuffer);
    assert.equal(records.length, 42);
    assert.ok(records.every(record => record.metadata.review_status === 'approved'));
    assert.ok(records.every(record => record.metadata.cap === 'xa'));
    assert.ok(records.every(record => record.values === undefined));
    assert.ok(!records.some(record => record.id.includes('2373-17')));
    assert.equal(categoryKey('Lĩnh vực đăng ký, quản lý cư trú'), 'cu_tru');
});

test('isVerifiedImportedRecord chỉ cho --resume bỏ qua vector đã xác minh đầy đủ', () => {
    const expected = { metadata: { content_hash: 'expected', review_status: 'approved' } };
    assert.equal(isVerifiedImportedRecord({ values: new Array(768), metadata: expected.metadata }, expected), true);
    assert.equal(isVerifiedImportedRecord({ values: new Array(768), metadata: { content_hash: 'wrong', review_status: 'approved' } }, expected), false);
    assert.equal(isVerifiedImportedRecord({ values: [], metadata: expected.metadata }, expected), false);
});
