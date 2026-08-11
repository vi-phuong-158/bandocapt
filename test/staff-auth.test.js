const assert = require('node:assert/strict');
const test = require('node:test');

const { verifyGoogleIdToken } = require('../lib/staff-auth');

function verifierFor(payload) {
    return async (credential, audience) => {
        assert.equal(credential, 'synthetic-google-token');
        assert.equal(audience, 'synthetic-client-id.apps.googleusercontent.com');
        return payload;
    };
}

const validPayload = {
    sub: 'google-sub-1', email: 'Staff@Example.Test', email_verified: true, iss: 'https://accounts.google.com',
    aud: 'synthetic-client-id.apps.googleusercontent.com', exp: Math.floor(Date.now() / 1000) + 3600,
};

test('Google ID token verification returns only verified identity claims', async () => {
    const identity = await verifyGoogleIdToken({
        credential: 'synthetic-google-token',
        clientId: 'synthetic-client-id.apps.googleusercontent.com',
        verifier: verifierFor(validPayload),
    });
    assert.deepEqual(identity, { sub: 'google-sub-1', email: 'staff@example.test' });
});

test('Google ID token verification rejects invalid audience/config, issuer and email verification', async () => {
    await assert.rejects(
        verifyGoogleIdToken({ credential: 'synthetic-google-token', clientId: '', verifier: verifierFor(validPayload) }),
        /STAFF_AUTH_CONFIG_INVALID/,
    );
    await assert.rejects(
        verifyGoogleIdToken({ credential: 'synthetic-google-token', clientId: 'client', verifier: verifierFor({ ...validPayload, iss: 'https://attacker.test' }) }),
        /GOOGLE_TOKEN_INVALID/,
    );
    await assert.rejects(
        verifyGoogleIdToken({ credential: 'synthetic-google-token', clientId: 'client', verifier: verifierFor({ ...validPayload, email_verified: false }) }),
        /GOOGLE_TOKEN_INVALID/,
    );
    await assert.rejects(
        verifyGoogleIdToken({ credential: 'synthetic-google-token', clientId: 'client', verifier: verifierFor({ ...validPayload, aud: 'wrong-client' }) }),
        /GOOGLE_TOKEN_INVALID/,
    );
    await assert.rejects(
        verifyGoogleIdToken({ credential: 'synthetic-google-token', clientId: 'client', verifier: verifierFor({ ...validPayload, exp: 1 }) }),
        /GOOGLE_TOKEN_INVALID/,
    );
    await assert.rejects(
        verifyGoogleIdToken({ credential: 'synthetic-google-token', clientId: 'client', verifier: async () => { throw new Error('audience mismatch'); } }),
        /GOOGLE_TOKEN_INVALID/,
    );
});
