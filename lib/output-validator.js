'use strict';

const PHONE_PATTERN = /(?<!\d)(?:\+?84|0)(?:[ .-]?\d){8,10}(?!\d)/g;
const MAPS_URL_PATTERN = /https?:\/\/(?:www\.)?(?:google\.[a-z.]+\/maps|maps\.google\.[a-z.]+)\/[^\s)\]>]+/gi;
const COORD_PATTERN = /(?<![\d.])(-?\d{1,2}\.\d{4,}),\s*(-?\d{1,3}\.\d{4,})(?![\d.])/g;
// P0.5-fix: \w chỉ hiểu ASCII nên KHÔNG coi chữ cái có dấu tiếng Việt là word-char. Điều này an
// toàn cho tiếng Trung (số dính liền chữ Hán không cách — vd "费用25美元" — vẫn cần match được), nhưng
// làm "đ" (ký hiệu viết tắt "đồng") đứng ngay trước 1 chữ cái tiếng Việt khác (vd "để", "được") bị
// hiểu nhầm là ranh giới hợp lệ → redact oan (vd "gọi 113 để" → cắt cụt thành "113 (...)ể"). Chỉ
// chặn riêng trường hợp "đ" đứng lẻ bị dính liền chữ cái Latin/Việt phía sau, giữ nguyên biên \w
// gốc cho mọi trường hợp khác (đồng/USD/VND/Trung/Hàn) để không phá vỡ phát hiện tiếng Trung.
const MONEY_UNIT_GROUP = 'USD|US\\$|VND|VNĐ|đồng|đ(?![a-zA-ZÀ-ỹ])|美元|元|원';
const MONEY_PATTERN = new RegExp(`(?<!\\w)\\d+(?:[.,]\\d+)*(?:\\s?(?:${MONEY_UNIT_GROUP}))(?!\\w)`, 'giu');
// tiếng Việt hay viết khoảng tiền kiểu "3.000.000 đến 5.000.000 đồng" — đơn vị chỉ xuất hiện 1 lần
// ở cuối. MONEY_PATTERN đơn lẻ chỉ bắt được số thứ 2 (có đơn vị đi kèm), để lọt số đầu (vd
// "3.000.000" không có gì theo sau ngay). Bắt cả cụm để chấm đối chiếu và redact toàn bộ.
const MONEY_RANGE_PATTERN = new RegExp(`(?<!\\w)\\d+(?:[.,]\\d+)*\\s*(?:đến|den|tới|toi|~|-)\\s*\\d+(?:[.,]\\d+)*(?:\\s?(?:${MONEY_UNIT_GROUP}))(?!\\w)`, 'giu');
const FORM_PATTERN = /\b(?:NA\d+[a-z]?|TK\d+[a-z]?|M\d+[a-z]?)\b/gi;
const LEGAL_REFERENCE_PATTERN = /\b(?:Thông tư|Nghị định|Luật(?:\s+số)?)\s+(?:số\s+)?\d+[a-z]?(?:\/\d{4})?(?:\/[A-ZĐ0-9-]+)+/giu;
const LEGAL_REFERENCE_CORE_PATTERN = /\d+\/\d{4}/g;
const DURATION_PATTERN = /\b\d+\s*(?:giờ|hours?|小时|시간|ngày làm việc|working days?|工作日|영업일)\b/giu;
// P0.5-fix: chặn thông số vật lý bịa (kích thước ảnh, dung lượng file...) — loại claim gây
// hallucination EV07 (vd "4×6cm, JPEG, ≤2MB") mà các pattern khác không phủ tới.
const MEASUREMENT_PATTERN = /\b\d+(?:[.,]\d+)?(?:\s*[x×]\s*\d+(?:[.,]\d+)?)?\s*(?:cm\b|mm\b|px\b|MB\b|KB\b|GB\b|厘米|毫米|公分)/giu;

