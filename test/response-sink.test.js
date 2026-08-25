'use strict';

// Sink là ranh giới giữa orchestration và transport. Hai bài kiểm ở đây khoá đúng
// hai tính chất khiến ranh giới đó có giá trị:
//   1. SseSink phát ra ĐÚNG các byte mà handler vốn ghi thẳng vào `res`.
//   2. BufferSink nhận cùng chuỗi sự kiện đó mà không cần HTTP.

const assert = require('node:assert/strict');
const test = require('node:test');

const { createSseSink, createBufferSink, startSseHeartbeat } = require('../lib/response-sink');

function createRecordingRes() {
    const res = { ops: [], headersSent: false };
    res.writeHead = (code, headers) => { res.headersSent = true; res.ops.push(['writeHead', code, headers]); return res; };
    res.write = chunk => { res.ops.push(['write', String(chunk)]); return true; };
    res.end = () => { res.ops.push(['end']); return res; };
    res.status = code => { res.ops.push(['status', code]); return res; };
    res.json = payload => { res.headersSent = true; res.ops.push(['json', payload]); return res; };
    return res;
}

test('SseSink giữ nguyên khung byte của SSE', () => {
    const res = createRecordingRes();
    const sink = createSseSink(res);

    assert.equal(sink.isOpen, false);
    sink.open({ 'Content-Type': 'text/event-stream' });
    assert.equal(sink.isOpen, true, 'mở stream xong thì isOpen phải phản ánh headersSent');
    sink.event({ text: 'Xin chào' });
    sink.event({ done: true, fullText: 'Xin chào', sources: [] });
    sink.close();

    assert.deepEqual(res.ops, [
        ['writeHead', 200, { 'Content-Type': 'text/event-stream' }],
        ['write', 'data: {"text":"Xin chào"}\n\n'],
        ['write', 'data: {"done":true,"fullText":"Xin chào","sources":[]}\n\n'],
        ['end'],
    ]);
});

test('SseSink.fail đi qua status().json() và không mở stream', () => {
    const res = createRecordingRes();
    const sink = createSseSink(res);
    sink.fail(503, { error: 'SERVICE_UNAVAILABLE' });
    assert.deepEqual(res.ops, [['status', 503], ['json', { error: 'SERVICE_UNAVAILABLE' }]]);
});

test('BufferSink nhận cùng chuỗi sự kiện mà không cần HTTP', () => {
    const sink = createBufferSink();

    assert.equal(sink.isOpen, false);
    sink.open({ 'Content-Type': 'text/event-stream' });
    assert.equal(sink.isOpen, true);
    sink.event({ text: 'Câu một. ' });
    sink.event({ text: 'Câu hai.' });
    sink.event({ done: true, fullText: 'Câu một. Câu hai.', sources: [{ title: 'Nguồn' }] });
    sink.close();

    const result = sink.result();
    assert.equal(result.closed, true);
    assert.equal(result.failure, null);
    assert.equal(result.events.length, 3);
    // Toàn văn câu trả lời lấy được mà không cần parse SSE.
    assert.equal(result.done.fullText, 'Câu một. Câu hai.');
    assert.deepEqual(result.done.sources, [{ title: 'Nguồn' }]);
});

test('BufferSink giữ lại lỗi thay vì ghi ra transport', () => {
    const sink = createBufferSink();
    sink.fail(500, { error: 'UNKNOWN_ERROR', detail: 'nội bộ' });
    const result = sink.result();
    assert.deepEqual(result.failure, { status: 500, payload: { error: 'UNKNOWN_ERROR', detail: 'nội bộ' } });
    assert.equal(result.done, null);
    assert.equal(result.events.length, 0);
});

test('BufferSink.startHeartbeat là no-op an toàn — không có kết nối nào để giữ', () => {
    const sink = createBufferSink();
    const stop = sink.startHeartbeat();
    assert.equal(typeof stop, 'function');
    assert.doesNotThrow(() => { stop(); stop(); });
    assert.equal(sink.result().events.length, 0, 'heartbeat không được lọt vào chuỗi sự kiện');
});

test('startSseHeartbeat vẫn export được từ lib và dừng sạch', (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    const writes = [];
    const res = { write: chunk => { writes.push(String(chunk)); return true; }, writableEnded: false, destroyed: false };
    const stop = startSseHeartbeat(res, 5000);
    t.mock.timers.tick(5000);
    t.mock.timers.tick(5000);
    assert.deepEqual(writes, [
        'data: {"status":"generating"}\n\n',
        'data: {"status":"generating"}\n\n',
    ]);
    stop();
    t.mock.timers.tick(20000);
    assert.equal(writes.length, 2);
});

// Bằng chứng abstraction dùng được cho kênh không phải trình duyệt: phát lại ĐÚNG
// chuỗi sự kiện mà handler đã sinh ra trong golden (output thật, không phải dữ liệu
// bịa) qua BufferSink và dựng lại toàn văn câu trả lời mà không có HTTP nào.
test('BufferSink dựng lại câu trả lời từ chuỗi sự kiện thật của golden', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const golden = JSON.parse(
        fs.readFileSync(path.join(__dirname, 'golden', 'stream-generation.json'), 'utf8')
    );

    const sink = createBufferSink();
    for (const op of golden.ops) {
        if (op.op === 'writeHead') sink.open(Object.fromEntries(op.headers));
        else if (op.op === 'write') sink.event(JSON.parse(op.chunk.replace(/^data: /, '').trim()));
        else if (op.op === 'end') sink.close();
    }

    const result = sink.result();
    assert.equal(result.closed, true);
    assert.ok(result.done, 'phải bắt được sự kiện done');

    // Toàn văn ghép từ các segment đã qua validator phải khớp fullText của sự kiện done —
    // tức Messenger sẽ nhận đúng văn bản đã được kiểm chứng như website, không phải bản khác.
    const streamed = result.events.filter(e => typeof e.text === 'string').map(e => e.text).join('');
    assert.equal(streamed, result.done.fullText);
    assert.ok(result.done.fullText.length > 0);
});
