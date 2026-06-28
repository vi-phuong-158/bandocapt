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

## [2026-06-28] Fix 403 Forbidden do lỗi logic Request Signing
- **Agent:** Antigravity
- **Thay đổi:** Gỡ bỏ hoàn toàn logic kiểm tra `Request Signing` (yêu cầu `x-request-token`) trong `api/chat.js`.
- **File đã sửa:** `api/chat.js`
- **Lý do:** Ở commit dọn dẹp trước đó, logic `if (false)` bị xóa sai cách dẫn đến việc backend bắt buộc mọi request từ trình duyệt (`if (origin)`) phải có `x-request-token`. Nhưng frontend hiện tại chưa code phần tạo chữ ký điện tử này, dẫn đến lỗi 403 hàng loạt.
- **Kiểm tra:** Đã check mã nguồn, không còn block trả về lỗi 403 `MISSING_TOKEN` hay `INVALID_TOKEN` sai mục đích.

## [2026-06-28] Loại bỏ MarkerCluster khỏi bản đồ
- **Agent:** Antigravity
- **Thay đổi:** Gỡ bỏ thư viện `Leaflet.markercluster` khỏi `index.html` và sử dụng `L.layerGroup()` trong `app.js` để render trực tiếp các marker. Cập nhật `01-architecture.md` và `03-decisions.md`.
- **File đã sửa:** `index.html`, `app.js`, `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`
- **Lý do:** Khi zoom khu vực rộng, marker bị gộp thành cluster (hiển thị số) thay vì vị trí cụ thể. Người dùng không muốn behavior này và yêu cầu hiển thị icon trực tiếp mọi lúc.
- **Kiểm tra:** Đã check logic JS `L.layerGroup().addTo(map)` thay thế hoàn toàn cho `L.markerClusterGroup`.

## [2026-06-28] Xây dựng bộ thuyết trình với presentation-builder
- **Agent:** Antigravity
- **Thay đổi:** 
  - Tạo thư mục `presentation/` và thiết lập `build_pptx.js`, `Ban-doc-thuyet-trinh.md` dùng `presentation-builder`.
  - Cập nhật kịch bản sang hướng Storytelling: 8 slide lấy người dân địa phương làm trung tâm, nêu rõ nỗi đau, giải pháp RAG ("AI không bao giờ nói dối"), và sự đánh đổi chi phí.
  - Bổ sung 2 layout slide mới vào `build_pptx.js`: `heroSlide` (câu chốt lớn toàn màn hình) và `quoteSlide` (trích dẫn tâm tư).
  - Tự động sinh ra file `Ban-do-Cong-an-so-Phu-Tho.pptx`.
- **File đã tạo:** `presentation/build_pptx.js`, `presentation/Ban-doc-thuyet-trinh.md`, `presentation/Ban-do-Cong-an-so-Phu-Tho.pptx`
- **Lý do:** Đáp ứng yêu cầu tạo bộ slide sáng tạo, phá cách, mang tính thuyết phục cao trình bày trước lãnh đạo.
- **Kiểm tra:** Đã chạy `node build_pptx.js` thành công và sinh file `.pptx` hoàn chỉnh.

## [2026-06-28] TASK-FIX-01: Dọn dẹp lỗi trong commit security (api/chat.js)
- **Agent:** Antigravity
- **Thay đổi:** 
  - Xóa lặp lại 6 key metric (embedding_ms, v.v.) trong `buildTelemetryPayload`.
  - Sửa lỗi font (mojibake) UTF-8 ở phần trả về lỗi của Request Signing (ví dụ: `Thiáº¿u request token.` -> `Thiếu request token.`).
  - Xóa sạch block request-signing cũ bị vô hiệu hóa (`if (false && reqToken && reqTime)`).
  - Xóa block validate inline thừa của `userMessage` (đã được bao phủ bởi `validateChatRequestBody`).
- **File đã sửa:** `api/chat.js`
- **Lý do:** Làm sạch code sau đợt cập nhật bảo mật, loại bỏ logic thừa và đảm bảo thông báo lỗi tới client được hiển thị đúng tiếng Việt.
- **Kiểm tra:** `node --check api/chat.js` và `npm test` thành công (pass 44/44 tests).

