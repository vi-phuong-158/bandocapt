const assert = require('node:assert/strict');
const test = require('node:test');

const {
    createStaffSession, verifyStaffSession, serializeStaffSessionCookie, clearStaffSessionCookie,
} = require('../lib/staff-session');
const { verifyCsrfRequest } = require('../lib/staff-csrf');
const { resolveStaffAllowedOrigins, assertStaffOrigin } = require('../lib/staff-origin');
const { publicErrorCode } = require('../lib/staff-api-errors');

const SECRET = 'synthetic-staff-session-secret-32-bytes';

test('signed session rejects tampering, expiry, unsupported version and wrong secret', () => {
    const now = 1_800_000_000_000;
    const token = createStaffSession({ sub: 'sub-a', email: 'staff@example.test', now }, SECRET);
    assert.equal(verifyStaffSession(token, SECRET, now).sub, 'sub-a');
    const [payload, signature] = token.split('.');
    const changed = Buffer.from(JSON.parse(Buffer.from(payload, 'base64url').toString()).email.replace('staff', 'other')).toString('base64url');
    assert.throws(() => verifyStaffSession(`${changed}.${signature}`, SECRET, now), /STAFF_SESSION_INVALID/);
    assert.throws(() => verifyStaffSession(token, 'wrong-secret-that-is-long-enough-123', now), /STAFF_SESSION_INVALID/);
    assert.throws(() => verifyStaffSession(token, SECRET, now + 8 * 60 * 60 * 1000 + 1), /STAFF_SESSION_INVALID/);
    assert.throws(() => verifyStaffSession(createStaffSession({ sub: 'sub-a', email: 'staff@example.test', now, ttlSeconds: 1 }, SECRET), SECRET, now + 2000), /STAFF_SESSION_INVALID/);
    assert.throws(() => verifyStaffSession('broken', SECRET, now), /STAFF_SESSION_INVALID/);
    assert.throws(() => createStaffSession({ sub: 'sub-a', email: 'staff@example.test' }, 'weak'), /STAFF_SESSION_CONFIG_INVALID/);
    assert.match(serializeStaffSessionCookie(token), /HttpOnly; Secure; SameSite=Strict/);
    assert.match(clearStaffSessionCookie(), /Max-Age=0/);
});

test('CSRF requires matching cookie and header', () => {
    const good = { headers: { cookie: 'staff_csrf=csrf123', 'x-staff-csrf': 'csrf123' } };
    assert.equal(verifyCsrfRequest(good), true);
    assert.throws(() => verifyCsrfRequest({ headers: {} }), /CSRF_TOKEN_MISSING/);
    assert.throws(() => verifyCsrfRequest({ headers: { cookie: 'staff_csrf=csrf123', 'x-staff-csrf': 'wrong' } }), /CSRF_TOKEN_INVALID/);
});

test('staff origins are exact and do not accept suffix tricks', () => {
    assert.deepEqual([...resolveStaffAllowedOrigins({ STAFF_ALLOWED_ORIGINS: 'https://a.test, https://b.test' })], ['https://a.test', 'https://b.test']);
    assert.equal(assertStaffOrigin({ headers: { origin: 'https://a.test' } }, { STAFF_ALLOWED_ORIGINS: 'https://a.test' }), 'https://a.test');
    assert.throws(() => assertStaffOrigin({ headers: { origin: 'https://a.test.attacker.com' } }, { STAFF_ALLOWED_ORIGINS: 'https://a.test' }), /STAFF_ORIGIN_REJECTED/);
    assert.throws(() => assertStaffOrigin({ headers: {} }, { STAFF_ALLOWED_ORIGINS: 'https://a.test' }), /STAFF_ORIGIN_REJECTED/);
});

test('staff API error mapping never exposes arbitrary internal codes', () => {
    assert.equal(publicErrorCode({ code: 'PRIVATE_STACK_TRACE_OR_SECRET' }), 'STAFF_REQUEST_FAILED');
    assert.equal(publicErrorCode({ code: 'IMAGE_ENCODING_INVALID' }), 'IMAGE_ENCODING_INVALID');
    assert.equal(publicErrorCode({ code: 'UNKNOWN_GATEWAY_CODE' }), 'STAFF_REQUEST_FAILED');
});
