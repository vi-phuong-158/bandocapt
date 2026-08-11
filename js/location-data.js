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
        siteType: ['site_type', 'site type', 'loai dia diem'],
        services: ['services', 'dich vu', 'cac chuc nang dich vu tai dia diem'],
        googleMapsUrl: ['google_maps_url', 'maps url', 'link maps'],
        cccdServiceMode: ['cccd_service_mode', 'cccd service mode', 'hinh thuc tiep nhan can cuoc'],
        serviceSchedule: ['service_schedule', 'service schedule', 'lich va thoi gian tiep nhan'],
        servedUnits: ['served_units', 'served units', 'dia ban hoac don vi duoc phuc vu'],
        unitCode: ['unit_code', 'unit code', 'ma don vi'],
        status: ['status', 'trang thai'],
        verifiedAt: ['verified_at', 'verified at', 'ngay xac minh'],
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

    function normalizeServices(value, legacyType) {
        const values = Array.isArray(value) ? value : String(value || '').split(/[|,;]/);
        const services = values.map(item => String(item || '').trim().toUpperCase().replace(/\s+/g, '_')).filter(Boolean);
        if (!services.length) services.push(/CCCD|can cuoc|id[ _]center/i.test(normalizeLabel(legacyType)) ? 'CITIZEN_ID' : 'POLICE_OFFICE');
        return Array.from(new Set(services));
    }

    function resolveColumnIndexes(columns) {
        const labels = (columns || []).map(column => normalizeLabel(column?.label || column?.id));
        const indexes = {};
        for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
            indexes[field] = labels.findIndex(label => aliases.includes(label));
        }

        // Compatibility for an approved sheet copied from the legacy Form response layout.
        // A short, unrelated table must never be interpreted as that layout.
        const semanticIndexes = { ...indexes };
        const legacy = { name: 2, type: 3, address: 4, phone: 5, coordinates: 6, imageUrl: 7 };
        const legacyCompatible = Array.isArray(columns) && columns.length >= 8;
        if (legacyCompatible) {
            for (const [field, index] of Object.entries(legacy)) {
                if (indexes[field] < 0) indexes[field] = index;
            }
        }
        return { indexes, semanticIndexes, labels, legacyCompatible };
    }

    function validatePublishedLocationsSchema(table, options = {}) {
        if (!table || !Array.isArray(table.cols) || !Array.isArray(table.rows)) {
            return { ok: false, error: 'SHEET_SCHEMA_INVALID' };
        }

        const { indexes, semanticIndexes, legacyCompatible } = resolveColumnIndexes(table.cols);
        const hasSemanticName = semanticIndexes.name >= 0;
        const hasSemanticCoordinates = semanticIndexes.coordinates >= 0;
        if (hasSemanticName && hasSemanticCoordinates) {
            return { ok: true, indexes, source: 'semantic' };
        }

        const legacyRowsCompatible = table.rows.every(row => Array.isArray(row?.c) && row.c.length >= 7);
        if (options.allowLegacy !== false && legacyCompatible && legacyRowsCompatible) {
            return { ok: true, indexes, source: 'legacy' };
        }

        return { ok: false, error: 'SHEET_SCHEMA_INVALID' };
    }

    function normalizePublishedLocations(payload, options = {}) {
        const table = payload?.table;
        const schema = validatePublishedLocationsSchema(table, options);
        if (!schema.ok) {
            return { locations: [], rejected: [{ row: 0, error: 'SHEET_SCHEMA_INVALID' }] };
        }

        const { indexes } = schema;
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
            const services = normalizeServices(getCellValue(row, indexes.services), typeRaw);
            locations.push({
                id: String(getCellValue(row, indexes.recordId) || sourceRow),
                unitCode: String(getCellValue(row, indexes.unitCode) || '').trim(),
                name,
                type: services.includes('POLICE_OFFICE') ? 'police_station' : (/CCCD|can cuoc|id[ _]center/i.test(normalizeLabel(typeRaw)) ? 'id_center' : 'police_station'),
                address: String(getCellValue(row, indexes.address) || '').trim(),
                phone: String(getCellValue(row, indexes.phone) || '').trim(),
                coordinates: String(getCellValue(row, indexes.coordinates) || '').trim(),
                imageUrl: String(getCellValue(row, indexes.imageUrl) || '').trim(),
                searchAliases: String(getCellValue(row, indexes.searchAliases) || '').trim(),
                updatedAt: String(getCellValue(row, indexes.updatedAt) || '').trim(),
                siteType: String(getCellValue(row, indexes.siteType) || '').trim(),
                services,
                googleMapsUrl: String(getCellValue(row, indexes.googleMapsUrl) || '').trim(),
                cccdServiceMode: String(getCellValue(row, indexes.cccdServiceMode) || '').trim(),
                serviceSchedule: String(getCellValue(row, indexes.serviceSchedule) || '').trim(),
                servedUnits: String(getCellValue(row, indexes.servedUnits) || '').trim(),
                status: String(getCellValue(row, indexes.status) || '').trim(),
                verifiedAt: String(getCellValue(row, indexes.verifiedAt) || '').trim(),
                lat: parsed.lat,
                lng: parsed.lng,
            });
        });

        return { locations, rejected };
    }

    return {
        PHU_THO_BOUNDS,
        normalizeLabel,
        normalizeServices,
        parseCoordinates,
        resolveColumnIndexes,
        validatePublishedLocationsSchema,
        normalizePublishedLocations,
    };
});
