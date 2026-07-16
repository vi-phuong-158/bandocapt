'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const governance = require('../lib/retrieval-governance');

const NOW = new Date('2026-07-16T12:00:00+07:00');

test('governance only retains approved records with their expected source role', () => {
    const matches = [
        { id: 'tthc', metadata: { source_type: 'tthc', review_status: 'approved', source_priority: 'current_procedure', cap_normalized: 'xa', valid_to: 'N/A' } },
        { id: 'law', metadata: { source_type: 'law', review_status: 'approved', source_priority: 'legal_basis', valid_to: 'N/A' } },
        { id: 'guide', metadata: { source_type: 'guide', review_status: 'approved', source_priority: 'supplemental', cap_normalized: 'xa', valid_to: 'N/A' } },
        { id: 'pending-guide', metadata: { source_type: 'guide', review_status: 'pending', source_priority: 'supplemental' } },
        { id: 'wrong-role', metadata: { source_type: 'law', review_status: 'approved', source_priority: 'supplemental' } },
        { id: 'unknown', metadata: { review_status: 'approved', source_priority: 'current_procedure' } },
        { id: 'expired', metadata: { source_type: 'guide', review_status: 'approved', source_priority: 'supplemental', valid_to: '2025-01-01' } }
    ];

    assert.deepEqual(governance.filterGovernedMatches(matches, 'thủ tục cấp xã', NOW).map(match => match.id), ['tthc', 'law', 'guide']);
});

test('governance preserves an explicit cấp constraint for tthc/guide but not law', () => {
    const matches = [
        { id: 'tthc-xa', metadata: { source_type: 'tthc', review_status: 'approved', source_priority: 'current_procedure', cap_normalized: 'xa' } },
        { id: 'guide-tinh', metadata: { source_type: 'guide', review_status: 'approved', source_priority: 'supplemental', cap_normalized: 'tinh' } },
        { id: 'law-no-cap', metadata: { source_type: 'law', review_status: 'approved', source_priority: 'legal_basis' } }
    ];
    assert.deepEqual(governance.filterGovernedMatches(matches, 'làm căn cước tại Công an cấp xã', NOW).map(match => match.id), ['tthc-xa', 'law-no-cap']);
});

test('mốc hiệu lực hỏng định dạng bị loại fail-closed, N/A thì không', () => {
    const approvedGuide = { source_type: 'guide', review_status: 'approved', source_priority: 'supplemental' };
    assert.equal(governance.isWithinValidity({ ...approvedGuide, valid_to: 'N/A' }, NOW), true);
    assert.equal(governance.isWithinValidity({ ...approvedGuide, valid_to: '31/12/2027' }, NOW), false);
    assert.equal(governance.isWithinValidity({ ...approvedGuide, valid_from: 'khong-ro', valid_to: 'N/A' }, NOW), false);
});

test('requestedCap chỉ nhận cấp khi câu hỏi nêu rõ, bỏ qua token địa danh', () => {
    assert.equal(governance.requestedCap('Tôi ở xã Hy Cương, làm hộ chiếu ở đâu?'), '');
    assert.equal(governance.requestedCap('công an ở xa quá, nộp online được không'), '');
    assert.equal(governance.requestedCap('làm căn cước tại Công an cấp xã'), 'xa');
    assert.equal(governance.requestedCap('nộp ở công an tỉnh Phú Thọ'), 'tinh');
});

test('Pinecone filter fail-closed theo source role và giữ law không có cấp', () => {
    const filter = governance.buildGovernanceFilter([{ loai_thu_tuc: { '$eq': 'cu_tru' } }], 'xa');
    assert.deepEqual(filter, {
        '$and': [
            { review_status: { '$eq': 'approved' } },
            { '$or': [
                { '$and': [
                    { source_type: { '$eq': 'tthc' } },
                    { source_priority: { '$eq': 'current_procedure' } },
                    { cap_normalized: { '$eq': 'xa' } }
                ] },
                { '$and': [
                    { source_type: { '$eq': 'law' } },
                    { source_priority: { '$eq': 'legal_basis' } }
                ] },
                { '$and': [
                    { source_type: { '$eq': 'guide' } },
                    { source_priority: { '$eq': 'supplemental' } },
                    { cap_normalized: { '$eq': 'xa' } }
                ] }
            ] },
            { '$or': [{ loai_thu_tuc: { '$eq': 'cu_tru' } }] }
        ]
    });
});

test('context keeps an approved current procedure when rerank would otherwise omit it', () => {
    const matches = [
        { id: 'guide', metadata: { source_type: 'guide', review_status: 'approved', source_priority: 'supplemental' } },
        { id: 'law', metadata: { source_type: 'law', review_status: 'approved', source_priority: 'legal_basis' } },
        { id: 'current', metadata: { source_type: 'tthc', review_status: 'approved', source_priority: 'current_procedure' } }
    ];
    assert.deepEqual(governance.prioritizeCurrentProcedureMatches(matches, 2).map(match => match.id), ['current', 'law']);
});

test('governance detects conflicting current sources for one procedure family', () => {
    const conflict = governance.findCurrentSourceConflict([
        { id: 'a', metadata: { review_status: 'approved', source_priority: 'current_procedure', canonical_procedure_key: 'same', mau_don: 'NA12' } },
        { id: 'b', metadata: { review_status: 'approved', source_priority: 'current_procedure', canonical_procedure_key: 'same', mau_don: 'NA13' } }
    ]);
    assert.deepEqual(conflict, { key: 'same', field: 'mau_don', ids: ['a', 'b'] });
});
