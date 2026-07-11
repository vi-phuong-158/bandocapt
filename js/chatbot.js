if (typeof DOMPurify !== 'undefined') {
    DOMPurify.addHook('afterSanitizeAttributes', function (node) {
        if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
            node.setAttribute('rel', 'noopener noreferrer');
        }
    });
}

function safeHTML(html) {
    if (typeof DOMPurify !== 'undefined') return DOMPurify.sanitize(html);
    const div = document.createElement('div');
    div.textContent = html;
    return div.innerHTML;
}

const CHATBOT_TEXT = {
    assistantName: 'Trợ lý hỗ trợ pháp luật',
    ready: 'Sẵn sàng hỗ trợ',
    welcome: 'Xin chào! Tôi là Trợ lý ảo tư vấn tự động các thủ tục hành chính. Tôi có thể giúp gì cho bạn hôm nay?',
    disclaimer: 'Nội dung tổng hợp bằng AI nên có thể có sai sót, vui lòng kiểm chứng lại thông tin.',
    placeholder: 'Nhập câu hỏi...',
    captchaPlaceholder: 'Vui lòng xác minh Turnstile trước...',
    recaptchaPending: 'Đang xác minh lại CAPTCHA...',
    typing: 'Đang suy nghĩ...',
    typingRetrieving: 'Đang tra cứu văn bản pháp luật…',
    typingGenerating: 'Đang soạn câu trả lời…',
    copied: 'Đã chép',
    copy: 'Sao chép',
    interrupted: 'Phản hồi bị gián đoạn trước khi hoàn tất. Nội dung phía trên có thể chưa đầy đủ.',
    feedbackGood: 'Phản hồi hữu ích',
    feedbackBad: 'Báo cáo câu trả lời',
    feedbackThanks: 'Cảm ơn phản hồi của bạn!',
    feedbackError: 'Không gửi được phản hồi. Vui lòng thử lại.',
    reportTitle: 'Báo cáo câu trả lời này có vấn đề gì?',
    reportCategoryLabel: 'Loại vấn đề',
    reportCommentPlaceholder: 'Mô tả chi tiết (không bắt buộc)…',
    reportContactPlaceholder: 'Email/SĐT để phản hồi lại (không bắt buộc)',
    reportSubmit: 'Gửi báo cáo',
    reportSkip: 'Bỏ qua'
};

// Giá trị khớp VALID_CATEGORIES trong api/feedback.js — đổi ở đây phải đổi đồng bộ bên server.
const FEEDBACK_CATEGORIES = [
    { value: 'sai_thong_tin', label: 'Sai thông tin' },
    { value: 'thieu_thong_tin', label: 'Thiếu thông tin' },
    { value: 'khong_lien_quan', label: 'Không liên quan' },
    { value: 'ngon_tu', label: 'Ngôn từ không phù hợp' },
    { value: 'khac', label: 'Khác' }
];

let feedbackTurnCounter = 0;
function newTurnId() {
    feedbackTurnCounter += 1;
    const rand = Math.random().toString(36).slice(2, 8);
    return `t_${Date.now()}_${feedbackTurnCounter}_${rand}`;
}

const CHATBOT_ERROR_MESSAGES = {
    NO_KEY: 'Chưa có API Key. Vui lòng cấu hình GEMINI_API_KEY trên server.',
    INVALID_KEY: 'API Key không hợp lệ hoặc đã hết hạn. Vui lòng kiểm tra lại.',
    RATE_LIMIT: 'Rất xin lỗi, hiện tại hệ thống đang có nhiều lượt truy cập. Vui lòng thử lại sau.',
    RATE_LIMIT_EXCEEDED: 'Rất xin lỗi, hệ thống đã đạt giới hạn lượt hỏi trong ngày/tháng. Vui lòng thử lại sau.',
    BLOCKED_CONTENT: 'Câu hỏi này không phù hợp. Vui lòng hỏi về các quy định pháp luật hoặc thủ tục hành chính.',
    CAPTCHA_FAILED: 'Xác minh CAPTCHA thất bại. Vui lòng thử lại.',
    INVALID_TOKEN: 'Request token không hợp lệ hoặc đã hết hạn. Vui lòng tải lại trang và thử lại.',
    MISSING_TOKEN: 'Thiếu request token. Vui lòng tải lại trang và thử lại.',
    NETWORK_ERROR: 'Lỗi kết nối mạng. Vui lòng kiểm tra internet và thử lại.',
    SERVICE_UNAVAILABLE: 'Dịch vụ AI tạm thời không khả dụng. Vui lòng thử lại sau.',
    NO_RESPONSE: 'Không nhận được phản hồi từ AI. Vui lòng thử lại.',
    STREAM_ERROR: 'Kết nối bị gián đoạn. Vui lòng thử lại.',
    TIMEOUT: 'Phản hồi quá lâu. Vui lòng thử lại.',
    DEFAULT: 'Có lỗi xảy ra. Vui lòng thử lại.'
};

