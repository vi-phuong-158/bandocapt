'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const governance = require('../lib/retrieval-governance');

test('governance only retains approved current records valid today', () => {
    const matches = [
        { id: 'ok', metadata: { source_type: 'tthc', review_status: 'approved', source_priority: 'current_procedure', cap: 'Cấp Xã', valid_from: '2025-01-01', valid_to: 'N/A' } },
        { id: 'pending', metadata: { source_type: 'tthc', review_status: 'pending', source_priority: 'current_procedure', cap: 'Cấp Xã' } },
        { id: 'expired', metadata: { source_type: 'tthc', review_status: 'approved', source_priority: 'current_procedure', cap: 'Cấp Xã', valid_to: '2025-01-01' } }
    ];
    assert.deepEqual(governance.filterGovernedMatches(matches, 'thủ tục cấp xã', new Date('2026-07-16T12:00:00+07:00')).map(m => m.id), ['ok']);
});

test('luật/hướng dẫn (source_type khác tthc) không bị cổng approved/current chặn', () => {
    const matches = [
        { id: 'law-1', metadata: { source_type: 'law', source_priority: 'legal_basis' } },
        { id: 'guide-1', metadata: { source_type: 'guide', source_priority: 'supplemental' } },
        { id: 'tthc-pending', metadata: { source_type: 'tthc', review_status: 'pending' } },
        { id: 'unclassified', metadata: {} }
    ];
    assert.deepEqual(
        governance.filterGovernedMatches(matches, 'thủ tục cư trú').map(m => m.id),
        ['law-1', 'guide-1', 'unclassified']
    );
    assert.equal(governance.requiresProcedureGovernance({ source_type: 'tthc' }), true);
    assert.equal(governance.requiresProcedureGovernance({ source_type: 'law' }), false);
    assert.equal(governance.requiresProcedureGovernance({}), false);
});

test('mốc hiệu lực hỏng định dạng bị loại (fail-closed), N/A thì không', () => {
    const now = new Date('2026-07-16T12:00:00+07:00');
    const base = { source_type: 'tthc', review_status: 'approved', source_priority: 'current_procedure' };
    assert.equal(governance.isWithinValidity({ ...base, valid_to: 'N/A' }, now), true);
    assert.equal(governance.isWithinValidity({ ...base, valid_to: '31/12/2027' }, now), false);
    assert.equal(governance.isWithinValidity({ ...base, valid_from: 'khong-ro', valid_to: 'N/A' }, now), false);
});

test('governance preserves an explicit cấp xã constraint', () => {
    const matches = [
        { id: 'xa', metadata: { source_type: 'tthc', review_status: 'approved', source_priority: 'current_procedure', cap_normalized: 'xa' } },
        { id: 'tinh', metadata: { source_type: 'tthc', review_status: 'approved', source_priority: 'current_procedure', cap_normalized: 'tinh' } }
    ];
    assert.deepEqual(governance.filterGovernedMatches(matches, 'làm căn cước tại Công an cấp xã').map(m => m.id), ['xa']);
});

test('requestedCap chỉ nhận cấp khi câu hỏi nêu rõ, bỏ qua token địa danh', () => {
    // Tên địa danh chứa "xã"/"tỉnh" không được suy ra ràng buộc cấp.
    assert.equal(governance.requestedCap('Tôi ở xã Hy Cương, làm hộ chiếu ở đâu?'), '');
    assert.equal(governance.requestedCap('công an ở xa quá, nộp online được không'), '');
    // Chỉ nêu rõ "cấp xã"/"công an tỉnh" mới nhận diện.
    assert.equal(governance.requestedCap('làm căn cước tại Công an cấp xã'), 'xa');
    assert.equal(governance.requestedCap('nộp ở công an tỉnh Phú Thọ'), 'tinh');
});

test('governance filter chỉ bắt buộc approved/current cho source_type=tthc, bypass phần còn lại', () => {
    const filter = governance.buildGovernanceFilter([{ loai_thu_tuc: { '$eq': 'cu_tru' } }], 'xa');
    assert.deepEqual(filter, {
        '$and': [
            { '$or': [
                { source_type: { '$ne': 'tthc' } },
                { '$and': [
                    { review_status: { '$eq': 'approved' } },
                    { source_priority: { '$eq': 'current_procedure' } },
                    { cap_normalized: { '$eq': 'xa' } }
                ] }
            ] },
            { '$or': [{ loai_thu_tuc: { '$eq': 'cu_tru' } }] }
        ]
    });
});

test('governance detects conflicting current sources for one procedure family', () => {
    const conflict = governance.findCurrentSourceConflict([
        { id: 'a', metadata: { review_status: 'approved', source_priority: 'current_procedure', canonical_procedure_key: 'same', mau_don: 'NA12' } },
        { id: 'b', metadata: { review_status: 'approved', source_priority: 'current_procedure', canonical_procedure_key: 'same', mau_don: 'NA13' } }
    ]);
    assert.deepEqual(conflict, { key: 'same', field: 'mau_don', ids: ['a', 'b'] });
});
