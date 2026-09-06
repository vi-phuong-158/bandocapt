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
    assert.equal(result.status, 'missing_location_evidence');
    assert.deepEqual(result.matches, []);
    assert.equal(result.lookupTexts.length, 1);
    assert.equal(result.lookupTexts[0].source, 'current');
});

test('old location in same session is not reused after topic change', () => {
    const history = [user('Tôi ở phường Hòa Bình'), model('Đã hiểu, tôi sẽ ghi nhận thông tin đó.')];
    const result = resolve(CITIZEN_ID_QUESTION, history);
    assert.equal(result.status, 'missing_location_evidence');
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
    assert.equal(resolve('Tôi muốn làm căn cước ở đâu?').status, 'missing_location_evidence');
    assert.equal(resolve('Tôi muốn làm căn cước').status, 'missing_location_evidence');
    assert.equal(locations.hasLocationEvidence('Tôi muốn làm căn cước ở đâu?'), false);
    assert.equal(locations.hasLocationEvidence('Tôi muốn làm căn cước'), false);
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
    assert.equal(b.status, 'missing_location_evidence');
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

test('stripLocationAuthorityFromRagText removes office-identifying lines but keeps procedure content', () => {
    const ragChunk = [
        'Thủ tục: Cấp, đổi, cấp lại thẻ Căn cước công dân',
        'Hồ sơ: Tờ khai CC01, giấy tờ tuỳ thân, ảnh chân dung.',
        'Trình tự: Nộp hồ sơ, chụp ảnh, thu nhận vân tay, nhận giấy hẹn trả kết quả.',
        'Nơi thực hiện: Công an Phường Hòa Bình',
        'Địa chỉ: Số 97, đường Thịnh Lang, tổ 5, phường Hòa Bình, tỉnh Phú Thọ',
        'Điện thoại: 0973740838',
        'Chỉ đường: https://www.google.com/maps/search/?api=1&query=20.8,105.3',
    ].join('\n');
    const sanitized = chatHandler.stripLocationAuthorityFromRagText(ragChunk);
    assert.match(sanitized, /Tờ khai CC01/);
    assert.match(sanitized, /Trình tự: Nộp hồ sơ/);
    assert.doesNotMatch(sanitized, /Hòa Bình/);
    assert.doesNotMatch(sanitized, /Thịnh Lang/);
    assert.doesNotMatch(sanitized, /0973740838/);
    assert.doesNotMatch(sanitized, /google\.com\/maps/i);
});

test('stripLocationAuthorityFromRagText keeps generic wording without a specific unit name', () => {
    const genericLine = 'Nơi nộp: Công an cấp xã nơi cư trú hoặc địa phương phù hợp.';
    assert.equal(chatHandler.stripLocationAuthorityFromRagText(genericLine), genericLine);
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

test('handler traces missing_location_evidence before generation and blocks a hallucinated station', async () => {
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
        PUBLIC_LOCATION_SPREADSHEET_ID: 'test-sheet-id',
        PINECONE_API_KEY: '',
        FIREBASE_DB_URL: '',
        RAG_FAIL_CLOSED: '0',
        EVAL_SKIP_FAQ_CACHE: '1',
    });
    delete process.env.PINECONE_INDEX_HOST;
    delete process.env.PINECONE_NAMESPACE;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.LLM_PRIMARY;
    delete process.env.LLM_FALLBACK;
    delete process.env.RAG_GOVERNANCE_FILTER;

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
        assert.equal(done.eval.locationResolutionStatus, 'missing_location_evidence');
        assert.equal(done.eval.locationLookupTexts.some(item => item.source === 'history'), false);
        assert.deepEqual(done.eval.verifiedLocationMatches, []);
        assert.match(done.eval.verifiedLocationPrompt, /STATUS: missing_location_evidence/);
        assert.deepEqual(done.eval.retrievedDocuments, []);
        assert.equal(done.eval.locationSafetyFallback, true);
        assert.match(done.fullText, /chưa thể chỉ một trụ sở cụ thể/);
        assert.doesNotMatch(done.fullText, /Hòa Bình|Thịnh Lang|0973740838|google\.com\/maps/i);
        const emittedText = getEvents(result.body).filter(event => event.text).map(event => event.text).join('\n');
        assert.doesNotMatch(emittedText, /Hòa Bình|Thịnh Lang|0973740838|google\.com\/maps/i);
        assert.equal(done.eval.finalGenerationPrompt.system.includes('STATUS: missing_location_evidence'), true);
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