let chatHistory = [];
let turnstileVerified = false;
let turnstileToken = null;
let isChatSending = false;
let activeCancelController = null;
let activeAbortMode = null;
const isLocalHost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const CHAT_MODAL_BREAKPOINT = 767;

function stopActiveStream(mode = 'stop') {
    activeAbortMode = mode;
    activeCancelController?.abort();
}

function isChatModalViewport() {
    return typeof window.matchMedia === 'function' &&
        window.matchMedia(`(max-width: ${CHAT_MODAL_BREAKPOINT}px)`).matches;
}

function isChatWindowVisible() {
    return getChatElements().window?.classList.contains('ai-chat-window--visible');
}

function syncChatWindowPresentation(isOpen) {
    const { toggle, window: chatWindow } = getChatElements();
    if (!toggle || !chatWindow) return;

    chatWindow.setAttribute('aria-modal', 'false');
    toggle.hidden = false;
    document.body.classList.toggle('ai-chat-modal-open', isOpen && isChatModalViewport());
}

function formatSourceDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('vi-VN').format(date);
}

window._turnstileWidgetId = null;
window._turnstileToken = null;

function getChatElements() {
    return {
        toggle: document.getElementById('ai-chat-toggle-btn'),
        window: document.getElementById('ai-chat-window'),
        close: document.getElementById('ai-chat-close-btn'),
        history: document.getElementById('chatHistory'),
        input: document.getElementById('fakeChatInput'),
        send: document.getElementById('chatSendBtn'),
        turnstileContainer: document.getElementById('turnstileContainer')
    };
}

function setChatInputEnabled(enabled, placeholder) {
    const { input, send } = getChatElements();
    if (input) {
        input.disabled = !enabled;
        input.placeholder = placeholder || CHATBOT_TEXT.placeholder;
    }
    if (send) send.disabled = !enabled;
}

function openChatWindow() {
    const { toggle, window: chatWindow, input } = getChatElements();
    if (!toggle || !chatWindow) return;
    chatWindow.classList.remove('ai-chat-window--hidden');
    chatWindow.classList.add('ai-chat-window--visible');
    toggle.setAttribute('aria-expanded', 'true');
    chatWindow.setAttribute('aria-hidden', 'false');
    syncChatWindowPresentation(true);
    renderStarterChips();
    // P3.3: warm catalog trong nền để citation guide resolve deep-link theo title.
    window.TthcCatalog?.preload?.();
    setTimeout(() => input?.focus(), 120);
}

function closeChatWindow({ restoreFocus = true } = {}) {
    if (isChatSending) stopActiveStream('close');
    const { toggle, window: chatWindow } = getChatElements();
    if (!toggle || !chatWindow) return;
    const wasVisible = chatWindow.classList.contains('ai-chat-window--visible');
    chatWindow.classList.remove('ai-chat-window--visible');
    chatWindow.classList.add('ai-chat-window--hidden');
    toggle.setAttribute('aria-expanded', 'false');
    chatWindow.setAttribute('aria-hidden', 'true');
    syncChatWindowPresentation(false);
    if (restoreFocus && wasVisible && toggle.offsetParent !== null) toggle.focus();
}

function scrollChatToBottom() {
    const { history } = getChatElements();
    if (history) history.scrollTop = history.scrollHeight;
}

function renderMarkdown(text, target) {
    if (!target) return;
    if (typeof marked !== 'undefined' && marked.parse) {
        target.innerHTML = safeHTML(marked.parse(text));
        return;
    }

    const fallbackHTML = text
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');
    target.innerHTML = safeHTML(fallbackHTML);
}

function appendUserMessage(text) {
    const { history } = getChatElements();
    if (!history) return;

    const row = document.createElement('div');
    row.className = 'ai-chat-row ai-chat-row--user';

    const bubble = document.createElement('div');
    bubble.className = 'ai-chat-bubble ai-chat-bubble--user';
    bubble.textContent = text;

    row.appendChild(bubble);
    history.appendChild(row);
    scrollChatToBottom();
}

