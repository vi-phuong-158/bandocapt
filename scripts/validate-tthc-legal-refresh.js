'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { validateManifest, validateRegistry } = require('../lib/tthc-legal-refresh');

const root = path.resolve(__dirname, '..');
const registry = JSON.parse(fs.readFileSync(path.join(root, 'data', 'tthc-legal-sources.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data', 'tthc-2026-refresh-manifest.json'), 'utf8'));
const errors = [...validateRegistry(registry), ...validateManifest(manifest, registry)];

if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
} else {
    console.log(JSON.stringify({
        sources: registry.sources.length,
        explicitRecords: manifest.records.length,
        productionMutation: manifest.production_mutation
    }));
}
