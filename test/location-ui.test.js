const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const locationData = require('../js/location-data.js');
const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

test('normalizes a shared service point into one location with both services', () => {
    assert.deepEqual(
        locationData.normalizeServices('POLICE_OFFICE|CITIZEN_ID', 'police_station'),
        ['POLICE_OFFICE', 'CITIZEN_ID'],
    );
    assert.deepEqual(locationData.normalizeServices('', 'id_center'), ['CITIZEN_ID']);
});

test('map filtering uses services while adding markers from the location collection once', () => {
    assert.match(appSource, /const isPolice = loc\.services\?\.includes\("POLICE_OFFICE"\)/);
    assert.match(appSource, /const isCccd = loc\.services\?\.includes\("CITIZEN_ID"\)/);
    assert.match(appSource, /const matchesFilter = \(isPolice && showPolice\) \|\| \(isCccd && showId\)/);
    assert.match(appSource, /locations\.forEach\(\(loc\) => \{[\s\S]{0,900}addLocationMarker\(loc\)/);
    assert.doesNotMatch(appSource, /loc\.services\.forEach\([^)]*addLocationMarker/);
});

test('detail panel renders public service metadata without internal review fields', () => {
    for (const field of ['loc.services', 'loc.siteType', 'loc.serviceSchedule', 'loc.cccdServiceMode', 'loc.servedUnits', 'loc.verifiedAt']) {
        assert.ok(appSource.includes(field), `missing ${field}`);
    }
    for (const internalField of ['submitterEmail', 'submitter_email', 'reviewedBy', 'reviewed_by', 'validationErrors']) {
        assert.equal(appSource.includes(internalField), false, `internal field leaked: ${internalField}`);
    }
});
