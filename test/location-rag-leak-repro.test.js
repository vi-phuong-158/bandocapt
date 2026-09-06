'use strict';

// Production-like regression: reproduces the exact reported leak with Pinecone/RAG ACTIVE
// (mocked, not disabled) so this test cannot pass merely because RAG was turned off. A real
// Published_Locations record for "Công an Phường Hòa Bình" exists (mirrors the confirmed
// production dataset) and a mocked Pinecone match carries that station's name/address/phone
// inside a procedural CCCD document chunk (mirrors "G. CCCD xa 2025.docx"), exactly as the
// runtime logs from the incident showed. The user message never states a ward/commune.
//
// This must stay GREEN after the fix. Deleting it, or gutting the assertions to pass trivially,
// defeats the purpose of this file — see docs/brain/04-current-tasks.md P0 location-leak task.

process.env.NODE_ENV = 'development';
process.env.EVAL_BYPASS_TOKEN = 'test-bypass-token';
process.env.CHAT_LOG_HASH_SALT = 'test-only-hash-salt';
process.env.GEMINI_API_KEY = 'test-key';
process.env.PUBLIC_LOCATION_SPREADSHEET_ID = 'local-fixture-workbook';
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

// --- Mock the Pinecone SDK BEFORE requiring api/chat.js -------------------------------------
// api/chat.js constructs `new Pinecone(...)` once at module load time (module-level singleton),
// so the mock must be installed in require.cache before the first require of '../api/chat'.
const LEAKED_STATION_TEXT = [
    'Thủ tục: Cấp, đổi, cấp lại thẻ Căn cước công dân',
    'Hồ sơ: Tờ khai CC01, giấy tờ tuỳ thân, ảnh chân dung.',
    'Trình tự: Nộp hồ sơ, chụp ảnh, thu nhận vân tay, nhận giấy hẹn trả kết quả.',
    'Nơi thực hiện: Công an Phường Hòa Bình',
    'Địa chỉ: Số 97, đường Thịnh Lang, tổ 5, phường Hòa Bình, tỉnh Phú Thọ',
    'Điện thoại: 0973740838',
].join('\n');

