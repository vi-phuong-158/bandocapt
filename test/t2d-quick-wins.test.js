'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');

test('T2D-1: avatar giao dien dung ban WebP nhe, kich thuoc co dinh', async () => {
    const avatarPath = path.join(ROOT, 'assets', 'icon-128.webp');
    const metadata = await sharp(avatarPath).metadata();
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const chatbot = fs.readFileSync(path.join(ROOT, 'js', 'chatbot.js'), 'utf8');

    assert.ok(fs.statSync(avatarPath).size <= 80 * 1024);
    assert.equal(metadata.width, 128);
    assert.equal(metadata.height, 128);
    assert.match(html, /assets\/icon-128\.webp/);
    assert.doesNotMatch(html, /assets\/icon\.png/);
    assert.match(chatbot, /assets\/icon-128\.webp/);
});

test('T2D-2: chi muc TTHC nhe hon catalog va khong chua noi dung chi tiet', () => {
    const catalogPath = path.join(ROOT, 'data', 'tthc-catalog.json');
    const indexPath = path.join(ROOT, 'data', 'tthc-index.json');
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    const catalogModule = fs.readFileSync(path.join(ROOT, 'js', 'tthc-catalog.js'), 'utf8');

    assert.ok(fs.statSync(indexPath).size < fs.statSync(catalogPath).size / 10);
    assert.ok(index.procedures.length > 0);
    for (const procedure of index.procedures) {
        assert.deepEqual(Object.keys(procedure).sort(), ['aliases', 'procedure_id', 'title']);
        assert.equal(typeof procedure.procedure_id, 'string');
        assert.equal(typeof procedure.title, 'string');
        assert.ok(Array.isArray(procedure.aliases));
    }
    assert.match(catalogModule, /ensureCatalogIndexLoaded/);
    assert.match(catalogModule, /preload:\s*\(\)\s*=>\s*ensureCatalogIndexLoaded/);
});

test('T2D-3: cac module nang chi tai khi nguoi dung kich hoat tinh nang', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const loader = fs.readFileSync(path.join(ROOT, 'js', 'lazy-features.js'), 'utf8');
    const styles = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');

    assert.match(html, /js\/lazy-features\.js/);
    assert.doesNotMatch(html, /<script[^>]+js\/chatbot\.js/);
    assert.doesNotMatch(html, /<script[^>]+js\/tthc-catalog\.js/);
    assert.match(loader, /marked@15\.0\.7/);
    assert.match(loader, /dompurify\/3\.4\.7/);
    assert.match(loader, /js\/chatbot\.js/);
    assert.match(loader, /js\/tthc-catalog\.js/);
    assert.match(loader, /turnstile\/v0\/api\.js/);
    assert.match(loader, /lazy-feature-error/);
    assert.match(loader, /bấm lại để thử/);
    assert.match(styles, /\.lazy-feature-error[\s\S]*var\(--warn-bg\)/);
});

test('T2D-4: static build tao URL co content hash va cache headers phu hop', () => {
    const { contentHash, hashedRelativePath, replaceStaticReferences } = require('../scripts/build-static');
    const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));

    assert.equal(contentHash('abc'), contentHash('abc'));
    assert.notEqual(contentHash('abc'), contentHash('abcd'));
    assert.match(hashedRelativePath('js/example.js', Buffer.from('abc')), /^js\/example\.[a-f0-9]{10}\.js$/);
    assert.equal(
        replaceStaticReferences('js/location-data.js data.js', new Map([
            ['data.js', 'data.hash.js'],
            ['js/location-data.js', 'js/location-data.hash.js'],
        ])),
        'js/location-data.hash.js data.hash.js'
    );
    assert.equal(
        replaceStaticReferences('metadata.js data.js', new Map([['data.js', 'data.hash.js']])),
        'metadata.js data.hash.js'
    );
    assert.ok(vercel.headers.some(item => item.source === '/assets/(.*)' && /immutable/.test(item.headers[0].value)));
    assert.ok(vercel.headers.some(item => item.source === '/data/(.*)' && /immutable/.test(item.headers[0].value)));
    assert.ok(vercel.headers.some(item => item.source === '/asset-manifest.json' && /no-cache/.test(item.headers[0].value)));
    assert.ok(vercel.headers.every(item => !item.source.includes('|')));
});
