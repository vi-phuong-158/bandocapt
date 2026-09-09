'use strict';

// =====================================================================
// ZALO SESSION — ngữ cảnh hội thoại tối thiểu cho kênh Zalo Bot.
//
// Zalo Bot là kênh PUBLIC, không có định danh người dùng lâu dài như /can-bo. Session ở
// đây CHỈ phục vụ giữ ngữ cảnh vài lượt gần nhất (vd bot hỏi "xã/phường nào?" rồi người
// dùng trả lời ngắn) — không phải một hệ thống hội thoại lâu dài, không đổi privacy
// posture hiện có của dự án (xem docs/brain/02-coding-rules.md, 03-decisions.md
// [2026-09-01] "Location evidence is current-turn scoped and fail-closed").
//
// - Key Firestore KHÔNG lưu chat.id thô: băm bằng HMAC-SHA256 (cùng cơ chế hashForLog
//   trong api/chat.js) trước khi dùng làm document ID.
// - Chỉ lưu tối đa MAX_TURNS lượt gần nhất (mặc định 8 = 4 cặp hỏi/đáp).
// - TTL ngắn (mặc định 45 phút) — hết hạn thì coi như không có lịch sử, không tự gia hạn.
// - Không đổi flow location-evidence: session chỉ cấp `history` cho runChatCore, còn
//   toàn bộ resolver An toàn vị trí vẫn chạy y hệt website (current-turn scoped fail-closed).
// =====================================================================

const crypto = require('crypto');

const SESSION_COLLECTION = process.env.FIRESTORE_ZALO_SESSION_COLLECTION || 'zalo_bot_sessions';
const SESSION_TTL_MS = (() => {
    const minutes = parseInt(process.env.ZALO_SESSION_TTL_MINUTES, 10);
    return Number.isFinite(minutes) && minutes > 0 ? minutes * 60 * 1000 : 45 * 60 * 1000;
})();
const MAX_TURNS = 8;

let firestoreDb = undefined;

function getFirestoreDb() {
    if (firestoreDb !== undefined) return firestoreDb;
    try {
        let serviceAccount = null;
        if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
            serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
        } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
            serviceAccount = {
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            };
        }
        if (!serviceAccount) {
            firestoreDb = null;
            return firestoreDb;
        }
        const { cert, getApps, initializeApp } = require('firebase-admin/app');
        const { getFirestore } = require('firebase-admin/firestore');
        const app = getApps()[0] || initializeApp({ credential: cert(serviceAccount) });
        firestoreDb = getFirestore(app);
        return firestoreDb;
    } catch (e) {
        console.warn('[zalo-session] Không khởi tạo được Firestore:', e.message);
        firestoreDb = null;
        return firestoreDb;
    }
}

// Chỉ dùng cho test: reset cache module-level để mock lại Firestore giữa các ca.
function _resetFirestoreCacheForTest() {
    firestoreDb = undefined;
}

function hashChatId(chatId) {
    const salt = process.env.CHAT_LOG_HASH_SALT;
    if (!salt) {
        console.warn('[zalo-session] CHAT_LOG_HASH_SALT chưa cấu hình — dùng salt dự phòng không an toàn cho local dev.');
    }
    return crypto.createHmac('sha256', salt || 'local-dev-zalo-session-salt')
        .update(String(chatId))
        .digest('hex')
        .substring(0, 32);
}

// Trả về history dạng { role, parts: [{ text }] } — đúng format runChatCore/sanitizeHistory
// đã dùng cho website. Hết hạn hoặc không có Firestore → mảng rỗng (an toàn, fail-open về
// "không có ngữ cảnh" thay vì lỗi cứng chặn cả cuộc hội thoại).
async function getSessionHistory(chatId, options = {}) {
    const db = options.db || getFirestoreDb();
    if (!db) return [];
    try {
        const snap = await db.collection(SESSION_COLLECTION).doc(hashChatId(chatId)).get();
        if (!snap.exists) return [];
        const data = snap.data();
        if (!data || !Array.isArray(data.turns)) return [];
        if (typeof data.expires_at === 'number' && data.expires_at < Date.now()) return [];
        return data.turns;
    } catch (e) {
        console.warn('[zalo-session] Đọc session thất bại:', e.message);
        return [];
    }
}