function appendAssistantShell() {
    const { history } = getChatElements();
    if (!history) return {};

    const row = document.createElement('div');
    row.className = 'ai-chat-row ai-chat-row--assistant';

    const avatar = document.createElement('img');
    avatar.className = 'ai-chat-avatar';
    avatar.src = 'assets/icon.png';
    avatar.alt = '';

    const bubble = document.createElement('div');
    bubble.className = 'ai-chat-bubble ai-chat-bubble--assistant';

    const label = document.createElement('p');
    label.className = 'ai-chat-label';
    label.textContent = CHATBOT_TEXT.assistantName;

    const content = document.createElement('div');
    content.className = 'ai-chat-content';
    content.innerHTML = `
        <span class="ai-chat-typing">
            <span></span><span></span><span></span>
            <span class="ai-chat-typing-label">${CHATBOT_TEXT.typingRetrieving}</span>
        </span>
    `;

    bubble.appendChild(label);
    bubble.appendChild(content);
    row.appendChild(avatar);
    row.appendChild(bubble);
    history.appendChild(row);
    scrollChatToBottom();

    return { row, bubble, content };
}

// Gửi 1 phản hồi cho lượt trả lời (turnMeta) kèm dữ liệu bổ sung (rating, category, comment, contact).
// Best-effort: hiện lời cảm ơn khi thành công, hiện lỗi nếu gửi hỏng.
async function submitFeedback(bubble, turnMeta, extra) {
    if (!window.GeminiAI?.sendFeedback) return;
    const payload = {
        turn_id: turnMeta.turnId,
        question: turnMeta.question,
        answer: turnMeta.answer,
        sources: turnMeta.sources,
        ...extra
    };
    const result = await window.GeminiAI.sendFeedback(payload);
    showFeedbackResult(bubble, result?.ok !== false);
}

function showFeedbackResult(bubble, ok) {
    bubble.querySelector('.ai-chat-feedback-form')?.remove();
    const existing = bubble.querySelector('.ai-chat-feedback-status');
    const status = existing || document.createElement('p');
    status.className = 'ai-chat-feedback-status';
    status.textContent = ok ? CHATBOT_TEXT.feedbackThanks : CHATBOT_TEXT.feedbackError;
    if (!existing) bubble.appendChild(status);
}

// Form báo cáo chi tiết khi người dùng bấm 👎: chọn loại vấn đề + mô tả + liên hệ (tùy chọn).
function openReportForm(bubble, turnMeta) {
    if (bubble.querySelector('.ai-chat-feedback-form')) return;

    const form = document.createElement('form');
    form.className = 'ai-chat-feedback-form';

    const title = document.createElement('p');
    title.className = 'ai-chat-feedback-title';
    title.textContent = CHATBOT_TEXT.reportTitle;

    const select = document.createElement('select');
    select.className = 'ai-chat-feedback-select';
    select.setAttribute('aria-label', CHATBOT_TEXT.reportCategoryLabel);
    FEEDBACK_CATEGORIES.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.value;
        opt.textContent = cat.label;
        select.appendChild(opt);
    });

    const comment = document.createElement('textarea');
    comment.className = 'ai-chat-feedback-textarea';
    comment.rows = 2;
    comment.maxLength = 1000;
    comment.placeholder = CHATBOT_TEXT.reportCommentPlaceholder;

    const contact = document.createElement('input');
    contact.type = 'text';
    contact.className = 'ai-chat-feedback-contact';
    contact.maxLength = 200;
    contact.placeholder = CHATBOT_TEXT.reportContactPlaceholder;

    const actions = document.createElement('div');
    actions.className = 'ai-chat-feedback-form-actions';

    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'ai-chat-feedback-submit';
    submitBtn.textContent = CHATBOT_TEXT.reportSubmit;

    const skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.className = 'ai-chat-feedback-skip';
    skipBtn.textContent = CHATBOT_TEXT.reportSkip;

    actions.append(submitBtn, skipBtn);
    form.append(title, select, comment, contact, actions);
    bubble.appendChild(form);
    scrollChatToBottom();

    form.addEventListener('submit', event => {
        event.preventDefault();
        submitBtn.disabled = true;
        skipBtn.disabled = true;
        submitFeedback(bubble, turnMeta, {
            rating: 'down',
            category: select.value,
            comment: comment.value.trim(),
            contact: contact.value.trim()
        });
    });

    // Bỏ qua chi tiết nhưng vẫn ghi nhận 1 phiếu 👎 để không mất tín hiệu tiêu cực.
    skipBtn.addEventListener('click', () => {
        submitBtn.disabled = true;
        skipBtn.disabled = true;
        submitFeedback(bubble, turnMeta, { rating: 'down' });
    });

    setTimeout(() => select.focus(), 50);
}

