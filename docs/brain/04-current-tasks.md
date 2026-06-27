# 04 — Current Tasks

> Cập nhật mỗi khi bắt đầu hoặc hoàn thành task. Agent đọc đây để biết được phép làm gì.

---

## Đang làm

_(trống)_

---

## Chờ làm (backlog)

### TASK-P0-01: Hoàn thiện và kiểm chứng pipeline staging/approval
- **Mô tả:** Runtime đã chỉ đọc `Published_Locations`, nhưng cần xác minh/tạo luồng allowlist,
  staging, approve/reject, audit và rollback từ Google Form sang sheet công khai.
- **Liên quan:** Google Workspace/Apps Script, `api/google-sheet.js`, `PLAN.md` G1-01
- **Ưu tiên:** P0

### TASK-P0-02: Chứng minh rate limiter atomic dưới tải đồng thời
- **Mô tả:** Các nhánh store lỗi đã fail-closed; còn thiếu test 50 request đồng thời và bằng chứng
  counter không lost update/vượt quota.
- **Liên quan:** `api/chat.js`, Firebase test project/emulator, `test/p0-fixes.test.js`
- **Ưu tiên:** P0

### TASK-P1-01: Retention và sanitizer cho diagnostic telemetry
- **Mô tả:** Thiết lập TTL/retention, tách metric và diagnostic collection, thêm test xóa dữ liệu
  hết hạn và sanitizer token/email/số hộ chiếu.
- **Liên quan:** Firebase, `api/chat.js`, tài liệu vận hành
- **Ưu tiên:** Cao

### TASK-02: Cập nhật dữ liệu Pinecone
- **Mô tả:** Bổ sung/cập nhật văn bản pháp luật mới vào Pinecone index khi có Nghị định/Thông tư mới.
- **Liên quan:** `api/chat.js` (PINECONE_NAMESPACE, indexing script trong setup/)
- **Ưu tiên:** Trung bình

### TASK-P1-02: Mở rộng test chatbot và trình duyệt
- **Mô tả:** Bổ sung CORS/injection/SSE parser và E2E desktop-mobile-keyboard ngoài 24 unit test hiện có.
- **Liên quan:** `api/chat.js`, `js/gemini.js`, `js/chatbot.js`, `test/`
- **Ưu tiên:** Trung bình

---

## Không làm lúc này

- Thêm framework frontend (React, Vue) — quyết định dùng Vanilla JS có chủ đích, xem 03-decisions.
- Xây hệ thống đăng nhập / auth người dùng — ngoài scope dự án.
- Tích hợp thanh toán — ngoài scope.

---

## Đã hoàn thành gần đây

- [2026-06-27] Tích hợp chatbot/gemini vào UI; thay FAQ tĩnh cũ bằng chatbot RAG streaming
- [2026-06-27] Runtime chỉ đọc Published_Locations; validation tọa độ và data-quality report
- [2026-06-27] Turnstile/rate-limit storage fail-closed; DOMPurify được nâng và pin SRI
- [2026-06-27] Telemetry tối thiểu, bỏ RTDB hardcode; bật OSM attribution
- [2026-06-27] Node test runner 24 test, build artifact thật và GitHub Actions CI
- [2026-06-27] Khởi tạo bộ não dự án (CLAUDE.md, AGENTS.md, docs/brain/)
- [2025] Fix OpenStreetMap 403 bằng cách xóa no-referrer meta tag
- [2025] Cải thiện hiển thị Desktop sidebar
- [2025] Chuyển logic Google Sheet sang Vercel Serverless để ẩn Sheet ID
- [2025] Implement RAG + Pinecone + Gemini Embedding
- [2025] Bảo mật: CORS whitelist, HMAC signing, Turnstile CAPTCHA, prompt injection detection
