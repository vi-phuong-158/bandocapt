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
    welcome: 'Xin chào! Tôi là Trợ lý ảo tư vấn tự động các quy định xuất nhập cảnh và pháp luật liên quan. Tôi có thể giúp gì cho bạn hôm nay?',
    disclaimer: 'Nội dung tổng hợp bằng AI nên có thể có sai sót, vui lòng kiểm chứng lại thông tin.',
    placeholder: 'Nhập câu hỏi...',
    captchaPlaceholder: 'Vui lòng xác minh Turnstile trước...',
    recaptchaPending: 'Đang xác minh lại CAPTCHA...',
    typing: 'Đang suy nghĩ...',
    copied: 'Đã chép',
    copy: 'Sao chép',
    interrupted: 'Phản hồi bị gián đoạn trước khi hoàn tất. Nội dung phía trên có thể chưa đầy đủ.',
    truncated: 'Phản hồi đã chạm giới hạn độ dài. Hãy hỏi tiếp "phần còn lại" hoặc yêu cầu tóm tắt ngắn hơn.'
};

const CHATBOT_ERROR_MESSAGES = {
    NO_KEY: 'Chưa có API Key. Vui lòng cấu hình GEMINI_API_KEY trên server.',
    INVALID_KEY: 'API Key không hợp lệ hoặc đã hết hạn. Vui lòng kiểm tra lại.',
    RATE_LIMIT: 'Rất xin lỗi, hiện tại hệ thống đang có nhiều lượt truy cập. Vui lòng thử lại sau.',
    RATE_LIMIT_EXCEEDED: 'Rất xin lỗi, hệ thống đã đạt giới hạn lượt hỏi trong ngày/tháng. Vui lòng thử lại sau.',
    BLOCKED_CONTENT: 'Câu hỏi này không phù hợp. Vui lòng hỏi về các quy định pháp luật, xuất nhập cảnh hoặc thủ tục hành chính.',
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
const isLocalHost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

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
    setTimeout(() => input?.focus(), 120);
}

function closeChatWindow() {
    const { toggle, window: chatWindow } = getChatElements();
    if (!toggle || !chatWindow) return;
    chatWindow.classList.remove('ai-chat-window--visible');
    chatWindow.classList.add('ai-chat-window--hidden');
    toggle.setAttribute('aria-expanded', 'false');
    chatWindow.setAttribute('aria-hidden', 'true');
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
    avatar.src = 'icon.png';
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

    sources.forEach(source => {
        const chip = document.createElement('span');
        chip.className = 'ai-chat-source-chip';
        chip.textContent = source.article ? `${source.file} - ${source.article}` : source.file;
        sourceWrap.appendChild(chip);
    });

    bubble.appendChild(sourceWrap);
}

function appendNotice(bubble, text) {
    const notice = document.createElement('p');
    notice.className = 'ai-chat-notice';
    notice.textContent = text;
    bubble.appendChild(notice);
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
    if (isChatSending) return;
    if (!turnstileVerified || !turnstileToken) return;

    const { input, send } = getChatElements();
    if (!input) return;

    const text = input.value.trim();
    if (!text) return;

    isChatSending = true;
    appendUserMessage(text);
    input.value = '';
    input.disabled = true;
    if (send) {
        send.disabled = true;
        send.innerHTML = '<span class="ai-chat-send-spinner"></span>';
    }

    const { row, bubble, content } = appendAssistantShell();
    let rawText = '';
    let firstChunk = true;
    let renderTimer = null;

    try {
        const result = await window.GeminiAI.stream(text, chatHistory, (chunkText) => {
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
        });

        if (renderTimer) clearTimeout(renderTimer);

        if (result.ok) {
            chatHistory = result.history || chatHistory;
            renderMarkdown(result.fullText || rawText, content);
            appendActionBar(bubble, result.fullText || rawText);
            appendSources(bubble, result.sources);
            if (result.truncated) appendNotice(bubble, CHATBOT_TEXT.truncated);
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
        bubble.classList.add('ai-chat-bubble--error');
        content.textContent = CHATBOT_ERROR_MESSAGES.DEFAULT;
        appendNotice(bubble, error.message || '');
    } finally {
        await refreshTurnstileAfterRequest(input, send);
        isChatSending = false;
    }
}

async function refreshTurnstileAfterRequest(input, send) {
    if (isLocalHost) {
        turnstileToken = 'localhost-bypass';
        turnstileVerified = true;
        window._turnstileToken = turnstileToken;
        setChatInputEnabled(true);
        if (send) send.innerHTML = '<span class="material-symbols-outlined">send</span>';
        input?.focus();
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
                input?.focus();
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
        }
    });
    input?.addEventListener('keydown', handleChatEnter);
    const { send } = getChatElements();
    send?.addEventListener('click', handleChatSend);
    setChatInputEnabled(isLocalHost, isLocalHost ? CHATBOT_TEXT.placeholder : CHATBOT_TEXT.captchaPlaceholder);

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

document.addEventListener('DOMContentLoaded', initChatbotWidget);
