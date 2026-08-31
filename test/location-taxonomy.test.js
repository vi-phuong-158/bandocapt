'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const taxonomy = require('../lib/location-taxonomy');

test('location taxonomy has unique canonical site types and services', () => {
    const codes = values => values.map(value => value.code);
    assert.equal(new Set(codes(taxonomy.SITE_TYPES)).size, taxonomy.SITE_TYPES.length);
    assert.equal(new Set(codes(taxonomy.SERVICES)).size, taxonomy.SERVICES.length);
    assert.deepEqual(codes(taxonomy.SITE_TYPES), ['HEADQUARTERS', 'PUBLIC_SERVICE_CENTER', 'SECONDARY_OFFICE', 'MOBILE_POINT', 'OTHER']);
    assert.equal(taxonomy.isWritableSiteType('CITIZEN_ID_POINT'), false);
    assert.equal(taxonomy.isReadableSiteType('CITIZEN_ID_POINT'), true);
});

test('location taxonomy preserves legacy storage codes while providing deterministic display values', () => {
    assert.deepEqual(taxonomy.normalizeServices(['CITIZEN_ID', 'E_IDENTIFICATION']), ['CITIZEN_ID', 'E_IDENTIFICATION']);
    assert.deepEqual(taxonomy.toCanonicalServices(['CITIZEN_ID', 'E_IDENTIFICATION']), ['IDENTITY']);
    assert.deepEqual(taxonomy.toCanonicalServices(['POLICE_OFFICE']), ['OTHER']);
    assert.equal(taxonomy.displaySiteType('CITIZEN_ID_POINT'), 'Điểm tiếp nhận thủ tục hành chính');
    assert.equal(taxonomy.displayService('CITIZEN_ID'), 'Căn cước & định danh điện tử');
    assert.equal(taxonomy.normalizeServices(['UNKNOWN_SERVICE'], { forWrite: true }), null);
});

test('location taxonomy generates deterministic names without service-derived titles', () => {
    assert.equal(taxonomy.generateDisplayName('HEADQUARTERS', 'Công an phường Thanh Miếu'), 'Công an phường Thanh Miếu');
    assert.equal(taxonomy.generateDisplayName('PUBLIC_SERVICE_CENTER', 'Công an phường Thanh Miếu'), 'Điểm tiếp nhận thủ tục hành chính – Công an phường Thanh Miếu');
    assert.equal(taxonomy.generateDisplayName('MOBILE_POINT', 'Công an phường Thanh Miếu'), 'Điểm tiếp nhận lưu động – Công an phường Thanh Miếu');
    assert.equal(taxonomy.locationName({ siteType: 'HEADQUARTERS', unitName: 'Công an phường Thanh Miếu', override: '=SUM(1,1)' }), 'Công an phường Thanh Miếu');
});
