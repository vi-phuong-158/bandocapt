'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { approvedCopy, assertConfirmedWrite, sameApprovedRecord } = require('../scripts/seed-approved-law-guide-to-candidate');

function record(sourceType) {
    return { values: new Array(768).fill(0.25), metadata: { source_type: sourceType, text: 'noi dung', content_hash: 'abc' } };
}

test('approvedCopy approves law and preserves vector facts', () => {
    const copy = approvedCopy('law_01', record('law'), '2026-07-17T00:00:00.000Z');
    assert.equal(copy.metadata.source_type, 'law');
    assert.equal(copy.metadata.source_priority, 'legal_basis');
    assert.equal(copy.metadata.review_status, 'approved');
    assert.equal(copy.metadata.text, 'noi dung');
    assert.equal(copy.values.length, 768);
});

test('approvedCopy rejects invalid vector and ignores unrelated records', () => {
    assert.equal(approvedCopy('other_01', record('other'), '2026-07-17T00:00:00.000Z'), null);
    assert.throws(() => approvedCopy('guide_01', { values: [], metadata: {} }, '2026-07-17T00:00:00.000Z'), /768/);
});

test('write confirmation must name source and target explicitly', () => {
    assert.doesNotThrow(() => assertConfirmedWrite([
        '--source=production', '--target=candidate', '--confirm-target=candidate'
    ], 'production', 'candidate'));
    assert.throws(() => assertConfirmedWrite(['--source=production', '--target=candidate'], 'production', 'candidate'), /confirm-target/);
    assert.throws(() => assertConfirmedWrite([
        '--source=production', '--target=production', '--confirm-target=production'
    ], 'production', 'production'), /khac nhau/);
});

test('sameApprovedRecord compares vector and metadata exactly', () => {
    const expected = approvedCopy('guide_01', record('guide'), '2026-07-17T00:00:00.000Z');
    assert.equal(sameApprovedRecord(expected, expected), true);
    assert.equal(sameApprovedRecord({ ...expected, metadata: { ...expected.metadata, reviewed_at: 'later' } }, expected), true);
    assert.equal(sameApprovedRecord({ ...expected, metadata: { ...expected.metadata, review_status: 'pending' } }, expected), false);
});
