const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const handler = require('../api/google-sheet');
const { filterPublicGoogleVisualizationPayload } = require('../api/google-sheet');

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

test('Google Sheet API returns a semantically valid published-locations payload with endpoint cache policy', async () => {
    process.env.GOOGLE_SHEET_ID = 'sheet-id';
    global.fetch = async url => {
        assert.match(String(url), /sheet=Published_Locations/);
        return new Response('google.visualization.Query.setResponse({"table":{"cols":[{"label":"name"},{"label":"coordinates"}],"rows":[{"c":[{"v":"Điểm A"},{"v":"21.325,105.365"}]}]}});');
    };
    const res = createResponse();

    await handler({ method: 'GET', query: {} }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.table.cols.length, 2);
    assert.equal(res.body.table.rows.length, 1);
    assert.equal(res.headers['cache-control'], 'public, s-maxage=60, stale-while-revalidate=300');
});

test('Google Sheet API rejects the three-column source/config mismatch without exposing the sheet ID', async () => {
    process.env.GOOGLE_SHEET_ID = 'private-sheet-id';
    global.fetch = async () => new Response('google.visualization.Query.setResponse({"table":{"cols":[{"label":"Tên Đơn vị"},{"label":"Loại địa điểm"},{"label":"search_aliases"}],"rows":[{"c":[{"v":"Điểm A"},{"v":"Trụ sở"},{"v":"A"}]}]}});');
    const res = createResponse();

    await handler({ method: 'GET', query: {} }, res);

    assert.equal(res.statusCode, 502);
    assert.deepEqual(res.body, { error: 'GOOGLE_SHEET_SCHEMA_MISMATCH' });
    assert.doesNotMatch(JSON.stringify(res.body), /private-sheet-id/);
    assert.equal(res.headers['cache-control'], undefined);
});

test('Google Sheet API rejects a payload without the coordinate semantic column', async () => {
    process.env.GOOGLE_SHEET_ID = 'sheet-id';
    global.fetch = async () => new Response('google.visualization.Query.setResponse({"table":{"cols":[{"label":"name"},{"label":"type"}],"rows":[]}});');
    const res = createResponse();

    await handler({ method: 'GET', query: {} }, res);

    assert.equal(res.statusCode, 502);
    assert.equal(res.body.error, 'GOOGLE_SHEET_SCHEMA_MISMATCH');
});

test('Google Sheet API removes internal columns while preserving approved public fields', () => {
    const payload = filterPublicGoogleVisualizationPayload({
        table: {
            cols: [
                { label: 'record_id' }, { label: 'name' }, { label: 'services' },
                { label: 'submitter_email' }, { label: 'reviewed_by' }, { label: 'secret_note' },
            ],
            rows: [{ c: [{ v: 'LOC_1' }, { v: 'Điểm A' }, { v: 'CITIZEN_ID' }, { v: 'user@example.gov.vn' }, { v: 'reviewer@example.gov.vn' }, { v: 'private' }] }],
        },
    });
    assert.deepEqual(payload.table.cols.map(column => column.label), ['record_id', 'name', 'services']);
    assert.deepEqual(payload.table.rows[0].c.map(cell => cell.v), ['LOC_1', 'Điểm A', 'CITIZEN_ID']);
});

test('Google Sheet API normalizes invalid upstream payloads to 502', async () => {
    process.env.GOOGLE_SHEET_ID = 'sheet-id';
    global.fetch = async () => new Response('not gviz');
    const res = createResponse();

    await handler({ method: 'GET', query: {} }, res);

    assert.equal(res.statusCode, 502);
    assert.equal(res.body.error, 'GOOGLE_UPSTREAM_ERROR');
});

test('Google Sheet API errors never expose a configured sheet ID', async () => {
    process.env.GOOGLE_SHEET_ID = 'private-sheet-id';
    global.fetch = async () => new Response('not gviz');
    const res = createResponse();

    await handler({ method: 'GET', query: {} }, res);

    assert.doesNotMatch(JSON.stringify(res.body), /private-sheet-id/);
});

test('Vercel no-store policy is scoped to chat only', () => {
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
    assert.equal(config.headers[0].source, '/api/chat');
});
