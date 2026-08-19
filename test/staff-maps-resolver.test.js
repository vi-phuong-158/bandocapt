const assert = require('node:assert/strict');
const test = require('node:test');

const { resolveMapsCoordinates, resolveGoogleMapsRedirect, MAX_REDIRECTS } = require('../lib/staff-maps-resolver');

function redirectResponse(location) {
    return { status: 302, headers: { get: key => (key === 'location' ? location : null) } };
}
function finalResponse() {
    return { status: 200, headers: { get: () => null } };
}

test('M1: a URL that already encodes coordinates resolves without any network call', async () => {
    let calls = 0;
    const result = await resolveMapsCoordinates('https://www.google.com/maps/@21.3225,105.4027,15z', {
        fetchImpl: async () => { calls += 1; return finalResponse(); },
    });
    assert.deepEqual(result, { lat: 21.3225, lng: 105.4027 });
    assert.equal(calls, 0, 'a direct-coordinate URL must not trigger a redirect fetch at all');
});

test('M1: maps.app.goo.gl short link resolves through one redirect to a coordinate-bearing final URL', async () => {
    const calls = [];
    const result = await resolveMapsCoordinates('https://maps.app.goo.gl/abc123', {
        fetchImpl: async (url) => {
            calls.push(url);
            if (url === 'https://maps.app.goo.gl/abc123') {
                return redirectResponse('https://www.google.com/maps/place/X/@21.3225,105.4027,17z');
            }
            return finalResponse();
        },
    });
    assert.deepEqual(result, { lat: 21.3225, lng: 105.4027 });
    assert.equal(calls.length, 2);
});

test('M2: multiple chained Google-owned redirects stay bounded and still succeed', async () => {
    const calls = [];
    const chain = [
        'https://maps.app.goo.gl/start',
        'https://goo.gl/maps/hop1',
        'https://www.google.com/maps/hop2',
        'https://www.google.com/maps/place/X/@21.3225,105.4027,17z',
    ];
    const result = await resolveMapsCoordinates(chain[0], {
        fetchImpl: async (url) => {
            calls.push(url);
            const index = chain.indexOf(url);
            if (index < chain.length - 1) return redirectResponse(chain[index + 1]);
            return finalResponse();
        },
    });
    assert.deepEqual(result, { lat: 21.3225, lng: 105.4027 });
    assert.equal(calls.length, chain.length);
    assert.ok(calls.length <= MAX_REDIRECTS);
});

test('M3: a redirect to a non-Google host is rejected before it is ever followed', async () => {
    let followedAttacker = false;
    await assert.rejects(() => resolveMapsCoordinates('https://maps.app.goo.gl/evil', {
        fetchImpl: async (url) => {
            if (url === 'https://attacker.example/steal') { followedAttacker = true; return finalResponse(); }
            return redirectResponse('https://attacker.example/steal');
        },
    }), error => error.code === 'MAPS_RESOLVE_UNAVAILABLE');
    assert.equal(followedAttacker, false, 'the resolver must never issue a fetch to the rejected host');
});

test('M3: private/internal hosts and dangerous schemes are rejected outright, no network call issued', async () => {
    const forbidden = [
        'https://localhost/abc', 'https://127.0.0.1/abc', 'https://169.254.169.254/latest/meta-data',
        'https://10.0.0.5/abc', 'https://evil.example/@21.3225,105.4027',
    ];
    for (const url of forbidden) {
        let calls = 0;
        await assert.rejects(() => resolveMapsCoordinates(url, { fetchImpl: async () => { calls += 1; return finalResponse(); } }),
            error => error.code === 'COORDINATE_INVALID_LINK');
        assert.equal(calls, 0, `${url} must be rejected before any fetch`);
    }
});

