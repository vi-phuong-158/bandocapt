'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const governance = require('../lib/tthc-legal-refresh');

const root = path.resolve(__dirname, '..');
const registry = JSON.parse(fs.readFileSync(path.join(root, 'data/tthc-legal-sources.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data/tthc-2026-refresh-manifest.json'), 'utf8'));
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/tthc-catalog.json'), 'utf8'));
const qd1523Map = JSON.parse(fs.readFileSync(path.join(root, 'data/qd1523-procedure-map.json'), 'utf8'));

test('legal source registry only admits dated official sources', () => {
    assert.deepEqual(governance.validateRegistry(registry), []);
    assert.ok(registry.sources.some(source => source.document_number === '5230/QĐ-BCA-C06'));
    assert.ok(registry.sources.some(source => source.document_number === '4245/QĐ-BCA-QLXNC'));
});

test('manifest rejects obsolete căn cước procedures from the public catalog', () => {
    assert.deepEqual(governance.validateManifest(manifest, registry), []);
    const refreshed = governance.applyLegalRefreshToCatalog(catalog, manifest);
    const listed = new Set(refreshed.procedures.map(procedure => procedure.procedureId));
    const abolished = manifest.records.filter(record => record.classification === 'ABOLISHED');
    assert.ok(abolished.length >= 14);
    assert.ok(abolished.every(record => !listed.has(record.procedure_id)));
    assert.equal(refreshed.legalRefresh.excludedHistoricalProcedureIds.length, abolished.length);
});

test('a legal source beats an accessible legacy guide when the procedure is abolished', () => {
    const legacy = { procedureId: 'legacy', title: 'Legacy guide', category: 'can_cuoc', categoryLabel: 'Căn cước' };
    const refreshed = governance.applyLegalRefreshToCatalog({ procedures: [legacy] }, {
        schema_version: 1,
        records: [{ procedure_id: 'legacy', classification: 'ABOLISHED' }]
    });
    assert.deepEqual(refreshed.procedures, []);
});

test('QĐ1523 preserves 36 amended identities across 39 authority rows and canonical residence names', () => {
    const amended = qd1523Map.rows.filter(row => row.changeType === 'AMENDED');
    const byCode = new Map();
    for (const row of amended) byCode.set(row.officialCode, [...(byCode.get(row.officialCode) || []), row]);
    assert.equal(amended.length, 39);
    assert.equal(byCode.size, 36);
    for (const code of ['1.009714', '1.012564', '1.014056']) {
        assert.deepEqual(new Set(byCode.get(code).map(row => row.authorityLevel)), new Set(['tinh', 'xa']));
    }
    assert.equal(byCode.get('1.013313')[0].officialName, 'Xác nhận nơi thường xuyên đậu, đỗ; sử dụng phương tiện vào mục đích để ở');
    assert.equal(byCode.get('1.013314')[0].officialName, 'Xác nhận về điều kiện diện tích bình quân nhà ở để đăng ký thường trú vào chỗ ở do thuê, mượn, ở nhờ; nhà ở, đất ở không có tranh chấp quyền sở hữu nhà ở, quyền sử dụng đất ở, không thuộc địa điểm không được đăng ký thường trú mới');
    assert.ok(!qd1523Map.rows.some(row => row.officialName.includes('nhà ở đã có tranh chấp')));
});

test('every originally unresolved record has a deterministic disposition and any remaining review has a concrete reason', () => {
    const reconciled = manifest.records.filter(record => record.reconciliation?.initialClassification === 'NEEDS_LEGAL_REVIEW');
    assert.equal(reconciled.length, 76);
    assert.deepEqual(Object.fromEntries(['AMENDED', 'UNCHANGED', 'OUT_OF_SCOPE', 'NEEDS_LEGAL_REVIEW'].map(classification => [
        classification,
        reconciled.filter(record => record.classification === classification).length
    ])), { AMENDED: 11, UNCHANGED: 7, OUT_OF_SCOPE: 19, NEEDS_LEGAL_REVIEW: 39 });
    assert.ok(reconciled.every(record => record.reconciliation.matchMethod && record.reconciliation.reason));
    assert.ok(reconciled.filter(record => record.classification === 'NEEDS_LEGAL_REVIEW').every(record => record.reconciliation.matchMethod === 'NO_EXACT_OFFICIAL_IDENTITY'));
});
