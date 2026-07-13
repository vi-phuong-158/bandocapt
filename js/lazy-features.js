(function initLazyFeatures(global) {
    'use strict';

    const scripts = new Map();
    let chatPromise = null;
    let catalogPromise = null;

    function showLoadError() {
        let notice = document.getElementById('lazy-feature-error');
        if (!notice) {
            notice = document.createElement('div');
            notice.id = 'lazy-feature-error';
            notice.setAttribute('role', 'alert');
            notice.className = 'lazy-feature-error';
            document.body.appendChild(notice);
        }
        notice.textContent = 'Chưa tải được tính năng. Vui lòng kiểm tra kết nối rồi bấm lại để thử.';
        clearTimeout(notice._dismissTimer);
        notice._dismissTimer = setTimeout(() => notice.remove(), 6000);
    }

    function loadScript(src, options = {}) {
        if (scripts.has(src)) return scripts.get(src);
        const promise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            if (options.integrity) script.integrity = options.integrity;
            if (options.crossOrigin) script.crossOrigin = options.crossOrigin;
            script.onload = () => resolve();
            script.onerror = () => {
                scripts.delete(src);
                reject(new Error(`Không tải được ${src}`));
            };
            document.head.appendChild(script);
        });
        scripts.set(src, promise);
        return promise;
    }

    function loadCatalogModule() {
        if (!catalogPromise) {
            catalogPromise = loadScript('js/tthc-catalog.js').catch(error => {
                catalogPromise = null;
                throw error;
            });
        }
        return catalogPromise;
    }

    function loadChatModule() {
        if (!chatPromise) {
            chatPromise = Promise.all([
                loadScript('https://cdn.jsdelivr.net/npm/marked@15.0.7/marked.min.js', {
                    integrity: 'sha384-H+hy9ULve6xfxRkWIh/YOtvDdpXgV2fmAGQkIDTxIgZwNoaoBal14Di2YTMR6MzR',
                    crossOrigin: 'anonymous',
                }),
                loadScript('https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.4.7/purify.min.js', {
                    integrity: 'sha384-6gdBb4YMPz19eGx6Wf1vmT47Jh7wZArqJc84JuA3BRnoZQwt/X5qLfIip51LgpB/',
                    crossOrigin: 'anonymous',
                }),
            ])
                .then(() => global.GeminiAI ? undefined : loadScript('js/gemini.js'))
                .then(() => loadScript('js/chatbot.js'))
                .then(() => {
                    loadScript('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad')
                        .catch(() => global.onTurnstileError?.());
                })
                .catch(error => {
                    chatPromise = null;
                    throw error;
                });
        }
        return chatPromise;
    }

    async function activateFeature(tab) {
        if (tab === 'chat') {
            await loadChatModule();
            if (global.AppNavigation?.isMobile?.()) global.AppNavigation.activate('chat');
            else global.ChatbotUI?.open?.();
            return;
        }

        await loadCatalogModule();
        if (global.AppNavigation?.isMobile?.()) global.AppNavigation.activate('procedures');
        else global.TthcCatalog?.open?.();
    }

    function getFeatureIntent(target) {
        const trigger = target.closest?.('#ai-chat-toggle-btn, #tthc-catalog-toggle-btn, [data-app-tab="chat"], [data-app-tab="procedures"]');
        if (!trigger) return null;
        if (trigger.id === 'ai-chat-toggle-btn' || trigger.dataset.appTab === 'chat') return 'chat';
        return 'procedures';
    }

    document.addEventListener('click', event => {
        const tab = getFeatureIntent(event.target);
        const loadedModule = tab === 'chat' ? global.ChatbotUI : global.TthcCatalog;
        if (!tab || (loadedModule && !loadedModule.__lazyProxy)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        activateFeature(tab).catch(error => {
            console.error('[lazy-features]', error.message);
            showLoadError();
        });
    }, true);

    document.addEventListener('pointerover', event => {
        const tab = getFeatureIntent(event.target);
        if (tab === 'chat') loadChatModule().catch(() => {});
        if (tab === 'procedures') loadCatalogModule().catch(() => {});
    }, { capture: true, passive: true });

    global.LazyFeatures = {
        loadCatalogModule,
        loadChatModule,
    };

    // Giữ API deep-link có sẵn ngay từ first paint nhưng chỉ tải catalog khi API được gọi.
    // Module catalog thay proxy này bằng API đầy đủ ngay khi nó được nạp.
    global.TthcCatalog = global.TthcCatalog || {
        __lazyProxy: true,
        open: () => loadCatalogModule().then(() => global.TthcCatalog.open()),
        openProcedure: procedureId => loadCatalogModule().then(() => global.TthcCatalog.openProcedure(procedureId)),
        openByTitle: title => loadCatalogModule().then(() => global.TthcCatalog.openByTitle(title)),
        findByTitle: title => loadCatalogModule().then(() => global.TthcCatalog.findByTitle(title)),
        resolveProcedureId: (procedureId, title) => loadCatalogModule().then(() => global.TthcCatalog.resolveProcedureId(procedureId, title)),
        preload: () => loadCatalogModule().then(() => global.TthcCatalog.preload()),
        close: () => loadCatalogModule().then(() => global.TthcCatalog.close()),
    };
})(window);
