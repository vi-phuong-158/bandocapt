# 06 — AI Working Log

> Nhật ký các lần AI (Claude Code / Codex) sửa code. Mỗi agent PHẢI thêm entry sau mỗi lần
> chạm vào code. Đọc ngược từ trên xuống để biết gần đây ai đã làm gì và vì sao.

---

## Format entry

```

## [YYYY-MM-DD] [Tên task ngắn gọn]
- **Agent:** Claude Code | Codex
- **Thay đổi:** <mô tả ngắn những gì đã làm>
- **File đã sửa:** <danh sách file>
- **Lý do:** <vì sao cần thay đổi>
- **Kiểm tra:** <cách xác minh hoạt động đúng>
```

## [2026-06-27] Nâng cấp giao diện UI/UX (Taste-Skill Redesign)

- **Agent:** Antigravity
- **Thay đổi:** Nâng cấp toàn diện giao diện ứng dụng theo triết lý `taste-skill`. Chuyển đổi font chữ sang `Be Vietnam Pro` và `Plus Jakarta Sans`. Thay đổi tông màu chủ đạo thành Sharp Blue (`#1d4ed8`) & Zinc 950. Thêm hiệu ứng tactile feedback (`scale-98`) và Skeleton loading. Đổi icon Chatbot sang dạng viên thuốc (Command Pill). Đồng bộ màu của nút GPS Leaflet.
- **File đã sửa:** `index.html`, `styles.css`, `tailwind.config.js`, `redesign.js`.
- **Lý do:** Người dùng yêu cầu hiện đại hoá giao diện, gỡ bỏ các pattern UI mặc định khô khan và rập khuôn của AI, đồng thời thay đổi scope dự án sang Thủ tục hành chính.
- **Kiểm tra:** Đã chạy `npm run build` thành công và verify UI trực quan (font chữ Tiếng Việt không bị rớt dấu, màu sắc đồng nhất).

## [2026-06-27] Tạo script test API RAG độc lập

- **Agent:** Antigravity
- **Thay đổi:** Thêm script `scripts/test-rag-api.js` để test trực tiếp Pinecone và Gemini Flash dựa trên `.env`, nhằm xác nhận namespace, kết nối và RAG prompt ngoài frontend.
- **File đã sửa:** `scripts/test-rag-api.js` (tạo mới)
- **Lý do:** Test xác minh luồng RAG và chẩn đoán lỗi thiếu dữ liệu do namespace rỗng (phát hiện Pinecone namespace thực sự là `chatbot-tthc-xnc`).
- **Kiểm tra:** Script đã chạy trực tiếp trả về 3 câu trả lời thành công dựa trên 530 vectors.

---

## [2026-06-27] Chốt TASK-P0-01 pipeline staging/approval Google Sheets

- **Agent:** Codex
- **Thay đổi:**
  - `setup/apps-script.js`: thay script cũ bằng pipeline quản trị dữ liệu bản đồ cho Google Sheets gồm allowlist, staging, approve/reject/revoke, audit log và menu admin.
  - `test/location-pipeline.test.js`: thêm test cho allowlist deny, unit mismatch, pending trước approve, reject không đổi dữ liệu công khai, revoke loại marker và rollback bằng re-approve.
  - `package.json`: thêm `setup/apps-script.js` vào `check:syntax`.
  - `setup/tao-form-thu-thap.js`, `PLAN.md`, `docs/brain/00-project-overview.md`, `01-architecture.md`, `03-decisions.md`, `04-current-tasks.md`, `05-testing-and-deploy.md`: cập nhật runbook pipeline, rollback path, kiến trúc và trạng thái task.
- **File đã sửa:** `setup/apps-script.js`, `test/location-pipeline.test.js`, `package.json`, `setup/tao-form-thu-thap.js`, `PLAN.md`, `docs/brain/00-project-overview.md`, `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`, `docs/brain/05-testing-and-deploy.md`, `docs/brain/06-ai-working-log.md`
- **Lý do:** Hoàn tất phần repo-side của P0-01 để dữ liệu bản đồ không đi thẳng từ Form ra public và có đường approve/reject/rollback có audit.
- **Kiểm tra:** `npm test` 39/39 pass; `npm run build` pass.

## [2026-06-27] Chốt TASK-P1-01 retention + sanitizer telemetry

