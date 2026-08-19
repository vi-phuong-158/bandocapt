'use strict';

const { OAuth2Client } = require('google-auth-library');

function authError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
}

function requireGoogleClientId(clientId) {
    const value = String(clientId || '').trim();
    if (!value) throw authError('STAFF_AUTH_CONFIG_INVALID');
    return value;
}

// Google's ID token includes `name` under the default openid+profile scope the Sign-In button
// already requests; it is not re-verified beyond what verifyIdToken already checked (signature,
// issuer, audience, expiry). Trim/bound it defensively since it is still attacker-influenced text
// that ends up in a signed session and, eventually, an audit field.
function sanitizeDisplayName(value) {
    return String(value || '').trim().slice(0, 200);
}

async function verifyGoogleIdToken({ credential, clientId, verifier } = {}) {
    const audience = requireGoogleClientId(clientId);
    if (typeof credential !== 'string' || !credential || credential.length > 8192) throw authError('GOOGLE_TOKEN_INVALID');

    let payload;
    try {
        if (verifier) {
            const ticket = await verifier(credential, audience);
            payload = ticket?.getPayload ? ticket.getPayload() : ticket;
        } else {
            const client = new OAuth2Client(audience);
            const ticket = await client.verifyIdToken({ idToken: credential, audience });
            payload = ticket.getPayload();
        }
    } catch (_) {
        throw authError('GOOGLE_TOKEN_INVALID');
    }

    const issuer = String(payload?.iss || '');
    const audienceMatches = payload?.aud === audience || (Array.isArray(payload?.aud) && payload.aud.includes(audience));
    const expiry = Number(payload?.exp);
    if (!payload || !payload.sub || !payload.email || payload.email_verified !== true || !audienceMatches ||
        !Number.isFinite(expiry) || expiry <= Math.floor(Date.now() / 1000) ||
        !['accounts.google.com', 'https://accounts.google.com'].includes(issuer)) {
        throw authError('GOOGLE_TOKEN_INVALID');
    }
    return Object.freeze({ sub: String(payload.sub), email: String(payload.email).trim().toLowerCase(), name: sanitizeDisplayName(payload.name) });
}

module.exports = { verifyGoogleIdToken, requireGoogleClientId };
