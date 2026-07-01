const assert = require('node:assert/strict');
const test = require('node:test');

const {
    LOCATION_CACHE_STALE_MAX_MS,
    findVerifiedLocationMatches,
    formatVerifiedLocationsPrompt,
    getPublishedLocations,
    isBarePlaceNameQuery,
    resetPublishedLocationsCache,
} = require('../lib/published-locations');

test('bare place name requires intent clarification (LOC04)', () => {
    assert.equal(isBarePlaceNameQuery('Sông Lô'), true);
    assert.equal(isBarePlaceNameQuery('Sông Lô ở đâu'), false);
    assert.equal(isBarePlaceNameQuery('trụ sở Sông Lô'), false);
    assert.equal(isBarePlaceNameQuery('Công an Sông Lô'), false);
});

function buildPayload(rows) {
    return {
        table: {
            cols: [
                { label: 'record_id' },
                { label: 'Tên đơn vị' },
                { label: 'Loại đơn vị' },
                { label: 'Địa chỉ' },
                { label: 'Số điện thoại' },
                { label: 'Tọa độ' },
                { label: 'search_aliases' },
            ],
            rows: rows.map(row => ({
                c: [
                    { v: row.id },
                    { v: row.name },
                    { v: row.type || 'Trụ sở' },
                    { v: row.address },
                    { v: row.phone || '' },
                    { v: row.coordinates },
                    { v: row.searchAliases || '' },
                ],
            })),
        },
    };
}

test.afterEach(() => {
    resetPublishedLocationsCache();
});

test('published locations dedupe identical rows and keep conflicting rows separate', async () => {
    const payload = buildPayload([
        {
            id: '1',
            name: 'Công an xã Sông Lô',
            address: 'Địa chỉ A',
            phone: '0210',
            coordinates: '21.325,105.365',
            searchAliases: 'Song Lo',
        },
        {
            id: '2',
            name: 'Công an xã Sông Lô',
            address: 'Địa chỉ A',
            phone: '0210',
            coordinates: '21.325,105.365',
            searchAliases: 'Bach Hac',
        },
        {
            id: '3',
            name: 'Công an xã Đông Lương',
            address: 'Địa chỉ B',
            phone: '0211',
            coordinates: '21.326,105.366',
        },
        {
            id: '4',
            name: 'Công an xã Đông Lương',
            address: 'Địa chỉ C',
            phone: '0211',
            coordinates: '21.327,105.367',
        },
    ]);

    const result = await getPublishedLocations({
        now: 1,
        fetchImpl: async () => new Response(`google.visualization.Query.setResponse(${JSON.stringify(payload)});`),
        sheetId: 'sheet-id',
    });

    assert.equal(result.locations.length, 1);
    assert.equal(result.locations[0].name, 'Công an xã Sông Lô');
    assert.deepEqual(result.locations[0].aliases.approved, ['bach hac']);
    assert.equal(result.conflicts.length, 1);
    assert.equal(result.conflicts[0].records.length, 2);
});

test('published locations cache serves fresh then stale fallback up to five minutes', async () => {
    const payload = buildPayload([
        {
            id: '1',
            name: 'Công an phường Thanh Miếu',
            address: 'Số 1028 Đường Hùng Vương',
            phone: '02103863928',
            coordinates: '21.304528,105.415528',
        },
    ]);

    let calls = 0;
    const fetchSuccess = async () => {
        calls += 1;
        return new Response(`google.visualization.Query.setResponse(${JSON.stringify(payload)});`);
    };
    const fetchFailure = async () => {
        calls += 1;
        throw new Error('network down');
    };

    const first = await getPublishedLocations({
        now: 1,
        fetchImpl: fetchSuccess,
        sheetId: 'sheet-id',
    });
    const fresh = await getPublishedLocations({
        now: 30 * 1000,
        fetchImpl: fetchFailure,
        sheetId: 'sheet-id',
    });
    const stale = await getPublishedLocations({
        now: 2 * 60 * 1000,
        fetchImpl: fetchFailure,
        sheetId: 'sheet-id',
    });

    assert.equal(first.cacheStatus, 'fresh');
    assert.equal(fresh.cacheStatus, 'fresh');
    assert.equal(stale.cacheStatus, 'stale');
    assert.equal(calls, 2, 'fresh cache should not re-fetch');

    await assert.rejects(() => getPublishedLocations({
        now: LOCATION_CACHE_STALE_MAX_MS + 2,
        fetchImpl: fetchFailure,
        sheetId: 'sheet-id',
    }), /network down/);
});

