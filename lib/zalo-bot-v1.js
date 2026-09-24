'use strict';

const { normalizeLabel } = require('../js/location-data');
const { findVerifiedLocationMatches, getPublishedLocations } = require('./published-locations');

const CANONICAL_MAP_URL = 'https://bandocapt.vercel.app/';

function normalizeZaloMessage(message) {
    return normalizeLabel(message).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function stripLocationPrefix(message) {
    let value = normalizeZaloMessage(message);
    const prefixes = /^(?:cong an|ca|tim|dia chi)\s+/;
    while (prefixes.test(value)) value = value.replace(prefixes, '').trim();
    return value;
}

function resolveZaloIntent(message) {
    const normalized = normalizeZaloMessage(message);
    if (/^(xin chao|chao|hello|hi)(?: bot)?$/.test(normalized)) return { intent: 'GREETING' };
    if (/^(tro giup|huong dan|help)$/.test(normalized)) return { intent: 'HELP' };
    if (/^(ban do|mo ban do|ban do cong an|website)$/.test(normalized)) return { intent: 'MAP' };

    const query = stripLocationPrefix(message);
    const explicitLocation = /^(?:xa|phuong|thi tran|thi xa)\b/.test(query) ||
        /^(?:cong an|ca|tim|dia chi)\b/.test(normalized);
    return explicitLocation && query
        ? { intent: 'LOCATION_CANDIDATE', query, explicitLocation: true }
        : { intent: 'FALLBACK' };
}

function buildLocationReply(result, mapUrl = CANONICAL_MAP_URL) {
    if (result.status === 'ambiguous_match' || result.status === 'ambiguous_conflict') {
        return {
            intent: 'LOCATION_LOOKUP', result: 'AMBIGUOUS',
            text: 'Tôi tìm thấy nhiều kết quả phù hợp.\n\nVui lòng nhập đầy đủ tên xã/phường.',
        };
    }
    if (result.status !== 'matched' || !result.matches?.[0]) {
        return {
            intent: 'LOCATION_LOOKUP', result: 'NOT_FOUND',
            text: 'Tôi chưa tìm thấy địa điểm phù hợp.\n\nBạn hãy thử nhập đầy đủ tên xã/phường.',
        };
    }

    const location = result.matches[0];
    const lines = [location.name];
    if (location.address) lines.push(`📍 Địa chỉ: ${location.address}`);
    if (location.phone && String(location.phone).replace(/\D/g, '').length >= 7) {
        lines.push(`☎️ Điện thoại: ${location.phone}`);
    }
    lines.push(`🗺️ Xem trên Bản đồ CA Phú Thọ: ${mapUrl}`);
    if (location.googleMapsUrl) lines.push(`Chỉ đường: ${location.googleMapsUrl}`);
    return { intent: 'LOCATION_LOOKUP', result: 'FOUND', text: lines.join('\n') };
}

async function createZaloReply(message, options = {}) {
    const resolved = resolveZaloIntent(message);
    if (resolved.intent === 'GREETING') {
        return {
            intent: resolved.intent,
            result: 'REPLIED',
            text: 'Xin chào! Tôi là trợ lý Bản đồ Công an Phú Thọ.\n\nBạn có thể nhập tên xã/phường cần tìm hoặc nhập "trợ giúp" để xem các chức năng.',
        };
    }
    if (resolved.intent === 'HELP') {
        return {
            intent: resolved.intent,
            result: 'REPLIED',
            text: 'Bạn có thể:\n\n🔎 Nhập tên xã/phường để tìm đơn vị Công an\n🗺️ Nhập "bản đồ" để mở Bản đồ Công an Phú Thọ\nℹ️ Nhập "trợ giúp" để xem hướng dẫn',
        };
    }
    if (resolved.intent === 'MAP') {
        return { intent: resolved.intent, result: 'REPLIED', text: `Bản đồ Công an Phú Thọ: ${CANONICAL_MAP_URL}` };
    }
    if (resolved.intent === 'FALLBACK') {
        return {
            intent: 'FALLBACK', result: 'REPLIED',
            text: 'Tôi chưa hiểu yêu cầu này.\n\nBạn có thể nhập tên xã/phường cần tìm hoặc nhập "trợ giúp".',
        };
    }

    const getLocations = options.getPublishedLocations || getPublishedLocations;
    const findMatches = options.findVerifiedLocationMatches || findVerifiedLocationMatches;
    const dataset = await getLocations(options.locationOptions || {});
    const lookup = findMatches(resolved.query, [], dataset);
    return buildLocationReply(lookup);
}

module.exports = {
    CANONICAL_MAP_URL,
    normalizeZaloMessage,
    stripLocationPrefix,
    resolveZaloIntent,
    buildLocationReply,
    createZaloReply,
};
