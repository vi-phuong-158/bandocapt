'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    CANONICAL_MAP_URL,
    normalizeZaloMessage,
    stripLocationPrefix,
    resolveZaloIntent,
    buildLocationReply,
    createZaloReply,
} = require('../lib/zalo-bot-v1');

function locationDataset(locations) {
    return { locations, conflicts: [], cacheStatus: 'fresh' };
}

function phuThoLocation(overrides = {}) {
    return {
        name: 'Công an phường Phú Thọ',
        address: 'Địa chỉ đã công khai',
        phone: '02101234567',
        googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=21.3,105.4',
        aliases: {
            fullName: 'cong an phuong phu tho',
            withoutCongAn: 'phuong phu tho',
            bareName: 'phu tho',
            approved: ['phuong phu tho'],
        },
        ...overrides,
    };
}

test('normalization trims, collapses whitespace, lowercases, and folds Vietnamese accents', () => {
    assert.equal(normalizeZaloMessage('  CÔNG   AN phường   Phú Thọ! '), 'cong an phuong phu tho');
    assert.equal(stripLocationPrefix('Công an phường Phú Thọ'), 'phuong phu tho');
    assert.equal(stripLocationPrefix('CA   xã Bình Xuyên'), 'xa binh xuyen');
    assert.equal(stripLocationPrefix('tìm địa chỉ phường Phú Thọ'), 'phuong phu tho');
});

test('deterministic intent resolver recognizes greeting, help, map, location, and fallback', () => {
    for (const phrase of ['xin chào', 'chào', 'hello', 'hi']) {
        assert.equal(resolveZaloIntent(phrase).intent, 'GREETING');
    }
    for (const phrase of ['trợ giúp', 'hướng dẫn', 'help']) {
        assert.equal(resolveZaloIntent(phrase).intent, 'HELP');
    }
    for (const phrase of ['bản đồ', 'mở bản đồ', 'bản đồ công an', 'website']) {
        assert.equal(resolveZaloIntent(phrase).intent, 'MAP');
    }
    assert.equal(resolveZaloIntent('Công an phường Phú Thọ').query, 'phuong phu tho');
    assert.equal(resolveZaloIntent('abcxyz').intent, 'FALLBACK');
});

test('greeting/help/map/fallback replies are static and map uses canonical production URL', async () => {
    const shouldNotLoadLocations = async () => { throw new Error('location datasource should not be read'); };
    assert.match((await createZaloReply('xin chào', { getPublishedLocations: shouldNotLoadLocations })).text, /trợ lý Bản đồ Công an Phú Thọ/);
    assert.match((await createZaloReply('trợ giúp', { getPublishedLocations: shouldNotLoadLocations })).text, /Nhập tên xã\/phường/);
    assert.equal((await createZaloReply('bản đồ', { getPublishedLocations: shouldNotLoadLocations })).text, `Bản đồ Công an Phú Thọ: ${CANONICAL_MAP_URL}`);
    assert.match((await createZaloReply('abcxyz', { getPublishedLocations: async () => locationDataset([]) })).text, /Tôi chưa hiểu yêu cầu này/);
});

test('location lookup reuses canonical published locations and includes only present public fields', async () => {
    const reply = await createZaloReply('Công an phường Phú Thọ', {
        getPublishedLocations: async () => locationDataset([phuThoLocation()]),
    });
    assert.equal(reply.intent, 'LOCATION_LOOKUP');
    assert.equal(reply.result, 'FOUND');
    assert.match(reply.text, /Công an phường Phú Thọ/);
    assert.match(reply.text, /Địa chỉ: Địa chỉ đã công khai/);
    assert.match(reply.text, /Điện thoại: 02101234567/);
    assert.match(reply.text, /Bản đồ CA Phú Thọ: https:\/\/bandocapt\.vercel\.app\//);
    assert.match(reply.text, /Chỉ đường: https:\/\/www\.google\.com\/maps/);

    const sparse = await createZaloReply('phường Phú Thọ', {
        getPublishedLocations: async () => locationDataset([phuThoLocation({ address: '', phone: '', googleMapsUrl: '' })]),
    });
    assert.doesNotMatch(sparse.text, /Địa chỉ:|Điện thoại:|Chỉ đường:/);
});

test('location resolver distinguishes FOUND, NOT_FOUND, and AMBIGUOUS without guessing', async () => {
    const found = await createZaloReply('phường Phú Thọ', {
        getPublishedLocations: async () => locationDataset([phuThoLocation()]),
    });
    assert.equal(found.result, 'FOUND');

    const missing = await createZaloReply('xã Không Tồn Tại', {
        getPublishedLocations: async () => locationDataset([]),
    });
    assert.equal(missing.result, 'NOT_FOUND');
    assert.match(missing.text, /thử nhập đầy đủ tên xã\/phường/);

    const duplicate = await createZaloReply('phường Phú Thọ', {
        getPublishedLocations: async () => locationDataset([
            phuThoLocation({ address: 'Địa chỉ A', aliases: { fullName: 'cong an phuong phu tho', withoutCongAn: 'phuong phu tho', bareName: 'phu tho', approved: [] } }),
            phuThoLocation({ name: 'Đơn vị khác phường Phú Thọ', address: 'Địa chỉ B', aliases: { fullName: 'don vi khac phuong phu tho', withoutCongAn: 'phuong phu tho', bareName: 'phu tho', approved: [] } }),
        ]),
    });
    assert.equal(duplicate.result, 'AMBIGUOUS');
    assert.match(duplicate.text, /nhập đầy đủ tên xã\/phường/);
});

test('matched response never invents absent address, phone, or map coordinates', () => {
    const reply = buildLocationReply({ status: 'matched', matches: [{ name: 'Đơn vị chỉ có tên' }] });
    assert.equal(reply.result, 'FOUND');
    assert.equal(reply.text, `Đơn vị chỉ có tên\n🗺️ Xem trên Bản đồ CA Phú Thọ: ${CANONICAL_MAP_URL}`);
});
