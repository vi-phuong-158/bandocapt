'use strict';

const { normalizeLabel } = require('../js/location-data');
const {
    findVerifiedLocationMatches,
    getPublishedLocations,
    isLocationLookupRequested,
} = require('./published-locations');

// Custom production domain (không phải *.vercel.app) — xác minh trực tiếp 2026-09-26:
// bandocapt.io.vn HTTP 308 -> https://www.bandocapt.io.vn/ (HTTP 200, đúng Content-Security-Policy
// production trong vercel.json). Xem docs/brain/03-decisions.md mục "Zalo Bot V1 canonical domain".
const CANONICAL_MAP_URL = 'https://www.bandocapt.io.vn/';
const MAX_AMBIGUOUS_OPTIONS = 5;

// Mỗi ví dụ trong HELP phải thật sự đi đúng nhánh khi người dùng gõ lại nguyên văn — ví dụ
// địa điểm -> tra cứu tất định, ví dụ thủ tục -> shared RAG (khoá bằng test/zalo-bot-v1.test.js).
const GREETING_TEXT = 'Xin chào! Tôi là trợ lý Bản đồ Công an Phú Thọ.\n\nBạn có thể hỏi địa chỉ trụ sở Công an xã/phường hoặc hỏi về thủ tục hành chính. Nhập "trợ giúp" để xem ví dụ.';
const HELP_EXAMPLES = Object.freeze({
    location: 'Công an phường Thanh Miếu ở đâu?',
    procedure: 'Làm hộ chiếu cần giấy tờ gì?',
    foreigner: 'Người nước ngoài khai báo tạm trú thế nào?',
});
const HELP_TEXT = [
    'Bạn có thể hỏi tôi, ví dụ:',
    '',
    `🔎 Tìm trụ sở Công an: "${HELP_EXAMPLES.location}"`,
    `📋 Thủ tục hành chính: "${HELP_EXAMPLES.procedure}"`,
    `🌍 Người nước ngoài: "${HELP_EXAMPLES.foreigner}"`,
    '🗺️ Mở bản đồ: nhập "bản đồ"',
].join('\n');
const NON_TEXT_MESSAGE_TEXT = 'Hiện tôi chỉ hỗ trợ tin nhắn văn bản.\n\nBạn vui lòng nhập nội dung cần hỏi, ví dụ tên xã/phường hoặc câu hỏi về thủ tục hành chính.';
const RATE_LIMITED_TEXT = 'Bạn đã gửi quá nhiều câu hỏi trong hôm nay. Vui lòng thử lại vào ngày mai hoặc tra cứu trực tiếp trên Bản đồ Công an Phú Thọ: ' + CANONICAL_MAP_URL;

