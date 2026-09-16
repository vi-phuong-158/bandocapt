'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    buildCatalogScope,
    classifyDelta,
    stableRefreshId,
    summarizeDelta,
    toVectorMetadata,
} = require('../scripts/refresh-tthc-pinecone');

function procedure(id, title, sourceDecision = '5230/QĐ-BCA-C06 ngày 18/8/2026') {
    return {
        id,
        procedureId: id.replace(/^guide_/, 'guide:'),
        title,
        category: 'can_cuoc',
        categoryLabel: 'Căn cước',
        cap: 'xa',
        fee: 'Chưa quy định.',
        sourceDecision,
        text: `Tên thủ tục: ${title}\nNguồn: ${sourceDecision}`,
    };
}

test('stable refresh IDs are deterministic and distinct', () => {
    const first = procedure('guide_can-cuoc_new-one', 'Thủ tục A');
    const second = procedure('guide_can-cuoc_new-two', 'Thủ tục B');
    assert.equal(stableRefreshId(first), stableRefreshId(first));
    assert.notEqual(stableRefreshId(first), stableRefreshId(second));
});

test('catalog scope is exactly the seven QD5230 records on canonical catalog', () => {
    const catalog = require('../data/tthc-catalog.json');
    const scope = buildCatalogScope(catalog);
    assert.equal(catalog.procedures.length, 83);
    assert.equal(scope.length, 7);
    assert.equal(scope.filter(item => item.sourceDecision.includes('1.012564')).length, 1);
    assert.equal(scope.filter(item => item.sourceDecision.includes('1.014060')).length, 1);
});

test('delta distinguishes five inserts and two exact title updates without touching out-of-scope rows', () => {
    const procedures = [
        procedure('guide_can-cuoc_new-one', 'NEW A'),
        procedure('guide_can-cuoc_new-two', 'NEW B'),
        procedure('guide_can-cuoc_new-three', 'NEW C'),
        procedure('guide_can-cuoc_new-four', 'NEW D'),
        procedure('guide_can-cuoc_new-five', 'NEW E'),
        procedure('guide_can-cuoc_updated-a', 'UPDATED A'),
        procedure('guide_can-cuoc_updated-b', 'UPDATED B'),
    ];
    const liveRows = [
        { id: 'guide_old_a_01', metadata: { source_type: 'guide', title: 'UPDATED A', content_hash: 'old-a' } },
        { id: 'guide_old_b_01', metadata: { source_type: 'guide', title: 'UPDATED B', content_hash: 'old-b' } },
        { id: 'law_01', metadata: { source_type: 'law', title: 'UPDATED A', content_hash: 'law' } },
    ];
    const delta = classifyDelta(procedures, liveRows);
    const summary = summarizeDelta(delta);
    assert.equal(delta.insert.length, 5);
    assert.equal(delta.update.length, 2);
    assert.equal(delta.duplicate.length, 0);
    assert.equal(summary.delete.length, 2);
    assert.equal(summary.outOfScopeLiveCount, 1);
});

test('metadata preserves identity and uses governed source role', () => {
    const item = procedure('guide_can-cuoc_new-one', 'Cấp, cấp đổi, cấp lại thẻ căn cước');
    const metadata = toVectorMetadata(item, '2026-09-16T00:00:00.000Z');
    assert.equal(metadata.source_type, 'guide');
    assert.equal(metadata.source_priority, 'supplemental');
    assert.equal(metadata.review_status, 'approved');
    assert.equal(metadata.canonical_procedure_key, item.procedureId);
    assert.equal(metadata.embedding_dimensions, 768);
});
