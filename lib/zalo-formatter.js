'use strict';

// =====================================================================
// ZALO RESPONSE FORMATTER — biến kết quả runChatCore thành 1-3 tin nhắn Zalo an toàn.
//
// KHÔNG dựng lại nội dung nghiệp vụ (hồ sơ/trình tự/lệ phí đã có sẵn trong fullText do
// system prompt website quyết định cấu trúc) — formatter chỉ: bỏ markdown Zalo không hỗ
// trợ, cắt an toàn theo giới hạn ký tự (không cắt giữa mặt Unicode, ưu tiên cắt theo
// đoạn/câu), thêm khối địa điểm/nguồn ngắn gọn, và giới hạn tối đa 3 tin nhắn/câu trả lời.
//
// Giới hạn ký tự tin nhắn Zalo Bot chưa xác minh được bằng tài liệu chính thức trong môi
// trường build này (egress tới docs.zaloplatforms.com bị chặn — xem docs/zalo-bot.md).
// Dùng giả định ~2000 ký tự nêu trong yêu cầu nhiệm vụ, trừ biên an toàn xuống 1800.
// =====================================================================

const ZALO_MESSAGE_SAFETY_LIMIT = (() => {
    const value = parseInt(process.env.ZALO_MESSAGE_SAFETY_LIMIT, 10);
    return Number.isFinite(value) && value > 200 ? value : 1800;
})();
const MAX_MESSAGES_PER_ANSWER = 3;
const MAX_LOCATIONS_SHOWN = 3;
const MAX_SOURCES_SHOWN = 3;

function isHighSurrogate(code) {
    return code >= 0xd800 && code <= 0xdbff;
}

// Điểm cắt cứng cuối cùng: không bao giờ tách đôi một surrogate pair (emoji, ký tự hiếm).
function hardBreakIndex(str, limit) {
    if (str.length <= limit) return str.length;
    let idx = limit;
    if (idx > 0 && isHighSurrogate(str.charCodeAt(idx - 1))) idx -= 1;
    return idx;
}

// Tìm điểm cắt "đẹp" gần điểm cắt cứng nhất: đoạn (\n\n) > câu (. ! ?) > dòng (\n) > khoảng
// trắng > cắt cứng. Chỉ tìm trong một cửa sổ gần cuối để không lùi về tận đầu văn bản dài.
function findBreakPoint(str, limit) {
    const hardLimit = hardBreakIndex(str, limit);
    if (hardLimit >= str.length) return hardLimit;
    const windowStart = Math.max(0, hardLimit - 400);
    const window = str.slice(0, hardLimit);

    const paragraphAt = window.lastIndexOf('\n\n');
    if (paragraphAt > windowStart) return paragraphAt + 2;

    let bestSentenceEnd = -1;
    for (const ending of ['. ', '! ', '? ', '.\n', '!\n', '?\n']) {
        const at = window.lastIndexOf(ending);
        if (at > bestSentenceEnd) bestSentenceEnd = at + ending.length;
    }
    if (bestSentenceEnd > windowStart) return bestSentenceEnd;

    const lineAt = window.lastIndexOf('\n');
    if (lineAt > windowStart) return lineAt + 1;

    const spaceAt = window.lastIndexOf(' ');
    if (spaceAt > windowStart) return spaceAt + 1;

    return hardLimit;
}

// Cắt `text` thành nhiều đoạn <= limit ký tự mỗi đoạn, Unicode-safe, ưu tiên ranh giới tự nhiên.
function splitIntoSafeChunks(text, limit = ZALO_MESSAGE_SAFETY_LIMIT) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return [];
    if (trimmed.length <= limit) return [trimmed];

    const chunks = [];
    let remaining = trimmed;
    while (remaining.length > limit) {
        let cut = findBreakPoint(remaining, limit);
        if (cut <= 0) cut = hardBreakIndex(remaining, limit) || limit;
        const piece = remaining.slice(0, cut).trim();
        if (piece) chunks.push(piece);
        const next = remaining.slice(cut).trim();
        if (next === remaining) break; // an toàn chống vòng lặp vô hạn
        remaining = next;
    }
    if (remaining) chunks.push(remaining);
    return chunks;
}