## [2026-06-28] Hoàn thành kế hoạch kiểm thử và phát hành (E2E & CI)
- **Agent:** Antigravity
- **Thay đổi:** 
  - Điều chỉnh khoảng cách kéo `handleBox` trong `test/e2e/detail-panel.spec.js` từ 260px lên 350px để đảm bảo vuốt qua ngưỡng đóng (`hidden`) của bottom-sheet.
  - Cài đặt Playwright Chromium và chạy thử nghiệm `npm run test:e2e` thành công (pass 3/3 tests).
  - Tách các thay đổi hiện tại thành 4 commit độc lập: vệ sinh dependency, sửa bottom-sheet, hardening API/privacy và bổ sung Playwright CI.
- **File đã sửa:** `test/e2e/detail-panel.spec.js`
- **Lý do:** Hoàn thiện và đóng gói các thay đổi còn dang dở của kế hoạch kiểm thử và phát hành để chuẩn bị deploy. Sửa lỗi test Playwright di chuyển chuột chưa đủ xa.
- **Kiểm tra:** Lệnh `npm run test:e2e` pass hoàn toàn. Các commit đã được tạo cục bộ.

## [2026-06-28] Hiện tên trụ sở trên marker theo mức zoom
- **Agent:** Claude Code
- **Thay đổi:** Hiện nhãn tên mọi marker khi zoom ≥ 14 (toàn tỉnh chỉ thấy pin, zoom vào 1 khu vực
  thì tên tự hiện — giống Google Maps, tránh ~40 nhãn chồng chéo ở zoom tỉnh).
  - `app.js`: thêm `LABEL_ZOOM = 14` + listener `zoomend` toggle class `show-marker-labels` trên map container.
  - `styles.css`: rule `.show-marker-labels .marker-label { opacity: 1; }`. Nhãn `pointer-events: none` nên không cản chạm.
- **File đã sửa:** `app.js`, `styles.css`
- **Lý do:** Mobile không có hover → nhãn tên gần như luôn ẩn, khó chọn đúng trụ sở.
- **Kiểm tra:** `preview_eval` set zoom 12/13 → không có class (chỉ pin); zoom 14/16 → có class (hiện tên). `node --check app.js` OK.

## [2026-06-28] Fix marker đen trên production — thiếu tokens.css trong build
- **Agent:** Claude Code
- **Thay đổi:** Thêm `tokens.css` vào danh sách copy của `scripts/build-static.js`.
- **File đã sửa:** `scripts/build-static.js`
- **Lý do:** `index.html` link `tokens.css` nhưng file không được copy vào `dist/` → 404 trên production →
  mọi `var(--color-primary)`, `var(--color-cccd)`, `var(--white)` trong `styles.css` không resolve →
  marker bản đồ mất màu (hiển thị đen). Nút sidebar vẫn xanh vì Tailwind compile hex thẳng vào `output.css`.
- **Kiểm tra:** Chạy `node scripts/build-static.js` → `dist/tokens.css` tồn tại ✓ (11 files). Sau deploy marker xanh/cam trở lại.

## [2026-06-28] Tinh chỉnh vị trí launcher trên desktop + đổi đường dẫn assets
- **Agent:** Claude Code
- **Thay đổi:**
  - Dời `icon.png` và `logo.png` → `assets/`: cập nhật đường dẫn trong `index.html` (4 chỗ), `js/chatbot.js`, `scripts/build-static.js`, `docs/brain/01-architecture.md`.
  - Desktop: thêm media query `min-width: 768px` và `min-width: 1024px` trong `styles.css` để đẩy `#ai-chat-launcher` và `#ai-chat-window` sang phải sidebar (`left: calc(400px + 16px)` / `calc(420px + 16px)`), tránh bị che khuất.
