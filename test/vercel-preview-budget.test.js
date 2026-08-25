'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');

function listJavaScriptFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const entryPath = path.join(directory, entry.name);
        return entry.isDirectory() ? listJavaScriptFiles(entryPath) : entry.name.endsWith('.js') ? [entryPath] : [];
    });
}

test('Vercel Preview stays within the Hobby serverless-function budget', () => {
    const apiFiles = listJavaScriptFiles(path.join(root, 'api'));
    assert.ok(apiFiles.length <= 12, `expected at most 12 API functions, found ${apiFiles.length}`);
    assert.ok(apiFiles.some(file => file.endsWith(path.join('api', 'location-contributions.js'))));

    const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
    assert.deepEqual(vercel.rewrites, [{
        source: '/api/staff/auth/config',
        destination: '/api/staff/auth/csrf?__staff_auth_route=config',
    }]);
});
