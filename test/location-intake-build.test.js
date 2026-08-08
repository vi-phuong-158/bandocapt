const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const { buildLocationIntakeAppsScript, outputPath } = require('../scripts/build-location-intake-apps-script');

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
});
