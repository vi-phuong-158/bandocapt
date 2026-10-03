'use strict';

const INJECTION_PATTERNS = [
    // English
    /ignore\s+(all\s+)?previous\s+instructions/i,
    /ignore\s+(all\s+)?above\s+instructions/i,
    /ignore\s+(the\s+)?(system|developer|initial)\s+(prompt|message|instruction)s?/i,
    /disregard\s+(all\s+)?previous/i,
    /you\s+are\s+now\s+(a|an|in)\s/i,
    /act\s+as\s+(a|an)\s+(unrestricted|unfiltered|evil)/i,
    /\bDAN\s+mode\b/i,
    /\bjailbreak\b/i,
    /\bdo\s+anything\s+now\b/i,
    /bypass\s+(your|the|all)\s+(restrictions|filters|safety)/i,
    /pretend\s+(you\s+)?(are|have)\s+no\s+(rules|restrictions|limits)/i,
    /system\s*prompt|system\s*message/i,
    /developer\s*(prompt|message|instruction)/i,
    /reveal\s+(your\s+)?(prompt|instructions|system)/i,
    /show\s+(your\s+)?(prompt|instructions|system)/i,
    /repeat\s+(the\s+)?(above|system|initial)\s+(prompt|instruction|message)/i,
    // Tiếng Việt
    /bỏ\s+qua\s+(các?\s+)?(hướng\s+dẫn|chỉ\s+dẫn|lệnh)/i,
    /quên\s+(toàn\s+bộ\s+)?chỉ\s+dẫn/i,
    /đóng\s+vai/i,
    /bạn\s+bây\s+giờ\s+là/i,
    /giả\s+vờ\s+(là|như)/i,
    /tiet\s*lo\s+(system\s*)?(prompt|chi\s*dan|huong\s*dan)/i,
    /hien\s*(thi|ra)\s+(system\s*)?(prompt|chi\s*dan|huong\s*dan)/i,
    /bo\s*qua\s+(cac?\s+)?(huong\s*dan|chi\s*dan|lenh)/i,
    /quen\s+(toan\s*bo\s+)?(chi\s*dan|huong\s*dan|lenh)/i,
    /dong\s*vai/i,
    /ban\s+bay\s+gio\s+la/i,
    /gia\s*vo\s+(la|nhu)/i,
    // 한국어 (Korean)
    /이전\s*지시.{0,5}무시/,
    /지시.{0,5}무시/,
    // 中文 (Chinese)
    /忽略.{0,5}(之前的|以上的)?(指示|指令|提示)/,
    /你现在是/,
];

function normalizeInjectionText(text) {
    return String(text || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function detectPromptInjection(text) {
    const raw = String(text || '');
    const normalized = normalizeInjectionText(raw);
    return INJECTION_PATTERNS.some(pattern => pattern.test(raw) || pattern.test(normalized));
}


function validateChatContent(userMessage) {
    if (!userMessage || typeof userMessage !== 'string' || userMessage.trim() === '') {
        return { ok: false, status: 400, error: 'BAD_REQUEST', detail: 'userMessage is required.' };
    }

    if (userMessage.length > 1000) {
        return { ok: false, status: 400, error: 'BAD_REQUEST', detail: 'userMessage quá dài (tối đa 1000 ký tự).' };
    }

    if (detectPromptInjection(userMessage)) {
        return {
            ok: false,
            status: 400,
            error: 'BAD_REQUEST',
            detail: 'Câu hỏi không hợp lệ. Vui lòng hỏi về các quy định pháp luật xuất nhập cảnh.',
            injection: true,
        };
    }

    return { ok: true, userMessage };
}

module.exports = { detectPromptInjection, normalizeInjectionText, validateChatContent };
