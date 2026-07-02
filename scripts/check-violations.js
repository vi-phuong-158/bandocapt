// P1.2.2: Đọc RTDB fallback `chat_logs_metrics/<date_key>` và in báo cáo tỉ lệ
// output_validator_violation theo ngày. Chạy tay hoặc cron sau — không dựng hạ tầng alert mới.
//
// Cách dùng:
//   node scripts/check-violations.js                # ngày hôm nay (giờ VN)
//   node scripts/check-violations.js 2026_07_02      # 1 ngày cụ thể (đúng format date_key)
//   node scripts/check-violations.js 2026_06_28 2026_07_02   # khoảng ngày (2 tham số)

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

function toDateKey(date) {
    return date.toISOString().slice(0, 10).replace(/-/g, '_');
}

function parseDateKey(key) {
    const [y, m, d] = key.split('_').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
}

function enumerateDateKeys(fromKey, toKey) {
    const from = parseDateKey(fromKey);
    const to = parseDateKey(toKey);
    const keys = [];
    for (let d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
        keys.push(toDateKey(d));
    }
    return keys;
}

async function fetchDayMetrics(dbUrl, auth, dateKey) {
    const res = await fetch(`${dbUrl}/chat_logs_metrics/${dateKey}.json${auth}`);
    if (!res.ok) throw new Error(`Firebase read failed (${res.status}) cho ${dateKey}`);
    const data = await res.json();
    if (!data) return [];
    return Object.values(data);
}

function summarize(entries) {
    const total = entries.length;
    const withViolation = entries.filter(e => (e.output_validator_violation_count || 0) > 0);
    const typeCounts = {};
    for (const e of withViolation) {
        for (const type of e.output_validator_violation_types || []) {
            typeCounts[type] = (typeCounts[type] || 0) + 1;
        }
    }
    return {
        total,
        violationCount: withViolation.length,
        violationRate: total > 0 ? withViolation.length / total : 0,
        typeCounts,
    };
}

async function main() {
    const dbUrl = process.env.FIREBASE_DB_URL;
    if (!dbUrl) {
        console.error('FIREBASE_DB_URL chưa được cấu hình trong .env');
        process.exit(1);
    }
    const auth = process.env.FIREBASE_DB_SECRET ? `?auth=${process.env.FIREBASE_DB_SECRET}` : '';

    const [argFrom, argTo] = process.argv.slice(2);
    const todayKey = toDateKey(new Date(Date.now() + 7 * 60 * 60 * 1000));
    const dateKeys = argFrom
        ? enumerateDateKeys(argFrom, argTo || argFrom)
        : [todayKey];

    console.log(`[check-violations] Đọc ${dateKeys.length} ngày: ${dateKeys.join(', ')}\n`);

    for (const dateKey of dateKeys) {
        let entries;
        try {
            entries = await fetchDayMetrics(dbUrl, auth, dateKey);
        } catch (e) {
            console.warn(`  ${dateKey}: lỗi đọc (${e.message})`);
            continue;
        }
        if (entries.length === 0) {
            console.log(`  ${dateKey}: không có dữ liệu`);
            continue;
        }
        const { total, violationCount, violationRate, typeCounts } = summarize(entries);
        console.log(`  ${dateKey}: ${total} lượt chat, ${violationCount} lượt có violation (${(violationRate * 100).toFixed(1)}%)`);
        for (const [type, count] of Object.entries(typeCounts)) {
            console.log(`    - ${type}: ${count}`);
        }
    }
}

main().catch(e => {
    console.error('[check-violations] Lỗi:', e);
    process.exit(1);
});
