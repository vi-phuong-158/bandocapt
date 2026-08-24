const assert = require('node:assert/strict');
const test = require('node:test');

const { normalizeApprovedImageUrl } = require('../js/staff-image');

test('normalizes approved Drive file, open, and existing uc URLs to the deterministic image delivery URL', () => {
    const expected = 'https://lh3.googleusercontent.com/d/AbC_123-xyz=w1000';
    assert.equal(normalizeApprovedImageUrl('https://drive.google.com/file/d/AbC_123-xyz/view'), expected);
    assert.equal(normalizeApprovedImageUrl('https://drive.google.com/open?id=AbC_123-xyz'), expected);
    assert.equal(normalizeApprovedImageUrl('https://drive.google.com/uc?export=view&id=AbC_123-xyz'), expected);
});

test('accepts an approved googleusercontent delivery URL but rejects malformed, HTTP, unknown, and suffix-confusion hosts', () => {
    const direct = 'https://lh3.googleusercontent.com/d/AbC_123-xyz=w1000';
    assert.equal(normalizeApprovedImageUrl(direct), direct);
    for (const value of [
        '',
        'not a URL',
        'http://drive.google.com/file/d/AbC_123-xyz/view',
        'https://example.test/image.jpg',
        'https://googleusercontent.com.attacker.example/d/AbC_123-xyz=w1000',
        'https://drive.google.com.attacker.example/file/d/AbC_123-xyz/view',
        'https://drive.google.com/file/d//view',
        'https://drive.google.com/open',
        'https://drive.google.com/uc?export=view',
    ]) assert.equal(normalizeApprovedImageUrl(value), '', value);
});

test('does not broaden the approved image contract to credentials, ports, fragments, or private staging fields', () => {
    assert.equal(normalizeApprovedImageUrl('https://user:pass@drive.google.com/file/d/AbC_123-xyz/view'), '');
    assert.equal(normalizeApprovedImageUrl('https://drive.google.com:444/file/d/AbC_123-xyz/view'), '');
    assert.equal(normalizeApprovedImageUrl('https://lh3.googleusercontent.com/d/AbC_123-xyz=w1000#private'), '');
    assert.equal(normalizeApprovedImageUrl('private-file-id'), '');
});
