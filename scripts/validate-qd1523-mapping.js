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
console.log(JSON.stringify({ sourceDocument: map.sourceDocument, rows: map.rows.length, observedCounts: counts, declaredCounts: map.annexDeclaredCounts, productionMutation: 'NO_PRODUCTION_MUTATION' }));