const FAKE_PINECONE_MATCH = {
    id: 'tthc_cccd_xa_hoa_binh_2025',
    score: 0.91,
    metadata: {
        text: LEAKED_STATION_TEXT,
        title: 'Cấp, đổi, cấp lại thẻ Căn cước công dân',
        source_file: 'G. CCCD xa 2025.docx',
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

const assert = require('node:assert/strict');
const test = require('node:test');
const locations = require('../lib/published-locations');
const chatHandler = require('../api/chat');

// Confirms the Pinecone mock actually replaced the real SDK — if this assertion ever fails,
// every other assertion in this file is meaningless (it would silently be testing with
// PINECONE_API_KEY set but the real network-calling SDK, which errors out with no network).
assert.equal(
    require('@pinecone-database/pinecone').Pinecone,
    FakePinecone,
    'Pinecone SDK mock did not take effect — this file would not actually exercise the RAG path'
);

const HOA_BINH_LOCATION = {
    name: 'Công an Phường Hòa Bình',
    address: 'Số 97, đường Thịnh Lang, tổ 5, phường Hòa Bình, tỉnh Phú Thọ',
    phone: '0973740838',
    coordinates: '20.8,105.3',
    services: 'CITIZEN_ID',
    cccdServiceMode: 'PERMANENT',
};

const FORBIDDEN_LEAK_PATTERN = /Hòa Bình|Hoa Binh|Thịnh Lang|Thinh Lang|0973740838|google\.com\/maps|Google Maps/i;

function buildLocationPayload(records) {
    return {
        table: {
            cols: [
                { label: 'record_id' }, { label: 'name' }, { label: 'address' },
                { label: 'phone' }, { label: 'coordinates' }, { label: 'services' },
                { label: 'cccd_service_mode' }, { label: 'search_aliases' },
            ],
            rows: records.map((record, index) => ({ c: [
                { v: `LOCAL_${index}` }, { v: record.name }, { v: record.address },
                { v: record.phone }, { v: record.coordinates }, { v: record.services },
                { v: record.cccdServiceMode }, { v: '' },
            ] })),
        },
    };
}

function sseResponse(text) {
    const body = [
        `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] })}`,
        `data: ${JSON.stringify({ candidates: [{ finishReason: 'STOP' }] })}`,
        '',
    ].join('\n');
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

function createRequest(body) {
    return {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
        body,
        socket: {},
    };
}

function runHandler(body) {
    return new Promise((resolve, reject) => {
        let buffer = '';
        const res = {
            headers: {}, statusCode: 200,
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

// The model, having read a RAG chunk that mixes procedure guidance with one commune's station
// details, reproduces that station verbatim AND still asks the user for their ward at the end —
// exactly the contradictory production symptom described in the incident report.
const LEAKED_MODEL_ANSWER = [
    'Bạn cần chuẩn bị: Tờ khai CC01, giấy tờ tuỳ thân, ảnh chân dung để làm thủ tục cấp căn cước.',
    '',
    'Nơi thực hiện: Công an Phường Hòa Bình',
    'Địa chỉ: Số 97, đường Thịnh Lang, tổ 5, phường Hòa Bình, tỉnh Phú Thọ',
    'Điện thoại: 0973740838',
    'Chỉ đường Google Maps: https://www.google.com/maps/search/?api=1&query=20.8,105.3',
    '',
    'Bạn ở xã/phường nào để mình chỉ đúng trụ sở Công an và đường đi nhé?',
].join('\n');

function installFetchMock() {
    const originalFetch = global.fetch;
    let generationCalls = 0;
    global.fetch = async url => {
        const value = String(url);
        if (value.includes('docs.google.com/spreadsheets')) {
            return new Response(`google.visualization.Query.setResponse(${JSON.stringify(buildLocationPayload([HOA_BINH_LOCATION]))});`);
        }
        if (value.includes('gemini-embedding-001')) {
            return Response.json({ embedding: { values: [0.1, 0.2, 0.3] } });
        }
        if (value.includes('gemini-2.5-flash:streamGenerateContent')) {
            generationCalls += 1;
            return sseResponse(LEAKED_MODEL_ANSWER);
        }
        throw new Error(`unexpected local fixture URL in RAG-leak repro test: ${value}`);
    };
    return () => { global.fetch = originalFetch; };
}

const PRODUCTION_CASES = [
    ['Case A — exact production query', 'Tôi muốn làm căn cước thì đến đâu và cần giấy tờ gì?'],
    ['Case B — exact second production query', 'Tôi muốn làm thủ tục cấp căn cước'],
];

for (const [label, userMessage] of PRODUCTION_CASES) {
    test(`${label}: RAG chunk mentioning a real station must not leak it when no ward/commune was given`, async () => {
        locations.resetPublishedLocationsCache();
        const restoreFetch = installFetchMock();
        try {
            const result = await runHandler({
                captchaToken: 'test-bypass-token',
                userMessage,
                history: [],
                evalDebug: true,
            });
            assert.equal(result.statusCode, 200);
            const done = getDone(result.body);
            assert.ok(done, 'handler must send a done event');

            // Ground truth: the location resolver, using ONLY the current message (no ward
            // named), must have found no verified match — otherwise this test would not be
            // exercising the no_match/RAG-leak scenario at all.
            assert.equal(done.eval.locationLookupRequested, true);
            assert.equal(done.eval.locationResolutionStatus, 'missing_location_evidence');
            assert.deepEqual(done.eval.verifiedLocationMatches, []);

            // Ground truth: Pinecone really was queried and really did return the contaminated
            // chunk — otherwise this test would trivially pass by accident (RAG effectively off).
            assert.ok(done.eval.retrievedDocuments.length > 0, 'Pinecone mock must have been used');
            const promptText = done.eval.finalGenerationPrompt.system + JSON.stringify(done.eval.finalGenerationPrompt.contents);
            // Layer 1: the procedure guidance from the same chunk must still reach the model —
            // only the office-identifying lines are stripped, not the whole document.
            assert.match(promptText, /Tờ khai CC01|Trình tự/,
                'the RAG chunk\'s procedure content must still reach the generation prompt (Layer 1 must not gut RAG content)');
            // Layer 1: the contaminated station/address/phone lines must never reach the model's
            // context in the first place — a structural boundary, not just a post-hoc output gate.
            // (Checked against content unique to the leaked chunk — not the bare word "Hòa Bình"
            // (the static system prompt legitimately references the old Hòa Bình province merger
            // elsewhere) and not the bare string "google.com/maps" (the static system prompt's
            // own instructions show the Maps URL FORMAT as a template for verified locations).)
            assert.doesNotMatch(promptText, /Thịnh Lang|Thinh Lang|0973740838|query=20\.8,105\.3/i,
                'the RAG chunk\'s office-identifying lines reached the generation prompt — Layer 1 sanitization did not strip them');
            assert.doesNotMatch(promptText, /nơi thực hiện[^\n]*công an phường hòa bình|công an phường hòa bình/i,
                'the RAG chunk\'s station-name line reached the generation prompt — Layer 1 sanitization did not strip it');

            // The actual invariant under test: no specific station/address/phone/Maps link may
            // reach the client, in the final answer OR in any intermediate streamed SSE `text`
            // event, regardless of where the model got the idea to mention it.
            assert.doesNotMatch(done.fullText, FORBIDDEN_LEAK_PATTERN,
                `done.fullText leaked a specific location claim: ${done.fullText}`);
            const emittedText = getEvents(result.body).filter(event => event.text).map(event => event.text).join('\n');
            assert.doesNotMatch(emittedText, FORBIDDEN_LEAK_PATTERN,
                `an intermediate SSE text event leaked a specific location claim: ${emittedText}`);

            // The response must still be useful: procedure guidance stays, and the model should
            // still be steered to ask for the ward/commune rather than going silent.
            assert.match(done.fullText, /xã\/phường|xa\/phuong/i);
        } finally {
            restoreFetch();
            locations.resetPublishedLocationsCache();
        }
    });
}

// Test matrix CASE 5 — a fictional station not present in Published_Locations at all. Must be
// blocked by the structural pattern in containsSpecificLocationClaim/stripLocationAuthorityFromRagText
// (dataset-independent), not merely by matching a known real name.
test('Case 5 — RAG contains a fictional/unpublished station: must not leak it either', async () => {
    locations.resetPublishedLocationsCache();
    const originalFetch = global.fetch;
    const FICTIONAL_ANSWER = [
        'Bạn cần chuẩn bị: Tờ khai CC01, giấy tờ tuỳ thân, ảnh chân dung.',
        'Nơi thực hiện: Công an Phường Không Tồn Tại',
        'Địa chỉ: Số 1, đường Bịa Đặt, phường Không Tồn Tại',
        'Điện thoại: 0900000000',
    ].join('\n');
    global.fetch = async url => {
        const value = String(url);
        if (value.includes('docs.google.com/spreadsheets')) {
            return new Response(`google.visualization.Query.setResponse(${JSON.stringify(buildLocationPayload([HOA_BINH_LOCATION]))});`);
        }
        if (value.includes('gemini-embedding-001')) return Response.json({ embedding: { values: [0.1, 0.2, 0.3] } });
        if (value.includes('gemini-2.5-flash:streamGenerateContent')) return sseResponse(FICTIONAL_ANSWER);
        throw new Error(`unexpected local fixture URL: ${value}`);
    };
    try {
        const result = await runHandler({
            captchaToken: 'test-bypass-token',
            userMessage: 'Tôi muốn làm thủ tục cấp căn cước',
            history: [],
            evalDebug: true,
        });
        const done = getDone(result.body);
        assert.equal(done.eval.locationResolutionStatus, 'missing_location_evidence');
        assert.doesNotMatch(done.fullText, /Không Tồn Tại|Bịa Đặt|0900000000/i,
            `a fictional/hallucinated station leaked: ${done.fullText}`);
    } finally {
        global.fetch = originalFetch;
        locations.resetPublishedLocationsCache();
    }
});

// Test matrix CASE 12 — Published_Locations itself is unavailable (fetch throws). Status must
// become 'unavailable' (still gated) and no station may be selected, even with RAG contaminated.
test('Case 12 — Published_Locations unavailable: no specific station leaks', async () => {
    locations.resetPublishedLocationsCache();
    const originalFetch = global.fetch;
    global.fetch = async url => {
        const value = String(url);
        if (value.includes('docs.google.com/spreadsheets')) throw new Error('ECONNRESET (simulated Sheets outage)');
        if (value.includes('gemini-embedding-001')) return Response.json({ embedding: { values: [0.1, 0.2, 0.3] } });
        if (value.includes('gemini-2.5-flash:streamGenerateContent')) return sseResponse(LEAKED_MODEL_ANSWER);
        throw new Error(`unexpected local fixture URL: ${value}`);
    };
    try {
        const result = await runHandler({
            captchaToken: 'test-bypass-token',
            userMessage: 'Tôi muốn làm căn cước thì đến đâu và cần giấy tờ gì?',
            history: [],
            evalDebug: true,
        });
        const done = getDone(result.body);
        assert.equal(done.eval.locationResolutionStatus, 'unavailable');
        assert.doesNotMatch(done.fullText, FORBIDDEN_LEAK_PATTERN,
            `leak despite Published_Locations being unavailable: ${done.fullText}`);
    } finally {
        global.fetch = originalFetch;
        locations.resetPublishedLocationsCache();
    }
});

// Test matrix CASE 14 — RAG line has address/phone but never states a station NAME. The detail
// (not the name-authority) pattern must still catch it.
test('Case 14 — RAG line has address/phone but no station name: still blocked', () => {
    const ragChunk = [
        'Hồ sơ: Tờ khai CC01.',
        'Địa chỉ: Số 97, đường Thịnh Lang, tổ 5, phường Hòa Bình, tỉnh Phú Thọ',
        'Điện thoại: 0973740838',
    ].join('\n');
    const sanitized = chatHandler.stripLocationAuthorityFromRagText(ragChunk);
    assert.doesNotMatch(sanitized, /Thịnh Lang|0973740838/);
    assert.match(sanitized, /Tờ khai CC01/);
});
