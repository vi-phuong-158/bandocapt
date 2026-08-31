'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const taxonomyPath = path.join(root, 'lib', 'location-taxonomy.js');
const logicPath = path.join(root, 'setup', 'apps-script.js');
const workbookConfigPath = path.join(root, 'lib', 'location-workbooks.js');
const staffLocationContractPath = path.join(root, 'lib', 'staff-location-contract.js');
const operationalBaselinePath = path.join(root, 'lib', 'operational-baseline.js');
const gatewayPath = path.join(root, 'setup', 'staff-gateway.js');
const adminReviewPath = path.join(root, 'setup', 'location-admin-review.js');
const runtimePath = path.join(root, 'setup', 'location-intake', 'Code.gs');
const outputPath = path.join(root, 'setup', 'location-intake', 'dist', 'Code.gs');
const manifestPath = path.join(root, 'setup', 'location-intake', 'appsscript.json');
const manifestOutputPath = path.join(root, 'setup', 'location-intake', 'dist', 'appsscript.json');
const banner = '// GENERATED FILE. Run npm run build:location-intake. Do not edit directly.\n\n';

// Script gateway được deploy dạng Web App (doPost /exec). clasp push ghi đè manifest trên Google,
// nên manifest sinh ra thiếu khối webapp sẽ xoá cấu hình Web App mà STAFF_GATEWAY_URL đang gọi.
const requiredWebapp = { executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS' };

function assertManifestKeepsWebapp_(manifestText) {
    const webapp = JSON.parse(manifestText).webapp;
    for (const [key, value] of Object.entries(requiredWebapp)) {
        if (!webapp || webapp[key] !== value) {
            throw new Error(
                `appsscript.json phải khai webapp.${key} = "${value}"; đẩy manifest thiếu khối này sẽ ` +
                'xoá Web App deployment của Staff Gateway. Xem docs/location-intake/CLASP.md.'
            );
        }
    }
}

function buildLocationIntakeAppsScript() {
    const taxonomy = fs.readFileSync(taxonomyPath, 'utf8').replace(/^#!.*\r?\n/, '');
    const logic = fs.readFileSync(logicPath, 'utf8').replace(/^#!.*\r?\n/, '');
    const workbookConfig = fs.readFileSync(workbookConfigPath, 'utf8').replace(/^#!.*\r?\n/, '');
    const staffLocationContract = fs.readFileSync(staffLocationContractPath, 'utf8').replace(/^#!.*\r?\n/, '');
    const operationalBaseline = fs.readFileSync(operationalBaselinePath, 'utf8').replace(/^#!.*\r?\n/, '');
    const gateway = fs.readFileSync(gatewayPath, 'utf8').replace(/^#!.*\r?\n/, '');
    const adminReview = fs.readFileSync(adminReviewPath, 'utf8').replace(/^#!.*\r?\n/, '');
    const runtime = fs.readFileSync(runtimePath, 'utf8').replace(/^#!.*\r?\n/, '');
    const bundle = `${banner}${taxonomy}\n\n${staffLocationContract}\n\n${operationalBaseline}\n\n${workbookConfig}\n\n${logic}\n\n${gateway}\n\n${adminReview}\n\n${runtime}\n`;
    // Syntax only: Apps Script globals are intentionally resolved when deployed.
    new Function(bundle); // eslint-disable-line no-new-func
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, bundle, 'utf8');
    // dist/ là push root của clasp, nên manifest phải nằm cạnh Code.gs.
    const manifest = fs.readFileSync(manifestPath, 'utf8');
    assertManifestKeepsWebapp_(manifest);
    fs.writeFileSync(manifestOutputPath, manifest, 'utf8');
    return { outputPath, manifestOutputPath, bytes: Buffer.byteLength(bundle) };
}

if (require.main === module) {
    const result = buildLocationIntakeAppsScript();
    process.stdout.write(`Built ${path.relative(root, result.outputPath)} (${result.bytes} bytes)\n`);
}

module.exports = { buildLocationIntakeAppsScript, outputPath, manifestOutputPath };
