#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const manifestFile = path.join(root, 'data', 'tthc-2026-refresh-manifest.json');
const qd1523File = path.join(root, 'data', 'qd1523-procedure-map.json');
const apply = process.argv.includes('--apply');
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
const qd1523 = JSON.parse(fs.readFileSync(qd1523File, 'utf8'));

const qd1523ByCode = new Map(qd1523.rows.filter(row => row.officialCode).map(row => [row.officialCode, row]));
const qd4245Matches = new Map([
    ['5568-tinh-01', ['1.001456', 'Cấp hộ chiếu phổ thông ở trong nước cho công dân Việt Nam']],
    ['5568-tinh-02', ['1.010384', 'Khôi phục giá trị sử dụng hộ chiếu phổ thông']],
    ['5568-tinh-03', ['1.001445', 'Trình báo mất hộ chiếu phổ thông']],
    ['5568-tw-01', ['1.001471', 'Cấp hộ chiếu phổ thông ở trong nước cho công dân Việt Nam']],
    ['5568-tw-02', ['1.010382', 'Khôi phục giá trị sử dụng hộ chiếu phổ thông']],
    ['5568-tw-03', ['2.000539', 'Trình báo mất hộ chiếu phổ thông']],
    ['guide:xuat-nhap-canh:trinh-bao-mat-ho-chieu-pho-thong-thuc-hien-tai-cap-xa', ['1.010386', 'Trình báo mất hộ chiếu phổ thông']]
]);
const qd1523Matches = new Map([
    ['guide:cu-tru:dang-ky-tam-tru', '1.004194'],
    ['guide:cu-tru:dang-ky-thuong-tru', '1.004222'],
    ['guide:cu-tru:xoa-dang-ky-tam-tru', '1.010028'],
    ['guide:cu-tru:xoa-dang-ky-thuong-tru', '1.003197']
]);
const qd1523Unchanged = new Set([
    'guide:cu-tru:dieu-chinh-thong-tin-ve-cu-tru-trong-co-so-du-lieu-ve-cu-tru',
    'guide:cu-tru:gia-han-tam-tru',
    'guide:cu-tru:khai-bao-tam-vang',
    'guide:cu-tru:khai-bao-thong-tin-ve-cu-tru-doi-voi-nguoi-chua-du-dieu-kien-dang-ky-thuong-tru-dang-ky-tam-tru',
    'guide:cu-tru:tach-ho',
    'guide:cu-tru:thong-bao-luu-tru',
    'guide:cu-tru:xac-nhan-thong-tin-ve-cu-tru'
]);
const qd1523OutOfScope = new Set([
    '5568-tinh-08',
    '5568-tinh-09',
    '5568-tinh-10',
    'guide:cu-tru:truong-hop-cong-dan-co-su-dieu-chinh-ve-ho-tich-ma-cac-thong-tin-nay-da-duoc-cap-nhat-chia-se-tu-co-so-du-lieu-ho-tich-dien-tu-thi-cong-dan-khong-phai-thuc-hien-thu-tuc-dieu-chinh-thong-tin-ve-cu-tru',
    'guide:cu-tru:viec-nop-ho-so-dang-ky-cu-tru'
]);

