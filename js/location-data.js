(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.LocationData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    // Covers the current Phu Tho administrative area, including the 2025 expansion.
    const PHU_THO_BOUNDS = Object.freeze({
        minLat: 20.25,
        maxLat: 21.85,
        minLng: 104.65,
        maxLng: 106.85,
    });

    const FIELD_ALIASES = Object.freeze({
        name: ['name', 'ten don vi', 'ten dia diem', 'ten tru so'],
        type: ['type', 'loai', 'loai don vi', 'loai dia diem'],
        address: ['address', 'dia chi'],
        phone: ['phone', 'so dien thoai', 'dien thoai'],
        coordinates: ['coordinates', 'toa do', 'vi tri', 'google maps', 'link google maps'],
        imageUrl: ['image', 'image url', 'hinh anh', 'anh dai dien'],
        searchAliases: ['search_aliases', 'search aliases', 'alias tim kiem', 'aliases', 'alias'],
        recordId: ['record id', 'record_id', 'ma ban ghi'],
        updatedAt: ['updated at', 'updated_at', 'cap nhat luc', 'ngay cap nhat'],
    });

    function normalizeLabel(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[đĐ]/g, 'd')
            .replace(/[_-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    function parseCoordinates(value, bounds = PHU_THO_BOUNDS) {
        const input = String(value || '').trim();
        if (!input) return { ok: false, error: 'COORDINATES_MISSING' };

        const patterns = [
            /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
            /[?&](?:q|query|ll|destination)=(-?\d+(?:\.\d+)?)(?:%2C|,|\s)+(-?\d+(?:\.\d+)?)/i,
            /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/i,
            /(?:^|[^\d.-])(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)(?:$|[^\d.])/,
        ];

        let match = null;
        const decoded = (() => {
            try { return decodeURIComponent(input); } catch (_) { return input; }
        })();
        for (const pattern of patterns) {
            match = decoded.match(pattern);
            if (match) break;
        }
        if (!match) return { ok: false, error: 'COORDINATES_FORMAT_INVALID' };

        const lat = Number(match[1]);
        const lng = Number(match[2]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return { ok: false, error: 'COORDINATES_NOT_NUMERIC' };
        }
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            return { ok: false, error: 'COORDINATES_OUT_OF_RANGE', lat, lng };
        }
        if (bounds && (lat < bounds.minLat || lat > bounds.maxLat ||
            lng < bounds.minLng || lng > bounds.maxLng)) {
            return { ok: false, error: 'COORDINATES_OUTSIDE_SERVICE_AREA', lat, lng };
        }

        return { ok: true, lat, lng };
    }

    function getCellValue(row, index) {
        const cell = row?.c?.[index];
        if (!cell) return '';
        return cell.v ?? cell.f ?? '';
    }

    function resolveColumnIndexes(columns) {
        const labels = (columns || []).map(column => normalizeLabel(column?.label || column?.id));
        const indexes = {};
        for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
            indexes[field] = labels.findIndex(label => aliases.includes(label));
        }

        // Compatibility for an approved sheet copied from the legacy Form response layout.
        const legacy = { name: 2, type: 3, address: 4, phone: 5, coordinates: 6, imageUrl: 7 };
        for (const [field, index] of Object.entries(legacy)) {
            if (indexes[field] < 0) indexes[field] = index;
        }
        return indexes;
    }

    function normalizePublishedLocations(payload, options = {}) {
        const table = payload?.table;
        if (!table || !Array.isArray(table.rows)) {
            return { locations: [], rejected: [{ row: 0, error: 'SHEET_SCHEMA_INVALID' }] };
        }

        const indexes = resolveColumnIndexes(table.cols);
        const locations = [];
        const rejected = [];

        table.rows.forEach((row, rowIndex) => {
            const sourceRow = rowIndex + 2;
            const name = String(getCellValue(row, indexes.name) || '').trim();
            if (!name) {
                rejected.push({ row: sourceRow, error: 'NAME_MISSING' });
                return;
            }

            const parsed = parseCoordinates(getCellValue(row, indexes.coordinates), options.bounds);
            if (!parsed.ok) {
                rejected.push({ row: sourceRow, name, error: parsed.error });
                return;
            }

            const typeRaw = String(getCellValue(row, indexes.type) || '');
            locations.push({
                id: String(getCellValue(row, indexes.recordId) || sourceRow),
                name,
                type: /CCCD|can cuoc|id_center/i.test(normalizeLabel(typeRaw)) ? 'id_center' : 'police_station',
                address: String(getCellValue(row, indexes.address) || '').trim(),
                phone: String(getCellValue(row, indexes.phone) || '').trim(),
                coordinates: String(getCellValue(row, indexes.coordinates) || '').trim(),
                imageUrl: String(getCellValue(row, indexes.imageUrl) || '').trim(),
                searchAliases: String(getCellValue(row, indexes.searchAliases) || '').trim(),
                updatedAt: String(getCellValue(row, indexes.updatedAt) || '').trim(),
                lat: parsed.lat,
                lng: parsed.lng,
            });
        });

        return { locations, rejected };
    }

    return {
        PHU_THO_BOUNDS,
        normalizeLabel,
        parseCoordinates,
        normalizePublishedLocations,
    };
});
