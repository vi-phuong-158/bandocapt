'use strict';

const { isGoogleMapsUrl, parseCoordinates } = require('../setup/apps-script');

const DEFAULT_TIMEOUT_MS = 6000;
const MAX_REDIRECTS = 5;

function mapsError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
}

// Only ever follows redirects that stay within the same Google Maps host allowlist used
// authoritatively by the Gateway (`isGoogleMapsUrl`). Never reads a response body — only the
// `Location` header on 3xx hops is inspected — and the whole chase shares a single deadline
// regardless of how many hops occur, so worst-case wall time is bounded independent of hop count.
async function resolveGoogleMapsRedirect(mapsUrl, options = {}) {
    if (!isGoogleMapsUrl(mapsUrl)) throw mapsError('COORDINATE_INVALID_LINK');
    const fetchImpl = options.fetchImpl || fetch;
    const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        let url = String(mapsUrl).trim();
        for (let attempt = 0; attempt < MAX_REDIRECTS; attempt += 1) {
            let response;
            try {
                response = await fetchImpl(url, {
                    redirect: 'manual', signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' },
                });
            } catch (_) {
                throw mapsError('MAPS_RESOLVE_UNAVAILABLE');
            }
            if (response.status >= 300 && response.status < 400) {
                const location = response.headers.get('location');
                if (!location) throw mapsError('MAPS_RESOLVE_UNAVAILABLE');
                let next;
                try { next = new URL(location, url).toString(); } catch (_) { throw mapsError('MAPS_RESOLVE_UNAVAILABLE'); }
                if (!isGoogleMapsUrl(next)) throw mapsError('MAPS_RESOLVE_UNAVAILABLE');
                url = next;
                continue;
            }
            return url;
        }
        throw mapsError('MAPS_RESOLVE_UNAVAILABLE');
    } finally {
        clearTimeout(timeout);
    }
}

// Frontend-only convenience: the Gateway independently re-validates whatever `coordinates` string
// ends up on the actual mutation request, so this is UX, not the authoritative check.
async function resolveMapsCoordinates(mapsUrl, options = {}) {
    const trimmed = String(mapsUrl || '').trim();
    if (!isGoogleMapsUrl(trimmed)) throw mapsError('COORDINATE_INVALID_LINK');
    const direct = parseCoordinates(trimmed);
    if (direct.ok) return { lat: direct.lat, lng: direct.lng };
    const finalUrl = await resolveGoogleMapsRedirect(trimmed, options);
    const parsed = parseCoordinates(finalUrl);
    if (!parsed.ok) {
        throw mapsError(parsed.error === 'COORDINATES_OUTSIDE_SERVICE_AREA' ? 'COORDINATE_OUTSIDE_PHU_THO' : 'COORDINATE_NEEDS_REVIEW');
    }
    return { lat: parsed.lat, lng: parsed.lng };
}

module.exports = { DEFAULT_TIMEOUT_MS, MAX_REDIRECTS, resolveGoogleMapsRedirect, resolveMapsCoordinates };