- **File đã sửa:** `index.html`, `js/chatbot.js`, `scripts/build-static.js`, `styles.css`, `docs/brain/01-architecture.md`
- **Lý do:** Sidebar chiếm 400–420px trái; launcher fixed `left: 16px` bị che hoàn toàn trên desktop.
- **Kiểm tra:** `preview_eval` tại viewport 1345px → launcher `left: 436px`, chatWindow `left: 436px` (sidebar 420px + 16px margin). Không còn chồng lên sidebar ✓

## [2026-06-28] Redesign mobile-first theo mockup Claude Design
- **Agent:** Claude Code
- **Thay đổi:** Bám sát mockup mobile-first người dùng build trên Claude Design
  (tham chiếu `design/components/*`):
  - **AI launcher**: đổi từ pill nhỏ góc phải sang **ChatLauncher nổi bật góc dưới-TRÁI** —
    avatar tròn trắng (icon.png) + chấm online xanh, 2 dòng "Hỏi đáp AI" / "Trợ lý pháp luật · 24/7",
    cao 64px (58px mobile), 2 vòng `ds-chat-pulse`. Bọc `#ai-chat-toggle-btn` trong
    `#ai-chat-launcher` (giữ nguyên id nút cho `js/chatbot.js`). Cửa sổ chat dời sang bottom-left
    cho đồng bộ.
  - **Search trigger** (`#mobile-search-btn`): thay icon menu bằng **logo**, nút search đặt trong
    vòng tròn `--blue-50` màu primary.
  - **Result card** (`app.js renderResultsList`): icon Công an dùng `local_police` (FILL trắng trên
    nền primary) thay ảnh logo; chip khoảng cách thành pill emerald có mũi tên `near_me`.
- **File đã sửa:** `styles.css`, `index.html`, `app.js`, `output.css` (rebuild cho utility mới)
- **Lý do:** Dự án chủ yếu dùng trên điện thoại → ưu tiên tối đa trải nghiệm mobile, khớp đúng
  mockup design người dùng duyệt. Giữ layout responsive desktop-sidebar (vẫn hoạt động).
- **Kiểm tra:** Preview 375px — inspect: launcher fixed left/bottom, nền primary, sub
  rgba(255,255,255,0.82); search logo 34px; result icon-box nền rgb(29,78,216) bo 12px icon trắng,
  chip khoảng cách emerald-100/emerald-700 inline-flex. Không console error.
  (Screenshot preview treo do canvas Leaflet headless — xác minh bằng computed-style.)

## [2026-06-28] Áp Design System vào giao diện (token-driven UI)
- **Agent:** Claude Code
- **Thay đổi:**
  - Tạo `tokens.css` self-contained chứa toàn bộ CSS variables của Design System
    (colors, typography, spacing, effects) theo `DESIGN_SYSTEM.md` + `design/tokens/*`.
    Không `@import` thư mục `design/` vì đó là kit, không deploy.
  - Viết lại `styles.css` token-driven: thay toàn bộ hardcoded hex/px/shadow bằng
    `var(--*)`; đổi font các block chat/marker/label từ `'Plus Jakarta Sans'` →
    `var(--font-body)` (Be Vietnam Pro). Sửa luôn block CSS bị comment lỗi ở
    `.result-item:focus-visible` (trước đây bị nuốt trong `/* ... */`).
  - `tailwind.config.js`: đổi `fontFamily.body` từ Plus Jakarta Sans → **Be Vietnam Pro**
    (DS yêu cầu 1 family duy nhất); chỉnh `textMain`→slate-800, `textMuted`→slate-500,
    `secondary`→slate-900 cho khớp token semantic.
  - `index.html`: bỏ tải font Plus Jakarta Sans; nạp `tokens.css` trước `output.css`/`styles.css`;
    đổi inline hex của nút `find-location-btn` sang `var(--color-primary)` + `var(--shadow-fab)`.
  - Rebuild `output.css` (`npm run build:css`) để class `font-body` map sang Be Vietnam Pro.
