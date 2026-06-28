const assert = require('node:assert/strict');
const test = require('node:test');

const {
    normalizePublishedLocations,
    parseCoordinates,
} = require('../js/location-data');

test('parseCoordinates accepts supported text and Google Maps formats', () => {
    const cases = [
        '21.325, 105.365',
        'https://maps.google.com/@21.325,105.365,15z',
        'https://maps.google.com/?q=21.325,105.365',
        'https://maps.google.com/maps/place/test/data=!3d21.325!4d105.365',
    ];

    for (const value of cases) {
        assert.deepEqual(parseCoordinates(value), { ok: true, lat: 21.325, lng: 105.365 });
    }
});

test('parseCoordinates returns specific error codes for invalid data', () => {
    assert.equal(parseCoordinates('').error, 'COORDINATES_MISSING');
    assert.equal(parseCoordinates('not coordinates').error, 'COORDINATES_FORMAT_INVALID');
    assert.equal(parseCoordinates('91, 105').error, 'COORDINATES_OUT_OF_RANGE');
    assert.equal(parseCoordinates('10.776, 106.7').error, 'COORDINATES_OUTSIDE_SERVICE_AREA');
});

test('normalizePublishedLocations maps labeled columns and reports rejected rows', () => {
    const payload = {
        table: {
            cols: [
                { label: 'record_id' },
                { label: 'Tên đơn vị' },
                { label: 'Loại đơn vị' },
                { label: 'Địa chỉ' },
                { label: 'Số điện thoại' },
                { label: 'Tọa độ' },
                { label: 'Hình ảnh' },
                { label: 'search_aliases' },
            ],
            rows: [
                { c: [{ v: 'PT-01' }, { v: 'Công an A' }, { v: 'Trụ sở' }, { v: 'Phú Thọ' }, { v: '0210' }, { v: '21.325,105.365' }, { v: '' }, { v: 'A|B' }] },
                { c: [{ v: 'PT-02' }, { v: 'Công an B' }, { v: 'Trụ sở' }, { v: 'Phú Thọ' }, { v: '0210' }, { v: '0,0' }, { v: '' }, { v: '' }] },
                { c: [{ v: 'PT-03' }, { v: '' }, { v: 'Trụ sở' }, { v: 'Phú Thọ' }, { v: '0210' }, { v: '21.3,105.3' }, { v: '' }, { v: '' }] },
            ],
        },
    };

    const result = normalizePublishedLocations(payload);
    assert.equal(result.locations.length, 1);
    assert.equal(result.locations[0].id, 'PT-01');
    assert.equal(result.locations[0].lat, 21.325);
    assert.equal(result.locations[0].searchAliases, 'A|B');
    assert.deepEqual(result.rejected.map(item => item.error), [
        'COORDINATES_OUTSIDE_SERVICE_AREA',
        'NAME_MISSING',
    ]);
});

test('normalizePublishedLocations rejects an invalid Google payload', () => {
    assert.deepEqual(normalizePublishedLocations({}), {
        locations: [],
        rejected: [{ row: 0, error: 'SHEET_SCHEMA_INVALID' }],
    });
});