function decisionFor(record) {
    const exact4245 = qd4245Matches.get(record.procedure_id);
    if (exact4245) {
        const [officialCode, officialName] = exact4245;
        return {
            classification: 'AMENDED', officialCode, officialName,
            method: 'EXACT_OFFICIAL_NAME_AND_AUTHORITY',
            reason: `Exact official name and ${record.old_level} authority match to QĐ4245 procedure ${officialCode}.`
        };
    }
    const qd1523Code = qd1523Matches.get(record.procedure_id);
    if (qd1523Code) {
        const official = qd1523ByCode.get(qd1523Code);
        return {
            classification: 'AMENDED', officialCode: qd1523Code, officialName: official.officialName,
            method: 'EXACT_OFFICIAL_NAME_AND_AUTHORITY',
            reason: `Exact official name and xã authority match to QĐ1523 procedure ${qd1523Code}.`
        };
    }
    if (qd1523Unchanged.has(record.procedure_id)) {
        return {
            classification: 'UNCHANGED', officialCode: null, officialName: null,
            method: 'EXHAUSTIVE_ANNEX_ABSENCE',
            reason: 'The QĐ1523 cư trú annex is exhaustive for new/amended/abolished procedures; this exact procedure name is absent and has no later applicable source in the registry.'
        };
    }
    if (qd1523OutOfScope.has(record.procedure_id) || record.procedure_id.startsWith('guide:dang-ky-xe:') || record.procedure_id.startsWith('guide:khieu-nai-to-cao:') || record.procedure_id.startsWith('guide:vu-khi:')) {
        return {
            classification: 'OUT_OF_SCOPE', officialCode: null, officialName: null,
            method: 'OUT_OF_SCOPE_ANNEX_DOMAIN',
            reason: 'The internal item is not a procedure served by QĐ1523’s annex scope; it must be reconciled against its own competent official source.'
        };
    }
    if (record.source_url_ref === '1523/QĐ-BCA-C06') {
        return {
            classification: 'NEEDS_LEGAL_REVIEW', officialCode: null, officialName: null,
            method: 'NO_EXACT_OFFICIAL_IDENTITY',
            reason: 'QĐ1523 covers the field, but the legacy guide title/domain is truncated or differs from the official procedure identity; no exact code + name + authority match exists.'
        };
    }
    if (record.source_url_ref === '4245/QĐ-BCA-QLXNC') {
        return {
            classification: 'NEEDS_LEGAL_REVIEW', officialCode: null, officialName: null,
            method: 'NO_EXACT_OFFICIAL_IDENTITY',
            reason: 'The QĐ4245 captured annex has no exact official code + name + authority match for this legacy record; no successor is inferred.'
        };
    }
    return {
        classification: 'NEEDS_LEGAL_REVIEW', officialCode: null, officialName: null,
        method: 'NO_EXACT_OFFICIAL_IDENTITY',
        reason: 'The later QĐ5230 source takes precedence, but the captured evidence has no exact official code + name + authority match for this legacy record.'
    };
}

// This script's decisionFor() is a frozen, one-time snapshot of the 2026-09-13 reconciliation pass. A
// record already re-audited by a later pass (see 2026-09-15 completeness audit: OUT_OF_SCOPE records for
// dang_ky_xe/khieu_nai_to_cao/thuong_tru/vu_khi were found to only mean "outside QĐ1523's annex", not
// "verified current", and were moved to NEEDS_LEGAL_REVIEW against their own newly discovered 2026
// sources) must not be silently reprocessed and reverted by rerunning this script.
const reconciled = [];
for (const record of manifest.records) {
    if (record.classification !== 'NEEDS_LEGAL_REVIEW' && record.reconciliation?.initialClassification !== 'NEEDS_LEGAL_REVIEW') continue;
    if (record.reconciliation?.reconciledAt && record.reconciliation.reconciledAt !== '2026-09-13') continue;
    const decision = decisionFor(record);
    record.classification = decision.classification;
    record.new_procedure_id = decision.officialCode;
    record.new_name = decision.officialName;
    record.confidence = decision.classification === 'NEEDS_LEGAL_REVIEW' ? 'low' : 'high';
    record.document_changes = decision.classification === 'AMENDED'
        ? `Deterministic reconciliation: ${decision.reason}`
        : decision.reason;
    record.evidence = `${decision.reason} Source precedence: latest applicable official source wins.`;
    record.reconciliation = {
        initialClassification: 'NEEDS_LEGAL_REVIEW',
        reconciledAt: '2026-09-13',
        result: decision.classification,
        matchMethod: decision.method,
        matchedOfficialCode: decision.officialCode,
        reason: decision.reason
    };
    reconciled.push(record);
}

const summary = Object.fromEntries(['AMENDED', 'UNCHANGED', 'OUT_OF_SCOPE', 'NEEDS_LEGAL_REVIEW'].map(classification => [classification, reconciled.filter(record => record.classification === classification).length]));
if (reconciled.length !== 76) throw new Error(`expected to reconcile 76 original review records, got ${reconciled.length}`);
if (summary.AMENDED !== 11 || summary.UNCHANGED !== 7 || summary.OUT_OF_SCOPE !== 19 || summary.NEEDS_LEGAL_REVIEW !== 39) throw new Error(`unexpected reconciliation result: ${JSON.stringify(summary)}`);
if (reconciled.filter(record => record.classification === 'NEEDS_LEGAL_REVIEW').some(record => !record.reconciliation.reason)) throw new Error('remaining reviews require a concrete reason');

if (apply) fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ mode: apply ? 'apply' : 'check', reviewedRecords: reconciled.length, result: summary, productionMutation: manifest.production_mutation }));
