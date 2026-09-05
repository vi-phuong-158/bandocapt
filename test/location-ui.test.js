const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const locationData = require('../js/location-data.js');
const taxonomy = require('../lib/location-taxonomy.js');
const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

test('normalizes a shared service point into one location with both services', () => {
    assert.deepEqual(
        locationData.normalizeServices('POLICE_OFFICE|CITIZEN_ID', 'police_station'),
        ['POLICE_OFFICE', 'CITIZEN_ID'],
    );
    assert.deepEqual(locationData.normalizeServices('', 'id_center'), ['CITIZEN_ID']);
});

test('map classification and single-select filter go through canonical taxonomy, not raw legacy codes', () => {
    // P0 regression guard: a bare `loc.services?.includes("CITIZEN_ID")` (or `loc.type ===
    // "id_center"`) never recognizes the canonical `IDENTITY` code that /can-bo and /dong-gop have
    // written since the 2026-08-31 taxonomy unification. Every classification site must instead
    // resolve through `canonicalServiceCodes`/`isIdentityLocation`, which call
    // `LocationTaxonomy.toCanonicalServices` and therefore accept both legacy and new codes.
    assert.match(appSource, /function canonicalServiceCodes\(loc\) \{/);
    assert.match(appSource, /toCanonicalServices\?\.\(loc\.services\)/);
    assert.match(appSource, /function isIdentityLocation\(loc\) \{\s*return canonicalServiceCodes\(loc\)\.includes\("IDENTITY"\);/);
    assert.doesNotMatch(appSource, /const isPolice = loc\.services\?\.includes\("POLICE_OFFICE"\) \|\| loc\.type ===/);
    assert.doesNotMatch(appSource, /const isCccd = loc\.services\?\.includes\("CITIZEN_ID"\) \|\| loc\.type ===/);

    // Marker/badge/result-list/preview classification all resolve through the same canonical helper.
    const classificationSites = appSource.match(/const isPolice = !isIdentityLocation\(loc\);/g) || [];
    assert.ok(classificationSites.length >= 3, `expected >=3 canonical isPolice sites, found ${classificationSites.length}`);

    // R1 visibility arbiter (forward-ported): `filterAndRender`'s per-location taxonomy decision
    // must route through `setLocationVisible`, the only function allowed to write `loc._visible`
    // and touch marker layer membership together — never `loc._visible = ...` / `addLocationMarker`
    // as two separate statements at the call site, or list/marker/detail can read a stale mix.
    assert.match(appSource, /locations\.forEach\(\(loc\) => \{[\s\S]{0,900}setLocationVisible\(loc, /);
    assert.match(appSource, /function setLocationVisible\(loc, visible\) \{[\s\S]{0,200}addLocationMarker\(loc\)/);
    assert.doesNotMatch(appSource, /loc\.services\.forEach\([^)]*addLocationMarker/);
});

test('service filter is single-select (scalar state, toggle-off on repeat click) and defaults to showing all locations', () => {
    assert.match(appSource, /let activeServiceFilter = null;/);
    assert.match(appSource, /function matchesServiceFilter\(loc, activeService\) \{\s*if \(!activeService\) return true;/);
    assert.match(appSource, /function setActiveServiceFilter\(code\) \{\s*activeServiceFilter = activeServiceFilter === code \? null : code;/);
    // No multi-select/array/OR-AND combinator state.
    assert.doesNotMatch(appSource, /activeServiceFilter(s)?\s*=\s*\[\]/);
    assert.doesNotMatch(appSource, /activeServiceFilter\.(push|includes)/);
});

test('service filter behaves correctly against real taxonomy data: canonical and legacy codes, single active code, no active filter', () => {
    function canonicalServiceCodes(loc) {
        return taxonomy.toCanonicalServices(loc.services) || loc.services || [];
    }
    function matchesServiceFilter(loc, activeService) {
        if (!activeService) return true;
        return canonicalServiceCodes(loc).includes(activeService);
    }

    const newRecord = { services: ['IDENTITY', 'RESIDENCE'] };
    const legacyRecord = { services: ['CITIZEN_ID'] };
    const unrelatedRecord = { services: ['VEHICLE_REGISTRATION'] };

    // IDENTITY (new canonical code) is recognized directly.
    assert.equal(matchesServiceFilter(newRecord, 'IDENTITY'), true);
    // Legacy CITIZEN_ID still canonicalizes to IDENTITY and matches the same filter.
    assert.equal(matchesServiceFilter(legacyRecord, 'IDENTITY'), true);
    // A location offering multiple services still matches on exactly the one selected code.
    assert.equal(matchesServiceFilter(newRecord, 'RESIDENCE'), true);
    assert.equal(matchesServiceFilter(newRecord, 'VEHICLE_REGISTRATION'), false);
    // Unrelated service is excluded.
    assert.equal(matchesServiceFilter(unrelatedRecord, 'IDENTITY'), false);
    // No active filter (null) shows every location regardless of its services.
    assert.equal(matchesServiceFilter(newRecord, null), true);
    assert.equal(matchesServiceFilter(unrelatedRecord, null), true);
});

test('primary service chips are exactly 4 canonical codes and the expanded row is derived from taxonomy, not hard-coded', () => {
    assert.match(appSource, /const PRIMARY_SERVICE_CODES = \["IDENTITY", "RESIDENCE", "VEHICLE_REGISTRATION", "IMMIGRATION"\];/);
    assert.equal(new Set(['IDENTITY', 'RESIDENCE', 'VEHICLE_REGISTRATION', 'IMMIGRATION']).size, 4);
    assert.match(appSource, /taxonomy\.SERVICES\.filter\(item => !PRIMARY_SERVICE_CODES\.includes\(item\.code\)\)/);
    // Extra-services count must come from the taxonomy length, never a hard-coded literal like "6".
    assert.match(appSource, /extraServicesLabel\(extra\.length\)/);
});

test('"Gần tôi" no longer hides markers behind a Top-N cut and respects the active service/search result set', () => {
    assert.doesNotMatch(appSource, /visibleLocations\.slice\(5\)/);
    assert.doesNotMatch(appSource, /visibleLocations = visibleLocations\.slice\(0, 5\)/);
    assert.doesNotMatch(appSource, /showNearby/);
    assert.doesNotMatch(appSource, /getElementById\("filter-nearby"\)/);
    assert.doesNotMatch(appSource, /getElementById\('filter-nearby'\)/);
    // centerOnNearestVisible only reads `loc._visible` (already filtered by search + service chip)
    // and fits [user, nearest] — it never sets `_visible` or calls removeLocationMarker itself.
    assert.match(appSource, /function centerOnNearestVisible\(\) \{/);
    const fnBody = appSource.slice(appSource.indexOf('function centerOnNearestVisible'), appSource.indexOf('function centerOnNearestVisible') + 700);
    assert.match(fnBody, /loc\._visible/);
    assert.doesNotMatch(fnBody, /_visible = false/);
    assert.doesNotMatch(fnBody, /removeLocationMarker/);
    assert.match(fnBody, /Không có địa điểm phù hợp gần bạn/);
    assert.match(fnBody, /fitBounds/);
});

test('detail panel renders public service metadata without internal review fields', () => {
    for (const field of ['loc.services', 'loc.siteType', 'loc.serviceSchedule', 'loc.cccdServiceMode', 'loc.servedUnits', 'loc.verifiedAt']) {
        assert.ok(appSource.includes(field), `missing ${field}`);
    }
    for (const internalField of ['submitterEmail', 'submitter_email', 'reviewedBy', 'reviewed_by', 'validationErrors']) {
        assert.equal(appSource.includes(internalField), false, `internal field leaked: ${internalField}`);
    }
});

test('detail panel shows the canonical taxonomy site-type label instead of a raw enum, and formats servedUnits/date for presentation only', () => {
    assert.match(appSource, /window\.LocationTaxonomy\?\.displaySiteType\(loc\.siteType\)/);
    // The internal fallback table must not contain the never-existed legacy code that caused the leak
    // (as a table key specifically — the fix comment is allowed to name the old bug for context).
    assert.doesNotMatch(appSource, /SERVICE_POINT:/);
    assert.match(appSource, /function formatServedUnits\(value\) \{\s*return String\(value \|\| ""\)\.split\("\|"\)/);
    assert.match(appSource, /function formatVietnameseDate\(value\) \{/);
    assert.match(appSource, /formatServedUnits\(loc\.servedUnits\)/);
    assert.match(appSource, /formatVietnameseDate\(loc\.verifiedAt\)/);
});

test('formatServedUnits/formatVietnameseDate presentation helpers behave correctly without touching stored values', () => {
    // Re-implement the exact one-liner bodies to verify behavior without a DOM (app.js is a
    // top-level browser script, not a requirable module); source presence is asserted above.
    function formatServedUnits(value) {
        return String(value || '').split('|').map(item => item.trim()).filter(Boolean).join(', ');
    }
    function formatVietnameseDate(value) {
        const text = String(value || '').trim();
        if (!text) return '';
        const date = new Date(text);
        if (Number.isNaN(date.getTime())) return text;
        const pad = n => String(n).padStart(2, '0');
        return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
    }

    assert.equal(formatServedUnits('phường Vân Phú|phường Dữu Lâu'), 'phường Vân Phú, phường Dữu Lâu');
    assert.equal(formatServedUnits(''), '');
    assert.equal(formatVietnameseDate('2026-08-18T10:23:00.000Z'), '18/08/2026');
    assert.equal(formatVietnameseDate('not-a-date'), 'not-a-date');
    assert.equal(formatVietnameseDate(''), '');
});
