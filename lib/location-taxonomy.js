(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.LocationTaxonomy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const SITE_TYPES = Object.freeze([
        Object.freeze({ code: 'HEADQUARTERS', label: 'Trụ sở Công an' }),
        Object.freeze({ code: 'PUBLIC_SERVICE_CENTER', label: 'Điểm tiếp nhận thủ tục hành chính' }),
        Object.freeze({ code: 'SECONDARY_OFFICE', label: 'Điểm làm việc / trụ sở phụ' }),
        Object.freeze({ code: 'MOBILE_POINT', label: 'Điểm tiếp nhận lưu động' }),
        Object.freeze({ code: 'OTHER', label: 'Khác' }),
    ]);

    const SERVICES = Object.freeze([
        Object.freeze({ code: 'IDENTITY', label: 'Căn cước & định danh điện tử' }),
        Object.freeze({ code: 'RESIDENCE', label: 'Cư trú' }),
        Object.freeze({ code: 'VEHICLE_REGISTRATION', label: 'Đăng ký xe' }),
        Object.freeze({ code: 'DRIVER_LICENSE', label: 'Giấy phép lái xe' }),
        Object.freeze({ code: 'IMMIGRATION', label: 'Xuất nhập cảnh' }),
        Object.freeze({ code: 'CRIMINAL_RECORD', label: 'Lý lịch tư pháp' }),
        Object.freeze({ code: 'FIRE_SAFETY', label: 'PCCC & CNCH' }),
        Object.freeze({ code: 'SECURITY_ORDER', label: 'ANTT, con dấu & ngành nghề có điều kiện' }),
        Object.freeze({ code: 'CITIZEN_RECEPTION', label: 'Tiếp công dân, khiếu nại, tố cáo' }),
        Object.freeze({ code: 'OTHER', label: 'Dịch vụ khác' }),
    ]);

    const REQUEST_TYPES = Object.freeze({
        CREATE: 'Thêm địa điểm mới',
        UPDATE: 'Cập nhật địa điểm đang có',
        STOP: 'Báo địa điểm ngừng hoạt động',
    });

    // These mappings only describe values already present in historical records. They never
    // infer a service for a record that has no confirmed service value.
    const LEGACY_SITE_TYPES = Object.freeze({ CITIZEN_ID_POINT: 'PUBLIC_SERVICE_CENTER' });
    const LEGACY_SERVICES = Object.freeze({
        CITIZEN_ID: 'IDENTITY',
        E_IDENTIFICATION: 'IDENTITY',
    });
    // Old catch-all operational labels do not identify one of the new service categories. Keep
    // them visible in historical data, but preselect the explicit `OTHER` choice if a staff member
    // opens the record for editing so a no-op update never loses service validation.
    const LEGACY_SERVICE_FALLBACKS = Object.freeze({
        POLICE_OFFICE: 'OTHER',
        DUTY: 'OTHER',
        CRIME_REPORT: 'OTHER',
    });
    const LEGACY_SERVICE_LABELS = Object.freeze({
        POLICE_OFFICE: 'Trụ sở Công an (dữ liệu cũ)',
        DUTY: 'Trực ban (dữ liệu cũ)',
        CRIME_REPORT: 'Tiếp nhận tin báo, tố giác tội phạm (dữ liệu cũ)',
    });

    const SITE_TYPE_BY_CODE = new Map(SITE_TYPES.map(item => [item.code, item]));
    const SERVICE_BY_CODE = new Map(SERVICES.map(item => [item.code, item]));
    const REQUEST_TYPE_BY_INPUT = new Map([
        ['CREATE', 'CREATE'], ['THÊM ĐỊA ĐIỂM MỚI', 'CREATE'],
        ['UPDATE', 'UPDATE'], ['CẬP NHẬT ĐỊA ĐIỂM ĐANG CÓ', 'UPDATE'], ['BÁO ĐỊA CHỈ HOẶC VỊ TRÍ SAI', 'UPDATE'],
        ['STOP', 'STOP'], ['BÁO ĐỊA ĐIỂM NGỪNG HOẠT ĐỘNG', 'STOP'],
    ]);

    function code(value) { return String(value || '').trim().toUpperCase(); }
    function requestKind(value) { return REQUEST_TYPE_BY_INPUT.get(String(value || '').trim().toUpperCase()) || ''; }
    function requestType(value) {
        const kind = requestKind(value);
        return kind ? REQUEST_TYPES[kind] : '';
    }
    function isWritableSiteType(value) { return SITE_TYPE_BY_CODE.has(code(value)); }
    function isAcceptedWriteSiteType(value) { return isReadableSiteType(value); }
    function isReadableSiteType(value) { return isWritableSiteType(value) || Object.prototype.hasOwnProperty.call(LEGACY_SITE_TYPES, code(value)); }
    function isWritableService(value) { return SERVICE_BY_CODE.has(code(value)); }
    function isAcceptedWriteService(value) { return isReadableService(value); }
    function isReadableService(value) { return isWritableService(value) || Object.prototype.hasOwnProperty.call(LEGACY_SERVICES, code(value)) || Object.prototype.hasOwnProperty.call(LEGACY_SERVICE_LABELS, code(value)); }
    function normalizeServices(value, { forWrite = false } = {}) {
        const input = Array.isArray(value) ? value : String(value || '').split(/[|,;]/);
        const result = [];
        for (const raw of input) {
            const rawCode = code(raw);
            if (!rawCode) continue;
            if (!isReadableService(rawCode) || (forWrite && !isAcceptedWriteService(rawCode))) return null;
            if (!result.includes(rawCode)) result.push(rawCode);
        }
        return result;
    }
    function toCanonicalServices(value) {
        const values = normalizeServices(value, { forWrite: false });
        return values ? Array.from(new Set(values.map(item => LEGACY_SERVICES[item] || LEGACY_SERVICE_FALLBACKS[item] || item))) : null;
    }
    function displaySiteType(value) {
        const raw = code(value);
        const mapped = LEGACY_SITE_TYPES[raw] || raw;
        return SITE_TYPE_BY_CODE.get(mapped)?.label || (raw === 'CITIZEN_ID_POINT' ? 'Điểm cấp căn cước (dữ liệu cũ)' : raw);
    }
    function displayService(value) {
        const raw = code(value);
        const mapped = LEGACY_SERVICES[raw] || raw;
        return SERVICE_BY_CODE.get(mapped)?.label || LEGACY_SERVICE_LABELS[raw] || raw;
    }
    function generateDisplayName(siteType, unitName) {
        const unit = String(unitName || '').trim();
        if (!unit) return '';
        switch (code(siteType)) {
        case 'HEADQUARTERS': return unit;
        case 'PUBLIC_SERVICE_CENTER': return `Điểm tiếp nhận thủ tục hành chính – ${unit}`;
        case 'MOBILE_POINT': return `Điểm tiếp nhận lưu động – ${unit}`;
        default: return unit;
        }
    }
    function sanitizeDisplayNameOverride(value) {
        const text = String(value || '').trim().replace(/\s+/g, ' ');
        if (!text || text.length > 200 || /^[=+\-@]/.test(text)) return '';
        return text;
    }
    function locationName({ siteType, unitName, override, existingName } = {}) {
        return sanitizeDisplayNameOverride(override) || String(existingName || '').trim() || generateDisplayName(siteType, unitName);
    }
    function formDefinition() {
        return Object.freeze({
            requestTypes: REQUEST_TYPES,
            siteTypes: SITE_TYPES,
            services: SERVICES,
            fields: Object.freeze(['unitCode', 'requestType', 'targetRecordId', 'siteType', 'services', 'locationName', 'address', 'mapsUrl', 'publicPhone', 'serviceSchedule', 'servedUnits', 'image', 'reviewNote']),
        });
    }

    return Object.freeze({ SITE_TYPES, SERVICES, REQUEST_TYPES, LEGACY_SITE_TYPES, LEGACY_SERVICES, LEGACY_SERVICE_FALLBACKS, LEGACY_SERVICE_LABELS, requestKind, requestType, isWritableSiteType, isAcceptedWriteSiteType, isReadableSiteType, isWritableService, isAcceptedWriteService, isReadableService, normalizeServices, toCanonicalServices, displaySiteType, displayService, generateDisplayName, sanitizeDisplayNameOverride, locationName, formDefinition });
});
