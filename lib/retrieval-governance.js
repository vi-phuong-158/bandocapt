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

// Chỉ thủ tục (tthc) mới cần cổng approved/current_procedure/hiệu lực — đây là lớp
// mang facts vận hành (phí, thời hạn, biểu mẫu) nên mới có rủi ro giấy/NA17/hết hiệu
// lực mà Giai đoạn 3 xử lý. Luật (law) và hướng dẫn (guide) là căn cứ pháp lý/tài liệu
// bổ trợ, không thuộc phạm vi governance này (xem docs/brain/03-decisions.md).
function requiresProcedureGovernance(metadata = {}) {
    return metadata.source_type === 'tthc';
}

// null  = không có mốc (N/A hoặc rỗng) → không ràng buộc.
// NaN   = có giá trị nhưng không parse được → fail-closed ở isWithinValidity.
// Date  = mốc hợp lệ.
function parseDate(value) {
    const text = String(value || '').trim();
    if (!text || /^n\/?a$/i.test(text)) return null;
    const date = new Date(`${text.slice(0, 10)}T00:00:00+07:00`);
    return Number.isNaN(date.getTime()) ? NaN : date;
}

function isWithinValidity(metadata = {}, now = new Date()) {
    const from = parseDate(metadata.valid_from);
    const to = parseDate(metadata.valid_to);
    // Mốc hiệu lực có nhưng hỏng định dạng → coi như ngoài hiệu lực (fail-closed),
    // đúng mục tiêu governance là chặn nguồn không xác minh được hiệu lực.
    if (Number.isNaN(from) || Number.isNaN(to)) return false;
    if (from && now < from) return false;
    if (to && now > new Date(to.getTime() + 86400000 - 1)) return false;
    return true;
}

function filterGovernedMatches(matches = [], query = '', now = new Date()) {
    const cap = requestedCap(query);
    return (matches || []).filter(match => {
        const metadata = match?.metadata || {};
        if (!requiresProcedureGovernance(metadata)) return true;
        return isApprovedCurrent(metadata) && isWithinValidity(metadata, now) && (!cap || normalizeCap(metadata.cap_normalized || metadata.cap) === cap);
    });
}

function buildGovernanceFilter(categoryClauses = [], cap = '') {
    const procedureClauses = [
        { review_status: { '$eq': 'approved' } },
        { source_priority: { '$eq': 'current_procedure' } }
    ];
    if (cap) procedureClauses.push({ cap_normalized: { '$eq': cap } });
    // Bypass cổng approved/current cho record không phải tthc (luật/hướng dẫn); record
    // thiếu hẳn source_type cũng bypass (mặc định an toàn = giữ hành vi hiện tại).
    const clauses = [
        { '$or': [
            { source_type: { '$ne': 'tthc' } },
            { '$and': procedureClauses }
        ] }
    ];
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

module.exports = { normalizeCap, requestedCap, isApprovedCurrent, requiresProcedureGovernance, isWithinValidity, filterGovernedMatches, buildGovernanceFilter, findCurrentSourceConflict };
