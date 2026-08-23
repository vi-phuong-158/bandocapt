'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sourceRoot = path.join(root, 'setup', 'location-admin-review');
const outputRoot = path.join(sourceRoot, 'dist');
const sources = [
    path.join(root, 'lib', 'location-workbooks.js'),
    path.join(root, 'setup', 'apps-script.js'),
    path.join(root, 'setup', 'location-admin-review.js'),
    path.join(root, 'setup', 'location-admin-review-container.js'),
    path.join(sourceRoot, 'Code.gs'),
];
const banner = '// GENERATED FILE. Run npm run build:location-admin-review. Do not edit directly.\n\n';

function sourceText(file) {
    return fs.readFileSync(file, 'utf8').replace(/^#!.*\r?\n/, '');
}

function buildLocationAdminReviewAppsScript() {
    const bundle = banner + sources.map(sourceText).join('\n\n');
    if (/function\s+doPost\s*\(/.test(bundle) || bundle.includes('LOCATION_GATEWAY_SECRET') || bundle.includes('StaffGateway')) {
        throw new Error('ADMIN_REVIEW_BUNDLE_GATEWAY_BOUNDARY_VIOLATION');
    }
    new Function(bundle); // Syntax only; Apps Script globals resolve after deployment.
    const manifest = fs.readFileSync(path.join(sourceRoot, 'appsscript.json'), 'utf8');
    if (Object.prototype.hasOwnProperty.call(JSON.parse(manifest), 'webapp')) {
        throw new Error('ADMIN_REVIEW_MANIFEST_MUST_NOT_DECLARE_WEBAPP');
    }
    fs.mkdirSync(outputRoot, { recursive: true });
    const outputPath = path.join(outputRoot, 'Code.gs');
    const manifestOutputPath = path.join(outputRoot, 'appsscript.json');
    fs.writeFileSync(outputPath, bundle, 'utf8');
    fs.writeFileSync(manifestOutputPath, manifest, 'utf8');
    return { outputPath, manifestOutputPath, bytes: Buffer.byteLength(bundle) };
}

if (require.main === module) {
    const result = buildLocationAdminReviewAppsScript();
    process.stdout.write(`Built ${path.relative(root, result.outputPath)} (${result.bytes} bytes)\n`);
}

module.exports = { buildLocationAdminReviewAppsScript, outputRoot };