- **Agent:** Codex
- **Thay đổi:**
  - `api/chat.js`: tách metric payload và diagnostic payload; thêm `retention_days`/`expires_at`; thêm sanitizer cho email, token/secret và số hộ chiếu; thêm gate `CHAT_DIAGNOSTIC_LOG_UNTIL`, `CHAT_DIAGNOSTIC_LOG_SAMPLE_RATE`, `CHAT_DIAGNOSTIC_LOG_APPROVED`.
  - `setup/prune-telemetry.js`: thêm script xóa bản ghi RTDB fallback đã quá hạn theo `expires_at`.
  - `test/p0-fixes.test.js`: thêm test cho sanitizer, retention expiry và gate expiry/sampling/production approval.
  - `package.json`, `docs/brain/00-project-overview.md`, `01-architecture.md`, `03-decisions.md`, `04-current-tasks.md`, `05-testing-and-deploy.md`: cập nhật script, env, kiến trúc và trạng thái task.
- **File đã sửa:** `api/chat.js`, `test/p0-fixes.test.js`, `setup/prune-telemetry.js`, `package.json`, `docs/brain/00-project-overview.md`, `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`, `docs/brain/05-testing-and-deploy.md`, `docs/brain/06-ai-working-log.md`
- **Lý do:** Hoàn tất phần code-side của P1-01 để giảm dữ liệu nhạy cảm trong diagnostic log và tạo đường xóa dữ liệu hết hạn cho RTDB fallback.
- **Kiểm tra:** `npm test` 32/32 pass; `npm run build` pass.

## [2026-06-27] Chốt TASK-P0-02 rate limiter concurrent

- **Agent:** Codex
- **Thay đổi:**
  - `api/chat.js`: tách helper reserve/release quota RTDB bằng ETag, re-check limit ở mọi retry `412`, reserve theo thứ tự IP/ngày rồi toàn cục/tháng, rollback quota IP/ngày nếu quota toàn cục thất bại.
  - `test/p0-fixes.test.js`: thêm 2 test concurrent 50 request để khóa daily quota và monthly quota + rollback, đồng thời cập nhật assertion cho flow reserve mới.
  - `PLAN.md`, `docs/brain/01-architecture.md`, `03-decisions.md`, `04-current-tasks.md`, `05-testing-and-deploy.md`: cập nhật trạng thái TASK-P0-02, checklist phát hành, ghi chú kiến trúc và số lượng test hiện tại.
- **File đã sửa:** `api/chat.js`, `test/p0-fixes.test.js`, `PLAN.md`, `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`, `docs/brain/05-testing-and-deploy.md`, `docs/brain/06-ai-working-log.md`
- **Lý do:** Hoàn tất hạng mục P0 còn mở về bằng chứng atomic dưới tải đồng thời; khóa lỗi vượt quota khi retry `412` và rò quota khi reservation thứ hai thất bại.
- **Kiểm tra:** `npm test` 29/29 pass; `npm run build` pass.

## [2026-06-27] Sửa regression G3-03/G4-03/G5-01

- **Agent:** Codex
- **Thay đổi:**
  - `js/chatbot.js`: phân biệt desktop popover và mobile modal bằng breakpoint 768px; chỉ trap focus khi modal; ẩn toggle khi chat full-screen trên mobile; khi đóng chat lúc đang stream thì abort theo chế độ `close`, bỏ assistant shell pending và không restore focus vào input ẩn.
  - `styles.css`: chat mobile chuyển sang full-screen `100dvh`; thêm `body.ai-chat-modal-open`; citation chip có dòng metadata hiển thị ngày hiệu lực/xác minh.
  - `api/chat.js`: allowlist citation chỉ còn domain chính thức; ưu tiên `official_url`, vẫn tương thích `url`/`link`/`source_url`; forward `effective_date`, `last_verified_at`, `kb_version`.
  - `test/p0-fixes.test.js`: thêm regression test cho citation official/commercial domain và guard source-level cho modal mobile/close-abort.
  - `PLAN.md`: trả checklist `EVAL_BYPASS_TOKEN` về trạng thái chưa xác minh Production.