// Zalo hiển thị text thuần — bỏ markup markdown thường gặp trong câu trả lời web
// (heading "#", bold "**"/"__") để không lộ ký tự thô cho người dùng cuối. Giữ nguyên
// gạch đầu dòng "- "/"•" vì hiển thị được bình thường dạng text thuần.
function stripUnsupportedMarkdown(text) {
    return String(text || '')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/__(.+?)__/g, '$1');
}

function buildLocationBlock(verifiedLocations = []) {
    if (!Array.isArray(verifiedLocations) || verifiedLocations.length === 0) return '';
    const shown = verifiedLocations.slice(0, MAX_LOCATIONS_SHOWN);
    const lines = shown.map(loc => {
        const parts = [`📍 ${loc.name || ''}`.trim()];
        if (loc.address) parts.push(`Địa chỉ: ${loc.address}`);
        if (loc.mapsUrl) parts.push(`Google Maps: ${loc.mapsUrl}`);
        return parts.join('\n');
    });
    const suffix = verifiedLocations.length > MAX_LOCATIONS_SHOWN
        ? `\n(còn ${verifiedLocations.length - MAX_LOCATIONS_SHOWN} địa điểm khác, xem đầy đủ tại ${getAppUrl()})`
        : '';
    return lines.join('\n\n') + suffix;
}

// Nguồn ngắn gọn — chỉ tên văn bản/thủ tục + URL công khai đã được allowlist ở
// buildCitationSource/getAllowedCitationUrl (api/chat.js). Không có score/procedure_id/
// kb_version/metadata nội bộ nào được đưa vào đây.
function buildSourceBlock(sources = []) {
    if (!Array.isArray(sources) || sources.length === 0) return '';
    const seen = new Set();
    const lines = [];
    for (const source of sources) {
        const label = String(source?.title || source?.file || '').trim();
        if (!label || seen.has(label)) continue;
        seen.add(label);
        const url = source?.url ? ` (${source.url})` : '';
        lines.push(`• ${label}${url}`);
        if (lines.length >= MAX_SOURCES_SHOWN) break;
    }
    if (!lines.length) return '';
    return `Nguồn:\n${lines.join('\n')}`;
}

function getAppUrl() {
    return process.env.PUBLIC_APP_URL || 'https://bandocapt.io.vn';
}

// Trả về mảng string — mỗi phần tử là MỘT tin nhắn Zalo, luôn <= MAX_MESSAGES_PER_ANSWER
// phần tử. Nếu nội dung dài hơn cả 3 tin, phần còn lại được thay bằng lời mời xem tiếp
// trên web thay vì spam thêm tin nhắn.
function formatZaloReply({ fullText, sources, verifiedLocations } = {}) {
    const mainText = stripUnsupportedMarkdown(fullText);
    const locationBlock = buildLocationBlock(verifiedLocations);
    const sourceBlock = buildSourceBlock(sources);
    const composed = [mainText, locationBlock, sourceBlock].filter(Boolean).join('\n\n').trim();

    if (!composed) return [];

    const chunks = splitIntoSafeChunks(composed, ZALO_MESSAGE_SAFETY_LIMIT);
    if (chunks.length <= MAX_MESSAGES_PER_ANSWER) return chunks;

    const kept = chunks.slice(0, MAX_MESSAGES_PER_ANSWER - 1);
    const remainderNotice = `Câu trả lời còn tiếp, mời bạn xem đầy đủ tại ${getAppUrl()}`;
    kept.push(remainderNotice);
    return kept;
}

function getFallbackReply() {
    return `Hệ thống tra cứu đang tạm thời bận.\nBạn có thể tiếp tục tra cứu tại:\n${getAppUrl()}`;
}

module.exports = {
    ZALO_MESSAGE_SAFETY_LIMIT,
    MAX_MESSAGES_PER_ANSWER,
    splitIntoSafeChunks,
    stripUnsupportedMarkdown,
    buildLocationBlock,
    buildSourceBlock,
    formatZaloReply,
    getFallbackReply,
    getAppUrl,
};
