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
    copied: 'Đã chép',
    copy: 'Sao chép',
    interrupted: 'Phản hồi bị gián đoạn trước khi hoàn tất. Nội dung phía trên có thể chưa đầy đủ.'
};

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
const CHAT_MODAL_BREAKPOINT = 768;

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

    const isModal = isOpen && isChatModalViewport();
    chatWindow.setAttribute('aria-modal', isModal ? 'true' : 'false');
    toggle.hidden = isModal;
    document.body.classList.toggle('ai-chat-modal-open', isModal);
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
    setTimeout(() => input?.focus(), 120);
}

function closeChatWindow() {
    if (isChatSending) stopActiveStream('close');
    const { toggle, window: chatWindow } = getChatElements();
    if (!toggle || !chatWindow) return;
    chatWindow.classList.remove('ai-chat-window--visible');
    chatWindow.classList.add('ai-chat-window--hidden');
    toggle.setAttribute('aria-expanded', 'false');
    chatWindow.setAttribute('aria-hidden', 'true');
    syncChatWindowPresentation(false);
    toggle.focus();
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
            <span>${CHATBOT_TEXT.typing}</span>
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

function appendActionBar(bubble, answerText) {
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
    goodBtn.setAttribute('aria-label', 'Phản hồi hữu ích');
    goodBtn.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">thumb_up</span>';

    const badBtn = document.createElement('button');
    badBtn.type = 'button';
    badBtn.className = 'ai-chat-action-btn ai-chat-action-btn--icon';
    badBtn.setAttribute('aria-label', 'Phản hồi chưa hữu ích');
    badBtn.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">thumb_down</span>';

    function lockFeedback(activeBtn) {
        goodBtn.disabled = true;
        badBtn.disabled = true;
        activeBtn.classList.add('is-selected');
    }

    goodBtn.addEventListener('click', () => lockFeedback(goodBtn));
    badBtn.addEventListener('click', () => lockFeedback(badBtn));

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
        // Chỉ hiện khi source là thủ tục (có procedure_id) và catalog đã nạp; dedupe theo procedure_id.
        if (source.procedure_id && window.TthcCatalog && !seenProcedureIds.has(source.procedure_id)) {
            seenProcedureIds.add(source.procedure_id);
            const compareBtn = document.createElement('button');
            compareBtn.type = 'button';
            compareBtn.className = 'ai-chat-source-compare';
            compareBtn.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">fact_check</span><span>Đối chiếu trong danh mục</span>';
            compareBtn.addEventListener('click', () => window.TthcCatalog.openProcedure(source.procedure_id));
            item.appendChild(compareBtn);
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

    // 2. Hỏi quốc tịch (mất hộ chiếu chưa rõ đối tượng) — phrasing cố định vi/en trong prompt
    if (/foreign national or a Vietnamese citizen/i.test(text)) {
        return [
            { label: 'Foreign national', send: 'I am a foreign national' },
            { label: 'Vietnamese citizen', send: 'I am a Vietnamese citizen' }
        ];
    }
    if (/người nước ngoài hay công dân Việt Nam/i.test(text)) {
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
        }, activeCancelController.signal);

        if (renderTimer) clearTimeout(renderTimer);
        if (activeAbortMode === 'close' && requestController.signal.aborted) {
            shouldRestoreFocus = false;
            row?.remove();
            return;
        }

        if (result.ok) {
            chatHistory = result.history || chatHistory;
            renderMarkdown(result.fullText || rawText, content);
            applyProgressiveDisclosure(content);
            appendActionBar(bubble, result.fullText || rawText);
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
        if (isVisible) closeChatWindow();
        else openChatWindow();
    });

    close?.addEventListener('click', (event) => {
        event.stopPropagation();
        closeChatWindow();
    });

    chatWindow.addEventListener('click', event => event.stopPropagation());
    chatWindow.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeChatWindow();
            return;
        }
        if (event.key === 'Tab' && isChatModalViewport()) {
            const focusable = Array.from(chatWindow.querySelectorAll(
                'button:not([disabled]), input:not([disabled])'
            )).filter(el => el.offsetParent !== null);
            if (focusable.length < 2) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
    });
    input?.addEventListener('keydown', handleChatEnter);
    const { send } = getChatElements();
    send?.addEventListener('click', handleChatSend);
    setChatInputEnabled(isLocalHost, isLocalHost ? CHATBOT_TEXT.placeholder : CHATBOT_TEXT.captchaPlaceholder);
    window.addEventListener('resize', () => {
        if (isChatWindowVisible()) syncChatWindowPresentation(true);
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