function appendActionBar(bubble, turnMeta) {
    const answerText = turnMeta.answer;
    const actionBar = document.createElement('div');
    actionBar.className = 'ai-chat-actions';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'ai-chat-action-btn';
    copyBtn.setAttribute('aria-label', CHATBOT_TEXT.copy);
    copyBtn.innerHTML = '<span class="material-symbols-outlined">content_copy</span><span>' + CHATBOT_TEXT.copy + '</span>';
    copyBtn.addEventListener('click', () => {
        navigator.clipboard?.writeText(answerText).then(() => {
            copyBtn.innerHTML = '<span class="material-symbols-outlined">check</span><span>' + CHATBOT_TEXT.copied + '</span>';
            setTimeout(() => {
                copyBtn.innerHTML = '<span class="material-symbols-outlined">content_copy</span><span>' + CHATBOT_TEXT.copy + '</span>';
            }, 1800);
        });
    });

    const goodBtn = document.createElement('button');
    goodBtn.type = 'button';
    goodBtn.className = 'ai-chat-action-btn ai-chat-action-btn--icon';
    goodBtn.setAttribute('aria-label', CHATBOT_TEXT.feedbackGood);
    goodBtn.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">thumb_up</span>';

    const badBtn = document.createElement('button');
    badBtn.type = 'button';
    badBtn.className = 'ai-chat-action-btn ai-chat-action-btn--icon';
    badBtn.setAttribute('aria-label', CHATBOT_TEXT.feedbackBad);
    badBtn.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">thumb_down</span>';

    function lockFeedback(activeBtn) {
        goodBtn.disabled = true;
        badBtn.disabled = true;
        activeBtn.classList.add('is-selected');
    }

    goodBtn.addEventListener('click', () => {
        lockFeedback(goodBtn);
        submitFeedback(bubble, turnMeta, { rating: 'up' });
    });
    badBtn.addEventListener('click', () => {
        lockFeedback(badBtn);
        openReportForm(bubble, turnMeta);
    });

    actionBar.append(copyBtn, goodBtn, badBtn);
    bubble.appendChild(actionBar);
}

function appendSources(bubble, sources) {
    if (!Array.isArray(sources) || sources.length === 0) return;

    const sourceWrap = document.createElement('div');
    sourceWrap.className = 'ai-chat-sources';
    const seenProcedureIds = new Set();

    sources.forEach(source => {
        const item = document.createElement('div');
        item.className = 'ai-chat-source-item';
        const label = source.article ? `${source.file} - ${source.article}` : source.file;
        if (source.url) {
            const link = document.createElement('a');
            link.className = 'ai-chat-source-chip';
            link.href = source.url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = label;
            item.appendChild(link);
        } else {
            const chip = document.createElement('span');
            chip.className = 'ai-chat-source-chip';
            chip.textContent = label;
            item.appendChild(chip);
        }

        const metadata = [];
        if (source.effective_date) metadata.push(`Hiệu lực: ${formatSourceDate(source.effective_date)}`);
        if (source.last_verified_at) metadata.push(`Xác minh: ${formatSourceDate(source.last_verified_at)}`);
        if (metadata.length > 0) {
            const meta = document.createElement('span');
            meta.className = 'ai-chat-source-meta';
            meta.textContent = metadata.join(' • ');
            item.appendChild(meta);
        }

        // Nút mở toàn văn thủ tục trong danh mục để người dùng đối sánh câu trả lời AI.
        // (1) source có procedure_id (tthc) → mở trực tiếp. (2) source guide không có
        // procedure_id runtime → P3.3: resolve theo title khớp chính xác trong catalog
        // (chỉ hiện khi catalog đã warm và tìm thấy đúng, tránh nút dead-end/mở nhầm).
        const addCompareBtn = onClick => {
            const compareBtn = document.createElement('button');
            compareBtn.type = 'button';
            compareBtn.className = 'ai-chat-source-compare';
            compareBtn.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">fact_check</span><span>Đối chiếu trong danh mục</span>';
            compareBtn.addEventListener('click', onClick);
            item.appendChild(compareBtn);
        };
        if (source.procedure_id && window.TthcCatalog && !seenProcedureIds.has(source.procedure_id)) {
            seenProcedureIds.add(source.procedure_id);
            addCompareBtn(() => window.TthcCatalog.openProcedure(source.procedure_id));
        } else if (!source.procedure_id && source.title && window.TthcCatalog?.findByTitle) {
            const resolvedId = window.TthcCatalog.findByTitle(source.title);
            if (resolvedId && !seenProcedureIds.has(resolvedId)) {
                seenProcedureIds.add(resolvedId);
                addCompareBtn(() => window.TthcCatalog.openByTitle(source.title));
            }
        }

        sourceWrap.appendChild(item);
    });

    bubble.appendChild(sourceWrap);
}