test('verified location matcher resolves Thanh Mieu exactly without fuzzy confusion', () => {
    const dataset = {
        cacheStatus: 'fresh',
        locations: [
            {
                name: 'Công an phường Thanh Miếu',
                address: 'Số 1028 Đường Hùng Vương',
                phone: '02103863928',
                lat: 21.304528,
                lng: 105.415528,
                googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=21.304528,105.415528',
                aliases: {
                    fullName: 'cong an phuong thanh mieu',
                    withoutCongAn: 'phuong thanh mieu',
                    bareName: 'thanh mieu',
                    approved: ['bach hac', 'tien cat', 'tho son', 'song lo'],
                },
            },
            {
                name: 'Công an phường Văn Miếu',
                address: 'Địa chỉ khác',
                phone: '0210000000',
                lat: 21.31,
                lng: 105.42,
                googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=21.31,105.42',
                aliases: {
                    fullName: 'cong an phuong van mieu',
                    withoutCongAn: 'phuong van mieu',
                    bareName: 'van mieu',
                    approved: [],
                },
            },
        ],
        conflicts: [],
    };

    const exact = findVerifiedLocationMatches('Công an phường thanh miếu ở đâu?', [], dataset);
    const accentless = findVerifiedLocationMatches('cong an PHUONG THANH MIEU', [], dataset);
    const firstTurnShort = findVerifiedLocationMatches('Thanh Mieu', [], dataset);
    const followUp = findVerifiedLocationMatches('Thanh Mieu', [
        { role: 'model', parts: [{ text: 'Bạn ở xã/phường nào để mình chỉ đúng trụ sở Công an và đường đi nhé?' }] },
    ], dataset);

    assert.equal(exact.status, 'matched');
    assert.equal(accentless.status, 'matched');
    assert.equal(firstTurnShort.status, 'matched');
    assert.equal(followUp.status, 'matched');
    assert.equal(exact.matches[0].address, 'Số 1028 Đường Hùng Vương');
    assert.equal(firstTurnShort.matches[0].matchedAlias, 'thanh mieu');
    assert.equal(followUp.matches[0].name, 'Công an phường Thanh Miếu');
    assert.notEqual(exact.matches[0].name, 'Công an phường Văn Miếu');
});

test('conversation regression: CCCD follow-up for Thanh Mieu resolves the verified station', () => {
    const dataset = {
        cacheStatus: 'fresh',
        locations: [
            {
                name: 'Công an Phường Thanh Miếu',
                address: 'Số 1028 Đường Hùng Vương, phường Thanh Miếu, tỉnh Phú Thọ',
                phone: '02103863928',
                lat: 21.304528,
                lng: 105.415528,
                googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=21.304528,105.415528',
                aliases: {
                    fullName: 'cong an phuong thanh mieu',
                    withoutCongAn: 'phuong thanh mieu',
                    bareName: 'thanh mieu',
                    approved: ['bach hac', 'tien cat', 'tho son', 'song lo'],
                },
            },
        ],
        conflicts: [],
    };
    const history = [
        { role: 'user', parts: [{ text: 'Tôi muốn làm căn cước công dân thì làm thế nào' }] },
        { role: 'model', parts: [{ text: 'Bạn ở xã/phường nào thuộc tỉnh Phú Thọ để mình chỉ đúng trụ sở Công an cấp xã nơi bạn cư trú và đường đi nhé?' }] },
    ];

    const followUpMatch = findVerifiedLocationMatches('Tôi ở phường Thanh Miếu và 30 tuổi', history, dataset);
    const firstTurnAlias = findVerifiedLocationMatches('Tôi ở Bạch Hạc và muốn làm căn cước công dân', [], dataset);
    const explicitRetryMatch = findVerifiedLocationMatches('Tìm lại trụ sở Công an phường Thanh Miếu', history, dataset);

    assert.equal(followUpMatch.lookupRequested, true);
    assert.equal(followUpMatch.status, 'matched');
    assert.equal(followUpMatch.matches[0].address, 'Số 1028 Đường Hùng Vương, phường Thanh Miếu, tỉnh Phú Thọ');
    assert.equal(followUpMatch.matches[0].phone, '02103863928');
    assert.equal(followUpMatch.matches[0].googleMapsUrl, 'https://www.google.com/maps/search/?api=1&query=21.304528,105.415528');

    assert.equal(explicitRetryMatch.lookupRequested, true);
    assert.equal(explicitRetryMatch.status, 'matched');
    assert.equal(explicitRetryMatch.matches[0].name, 'Công an Phường Thanh Miếu');
    assert.equal(firstTurnAlias.status, 'matched');
    assert.equal(firstTurnAlias.matches[0].name, 'Công an Phường Thanh Miếu');
    assert.equal(firstTurnAlias.matches[0].matchedAlias, 'bach hac');
});

