(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.LocationAdminReviewContainer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function text(value) { return String(value == null ? '' : value).trim(); }

    function containerError(code) {
        const error = new Error(code);
        error.code = code;
        return error;
    }

    // A menu action must execute only in the configured private workbook.  This is deliberately
    // independent from the fact that a bound script normally opens in its container: the guard
    // remains fail-closed if a copied/legacy project is accidentally used.
    function requireActivePrivateWorkbook({ activeSpreadsheetId, configuredPrivateWorkbookId } = {}) {
        const activeId = text(activeSpreadsheetId);
        const privateId = text(configuredPrivateWorkbookId);
        if (!privateId) throw containerError('ADMIN_REVIEW_PRIVATE_WORKBOOK_MISSING');
        if (!activeId || activeId !== privateId) throw containerError('ADMIN_REVIEW_ACTIVE_WORKBOOK_MISMATCH');
        return activeId;
    }

    return { requireActivePrivateWorkbook };
});