function appendNotice(bubble, text) {
    const notice = document.createElement('p');
    notice.className = 'ai-chat-notice';
    notice.textContent = text;
    bubble.appendChild(notice);
}

// Quick-reply chips: chỉ nhận diện các câu follow-up có PHRASING CỐ ĐỊNH trong SYSTEM_PROMPT_BASE
// (api/chat.js — hỏi khu vực cũ, mời hướng dẫn đầy đủ, hỏi quốc tịch khi mất hộ chiếu).
// Nếu đổi phrasing trong prompt thì PHẢI cập nhật regex ở đây (xem docs/brain/03-decisions.md).
function endsWithQuestion(text) {
    return /[?？]/.test(String(text || '').trim().slice(-120));
}

function detectQuickReplies(fullText) {
    const text = String(fullText || '');
    if (!text.trim()) return [];

    // 1. Hỏi khu vực hành chính cũ (3 điểm tiếp dân Phòng QLXNC)
    if (/Phú Thọ cũ[\s\S]*Vĩnh Phúc cũ[\s\S]*Hòa Bình cũ/i.test(text) && endsWithQuestion(text)) {
        return [
            { label: 'Phú Thọ cũ', send: 'Tôi ở khu vực Phú Thọ cũ' },
            { label: 'Vĩnh Phúc cũ', send: 'Tôi ở khu vực Vĩnh Phúc cũ' },
            { label: 'Hòa Bình cũ', send: 'Tôi ở khu vực Hòa Bình cũ' }
        ];
    }

    // 2. Hỏi quốc tịch (mất hộ chiếu chưa rõ đối tượng) — phrasing cố định vi/en trong prompt,
    // model có thể đảo thứ tự hai vế nên nhận cả hai chiều.
    if (/foreign national or a Vietnamese citizen|Vietnamese citizen or a foreign national/i.test(text)) {
        return [
            { label: 'Foreign national', send: 'I am a foreign national' },
            { label: 'Vietnamese citizen', send: 'I am a Vietnamese citizen' }
        ];
    }
    if (/người nước ngoài hay (?:là )?công dân Việt Nam|công dân Việt Nam hay (?:là )?người nước ngoài/i.test(text)) {
        return [
            { label: 'Người nước ngoài', send: 'Tôi là người nước ngoài' },
            { label: 'Công dân Việt Nam', send: 'Tôi là công dân Việt Nam' }
        ];
    }

    // 3. Chế độ HẸP mời xem chi tiết — phrasing cố định trong prompt
    if (/hướng dẫn đầy đủ hồ sơ và cách thực hiện/i.test(text) && endsWithQuestion(text)) {
        return [
            { label: '📋 Hướng dẫn đầy đủ hồ sơ', send: 'Hướng dẫn đầy đủ hồ sơ và cách thực hiện giúp tôi' }
        ];
    }

    return [];
}

function clearQuickReplies() {
    document.querySelectorAll('.ai-chat-quick-replies').forEach(el => el.remove());
}

// P3.2: Câu hỏi gợi ý hiển thị khi mở chat lúc hội thoại còn trống — rút ngắn
// bước đầu cho người dân (không phải tự nghĩ câu hỏi). Phủ các lĩnh vực phổ biến.
const STARTER_QUESTIONS = [
    { label: 'Gia hạn tạm trú cho người nước ngoài', send: 'Thủ tục gia hạn tạm trú cho người nước ngoài như thế nào?' },
    { label: 'Khai báo tạm trú cho khách nước ngoài', send: 'Khách sạn của tôi có khách nước ngoài thì khai báo tạm trú thế nào?' },
    { label: 'Làm căn cước ở đâu?', send: 'Tôi muốn làm căn cước thì đến đâu và cần giấy tờ gì?' },
    { label: 'Cấp hộ chiếu phổ thông', send: 'Thủ tục cấp hộ chiếu phổ thông cần những gì?' },
    { label: 'Đăng ký xe máy, ô tô', send: 'Thủ tục đăng ký xe máy, ô tô như thế nào?' },
    { label: 'Mất hộ chiếu thì làm sao?', send: 'Tôi bị mất hộ chiếu thì phải làm gì?' }
];

