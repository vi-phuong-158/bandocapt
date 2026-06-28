# 03 — Technical Decisions

> Ghi lại quyết định kỹ thuật quan trọng để agent sau không "phát minh lại" hoặc đảo ngược
> mà không biết lý do. Mỗi entry: quyết định gì, vì sao, đánh đổi gì.

---

## [2025] Static site — không dùng framework frontend

- **Quyết định:** Frontend là HTML + TailwindCSS + Vanilla JS thuần, không React/Vue/Svelte.
- **Lý do:** Deploy nhanh trên Vercel (không cần build step), bundle size nhỏ, không dependency JS
  framework, dễ debug. Dự án chủ yếu là bản đồ + chatbot — không cần reactivity phức tạp.
- **Đánh đổi:** Không có component reuse tốt; state management thủ công.
- **Người quyết định:** user

---

## [2025] TailwindCSS pre-built — không build trên Vercel

- **Quyết định:** `output.css` được build local và commit vào repo. Vercel build command là `echo`.
- **Lý do:** Đơn giản hóa CI, tránh lỗi build trên Vercel. Dự án tĩnh không cần build pipeline.
- **Đánh đổi:** Phải nhớ rebuild `output.css` local (`npm run dev`) mỗi khi thêm Tailwind class mới
  và commit cả `output.css`.
- **Người quyết định:** user

---

## [2026-06-27] System Prompt hardcode trong code, BỎ Vercel Edge Config

- **Quyết định:** System prompt chatbot là hằng số `SYSTEM_PROMPT_BASE` trong `api/chat.js`
  (nguồn duy nhất). `getSystemPrompt()` trả thẳng hằng số này, KHÔNG đọc Edge Config nữa.
- **Lý do:** bandocapt và `mohinh-andn` dùng chung Edge Config store → cùng đọc key `SYSTEM_PROMPT`
  sẽ đè prompt của nhau. Hai dự án cần prompt khác nhau. Hardcode loại bỏ rủi ro đụng độ và làm
  prompt minh bạch trong source.
- **Đánh đổi:** Đổi system prompt phải sửa code + redeploy (không còn cập nhật nóng qua dashboard).
  Chấp nhận được vì prompt ít đổi và tính đúng đắn quan trọng hơn tốc độ cập nhật.
- **Hệ quả:** Gỡ `require('@vercel/edge-config')` trong `api/chat.js`; biến env `EDGE_CONFIG`,
  `EDGE_CONFIG_ID` trở thành không dùng (vô hại nếu vẫn còn trên Vercel).
- **Thay thế quyết định cũ** "[2025] System Prompt lưu trên Vercel Edge Config".
- **Người quyết định:** user

---

## [2025] RAG với Pinecone + Gemini Embedding

- **Quyết định:** Dùng Pinecone làm vector DB, Gemini Embedding 001 để tạo vector, re-rank bằng
  Gemini 2.0 Flash trước khi trả kết quả cho LLM.
- **Lý do:** Gemini Embedding 001 hỗ trợ đa ngôn ngữ tốt (vi/en/zh/ko) — không cần dịch query.
  Pinecone có managed hosting, SDK Node.js ổn định.
- **Đánh đổi:** Chi phí Pinecone + Gemini API; latency tăng do pipeline embed → query → rerank.
- **Người quyết định:** user

---

## [2025] Rate limiting bằng Firebase (không Redis)

- **Quyết định:** Dùng Firebase Realtime DB để đếm lượt dùng (tháng: 3500, ngày/IP: 20). Dùng
  ETag + Optimistic Locking để tránh race condition.
- **Lý do:** Firebase có free tier, không cần setup Redis riêng. Vercel KV tốn phí hơn.
- **Đánh đổi:** Firebase Realtime DB có latency cao hơn Redis; cần retry/rollback nhiều hơn để giữ
  quota đúng dưới tải đồng thời. Harness local 50 concurrent request đã khóa hành vi không vượt quota,
  nhưng độ ổn định vẫn phụ thuộc semantics ETag của RTDB.
- **Người quyết định:** user

---

## [2025] Bảo mật nhiều lớp (CORS + HMAC + Turnstile + Injection Detection)

- **Quyết định:** Kết hợp 4 lớp bảo vệ: CORS whitelist, HMAC request signing, Cloudflare Turnstile
  CAPTCHA, và prompt injection pattern matching.
- **Lý do:** Chatbot dùng API tốn phí (Gemini/Pinecone) — phải chống bot và abuse. Mỗi lớp bắt
  một loại tấn công khác nhau.
- **Đánh đổi:** Code phức tạp hơn; developer cần biết tất cả lớp bảo vệ khi debug.
- **Người quyết định:** user

---

## [2025] Google Sheets làm nguồn dữ liệu trụ sở (với fallback tĩnh)

- **Quyết định:** Dữ liệu trụ sở Công an được lưu trên Google Sheets, lấy qua `api/google-sheet.js`
  proxy. `data.js` là fallback tĩnh khi Sheets lỗi.
- **Lý do:** Cho phép cán bộ cập nhật dữ liệu không cần deploy code. Sheet ID được ẩn qua proxy.
- **Đánh đổi:** Phụ thuộc vào Google Sheets availability; data.js phải được cập nhật thủ công khi
  có thay đổi lớn.
- **Người quyết định:** user

---

## [2025] DeepSeek là LLM dự phòng (override Gemini)

