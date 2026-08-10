'use strict';

const {
    normalizePublishedLocations,
    validatePublishedLocationsSchema,
} = require('../js/location-data');

const PUBLISHED_SHEET = 'Published_Locations';

function resolveApiUrl(args = process.argv.slice(2), env = process.env) {
    const flagIndex = args.indexOf('--url');
    const target = flagIndex >= 0 ? args[flagIndex + 1] :
        env.PUBLISHED_LOCATIONS_API_URL || env.PUBLISHED_LOCATIONS_BASE_URL;
    if (!target) throw new Error('VERIFY_TARGET_REQUIRED');

    const url = new URL(target);
    if (!url.pathname.endsWith('/api/google-sheet')) {
        url.pathname = `${url.pathname.replace(/\/$/, '')}/api/google-sheet`;
    }
    url.searchParams.set('sheet', PUBLISHED_SHEET);
    return url.toString();
}

async function verifyPublishedLocations(options = {}) {
    const fetchImpl = options.fetchImpl || fetch;
    const response = await fetchImpl(options.apiUrl);
    if (!response.ok) throw new Error(`VERIFY_HTTP_${response.status}`);

    const payload = await response.json();
    const schema = validatePublishedLocationsSchema(payload?.table, { allowLegacy: false });
    if (!schema.ok) throw new Error('VERIFY_SCHEMA_MISMATCH');

    const rows = payload.table.rows.length;
    const normalized = normalizePublishedLocations(payload, { allowLegacy: false });
    const valid = normalized.locations.length;
    const rejected = normalized.rejected.length;
    if (rows === 0) throw new Error('VERIFY_NO_PUBLISHED_LOCATIONS');
    if (valid === 0) throw new Error('VERIFY_NO_VALID_COORDINATES');

    return { rows, valid, rejected };
}

async function main() {
    try {
        const result = await verifyPublishedLocations({ apiUrl: resolveApiUrl() });
        console.log(`Published_Locations verified: rows=${result.rows} valid=${result.valid} rejected=${result.rejected}`);
    } catch (error) {
        console.error(`Published_Locations verification failed: ${error.message || 'VERIFY_FAILED'}`);
        process.exitCode = 1;
    }
}

if (require.main === module) main();

module.exports = {
    resolveApiUrl,
    verifyPublishedLocations,
};
