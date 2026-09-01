'use strict';

// Deterministic regression coverage for the location-evidence contract. The handler test uses
// only local fixtures and mocked provider responses; it never reads or mutates production data.

const assert = require('node:assert/strict');
const test = require('node:test');
const locations = require('../lib/published-locations');
const chatHandler = require('../api/chat');

const LOCATION = {
    name: 'Công an Phường Hòa Bình',
    address: 'Số 97, đường Thịnh Lang, tổ 5, phường Hòa Bình, tỉnh Phú Thọ',
    phone: '0973740838',
    coordinates: '20.8,105.3',
    lat: 20.8,
    lng: 105.3,
    services: ['CITIZEN_ID'],
    cccdServiceMode: 'PERMANENT',
    aliases: {
        fullName: 'cong an phuong hoa binh',
        withoutCongAn: 'phuong hoa binh',
        bareName: 'hoa binh',
        approved: ['thinh lang'],
    },
};

const DATASET = { locations: [LOCATION], conflicts: [], cacheStatus: 'fresh' };
const CITIZEN_ID_QUESTION = 'Tôi muốn làm căn cước thì đến đâu và cần giấy tờ gì?';
const LOCATION_FOLLOWUP = 'Bạn ở xã/phường nào để mình chỉ đúng trụ sở Công an và đường đi nhé?';

function user(text) {
    return { role: 'user', parts: [{ text }] };
}

function model(text) {
    return { role: 'model', parts: [{ text }] };
}

function resolve(currentMessage, history = []) {
    return locations.findVerifiedLocationMatches(currentMessage, history, DATASET);
}

test('fresh session service intent has no location match', () => {
    const result = resolve(CITIZEN_ID_QUESTION);
    assert.equal(result.status, 'no_match');
    assert.deepEqual(result.matches, []);
    assert.equal(result.lookupTexts.length, 2);
    assert.equal(result.lookupTexts[0].source, 'current');
    assert.equal(result.lookupTexts[1].source, 'current-loose');
});

test('old location in same session is not reused after topic change', () => {
    const history = [user('Tôi ở phường Hòa Bình'), model('Đã hiểu, tôi sẽ ghi nhận thông tin đó.')];
    const result = resolve(CITIZEN_ID_QUESTION, history);
    assert.equal(result.status, 'no_match');
    assert.deepEqual(result.matches, []);
    assert.equal(result.lookupTexts.some(item => item.source === 'history'), false);
});

test('explicit current-message location matches the verified service point', () => {
    const result = resolve('Tôi ở phường Hòa Bình, muốn làm căn cước thì đến đâu?');
    assert.equal(result.status, 'matched');
    assert.equal(result.matches[0].name, LOCATION.name);
});

test('immediate assistant location follow-up allows a short location answer', () => {
    const history = [user('Tôi muốn làm căn cước'), model(LOCATION_FOLLOWUP)];
    const result = resolve('Hòa Bình', history);
    assert.equal(result.status, 'matched');
    assert.equal(result.matches[0].name, LOCATION.name);
    assert.equal(result.lookupTexts.some(item => item.allowRegionStopwords), true);
});

test('citizen ID words alone never become location evidence', () => {
    assert.equal(resolve('Tôi muốn làm căn cước ở đâu?').status, 'no_match');
    assert.equal(resolve('Tôi muốn làm căn cước').status, 'no_match');
});

test('unknown explicit location is no_match and never falls back to another station', () => {
    const result = resolve('Tôi ở phường Không Có Trong Dữ Liệu, muốn làm căn cước');
    assert.equal(result.status, 'no_match');
    assert.deepEqual(result.matches, []);
});