function renderStarterChips() {
    const { history } = getChatElements();
    if (!history) return;
    if (chatHistory.length > 0) return;                       // chỉ khi hội thoại trống
    if (history.querySelector('.ai-chat-starter')) return;    // tránh render trùng khi mở lại

    const wrap = document.createElement('div');
    wrap.className = 'ai-chat-quick-replies ai-chat-starter';  // dùng chung style + bị clearQuickReplies dọn
    STARTER_QUESTIONS.forEach(q => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ai-chat-quick-reply';
        btn.textContent = q.label;
        btn.addEventListener('click', () => {
            const { input } = getChatElements();
            if (!input || input.disabled) return;
            input.value = q.send;
            handleChatSend();
        });
        wrap.appendChild(btn);
    });
    history.appendChild(wrap);
    scrollChatToBottom();
}

function appendQuickReplies(row, fullText) {
    if (!row) return;
    const replies = detectQuickReplies(fullText);
    if (replies.length === 0) return;

    const wrap = document.createElement('div');
    wrap.className = 'ai-chat-quick-replies';
    replies.forEach(reply => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ai-chat-quick-reply';
        btn.textContent = reply.label;
        btn.addEventListener('click', () => {
            const { input } = getChatElements();
            if (!input || input.disabled) return;
            input.value = reply.send;
            handleChatSend();
        });
        wrap.appendChild(btn);
    });
    row.appendChild(wrap);
    scrollChatToBottom();
}

// Progressive disclosure: gom khối "📋 Hồ sơ" và "📝 Trình tự" vào <details> thu gọn —
// đáp án mở đầu, "📍 Nơi nộp" và "📚 Căn cứ" luôn hiển thị. Chỉ áp dụng khi có đủ CẢ 2
// marker (câu trả lời trọn thủ tục); câu hẹp giữ nguyên. Thao tác trên DOM đã sanitize.
const DISCLOSURE_START_EMOJI = ['📋', '📝'];
const DISCLOSURE_STOP_EMOJI = ['📋', '📝', '📍', '📚'];

function startsWithEmoji(el, emojis) {
    const text = (el.textContent || '').trim();
    return emojis.some(emoji => text.startsWith(emoji));
}

function applyProgressiveDisclosure(content) {
    if (!content) return;
    const markers = Array.from(content.children).filter(el => startsWithEmoji(el, DISCLOSURE_START_EMOJI));
    if (markers.length < 2) return;

    markers.forEach(marker => {
        const details = document.createElement('details');
        details.className = 'ai-chat-details';
        const summary = document.createElement('summary');
        summary.textContent = (marker.textContent || '').trim();
        details.appendChild(summary);
        const body = document.createElement('div');
        body.className = 'ai-chat-details-body';
        details.appendChild(body);

        content.insertBefore(details, marker);
        let node = marker.nextElementSibling;
        marker.remove();
        while (node && node.tagName !== 'HR' && !startsWithEmoji(node, DISCLOSURE_STOP_EMOJI) && !node.classList.contains('ai-chat-details')) {
            const next = node.nextElementSibling;
            body.appendChild(node);
            node = next;
        }
    });
}

function getChatErrorMessage(errorCode) {
    const normalized = errorCode === 'RATE_LIMIT_EXCEEDED' ? 'RATE_LIMIT_EXCEEDED' : errorCode;
    if (CHATBOT_ERROR_MESSAGES[normalized]) return CHATBOT_ERROR_MESSAGES[normalized];
    if (window.GeminiAI?.getError) {
        const sourceMessage = window.GeminiAI.getError(normalized, 'vi');
        if (sourceMessage && !/[ÃÂ�]/.test(sourceMessage)) return sourceMessage;
    }
    return CHATBOT_ERROR_MESSAGES.DEFAULT;
}

function handleChatEnter(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleChatSend();
    }
}