- **Quyết định:** Nếu `DEEPSEEK_API_KEY` tồn tại trong env, toàn bộ chat dùng DeepSeek thay Gemini.
- **Lý do:** Dự phòng khi Gemini rate limit hoặc giá tăng.
- **Đánh đổi:** Phải convert payload từ Gemini format sang OpenAI format; cần test riêng với DeepSeek.
- **Người quyết định:** user

---

## [2025] Xóa no-referrer meta tag để fix OpenStreetMap 403

- **Quyết định:** Bỏ `<meta name="referrer" content="no-referrer">` khỏi index.html.
- **Lý do:** OpenStreetMap tile server từ chối request không có Referer header (trả 403).
- **Đánh đổi:** Trình duyệt sẽ gửi Referer khi tải tile — chấp nhận được vì đây là URL public.
- **Người quyết định:** user (commit 91718ec)

---

## [2026-06-27] Runtime chỉ đọc Published_Locations và loại tọa độ không hợp lệ

- **Quyết định:** API Google Sheet chỉ allowlist `Published_Locations`; frontend normalize dữ liệu qua
  `js/location-data.js` và không tạo marker nếu tọa độ sai hoặc ngoài vùng phục vụ.
- **Lý do:** Ngăn submission thô hoặc tọa độ rác xuất hiện như một trụ sở hợp lệ trên bản đồ công khai.
- **Đánh đổi:** Pipeline quản trị phải duy trì sheet đã phê duyệt và xử lý báo cáo bản ghi bị loại.
- **Người quyết định:** user / Claude Code

---

## [2026-06-27] Pipeline dữ liệu bản đồ qua allowlist → staging → published

- **Quyết định:** Dữ liệu Google Form không đi thẳng ra public; Apps Script quản trị ghi vào
  `Location_Staging`, chỉ admin mới approve/reject/revoke để cập nhật `Published_Locations`, và mọi
  hành động append vào `Approval_Audit_Log`.
- **Lý do:** Chặn bản ghi giả hoặc sai đơn vị trước khi xuất hiện trên bản đồ công khai, đồng thời giữ
  truy vết submitter + reviewer cho từng marker.
- **Đánh đổi:** Cần triển khai trigger/menu trong Google Workspace thật và vận hành allowlist/audit.
- **Người quyết định:** user / Codex

---

## [2026-06-27] Telemetry tối thiểu, diagnostic content là opt-in

- **Quyết định:** Log mặc định chỉ chứa metric tổng hợp và HMAC bucket của IP; question/answer chỉ
  được ghi khi `CHAT_DIAGNOSTIC_LOG=on|true`, còn nằm trong cửa sổ `CHAT_DIAGNOSTIC_LOG_UNTIL`, qua
  sample rate cấu hình và có `CHAT_DIAGNOSTIC_LOG_APPROVED` nếu chạy ở production. RTDB fallback bắt buộc
  dùng `FIREBASE_DB_URL` từ env.
- **Lý do:** Giảm thu thập dữ liệu cá nhân trong hội thoại pháp luật và loại fallback cross-project.
- **Đánh đổi:** Điều tra lỗi nội dung cần phê duyệt privacy và bật cờ vận hành có kiểm soát.
- **Người quyết định:** user / Claude Code

---

## [2026-06-27] Tách metric và diagnostic telemetry, TTL theo `expires_at`

- **Quyết định:** Metric log và diagnostic log được ghi vào collection/path riêng; cả hai đều có
  `retention_days` và `expires_at`. Diagnostic content bị sanitize email/token/số hộ chiếu trước khi lưu.
- **Lý do:** Giảm blast radius của dữ liệu nhạy cảm, cho phép TTL policy riêng cho metric và diagnostic,
  và giữ RTDB fallback có thể prune tự động bằng script.
- **Đánh đổi:** Cần thêm cấu hình vận hành cho TTL Firestore và chạy prune job cho RTDB fallback khi dùng.
- **Người quyết định:** user / Codex

---

## [2026-06-27] Build và CI kiểm tra artifact thật

- **Quyết định:** `npm run build` compile Tailwind, kiểm tra syntax và tạo `dist/`; CI chạy
  `npm test`, build và production dependency audit bằng Node.js 20.
- **Lý do:** Ngăn deploy code sai syntax, CSS/artifact thiếu hoặc regression ở các boundary P0.
- **Đánh đổi:** Build mất thêm thời gian và vẫn cần kiểm tra trình duyệt cho hành vi UI thực tế.
- **Người quyết định:** user / Claude Code

---

## [2026-06-28] Loại bỏ MarkerCluster khỏi bản đồ

- **Quyết định:** Gỡ bỏ thư viện `Leaflet.markercluster`, hiển thị tất cả các marker trực tiếp qua `L.layerGroup()`.
- **Lý do:** Khi zoom khu vực rộng, marker bị gộp lại thành các con số (cluster) khiến người dùng không thể nhìn thấy trực tiếp vị trí các trụ sở. Người dùng muốn xem tất cả vị trí mọi lúc.
- **Đánh đổi:** Nếu số lượng trụ sở tăng lên rất lớn (hàng nghìn), bản đồ có thể bị chậm do phải render quá nhiều DOM node cùng lúc trên Leaflet.
- **Người quyết định:** user / Antigravity

---

## Template cho entry mới

```
## [YYYY-MM-DD] Tiêu đề quyết định

- **Quyết định:** <mô tả>
- **Lý do:** <vì sao chọn hướng này>
- **Đánh đổi:** <cái gì bị đánh đổi>
- **Người quyết định:** <user / Claude / Codex>
```