test('M4: non-HTTPS and dangerous URL schemes are rejected outright', async () => {
    const forbidden = [
        'http://maps.app.goo.gl/abc', 'ftp://maps.app.goo.gl/abc',
        'file:///etc/passwd', 'javascript:alert(1)',
    ];
    for (const url of forbidden) {
        await assert.rejects(() => resolveGoogleMapsRedirect(url, { fetchImpl: async () => finalResponse() }),
            error => error.code === 'COORDINATE_INVALID_LINK');
    }
});

test('M5: too many redirects fails closed without ever exceeding the bound', async () => {
    let calls = 0;
    await assert.rejects(() => resolveMapsCoordinates('https://maps.app.goo.gl/loop', {
        fetchImpl: async (url) => { calls += 1; return redirectResponse(url + '0'); },
    }), error => error.code === 'MAPS_RESOLVE_UNAVAILABLE');
    assert.equal(calls, MAX_REDIRECTS);
});

test('M6: resolver timeout produces a controlled, sanitized error', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const callPromise = resolveMapsCoordinates('https://maps.app.goo.gl/slow', {
        timeoutMs: 50,
        fetchImpl: (url, options) => new Promise((resolve, reject) => {
            options.signal.addEventListener('abort', () => reject(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' })), { once: true });
        }),
    });
    t.mock.timers.tick(50);
    await assert.rejects(() => callPromise, error => error.code === 'MAPS_RESOLVE_UNAVAILABLE' && !/AbortError|DOMException/i.test(error.message));
});

test('M7: coordinates outside the Phú Thọ service area are rejected with the existing status', async () => {
    await assert.rejects(
        () => resolveMapsCoordinates('https://www.google.com/maps/@10.762622,106.660172,15z'),
        error => error.code === 'COORDINATE_OUTSIDE_PHU_THO',
    );
});

test('a resolved final URL without any parseable coordinates fails gracefully for manual fallback', async () => {
    await assert.rejects(() => resolveMapsCoordinates('https://maps.app.goo.gl/no-coords', {
        fetchImpl: async (url) => (url === 'https://maps.app.goo.gl/no-coords'
            ? redirectResponse('https://www.google.com/maps/search/some+place')
            : finalResponse()),
    }), error => error.code === 'COORDINATE_NEEDS_REVIEW');
});

// ---------------------------------------------------------------------------------------------
// R2/R3/R4 — regression trên BA short link Google Maps thật.
//
// `finalUrl` dưới đây là URL cuối ghi nhận được khi resolve thật ngày 2026-08-15 (xem báo cáo
// task). Chúng được đóng băng làm fixture nên CI không bao giờ gọi Google live.
//
// Bằng chứng root cause: cả ba link tới ba địa điểm KHÁC NHAU nhưng đều mang cùng một
// `@21.3140333,105.4126319`. Parser cũ ưu tiên `@` nên trả cùng một toạ độ cho cả ba — mọi trụ sở
// nhập qua Staff Portal sẽ trùng điểm.
//
// `placeCoordinate` là giá trị `!8m2!3d!4d` có thật trong URL (toạ độ entity của Google).
// `acceptanceCoordinate` là toạ độ người dùng đọc tay khi nghiệm thu; nó không xuất hiện trong URL
// nên không thể — và không được phép — trả về đúng từng chữ số. Kiểm tra bao ngoài dưới đây chỉ để
// chứng minh ứng viên đã chọn nằm đúng chỗ địa điểm; PHÉP CHỌN vẫn thuần theo ngữ nghĩa nguồn,
// không dùng khoảng cách.
const LIVE_FIXTURES = [
    {
        id: 'R2',
        shortUrl: 'https://maps.app.goo.gl/F64vgKJzFPqm1sSN7',
        finalUrl: 'https://www.google.com/maps/place/Nh%C3%A0+H%C3%A0ng+-+C%C3%A0+Ph%C3%AA+D%C5%A9ng+Ph%C3%BAc/@21.3140333,105.4126319,17z/data=!4m6!3m5!1s0x3134f2b23517d0fb:0x16932be4cc12ebcd!8m2!3d21.3127579!4d105.4112769!16s%2Fg%2F11c59zx1cj?entry=tts',
        placeCoordinate: { lat: 21.3127579, lng: 105.4112769 },
        acceptanceCoordinate: { lat: 21.313428060472614, lng: 105.41124894925905 },
    },
    {
        id: 'R3',
        shortUrl: 'https://maps.app.goo.gl/miWbxLHcq5FRhea49',
        finalUrl: 'https://www.google.com/maps/place/Xi%C3%AAn+Ngon+MonFood+Vi%E1%BB%87t+Tr%C3%AC/@21.3140333,105.4126319,17z/data=!4m6!3m5!1s0x3134f3004a214f45:0x3861c86d50f26327!8m2!3d21.3157995!4d105.4175208!16s%2Fg%2F11lp7ly8sp?entry=tts',
        placeCoordinate: { lat: 21.3157995, lng: 105.4175208 },
        acceptanceCoordinate: { lat: 21.315952309207464, lng: 105.41747593142287 },
    },
    {
        id: 'R4',
        shortUrl: 'https://maps.app.goo.gl/Y3cXALokxECeYt9B6',
        finalUrl: 'https://www.google.com/maps/place/Cross+Vibe+Vi%E1%BB%87t+Tr%C3%AC+-+T%E1%BB%91t/@21.3140333,105.4126319,17z/data=!4m9!3m8!1s0x3134f387bd1e76bb:0x553dfd19c07c778e!5m2!4m1!1i2!8m2!3d21.3134213!4d105.4155139!16s%2Fg%2F11f635d0j4?entry=tts',
        placeCoordinate: { lat: 21.3134213, lng: 105.4155139 },
        acceptanceCoordinate: { lat: 21.31365346955366, lng: 105.41544818143757 },
    },
];

const SHARED_VIEWPORT = { lat: 21.3140333, lng: 105.4126319 };

function metersBetween(a, b) {
    const toRad = deg => (deg * Math.PI) / 180;
    const h = Math.sin(toRad(b.lat - a.lat) / 2) ** 2
        + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(toRad(b.lng - a.lng) / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

for (const fixture of LIVE_FIXTURES) {
    test(`${fixture.id}: short link thật trả toạ độ địa điểm, không phải viewport (${fixture.shortUrl})`, async () => {
        const result = await resolveMapsCoordinates(fixture.shortUrl, {
            fetchImpl: async (url) => (url === fixture.shortUrl ? redirectResponse(fixture.finalUrl) : finalResponse()),
        });
        assert.deepEqual(result, fixture.placeCoordinate);
        assert.notDeepEqual(result, SHARED_VIEWPORT, 'không được trả toạ độ camera dùng chung');
        assert.ok(
            metersBetween(result, fixture.acceptanceCoordinate) < 100,
            `kết quả phải nằm tại địa điểm nghiệm thu, đo được ${metersBetween(result, fixture.acceptanceCoordinate).toFixed(1)}m`,
        );
    });
}

test('R2-R4: parser cũ trả CÙNG một điểm cho cả ba địa điểm khác nhau — bằng chứng root cause', () => {
    const viewports = LIVE_FIXTURES.map(fixture => fixture.finalUrl.match(/@(-?[\d.]+),(-?[\d.]+)/).slice(1, 3).join(','));
    assert.equal(new Set(viewports).size, 1, 'ba URL thật dùng chung một toạ độ viewport');
    const places = LIVE_FIXTURES.map(fixture => `${fixture.placeCoordinate.lat},${fixture.placeCoordinate.lng}`);
    assert.equal(new Set(places).size, 3, 'ba địa điểm phải có ba toạ độ entity riêng biệt');
});

test('a redirect response missing a Location header fails closed', async () => {
    await assert.rejects(() => resolveMapsCoordinates('https://maps.app.goo.gl/broken', {
        fetchImpl: async () => ({ status: 302, headers: { get: () => null } }),
    }), error => error.code === 'MAPS_RESOLVE_UNAVAILABLE');
});