async function handleChatSend() {
    // Nút gửi hoạt động như nút Dừng khi đang stream.
    if (isChatSending) {
        stopActiveStream('stop');
        return;
    }
    if (!turnstileVerified || !turnstileToken) return;

    const { input, send } = getChatElements();
    if (!input) return;

    const text = input.value.trim();
    if (!text) return;

    isChatSending = true;
    activeCancelController = new AbortController();
    activeAbortMode = null;
    clearQuickReplies();
    appendUserMessage(text);
    input.value = '';
    input.disabled = true;
    if (send) {
        send.disabled = false;
        send.setAttribute('aria-label', 'Dừng phản hồi');
        send.innerHTML = '<span class="material-symbols-outlined">stop</span>';
    }

    const { row, bubble, content } = appendAssistantShell();
    let rawText = '';
    let firstChunk = true;
    let renderTimer = null;
    let shouldRestoreFocus = true;
    const requestController = activeCancelController;

    try {
        const result = await window.GeminiAI.stream(text, chatHistory, (chunkText) => {
            if (activeAbortMode === 'close' && requestController.signal.aborted) return;
            if (firstChunk) {
                content.innerHTML = '';
                firstChunk = false;
            }
            rawText += chunkText;
            if (!renderTimer) {
                renderTimer = setTimeout(() => {
                    content.textContent = rawText;
                    scrollChatToBottom();
                    renderTimer = null;
                }, 80);
            }
        }, activeCancelController.signal, (status) => {
            // P3.1: đổi nhãn typing khi server báo đã xong khâu truy hồi.
            if (status === 'generating' && firstChunk) {
                const label = content.querySelector('.ai-chat-typing-label');
                if (label) label.textContent = CHATBOT_TEXT.typingGenerating;
            }
        });

        if (renderTimer) clearTimeout(renderTimer);
        if (activeAbortMode === 'close' && requestController.signal.aborted) {
            shouldRestoreFocus = false;
            row?.remove();
            return;
        }

        if (result.ok) {
            chatHistory = result.history || chatHistory;
            const answerText = result.fullText || rawText;
            renderMarkdown(answerText, content);
            applyProgressiveDisclosure(content);
            appendActionBar(bubble, {
                turnId: newTurnId(),
                question: text,
                answer: answerText,
                sources: result.sources
            });
            appendSources(bubble, result.sources);
            appendQuickReplies(row, result.fullText || rawText);
        } else {
            bubble.classList.add('ai-chat-bubble--error');
            if (result.partialText) {
                renderMarkdown(result.partialText, content);
                appendNotice(bubble, CHATBOT_TEXT.interrupted);
            } else {
                content.innerHTML = safeHTML(getChatErrorMessage(result.error));
            }
            if (result.detail) appendNotice(bubble, 'Chi tiết: ' + result.detail);
        }

        row?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    } catch (error) {
        if (activeAbortMode === 'close' && requestController.signal.aborted) {
            shouldRestoreFocus = false;
            row?.remove();
            return;
        }
        bubble.classList.add('ai-chat-bubble--error');
        content.textContent = CHATBOT_ERROR_MESSAGES.DEFAULT;
        appendNotice(bubble, error.message || '');
    } finally {
        if (renderTimer) clearTimeout(renderTimer);
        activeCancelController = null;
        await refreshTurnstileAfterRequest(input, send, {
            restoreFocus: shouldRestoreFocus && isChatWindowVisible()
        });
        activeAbortMode = null;
        isChatSending = false;
    }
}

async function refreshTurnstileAfterRequest(input, send, options = {}) {
    const restoreFocus = options.restoreFocus !== false;
    if (send) {
        send.setAttribute('aria-label', 'Gửi tin nhắn');
        send.innerHTML = '<span class="material-symbols-outlined">send</span>';
    }
    if (isLocalHost) {
        turnstileToken = 'localhost-bypass';
        turnstileVerified = true;
        window._turnstileToken = turnstileToken;
        setChatInputEnabled(true);
        if (restoreFocus) input?.focus();
        return;
    }

    try {
        if (typeof turnstile !== 'undefined' && typeof resetTurnstileAndWaitForNewToken === 'function') {
            const newToken = await resetTurnstileAndWaitForNewToken();
            if (newToken) {
                turnstileToken = newToken;
                turnstileVerified = true;
                window._turnstileToken = newToken;
                setChatInputEnabled(true);
                if (restoreFocus) input?.focus();
            } else {
                turnstileToken = null;
                turnstileVerified = false;
                setChatInputEnabled(false, CHATBOT_TEXT.recaptchaPending);
                const { turnstileContainer } = getChatElements();
                if (turnstileContainer) turnstileContainer.style.display = 'flex';
            }
        } else {
            setChatInputEnabled(false, CHATBOT_TEXT.recaptchaPending);
        }
    } catch (_) {
        setChatInputEnabled(false, CHATBOT_TEXT.recaptchaPending);
    } finally {
        if (send) send.innerHTML = '<span class="material-symbols-outlined">send</span>';
    }
}

