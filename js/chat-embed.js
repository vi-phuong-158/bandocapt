(function initChatEmbed(global) {
    'use strict';

    const ALLOWED_CLIENT = 'capphutho';
    const ALLOWED_PARENT_ORIGIN = 'https://capphutho.vercel.app';
    const TURNSTILE_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad';
    const MARKED_URL = 'https://cdn.jsdelivr.net/npm/marked@15.0.7/marked.min.js';
    const DOMPURIFY_URL = 'https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.4.7/purify.min.js';
    const scripts = new Map();

    function parseEmbedConfig(search = global.location.search) {
        const params = new URLSearchParams(search);
        return params.get('client') === ALLOWED_CLIENT ? { client: ALLOWED_CLIENT } : null;
    }

    function loadScript(src, options = {}, isReady) {
        if (isReady && isReady()) return Promise.resolve();
        if (scripts.has(src)) return scripts.get(src);

        const promise = new Promise((resolve, reject) => {
            const script = global.document.createElement('script');
            script.src = src;
            script.async = true;
            if (options.integrity) script.integrity = options.integrity;
            if (options.crossOrigin) script.crossOrigin = options.crossOrigin;
            script.onload = resolve;
            script.onerror = () => {
                scripts.delete(src);
                reject(new Error('MODULE_LOAD_FAILED'));
            };
            global.document.head.appendChild(script);
        });
        scripts.set(src, promise);
        return promise;
    }

    function getVerifiedParentOrigin(config) {
        if (!config || global.parent === global) return null;
        try {
            return new URL(global.document.referrer).origin === ALLOWED_PARENT_ORIGIN
                ? ALLOWED_PARENT_ORIGIN
                : null;
        } catch (_) {
            return null;
        }
    }

    function notifyParent(config, type, payload) {
        const parentOrigin = getVerifiedParentOrigin(config);
        if (!parentOrigin) return;
        global.parent.postMessage({ type, version: 1, payload }, parentOrigin);
    }

    function showStatus(message) {
        const status = global.document.getElementById('chatEmbedStatus');
        if (!status) return;
        status.textContent = message;
        status.hidden = false;
    }

    function notifyError(config, code, message) {
        showStatus(message);
        notifyParent(config, 'BANDOCAPT_CHAT_ERROR', { code });
    }

    function waitForCaptcha(config) {
        let completed = false;
        const complete = (type, payload) => {
            if (completed) return;
            completed = true;
            global.clearInterval(timer);
            global.clearTimeout(timeout);
            notifyParent(config, type, payload);
        };
        const timer = global.setInterval(() => {
            const input = global.document.getElementById('fakeChatInput');
            if (global._turnstileToken && input && !input.disabled) {
                complete('BANDOCAPT_CHAT_CAPTCHA_READY');
            }
        }, 200);
        const timeout = global.setTimeout(() => {
            if (completed) return;
            completed = true;
            global.clearInterval(timer);
            notifyError(config, 'CAPTCHA_TIMEOUT', 'Chưa thể xác minh bảo mật. Vui lòng tải lại trang để thử lại.');
        }, 30000);
    }

    async function bootstrap() {
        const config = parseEmbedConfig();
        try {
            await loadScript(MARKED_URL, {
                integrity: 'sha384-H+hy9ULve6xfxRkWIh/YOtvDdpXgV2fmAGQkIDTxIgZwNoaoBal14Di2YTMR6MzR',
                crossOrigin: 'anonymous',
            }, () => Boolean(global.marked));
            await loadScript(DOMPURIFY_URL, {
                integrity: 'sha384-C5g1ZoYBpnvKyArNZI21kaBEk3egHOYfHj/cUOHmyJ7CSDMyNMyM+STqfkBt8m2Y',
                crossOrigin: 'anonymous',
            }, () => Boolean(global.DOMPurify));
            await loadScript('js/gemini.js', {}, () => Boolean(global.GeminiAI));
            await loadScript('js/chatbot.js', {}, () => Boolean(global.ChatbotUI));
            if (!global.ChatbotUI || typeof global.ChatbotUI.open !== 'function') throw new Error('CHAT_UI_UNAVAILABLE');
            global.ChatbotUI.open();
            notifyParent(config, 'BANDOCAPT_CHAT_READY', { client: config?.client || null });
        } catch (error) {
            global.console?.error?.('[chat-embed] bootstrap failed:', error.message);
            notifyError(config, 'BOOTSTRAP_FAILED', 'Chưa tải được trợ lý. Vui lòng kiểm tra kết nối và thử lại.');
            return;
        }

        try {
            await loadScript(TURNSTILE_URL, {}, () => typeof global.turnstile !== 'undefined');
            waitForCaptcha(config);
        } catch (error) {
            global.console?.error?.('[chat-embed] turnstile load failed:', error.message);
            notifyError(config, 'TURNSTILE_LOAD_FAILED', 'Chưa tải được xác minh bảo mật. Bạn vẫn có thể xem nội dung hội thoại, vui lòng thử lại sau.');
        }
    }

    global.ChatEmbedHost = {
        parseEmbedConfig,
        ALLOWED_PARENT_ORIGIN,
        bootstrap,
    };

    if (global.document && typeof global.document.createElement === 'function' && !global.__CHAT_EMBED_DISABLE_AUTO_BOOTSTRAP) {
        bootstrap().catch(() => {
            showStatus('Chưa tải được trợ lý. Vui lòng kiểm tra kết nối và thử lại.');
        });
    }
})(window);