test('ambiguous alias remains ambiguous instead of selecting an option', () => {
    const dataset = {
        cacheStatus: 'fresh',
        locations: [
            { ...LOCATION, name: 'Công an phường A', aliases: { fullName: 'cong an phuong a', withoutCongAn: 'phuong a', bareName: 'a', approved: ['bach hac'] } },
            { ...LOCATION, name: 'Công an phường B', aliases: { fullName: 'cong an phuong b', withoutCongAn: 'phuong b', bareName: 'b', approved: ['bach hac'] } },
        ],
        conflicts: [],
    };
    const result = locations.findVerifiedLocationMatches('Tôi ở Bạch Hạc', [], dataset);
    assert.equal(result.status, 'ambiguous_match');
    assert.equal(result.matches.length, 2);
    const clarification = chatHandler.getAmbiguousLocationReply('vi');
    assert.match(clarification, /nhiều trụ sở|chưa thể tự chọn|cho biết rõ xã\/phường/);
    assert.doesNotMatch(clarification, /địa chỉ|SĐT|Google Maps|option 1|option 2/i);
});

test('request A state cannot affect request B, including concurrent calls', async () => {
    const requestA = Promise.resolve().then(() => resolve('Hòa Bình', [model(LOCATION_FOLLOWUP)]));
    const requestB = Promise.resolve().then(() => resolve(CITIZEN_ID_QUESTION, []));
    const [a, b] = await Promise.all([requestA, requestB]);
    assert.equal(a.status, 'matched');
    assert.equal(b.status, 'no_match');
    assert.deepEqual(b.matches, []);
});

test('no_match output safety detects both published and newly hallucinated location claims', () => {
    assert.equal(chatHandler.containsSpecificLocationClaim(
        'Công an Phường Hòa Bình — Số 97, đường Thịnh Lang', DATASET
    ), true);
    assert.equal(chatHandler.containsSpecificLocationClaim(
        'Bạn đang ở xã/phường nào để mình chỉ đúng trụ sở Công an và đường đi nhé.', DATASET
    ), false);
    assert.equal(chatHandler.containsSpecificLocationClaim(
        'Công an phường Không Tồn Tại — Địa chỉ: số 1 đường A', DATASET
    ), true);
});

