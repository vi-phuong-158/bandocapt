'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const governance = require('../lib/retrieval-governance');

test('governance only retains approved current records valid today', () => {
    const matches = [
        { id: 'ok', metadata: { review_status: 'approved', source_priority: 'current_procedure', cap: 'Cấp Xã', valid_from: '2025-01-01', valid_to: 'N/A' } },
        { id: 'pending', metadata: { review_status: 'pending', source_priority: 'current_procedure', cap: 'Cấp Xã' } },
        { id: 'expired', metadata: { review_status: 'approved', source_priority: 'current_procedure', cap: 'Cấp Xã', valid_to: '2025-01-01' } }
    ];
    assert.deepEqual(governance.filterGovernedMatches(matches, 'thủ tục cấp xã', new Date('2026-07-16T12:00:00+07:00')).map(m => m.id), ['ok']);
});

test('governance preserves an explicit cấp xã constraint', () => {
    const matches = [
        { id: 'xa', metadata: { review_status: 'approved', source_priority: 'current_procedure', cap_normalized: 'xa' } },
        { id: 'tinh', metadata: { review_status: 'approved', source_priority: 'current_procedure', cap_normalized: 'tinh' } }
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

test('governance filter has non-negotiable approval and priority clauses', () => {
    const filter = governance.buildGovernanceFilter([{ loai_thu_tuc: { '$eq': 'cu_tru' } }], 'xa');
    assert.deepEqual(filter.$and.slice(0, 3), [
        { review_status: { '$eq': 'approved' } },
        { source_priority: { '$eq': 'current_procedure' } },
        { cap_normalized: { '$eq': 'xa' } }
    ]);
});

test('governance detects conflicting current sources for one procedure family', () => {
    const conflict = governance.findCurrentSourceConflict([
        { id: 'a', metadata: { review_status: 'approved', source_priority: 'current_procedure', canonical_procedure_key: 'same', mau_don: 'NA12' } },
        { id: 'b', metadata: { review_status: 'approved', source_priority: 'current_procedure', canonical_procedure_key: 'same', mau_don: 'NA13' } }
    ]);
    assert.deepEqual(conflict, { key: 'same', field: 'mau_don', ids: ['a', 'b'] });
});
