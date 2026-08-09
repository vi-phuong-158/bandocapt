'use strict';

function resolvePublicSpreadsheetId(env = process.env) {
    const publicId = String(env.PUBLIC_LOCATION_SPREADSHEET_ID || '').trim();
    const googleId = String(env.GOOGLE_SHEET_ID || '').trim();
    if (publicId && googleId && publicId !== googleId) {
        throw new Error('PUBLIC_LOCATION_SPREADSHEET_ID_MISMATCH');
    }
    const resolved = publicId || googleId;
    if (!resolved) throw new Error('GOOGLE_SHEET_ID_MISSING');
    return resolved;
}

module.exports = { resolvePublicSpreadsheetId };