test('verified location prompt marks conflicting rows as ambiguous', () => {
    const prompt = formatVerifiedLocationsPrompt({
        lookupRequested: true,
        status: 'ambiguous_conflict',
        conflicts: [
            {
                name: 'Công an xã Hiền Quan',
                records: [
                    {
                        name: 'Công an xã Hiền Quan',
                        address: 'Địa chỉ 1',
                        phone: '0210',
                        lat: 21.3,
                        lng: 105.3,
                        googleMapsUrl: 'https://maps.example/1',
                    },
                    {
                        name: 'Công an xã Hiền Quan',
                        address: 'Địa chỉ 2',
                        phone: '0211',
                        lat: 21.31,
                        lng: 105.31,
                        googleMapsUrl: 'https://maps.example/2',
                    },
                ],
            },
        ],
    }, { cacheStatus: 'stale' });

    assert.match(prompt, /STATUS: ambiguous_conflict/);
    assert.match(prompt, /CACHE_STATUS: stale/);
    assert.match(prompt, /Dia chi 1|Địa chỉ 1/);
});

test('approved alias shared by multiple records returns ambiguous_match instead of auto-picking', () => {
    const dataset = {
        cacheStatus: 'fresh',
        locations: [
            {
                name: 'Công an phường Thanh Miếu',
                address: 'Địa chỉ 1',
                phone: '0210',
                lat: 21.3,
                lng: 105.3,
                googleMapsUrl: 'https://maps.example/1',
                aliases: {
                    fullName: 'cong an phuong thanh mieu',
                    withoutCongAn: 'phuong thanh mieu',
                    bareName: 'thanh mieu',
                    approved: ['bach hac'],
                },
            },
            {
                name: 'Công an phường Sông Lô',
                address: 'Địa chỉ 2',
                phone: '0211',
                lat: 21.31,
                lng: 105.31,
                googleMapsUrl: 'https://maps.example/2',
                aliases: {
                    fullName: 'cong an phuong song lo',
                    withoutCongAn: 'phuong song lo',
                    bareName: 'song lo',
                    approved: ['bach hac'],
                },
            },
        ],
        conflicts: [],
    };

    const result = findVerifiedLocationMatches('Tôi ở Bạch Hạc', [], dataset);

    assert.equal(result.lookupRequested, true);
    assert.equal(result.status, 'ambiguous_match');
    assert.equal(result.matches.length, 2);
});

test('verified location matcher resolves english location queries (W2)', () => {
    const dataset = {
        cacheStatus: 'fresh',
        locations: [
            {
                name: 'Công an Phường Thanh Miếu',
                address: 'Số 1028 Đường Hùng Vương',
                phone: '02103863928',
                lat: 21.304528,
                lng: 105.415528,
                googleMapsUrl: 'https://maps.example/1',
                aliases: {
                    fullName: 'cong an phuong thanh mieu',
                    withoutCongAn: 'phuong thanh mieu',
                    bareName: 'thanh mieu',
                    approved: [],
                },
            },
        ],
        conflicts: [],
    };

    const englishMatch = findVerifiedLocationMatches('Give me police station for Thanh Mieu', [], dataset);

    assert.equal(englishMatch.lookupRequested, true);
    assert.equal(englishMatch.status, 'matched');
    assert.equal(englishMatch.matches[0].name, 'Công an Phường Thanh Miếu');
});

test('province name does not falsely match ward bareName (Phu Tho collision, #1)', () => {
    const dataset = {
        cacheStatus: 'fresh',
        locations: [
            {
                name: 'Công an Phường Phú Thọ',
                address: 'Khu An Ninh Trung, phường Phú Thọ, tỉnh Phú Thọ',
                phone: '02106288588',
                lat: 21.5455,
                lng: 105.2494,
                googleMapsUrl: 'https://maps.example/pt',
                aliases: {
                    fullName: 'cong an phuong phu tho',
                    withoutCongAn: 'phuong phu tho',
                    bareName: 'phu tho',
                    approved: [],
                },
            },
        ],
        conflicts: [],
    };

    // Câu chỉ nhắc tên TỈNH "Phú Thọ" → KHÔNG được match nhầm sang phường Phú Thọ.
    const provinceMention = findVerifiedLocationMatches('Lost passport in Phu Tho, where should I go?', [], dataset);
    assert.equal(provinceMention.status, 'no_match');

    // Hỏi rõ "phường Phú Thọ" → vẫn match được qua withoutCongAn.
    const explicitWard = findVerifiedLocationMatches('Công an phường Phú Thọ ở đâu?', [], dataset);
    assert.equal(explicitWard.status, 'matched');
    assert.equal(explicitWard.matches[0].name, 'Công an Phường Phú Thọ');
});