const PLACEHOLDERS = {
    phone: '(số điện thoại chưa được xác minh — vui lòng liên hệ trực tiếp cơ quan)',
    money: '(mức phí chưa xác minh trong dữ liệu — vui lòng liên hệ cơ quan)',
    form: '(mẫu đơn chưa xác minh)',
    legal_reference: '(căn cứ chưa xác minh trong dữ liệu)',
    duration: '(thời hạn chưa xác minh trong dữ liệu)',
    measurement: '(thông số chưa xác minh trong dữ liệu)',
};

function normalizeText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .normalize('NFKC')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizePhone(value) {
    const digits = String(value || '').replace(/\D/g, '');
    return digits.startsWith('84') ? `0${digits.slice(2)}` : digits;
}

function normalizeUrl(value) {
    try {
        const url = new URL(String(value || ''));
        url.hash = '';
        return url.toString().replace(/\/$/, '');
    } catch (_) {
        return String(value || '').trim().replace(/\/$/, '');
    }
}

function normalizeCoord(value) {
    const match = String(value || '').match(/(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
    if (!match) return '';
    return `${Number(match[1]).toFixed(6)},${Number(match[2]).toFixed(6)}`;
}

function validateAnswer(text, allowed = {}) {
    let sanitizedText = String(text || '');
    const violations = [];
    const phones = new Set(Array.from(allowed.phones || [], normalizePhone));
    const mapsUrls = new Set(Array.from(allowed.mapsUrls || [], normalizeUrl));
    const coords = new Set(Array.from(allowed.coords || [], normalizeCoord));
    const legalCorpus = normalizeText([
        allowed.legalCorpus || '',
        ...(allowed.allowedConstants || []),
    ].join('\n'));
    const legalReferenceCores = new Set(legalCorpus.match(LEGAL_REFERENCE_CORE_PATTERN) || []);

    const redact = (pattern, type, isAllowed, replacement) => {
        sanitizedText = sanitizedText.replace(pattern, value => {
            if (isAllowed(value)) return value;
            violations.push({ tier: type === 'phone' || type === 'maps_url' || type === 'coords' ? 1 : 2, type, value, action: 'redact' });
            return replacement;
        });
    };

    redact(MAPS_URL_PATTERN, 'maps_url', value => mapsUrls.has(normalizeUrl(value)), '');
    sanitizedText = sanitizedText.replace(COORD_PATTERN, (value, lat, lng) => {
        if (coords.has(normalizeCoord(`${lat},${lng}`))) return value;
        violations.push({ tier: 1, type: 'coords', value, action: 'redact' });
        return '';
    });
    redact(PHONE_PATTERN, 'phone', value => phones.has(normalizePhone(value)), PLACEHOLDERS.phone);
    // Xử lý khoảng tiền trước để bảo vệ cả 2 đầu số, tránh lọt số không có đơn vị đi kèm ngay sau nó.
    redact(MONEY_RANGE_PATTERN, 'money', value => legalCorpus.includes(normalizeText(value)), PLACEHOLDERS.money);
    redact(MONEY_PATTERN, 'money', value => legalCorpus.includes(normalizeText(value)), PLACEHOLDERS.money);
    redact(FORM_PATTERN, 'form', value => legalCorpus.includes(normalizeText(value)), PLACEHOLDERS.form);
    redact(LEGAL_REFERENCE_PATTERN, 'legal_reference', value => {
        const core = normalizeText(value).match(LEGAL_REFERENCE_CORE_PATTERN)?.[0];
        return Boolean(core && legalReferenceCores.has(core));
    }, PLACEHOLDERS.legal_reference);
    redact(DURATION_PATTERN, 'duration', value => legalCorpus.includes(normalizeText(value)), PLACEHOLDERS.duration);
    redact(MEASUREMENT_PATTERN, 'measurement', value => legalCorpus.includes(normalizeText(value)), PLACEHOLDERS.measurement);

    return { sanitizedText, violations };
}

module.exports = {
    normalizePhone,
    normalizeUrl,
    normalizeCoord,
    validateAnswer,
};
