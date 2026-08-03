'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const logicPath = path.join(root, 'setup', 'apps-script.js');
const runtimePath = path.join(root, 'setup', 'location-intake', 'Code.gs');
const outputPath = path.join(root, 'setup', 'location-intake', 'dist', 'Code.gs');
const banner = '// GENERATED FILE. Run npm run build:location-intake. Do not edit directly.\n\n';

function buildLocationIntakeAppsScript() {
    const logic = fs.readFileSync(logicPath, 'utf8').replace(/^#!.*\r?\n/, '');
    const runtime = fs.readFileSync(runtimePath, 'utf8').replace(/^#!.*\r?\n/, '');
    const bundle = `${banner}${logic}\n\n${runtime}\n`;
    // Syntax only: Apps Script globals are intentionally resolved when deployed.
    new Function(bundle); // eslint-disable-line no-new-func
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, bundle, 'utf8');
    return { outputPath, bytes: Buffer.byteLength(bundle) };
}

if (require.main === module) {
    const result = buildLocationIntakeAppsScript();
    process.stdout.write(`Built ${path.relative(root, result.outputPath)} (${result.bytes} bytes)\n`);
}

module.exports = { buildLocationIntakeAppsScript, outputPath };
