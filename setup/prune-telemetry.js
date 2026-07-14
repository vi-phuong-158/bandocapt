const { listExpiredTelemetryKeys } = require('../api/chat');

const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL || '';
const FIREBASE_DB_SECRET = process.env.FIREBASE_DB_SECRET || '';

function withQuery(path, params = {}) {
    const query = { ...(FIREBASE_DB_SECRET ? { auth: FIREBASE_DB_SECRET } : {}), ...params };
    const qs = Object.entries(query).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    return `${FIREBASE_DB_URL}/${path}.json${qs ? `?${qs}` : ''}`;
}

// dateKey -> entryKey -> { ..., expires_at } — xóa từng entry đã hết hạn.
const EXPIRING_ENTRY_COLLECTIONS = ['chat_logs_metrics', 'chat_logs_diagnostic', 'chat_feedback'];

// dateKey -> dữ liệu không có expires_at riêng (counter rate-limit / groundedness check) — xóa
// nguyên nhánh theo tuổi dateKey khi vượt retention.
const DATE_SUBTREE_COLLECTIONS = ['usage_ips', 'feedback_ip_counts', 'groundedness_checks'];

function getPositiveEnvInt(name, fallback) {
    const value = parseInt(process.env[name], 10);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

const COUNTER_RETENTION_DAYS = getPositiveEnvInt('TELEMETRY_COUNTER_RETENTION_DAYS', 7);

async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return response.json();
}

async function pruneCollection(collectionPath, now = new Date()) {
    const tree = await fetchJson(withQuery(collectionPath));
    if (!tree || typeof tree !== 'object') {
        return { collectionPath, deleted: 0 };
    }

    let deleted = 0;

    for (const [dateKey, entries] of Object.entries(tree)) {
        if (!entries || typeof entries !== 'object') continue;

        for (const entryKey of listExpiredTelemetryKeys(entries, now)) {
            await fetchJson(withQuery(`${collectionPath}/${dateKey}/${entryKey}`), { method: 'DELETE' });
            deleted += 1;
        }
    }

    return { collectionPath, deleted };
}

// dateKey dạng YYYY_MM_DD -> số ngày đã trôi qua kể từ dateKey, null nếu không parse được.
function dateKeyAgeDays(dateKey, now) {
    const match = /^(\d{4})_(\d{2})_(\d{2})$/.exec(dateKey);
    if (!match) return null;
    const [, y, m, d] = match;
    const keyDate = new Date(Number(y), Number(m) - 1, Number(d));
    if (Number.isNaN(keyDate.getTime())) return null;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((today - keyDate) / (24 * 60 * 60 * 1000));
}

// Không có expires_at theo từng entry (counter số/boolean rẻ) nên dùng shallow=true chỉ liệt kê
// dateKey rồi xóa nguyên nhánh khi quá hạn, tránh tải toàn bộ dữ liệu con để prune.
async function pruneDateSubtree(collectionPath, retentionDays, now = new Date()) {
    const dateKeys = await fetchJson(withQuery(collectionPath, { shallow: 'true' }));
    if (!dateKeys || typeof dateKeys !== 'object') {
        return { collectionPath, deleted: 0 };
    }

    let deleted = 0;

    for (const dateKey of Object.keys(dateKeys)) {
        const ageDays = dateKeyAgeDays(dateKey, now);
        if (ageDays === null || ageDays < retentionDays) continue;
        await fetchJson(withQuery(`${collectionPath}/${dateKey}`), { method: 'DELETE' });
        deleted += 1;
    }

    return { collectionPath, deleted };
}

async function main() {
    if (!FIREBASE_DB_URL) {
        throw new Error('FIREBASE_DB_URL is required');
    }

    const results = [];
    for (const collectionPath of EXPIRING_ENTRY_COLLECTIONS) {
        results.push(await pruneCollection(collectionPath));
    }
    for (const collectionPath of DATE_SUBTREE_COLLECTIONS) {
        results.push(await pruneDateSubtree(collectionPath, COUNTER_RETENTION_DAYS));
    }

    const totalDeleted = results.reduce((sum, result) => sum + result.deleted, 0);
    console.log(JSON.stringify({ ok: true, totalDeleted, results }, null, 2));
}

main().catch(error => {
    console.error('[prune-telemetry] Failed:', error.message);
    process.exitCode = 1;
});
