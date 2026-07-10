// Đọc báo cáo người dùng gửi về chatbot từ RTDB `chat_feedback/<date_key>` và in ra để admin
// rà soát và điều chỉnh KB/prompt. Chạy tay hoặc cron sau — không dựng hạ tầng alert mới.
//
// Cách dùng:
//   node scripts/read-feedback.js                     # hôm nay (giờ VN)
//   node scripts/read-feedback.js 2026_07_10          # 1 ngày cụ thể (đúng format date_key)
//   node scripts/read-feedback.js 2026_07_01 2026_07_10   # khoảng ngày (2 tham số)
//   node scripts/read-feedback.js --down 2026_07_10   # chỉ xem phiếu 👎 (báo cáo)

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const CATEGORY_LABELS = {
    sai_thong_tin: 'Sai thông tin',
    thieu_thong_tin: 'Thiếu thông tin',
    khong_lien_quan: 'Không liên quan',
    ngon_tu: 'Ngôn từ không phù hợp',
    khac: 'Khác',
};

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

async function fetchDayFeedback(dbUrl, auth, dateKey) {
    const res = await fetch(`${dbUrl}/chat_feedback/${dateKey}.json${auth}`);
    if (!res.ok) throw new Error(`Firebase read failed (${res.status}) cho ${dateKey}`);
    const data = await res.json();
    if (!data) return [];
    return Object.values(data);
}

function printEntry(entry) {
    const icon = entry.rating === 'up' ? '👍' : '👎';
    const category = entry.category ? ` [${CATEGORY_LABELS[entry.category] || entry.category}]` : '';
    console.log(`  ${icon}${category}  turn=${entry.turn_id || '?'}`);
    if (entry.question) console.log(`     Hỏi:   ${entry.question}`);
    if (entry.answer) console.log(`     Đáp:   ${entry.answer}`);
    if (entry.comment) console.log(`     Mô tả: ${entry.comment}`);
    if (entry.contact) console.log(`     Liên hệ: ${entry.contact}`);
    console.log('');
}

async function main() {
    const dbUrl = process.env.FIREBASE_DB_URL;
    if (!dbUrl) {
        console.error('FIREBASE_DB_URL chưa được cấu hình trong .env');
        process.exit(1);
    }
    const auth = process.env.FIREBASE_DB_SECRET ? `?auth=${process.env.FIREBASE_DB_SECRET}` : '';

    const args = process.argv.slice(2);
    const downOnly = args.includes('--down');
    const [argFrom, argTo] = args.filter(a => a !== '--down');
    const todayKey = toDateKey(new Date(Date.now() + 7 * 60 * 60 * 1000));
    const dateKeys = argFrom
        ? enumerateDateKeys(argFrom, argTo || argFrom)
        : [todayKey];

    console.log(`[read-feedback] Đọc ${dateKeys.length} ngày: ${dateKeys.join(', ')}${downOnly ? ' (chỉ 👎)' : ''}\n`);

    let grandTotal = 0;
    let grandDown = 0;
    for (const dateKey of dateKeys) {
        let entries;
        try {
            entries = await fetchDayFeedback(dbUrl, auth, dateKey);
        } catch (e) {
            console.warn(`  ${dateKey}: lỗi đọc (${e.message})`);
            continue;
        }
        if (downOnly) entries = entries.filter(e => e.rating === 'down');
        const down = entries.filter(e => e.rating === 'down').length;
        grandTotal += entries.length;
        grandDown += down;

        console.log(`━━ ${dateKey}: ${entries.length} phản hồi (${down} 👎) ━━`);
        if (entries.length === 0) {
            console.log('  (không có dữ liệu)\n');
            continue;
        }
        entries
            .sort((a, b) => (a.created_at || 0) - (b.created_at || 0))
            .forEach(printEntry);
    }

    console.log(`Tổng: ${grandTotal} phản hồi, trong đó ${grandDown} phiếu 👎.`);
}

main().catch(e => {
    console.error('[read-feedback] Lỗi:', e);
    process.exit(1);
});
