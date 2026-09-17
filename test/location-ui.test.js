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
    assert.match(appSource, /locations\.forEach\(\(loc\) => \{[\s\S]{0,900}setLocationVisible\(loc, true\)/);
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

// R1 state arbiter contract: `loc._visible` may be written ONLY by `setLocationVisible(loc, v)`,
// which keeps it and marker layer membership (clusterGroup vs selectedLayer) atomic. This is the
// source-level companion to the browser contract test in
// test/e2e/location-visibility-arbiter.spec.js (app.js cannot run outside a DOM/Leaflet
// environment, so it is characterized here and exercised end-to-end there).
test('location visibility is written only through setLocationVisible, never inline', () => {
    assert.match(appSource, /function setLocationVisible\(loc, visible\) \{/);
    const arbiterBody = appSource.match(/function setLocationVisible\(loc, visible\) \{([\s\S]{0,300}?)\r?\n\}/)?.[1] || '';
    assert.match(arbiterBody, /loc\._visible = visible/);
    assert.match(arbiterBody, /addLocationMarker\(loc\)/);
    assert.match(arbiterBody, /removeLocationMarker\(loc\)/);

    // Exactly one place is allowed to assign `loc._visible` directly: inside the arbiter itself.
    // filterAndRender (x3: match+search, else-branch, "Gần tôi" top-5 slice) and the initial-load
    // path in fetchHeadquarters must all call setLocationVisible instead.
    const directAssignments = appSource.match(/loc\._visible = /g) || [];
    assert.equal(directAssignments.length, 1, 'loc._visible must be assigned in exactly one place: setLocationVisible');
    assert.equal((appSource.match(/setLocationVisible\(loc, true\)/g) || []).length, 2, 'expected 2 call sites setting visible=true (filterAndRender match branch, initial load)');
    assert.equal((appSource.match(/setLocationVisible\(loc, false\)/g) || []).length, 2, 'expected 2 call sites setting visible=false (filterAndRender else branch, nearby top-5 slice)');

    // The initial marker-add in fetchHeadquarters must not bypass the arbiter with a raw layer call.
    assert.doesNotMatch(appSource, /clusterGroup\.addLayer\(marker\)/);

    // Any transition that clears `currentlySelectedLocation` and touches that location's marker
    // must refresh both the icon AND layer membership together (refreshLocationMarker), never call
    // `.setIcon()` alone — a direct `.setIcon()` call left a marker stranded in `selectedLayer`,
    // exempt from clustering, until the next unrelated filter/search event happened to fix it.
    const setIconMatches = appSource.match(/\.setIcon\(createCustomIcon\([^)]*\)\)/g) || [];
    assert.equal(setIconMatches.length, 1, '.setIcon(...) must appear exactly once, inside refreshLocationMarker');
    const refreshBody = appSource.match(/function refreshLocationMarker\(loc\) \{([\s\S]{0,300}?)\r?\n\}/)?.[1] || '';
    assert.match(refreshBody, /loc\.marker\.setIcon\(createCustomIcon\(loc\)\)/);
    assert.match(refreshBody, /addLocationMarker\(loc\)/);
    // MAP_MARKER_DECLUTTER_DESKTOP_UX: selected marker must float above every other marker
    // regardless of latitude (see the setZIndexOffset comment right above this function).
    assert.match(refreshBody, /loc\.marker\.setZIndexOffset\(isSelected \? 1000 : 0\)/);

    const showMobileSearchBody = appSource.match(/function showMobileSearch\(\) \{([\s\S]{0,1200}?)\r?\n\}/)?.[1] || '';
    assert.match(showMobileSearchBody, /refreshLocationMarker\(previousSelectedLocation\)/);
});

// R2a panel-state contract: exactly one of BROWSING / DETAIL / MOBILE_SEARCH owns the screen at
// a time, and `applyPanelChrome` is the only function allowed to decide between them — every
// entry point that used to hand-toggle search-panel/mobile-overlay classes directly, or call
// `setSheetState` to open/close a whole surface, must go through it instead. This is the
// source-level companion to the browser contract test in test/e2e/panel-state-arbiter.spec.js
// (app.js cannot run outside a DOM/Leaflet environment, so it is characterized here and exercised
// end-to-end there).
test('panel chrome (detail sheet + mobile search overlay) is applied only through applyPanelChrome', () => {
    assert.match(appSource, /function applyPanelChrome\(state, \{ animate = true, restoreFocus = false, sheetState \} = \{\}\) \{/);
    assert.match(appSource, /function setMobileSearchOverlay\(open\) \{/);

    const applyPanelChromeBody = appSource.match(/function applyPanelChrome\(state, \{ animate = true, restoreFocus = false, sheetState \} = \{\}\) \{([\s\S]{0,700}?)\r?\n\}/)?.[1] || '';
    assert.match(applyPanelChromeBody, /activePanelState = state/);
    assert.match(applyPanelChromeBody, /document\.body\.dataset\.panelState = state/);
    assert.match(applyPanelChromeBody, /setMobileSearchOverlay\(state === PANEL_STATES\.MOBILE_SEARCH\)/);
    assert.match(applyPanelChromeBody, /setSheetState\(targetSheetState/);

    // `document.body.dataset.panelState` may only be assigned inside applyPanelChrome — that's
    // what makes it trustworthy as a single source of truth for which surface is active.
    const panelStateAssignments = appSource.match(/document\.body\.dataset\.panelState = /g) || [];
    assert.equal(panelStateAssignments.length, 1, 'document.body.dataset.panelState must be assigned in exactly one place: applyPanelChrome');

    // The raw mobile-search-overlay class toggles (search-panel translate/opacity, mobile-overlay
    // backdrop, mobile-search-btn visibility) must live only inside setMobileSearchOverlay — not
    // duplicated across showMobileSearch/hideMobileSearch the way they were before R2a.
    const setMobileSearchOverlayBody = appSource.match(/function setMobileSearchOverlay\(open\) \{([\s\S]{0,700}?)\r?\n\}/)?.[1] || '';
    const overlayClassMatches = appSource.match(/searchPanel\.classList\.toggle\(/g) || [];
    assert.equal(overlayClassMatches.length, 4, 'search-panel class toggles must appear only inside setMobileSearchOverlay');
    assert.equal((setMobileSearchOverlayBody.match(/searchPanel\.classList\.toggle\(/g) || []).length, 4);
    assert.equal((appSource.match(/mobileOverlay\.classList\.add\("hidden"\)/g) || []).length, 1, 'mobile-overlay hide must appear only inside setMobileSearchOverlay');
    assert.equal((appSource.match(/mobileOverlay\.classList\.remove\("hidden"\)/g) || []).length, 1, 'mobile-overlay show must appear only inside setMobileSearchOverlay');
    assert.match(setMobileSearchOverlayBody, /mobileOverlay\.classList\.remove\("hidden"\)/);
    assert.match(setMobileSearchOverlayBody, /mobileOverlay\.classList\.add\("hidden"\)/);

    // openDetailPanel, closeDetailPanel, showMobileSearch and hideMobileSearch must each route
    // through the canonical writer instead of touching setSheetState / overlay classes directly.
    assert.equal((appSource.match(/applyPanelChrome\(PANEL_STATES\.DETAIL/g) || []).length, 2, 'expected 2 call sites entering DETAIL (openDetailPanel, resumeDetailSelection)');
    assert.equal((appSource.match(/applyPanelChrome\(PANEL_STATES\.BROWSING/g) || []).length, 4, 'expected 4 call sites entering BROWSING (closeDetailPanel, hideMobileSearch, suspendDetailSelection, initial load)');
    assert.equal((appSource.match(/applyPanelChrome\(PANEL_STATES\.MOBILE_SEARCH/g) || []).length, 1, 'expected 1 call site entering MOBILE_SEARCH (showMobileSearch)');

    // The remaining direct setSheetState(...) calls are intra-surface sheet-position mechanics,
    // not panel-state transitions, so they legitimately bypass applyPanelChrome: the arbiter
    // itself, the drag-to-settle handler, the collapsed->expanded "Xem chi tiết" tap, and the
    // viewport-resize resync (twice). A new direct call outside these should fail this count.
    const directSetSheetStateCalls = appSource.match(/(?<!\bfunction )setSheetState\(/g) || [];
    assert.equal(directSetSheetStateCalls.length, 5, 'setSheetState must be called only from applyPanelChrome, endSheetDrag, the preview-expand handler, and syncPanelsToViewport (x2)');

    // The Escape-key handler must read the real state flag, not the offsetParent layout heuristic
    // that used to report "mobile search is open" even while it was translated off-screen.
    assert.match(appSource, /activePanelState === PANEL_STATES\.MOBILE_SEARCH/);
    assert.doesNotMatch(appSource, /closeSearchBtn\.offsetParent/);
});

test('detail panel renders public service metadata without internal review fields', () => {
    for (const field of ['loc.services', 'loc.siteType', 'loc.serviceSchedule', 'loc.cccdServiceMode', 'loc.servedUnits', 'loc.verifiedAt']) {
        assert.ok(appSource.includes(field), `missing ${field}`);
    }
    for (const internalField of ['submitterEmail', 'submitter_email', 'reviewedBy', 'reviewed_by', 'validationErrors']) {
        assert.equal(appSource.includes(internalField), false, `internal field leaked: ${internalField}`);
    }
});