function normalizeZaloMessage(message) {
    return normalizeLabel(message).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Chỉ còn phân loại 3 intent có câu trả lời TĨNH, không phụ thuộc dữ liệu hay ngữ nghĩa câu
// (GREETING/HELP/MAP). Location và mọi câu còn lại KHÔNG được quyết định bằng regex Zalo-riêng
// ở đây nữa — xem createZaloReply(): location dùng CHUNG lib/published-locations.js
// (isLocationLookupRequested/findVerifiedLocationMatches, đúng logic website đã dùng và đã được
// kiểm chứng qua regression), phần còn lại giao cho shared RAG (runChatOrchestration ở
// api/chat.js). Một regex Zalo-riêng ("bắt đầu bằng xã/phường/công an") đã bỏ sót câu tự nhiên
// như "Công an phường Phú Thọ ở đâu" và tên xã/phường gõ trần không có tiền tố ("Hy Cương").
function resolveZaloIntent(message) {
    const normalized = normalizeZaloMessage(message);
    if (/^(xin chao|chao|hello|hi)(?: bot)?$/.test(normalized)) return { intent: 'GREETING' };
    if (/^(tro giup|huong dan|help)$/.test(normalized)) return { intent: 'HELP' };
    if (/^(ban do|mo ban do|ban do cong an|website)$/.test(normalized)) return { intent: 'MAP' };
    return { intent: 'OTHER' };
}

function formatCandidateList(records) {
    return records
        .slice(0, MAX_AMBIGUOUS_OPTIONS)
        .map((record, index) => `${index + 1}. ${record.name}`)
        .join('\n');
}

function buildLocationReply(result, mapUrl = CANONICAL_MAP_URL) {
    if (result.status === 'ambiguous_match') {
        // Nhiều đơn vị THẬT khác nhau cùng khớp — liệt kê tối đa 5 tên để người dùng tự chọn,
        // không tự chọn thay và không lộ dữ liệu nội bộ (chỉ tên, không địa chỉ/SĐT/toạ độ).
        return {
            intent: 'LOCATION_LOOKUP',
            result: 'AMBIGUOUS',
            text: `Tôi tìm thấy nhiều kết quả phù hợp:\n\n${formatCandidateList(result.matches)}\n\nBạn hãy nhập tên đầy đủ (kèm "xã" hoặc "phường") để mình tìm đúng đơn vị.`,
        };
    }
    if (result.status === 'ambiguous_conflict') {
        // Trùng TÊN nhưng dữ liệu nguồn mâu thuẫn (lỗi nhập liệu ở sheet, không phải nhiều đơn vị
        // thật) — liệt kê những dòng cùng tên hệt nhau không giúp người dùng chọn được gì, nên
        // giữ câu trả lời tổng quát thay vì một danh sách trùng lặp gây khó hiểu.
        return {
            intent: 'LOCATION_LOOKUP',
            result: 'AMBIGUOUS',
            text: 'Tôi tìm thấy nhiều kết quả phù hợp.\n\nVui lòng nhập đầy đủ tên xã/phường.',
        };
    }
    if (result.status !== 'matched' || !result.matches?.[0]) {
        return {
            intent: 'LOCATION_LOOKUP',
            result: 'NOT_FOUND',
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

// Sentinel: tin nhắn không phải GREETING/HELP/MAP và cũng không phải yêu cầu tra cứu địa điểm
// tất định. `text: null` bắt buộc api/chat.js phải tự thay thế giá trị này trước khi gửi —
// không có đường nào vô tình gửi "null" ra Zalo. api/chat.js dùng sentinel này để chuyển
// NGUYÊN VĂN tin nhắn sang runChatOrchestration (shared RAG) thay vì tự bịa câu trả lời tĩnh
// (OD-01/P0-4) — module này không gọi AI, không biết gì về RAG/orchestration.
const RAG_FALLBACK = Object.freeze({ intent: 'OTHER', result: 'RAG_REQUIRED', text: null });

async function createZaloReply(message, options = {}) {
    const resolved = resolveZaloIntent(message);
    if (resolved.intent === 'GREETING') {
        return { intent: resolved.intent, result: 'REPLIED', text: GREETING_TEXT };
    }
    if (resolved.intent === 'HELP') {
        return { intent: resolved.intent, result: 'REPLIED', text: HELP_TEXT };
    }
    if (resolved.intent === 'MAP') {
        return { intent: resolved.intent, result: 'REPLIED', text: `Bản đồ Công an Phú Thọ: ${CANONICAL_MAP_URL}` };
    }

    // Cổng địa điểm DÙNG CHUNG với website (buildRequestPlan qua isLocationLookupRequested):
    // nhận đúng câu tự nhiên ("Công an phường Phú Thọ ở đâu", tên xã trần "Hy Cương") và loại
    // đúng câu thủ tục hành chính không mang địa điểm ("làm hộ chiếu thế nào" -> needsProcedure
    // -> locationTask='none'), không cần một heuristic Zalo-riêng thứ hai.
    const checkLookupRequested = options.isLocationLookupRequested || isLocationLookupRequested;
    if (checkLookupRequested(message, [])) {
        const getLocations = options.getPublishedLocations || getPublishedLocations;
        const findMatches = options.findVerifiedLocationMatches || findVerifiedLocationMatches;
        const dataset = await getLocations(options.locationOptions || {});
        const lookup = findMatches(message, [], dataset);
        if (
            lookup.status === 'matched' ||
            lookup.status === 'ambiguous_match' ||
            lookup.status === 'ambiguous_conflict' ||
            lookup.status === 'no_match'
        ) {
            return buildLocationReply(lookup);
        }
        // status === 'missing_location_evidence': câu hỏi có hình dạng liên quan tới trụ sở/thẩm
        // quyền nhưng KHÔNG nêu xã/phường cụ thể (vd "công an ở đâu"). V1 không giữ hội thoại
        // nhiều lượt nên không thể tự hỏi lại bằng một câu tất định đúng ngữ cảnh — rơi xuống
        // RAG_FALLBACK bên dưới, dùng đúng luồng "hỏi lại xã/phường, không bịa địa chỉ" mà
        // website đã có sẵn qua formatVerifiedLocationsPrompt + output-validator.
    }

    return RAG_FALLBACK;
}

module.exports = {
    CANONICAL_MAP_URL,
    HELP_EXAMPLES,
    NON_TEXT_MESSAGE_TEXT,
    RATE_LIMITED_TEXT,
    RAG_FALLBACK,
    normalizeZaloMessage,
    resolveZaloIntent,
    buildLocationReply,
    createZaloReply,
};
