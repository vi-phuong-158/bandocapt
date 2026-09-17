'use strict';

const { normalizeLabel } = require('../js/location-data');

const PROCEDURE_TERMS = /\b(?:thủ tục|thu tuc|hồ sơ|ho so|lệ phí|le phi|thời hạn|thoi han|quy định|quy dinh|quy trình|quy trinh|giấy tờ|giay to|căn cứ|can cu|điều chỉnh|dieu chinh|đăng ký|dang ky|khai báo|khai bao|cấp|cap|mất|mat|làm|lam|thẻ|the|cư trú|cu tru|căn cước|can cuoc|cccd|hộ chiếu|ho chieu|visa|thị thực|thi thuc)\b/i;
const LEGAL_TERMS = /\b(?:nghị định|nghi dinh|luật|luat|thông tư|thong tu|quyết định|quyet dinh|văn bản|van ban|quy định|quy dinh|áp dụng|ap dung|sửa đổi|sua doi|hiệu lực|hieu luc|khác trước|khac truoc|từ ngày|tu ngay)\b/i;
const AUTHORITY_TERMS = /\b(?:cơ quan nào|co quan nao|cơ quan giải quyết|co quan giai quyet|cấp nào|cap nao|thẩm quyền|tham quyen|nơi nộp|noi nop|nộp ở đâu theo thẩm quyền|nop o dau theo tham quyen|công an cấp xã|cong an cap xa|công an xã nơi thường trú|cong an xa noi thuong tru|ngoài địa bàn|ngoai dia ban|nơi thường trú|noi thuong tru)\b/i;
const PHYSICAL_LOCATION_TERMS = /\b(?:địa chỉ|dia chi|số điện thoại|so dien thoai|điện thoại|dien thoai|tọa độ|toa do|google maps|chỉ đường|chi duong|trụ sở|tru so|địa điểm|dia diem|điểm cấp căn cước|diem cap can cuoc|đến trụ sở|den tru so|đến đâu|den dau|ở đâu|o dau|where|address|phone number|directions|maps)\b/i;
const STATION_SELECTION_PATTERN = /\b(?:trụ sở|tru so|địa chỉ|dia chi|số điện thoại|so dien thoai|google maps|chỉ đường|chi duong)\b.*\b(?:công an|cong an|police|station)\b|\b(?:công an|cong an)\b.*\b(?:ở đâu|o dau|địa chỉ|dia chi|số điện thoại|so dien thoai|google maps|chỉ đường|chi duong)\b/i;
const STATION_NAME_PATTERN = /\b(?:công an|cong an)\s+(?:xã|xa|phường|phuong|thị trấn|thi tran|thị xã|thi xa)\s+(?!nào\b|nao\b|nơi\b|noi\b|được\b|duoc\b|có\b|co\b|là\b|la\b|theo\b|trong\b)[a-z0-9à-ỹ][a-z0-9à-ỹ -]{1,50}/i;
const STATION_CHOICE_PATTERN = /\b(?:tại|tai|đến|den|nộp|nop)\b[^.!?\n]{0,80}\b(?:công an|cong an|trụ sở|tru so|đơn vị|don vi)\s+(?:nào|nao)\b/i;
const PLACE_PATTERN = /\b(?:xã|xa|phường|phuong|thị trấn|thi tran|thị xã|thi xa)\s+[a-z0-9à-ỹ][a-z0-9à-ỹ -]{1,50}/i;
const PLACE_STOP_WORDS = new Set(['nào', 'nao', 'nơi', 'noi', 'trong', 'cấp', 'cap', 'hay', 'được', 'duoc', 'có', 'co', 'là', 'la', 'theo', 'và', 'va', 'muốn', 'muon', 'thì', 'thi', 'đến', 'den', 'làm', 'lam', 'ở', 'o', 'bao', 'nhiêu', 'nhieu']);
const RESIDENCE_PATTERN = /\b(?:tôi|toi|em|mình|minh|chúng tôi|chung toi)\s+(?:đang\s+)?(?:ở|o)\s+(?!(?:đâu|dau)\b)|\b(?:cư trú|cu tru|tạm trú|tam tru|thường trú|thuong tru)\s+(?:tại|tai)\s+/i;
const FOLLOWUP_QUESTION_PATTERN = /(?:bạn|ban)\s+(?:(?:đang|dang)\s+)?(?:ở|o)\s+(?:xã\/phường|xa\/phuong|xã|xa|phường|phuong)|(?:cho|cho biet|biết|biet)\s+(?:mình|minh)?\s*(?:xã\/phường|xa\/phuong|xã|xa|phường|phuong)/i;
const GENERIC_PLACE_TERMS = /\b(?:công an cấp xã|cong an cap xa|công an xã nơi cư trú|cong an xa noi cu tru|công an phường\/xã|cong an phuong\/xa)\b/i;
const NON_PLACE_BARE_PATTERN = /\b(?:người|nguoi|tuổi|tuoi|nam|nữ|nu|quốc tịch|quoc tich|việt nam|viet nam|hàn quốc|han quoc|nhật bản|nhat ban|trung quốc|trung quoc|vietnamese citizen|foreign national|foreigner|nationality|citizen|yes|no|nào|nao|đâu|dau|where|which|công an|cong an|có|co|không|khong)\b/i;
const GENERIC_AUTHORITY_WHERE_PATTERN = /\b(?:nộp|nop|làm|lam|thực hiện|thuc hien)\b[^.!?\n]{0,60}\b(?:ở đâu|o dau)\b/i;
const GENERIC_WHERE_ONLY_PATTERN = /^\s*(?:tôi|toi|em|mình|minh)\s+(?:ở|o)\s+(?:đâu|dau)\s*\??\s*$/i;

