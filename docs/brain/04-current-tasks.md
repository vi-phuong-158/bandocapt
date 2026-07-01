# 04 — Current Tasks

> Cập nhật mỗi khi bắt đầu hoặc hoàn thành task. Agent đọc đây để biết được phép làm gì.

---

## Đang làm

_(trống)_

---

## Chờ làm (backlog)

### [DONE] TASK-FIX-01: Dọn dẹp lỗi trong commit security `9e3b2d9` (api/chat.js)
- **Mô tả:** Review commit `feat(security)` phát hiện 4 lỗi do copy-paste / vô hiệu hóa code nửa vời. Đã được dọn dẹp và sửa dứt điểm.
- **Liên quan:** `api/chat.js` (toàn bộ trong file này)
- **Ưu tiên:** Cao
- **Phạm vi cứng:** CHỈ sửa 4 mục dưới đây. Không refactor lân cận, không đổi logic ký request mới (`verifyRequestSignature`).

**Mục 1 — Key trùng trong `buildTelemetryPayload`** (quanh dòng 198-209)
  - Object payload khai báo 2 lần các trường: `embedding_ms`, `retrieval_ms`, `rerank_ms`, `history_summary_ms`, `generation_ms`, `total_ms`.
  - [Bước] Xóa block lặp lại lần thứ 2 (giữ lần đầu, mỗi key chỉ còn 1 lần).
  - [Kiểm tra] `grep -c "embedding_ms:" api/chat.js` trong hàm này chỉ còn 1; `node --check api/chat.js` pass.

**Mục 2 — Mojibake (double-encode UTF-8) trong block request-signing mới** (quanh dòng 1118)
  - Các chuỗi bị hỏng mã hóa, hiển thị lỗi cho người dùng. Sửa lại tiếng Việt đúng:
    - Comment `[Báº¢O Máº¬T #6] ... â€" HMAC ...` → `[BẢO MẬT #6] ... — HMAC ...`
    - `detail: 'Thiáº¿u request token.'` → `detail: 'Thiếu request token.'`
    - `detail: 'Request token khÃ´ng há»£p lá»‡.'` (xuất hiện 2 chỗ) → `detail: 'Request token không hợp lệ.'`
  - [Kiểm tra] `grep -nP "[\x80-\xff]{4,}" api/chat.js` không còn match rác; mở file xác nhận tiếng Việt đọc được.

**Mục 3 — Xóa code chết: block request-signing CŨ đã bị vô hiệu** (quanh dòng 1148-1186)
  - Block cũ bị tắt bằng `if (false && reqToken && reqTime)` và `else if (false && origin)`. Logic thật đã chuyển sang `verifyRequestSignature` (block mới phía trên).
  - [Bước] Xóa hẳn toàn bộ block `if (false ...)` và biến không dùng `reqToken`, `reqTime` khai báo cho nó.
  - [Kiểm tra] `grep -n "false &&" api/chat.js` không còn; chức năng ký request vẫn do `verifyRequestSignature` đảm nhiệm.

**Mục 4 — Validate input trùng**
  - `validateChatRequestBody` đã kiểm tra `userMessage` (rỗng/kiểu/độ dài/injection). Sau khi destructure vẫn còn block `if (!userMessage || typeof userMessage !== 'string' ...)` cũ.
  - [Bước] Xóa block validate inline thừa đó (giữ kết quả từ `validateChatRequestBody`).
  - [Kiểm tra] `node --test test/*.test.js` pass; request thiếu/sai `userMessage` vẫn trả 400.

- **Xác minh tổng:** `node --check api/chat.js` + `npm test` xanh. Sau khi xong, thêm entry vào `06-ai-working-log.md`.

### TASK-02: Cập nhật dữ liệu Pinecone
- **Mô tả:** Bổ sung/cập nhật văn bản pháp luật mới vào Pinecone index khi có Nghị định/Thông tư mới.
- **Liên quan:** `api/chat.js` (PINECONE_NAMESPACE, indexing script trong setup/)
- **Ưu tiên:** Trung bình

### TASK-P1-02: Mở rộng test chatbot và trình duyệt
- **Mô tả:** Bổ sung CORS/injection/SSE parser và E2E desktop-mobile-keyboard ngoài 39 unit test hiện có.
- **Liên quan:** `api/chat.js`, `js/gemini.js`, `js/chatbot.js`, `test/`
- **Ưu tiên:** Trung bình

---

## Không làm lúc này

- Thêm framework frontend (React, Vue) — quyết định dùng Vanilla JS có chủ đích, xem 03-decisions.
- Xây hệ thống đăng nhập / auth người dùng — ngoài scope dự án.
- Tích hợp thanh toán — ngoài scope.

---

## Đã hoàn thành gần đây

- [2026-06-29] Sửa dứt điểm các lỗi P0 sau Regression Run 1 (fix citation `undefined`, lọc intent chính xác, thêm luật cấm hallucinate mức phạt/địa danh vào `SYSTEM_PROMPT_BASE`)
- [2026-06-29] Chạy Regression Test (30 câu) và Fix thuật toán nhận diện địa danh `Published_Locations` (nhận diện đúng các tên rút gọn có chứa dấu câu)
- [2026-06-27] Tích hợp chatbot/gemini vào UI; thay FAQ tĩnh cũ bằng chatbot RAG streaming
- [2026-06-27] Runtime chỉ đọc Published_Locations; validation tọa độ và data-quality report
- [2026-06-27] Pipeline staging/approval Google Sheets: allowlist, approve/reject/revoke, audit và rollback path
- [2026-06-27] Turnstile/rate-limit storage fail-closed; DOMPurify được nâng và pin SRI
- [2026-06-27] Chứng minh rate limiter atomic dưới tải đồng thời 50 request, có rollback quota rò
- [2026-06-27] Tách metric/diagnostic telemetry, thêm TTL metadata, sanitizer, gate expiry/sampling và RTDB prune script
- [2026-06-27] Telemetry tối thiểu, bỏ RTDB hardcode; bật OSM attribution
- [2026-06-27] Sửa close-mid-stream chatbot, modal mobile full-screen và citation ưu tiên official_url
- [2026-06-27] Node test runner 24 test, build artifact thật và GitHub Actions CI
- [2026-06-27] Khởi tạo bộ não dự án (CLAUDE.md, AGENTS.md, docs/brain/)
- [2025] Fix OpenStreetMap 403 bằng cách xóa no-referrer meta tag
- [2025] Cải thiện hiển thị Desktop sidebar
- [2025] Chuyển logic Google Sheet sang Vercel Serverless để ẩn Sheet ID
- [2025] Implement RAG + Pinecone + Gemini Embedding
- [2025] Bảo mật: CORS whitelist, HMAC signing, Turnstile CAPTCHA, prompt injection detection
