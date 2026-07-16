'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { planUpdate } = require('../scripts/backfill-law-guide-governance');

test('planUpdate gán source_type/source_priority cho record law thiếu governance', () => {
    const update = planUpdate('law_cu_tru_ieu_10__136', { text: 'Điều 10...', dieu: 'Điều 10' });
    assert.ok(update);
    assert.equal(update.klass, 'law');
    assert.equal(update.after.source_type, 'law');
    assert.equal(update.after.source_priority, 'legal_basis');
    // Không đụng field khác trong metadata.
    assert.equal(update.metadata.text, 'Điều 10...');
    assert.equal(update.metadata.dieu, 'Điều 10');
});

test('planUpdate gán source_priority cho record guide đã có source_type nhưng thiếu priority', () => {
    const update = planUpdate('guide_cap_xa_2025_b_01_thuong_tru_01_01', { source_type: 'guide', text: '...' });
    assert.ok(update);
    assert.equal(update.klass, 'guide');
    assert.equal(update.after.source_type, 'guide');
    assert.equal(update.after.source_priority, 'supplemental');
});

test('planUpdate là no-op (idempotent) khi record đã đúng sẵn', () => {
    assert.equal(planUpdate('law_cu_tru_ieu_10__136', { source_type: 'law', source_priority: 'legal_basis' }), null);
    assert.equal(planUpdate('guide_cap_xa_2025_b_01', { source_type: 'guide', source_priority: 'supplemental' }), null);
});

test('planUpdate bỏ qua record ngoài phạm vi (tthc/tru_so/khác)', () => {
    assert.equal(planUpdate('tthc_phutho_web_2372-17', { source_type: 'tthc' }), null);
    assert.equal(planUpdate('truso-xa-001', {}), null);
    assert.equal(planUpdate('some_other_id', {}), null);
});
