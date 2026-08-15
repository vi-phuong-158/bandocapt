const assert = require('node:assert/strict');
const test = require('node:test');

const { verifyGoogleIdToken } = require('../lib/staff-auth');

function verifierFor(payload, expectedAudience) {
    return async (credential, audience) => {
        assert.equal(credential, 'synthetic-google-token');
        if (expectedAudience) assert.equal(audience, expectedAudience);
        return payload;
    };
}

function validPayload(audience = 'synthetic-client-id.apps.googleusercontent.com') {
    return {
    sub: 'google-sub-1', email: 'Staff@Example.Test', email_verified: true, iss: 'https://accounts.google.com',
        aud: audience, exp: Math.floor(Date.now() / 1000) + 3600, name: '  Cán Bộ A  ',
    };
}

test('Google ID token verification returns only verified identity claims, including a trimmed display name', async () => {
    const identity = await verifyGoogleIdToken({
        credential: 'synthetic-google-token',
        clientId: 'synthetic-client-id.apps.googleusercontent.com',
        verifier: verifierFor(validPayload(), 'synthetic-client-id.apps.googleusercontent.com'),
    });
    assert.deepEqual(identity, { sub: 'google-sub-1', email: 'staff@example.test', name: 'Cán Bộ A' });
});

test('Google ID token verification tolerates a missing display name claim', async () => {
    const identity = await verifyGoogleIdToken({
        credential: 'synthetic-google-token',
        clientId: 'client',
        verifier: verifierFor({ ...validPayload('client'), name: undefined }),
    });
    assert.equal(identity.name, '');
});

test('Google ID token verification bounds an oversized display name claim', async () => {
    const identity = await verifyGoogleIdToken({
        credential: 'synthetic-google-token',
        clientId: 'client',
        verifier: verifierFor({ ...validPayload('client'), name: 'A'.repeat(500) }),
    });
    assert.equal(identity.name.length, 200);
});

test('Google ID token verification rejects invalid audience/config, issuer and email verification', async () => {
    await assert.rejects(
        verifyGoogleIdToken({ credential: 'synthetic-google-token', clientId: '', verifier: verifierFor(validPayload()) }),
        /STAFF_AUTH_CONFIG_INVALID/,
    );
    await assert.rejects(
        verifyGoogleIdToken({ credential: 'synthetic-google-token', clientId: 'client', verifier: verifierFor({ ...validPayload('client'), iss: 'https://attacker.test' }) }),
        /GOOGLE_TOKEN_INVALID/,
    );
    await assert.rejects(
        verifyGoogleIdToken({ credential: 'synthetic-google-token', clientId: 'client', verifier: verifierFor({ ...validPayload('client'), email_verified: false }) }),
        /GOOGLE_TOKEN_INVALID/,
    );
    await assert.rejects(
        verifyGoogleIdToken({ credential: 'synthetic-google-token', clientId: 'client', verifier: verifierFor({ ...validPayload('client'), aud: 'wrong-client' }) }),
        /GOOGLE_TOKEN_INVALID/,
    );
    await assert.rejects(
        verifyGoogleIdToken({ credential: 'synthetic-google-token', clientId: 'client', verifier: verifierFor({ ...validPayload('client'), exp: 1 }) }),
        /GOOGLE_TOKEN_INVALID/,
    );
    await assert.rejects(
        verifyGoogleIdToken({ credential: 'synthetic-google-token', clientId: 'client', verifier: verifierFor({ ...validPayload('client'), sub: '' }) }),
        /GOOGLE_TOKEN_INVALID/,
    );
    await assert.rejects(
        verifyGoogleIdToken({ credential: 'synthetic-google-token', clientId: 'client', verifier: verifierFor({ ...validPayload('client'), email: '' }) }),
        /GOOGLE_TOKEN_INVALID/,
    );
    await assert.rejects(
        verifyGoogleIdToken({ credential: 'synthetic-google-token', clientId: 'client', verifier: async () => { throw new Error('audience mismatch'); } }),
        /GOOGLE_TOKEN_INVALID/,
    );
});
