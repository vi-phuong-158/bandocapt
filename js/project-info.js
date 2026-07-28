(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', () => {
        const btn = document.getElementById('project-info-btn');
        const modal = document.getElementById('project-info-modal');
        const backdrop = document.getElementById('project-info-backdrop');
        const panel = document.getElementById('project-info-panel');
        const closeBtn = document.getElementById('project-info-close-btn');

        if (!btn || !modal || !backdrop || !panel || !closeBtn) return;

        let closeTimeoutId = null;

        btn.setAttribute('aria-haspopup', 'dialog');
        btn.setAttribute('aria-expanded', 'false');
        modal.setAttribute('aria-hidden', 'true');

        function getFocusableElements() {
            return Array.from(
                panel.querySelectorAll(
                    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
                )
            ).filter(el => el.offsetWidth > 0 || el.offsetHeight > 0 || el === closeBtn);
        }

        function openModal() {
            if (closeTimeoutId) {
                clearTimeout(closeTimeoutId);
                closeTimeoutId = null;
            }

            modal.classList.remove('hidden');
            void modal.offsetWidth;

            btn.setAttribute('aria-expanded', 'true');
            modal.setAttribute('aria-hidden', 'false');

            backdrop.classList.add('opacity-100');
            backdrop.classList.remove('opacity-0');

            panel.classList.remove('translate-y-full', 'md:translate-y-4', 'md:scale-95', 'opacity-0');
            panel.classList.add('translate-y-0', 'md:translate-y-0', 'md:scale-100', 'opacity-100');

            closeBtn.focus();

            document.addEventListener('keydown', handleKeydown);
        }

        function closeModal() {
            if (closeTimeoutId) {
                clearTimeout(closeTimeoutId);
            }

            btn.setAttribute('aria-expanded', 'false');
            modal.setAttribute('aria-hidden', 'true');

            backdrop.classList.remove('opacity-100');
            backdrop.classList.add('opacity-0');

            panel.classList.remove('translate-y-0', 'md:translate-y-0', 'md:scale-100', 'opacity-100');
            panel.classList.add('translate-y-full', 'md:translate-y-4', 'md:scale-95', 'opacity-0');

            document.removeEventListener('keydown', handleKeydown);

            closeTimeoutId = setTimeout(() => {
                modal.classList.add('hidden');
                closeTimeoutId = null;
            }, 300);

            btn.focus();
        }

        function handleKeydown(e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                closeModal();
                return;
            }

            if (e.key === 'Tab') {
                const focusables = getFocusableElements();
                if (focusables.length === 0) return;

                const first = focusables[0];
                const last = focusables[focusables.length - 1];

                if (e.shiftKey) {
                    if (document.activeElement === first || !panel.contains(document.activeElement)) {
                        e.preventDefault();
                        last.focus();
                    }
                } else {
                    if (document.activeElement === last || !panel.contains(document.activeElement)) {
                        e.preventDefault();
                        first.focus();
                    }
                }
            }
        }

        btn.addEventListener('click', openModal);
        closeBtn.addEventListener('click', closeModal);
        backdrop.addEventListener('click', closeModal);
    });
})();
