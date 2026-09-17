const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('mobile bottom navigation exposes exactly the three civic app tabs', () => {
    const html = read('index.html');
    const tabs = Array.from(html.matchAll(/data-app-tab="([^"]+)"/g), match => match[1]);

    assert.deepEqual(tabs, ['map', 'chat', 'procedures']);
    assert.match(html, /id="mobile-bottom-nav"[\s\S]*aria-label="Điều hướng chính"/);
    assert.match(html, /data-app-tab="map"[\s\S]*aria-current="page"/);
});

test('AppNavigation owns the mobile surface contract and first-AI attention state', () => {
    const source = read('js/app-navigation.js');

    assert.match(source, /registerSurface/);
    assert.match(source, /activate/);
    assert.match(source, /getActiveTab/);
    assert.match(source, /bandocapt\.ai-nav-seen\.v1/);
    assert.match(source, /max-width: 767px/);
});

test('map uses controlled clustering plus a separate selected marker layer', () => {
    const source = read('app.js');
    const html = read('index.html');

    assert.match(html, /leaflet\.markercluster@1\.5\.3[^"]+" integrity="sha384-[^"]+"/);
    // No disableClusteringAtZoom: a small maxClusterRadius keeps clustering active at every zoom
    // so two real-world-close markers always merge instead of overlapping (MAP_MARKER_DECLUTTER_DESKTOP_UX).
    assert.doesNotMatch(source, /disableClusteringAtZoom:\s*\d/);
    assert.match(source, /spiderfyOnMaxZoom:\s*true/);
    assert.match(source, /zoom <= 9 \? 60 : zoom <= 11 \? 48 : 36/);
    assert.match(source, /const selectedLayer = L\.layerGroup\(\)\.addTo\(map\)/);
    assert.match(source, /isSelected \? selectedLayer : clusterGroup/);
});

test('map declutters overlapping marker labels and keeps the selected marker on top', () => {
    const source = read('app.js');
    const css = read('styles.css');

    assert.match(source, /function declutterMarkerLabels\(/);
    assert.match(source, /function getIndividuallyVisibleLocations\(/);
    assert.match(source, /getVisibleParent/);
    assert.match(source, /loc\.marker\.setZIndexOffset\(isSelected \? 1000 : 0\)/);
    assert.match(source, /map\.on\("zoomend moveend", declutterMarkerLabels\)/);
    assert.match(css, /\.marker-label-decluttered:not\(:hover\):not\(\.marker-selected\) \.marker-label/);
});

test('mobile detail uses a 164px preview and no random avatar fallback', () => {
    const app = read('app.js');
    const tokens = read('tokens.css');

    assert.match(tokens, /--location-preview-height:\s*164px/);
    assert.match(app, /hidden - getPreviewHeight\(\)/);
    assert.match(app, /detailImage\.src = 'assets\/logo\.png'/);
    assert.doesNotMatch(app, /ui-avatars\.com\/api/);
});
