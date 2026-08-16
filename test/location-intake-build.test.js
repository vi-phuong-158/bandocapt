const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const { buildLocationIntakeAppsScript, outputPath, manifestOutputPath } = require('../scripts/build-location-intake-apps-script');

test('Apps Script intake bundle is reproducible and includes one logic source', () => {
    const first = buildLocationIntakeAppsScript();
    const firstContent = fs.readFileSync(outputPath, 'utf8');
    const second = buildLocationIntakeAppsScript();
    const secondContent = fs.readFileSync(outputPath, 'utf8');
    assert.equal(first.bytes, second.bytes);
    assert.equal(firstContent, secondContent);
    assert.match(firstContent, /LocationApprovalPipeline/);
    assert.match(firstContent, /function onLocationFormSubmit/);
    assert.match(firstContent, /GENERATED FILE/);
    assert.match(firstContent, /function gatewayUtf8Bytes_\(value\)/);
    assert.match(firstContent, /computeHmacSha256Signature\(gatewayUtf8Bytes_\(message\), gatewayUtf8Bytes_\(secret\)\)/);
});

test('generated manifest keeps the Web App config so clasp push does not drop the gateway deployment', () => {
    buildLocationIntakeAppsScript();
    const manifest = JSON.parse(fs.readFileSync(manifestOutputPath, 'utf8'));
    assert.deepEqual(manifest.webapp, { executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS' });
    assert.deepEqual(manifest.executionApi, { access: 'MYSELF' });
});
