'use strict';

// P0 regression test: tests the location-evidence contract and hard safety gate
// against a full deterministic snapshot of the production Published_Locations dataset.

process.env.NODE_ENV = 'development';
process.env.EVAL_BYPASS_TOKEN = 'test-bypass-token';
process.env.CHAT_LOG_HASH_SALT = 'test-only-hash-salt';
process.env.GEMINI_API_KEY = 'test-key';
process.env.PUBLIC_LOCATION_SPREADSHEET_ID = 'snapshot-fixture-workbook';
process.env.EVAL_SKIP_FAQ_CACHE = '1';
process.env.PINECONE_API_KEY = 'test-pinecone-key';
process.env.PINECONE_INDEX_NAME = 'test-index';
delete process.env.PINECONE_INDEX_HOST;
delete process.env.PINECONE_NAMESPACE;
delete process.env.DEEPSEEK_API_KEY;
delete process.env.LLM_PRIMARY;
delete process.env.LLM_FALLBACK;
delete process.env.RAG_GOVERNANCE_FILTER;
delete process.env.RAG_FAIL_CLOSED;
delete process.env.FIREBASE_DB_URL;
delete process.env.FIREBASE_DB_SECRET;

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const test = require('node:test');

// Mock Pinecone before requiring api/chat
const PROCEDURAL_CCCD_RAG_TEXT = [
    'Thủ tục: Cấp, đổi, cấp lại thẻ Căn cước công dân',
    'Hồ sơ: Tờ khai CC01, giấy tờ tuỳ thân, ảnh chân dung.',
    'Trình tự: Nộp hồ sơ, chụp ảnh, thu nhận vân tay, nhận giấy hẹn trả kết quả.',
    'Thời hạn giải quyết: 07 ngày làm việc.',
    'Lệ phí: Cấp đổi thẻ theo quy định Thông tư 59/2019/TT-BTC.',
].join('\n');

const FAKE_PINECONE_MATCH = {
    id: 'tthc_cccd_general_procedure',
    score: 0.90,
    metadata: {
        text: PROCEDURAL_CCCD_RAG_TEXT,
        title: 'Cấp, đổi, cấp lại thẻ Căn cước',
        loai_thu_tuc: 'can_cuoc',
        linh_vuc: 'can_cuoc',
    },
};

class FakePineconeIndex {
    namespace() { return this; }
    async query() { return { matches: [FAKE_PINECONE_MATCH] }; }
}
class FakePinecone {
    index() { return new FakePineconeIndex(); }
}

const pineconePath = require.resolve('@pinecone-database/pinecone');
require.cache[pineconePath] = {
    id: pineconePath,
    filename: pineconePath,
    loaded: true,
    exports: { Pinecone: FakePinecone },
};

const locations = require('../lib/published-locations');
const chatHandler = require('../api/chat');

const SNAPSHOT_PATH = path.resolve(__dirname, 'fixtures/published-locations-snapshot.json');
const SNAPSHOT_PAYLOAD = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));

const FORBIDDEN_LEAK_PATTERN = /Hòa Bình|Hoa Binh|Thịnh Lang|Thinh Lang|0973740838|google\.com\/maps|Google Maps/i;

function sseResponse(text) {
    const body = [
        `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] })}`,
        `data: ${JSON.stringify({ candidates: [{ finishReason: 'STOP' }] })}`,
        '',
    ].join('\n');
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

function mockFetchForSnapshot(modelAnswerText) {
    const originalFetch = global.fetch;
    global.fetch = async url => {
        const value = String(url);
        if (value.includes('docs.google.com/spreadsheets')) {
            return new Response(`google.visualization.Query.setResponse(${JSON.stringify(SNAPSHOT_PAYLOAD)});`);
        }
        if (value.includes('gemini-embedding-001')) {
            return Response.json({ embedding: { values: [0.1, 0.2, 0.3] } });
        }
        if (value.includes('gemini-2.5-flash:streamGenerateContent') || value.includes('gemini-2.5-flash:generateContent')) {
            return sseResponse(modelAnswerText);
        }
        throw new Error(`Unexpected fetch URL in test: ${value}`);
    };
    return () => {
        global.fetch = originalFetch;
    };
}

function createRequest(body) {
    return {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-forwarded-for': '127.0.0.1',
        },
        body,
        socket: {},
    };
}

