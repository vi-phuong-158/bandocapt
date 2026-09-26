'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    CANONICAL_MAP_URL,
    RAG_FALLBACK,
    normalizeZaloMessage,
    resolveZaloIntent,
    buildLocationReply,
    createZaloReply,
} = require('../lib/zalo-bot-v1');

function locationDataset(locations, conflicts = []) {
    return { locations, conflicts, cacheStatus: 'fresh' };
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

const shouldNotLoadLocations = async () => { throw new Error('location datasource should not be read'); };

test('normalization trims, collapses whitespace, lowercases, and folds Vietnamese accents', () => {
    assert.equal(normalizeZaloMessage('  CÔNG   AN phường   Phú Thọ! '), 'cong an phuong phu tho');
});

// --- T01/T02/T03: static intents ---------------------------------------
test('T01/T02/T03: greeting/help/map are recognized as static deterministic intents', () => {
    for (const phrase of ['xin chào', 'chào', 'hello', 'hi']) {
        assert.equal(resolveZaloIntent(phrase).intent, 'GREETING');
    }
    for (const phrase of ['trợ giúp', 'hướng dẫn', 'help']) {
        assert.equal(resolveZaloIntent(phrase).intent, 'HELP');
    }
    for (const phrase of ['bản đồ', 'mở bản đồ', 'bản đồ công an', 'website']) {
        assert.equal(resolveZaloIntent(phrase).intent, 'MAP');
    }
    // Mọi câu khác (kể cả tên địa điểm hay câu hỏi TTHC) không còn được phân loại ở đây —
    // createZaloReply() mới là nơi quyết định LOCATION hay RAG_FALLBACK.
    assert.equal(resolveZaloIntent('abcxyz').intent, 'OTHER');
});

test('T01/T02/T03: greeting/help/map replies are static and map uses canonical custom domain', async () => {
    assert.match((await createZaloReply('xin chào', { getPublishedLocations: shouldNotLoadLocations })).text, /trợ lý Bản đồ Công an Phú Thọ/);
    assert.match((await createZaloReply('trợ giúp', { getPublishedLocations: shouldNotLoadLocations })).text, /Nhập tên xã\/phường/);
    const mapReply = await createZaloReply('bản đồ', { getPublishedLocations: shouldNotLoadLocations });
    assert.equal(mapReply.text, `Bản đồ Công an Phú Thọ: ${CANONICAL_MAP_URL}`);
    assert.equal(CANONICAL_MAP_URL, 'https://www.bandocapt.io.vn/');
});

// --- T04: prefixed location ---------------------------------------------
test('T04: prefixed location ("Công an phường X") resolves via shared published-locations lookup', async () => {
    const reply = await createZaloReply('Công an phường Phú Thọ', {
        getPublishedLocations: async () => locationDataset([phuThoLocation()]),
    });
    assert.equal(reply.intent, 'LOCATION_LOOKUP');
    assert.equal(reply.result, 'FOUND');
    assert.match(reply.text, /Công an phường Phú Thọ/);
    assert.match(reply.text, /Địa chỉ: Địa chỉ đã công khai/);
    assert.match(reply.text, /Điện thoại: 02101234567/);
    assert.match(reply.text, new RegExp(`Bản đồ CA Phú Thọ: ${CANONICAL_MAP_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.match(reply.text, /Chỉ đường: https:\/\/www\.google\.com\/maps/);

    const sparse = await createZaloReply('phường Phú Thọ', {
        getPublishedLocations: async () => locationDataset([phuThoLocation({ address: '', phone: '', googleMapsUrl: '' })]),
    });
    assert.doesNotMatch(sparse.text, /Địa chỉ:|Điện thoại:|Chỉ đường:/);
});

// --- T05: bare location name (P0-1) --------------------------------------
// "Phú Thọ" không dùng được làm ví dụ ở đây: nó nằm trong REGION_STOPWORDS của
// lib/published-locations.js (tên tỉnh, cố ý cấm match qua bareName trần để tránh nhầm ngữ
// cảnh vùng với tên đơn vị) — đúng hành vi website, không phải lỗi. Dùng một tên xã khác.
function hyCuongLocation(overrides = {}) {
    return {
        name: 'Công an xã Hy Cương',
        address: 'Địa chỉ xã Hy Cương',
        phone: '02109876543',
        aliases: {
            fullName: 'cong an xa hy cuong',
            withoutCongAn: 'xa hy cuong',
            bareName: 'hy cuong',
            approved: [],
        },
        ...overrides,
    };
}

test('T05: bare location name without any prefix still resolves deterministically (P0-1)', async () => {
    const reply = await createZaloReply('Hy Cương', {
        getPublishedLocations: async () => locationDataset([hyCuongLocation()]),
    });
    assert.equal(reply.intent, 'LOCATION_LOOKUP');
    assert.equal(reply.result, 'FOUND');
    assert.match(reply.text, /Công an xã Hy Cương/);
});

test('T05: a short non-location phrase does NOT get forced into a location lookup', async () => {
    // "cà phê sữa" chuẩn hoá thành chuỗi chữ cái thuần (giống một tên địa danh trần) nhưng
    // không khớp bất kỳ alias nào trong dataset -> NOT_FOUND tất định, KHÔNG rơi vào RAG
    // (đây vẫn là hành vi website gốc dùng chung, không phải heuristic Zalo tự chế).
    const reply = await createZaloReply('cà phê sữa', {
        getPublishedLocations: async () => locationDataset([phuThoLocation()]),
    });
    assert.equal(reply.result, 'NOT_FOUND');
});

test('T09 guard: a procedural question never triggers the location datasource', async () => {
    const reply = await createZaloReply('làm hộ chiếu thế nào', { getPublishedLocations: shouldNotLoadLocations });
    assert.deepEqual(reply, RAG_FALLBACK);
});

// --- T06: natural sentence containing location, not at sentence start ----
test('T06: natural sentence with location in the middle resolves deterministically (P0-2)', async () => {
    const dataset = locationDataset([phuThoLocation()]);
    for (const message of [
        'địa chỉ công an phường Phú Thọ ở đâu',
        'số điện thoại công an phường Phú Thọ',
        'cho tôi hỏi công an phường Phú Thọ ở đâu',
    ]) {
        const reply = await createZaloReply(message, { getPublishedLocations: async () => dataset });
        assert.equal(reply.result, 'FOUND', `expected FOUND for: ${message}`);
    }
});

// --- T07: nonexistent location -------------------------------------------
test('T07: nonexistent location returns deterministic NOT_FOUND, never guesses', async () => {
    const reply = await createZaloReply('xã Không Tồn Tại', {
        getPublishedLocations: async () => locationDataset([]),
    });
    assert.equal(reply.result, 'NOT_FOUND');
    assert.match(reply.text, /thử nhập đầy đủ tên xã\/phường/);
});

// --- T08: ambiguous location (P0-3) ---------------------------------------
test('T08: ambiguous match (two real different units) lists up to 5 candidates by name only', async () => {
    const reply = await createZaloReply('phường Phú Thọ', {
        getPublishedLocations: async () => locationDataset([
            phuThoLocation({ address: 'Địa chỉ A', aliases: { fullName: 'cong an phuong phu tho', withoutCongAn: 'phuong phu tho', bareName: 'phu tho', approved: [] } }),
            phuThoLocation({ name: 'Đơn vị khác phường Phú Thọ', address: 'Địa chỉ B', aliases: { fullName: 'don vi khac phuong phu tho', withoutCongAn: 'phuong phu tho', bareName: 'phu tho', approved: [] } }),
        ]),
    });
    assert.equal(reply.result, 'AMBIGUOUS');
    assert.match(reply.text, /nhiều kết quả phù hợp/);
    assert.match(reply.text, /1\. Công an phường Phú Thọ/);
    assert.match(reply.text, /2\. Đơn vị khác phường Phú Thọ/);
    // Không tự chọn, không lộ địa chỉ/SĐT/toạ độ trong danh sách.
    assert.doesNotMatch(reply.text, /Địa chỉ A|Địa chỉ B/);
});

test('T08: ambiguous_conflict (same name, contradictory data) keeps the generic message, no duplicate-name list', () => {
    const reply = buildLocationReply({
        status: 'ambiguous_conflict',
        conflicts: [{ name: 'Công an phường X', records: [{ name: 'Công an phường X' }, { name: 'Công an phường X' }] }],
    });
    assert.equal(reply.result, 'AMBIGUOUS');
    assert.equal(reply.text, 'Tôi tìm thấy nhiều kết quả phù hợp.\n\nVui lòng nhập đầy đủ tên xã/phường.');
});

test('ambiguous candidate list is capped at 5 options', () => {
    const matches = Array.from({ length: 7 }, (_, i) => ({ name: `Công an phường Test ${i + 1}` }));
    const reply = buildLocationReply({ status: 'ambiguous_match', matches });
    assert.match(reply.text, /5\. Công an phường Test 5/);
    assert.doesNotMatch(reply.text, /6\. Công an phường Test 6/);
});

test('matched response never invents absent address, phone, or map coordinates', () => {
    const reply = buildLocationReply({ status: 'matched', matches: [{ name: 'Đơn vị chỉ có tên' }] });
    assert.equal(reply.result, 'FOUND');
    assert.equal(reply.text, `Đơn vị chỉ có tên\n🗺️ Xem trên Bản đồ CA Phú Thọ: ${CANONICAL_MAP_URL}`);
});

// --- T09: normal TTHC question -> shared RAG fallback sentinel -----------
test('T09: a message with no static intent and no location evidence returns the RAG fallback sentinel', async () => {
    const reply = await createZaloReply('Tôi cần làm thủ tục khai báo tạm trú cho người nước ngoài', {
        getPublishedLocations: shouldNotLoadLocations,
    });
    assert.deepEqual(reply, RAG_FALLBACK);
    assert.equal(reply.text, null);
});

test('missing_location_evidence (location-shaped request without a place) falls back to RAG, not a guess', async () => {
    const findVerifiedLocationMatches = () => ({ status: 'missing_location_evidence', matches: [] });
    const reply = await createZaloReply('công an ở đâu', {
        getPublishedLocations: async () => locationDataset([]),
        findVerifiedLocationMatches,
    });
    assert.deepEqual(reply, RAG_FALLBACK);
});
