const { listExpiredTelemetryKeys } = require('../api/chat');

const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL || '';
const FIREBASE_AUTH = process.env.FIREBASE_DB_SECRET ? `?auth=${process.env.FIREBASE_DB_SECRET}` : '';
const COLLECTIONS = ['chat_logs_metrics', 'chat_logs_diagnostic'];

async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return response.json();
}

async function pruneCollection(collectionPath, now = new Date()) {
    const tree = await fetchJson(`${FIREBASE_DB_URL}/${collectionPath}.json${FIREBASE_AUTH}`);
    if (!tree || typeof tree !== 'object') {
        return { collectionPath, deleted: 0 };
    }

    let deleted = 0;

    for (const [dateKey, entries] of Object.entries(tree)) {
        if (!entries || typeof entries !== 'object') continue;

        for (const entryKey of listExpiredTelemetryKeys(entries, now)) {
            await fetchJson(`${FIREBASE_DB_URL}/${collectionPath}/${dateKey}/${entryKey}.json${FIREBASE_AUTH}`, {
                method: 'DELETE'
            });
            deleted += 1;
        }
    }

    return { collectionPath, deleted };
}

async function main() {
    if (!FIREBASE_DB_URL) {
        throw new Error('FIREBASE_DB_URL is required');
    }

    const results = [];
    for (const collectionPath of COLLECTIONS) {
        results.push(await pruneCollection(collectionPath));
    }

    const totalDeleted = results.reduce((sum, result) => sum + result.deleted, 0);
    console.log(JSON.stringify({ ok: true, totalDeleted, results }, null, 2));
}

main().catch(error => {
    console.error('[prune-telemetry] Failed:', error.message);
    process.exitCode = 1;
});
