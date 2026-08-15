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

test('a redirect response missing a Location header fails closed', async () => {
    await assert.rejects(() => resolveMapsCoordinates('https://maps.app.goo.gl/broken', {
        fetchImpl: async () => ({ status: 302, headers: { get: () => null } }),
    }), error => error.code === 'MAPS_RESOLVE_UNAVAILABLE');
});
