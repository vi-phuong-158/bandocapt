(function initAppNavigation(global) {
    'use strict';

    const MOBILE_QUERY = '(max-width: 767px)';
    const VALID_TABS = new Set(['map', 'procedures', 'chat']);
    const surfaces = new Map();
    let activeTab = 'map';
    let switching = false;

    function isMobile() {
        return typeof global.matchMedia === 'function' && global.matchMedia(MOBILE_QUERY).matches;
    }

    function getButtons() {
        return Array.from(document.querySelectorAll('[data-app-tab]'));
    }

    function syncNavigation() {
        document.body.dataset.activeTab = activeTab;
        getButtons().forEach(button => {
            const selected = button.dataset.appTab === activeTab;
            if (selected) button.setAttribute('aria-current', 'page');
            else button.removeAttribute('aria-current');
        });
    }

    function markAiSeen() {
        document.body.classList.add('ai-nav-seen');
        try {
            global.localStorage.setItem('bandocapt.ai-nav-seen.v1', '1');
        } catch (_) {
            // Storage can be unavailable in private/locked-down browser contexts.
        }
    }

    function hasSeenAi() {
        try {
            return global.localStorage.getItem('bandocapt.ai-nav-seen.v1') === '1';
        } catch (_) {
            return false;
        }
    }

    function registerSurface(tab, handlers) {
        if (!VALID_TABS.has(tab)) throw new Error(`Unknown app tab: ${tab}`);
        surfaces.set(tab, {
            activate: typeof handlers?.activate === 'function' ? handlers.activate : () => {},
            deactivate: typeof handlers?.deactivate === 'function' ? handlers.deactivate : () => {},
        });
    }

    function activate(tab, payload = {}) {
        if (!VALID_TABS.has(tab) || !isMobile() || switching) return false;

        switching = true;
        try {
            surfaces.forEach((surface, surfaceTab) => {
                if (surfaceTab !== tab) surface.deactivate({ nextTab: tab });
            });
            activeTab = tab;
            syncNavigation();
            surfaces.get(tab)?.activate(payload);
            if (tab === 'chat') markAiSeen();
        } finally {
            switching = false;
        }
        return true;
    }

    function bindNavigation() {
        if (hasSeenAi()) document.body.classList.add('ai-nav-seen');
        getButtons().forEach(button => {
            button.addEventListener('click', () => activate(button.dataset.appTab));
        });
        syncNavigation();
        queueMicrotask(() => activate('map', { restoreFocus: false }));
    }

    global.AppNavigation = {
        activate,
        getActiveTab: () => activeTab,
        isMobile,
        registerSurface,
    };

    document.addEventListener('DOMContentLoaded', bindNavigation);
})(window);
