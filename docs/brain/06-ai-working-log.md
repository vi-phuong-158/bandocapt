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

---

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