function runHandler(body) {
    return new Promise((resolve, reject) => {
        let buffer = '';
        const res = {
            headers: {},
            statusCode: 200,
            setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
            status(code) { this.statusCode = code; return this; },
            json(payload) { resolve({ statusCode: this.statusCode, body: JSON.stringify(payload) }); return this; },
            writeHead(code) { this.statusCode = code; return this; },
            write(chunk) { buffer += chunk.toString(); return true; },
            end() { resolve({ statusCode: this.statusCode, body: buffer }); return this; },
        };
        chatHandler(createRequest(body), res).catch(reject);
    });
}

function getEvents(body) {
    return String(body).split('\n\n')
        .filter(part => part.startsWith('data: '))
        .map(part => JSON.parse(part.slice(6)));
}

function getDone(body) {
    return getEvents(body).find(event => event.done);
}

test.afterEach(() => {
    locations.resetPublishedLocationsCache();
});

// =========================================================================
// P0 PRODUCTION REPRODUCER TEST
// =========================================================================

test('P0 REPRODUCER (pure resolver): "Tôi muốn làm căn cước thì đến đâu" must NOT match any specific station', async () => {
    const dataset = await locations.getPublishedLocations({
        fetchImpl: async () => new Response(`google.visualization.Query.setResponse(${JSON.stringify(SNAPSHOT_PAYLOAD)});`),
        forceRefresh: true,
    });

    const result = locations.findVerifiedLocationMatches(
        'Tôi muốn làm căn cước thì đến đâu',
        [],
        dataset
    );

    // Contract expectations:
    assert.equal(result.lookupRequested, true, 'lookupRequested must be true');
    assert.equal(result.hasLocationEvidence, false, 'hasLocationEvidence must be false');
    assert.equal(result.status, 'missing_location_evidence', 'status must be missing_location_evidence');
    assert.deepEqual(result.matches, [], 'matches must be empty when hasLocationEvidence is false');
});

test('P0 REPRODUCER (integration): "Tôi muốn làm căn cước thì đến đâu" must NOT leak station, address, phone, maps in fullText or SSE', async () => {
    // Model answer following system prompt instructions
    const MODEL_OUTPUT = [
        'Để làm căn cước, bạn có thể đến Công an Phường Hòa Bình tại Số 97, đường Thịnh Lang để làm thủ tục.',
        'Điện thoại: 0973740838',
    ].join('\n');

    const restoreFetch = mockFetchForSnapshot(MODEL_OUTPUT);
    try {
        const result = await runHandler({
            captchaToken: 'test-bypass-token',
            userMessage: 'Tôi muốn làm căn cước thì đến đâu',
            history: [],
            evalDebug: true,
        });

        const done = getDone(result.body);
        assert.ok(done, 'Stream did not finish with a done event');

        // Check verifiedLocations in done payload
        assert.deepEqual(done.verifiedLocations, [], 'verifiedLocations must be empty when no location evidence');

        // Check fullText
        assert.doesNotMatch(done.fullText, FORBIDDEN_LEAK_PATTERN, `done.fullText leaked location: ${done.fullText}`);

        // Must ask for commune/ward
        assert.match(done.fullText, /xã\/phường|xa\/phuong/i, 'Response must ask for commune/ward');

        // Check intermediate text events
        const intermediateTexts = getEvents(result.body).filter(e => e.text).map(e => e.text).join('\n');
        assert.doesNotMatch(intermediateTexts, FORBIDDEN_LEAK_PATTERN, `Intermediate SSE leaked: ${intermediateTexts}`);
    } finally {
        restoreFetch();
    }
});

// =========================================================================
// TEST MATRIX: POSITIVE & MULTI-TURN CASES
// =========================================================================

