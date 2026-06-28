const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
const files = [
    'index.html',
    'app.js',
    'data.js',
    'output.css',
    'tokens.css',
    'styles.css',
    'assets/logo.png',
    'assets/icon.png',
    'js/chatbot.js',
    'js/gemini.js',
    'js/location-data.js',
];

fs.rmSync(output, { recursive: true, force: true });
for (const relativePath of files) {
    const source = path.join(root, relativePath);
    if (!fs.existsSync(source)) throw new Error(`Missing build input: ${relativePath}`);

    const destination = path.join(output, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
}

console.log(`Static artifact created: ${files.length} files in dist/`);
