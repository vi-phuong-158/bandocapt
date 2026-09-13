#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const file = path.join(__dirname, '..', 'data', 'qd1523-procedure-map.json');
const map = JSON.parse(fs.readFileSync(file, 'utf8'));
const required = ['officialCode', 'officialName', 'domain', 'authorityLevel', 'changeType', 'sourceDocument', 'sourceLocator', 'effectiveDate'];
if (map.sourceDocument !== '1523/QĐ-BCA-C06') throw new Error('unexpected sourceDocument');
if (map.effectiveDate !== '2026-03-26') throw new Error('unexpected effectiveDate');
if (!Array.isArray(map.rows) || map.rows.length !== 51) throw new Error(`expected 51 observed rows, got ${map.rows?.length}`);
for (const [i, row] of map.rows.entries()) {
  for (const key of required) if (!(key in row)) throw new Error(`row ${i + 1} missing ${key}`);
  if (!['NEW', 'AMENDED', 'REPLACED', 'ABOLISHED'].includes(row.changeType)) throw new Error(`row ${i + 1} invalid changeType`);
  if (!/^2026-03-26$/.test(row.effectiveDate)) throw new Error(`row ${i + 1} invalid effectiveDate`);
  if (!row.sourceLocator.startsWith('PDF page ')) throw new Error(`row ${i + 1} missing PDF locator`);
}
const counts = Object.fromEntries(['NEW', 'AMENDED', 'REPLACED', 'ABOLISHED'].map(type => [type, map.rows.filter(row => row.changeType === type).length]));
if (counts.NEW !== 5 || counts.AMENDED !== 39 || counts.ABOLISHED !== 7) throw new Error(`unexpected observed counts ${JSON.stringify(counts)}`);

const amended = map.rows.filter(row => row.changeType === 'AMENDED');
const amendedByCode = new Map();
for (const row of amended) {
  if (!row.officialCode) throw new Error(`amended row missing officialCode: ${row.officialName}`);
  const entries = amendedByCode.get(row.officialCode) || [];
  entries.push(row);
  amendedByCode.set(row.officialCode, entries);
}
const expectedMultiAuthorityCodes = new Set(['1.009714', '1.012564', '1.014056']);
const duplicateCodes = [...amendedByCode.entries()].filter(([, rows]) => rows.length > 1);
if (amendedByCode.size !== 36) throw new Error(`expected 36 unique amended procedure codes, got ${amendedByCode.size}`);
if (duplicateCodes.length !== 3) throw new Error(`expected 3 duplicated authority codes, got ${duplicateCodes.length}`);
for (const [code, rows] of duplicateCodes) {
  if (!expectedMultiAuthorityCodes.has(code)) throw new Error(`unexpected multi-authority code: ${code}`);
  if (rows.length !== 2) throw new Error(`multi-authority code ${code} must have exactly two rows`);
  const levels = new Set(rows.map(row => row.authorityLevel));
  if (levels.size !== rows.length || !levels.has('tinh') || !levels.has('xa')) throw new Error(`multi-authority code ${code} must be exactly tinh + xa`);
  if (new Set(rows.map(row => row.officialName)).size !== 1) throw new Error(`multi-authority code ${code} has inconsistent officialName`);
  if (new Set(rows.map(row => row.changeType)).size !== 1) throw new Error(`multi-authority code ${code} has inconsistent changeType`);
}
for (const code of expectedMultiAuthorityCodes) if (!amendedByCode.has(code)) throw new Error(`missing expected multi-authority code: ${code}`);

const namesByCode = new Map(map.rows.filter(row => row.officialCode).map(row => [row.officialCode, row.officialName]));
const expectedResidenceNames = {
  '1.013313': 'Xác nhận nơi thường xuyên đậu, đỗ; sử dụng phương tiện vào mục đích để ở',
  '1.013314': 'Xác nhận về điều kiện diện tích bình quân nhà ở để đăng ký thường trú vào chỗ ở do thuê, mượn, ở nhờ; nhà ở, đất ở không có tranh chấp quyền sở hữu nhà ở, quyền sử dụng đất ở, không thuộc địa điểm không được đăng ký thường trú mới'
};
for (const [code, expectedName] of Object.entries(expectedResidenceNames)) {
  if (namesByCode.get(code) !== expectedName) throw new Error(`canonical residence name mismatch for ${code}`);
}
if ([...namesByCode.values()].some(name => name.includes('nhà ở đã có tranh chấp'))) throw new Error('reversed residence-dispute wording must not exist');
if ([...namesByCode.values()].some(name => name.includes('Xác nhận nơi thường trú; sử dụng phương tiện'))) throw new Error('truncated 1.013313 wording must not exist');

const newNames = map.rows.filter(row => row.changeType === 'NEW').map(row => row.officialName);
if (new Set(newNames).size !== 5) throw new Error('new procedure identities must be unique');
const abolishedCodes = map.rows.filter(row => row.changeType === 'ABOLISHED').map(row => row.officialCode);
if (new Set(abolishedCodes).size !== 7) throw new Error('abolished procedure identities must be unique');
console.log(JSON.stringify({
  sourceDocument: map.sourceDocument,
  rows: map.rows.length,
  NEW_UNIQUE_PROCEDURES: new Set(newNames).size,
  AMENDED_AUTHORITY_ROWS: amended.length,
  AMENDED_UNIQUE_PROCEDURE_CODES: amendedByCode.size,
  DUPLICATED_ACROSS_AUTHORITY_LEVELS: duplicateCodes.length,
  multiAuthorityCodes: [...expectedMultiAuthorityCodes].sort(),
  ABOLISHED_UNIQUE_PROCEDURES: new Set(abolishedCodes).size,
  productionMutation: 'NO_PRODUCTION_MUTATION'
}));
