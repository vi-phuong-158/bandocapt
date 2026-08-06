'use strict';

// js/gemini.js là script trình duyệt — stub tối thiểu global nó chạm tới trước khi require
// (window/location cho getApiUrl + signRequestToken, navigator.userAgent cho ký request).
// crypto.subtle/fetch/TextEncoder/TextDecoder/AbortController dùng thẳng global Node thật.
global.window = { location: { protocol: 'https:', hostname: 'localhost', origin: 'https://localhost' } };
if (typeof global.navigator === 'undefined') {
    global.navigator = { userAgent: 'node-test-agent' };
}

const test = require('node:test');
const assert = require('node:assert/strict');

const { callGeminiStream } = require('../js/gemini.js').__test;

const ORIGINAL_FETCH = global.fetch;
test.afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
});

function sseEvent(obj) {
    return `data: ${JSON.stringify(obj)}\n\n`;
}

// Mock fetch trả về một response SSE giả: `chunkSchedule` là danh sách { delayMs, text } phát
// tuần tự qua reader.read(); sau khi hết mảng, read() "treo" (chỉ resolve done sau `hangAfterMs`,
// hoặc reject sớm khi AbortSignal của request bị abort — mô phỏng đúng hành vi fetch/undici thật).
function installStreamFetch({ chunkSchedule = [], hangAfterMs = 999999999 } = {}) {
    // Mốc để test biết fetch() đã thực sự được gọi, thay vì đoán số vòng event-loop.
    const handle = { fetchCalled: false };
    let index = 0;
    let pendingReject = null;
    // Theo dõi timer đang chờ để clearTimeout khi bị abort — nếu không, timer giả lập
    // "treo" (đặc biệt hangAfterMs lớn ở test KHÔNG bật fake timers) vẫn tồn tại thật trong
    // event loop dù promise đã reject, khiến worker của file test không thoát được khi chạy
    // chung cả bộ (`node --test test/*.test.js` cô lập theo file/worker thread).
    let pendingTimer = null;
    const encoder = new TextEncoder();
    global.fetch = async (_url, options) => {
        handle.fetchCalled = true;
        const signal = options && options.signal;
        // fetch/undici thật: signal đã abort TRƯỚC khi gọi thì fetch() reject ngay, không trả response giả.
        if (signal && signal.aborted) {
            const err = new Error('The operation was aborted.');
            err.name = 'AbortError';
            throw err;
        }
        const onAbort = () => {
            if (pendingReject) {
                clearTimeout(pendingTimer);
                pendingTimer = null;
                const err = new Error('The operation was aborted.');
                err.name = 'AbortError';
                const reject = pendingReject;
                pendingReject = null;
                reject(err);
            }
        };
        if (signal) signal.addEventListener('abort', onAbort, { once: true });
        return {
            ok: true,
            status: 200,
            body: {
                getReader() {
                    return {
                        read() {
                            if (index < chunkSchedule.length) {
                                const { delayMs, text } = chunkSchedule[index++];
                                return new Promise((resolve, reject) => {
                                    pendingReject = reject;
                                    pendingTimer = setTimeout(() => {
                                        pendingReject = null;
                                        resolve({ done: false, value: encoder.encode(text) });
                                    }, delayMs);
                                });
                            }
                            return new Promise((resolve, reject) => {
                                pendingReject = reject;
                                pendingTimer = setTimeout(() => {
                                    pendingReject = null;
                                    resolve({ done: true, value: undefined });
                                }, hangAfterMs);
                            });
                        }
                    };
                }
            }
        };
    };
    return handle;
}

// Nhường đúng một lượt event loop THẬT. `setImmediate` không nằm trong nhóm API bị mock nên
// vẫn chạy bình thường, và mỗi lượt như vậy xả sạch microtask queue — chắc chắn hơn hẳn việc
// đếm số lần `await Promise.resolve()`, vốn phụ thuộc lịch microtask của từng bản Node.
function yieldToEventLoop() {
    return new Promise(resolve => setImmediate(resolve));
}

// Đẩy đồng hồ giả `ms` rồi nhường event loop để async function bên trong kịp tiếp tục
// (await reader.read() đã resolve/reject) trước khi tick tiếp — cần thiết vì setTimeout lồng
// nhau được lập lại TRONG lúc xử lý callback không tự chạy trong cùng 1 tick().
async function tickAndFlush(t, ms, flushes = 2) {
    t.mock.timers.tick(ms);
    for (let i = 0; i < flushes; i++) {
        await yieldToEventLoop();
    }
}

