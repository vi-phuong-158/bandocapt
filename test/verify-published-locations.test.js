const assert = require('node:assert/strict');
const test = require('node:test');

const {
    resolveApiUrl,
    verifyPublishedLocations,
} = require('../scripts/verify-published-locations');

test('published locations verifier builds a read-only API URL and reports dataset counts', async () => {
    const apiUrl = resolveApiUrl(['--url', 'https://candidate.example']);
    assert.equal(apiUrl, 'https://candidate.example/api/google-sheet?sheet=Published_Locations');

    const result = await verifyPublishedLocations({
        apiUrl,
        fetchImpl: async () => ({
            ok: true,
            json: async () => ({
                table: {
                    cols: [{ label: 'name' }, { label: 'coordinates' }],
                    rows: [{ c: [{ v: 'Điểm A' }, { v: '21.325,105.365' }] }],
                },
            }),
        }),
    });

    assert.deepEqual(result, { rows: 1, valid: 1, rejected: 0 });
});

test('published locations verifier rejects the incident schema before reporting a successful smoke test', async () => {
    await assert.rejects(() => verifyPublishedLocations({
        apiUrl: 'https://candidate.example/api/google-sheet?sheet=Published_Locations',
        fetchImpl: async () => ({
            ok: true,
            json: async () => ({
                table: {
                    cols: [{ label: 'Tên Đơn vị' }, { label: 'Loại địa điểm' }, { label: 'search_aliases' }],
                    rows: [{ c: [{ v: 'Điểm A' }, { v: 'Trụ sở' }, { v: 'A' }] }],
                },
            }),
        }),
    }), /VERIFY_SCHEMA_MISMATCH/);
});
