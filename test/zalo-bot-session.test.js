'use strict';

process.env.CHAT_LOG_HASH_SALT = 'test-only-hash-salt';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
    getSessionHistory,
    appendSessionTurn,
    claimMessageOnce,
    hashChatId,
} = require('../lib/zalo-session');

// Fake Firestore tối giản: đủ collection().doc().get()/.set()/.create() để test logic dedupe/
// session mà không cần mạng thật hay firebase-admin — theo đúng chỉ dẫn "mock, không gọi
// Zalo/Firestore thật trong CI" của nhiệm vụ.
function createFakeDb() {
    const store = new Map();
    return {
        _store: store,
        collection(name) {
            return {
                doc(id) {
                    const key = `${name}/${id}`;
                    return {
                        async get() {
                            const data = store.get(key);
                            return { exists: data !== undefined, data: () => data };
                        },
                        async set(value) {
                            store.set(key, value);
                        },
                        async create(value) {
                            if (store.has(key)) {
                                const err = new Error('ALREADY_EXISTS: document already exists');
                                err.code = 6;
                                throw err;
                            }
                            store.set(key, value);
                        },
                    };
                },
            };
        },
    };
}

test('hashChatId: xác định, ổn định và không trả lại chat id thô', () => {
    const hashed = hashChatId('user-12345');
    assert.equal(typeof hashed, 'string');
    assert.equal(hashed, hashChatId('user-12345'));
    assert.equal(hashed.includes('user-12345'), false);
    assert.notEqual(hashed, hashChatId('user-67890'));
});

test('getSessionHistory: không có bản ghi -> mảng rỗng', async () => {
    const db = createFakeDb();
    const history = await getSessionHistory('chat-1', { db });
    assert.deepEqual(history, []);
});

test('appendSessionTurn + getSessionHistory: lưu đúng format { role, parts:[{text}] }', async () => {
    const db = createFakeDb();
    await appendSessionTurn('chat-1', 'Tôi bị mất hộ chiếu', 'Bạn có phải người nước ngoài không?', { db });
    const history = await getSessionHistory('chat-1', { db });
    assert.deepEqual(history, [
        { role: 'user', parts: [{ text: 'Tôi bị mất hộ chiếu' }] },
        { role: 'model', parts: [{ text: 'Bạn có phải người nước ngoài không?' }] },
    ]);
});

test('appendSessionTurn: giữ ngữ cảnh qua nhiều lượt liên tiếp (multi-turn)', async () => {
    const db = createFakeDb();
    await appendSessionTurn('chat-2', 'Tôi bị mất hộ chiếu', 'Bạn có phải người nước ngoài không?', { db });
    let history = await getSessionHistory('chat-2', { db });
    assert.equal(history.length, 2);

    // Lượt 2 dùng chính history vừa đọc để gọi runChatCore trong thực tế; ở đây chỉ xác nhận
    // việc append tiếp không xoá lượt cũ.
    await appendSessionTurn('chat-2', 'Người nước ngoài', 'Bạn cần các giấy tờ sau...', { db });
    history = await getSessionHistory('chat-2', { db });
    assert.equal(history.length, 4);
    assert.equal(history[2].parts[0].text, 'Người nước ngoài');
});

test('appendSessionTurn: chỉ giữ tối đa MAX_TURNS lượt gần nhất', async () => {
    const db = createFakeDb();
    for (let i = 0; i < 10; i++) {
        // eslint-disable-next-line no-await-in-loop
        await appendSessionTurn('chat-3', `câu hỏi ${i}`, `trả lời ${i}`, { db });
    }
    const history = await getSessionHistory('chat-3', { db });
    assert.ok(history.length <= 8, `history dài ${history.length} vượt MAX_TURNS`);
    // Phải là các lượt GẦN NHẤT, không phải các lượt đầu.
    assert.equal(history[history.length - 1].parts[0].text, 'trả lời 9');
});

test('getSessionHistory: hết TTL thì coi như không có lịch sử', async () => {
    const db = createFakeDb();
    await appendSessionTurn('chat-4', 'hỏi', 'đáp', { db });
    // Ghi đè expires_at về quá khứ để mô phỏng hết hạn.
    const raw = await db.collection('zalo_bot_sessions').doc(hashChatId('chat-4')).get();
    await db.collection('zalo_bot_sessions').doc(hashChatId('chat-4')).set({ ...raw.data(), expires_at: Date.now() - 1000 });

    const history = await getSessionHistory('chat-4', { db });
    assert.deepEqual(history, []);
});

test('claimMessageOnce: lần đầu tiên trả true (được phép xử lý)', async () => {
    const db = createFakeDb();
    const claimed = await claimMessageOnce('dedupe-key-1', { db });
    assert.equal(claimed, true);
});

test('claimMessageOnce: cùng key gửi 2 lần trong TTL -> lần 2 là duplicate (false)', async () => {
    const db = createFakeDb();
    const first = await claimMessageOnce('msg-abc', { db });
    const second = await claimMessageOnce('msg-abc', { db });
    assert.equal(first, true);
    assert.equal(second, false);
});

test('claimMessageOnce: text giống nhau nhưng message id khác nhau -> KHÔNG bị coi là duplicate', async () => {
    const db = createFakeDb();
    const crypto = require('crypto');
    const key = (chatId, messageId) => crypto.createHash('sha256').update(`${chatId}:${messageId}`).digest('hex');

    const first = await claimMessageOnce(key('chat-1', 'msg-1'), { db });
    const second = await claimMessageOnce(key('chat-1', 'msg-2'), { db });
    assert.equal(first, true);
    assert.equal(second, true, 'message_id khác nhau phải được xử lý độc lập');
});

test('claimMessageOnce: hết TTL thì key cũ được coi là mới lại', async () => {
    const db = createFakeDb();
    await claimMessageOnce('expiring-key', { db });
    const raw = await db.collection('zalo_bot_dedupe').doc('expiring-key').get();
    await db.collection('zalo_bot_dedupe').doc('expiring-key').set({ ...raw.data(), expires_at: Date.now() - 1000 });

    const reclaimed = await claimMessageOnce('expiring-key', { db });
    assert.equal(reclaimed, true);
});

test('claimMessageOnce: không có Firestore (db null) fail-open, không chặn tin nhắn thật', async () => {
    const claimed = await claimMessageOnce('any-key', { db: null });
    assert.equal(claimed, true);
});
