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
    // 2026-09-15 completeness audit found that the 2026-09-13 reconciliation's OUT_OF_SCOPE bucket for
    // dang_ky_xe/khieu_nai_to_cao/thuong_tru/vu_khi only meant "outside QĐ1523's own annex scope", not
    // "verified current" — those domains have their own newly discovered 2026 sources (37/2026/TT-BCA,
    // 236/2026/NĐ-CP, 131/2026/TT-BCA, 118/2025/QH15, 70/2026/TT-BCA) that were never reconciled. 17 of
    // the original 19 OUT_OF_SCOPE records were reclassified to NEEDS_LEGAL_REVIEW with concrete evidence
    // (see docs/tthc/TTHC_2026_LEGAL_COMPLETENESS_FINAL_AUDIT.md).
    // 2026-09-15 CLOSURE round: the task's classification contract for this round only allows
    // CURRENT/AMENDED/ABOLISHED/NEW/NEEDS_LEGAL_REVIEW — OUT_OF_SCOPE is no longer an accepted terminal
    // state, so the last 2 non-procedure cư trú guide fragments were also moved to NEEDS_LEGAL_REVIEW
    // (see docs/tthc/TTHC_2026_LEGAL_COMPLETENESS_CLOSURE.md) with a reason asking whether they are even
    // distinct TTHC at all, a question this audit cannot answer without owner/product input.
    assert.deepEqual(Object.fromEntries(['AMENDED', 'UNCHANGED', 'OUT_OF_SCOPE', 'NEEDS_LEGAL_REVIEW'].map(classification => [
        classification,
        reconciled.filter(record => record.classification === classification).length
    ])), { AMENDED: 11, UNCHANGED: 7, OUT_OF_SCOPE: 0, NEEDS_LEGAL_REVIEW: 58 });
    assert.ok(reconciled.every(record => record.reconciliation.matchMethod && record.reconciliation.reason));
    const allowedNeedsReviewMethods = new Set(['NO_EXACT_OFFICIAL_IDENTITY', 'NEW_2026_SOURCE_PENDING_FULL_TEXT_RECONCILIATION', 'NOT_A_DISTINCT_PROCEDURE_PENDING_PRODUCT_DECISION']);
    assert.ok(reconciled.filter(record => record.classification === 'NEEDS_LEGAL_REVIEW').every(record => allowedNeedsReviewMethods.has(record.reconciliation.matchMethod)));
});

test('QĐ5230 NEW procedures: 10 published rows reconcile to 5 unique titles, all added to the catalog at cấp xã, with 28/28 ABOLISHED old procedures accounted for', () => {
    assert.deepEqual(governance.validateQd5230NewProcedures(manifest, qd1523Map), []);
    const entry = manifest.known_missing_procedures.find(item => item.source_document_number === '5230/QĐ-BCA-C06');
    const r = entry.qd5230_final_reconciliation;
    assert.equal(r.published_new_rows, 10);
    assert.equal(r.unique_new_titles, 5);
    assert.deepEqual(r.authority_distribution, { trung_uong: 2, tinh: 3, xa: 5 });
    // 2026-09-15 FINAL_CATALOG_CLOSURE round: the owner-provided PDF's Phần I mục 1 (NEW table) was
    // read directly and confirmed to genuinely omit a "Số hồ sơ TTHC" column (unlike mục 2/3, which
    // both carry codes) - status upgraded from UNRESOLVED to CONFIRMED_NOT_PUBLISHED.
    assert.equal(r.official_new_codes_status, 'CONFIRMED_NOT_PUBLISHED');
    // All 5 NEW titles were added to data/tthc-catalog.json at cấp xã (matching the project's own
    // "ưu tiên cấp xã" scope decision - see docs/brain/03-decisions.md [2026-07-15] - and the fact
    // every can_cuoc record the catalog ever held, including the 14 just-abolished ones, was cấp xã).
    assert.ok(r.titles.every(title => title.action === 'ADD_NEW' && title.canonical_id_xa));
    // Every one of the full 28 QĐ5230-abolished old procedures (6 trung ương + 8 tỉnh + 14 xã, read
    // directly from Phần I mục 3) is now tracked; the 14 xã ones (the only ones ever live in the
    // catalog) are each mapped to exactly one of the 5 NEW titles with PRIMARY_CONFIRMED evidence.
    const abolished5230 = manifest.records.filter(record => record.classification === 'ABOLISHED' && record.legal_basis.includes('5230/QĐ-BCA-C06'));
    assert.equal(abolished5230.length, 28);
    const xaAbolished = abolished5230.filter(record => record.old_level === 'xa');
    assert.equal(xaAbolished.length, 14);
    assert.ok(xaAbolished.every(record => record.new_procedure_id && record.qd5230_catalog_closure?.evidence_quality === 'PRIMARY_CONFIRMED'));
    const nonXaAbolished = abolished5230.filter(record => record.old_level !== 'xa');
    assert.equal(nonXaAbolished.length, 14);
    assert.ok(nonXaAbolished.every(record => record.qd5230_catalog_closure?.catalog_action === 'NOT_APPLICABLE_NEVER_IN_CURRENT_CATALOG'));
    // The catalog itself must actually contain the 5 new xã-level procedures now.
    for (const title of r.titles) {
        assert.ok(catalog.procedures.some(procedure => procedure.procedureId === title.canonical_id_xa), `catalog missing ${title.canonical_id_xa}`);
    }
});
