'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { validateManifest, validateQd5230NewProcedures, validateRegistry } = require('../lib/tthc-legal-refresh');

const root = path.resolve(__dirname, '..');
const registry = JSON.parse(fs.readFileSync(path.join(root, 'data', 'tthc-legal-sources.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data', 'tthc-2026-refresh-manifest.json'), 'utf8'));
const qd1523Map = JSON.parse(fs.readFileSync(path.join(root, 'data', 'qd1523-procedure-map.json'), 'utf8'));
const errors = [
    ...validateRegistry(registry),
    ...validateManifest(manifest, registry),
    ...validateQd5230NewProcedures(manifest, qd1523Map)
];

if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
} else {
    const qd5230 = manifest.known_missing_procedures.find(item => item.source_document_number === '5230/QĐ-BCA-C06').qd5230_final_reconciliation;
    console.log(JSON.stringify({
        sources: registry.sources.length,
        explicitRecords: manifest.records.length,
        qd5230PublishedNewRows: qd5230.published_new_rows,
        qd5230UniqueNewTitles: qd5230.unique_new_titles,
        productionMutation: manifest.production_mutation
    }));
}