// Ghi thêm một lượt hỏi/đáp, cắt còn tối đa MAX_TURNS gần nhất, làm mới TTL.
async function appendSessionTurn(chatId, userText, modelText, options = {}) {
    const db = options.db || getFirestoreDb();
    if (!db) return;
    try {
        const existing = await getSessionHistory(chatId, { db });
        const nextTurns = existing.concat([
            { role: 'user', parts: [{ text: String(userText || '') }] },
            { role: 'model', parts: [{ text: String(modelText || '') }] },
        ]).slice(-MAX_TURNS);
        await db.collection(SESSION_COLLECTION).doc(hashChatId(chatId)).set({
            turns: nextTurns,
            updated_at: Date.now(),
            expires_at: Date.now() + SESSION_TTL_MS,
        });
    } catch (e) {
        console.warn('[zalo-session] Ghi session thất bại:', e.message);
    }
}

// =====================================================================
// DEDUPE — chống xử lý trùng khi Zalo retry cùng một webhook delivery.
// Idempotency-Ledger-style: tạo bản ghi MỚI atomically bằng docRef.create() (thất bại nếu
// đã tồn tại) thay vì đọc-rồi-ghi — tránh race giữa hai lần retry đến gần như đồng thời.
// =====================================================================

const DEDUPE_COLLECTION = process.env.FIRESTORE_ZALO_DEDUPE_COLLECTION || 'zalo_bot_dedupe';
const DEDUPE_TTL_MS = (() => {
    const minutes = parseInt(process.env.ZALO_DEDUPE_TTL_MINUTES, 10);
    return Number.isFinite(minutes) && minutes > 0 ? minutes * 60 * 1000 : 15 * 60 * 1000;
})();

function isAlreadyExistsError(e) {
    return Boolean(e) && (e.code === 6 || e.code === 'already-exists' || /already exists/i.test(String(e.message || '')));
}

// Trả về true nếu ĐÂY LÀ LẦN ĐẦU xử lý dedupeKey này (nên tiếp tục gọi AI/gửi tin), false
// nếu là bản trùng trong cửa sổ TTL (bỏ qua, không gọi lại AI, không gửi lại tin). Không có
// Firestore hoặc lỗi hạ tầng → fail-open (true), vì bỏ lỡ một tin nhắn thật tệ hơn xử lý
// trùng hiếm khi hạ tầng lỗi.
async function claimMessageOnce(dedupeKey, options = {}) {
    const db = options.db || getFirestoreDb();
    if (!db) return true;
    const docRef = db.collection(DEDUPE_COLLECTION).doc(dedupeKey);
    try {
        await docRef.create({ claimed_at: Date.now(), expires_at: Date.now() + DEDUPE_TTL_MS });
        return true;
    } catch (e) {
        if (!isAlreadyExistsError(e)) {
            console.warn('[zalo-session] Dedupe claim thất bại:', e.message);
            return true;
        }
        try {
            const snap = await docRef.get();
            const data = snap.exists ? snap.data() : null;
            if (data && typeof data.expires_at === 'number' && data.expires_at > Date.now()) {
                return false; // trùng trong cửa sổ TTL
            }
            // Bản ghi cũ đã hết hạn — coi như lần xử lý mới, làm mới TTL.
            await docRef.set({ claimed_at: Date.now(), expires_at: Date.now() + DEDUPE_TTL_MS });
            return true;
        } catch (innerErr) {
            console.warn('[zalo-session] Dedupe recheck thất bại:', innerErr.message);
            return true;
        }
    }
}

module.exports = {
    getSessionHistory,
    appendSessionTurn,
    claimMessageOnce,
    hashChatId,
    SESSION_TTL_MS,
    MAX_TURNS,
    SESSION_COLLECTION,
    DEDUPE_COLLECTION,
    DEDUPE_TTL_MS,
    _resetFirestoreCacheForTest,
};
