'use strict';

function normalizeCap(value) {
    const text = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
    if (/(^|\s|_)xa($|\s|_)/.test(text) || text.includes('cap xa')) return 'xa';
    if (/(^|\s|_)tinh($|\s|_)/.test(text) || text.includes('cap tinh')) return 'tinh';
    return '';
}

function requestedCap(query) {
    // Chỉ nhận diện khi câu hỏi nêu RÕ cấp thẩm quyền ("cấp xã", "công an xã", ...).
    // Không suy ra từ token "xã"/"tỉnh" trần vì chúng trùng tên địa danh trong hầu hết
    // câu hỏi có địa chỉ (vd "xã Hy Cương") và sẽ lọc oan thủ tục cấp còn lại.
    const text = String(query || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
    if (/cap xa\b|cong an xa\b/.test(text)) return 'xa';
    if (/cap tinh\b|cong an tinh\b/.test(text)) return 'tinh';
    return '';
}

function isApprovedCurrent(metadata = {}) {
    return metadata.review_status === 'approved' && metadata.source_priority === 'current_procedure';
}

function parseDate(value) {
    const text = String(value || '').trim();
    if (!text || /^n\/?a$/i.test(text)) return null;
    const date = new Date(`${text.slice(0, 10)}T00:00:00+07:00`);
    return Number.isNaN(date.getTime()) ? null : date;
}

function isWithinValidity(metadata = {}, now = new Date()) {
    const from = parseDate(metadata.valid_from);
    const to = parseDate(metadata.valid_to);
    if (from && now < from) return false;
    if (to && now > new Date(to.getTime() + 86400000 - 1)) return false;
    return true;
}

function filterGovernedMatches(matches = [], query = '', now = new Date()) {
    const cap = requestedCap(query);
    return (matches || []).filter(match => {
        const metadata = match?.metadata || {};
        return isApprovedCurrent(metadata) && isWithinValidity(metadata, now) && (!cap || normalizeCap(metadata.cap_normalized || metadata.cap) === cap);
    });
}

function buildGovernanceFilter(categoryClauses = [], cap = '') {
    const clauses = [
        { review_status: { '$eq': 'approved' } },
        { source_priority: { '$eq': 'current_procedure' } }
    ];
    if (cap) clauses.push({ cap_normalized: { '$eq': cap } });
    if (categoryClauses.length) clauses.push({ '$or': categoryClauses });
    return { '$and': clauses };
}

function findCurrentSourceConflict(matches = []) {
    const groups = new Map();
    for (const match of matches || []) {
        const metadata = match?.metadata || {};
        const key = String(metadata.canonical_procedure_key || '').trim();
        if (!key || !isApprovedCurrent(metadata)) continue;
        const group = groups.get(key) || [];
        group.push(match);
        groups.set(key, group);
    }
    for (const [key, group] of groups) {
        if (group.length < 2) continue;
        for (const field of ['authority', 'thoi_han', 'le_phi', 'phi', 'mau_don']) {
            const values = new Set(group.map(match => String(match.metadata?.[field] || '').trim()).filter(value => value && !/^n\/?a$/i.test(value)));
            if (values.size > 1) return { key, field, ids: group.map(match => match.id) };
        }
    }
    return null;
}

module.exports = { normalizeCap, requestedCap, isApprovedCurrent, isWithinValidity, filterGovernedMatches, buildGovernanceFilter, findCurrentSourceConflict };
