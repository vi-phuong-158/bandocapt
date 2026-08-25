'use strict';

// =====================================================================
// RESPONSE SINK — ranh giới duy nhất giữa orchestration của /api/chat và transport.
//
// Trước đây phần điều phối RAG ghi thẳng vào `res` (writeHead/write/end/status),
// nên nó chỉ chạy được sau một HTTP response của Node. Sink tách đúng chỗ đó:
// orchestration phát SỰ KIỆN, sink quyết định biến sự kiện thành cái gì.
//
//   SseSink     — tái tạo CHÍNH XÁC các byte mà handler vốn ghi ra `res`.
//   BufferSink  — tích luỹ cùng chuỗi sự kiện trong bộ nhớ, không cần HTTP.
//
// Sink KHÔNG biết gì về nội dung nghiệp vụ: không định dạng, không diễn giải,
// không quyết định cái gì được gửi. Nó chỉ là nơi byte đi ra.
// =====================================================================

// Giữ SSE sống trong lúc backend vẫn xử lý (đợi model / buffer đến ranh giới câu cho
// output-validator) — chỉ phát lại event trạng thái đã có sẵn (`status: 'generating'`),
// KHÔNG chứa nội dung câu trả lời. Trả về hàm dừng interval; gọi lại an toàn nhiều lần.
//
// Heartbeat là chuyện thuần transport — nó phụ thuộc vòng đời stream của Node
// (`writableEnded`, `destroyed`, event `close`/`finish`) mà một sink trong bộ nhớ
// không có. Vì vậy nó sống ở đây, không ở tầng orchestration.
function startSseHeartbeat(res, intervalMs = 5000) {
    const timer = setInterval(() => {
        if (res.writableEnded || res.destroyed) {
            clearInterval(timer);
            return;
        }
        try {
            res.write(`data: ${JSON.stringify({ status: 'generating' })}\n\n`);
        } catch (_) {
            clearInterval(timer);
        }
    }, intervalMs);
    const stop = () => clearInterval(timer);
    // Phòng khi code quên gọi stop() ở một nhánh return sớm: client đóng kết nối hoặc
    // response tự kết thúc cũng phải dọn timer, không phụ thuộc duy nhất vào lời gọi tường minh.
    if (typeof res.once === 'function') {
        res.once('close', stop);
        res.once('finish', stop);
    }
    return stop;
}

// Sink gắn với một HTTP response thật. Mỗi phương thức ánh xạ 1-1 sang đúng lời
// gọi `res` mà handler vốn thực hiện, giữ nguyên từng byte và đúng thứ tự.
function createSseSink(res) {
    return {
        // Header đã gửi hay chưa — quyết định nhánh xử lý lỗi (SSE hay JSON).
        get isOpen() {
            return Boolean(res.headersSent);
        },
        open(headers) {
            res.writeHead(200, headers);
        },
        event(payload) {
            res.write(`data: ${JSON.stringify(payload)}\n\n`);
        },
        close() {
            res.end();
        },
        fail(status, payload) {
            res.status(status).json(payload);
        },
        startHeartbeat() {
            return startSseHeartbeat(res);
        },
    };
}

// Sink trong bộ nhớ: nhận đúng chuỗi sự kiện của SseSink nhưng không có HTTP.
// Đây là bằng chứng abstraction dùng được cho một kênh không phải trình duyệt.
function createBufferSink() {
    const events = [];
    let opened = false;
    let closed = false;
    let failure = null;

    return {
        get isOpen() {
            return opened;
        },
        open() {
            opened = true;
        },
        event(payload) {
            events.push(payload);
        },
        close() {
            closed = true;
        },
        fail(status, payload) {
            opened = true;
            failure = { status, payload };
        },
        // Không có keep-alive cho consumer trong bộ nhớ: không có kết nối nào để giữ.
        startHeartbeat() {
            return () => {};
        },
        // Đọc kết quả sau khi orchestration chạy xong.
        result() {
            return {
                events,
                closed,
                failure,
                // Sự kiện kết thúc mang toàn văn câu trả lời và nguồn.
                done: events.find(event => event && event.done === true) || null,
            };
        },
    };
}

module.exports = { createSseSink, createBufferSink, startSseHeartbeat };