// signRequestToken() ký HMAC bằng WebCrypto thật (không mock), hoàn tất qua nhiều vòng event
// loop thật. Phải đợi fetch() được gọi RỒI mới bắt đầu tick, nếu không đồng hồ giả nhảy trước
// khi code kịp đăng ký setTimeout và cả luồng đứng im.
// Trước đây chỗ này đợi cứng 6 vòng `setImmediate`: đủ trên Node 24 nhưng không đủ trên Node 20
// của CI, làm promise treo và node huỷ toàn bộ test còn lại trong file. Đợi theo mốc thật thì
// không còn phụ thuộc phiên bản.
async function waitForFetchCall(handle, maxRounds = 500) {
    for (let round = 0; round < maxRounds; round++) {
        if (handle.fetchCalled) return;
        await yieldToEventLoop();
    }
    throw new Error(`fetch() vẫn chưa được gọi sau ${maxRounds} vòng event loop — mock chưa vào guồng.`);
}

// Chờ promise settle sau khi đã tick hết ngân sách thời gian giả của test. Nếu vẫn treo thì
// ném lỗi nêu rõ test nào, thay vì để node bỏ dở cả file với thông báo khó lần
// 'Promise resolution is still pending but the event loop has already resolved'.
async function settled(promise, label, maxRounds = 500) {
    let done = false;
    const tracked = promise.then(
        value => { done = true; return value; },
        error => { done = true; throw error; }
    );
    for (let round = 0; round < maxRounds && !done; round++) {
        await yieldToEventLoop();
    }
    if (!done) {
        tracked.catch(() => {}); // tránh unhandled rejection nếu nó settle muộn sau khi test đã hỏng
        throw new Error(`${label}: promise chưa settle sau khi đã tick hết ngân sách thời gian giả.`);
    }
    return tracked;
}

test('Test 4: external stop signal returns USER_CANCELLED, not TIMEOUT', async () => {
    installStreamFetch({ hangAfterMs: 999999999 });
    const externalController = new AbortController();
    const promise = callGeminiStream('câu hỏi', [], () => {}, externalController.signal);
    externalController.abort();
    const result = await settled(promise, 'Test 4');
    assert.deepEqual(result, { ok: false, error: 'USER_CANCELLED' });
});

test('Test 4b: signal already aborted before call still maps to USER_CANCELLED', async () => {
    installStreamFetch({ hangAfterMs: 999999999 });
    const externalController = new AbortController();
    externalController.abort();
    const result = await callGeminiStream('câu hỏi', [], () => {}, externalController.signal);
    assert.deepEqual(result, { ok: false, error: 'USER_CANCELLED' });
});

test('Test 5: 25s with no data aborts with IDLE_TIMEOUT', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const fetchHandle = installStreamFetch({ hangAfterMs: 999999999 });
    const promise = callGeminiStream('câu hỏi', []);
    await waitForFetchCall(fetchHandle);
    for (let i = 0; i < 7; i++) {
        await tickAndFlush(t, 5000);
    }
    const result = await settled(promise, 'Test 5');
    assert.deepEqual(result, { ok: false, error: 'IDLE_TIMEOUT' });
});

test('Test 6: periodic status heartbeats keep resetting the idle timer past 25s total', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    // 4 khoảng cách 10s (< 25s ngưỡng idle) rồi done — tổng 40s > 25s nhưng không khoảng nào chạm ngưỡng.
    const fetchHandle = installStreamFetch({
        chunkSchedule: [
            { delayMs: 10000, text: sseEvent({ status: 'generating' }) },
            { delayMs: 10000, text: sseEvent({ status: 'generating' }) },
            { delayMs: 10000, text: sseEvent({ text: 'Xin chào' }) },
            { delayMs: 10000, text: sseEvent({ done: true, fullText: 'Xin chào', history: [], sources: [], verifiedLocations: [] }) },
        ],
        // Sau event `done` cuối, server đóng kết nối gần như ngay lập tức (res.end()) — lần
        // read() kế tiếp phải trả reader-level done:true để vòng lặp client thoát ra.
        hangAfterMs: 100,
    });
    const promise = callGeminiStream('câu hỏi', []);
    await waitForFetchCall(fetchHandle);
    for (let i = 0; i < 5; i++) {
        await tickAndFlush(t, 10000);
    }
    const result = await settled(promise, 'Test 6');
    assert.equal(result.ok, true);
    assert.equal(result.fullText, 'Xin chào');
});

