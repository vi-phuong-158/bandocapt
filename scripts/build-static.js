'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
const files = [
    'index.html',
    'app.js',
    'data.js',
    'data/tthc-catalog.json',
    'data/tthc-index.json',
    'output.css',
    'tokens.css',
    'styles.css',
    'assets/logo.png',
    'assets/icon-128.webp',
    'assets/icon-bottom.png',
    'assets/icon-bando.png',
    'assets/icon-thutuc.png',
    'js/chatbot.js',
    'js/app-navigation.js',
    'js/gemini.js',
    'js/lazy-features.js',
    'js/location-data.js',
    'js/tthc-catalog.js',
];

const TEXT_EXTENSIONS = new Set(['.css', '.html', '.js', '.json']);

function contentHash(content) {
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 10);
}

function hashedRelativePath(relativePath, content) {
    const parsed = path.posix.parse(relativePath.replaceAll('\\', '/'));
    return path.posix.join(parsed.dir, `${parsed.name}.${contentHash(content)}${parsed.ext}`);
}

function replaceStaticReferences(content, manifest) {
    let rewritten = content;
    const entries = [...manifest.entries()].sort(([a], [b]) => b.length - a.length);
    for (const [source, hashed] of entries) {
        const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const referencePattern = new RegExp(`(?<![A-Za-z0-9_-])${escaped}(?![A-Za-z0-9_-])`, 'g');
        rewritten = rewritten.replace(referencePattern, hashed);
    }
    return rewritten;
}

function buildStatic() {
    const sources = new Map();
    for (const relativePath of files) {
        const source = path.join(root, relativePath);
        if (!fs.existsSync(source)) throw new Error(`Missing build input: ${relativePath}`);
        sources.set(relativePath, fs.readFileSync(source));
    }

    let manifest = new Map();
    for (const [relativePath, content] of sources) {
        if (relativePath === 'index.html') continue;
        manifest.set(relativePath, hashedRelativePath(relativePath, content));
    }

    // Tên file JS/CSS phải phản ánh cả URL hash của dependency mà nó tham chiếu. Lặp đến khi
    // manifest ổn định để một thay đổi ở data/asset cũng đổi tên file loader/module liên quan.
    for (let pass = 0; pass < files.length; pass++) {
        const nextManifest = new Map();
        for (const [relativePath, sourceContent] of sources) {
            if (relativePath === 'index.html') continue;
            const content = TEXT_EXTENSIONS.has(path.extname(relativePath))
                ? replaceStaticReferences(sourceContent.toString('utf8'), manifest)
                : sourceContent;
            nextManifest.set(relativePath, hashedRelativePath(relativePath, content));
        }
        if (JSON.stringify([...nextManifest]) === JSON.stringify([...manifest])) break;
        manifest = nextManifest;
    }

    fs.rmSync(output, { recursive: true, force: true });
    for (const [relativePath, sourceContent] of sources) {
        const destinationRelative = relativePath === 'index.html' ? relativePath : manifest.get(relativePath);
        const destination = path.join(output, destinationRelative);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        const extension = path.extname(relativePath);
        const content = TEXT_EXTENSIONS.has(extension)
            ? replaceStaticReferences(sourceContent.toString('utf8'), manifest)
            : sourceContent;
        fs.writeFileSync(destination, content);
    }

    fs.writeFileSync(
        path.join(output, 'asset-manifest.json'),
        JSON.stringify(Object.fromEntries(manifest), null, 2) + '\n',
        'utf8'
    );
    console.log(`Static artifact created: ${files.length} inputs, ${manifest.size} hashed assets in dist/`);
}

if (require.main === module) buildStatic();

module.exports = { buildStatic, contentHash, hashedRelativePath, replaceStaticReferences };
