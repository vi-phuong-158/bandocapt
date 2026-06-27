const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const handler = require('../api/google-sheet');

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_SHEET_ID = process.env.GOOGLE_SHEET_ID;

function createResponse() {
    return {
        headers: {},
        statusCode: 200,
        body: undefined,
        setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
    };
}

test.afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
    if (ORIGINAL_SHEET_ID === undefined) delete process.env.GOOGLE_SHEET_ID;
    else process.env.GOOGLE_SHEET_ID = ORIGINAL_SHEET_ID;
});

test('Google Sheet API rejects non-published sheets without upstream calls', async () => {
    process.env.GOOGLE_SHEET_ID = 'sheet-id';
    let calls = 0;
    global.fetch = async () => { calls += 1; };
    const res = createResponse();

    await handler({ method: 'GET', query: { sheet: 'Form_Responses' } }, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'SHEET_NOT_ALLOWED');
    assert.equal(calls, 0);
});

test('Google Sheet API fails closed when GOOGLE_SHEET_ID is missing', async () => {
    delete process.env.GOOGLE_SHEET_ID;
    let calls = 0;
    global.fetch = async () => { calls += 1; };
    const res = createResponse();

    await handler({ method: 'GET', query: {} }, res);

    assert.equal(res.statusCode, 503);
    assert.equal(res.body.error, 'SERVICE_UNAVAILABLE');
    assert.equal(calls, 0);
});

test('Google Sheet API returns validated payload with endpoint cache policy', async () => {
    process.env.GOOGLE_SHEET_ID = 'sheet-id';
    global.fetch = async url => {
        assert.match(String(url), /sheet=Published_Locations/);
        return new Response('google.visualization.Query.setResponse({"table":{"cols":[],"rows":[]}});');
    };
    const res = createResponse();

    await handler({ method: 'GET', query: {} }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { table: { cols: [], rows: [] } });
    assert.equal(res.headers['cache-control'], 'public, s-maxage=60, stale-while-revalidate=300');
});

test('Google Sheet API normalizes invalid upstream payloads to 502', async () => {
    process.env.GOOGLE_SHEET_ID = 'sheet-id';
    global.fetch = async () => new Response('not gviz');
    const res = createResponse();

    await handler({ method: 'GET', query: {} }, res);

    assert.equal(res.statusCode, 502);
    assert.equal(res.body.error, 'GOOGLE_UPSTREAM_ERROR');
});

test('Vercel no-store policy is scoped to chat only', () => {
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
    assert.equal(config.headers[0].source, '/api/chat');
});
