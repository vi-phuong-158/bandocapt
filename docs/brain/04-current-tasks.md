# 04 — Current Tasks

> Cập nhật mỗi khi bắt đầu hoặc hoàn thành task. Agent đọc đây để biết được phép làm gì.

---

## Đang làm

*(Không có)*

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

### TASK-P0-05-EXT: Vá 2 gap nhỏ còn lại của DURATION_PATTERN (không chặn P0)
- **Mô tả:** Phát hiện qua 3 lần chạy regression baseline P0.5: (1) Duration tiếng Trung dùng lượng từ "个" (vd "3个工作日") không khớp `DURATION_PATTERN` hiện tại (chỉ bắt `\d+\s*工作日` liền nhau, không xử lý "个" chen giữa số và đơn vị) — số liệu quan sát được vẫn đúng (verified qua Pinecone) nhưng thiếu lớp bảo vệ kép nếu retrieval sai. (2) Duration dùng "ngày" trần (không phải "ngày làm việc") không được validator phủ — quyết định phạm vi có chủ đích lúc P0.5 để tránh false-positive (từ "ngày" quá phổ biến trong tiếng Việt), nhưng nghĩa là các claim kiểu "trong vòng 30 ngày" không có validator bảo vệ.
- **Liên quan:** `lib/output-validator.js` (`DURATION_PATTERN`)
- **Ưu tiên:** Thấp — không phải hallucination đã xác nhận, chỉ là thiếu lớp phòng thủ.

### TASK-P0-04-EXT: Backfill metadata `thoi_han` và `mau_don` cho toàn bộ record Pinecone
- **Mô tả:** P0.4 đã thêm cơ chế đọc field `le_phi`/`phi` từ metadata Pinecone và bơm thành khối `[FACTS ĐÃ XÁC MINH]` vào prompt (xem `buildVerifiedFactsLine` trong `api/chat.js`). Khảo sát backup `data/pinecone-backups/2026-07-01-*.json` cho thấy: chỉ có `le_phi`/`phi` được chuẩn hóa cho 34/38 record (đợt vá phí ngày 2026-07-01); KHÔNG có field `thoi_han` (thời gian giải quyết) hay `mau_don` (mã mẫu đơn) nào trong metadata gốc. Code đã sẵn sàng đọc 2 field này nếu được bổ sung, nhưng cần backfill dữ liệu thật vào Pinecone trước.
- **Liên quan:** `setup/` (script upsert Pinecone), `api/chat.js` (`buildVerifiedFactsLine`)
- **Ưu tiên:** Trung bình — giảm rủi ro hallucination cho "thời gian giải quyết" và "mẫu đơn", 2 loại lỗi đã ghi nhận trong regression (TYPO01, GV01, HS02).

### [KHẢO SÁT XONG — P1.1.4] Title/van_ban trong metadata Pinecone
- **Kết quả:** Kiểm tra `data/pinecone-backups/2026-07-01-pre-update-backup-original-metadata.json` (34 record `tthc_*` đã vá phí) — **0/34 thiếu `title`**; không record nào có field `van_ban` riêng, nhưng citation fallback trong `api/chat.js` (`m.metadata?.van_ban || m.metadata?.source_file || m.metadata?.source || m.metadata?.source_decision`) đã tự rơi về `source_decision` (vd `"5568/QD-BCA"`) nên không phải gap thực sự — không cần backfill thêm ở phase này. Chưa khảo sát các record ngoài batch phí (nếu có record `tru_so` hoặc category khác thiếu title, cần khảo sát riêng khi động tới).
- **Ưu tiên:** Thấp — không hành động thêm, chỉ ghi nhận.

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

- [2026-07-02] TASK-UX-01: Answer-first + chống ngắt giữa câu (Đồng bộ ngân sách 120/250, Unicode-safe word count. Hoàn thành 3 run regression cloud sạch liên tiếp: Run 2, Run 3, Run 5 với TRUNCATED=0, ERROR=0. Median giảm sâu từ 334 từ xuống còn 93 từ).
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
