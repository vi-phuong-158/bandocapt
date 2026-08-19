(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.StaffGoogleSignIn = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function render({ clientId, element, onCredential, onError }) {
        if (!clientId || !element) {
            if (onError) onError(new Error('GOOGLE_SIGN_IN_UNAVAILABLE'));
            return false;
        }
        const draw = () => {
            if (!globalThis.google?.accounts?.id) return false;
            try {
                globalThis.google.accounts.id.initialize({ client_id: clientId, callback: response => {
                if (!response || typeof response.credential !== 'string') {
                    if (onError) onError(new Error('GOOGLE_TOKEN_INVALID'));
                    return;
                }
                onCredential(response.credential);
                }});
                globalThis.google.accounts.id.renderButton(element, {
                type: 'standard',
                theme: 'outline',
                size: 'large',
                text: 'signin_with',
                shape: 'rectangular',
                width: Math.min(360, Math.max(240, element.clientWidth || 280)),
                });
                return true;
            } catch (error) {
                if (onError) onError(error);
                return true;
            }
        };
        if (draw()) return true;
        let attempts = 0;
        const retry = () => {
            if (draw() || attempts++ > 20) {
                if (attempts > 20 && onError) onError(new Error('GOOGLE_SIGN_IN_UNAVAILABLE'));
                return;
            }
            setTimeout(retry, 150);
        };
        setTimeout(retry, 0);
        return true;
    }

    return { render };
});
