'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    planUpdate,
    buildAudit,
    buildBackupManifest,
    verifyUpdatedRecord,
    verifyRestoredRecord,
    assertConfirmedWrite
} = require('../scripts/backfill-law-guide-governance');

test('planUpdate labels law/guide but defaults missing review status to pending', () => {
    const law = planUpdate('law_cu_tru_dieu_10__136', { text: 'Điều 10...', dieu: 'Điều 10' });
    assert.ok(law);
    assert.deepEqual(law.after, { source_type: 'law', source_priority: 'legal_basis', review_status: 'pending' });
    assert.equal(law.metadata.text, 'Điều 10...');

    const guide = planUpdate('guide_cap_xa_2025_b_01_thuong_tru_01_01', { source_type: 'guide', text: '...' });
    assert.ok(guide);
    assert.deepEqual(guide.after, { source_type: 'guide', source_priority: 'supplemental', review_status: 'pending' });
});

test('planUpdate preserves an existing review decision and is idempotent once labels match', () => {
    const superseded = planUpdate('guide_cap_xa_2025_b_01', { review_status: 'superseded' });
    assert.equal(superseded.after.review_status, 'superseded');
    assert.equal(planUpdate('law_cu_tru_dieu_10__136', {
        source_type: 'law', source_priority: 'legal_basis', review_status: 'pending'
    }), null);
});

test('audit isolates full-procedure guide records for human review', () => {
    const guideId = 'guide_cap_xa_2025_a_01_01';
    const audit = buildAudit([guideId, 'law_cu_tru_dieu_10__136'], {
        [guideId]: { metadata: { source_type: 'guide', section: 'XNC > Toàn văn thủ tục' } },
        law_cu_tru_dieu_10__136: { metadata: {} }
    });
    assert.deepEqual(audit.byClass, { guide: 1, law: 1 });
    assert.deepEqual(audit.fullProcedureGuideIds, [guideId]);
});

test('backup manifest stores complete original records and verification protects invariants', () => {
    const before = { id: 'law_1', values: [0.1, 0.2], metadata: { text: 'Điều 1', content_hash: 'hash' } };
    const update = planUpdate('law_1', before.metadata);
    const after = { id: 'law_1', values: [0.1, 0.2], metadata: { ...update.metadata } };
    const manifest = buildBackupManifest({ indexName: 'idx', namespace: 'ns', records: [before], purpose: 'pre' });
    assert.equal(manifest.records[0].values.length, 2);
    assert.doesNotThrow(() => verifyUpdatedRecord(before, after, update));
    assert.doesNotThrow(() => verifyRestoredRecord(before, before));
    assert.throws(() => verifyRestoredRecord(before, { ...before, metadata: { text: 'khác', content_hash: 'hash' } }), /Rollback/);
});

test('write modes require an explicit namespace confirmation', () => {
    assert.doesNotThrow(() => assertConfirmedWrite(['--namespace=ns', '--confirm-namespace=ns'], 'ns'));
    assert.throws(() => assertConfirmedWrite(['--namespace=ns'], 'ns'), /confirm-namespace/);
    assert.throws(() => assertConfirmedWrite(['--namespace=other', '--confirm-namespace=other'], 'ns'), /namespace đích/);
});
