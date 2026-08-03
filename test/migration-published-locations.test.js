const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { migratePublishedLocations } = require('../scripts/migrate-published-locations');

test('location migration dry-run does not alter the source file', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bandocapt-location-migration-'));
    const input = path.join(directory, 'legacy.json');
    const source = [{ unit_code: 'CA_A', name: 'Điểm A', type: 'id_center', coordinates: '21.32,105.36' }];
    fs.writeFileSync(input, JSON.stringify(source), 'utf8');
    const before = fs.readFileSync(input, 'utf8');
    const result = migratePublishedLocations({ input, apply: false });
    assert.equal(result.applied, false);
    assert.equal(result.records[0].services, 'CITIZEN_ID');
    assert.equal(fs.readFileSync(input, 'utf8'), before);
    assert.equal(fs.existsSync(path.join(directory, 'output.json')), false);
});

test('location migration requires a separate output path before writing', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bandocapt-location-migration-'));
    const input = path.join(directory, 'legacy.json');
    fs.writeFileSync(input, '[]', 'utf8');
    assert.throws(() => migratePublishedLocations({ input, apply: true }), /APPLY_REQUIRES_OUTPUT/);
    assert.throws(() => migratePublishedLocations({ input, output: input, apply: true }), /OUTPUT_MUST_DIFFER_FROM_INPUT/);
});