test('Positive case 1: "Tôi ở phường Hòa Bình, muốn làm căn cước thì đến đâu" matches Công an Phường Hòa Bình', async () => {
    const dataset = await locations.getPublishedLocations({
        fetchImpl: async () => new Response(`google.visualization.Query.setResponse(${JSON.stringify(SNAPSHOT_PAYLOAD)});`),
        forceRefresh: true,
    });

    const result = locations.findVerifiedLocationMatches(
        'Tôi ở phường Hòa Bình, muốn làm căn cước thì đến đâu',
        [],
        dataset
    );

    assert.equal(result.hasLocationEvidence, true);
    assert.equal(result.status, 'matched');
    assert.ok(result.matches.length > 0);
    assert.equal(result.matches[0].name, 'Công an Phường Hòa Bình');
});

test('Positive case 2: "Tôi ở xã Bình Xuyên, muốn làm căn cước thì đến đâu" matches Công an Xã Bình Xuyên', async () => {
    const dataset = await locations.getPublishedLocations({
        fetchImpl: async () => new Response(`google.visualization.Query.setResponse(${JSON.stringify(SNAPSHOT_PAYLOAD)});`),
        forceRefresh: true,
    });

    const result = locations.findVerifiedLocationMatches(
        'Tôi ở xã Bình Xuyên, muốn làm căn cước thì đến đâu',
        [],
        dataset
    );

    assert.equal(result.hasLocationEvidence, true);
    assert.equal(result.status, 'matched');
    assert.ok(result.matches.length > 0);
    assert.equal(result.matches[0].name, 'Công an Xã Bình Xuyên');
});

test('Explicit station query: "Công an phường Nông Trang" matches Công an Phường Nông Trang', async () => {
    const dataset = await locations.getPublishedLocations({
        fetchImpl: async () => new Response(`google.visualization.Query.setResponse(${JSON.stringify(SNAPSHOT_PAYLOAD)});`),
        forceRefresh: true,
    });

    const result = locations.findVerifiedLocationMatches(
        'Công an phường Nông Trang',
        [],
        dataset
    );

    assert.equal(result.hasLocationEvidence, true);
    assert.equal(result.status, 'matched');
    assert.ok(result.matches.length > 0);
    assert.equal(result.matches[0].name, 'Công an Phường Nông Trang');
});

test('Multi-turn follow-up: bot asks for ward/commune, user answers "Hòa Bình" matches Công an Phường Hòa Bình', async () => {
    const dataset = await locations.getPublishedLocations({
        fetchImpl: async () => new Response(`google.visualization.Query.setResponse(${JSON.stringify(SNAPSHOT_PAYLOAD)});`),
        forceRefresh: true,
    });

    const history = [
        { role: 'user', parts: [{ text: 'Tôi muốn làm căn cước thì đến đâu' }] },
        { role: 'model', parts: [{ text: 'Bạn ở xã/phường nào để mình chỉ đúng trụ sở Công an và đường đi nhé?' }] },
    ];

    const result = locations.findVerifiedLocationMatches(
        'Hòa Bình',
        history,
        dataset
    );

    assert.equal(result.hasLocationEvidence, true);
    assert.equal(result.locationEvidenceSource, 'assistant_location_followup');
    assert.equal(result.status, 'matched');
    assert.ok(result.matches.length > 0);
    assert.equal(result.matches[0].name, 'Công an Phường Hòa Bình');
});

test('Contract tests: hasLocationEvidence returns false for service/procedural-only queries', () => {
    const nonLocationQueries = [
        'Tôi muốn làm căn cước thì đến đâu',
        'Làm căn cước ở đâu',
        'Tôi muốn làm căn cước',
        'Thủ tục cấp đổi thẻ căn cước gồm những gì',
        'Lệ phí làm căn cước là bao nhiêu',
        'Mất CCCD làm lại ở đâu',
        'Hồ sơ đăng ký thường trú gồm giấy tờ gì',
        'Đăng ký tạm trú làm thế nào',
        'Thủ tục cấp hộ chiếu phổ thông',
    ];

    for (const query of nonLocationQueries) {
        assert.equal(
            locations.hasLocationEvidence(query, []),
            false,
            `Expected hasLocationEvidence to be false for query: "${query}"`
        );
    }
});
