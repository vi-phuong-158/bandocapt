const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { MUTATION_TIMEOUT_MS } = require('../lib/staff-gateway-client');

const root = path.join(__dirname, '..');

test('static build emits the unhashed /can-bo entry and hashed portal assets', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dist', 'asset-manifest.json'), 'utf8'));
    const html = fs.readFileSync(path.join(root, 'dist', 'can-bo', 'index.html'), 'utf8');
    assert.equal(fs.existsSync(path.join(root, 'dist', 'can-bo', 'index.html')), true);
    for (const source of ['styles/staff-portal.css', 'js/staff-api-client.js', 'js/staff-google-signin.js', 'js/staff-image.js', 'js/staff-portal.js']) {
        assert.match(manifest[source], /\.[0-9a-f]{10}\./, source);
        assert.match(html, new RegExp(manifest[source].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), source);
        assert.equal(fs.existsSync(path.join(root, 'dist', manifest[source])), true);
    }
    assert.match(html, /https:\/\/accounts\.google\.com\/gsi\/client/);
});

test('portal CSP is route-specific and the generic CSP excludes /can-bo', () => {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
    const portalRules = config.headers.filter(rule => rule.source === '/can-bo' || rule.source === '/can-bo/(.*)');
    assert.equal(portalRules.length, 2);
    const portalHeaders = portalRules.flatMap(rule => rule.headers);
    const csp = portalHeaders.find(header => header.key === 'Content-Security-Policy').value;
    assert.match(csp, /accounts\.google\.com\/gsi\/client/);
    assert.match(csp, /frame-src https:\/\/accounts\.google\.com\/gsi\//);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.equal(portalHeaders.find(header => header.key === 'Cross-Origin-Opener-Policy').value, 'same-origin-allow-popups');
    const generic = config.headers.find(rule => rule.source.startsWith('/((?!'));
    assert.match(generic.source, /can-bo/);
});

test('Vercel function maxDuration for staff mutation routes stays above the Gateway mutation timeout', () => {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
    for (const route of ['api/staff/requests.js', 'api/staff/verification.js']) {
        const maxDuration = config.functions[route]?.maxDuration;
        assert.equal(typeof maxDuration, 'number', `${route} must declare an explicit maxDuration`);
        assert.ok(maxDuration * 1000 > MUTATION_TIMEOUT_MS, `${route} maxDuration must leave margin over MUTATION_TIMEOUT_MS`);
    }
});
