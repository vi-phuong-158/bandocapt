const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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

test('Apps Script intake bundle preserves the request-type-aware image requirement', () => {
    const sourceRoot = path.join(__dirname, '..');
    const pipelineSource = fs.readFileSync(path.join(sourceRoot, 'setup', 'apps-script.js'), 'utf8');
    const gatewaySource = fs.readFileSync(path.join(sourceRoot, 'setup', 'staff-gateway.js'), 'utf8');
    buildLocationIntakeAppsScript();
    const bundle = fs.readFileSync(outputPath, 'utf8');

    assert.match(pipelineSource, /function requiresNewImage\(requestType\)\s*\{\s*return requestType === REQUEST_TYPES\.create;/);
    assert.match(pipelineSource, /!submission\.imageFileId && requiresNewImage\(submission\.requestType\)/);
    assert.match(gatewaySource, /pipeline\.requiresNewImage\(requestType\) && !payload\.image/);
    assert.match(bundle, /function requiresNewImage\(requestType\)\s*\{\s*return requestType === REQUEST_TYPES\.create;/);
    assert.match(bundle, /!submission\.imageFileId && requiresNewImage\(submission\.requestType\)/);
    assert.match(bundle, /pipeline\.requiresNewImage\(requestType\) && !payload\.image/);
});

// Live rehearsal 2026-08-16: "0210000049" ghi bằng setValues bị Sheets ép về number
// 210000049 trong Location_Staging, rồi lan sang Published_Locations.phone — mọi số
// điện thoại Việt Nam đều mất số 0 đứng đầu. Mọi ghi DÒNG DỮ LIỆU phải đi qua
// writeLocationValues_ (setNumberFormat('@') trước setValues).
test('Apps Script data-row writes force plain-text format so leading zeros survive', () => {
    buildLocationIntakeAppsScript();
    const content = fs.readFileSync(outputPath, 'utf8');

    assert.match(content, /function writeLocationValues_\(range, values\) \{\s*range\.setNumberFormat\('@'\);\s*range\.setValues\(values\);\s*\}/);

    // Năm điểm ghi dòng dữ liệu: staging/audit append, admin update, ledger update,
    // legacy replace + append. Tất cả phải đi qua helper.
    assert.equal(content.match(/writeLocationValues_\(sheet\.getRange\(/g).length, 5);

    // Ràng buộc chính: setValues trực tiếp CHỈ được dùng để ghi hàng tiêu đề.
    // Bất kỳ setValues trực tiếp nào khác là một đường làm mất số 0 đứng đầu.
    const directSetValues = content
        .split('\n')
        .filter(line => /\.setValues\(/.test(line) && !/^\s*range\.setValues\(values\);/.test(line));
    assert.equal(directSetValues.length, 3, `unexpected direct setValues:\n${directSetValues.join('\n')}`);
    for (const line of directSetValues) {
        assert.match(line, /setValues\(\[(headers|missing)\]\)/);
}
});
