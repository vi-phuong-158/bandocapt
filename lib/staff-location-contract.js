(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('node:crypto'));
    else if (root) root.StaffLocationContract = factory(null);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (crypto) {
    'use strict';

// This list is intentionally identical to the Gateway V2 public snapshot allowlist.
const SNAPSHOT_FIELDS = Object.freeze([
    'record_id', 'unit_code', 'name', 'type', 'address', 'phone', 'coordinates', 'image_url',
    'search_aliases', 'updated_at', 'site_type', 'services', 'google_maps_url',
    'cccd_service_mode', 'service_schedule', 'served_units', 'status', 'verified_at',
]);

function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === 'object') {
        return Object.keys(value).sort().reduce((result, key) => {
            result[key] = stableValue(value[key]);
            return result;
        }, {});
    }
    return value;
}

function stableStringify(value) {
    return JSON.stringify(stableValue(value));
}

function canonicalizeSnapshot(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError('SNAPSHOT_INVALID');
    }
    const unknownFields = Object.keys(value).filter(key => !SNAPSHOT_FIELDS.includes(key));
    if (unknownFields.length) throw new TypeError('SNAPSHOT_UNKNOWN_FIELD');
    return Object.fromEntries(SNAPSHOT_FIELDS
        .filter(field => Object.prototype.hasOwnProperty.call(value, field))
        .map(field => [field, value[field]]));
}

function snapshotHash(snapshot) {
    if (!crypto) throw new Error('CRYPTO_RUNTIME_UNAVAILABLE');
    return crypto.createHash('sha256').update(stableStringify(canonicalizeSnapshot(snapshot))).digest('hex');
}

function toPublicSnapshot(location) {
    const source = location || {};
    return canonicalizeSnapshot({
        record_id: source.record_id ?? source.recordId ?? source.id ?? '',
        unit_code: source.unit_code ?? source.unitCode ?? '',
        name: source.name ?? '',
        type: source.type ?? '',
        address: source.address ?? '',
        phone: source.phone ?? '',
        coordinates: source.coordinates ?? '',
        image_url: source.image_url ?? source.imageUrl ?? '',
        search_aliases: source.search_aliases ?? source.searchAliases ?? '',
        updated_at: source.updated_at ?? source.updatedAt ?? '',
        site_type: source.site_type ?? source.siteType ?? '',
        services: source.services ?? [],
        // googleMapsUrl may be a UI-only coordinate-derived helper. When present, the
        // source value is authoritative for Staff snapshots, including an intentional blank.
        google_maps_url: source.sourceGoogleMapsUrl ?? source.google_maps_url ?? source.googleMapsUrl ?? '',
        cccd_service_mode: source.cccd_service_mode ?? source.cccdServiceMode ?? '',
        service_schedule: source.service_schedule ?? source.serviceSchedule ?? '',
        served_units: source.served_units ?? source.servedUnits ?? '',
        status: source.status ?? '',
        verified_at: source.verified_at ?? source.verifiedAt ?? '',
    });
}

return {
    SNAPSHOT_FIELDS,
    stableValue,
    stableStringify,
    canonicalizeSnapshot,
    snapshotHash,
    toPublicSnapshot,
};
});