- **File đã sửa:** `tokens.css` (mới), `styles.css`, `tailwind.config.js`, `index.html`, `output.css`
- **Lý do:** App trước đây vi phạm Design System — dùng magic-number hex/px và sai font body.
  Đưa UI về đúng token + đúng typography (Be Vietnam Pro) để mọi agent sau sửa giao diện
  không phải đoán giá trị. Giữ nguyên 100% DOM id/class mà `app.js`/`js/chatbot.js` phụ thuộc.
- **Kiểm tra:** Preview (port 3000) — `getComputedStyle`: body font = "Be Vietnam Pro",
  `--color-primary` = #1d4ed8, 3 stylesheet nạp đủ; inspect nút AI nền rgb(29,78,216),
  shadow-fab, cao 46px (--control-h); tiêu đề màu slate-800. Không còn `Plus Jakarta` trong
  `output.css`. Không console error. (Ảnh screenshot preview bị đen do quirk canvas Leaflet headless,
  computed-style xác nhận render đúng.)

## [2026-06-27] Viết lại system prompt chatbot + bỏ Edge Config
- **Agent:** Claude Code
- **Thay đổi:**
  - Viết lại `SYSTEM_PROMPT_BASE` (đổi tên từ `FALLBACK_SYSTEM_PROMPT_BASE`) trong `api/chat.js`:
    prompt mới đặt mục tiêu rõ — mỗi câu trả lời thủ tục phải có khối **📋 Hồ sơ cần chuẩn bị** và
    **📍 Nơi nộp & đường đi** kèm link Google Maps; thêm "QUY TẮC GOOGLE MAPS" 3 mức fallback
    (URL có sẵn → tọa độ → dựng link maps/search từ tên+địa chỉ); tách cấu trúc A (thủ tục) / B (trụ sở)
    / C (câu ghép); giữ nguyên chống prompt-injection + đa ngôn ngữ.
  - **Bỏ Vercel Edge Config**: gỡ `require('@vercel/edge-config')`, xóa cache prompt + đọc key
    `SYSTEM_PROMPT`. `getSystemPrompt()` trả thẳng hằng số. Lý do: tránh đụng prompt với dự án
    mohinh-andn dùng chung Edge Config store.
- **File đã sửa:** `api/chat.js`, `docs/brain/00,01,02,03,05,06`.
- **Lý do:** Theo yêu cầu người dùng — prompt hoàn chỉnh hướng người dân biết cần chuẩn bị gì + có
  địa chỉ Google Maps để đến; và cô lập prompt khỏi mohinh-andn.
- **Kiểm tra:** `npm run check:syntax` OK; `node --test test/*.test.js` → 39/39 pass;
  `grep "edge-config" api/` → không còn code đọc Edge Config. Cần test thật trên Vercel sau deploy.

## [2026-06-27] Sửa lỗi review của commit UI redesign
- **Agent:** Claude Code
- **Thay đổi:**
  - Vá lỗi font: `styles.css` tham chiếu `'Geist'`/`'Outfit'` (không được load ở `index.html`) → đổi thành `'Plus Jakarta Sans'` (body) và `'Be Vietnam Pro'` (display) cho khớp font đã nạp + `tailwind.config.js`.
  - Xóa `redesign.js` — script migration một lần, dead code, lại còn gây ra lỗi font ở trên.
  - Khôi phục script `dev` (đã bị đổi thành `watch:css`) cùng `engines: node 20.x` và `repository` trong `package.json` để khớp tài liệu (`npm run dev`) và pin Node trên Vercel.
  - Thêm lại 2 dòng chống prompt-injection bị xóa khỏi `FALLBACK_SYSTEM_PROMPT_BASE` (không đổi vai/tiết lộ system prompt-API key; từ chối jailbreak).
- **File đã sửa:** `styles.css`, `package.json`, `api/chat.js`, `docs/brain/06-ai-working-log.md`; xóa `redesign.js`
- **Lý do:** Khắc phục các vấn đề phát hiện khi review PR #4 (font không nhất quán, dead code, lệnh dev hỏng, regression bảo mật ở prompt).
- **Kiểm tra:** `npm run check:syntax` OK; `node --test test/*.test.js` → 39/39 pass; `grep "'Geist'\|'Outfit'" styles.css` → 0.

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