function buildLocationPayload(records = [LOCATION]) {
    return {
        table: {
            cols: [
                { label: 'record_id' }, { label: 'name' }, { label: 'address' },
                { label: 'phone' }, { label: 'coordinates' }, { label: 'services' },
                { label: 'cccd_service_mode' }, { label: 'search_aliases' },
            ],
            rows: records.map((record, index) => ({ c: [
                { v: `LOCAL_${index}` }, { v: record.name }, { v: record.address },
                { v: record.phone }, { v: record.coordinates }, { v: 'CITIZEN_ID' },
                { v: record.cccdServiceMode }, { v: (record.aliases?.approved || []).join('|') },
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

function getDone(body) {
    return getEvents(body).find(event => event.done);
}

function getEvents(body) {
    return String(body).split('\n\n')
        .filter(part => part.startsWith('data: '))
        .map(part => JSON.parse(part.slice(6)));
}

test('handler traces no_match before generation and blocks a hallucinated station', async () => {
    const envBackup = Object.fromEntries([
        'NODE_ENV', 'EVAL_BYPASS_TOKEN', 'CHAT_LOG_HASH_SALT', 'GEMINI_API_KEY',
        'PUBLIC_LOCATION_SPREADSHEET_ID', 'PINECONE_API_KEY', 'FIREBASE_DB_URL',
        'RAG_FAIL_CLOSED', 'EVAL_SKIP_FAQ_CACHE',
    ].map(key => [key, process.env[key]]));
    Object.assign(process.env, {
        NODE_ENV: 'development',
        EVAL_BYPASS_TOKEN: 'test-bypass-token',
        CHAT_LOG_HASH_SALT: 'test-only-hash-salt',
        GEMINI_API_KEY: 'test-key',
        PUBLIC_LOCATION_SPREADSHEET_ID: 'local-fixture-workbook',
        EVAL_SKIP_FAQ_CACHE: '1',
    });
    delete process.env.PINECONE_API_KEY;
    delete process.env.FIREBASE_DB_URL;
    delete process.env.RAG_FAIL_CLOSED;
    locations.resetPublishedLocationsCache();
    const originalFetch = global.fetch;
    let fixtureLocations = [LOCATION];
    let generationCalls = 0;
    global.fetch = async url => {
        const value = String(url);
        if (value.includes('docs.google.com/spreadsheets')) {
            return new Response(`google.visualization.Query.setResponse(${JSON.stringify(buildLocationPayload(fixtureLocations))});`);
        }
        if (value.includes('gemini-embedding-001')) {
            return Response.json({ embedding: { values: [0.1, 0.2, 0.3] } });
        }
        if (value.includes('gemini-2.5-flash:streamGenerateContent')) {
            generationCalls += 1;
            return sseResponse(generationCalls === 1
                ? 'Công an Phường Hòa Bình — Số 97, đường Thịnh Lang, ☎️ 0973740838\nhttps://www.google.com/maps/search/?api=1&query=20.8,105.3'
                : 'Công an phường A — Địa chỉ: số 1 đường A');
        }
        throw new Error(`unexpected local fixture URL: ${value}`);
    };

    try {
        const result = await runHandler({
            captchaToken: 'test-bypass-token',
            userMessage: CITIZEN_ID_QUESTION,
            history: [],
            evalDebug: true,
        });
        const done = getDone(result.body);
        assert.equal(result.statusCode, 200);
        assert.equal(done.eval.currentMessage, CITIZEN_ID_QUESTION);
        assert.deepEqual(done.eval.sanitizedHistory, []);
        assert.equal(done.eval.locationLookupRequested, true);
        assert.equal(done.eval.locationResolutionStatus, 'no_match');
        assert.equal(done.eval.locationLookupTexts.some(item => item.source === 'history'), false);
        assert.deepEqual(done.eval.verifiedLocationMatches, []);
        assert.match(done.eval.verifiedLocationPrompt, /STATUS: no_match/);
        assert.deepEqual(done.eval.retrievedDocuments, []);
        assert.equal(done.eval.locationSafetyFallback, true);
        assert.match(done.fullText, /chưa thể chỉ một trụ sở cụ thể/);
        assert.doesNotMatch(done.fullText, /Hòa Bình|Thịnh Lang|0973740838|google\.com\/maps/i);
        const emittedText = getEvents(result.body).filter(event => event.text).map(event => event.text).join('\n');
        assert.doesNotMatch(emittedText, /Hòa Bình|Thịnh Lang|0973740838|google\.com\/maps/i);
        assert.equal(done.eval.finalGenerationPrompt.system.includes('STATUS: no_match'), true);
        assert.equal(done.eval.finalGenerationPrompt.contents.some(item =>
            item.parts?.some(part => /Hòa Bình|Thịnh Lang|0973740838|google\.com\/maps/i.test(part.text || ''))
        ), false);
        assert.equal(done.eval.answer, done.fullText);

        fixtureLocations = [
            { ...LOCATION, name: 'Công an phường A', address: 'Số 1 đường A', phone: '0900000001', aliases: { fullName: 'cong an phuong a', withoutCongAn: 'phuong a', bareName: 'a', approved: ['bach hac'] } },
            { ...LOCATION, name: 'Công an phường B', address: 'Số 2 đường B', phone: '0900000002', aliases: { fullName: 'cong an phuong b', withoutCongAn: 'phuong b', bareName: 'b', approved: ['bach hac'] } },
        ];
        locations.resetPublishedLocationsCache();
        const ambiguousResult = await runHandler({
            captchaToken: 'test-bypass-token',
            userMessage: 'Tôi ở Bạch Hạc, muốn làm căn cước',
            history: [],
            evalDebug: true,
        });
        const ambiguousDone = getDone(ambiguousResult.body);
        assert.equal(ambiguousDone.eval.locationResolutionStatus, 'ambiguous_match');
        assert.equal(ambiguousDone.eval.locationSafetyFallback, true);
        assert.match(ambiguousDone.fullText, /nhiều trụ sở|chưa thể tự chọn|cho biết rõ xã\/phường/);
        assert.doesNotMatch(ambiguousDone.fullText, /Công an phường A|Số 1 đường A|Google Maps/i);
    } finally {
        global.fetch = originalFetch;
        locations.resetPublishedLocationsCache();
        for (const [key, value] of Object.entries(envBackup)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
});
