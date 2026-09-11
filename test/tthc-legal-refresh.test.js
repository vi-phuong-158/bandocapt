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