window.onTurnstileLoad = function () {
    const widgetEl = document.getElementById('turnstile-widget');
    if (!widgetEl || typeof turnstile === 'undefined') return;

    if (isLocalHost) {
        turnstileToken = 'localhost-bypass';
        turnstileVerified = true;
        window._turnstileToken = turnstileToken;
        setChatInputEnabled(true);
        const { turnstileContainer } = getChatElements();
        if (turnstileContainer) turnstileContainer.style.display = 'none';
        return;
    }

    window._turnstileWidgetId = turnstile.render('#turnstile-widget', {
        sitekey: widgetEl.dataset.sitekey || window.BANDOCAPT_TURNSTILE_SITE_KEY || '0x4AAAAAACxYIuZq7j7f9a7N',
        appearance: 'interaction-only',
        callback: function (token) {
            turnstileToken = token;
            turnstileVerified = true;
            window._turnstileToken = token;

            if (typeof window._onNewTurnstileToken === 'function') {
                window._onNewTurnstileToken(token);
            }

            setChatInputEnabled(true);
            const { turnstileContainer } = getChatElements();
            if (turnstileContainer) turnstileContainer.style.display = 'none';
        },
        'expired-callback': function () {
            turnstileVerified = false;
            turnstileToken = null;
            window._turnstileToken = null;
            setChatInputEnabled(false, CHATBOT_TEXT.captchaPlaceholder);
            const { turnstileContainer } = getChatElements();
            if (turnstileContainer) turnstileContainer.style.display = 'flex';
            turnstile.reset(window._turnstileWidgetId);
        },
        'error-callback': window.onTurnstileError
    });
};

function initChatbotWidget() {
    const { toggle, close, window: chatWindow, input } = getChatElements();
    if (!toggle || !chatWindow) return;

    toggle.addEventListener('click', (event) => {
        event.stopPropagation();
        const isVisible = chatWindow.classList.contains('ai-chat-window--visible');
        if (window.AppNavigation?.isMobile?.()) {
            window.AppNavigation.activate(isVisible ? 'map' : 'chat');
        } else if (isVisible) closeChatWindow();
        else openChatWindow();
    });

    close?.addEventListener('click', (event) => {
        event.stopPropagation();
        if (window.AppNavigation?.isMobile?.()) window.AppNavigation.activate('map');
        else closeChatWindow();
    });

    chatWindow.addEventListener('click', event => event.stopPropagation());
    chatWindow.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            if (window.AppNavigation?.isMobile?.()) window.AppNavigation.activate('map');
            else closeChatWindow();
            return;
        }
    });
    input?.addEventListener('keydown', handleChatEnter);
    const { send } = getChatElements();
    send?.addEventListener('click', handleChatSend);
    setChatInputEnabled(isLocalHost, isLocalHost ? CHATBOT_TEXT.placeholder : CHATBOT_TEXT.captchaPlaceholder);
    window.addEventListener('resize', () => {
        if (isChatWindowVisible()) syncChatWindowPresentation(true);
    });

    window.AppNavigation?.registerSurface('chat', {
        activate: openChatWindow,
        deactivate: () => closeChatWindow({ restoreFocus: false })
    });

    if (isLocalHost) {
        turnstileToken = 'localhost-bypass';
        turnstileVerified = true;
        window._turnstileToken = turnstileToken;
        const { turnstileContainer } = getChatElements();
        if (turnstileContainer) turnstileContainer.style.display = 'none';
    }
}

window.handleChatSend = handleChatSend;
window.handleChatEnter = handleChatEnter;
window.ChatbotUI = {
    open: openChatWindow,
    close: closeChatWindow,
    isOpen: isChatWindowVisible
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports.__test = {
        CHAT_MODAL_BREAKPOINT,
        formatSourceDate,
        isChatModalViewport,
        syncChatWindowPresentation,
        detectQuickReplies
    };
}

document.addEventListener('DOMContentLoaded', initChatbotWidget);