- **File đã sửa:** `js/chatbot.js`, `styles.css`, `api/chat.js`, `test/p0-fixes.test.js`, `PLAN.md`, `docs/brain/04-current-tasks.md`, `docs/brain/05-testing-and-deploy.md`, `docs/brain/06-ai-working-log.md`
- **Lý do:** Chốt các mục vừa đánh dấu nhưng còn lệch hành vi thật: đóng chat giữa stream vẫn còn restore focus, mobile chưa là modal full-screen đúng nghĩa, citation chưa ưu tiên nguồn chính thức và metadata ngày.
- **Kiểm tra:** `npm test` 27/27 pass; `npm run build` pass.

## [2026-06-27] EVAL_BYPASS_TOKEN guard + G5-01 Citation allowlist

- **Agent:** Claude Code
- **Thay đổi:**
  - `api/chat.js`: log `console.error` khi `NODE_ENV === 'production'` mà `EVAL_BYPASS_TOKEN` vẫn tồn tại; thêm `isAllowedCitationUrl()` với allowlist 8 domain chính thức (thuvienphapluat.vn, vbpl.vn, mps.gov.vn, v.v.); trích `url`/`link`/`source_url` từ Pinecone metadata, validate qua allowlist, forward trong `matchedSources`; export `isAllowedCitationUrl` để test.
  - `js/chatbot.js`: `appendSources` render `<a target="_blank" rel="noopener noreferrer">` khi source có URL đã validate, fallback `<span>` khi không có.
  - `test/p0-fixes.test.js`: 2 test mới — production guard EVAL_BYPASS_TOKEN; allowlist blocks http/unlisted domain/path-spoof.
- **File đã sửa:** `api/chat.js`, `js/chatbot.js`, `test/p0-fixes.test.js`, `PLAN.md`
- **Lý do:** Checklist phát hành: EVAL_BYPASS_TOKEN phải không tồn tại ở Production; G5-01 citation link an toàn chỉ tới domain văn bản pháp luật chính thức.
- **Kiểm tra:** `npm test` 26/26 pass.

## [2026-06-27] G4-01/G4-02/G4-03 Keyboard navigation & accessibility

- **Agent:** Claude Code
- **Thay đổi:**
  - `chatbot.js`: focus trap Tab/Shift+Tab trong `#ai-chat-window` (querySelectorAll button/input không disabled, lọc `offsetParent !== null`); toggle `aria-modal` `true`/`false` khi mở/đóng.
  - `app.js`: arrow key Up/Down điều hướng trong danh sách kết quả (`.result-item`); Escape đóng mobile search panel khi `closeSearchBtn.offsetParent !== null`.
- **File đã sửa:** `js/chatbot.js`, `app.js`, `PLAN.md`
- **Lý do:** G4-01/G4-02/G4-03 — Tab thoát ra ngoài chatbot dialog là lỗi a11y nghiêm trọng; arrow key và Escape cải thiện keyboard UX cho danh sách và mobile panel.
- **Kiểm tra:** `npm test` 24/24 pass. Manual: Tab trong chatbot cycle qua close/input/send; Shift+Tab từ close về send; Escape đóng từng panel đúng thứ tự; ArrowDown/Up di chuyển focus giữa các result item.

## [2026-06-27] G3-03 Stop button + stream abort

- **Agent:** Claude Code
- **Thay đổi:**
  - `gemini.js`: thêm param `signal` (AbortSignal) vào `callGeminiStream`; wire vào internal controller; di chuyển `let fullText` ra ngoài `try` để `catch` có thể trả `partialText` khi bị abort.
  - `chatbot.js`: nút Gửi hoạt động double-duty — trong khi stream hiện icon `stop` (enabled), click → `stopActiveStream()` → abort; `closeChatWindow` cũng abort nếu đang stream; `finally` null out `activeCancelController` và clear `renderTimer`; `refreshTurnstileAfterRequest` khôi phục `aria-label` về "Gửi tin nhắn".
- **File đã sửa:** `js/gemini.js`, `js/chatbot.js`, `PLAN.md`
- **Lý do:** G3-03 — người dùng cần dừng phản hồi dài mà không phải đợi timeout; đóng chatbot khi stream không được để DOM update treo.
- **Kiểm tra:** `npm test` 24/24 pass. Logic: abort → `partialText` trả về → chatbot hiển thị phần đã nhận + notice "gián đoạn". Timeout 60s toàn request + 15s idle đã có sẵn từ trước.