function assistantAskedForLocation(history) {
    const items = Array.isArray(history) ? history : [];
    const last = items[items.length - 1];
    if (last?.role !== 'model') return false;
    const text = normalizeLabel(last.parts?.map(part => String(part?.text || '')).join(' '));
    return FOLLOWUP_QUESTION_PATTERN.test(text);
}

function isShortPlaceAnswer(message) {
    const text = normalizeLabel(message);
    if (!text || text.split(/\s+/).length > 8) return false;
    if (PROCEDURE_TERMS.test(text) || LEGAL_TERMS.test(text) || PHYSICAL_LOCATION_TERMS.test(text)) return false;
    return PLACE_PATTERN.test(text) || /^[a-zà-ỹ][a-zà-ỹ -]{1,40}$/i.test(text);
}

function extractPlaceMention(raw) {
    const match = String(raw || '').match(PLACE_PATTERN);
    if (!match) return '';
    const words = match[0].trim().split(/\s+/);
    const kept = [];
    for (const word of words) {
        const normalized = normalizeLabel(word);
        if (kept.length >= 1 && PLACE_STOP_WORDS.has(normalized)) break;
        kept.push(word);
    }
    return kept.length > 1 ? kept.join(' ') : '';
}

function buildRequestPlan(currentMessage, history = []) {
    const raw = String(currentMessage || '').trim();
    const text = normalizeLabel(raw);
    const reasons = [];
    const uncertainty = [];
    const needsProcedure = PROCEDURE_TERMS.test(text) || AUTHORITY_TERMS.test(text);
    const needsLegalExplanation = LEGAL_TERMS.test(text) || /\b(?:vì sao|vi sao|có gì khác|co gi khac|còn áp dụng|con ap dung)\b/i.test(text);
    const authorityQuestion = AUTHORITY_TERMS.test(text);
    const hasPlaceMention = PLACE_PATTERN.test(text) || RESIDENCE_PATTERN.test(text);
    const hasResidenceMention = RESIDENCE_PATTERN.test(text);
    const explicitPhysical = (PHYSICAL_LOCATION_TERMS.test(text) && !GENERIC_WHERE_ONLY_PATTERN.test(text) && (!GENERIC_AUTHORITY_WHERE_PATTERN.test(text) || hasResidenceMention)) || STATION_SELECTION_PATTERN.test(text) ||
        (STATION_NAME_PATTERN.test(text) && !GENERIC_PLACE_TERMS.test(text));
    const asksSpecificStation = /\b(?:đến|den)\s+(?:trụ sở|tru so|công an|cong an)\s+(?:nào|nao)|\b(?:tôi|toi)\s+(?:ở|o)\b.*\b(?:đến đâu|den dau|ở đâu|o dau)\b/i.test(text);
    const procedureOnlyWhere = /\b(?:nộp|nop|làm|lam|thực hiện|thuc hien)\s+(?:ở đâu|o dau)\b/i.test(text) && !explicitPhysical && !asksSpecificStation;

    let locationTask = 'none';
    if (explicitPhysical || asksSpecificStation) {
        locationTask = /(?:số điện thoại|so dien thoai|điện thoại|dien thoai|phone)/i.test(text) ? 'contact'
            : /(?:google maps|chỉ đường|chi duong|directions|tọa độ|toa do)/i.test(text) ? 'directions'
                : /(?:địa chỉ|dia chi)/i.test(text) ? 'address' : 'find_station';
        reasons.push('explicit_physical_location_request');
    } else if (procedureOnlyWhere) {
        reasons.push('where_means_authority_or_filing_place');
    }

    // A short bare place name is a location lookup/clarification only when it is not
    // carrying a procedural or legal question. A residence mention in a procedure query
    // remains context until the user asks for a concrete station.
    if (locationTask === 'none' && !needsProcedure && !needsLegalExplanation &&
        (PLACE_PATTERN.test(text) || STATION_NAME_PATTERN.test(text) ||
            (/^[a-zà-ỹ][a-zà-ỹ -]{1,50}$/i.test(text) && !NON_PLACE_BARE_PATTERN.test(text)))) {
        locationTask = 'find_station';
        reasons.push('bare_or_named_station_request');
    }

    if (needsProcedure) reasons.push('procedure_or_authority_content');
    if (needsLegalExplanation) reasons.push('legal_explanation_content');
    if (hasPlaceMention && locationTask === 'none') reasons.push('place_is_context_only');

    let followup = 'none';
    if (assistantAskedForLocation(history)) {
        if (isShortPlaceAnswer(raw)) {
            locationTask = 'find_station';
            followup = 'none';
            reasons.push('valid_location_followup');
        } else {
            uncertainty.push('pending_location_followup_not_answered');
        }
    }

    if (locationTask !== 'none' && !hasPlaceMention && !isShortPlaceAnswer(raw)) {
        followup = 'awaiting_place';
        reasons.push('location_requested_without_place');
    }
    if (locationTask === 'none' && assistantAskedForLocation(history)) uncertainty.push('topic_switch_clears_pending_location');

    return {
        needsProcedure: Boolean(needsProcedure),
        needsLegalExplanation: Boolean(needsLegalExplanation),
        authorityQuestion: Boolean(authorityQuestion),
        locationTask,
        placeMention: hasPlaceMention ? { value: extractPlaceMention(raw), sourceTurn: 'current', usage: 'context' } : null,
        procedureReference: null,
        followup,
        reasons,
        uncertainty,
        hasPlaceMention,
        assistantAskedForLocation: assistantAskedForLocation(history),
        isProcedureOrLegal: Boolean(needsProcedure || needsLegalExplanation),
        isPureLocation: Boolean(locationTask !== 'none' && !needsProcedure && !needsLegalExplanation),
    };
}

module.exports = { buildRequestPlan, assistantAskedForLocation, isShortPlaceAnswer, extractPlaceMention };
