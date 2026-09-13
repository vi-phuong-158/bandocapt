'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { applyLegalRefreshToCatalog } = require('../lib/tthc-legal-refresh');

const root = path.resolve(__dirname, '..');
const catalogPath = path.join(root, 'data', 'tthc-catalog.json');
const indexPath = path.join(root, 'data', 'tthc-index.json');
const manifestPath = path.join(root, 'data', 'tthc-2026-refresh-manifest.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const refreshed = applyLegalRefreshToCatalog(catalog, manifest);

if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify({ mode: 'dry-run', before: catalog.procedures.length, after: refreshed.procedures.length, excluded: refreshed.legalRefresh.excludedHistoricalProcedureIds }, null, 2));
    process.exit();
}

fs.writeFileSync(catalogPath, JSON.stringify(refreshed, null, 2) + '\n', 'utf8');
fs.writeFileSync(indexPath, JSON.stringify({
    schemaVersion: 1,
    generatedAt: refreshed.generatedAt,
    procedures: refreshed.procedures.map(procedure => ({ procedure_id: procedure.procedureId, title: procedure.title, aliases: procedure.aliases || [] }))
}) + '\n', 'utf8');
console.log(JSON.stringify({ mode: 'apply', before: catalog.procedures.length, after: refreshed.procedures.length, excluded: refreshed.legalRefresh.excludedHistoricalProcedureIds }, null, 2));
