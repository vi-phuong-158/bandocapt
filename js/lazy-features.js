(function initLazyFeatures(global) {
    'use strict';

    const scripts = new Map();
    let chatPromise = null;
    let catalogPromise = null;

    let chatState = 'IDLE';

    function showLoadError(tab) {
        let notice = document.getElementById('lazy-feature-error');
        if (!notice) {
            notice = document.createElement('div');
            notice.id = 'lazy-feature-error';
            notice.setAttribute('role', 'alert');
            notice.className = 'lazy-feature-error';
            document.body.appendChild(notice);
        }
        notice.innerHTML = '';
        const textSpan = document.createElement('span');
        textSpan.textContent = 'Chưa tải được tính năng. Vui lòng kiểm tra kết nối rồi bấm lại để thử.';
        notice.appendChild(textSpan);

        if (tab) {
            const retryBtn = document.createElement('button');
            retryBtn.type = 'button';
            retryBtn.className = 'lazy-feature-retry-btn';
            retryBtn.textContent = 'Thử lại';
            retryBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                notice.remove();
                activateFeature(tab).catch(err => {
                    console.error('[lazy-features retry]', err);
                    showLoadError(tab);
                });
            });
            notice.appendChild(retryBtn);
        }

        clearTimeout(notice._dismissTimer);
        notice._dismissTimer = setTimeout(() => notice.remove(), 7000);
    }

    function loadScript(src, options = {}) {
        if (scripts.has(src)) return scripts.get(src);
        const timeoutMs = options.timeout || 5000;
        const promise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            if (options.integrity) script.integrity = options.integrity;
            if (options.crossOrigin) script.crossOrigin = options.crossOrigin;

            let timer = null;
            const cleanup = () => {
                if (timer) clearTimeout(timer);
                script.onload = null;
                script.onerror = null;
            };

            script.onload = () => {
                cleanup();
                resolve();
            };
            script.onerror = () => {
                cleanup();
                scripts.delete(src);
                script.remove();
                reject(new Error(`Không tải được ${src}`));
            };

            if (timeoutMs > 0) {
                timer = setTimeout(() => {
                    cleanup();
                    scripts.delete(src);
                    script.remove();
                    reject(new Error(`Timeout tải ${src}`));
                }, timeoutMs);
            }

            document.head.appendChild(script);
        });
        scripts.set(src, promise);
        return promise;
    }

    function loadScriptWithFallback(primarySrc, fallbackSrc, options = {}) {
        return loadScript(primarySrc, options).catch(primaryErr => {
            console.warn(`[lazy-features] Lỗi tải CDN ${primarySrc}, dùng fallback local: ${fallbackSrc}`, primaryErr.message);
            if (!fallbackSrc) throw primaryErr;
            return loadScript(fallbackSrc, { timeout: 6000 });
        });
    }

    function loadCatalogModule() {
        if (!catalogPromise) {
            catalogPromise = loadScript('js/tthc-catalog.js', { timeout: 8000 }).catch(error => {
                catalogPromise = null;
                throw error;
            });
        }
        return catalogPromise;
    }

    function loadChatModule() {
        if (chatState === 'READY' || chatState === 'DEGRADED_READY') {
            return Promise.resolve();
        }
        if (!chatPromise) {
            chatState = 'LOADING';

            // marked: thử CDN marked@15.0.7 trước, fallback local js/vendor/marked.min.js sau.
            // Nếu cả hai đều lỗi trên mạng chập chờn: graceful degradation (chatbot.js có regex parser).
            const loadMarked = loadScriptWithFallback(
                'https://cdn.jsdelivr.net/npm/marked@15.0.7/marked.min.js',
                'js/vendor/marked.min.js',
                {
                    integrity: 'sha384-H+hy9ULve6xfxRkWIh/YOtvDdpXgV2fmAGQkIDTxIgZwNoaoBal14Di2YTMR6MzR',
                    crossOrigin: 'anonymous',
                    timeout: 4000,
                }
            ).catch(err => {
                console.warn('[lazy-features] Không tải được marked, dùng fallback định dạng regex:', err.message);
                return null;
            });

            // DOMPurify: thử CDN dompurify/3.4.7 trước, fallback local js/vendor/purify.min.js sau.
            // Nếu cả hai đều lỗi: graceful degradation (chatbot.js có textContent escaping).
            const loadPurify = loadScriptWithFallback(
                'https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.4.7/purify.min.js',
                'js/vendor/purify.min.js',
                {
                    integrity: 'sha384-C5g1ZoYBpnvKyArNZI21kaBEk3egHOYfHj/cUOHmyJ7CSDMyNMyM+STqfkBt8m2Y',
                    crossOrigin: 'anonymous',
                    timeout: 4000,
                }
            ).catch(err => {
                console.warn('[lazy-features] Không tải được DOMPurify, dùng fallback an toàn:', err.message);
                return null;
            });

            chatPromise = Promise.all([loadMarked, loadPurify])
                .then(() => {
                    const degraded = (!global.marked || typeof global.marked.parse !== 'function') ||
                                     (!global.DOMPurify || typeof global.DOMPurify.sanitize !== 'function');
                    chatState = degraded ? 'DEGRADED_READY' : 'READY';
                    return global.GeminiAI ? undefined : loadScript('js/gemini.js', { timeout: 8000 });
                })
                .then(() => (global.ChatbotUI && !global.ChatbotUI.__lazyProxy) ? undefined : loadScript('js/chatbot.js', { timeout: 8000 }))
                .then(() => {
                    // Turnstile tải ngầm, không chặn mở giao diện
                    loadScript('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad', { timeout: 6000 })
                        .catch(() => global.onTurnstileError?.());
                })
                .catch(error => {
                    chatState = 'ERROR';
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
            showLoadError(tab);
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
        getChatState: () => chatState,
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