test('Test 7: total request budget of 65s aborts with REQUEST_TIMEOUT despite periodic heartbeats', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    // Heartbeat mỗi 5s (luôn < 25s ngưỡng idle) lặp đủ dài để timer tổng 65s là bên chạm trước.
    const chunkSchedule = Array.from({ length: 20 }, () => ({
        delayMs: 5000,
        text: sseEvent({ status: 'generating' }),
    }));
    const fetchHandle = installStreamFetch({ chunkSchedule, hangAfterMs: 999999999 });
    const promise = callGeminiStream('câu hỏi', []);
    await waitForFetchCall(fetchHandle);
    for (let i = 0; i < 14; i++) {
        await tickAndFlush(t, 5000);
    }
    const result = await settled(promise, 'Test 7');
    assert.deepEqual(result, { ok: false, error: 'REQUEST_TIMEOUT' });
});

test('Test 8: partial text received then aborted returns STREAM_ERROR with partialText', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const fetchHandle = installStreamFetch({
        chunkSchedule: [
            { delayMs: 1000, text: sseEvent({ text: 'Xin chào, ' }) },
        ],
        hangAfterMs: 999999999,
    });
    const promise = callGeminiStream('câu hỏi', []);
    await waitForFetchCall(fetchHandle);
    await tickAndFlush(t, 1000);
    // Sau khi đã có text, chờ đủ 25s để idle timeout kích hoạt abort — vẫn phải ưu tiên STREAM_ERROR.
    for (let i = 0; i < 6; i++) {
        await tickAndFlush(t, 5000);
    }
    const result = await settled(promise, 'Test 8');
    assert.equal(result.ok, false);
    assert.equal(result.error, 'STREAM_ERROR');
    assert.equal(result.partialText, 'Xin chào, ');
});

test('Test 9: user cancel is not overridden by a later-firing request timeout', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    installStreamFetch({ hangAfterMs: 999999999 });
    const externalController = new AbortController();
    const promise = callGeminiStream('câu hỏi', [], () => {}, externalController.signal);
    externalController.abort(); // user_cancelled ghi nhận trước, đồng thời reject read() đang treo
    // Đẩy đồng hồ qua mốc 65s — callback request-timeout vẫn chạy nhưng KHÔNG được ghi đè lý do.
    for (let i = 0; i < 14; i++) {
        await tickAndFlush(t, 5000);
    }
    const result = await settled(promise, 'Test 9');
    assert.deepEqual(result, { ok: false, error: 'USER_CANCELLED' });
});

test('Test 10: normal success flow (status + text chunks + done) is unchanged', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const fetchHandle = installStreamFetch({
        chunkSchedule: [
            { delayMs: 10, text: sseEvent({ status: 'generating' }) },
            { delayMs: 10, text: sseEvent({ text: 'Xin ' }) },
            { delayMs: 10, text: sseEvent({ text: 'chào bạn' }) },
            {
                delayMs: 10,
                text: sseEvent({
                    done: true,
                    fullText: 'Xin chào bạn',
                    history: [{ role: 'user', parts: [{ text: 'câu hỏi' }] }],
                    sources: [{ file: 'law.pdf' }],
                    verifiedLocations: [{ name: 'Trụ sở A' }],
                }),
            },
        ],
        // Sau event `done` cuối, server đóng kết nối gần như ngay lập tức (res.end()) — lần
        // read() kế tiếp phải trả reader-level done:true để vòng lặp client thoát ra.
        hangAfterMs: 10,
    });
    const chunks = [];
    const statuses = [];
    const promise = callGeminiStream('câu hỏi', [], (c) => chunks.push(c), undefined, (s) => statuses.push(s));
    await waitForFetchCall(fetchHandle);
    for (let i = 0; i < 5; i++) {
        await tickAndFlush(t, 10);
    }
    const result = await settled(promise, 'Test 10');
    assert.equal(result.ok, true);
    assert.equal(result.fullText, 'Xin chào bạn');
    assert.equal(chunks.join(''), 'Xin chào bạn');
    assert.deepEqual(statuses, ['generating']);
    assert.deepEqual(result.sources, [{ file: 'law.pdf' }]);
    assert.deepEqual(result.verifiedLocations, [{ name: 'Trụ sở A' }]);
    assert.equal(result.history.length, 1);
});
