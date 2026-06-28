'use strict';

const {
    normalizeLabel,
    normalizePublishedLocations,
} = require('../js/location-data');

const PUBLISHED_SHEET = 'Published_Locations';
const GOOGLE_TIMEOUT_MS = 8000;
const LOCATION_CACHE_TTL_MS = 60 * 1000;
const LOCATION_CACHE_STALE_MAX_MS = 5 * 60 * 1000;
const DUPLICATE_COORDINATE_PRECISION = 6;
const ASSISTANT_LOCATION_FOLLOWUP_PATTERNS = [
    /ban o xa\/phuong nao/i,
    /ban o xa nao/i,
    /ban o phuong nao/i,
    /ban dang o xa\/phuong nao/i,
    /de minh chi dung tru so cong an/i,
    /de minh chi dung cong an/i,
];
const LOCATION_TRIGGER_PATTERNS = [
    /\b(cong an|tru so|dia chi|o dau|so dien thoai|google maps|chi duong)\b/i,
    /\b(xa|phuong|thi tran|thi xa)\b/i,
];
const ADMIN_PREFIX_PATTERN = /^(xa|phuong|thi tran|thi xa)\s+/;

let locationCache = null;

function parseGoogleVisualizationPayload(text) {
    const match = String(text || '').match(/google\.visualization\.Query\.setResponse\((.+)\);?\s*$/s);
    if (!match?.[1]) throw new Error('INVALID_GOOGLE_RESPONSE');

    const payload = JSON.parse(match[1]);
    if (!payload?.table || !Array.isArray(payload.table.cols) || !Array.isArray(payload.table.rows)) {
        throw new Error('INVALID_SHEET_SCHEMA');
    }
    return payload;
}