## [2026-06-27] Kiểm toán baseline và đồng bộ tài liệu sau hardening

- **Agent:** Codex
- **Thay đổi:** Đối chiếu code/test với PLAN; loại IP thô khỏi key rate-limit và operational log,
  loại nội dung câu hỏi khỏi log prompt-injection, thêm regression test; sửa lockfile tương thích npm 10
  và gọi Tailwind CLI qua Node để build không phụ thuộc executable bit trên Linux/Vercel; cập nhật kiến trúc, quyết định kỹ thuật, trạng thái
  backlog, lệnh test/build/deploy và checklist phát hành. Chỉ đánh dấu các tiêu chí có bằng chứng local;
  giữ mở pipeline approval, atomic concurrency, Production env và rollback Preview.
- **File đã sửa:** `api/chat.js`, `test/p0-fixes.test.js`, `package.json`, `package-lock.json`,
  `PLAN.md`, `docs/brain/00-project-overview.md`,
  `docs/brain/01-architecture.md`, `docs/brain/02-coding-rules.md`,
  `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`,
  `docs/brain/05-testing-and-deploy.md`, `docs/brain/06-ai-working-log.md`
- **Lý do:** Tài liệu cũ vẫn ghi chatbot chưa tích hợp, chưa có test và build giả; các mô tả này
  không còn đúng và có thể khiến phiên sau đảo ngược hoặc đánh dấu nhầm P0.
- **Kiểm tra:** `npm ci` bằng npm 10; `npm test` 24/24 pass; `npm run build` tạo 10 file trong
  `dist/`; `npm run ci` pass và audit không có High/Critical (còn 8 Moderate trong chuỗi phụ thuộc Firebase).

## [2026-06-27] Đóng P0-2 (privacy telemetry) và UI-03 (OSM attribution)

- **Agent:** Claude Code
- **Thay đổi:**
  - P0-2: telemetry chatbot mặc định chỉ ghi metric tổng hợp; bỏ `question`/`answer`/IP thô. IP được HMAC-hash thành `ip_bucket_hash`. Nội dung hội thoại chỉ ghi khi bật cờ `CHAT_DIAGNOSTIC_LOG=on`. Xóa hoàn toàn URL Firebase RTDB hardcode cross-project (2 chỗ) — thiếu `FIREBASE_DB_URL` thì không ghi/ fail-closed.
  - UI-03: bật lại OpenStreetMap attribution (bỏ `attributionControl:false`, thêm `attribution` cho tileLayer, bỏ CSS ẩn `.leaflet-control-attribution`).
- **File đã sửa:** `api/chat.js`, `app.js`, `styles.css`, `test/p0-fixes.test.js`
- **Lý do:** P0-2 là finding privacy/pháp lý (dữ liệu hộ chiếu/cư trú) còn sót; UI-03 là yêu cầu bắt buộc theo ToS OpenStreetMap (checklist phát hành).
- **Kiểm tra:** `npm test` 23/23 pass (thêm 4 test: no-hardcode RTDB, telemetry mặc định không nội dung/IP, telemetry có nội dung khi bật cờ, attribution bật). `npm run build` pass. Verify trình duyệt: attribution hiển thị `display:block` với "© OpenStreetMap contributors", không console error. Biến mới: `CHAT_DIAGNOSTIC_LOG` (mặc định off).

## [2026-06-27] Khởi tạo bộ não dự án (AI project brain)

- **Agent:** Claude Code
- **Thay đổi:** Tạo `CLAUDE.md`, `AGENTS.md` và `docs/brain/00-06` làm bộ nhớ dùng chung cho AI.
- **File đã tạo:** `CLAUDE.md`, `AGENTS.md`, `docs/brain/00-project-overview.md`,
  `docs/brain/01-architecture.md`, `docs/brain/02-coding-rules.md`,
  `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`,
  `docs/brain/05-testing-and-deploy.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Thiết lập ngữ cảnh và quy tắc dùng chung để mọi agent đọc trước khi code.
  Dự án đã đủ phức tạp (RAG, bảo mật nhiều lớp, Firebase, Pinecone) để cần tài liệu sống.
- **Kiểm tra:** Các file tồn tại trong `docs/brain/`, nội dung phản ánh đúng codebase tại 2026-06-27.
