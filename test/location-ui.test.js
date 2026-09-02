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
    assert.match(appSource, /const isPolice = isPoliceLocation\(loc\)/);
    assert.match(appSource, /const isCccd = isCccdLocation\(loc\)/);
    assert.match(appSource, /const matchesFilter = \(isPolice && showPolice\) \|\| \(isCccd && showId\)/);
    assert.match(appSource, /locations\.forEach\(\(loc\) => \{[\s\S]{0,900}addLocationMarker\(loc\)/);
    assert.doesNotMatch(appSource, /loc\.services\.forEach\([^)]*addLocationMarker/);
});

// R0.5 taxonomy adapter contract (docs/redesign/CLAUDE_REVIEW_R0_V1.md, M2): the map/filter/detail
// classification must be a single shared pair of functions, canonical-siteType-first with the old
// free-text-derived signal only as a fallback for rows that predate the taxonomy migration — never
// the other way around. This is the source-level companion to the browser contract test in
// test/e2e/location-taxonomy-filter.spec.js (app.js cannot run outside a DOM/Leaflet environment,
// so it is characterized here and exercised end-to-end there).
test('police/CCCD classification is centralized and canonical-first with a legacy fallback', () => {
    assert.match(appSource, /function isPoliceLocation\(loc\) \{/);
    assert.match(appSource, /function isCccdLocation\(loc\) \{/);
    assert.match(appSource, /function canonicalSiteType\(loc\) \{/);
    assert.match(appSource, /function canonicalServiceCodes\(loc\) \{/);

    const isPoliceBody = appSource.match(/function isPoliceLocation\(loc\) \{([\s\S]{0,300}?)\n\}/)?.[1] || '';
    assert.match(isPoliceBody, /const siteType = canonicalSiteType\(loc\)/);
    assert.match(isPoliceBody, /if \(siteType\) return siteType !== "PUBLIC_SERVICE_CENTER"/);
    assert.match(isPoliceBody, /loc\.services\?\.includes\("POLICE_OFFICE"\) \|\| loc\.type === "police_station"/);

    const isCccdBody = appSource.match(/function isCccdLocation\(loc\) \{([\s\S]{0,400}?)\n\}/)?.[1] || '';
    assert.match(isCccdBody, /services\?\.includes\("IDENTITY"\)/);
    assert.match(isCccdBody, /if \(siteType\) return siteType === "PUBLIC_SERVICE_CENTER"/);
    assert.match(isCccdBody, /loc\.services\?\.includes\("CITIZEN_ID"\) \|\| loc\.type === "id_center"/);

    // Every former call site (marker icon, mobile preview, detail badge/procedure-note, filter,
    // result list) must go through the shared functions — no duplicated inline classification left.
    const inlineMatches = appSource.match(/loc\.services\?\.includes\("POLICE_OFFICE"\) \|\| loc\.type === "police_station"/g) || [];
    assert.equal(inlineMatches.length, 1, 'the police fallback expression must exist exactly once, inside isPoliceLocation');
    const inlineCccdMatches = appSource.match(/loc\.services\?\.includes\("CITIZEN_ID"\) \|\| loc\.type === "id_center"/g) || [];
    assert.equal(inlineCccdMatches.length, 1, 'the CCCD fallback expression must exist exactly once, inside isCccdLocation');
});

test('detail panel renders public service metadata without internal review fields', () => {
    for (const field of ['loc.services', 'loc.siteType', 'loc.serviceSchedule', 'loc.cccdServiceMode', 'loc.servedUnits', 'loc.verifiedAt']) {
        assert.ok(appSource.includes(field), `missing ${field}`);
    }
    for (const internalField of ['submitterEmail', 'submitter_email', 'reviewedBy', 'reviewed_by', 'validationErrors']) {
        assert.equal(appSource.includes(internalField), false, `internal field leaked: ${internalField}`);
    }
});
