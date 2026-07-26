'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const { buildStatic } = require('../scripts/build-static');

function loadEmbedHost({ search = '?client=capphutho', turnstileFails = false } = {}) {
    const source = fs.readFileSync(path.join(root, 'js/chat-embed.js'), 'utf8');
    const loaded = [];
    const messages = [];
    const intervals = [];
    const timeouts = [];
    const input = { disabled: true };
    const status = { hidden: true, textContent: '' };
    const sandbox = {
        __CHAT_EMBED_DISABLE_AUTO_BOOTSTRAP: true,
        location: { search },
        parent: { postMessage: (message, targetOrigin) => messages.push({ message, targetOrigin }) },
        document: {
            referrer: 'https://capphutho.vercel.app/embed',
            getElementById: id => ({ fakeChatInput: input, chatEmbedStatus: status }[id] || null),
            createElement: () => ({}),
            head: {
                appendChild(script) {
                    loaded.push({ src: script.src, integrity: script.integrity, crossOrigin: script.crossOrigin });
                    if (script.src.includes('marked')) sandbox.marked = {};
                    if (script.src.includes('purify')) sandbox.DOMPurify = {};
                    if (script.src === 'js/gemini.js') sandbox.GeminiAI = {};
                    if (script.src === 'js/chatbot.js') {
                        sandbox.ChatbotUI = {
                            open() {
                                loaded.push({ src: 'ChatbotUI.open' });
                            },
                        };
                    }
                    if (script.src.includes('turnstile') && turnstileFails) {
                        Promise.resolve().then(() => script.onerror());
                    } else {
                        Promise.resolve().then(() => script.onload());
                    }
                },
            },
        },
        setInterval(callback) {
            intervals.push(callback);
            return intervals.length - 1;
        },
        clearInterval() {},
        setTimeout(callback) {
            timeouts.push(callback);
            return timeouts.length - 1;
        },
        clearTimeout() {},
        console: { error() {} },
    };
    new Function('window', source)(sandbox);
    return { host: sandbox.ChatEmbedHost, sandbox, loaded, messages, intervals, timeouts, input, status };
}

test('chat embed only accepts client=capphutho', () => {
    const { host } = loadEmbedHost();
    assert.deepEqual(host.parseEmbedConfig('?client=capphutho'), { client: 'capphutho' });
    assert.equal(host.parseEmbedConfig('?client=other'), null);
    assert.equal(host.parseEmbedConfig('?client=capphutho%20'), null);
    assert.equal(host.parseEmbedConfig('?mode=admin'), null);
});

test('UI_READY precedes Turnstile and CDN modules retain their SRI attributes', async () => {
    const fixture = loadEmbedHost();
    await fixture.host.bootstrap();

    const marked = fixture.loaded.find(item => item.src.includes('marked'));
    const domPurify = fixture.loaded.find(item => item.src.includes('purify'));
    const openedAt = fixture.loaded.findIndex(item => item.src === 'ChatbotUI.open');
    const turnstileAt = fixture.loaded.findIndex(item => item.src.includes('turnstile'));
    assert.equal(marked.integrity, 'sha384-H+hy9ULve6xfxRkWIh/YOtvDdpXgV2fmAGQkIDTxIgZwNoaoBal14Di2YTMR6MzR');
    assert.equal(domPurify.integrity, 'sha384-6gdBb4YMPz19eGx6Wf1vmT47Jh7wZArqJc84JuA3BRnoZQwt/X5qLfIip51LgpB/');
    assert.equal(marked.crossOrigin, 'anonymous');
    assert.equal(domPurify.crossOrigin, 'anonymous');
    assert.ok(openedAt >= 0 && openedAt < turnstileAt);
    assert.equal(fixture.messages[0].message.type, 'BANDOCAPT_CHAT_READY');
    assert.equal(fixture.messages[0].targetOrigin, 'https://capphutho.vercel.app');

    fixture.sandbox._turnstileToken = 'private-token';
    fixture.input.disabled = false;
    fixture.intervals[0]();
    fixture.intervals[0]();
    assert.equal(fixture.messages.filter(item => item.message.type === 'BANDOCAPT_CHAT_CAPTCHA_READY').length, 1);
    assert.doesNotMatch(JSON.stringify(fixture.messages), /private-token|history|conversation/i);
});

test('Turnstile failures and timeout use safe error codes without closing the UI', async () => {
    const loadFailure = loadEmbedHost({ turnstileFails: true });
    await loadFailure.host.bootstrap();
    assert.equal(loadFailure.messages[0].message.type, 'BANDOCAPT_CHAT_READY');
    assert.deepEqual(loadFailure.messages[1].message.payload, { code: 'TURNSTILE_LOAD_FAILED' });
    assert.equal(loadFailure.status.hidden, false);

    const timeout = loadEmbedHost();
    await timeout.host.bootstrap();
    timeout.timeouts[0]();
    assert.deepEqual(timeout.messages.at(-1).message.payload, { code: 'CAPTCHA_TIMEOUT' });
    assert.equal(timeout.status.hidden, false);
});

test('chat embed uses a concrete parent origin and does not load catalog or navigation modules', () => {
    const source = fs.readFileSync(path.join(root, 'js/chat-embed.js'), 'utf8');
    assert.match(source, /https:\/\/capphutho\.vercel\.app/);
    assert.doesNotMatch(source, /postMessage\([^,]+,\s*['"]\*['"]\)/);
    assert.doesNotMatch(source, /tthc-catalog\.js/);
    assert.doesNotMatch(source, /app-navigation\.js/);
});

test('static build keeps both HTML entries and rewrites embed references to existing files', () => {
    buildStatic();

    const dist = path.join(root, 'dist');
    const embed = fs.readFileSync(path.join(dist, 'chat-embed.html'), 'utf8');
    assert.equal(fs.existsSync(path.join(dist, 'index.html')), true);
    assert.equal(fs.existsSync(path.join(dist, 'chat-embed.html')), true);

    const references = [...embed.matchAll(/(?:href|src)="([^"]+)"/g)]
        .map((match) => match[1])
        .filter((reference) => !reference.startsWith('http'));
    assert.ok(references.length >= 5);
    for (const reference of references) {
        assert.equal(fs.existsSync(path.join(dist, reference)), true, `${reference} must exist in dist`);
    }
});