async function fetchGoogleVisualizationPayload(options = {}) {
    const sheetId = options.sheetId || process.env.GOOGLE_SHEET_ID;
    if (!sheetId) throw new Error('GOOGLE_SHEET_ID_MISSING');

    const fetchImpl = options.fetchImpl || fetch;
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs || GOOGLE_TIMEOUT_MS;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(PUBLISHED_SHEET)}`;
        const response = await fetchImpl(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`GOOGLE_HTTP_${response.status}`);
        return parseGoogleVisualizationPayload(await response.text());
    } finally {
        clearTimeout(timeout);
    }
}

function buildRecordSignature(record) {
    const lat = Number(record.lat);
    const lng = Number(record.lng);
    return [
        normalizeLabel(record.address),
        normalizeLabel(record.phone),
        Number.isFinite(lat) ? lat.toFixed(DUPLICATE_COORDINATE_PRECISION) : '',
        Number.isFinite(lng) ? lng.toFixed(DUPLICATE_COORDINATE_PRECISION) : '',
    ].join('|');
}

function buildLocationAliases(name) {
    const normalizedName = normalizeLabel(name);
    const withoutCongAn = normalizedName.replace(/^cong an\s+/, '').trim();
    const bareName = withoutCongAn.replace(ADMIN_PREFIX_PATTERN, '').trim();
    return Array.from(new Set([normalizedName, withoutCongAn, bareName].filter(Boolean)));
}

function dedupePublishedLocations(locations) {
    const groups = new Map();

    for (const location of locations) {
        const normalizedName = normalizeLabel(location.name);
        const signature = buildRecordSignature(location);
        const existing = groups.get(normalizedName) || {
            normalizedName,
            name: location.name,
            recordsBySignature: new Map(),
        };
        if (!existing.recordsBySignature.has(signature)) {
            existing.recordsBySignature.set(signature, {
                ...location,
                normalizedName,
                aliases: buildLocationAliases(location.name),
            });
        }
        groups.set(normalizedName, existing);
    }

    const uniqueLocations = [];
    const conflicts = [];
    for (const group of groups.values()) {
        const records = Array.from(group.recordsBySignature.values());
        if (records.length === 1) {
            uniqueLocations.push(records[0]);
            continue;
        }
        conflicts.push({
            normalizedName: group.normalizedName,
            name: group.name,
            records,
        });
    }

    return { uniqueLocations, conflicts };
}

function getGoogleMapsUrl(location) {
    const lat = Number(location?.lat);
    const lng = Number(location?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

async function getPublishedLocations(options = {}) {
    const now = Number.isFinite(options.now) ? options.now : Date.now();
    if (locationCache && now - locationCache.fetchedAt <= LOCATION_CACHE_TTL_MS) {
        return { ...locationCache, cacheStatus: 'fresh' };
    }

    try {
        const payload = await fetchGoogleVisualizationPayload(options);
        const normalized = normalizePublishedLocations(payload);
        const deduped = dedupePublishedLocations(normalized.locations);
        locationCache = {
            payload,
            fetchedAt: now,
            locations: deduped.uniqueLocations.map(location => ({
                ...location,
                googleMapsUrl: getGoogleMapsUrl(location),
            })),
            rejected: normalized.rejected,
            conflicts: deduped.conflicts.map(conflict => ({
                ...conflict,
                records: conflict.records.map(location => ({
                    ...location,
                    googleMapsUrl: getGoogleMapsUrl(location),
                })),
            })),
        };
        return { ...locationCache, cacheStatus: 'fresh' };
    } catch (error) {
        if (locationCache && now - locationCache.fetchedAt <= LOCATION_CACHE_STALE_MAX_MS) {
            return { ...locationCache, cacheStatus: 'stale', staleReason: error.message || 'UNKNOWN_ERROR' };
        }
        throw error;
    }
}

function getRecentText(history, role, limit = 3) {
    return (history || [])
        .filter(item => item?.role === role)
        .slice(-limit)
        .map(item => item?.parts?.map(part => String(part?.text || '')).join(' ').trim())
        .filter(Boolean);
}

function wasAssistantAskingForLocation(history) {
    const recentAssistantTexts = getRecentText(history, 'model', 2);
    return recentAssistantTexts.some(text => {
        const normalized = normalizeLabel(text);
        return ASSISTANT_LOCATION_FOLLOWUP_PATTERNS.some(pattern => pattern.test(normalized));
    });
}

function isLocationLookupRequested(currentMessage, history) {
    const recentUserTexts = getRecentText(history, 'user', 2);
    const haystack = [currentMessage, ...recentUserTexts].map(text => normalizeLabel(text)).join(' ');
    return LOCATION_TRIGGER_PATTERNS.some(pattern => pattern.test(haystack)) || wasAssistantAskingForLocation(history);
}

function buildLookupTexts(currentMessage, history) {
    const texts = [];
    const add = (text, source, allowBareName) => {
        const normalized = normalizeLabel(text);
        if (!normalized) return;
        if (!texts.some(item => item.normalized === normalized && item.allowBareName === allowBareName)) {
            texts.push({ normalized, source, allowBareName });
        }
    };

    add(currentMessage, 'current', false);
    if (wasAssistantAskingForLocation(history)) {
        add(currentMessage, 'current-followup', true);
    }

    const recentUserTexts = getRecentText(history, 'user', 2);
    for (const text of recentUserTexts) {
        add(text, 'history', false);
    }

    return texts;
}

function aliasAppearsInText(alias, normalizedText) {
    if (!alias || !normalizedText) return false;
    const boundaryPattern = new RegExp(`(^|\\s)${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|\\s)`, 'i');
    return boundaryPattern.test(normalizedText);
}

function scoreLocationMatch(location, lookupTexts) {
    let bestScore = -1;
    let matchedAlias = '';

    for (const lookupText of lookupTexts) {
        const fullAlias = location.aliases[0];
        const withoutCongAn = location.aliases[1] || '';
        const bareName = location.aliases[2] || '';

        if (aliasAppearsInText(fullAlias, lookupText.normalized)) {
            const score = lookupText.source === 'current' ? 120 : 110;
            if (score > bestScore) {
                bestScore = score;
                matchedAlias = fullAlias;
            }
        }
        if (withoutCongAn && aliasAppearsInText(withoutCongAn, lookupText.normalized)) {
            const score = lookupText.source === 'current' ? 100 : 90;
            if (score > bestScore) {
                bestScore = score;
                matchedAlias = withoutCongAn;
            }
        }
        if (lookupText.allowBareName && bareName && aliasAppearsInText(bareName, lookupText.normalized)) {
            const score = lookupText.source === 'current-followup' ? 80 : 70;
            if (score > bestScore) {
                bestScore = score;
                matchedAlias = bareName;
            }
        }
    }

    if (bestScore < 0) return null;
    return { score: bestScore, matchedAlias };
}

function findVerifiedLocationMatches(currentMessage, history, dataset) {
    const lookupRequested = isLocationLookupRequested(currentMessage, history);
    if (!lookupRequested) {
        return { lookupRequested: false, status: 'not_requested', matches: [] };
    }

    const lookupTexts = buildLookupTexts(currentMessage, history);
    const matchedLocations = [];
    for (const location of dataset.locations || []) {
        const match = scoreLocationMatch(location, lookupTexts);
        if (match) {
            matchedLocations.push({ ...location, matchScore: match.score, matchedAlias: match.matchedAlias });
        }
    }

    const matchedConflicts = [];
    for (const conflict of dataset.conflicts || []) {
        const score = conflict.records
            .map(location => scoreLocationMatch(location, lookupTexts))
            .filter(Boolean)
            .sort((a, b) => b.score - a.score)[0];
        if (score) {
            matchedConflicts.push({
                ...conflict,
                matchScore: score.score,
                matchedAlias: score.matchedAlias,
                records: conflict.records.map(location => ({
                    ...location,
                    googleMapsUrl: location.googleMapsUrl || getGoogleMapsUrl(location),
                })),
            });
        }
    }

    matchedLocations.sort((a, b) => b.matchScore - a.matchScore || a.name.localeCompare(b.name, 'vi'));
    matchedConflicts.sort((a, b) => b.matchScore - a.matchScore || a.name.localeCompare(b.name, 'vi'));

    if (matchedConflicts.length > 0) {
        return { lookupRequested: true, status: 'ambiguous_conflict', matches: [], conflicts: matchedConflicts };
    }
    if (matchedLocations.length === 0) {
        return { lookupRequested: true, status: 'no_match', matches: [] };
    }

    const bestScore = matchedLocations[0].matchScore;
    const topMatches = matchedLocations.filter(location => location.matchScore === bestScore);
    if (topMatches.length > 1) {
        return { lookupRequested: true, status: 'ambiguous_match', matches: topMatches };
    }

    return { lookupRequested: true, status: 'matched', matches: [matchedLocations[0]] };
}

function formatVerifiedLocationsPrompt(result, dataset) {
    const cacheStatus = dataset?.cacheStatus || 'fresh';
    if (!result?.lookupRequested) {
        return `STATUS: not_requested\nCACHE_STATUS: ${cacheStatus}`;
    }

    if (result.status === 'unavailable') {
        return `STATUS: unavailable\nCACHE_STATUS: unavailable\nNOTE: Du lieu tru so tam thoi khong kha dung. Van co the tra loi phan thu tuc, nhung phai noi ro khong the xac minh dia chi tru so luc nay.`;
    }

    if (result.status === 'no_match') {
        return `STATUS: no_match\nCACHE_STATUS: ${cacheStatus}\nNOTE: Chua tim thay tru so duoc xac minh khop voi thong tin nguoi dung vua cung cap.`;
    }

    if (result.status === 'ambiguous_conflict') {
        const lines = result.conflicts.flatMap((conflict, index) => {
            return [
                `CONFLICT ${index + 1}: ${conflict.name}`,
                ...conflict.records.map((record, recordIndex) => `${index + 1}.${recordIndex + 1} | TEN=${record.name} | DIA_CHI=${record.address || 'Chua co'} | SDT=${record.phone || 'Chua co'} | TOA_DO=${record.lat},${record.lng} | GOOGLE_MAPS=${record.googleMapsUrl || 'Chua co'}`),
            ];
        });
        return `STATUS: ambiguous_conflict\nCACHE_STATUS: ${cacheStatus}\nNOTE: Co nhieu ban ghi cung ten nhung du lieu mau thuan. Khong duoc tu chon. Yeu cau nguoi dung xac nhan them.\n${lines.join('\n')}`;
    }

    if (result.status === 'ambiguous_match') {
        const lines = result.matches.map((record, index) =>
            `OPTION ${index + 1} | TEN=${record.name} | DIA_CHI=${record.address || 'Chua co'} | SDT=${record.phone || 'Chua co'} | TOA_DO=${record.lat},${record.lng} | GOOGLE_MAPS=${record.googleMapsUrl || 'Chua co'}`
        );
        return `STATUS: ambiguous_match\nCACHE_STATUS: ${cacheStatus}\nNOTE: Co nhieu tru so khop cung muc uu tien. Yeu cau nguoi dung noi ro xa/phuong, khong duoc tu chon.\n${lines.join('\n')}`;
    }

    const record = result.matches[0];
    return [
        `STATUS: matched`,
        `CACHE_STATUS: ${cacheStatus}`,
        `TEN=${record.name}`,
        `DIA_CHI=${record.address || 'Chua co'}`,
        `SDT=${record.phone || 'Chua co'}`,
        `TOA_DO=${record.lat},${record.lng}`,
        `GOOGLE_MAPS=${record.googleMapsUrl || 'Chua co'}`,
        `MATCHED_ALIAS=${record.matchedAlias || ''}`,
    ].join('\n');
}

function resetPublishedLocationsCache() {
    locationCache = null;
}

module.exports = {
    PUBLISHED_SHEET,
    GOOGLE_TIMEOUT_MS,
    LOCATION_CACHE_TTL_MS,
    LOCATION_CACHE_STALE_MAX_MS,
    parseGoogleVisualizationPayload,
    fetchGoogleVisualizationPayload,
    getPublishedLocations,
    isLocationLookupRequested,
    findVerifiedLocationMatches,
    formatVerifiedLocationsPrompt,
    getGoogleMapsUrl,
    resetPublishedLocationsCache,
};
