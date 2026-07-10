# 05 — Testing & Deploy

> Mọi lệnh để dựng môi trường, chạy, test, build, deploy. Agent đọc đây thay vì đoán lệnh.

## Cài đặt môi trường local

```bash
git clone https://github.com/vi-phuong-158/bandocapt.git
cd bandocapt
npm install
```

Tạo file `.env.local` (không commit) với các biến sau:
```
GEMINI_API_KEY=
PINECONE_API_KEY=
PINECONE_INDEX_NAME=chatbot-tthc-xnc
PINECONE_INDEX_HOST=
PINECONE_NAMESPACE=chatbot-tthc-xnc
FIREBASE_SERVICE_ACCOUNT_JSON=
FIREBASE_DB_URL=
FIREBASE_DB_SECRET=
FIRESTORE_CHAT_COLLECTION=
FIRESTORE_DIAGNOSTIC_COLLECTION=
CHAT_LOG_HASH_SALT=
CHAT_DIAGNOSTIC_LOG=off
CHAT_DIAGNOSTIC_LOG_APPROVED=off
CHAT_DIAGNOSTIC_LOG_UNTIL=
CHAT_DIAGNOSTIC_LOG_SAMPLE_RATE=1
TELEMETRY_METRIC_RETENTION_DAYS=30
TELEMETRY_DIAGNOSTIC_RETENTION_DAYS=7
TURNSTILE_SECRET_KEY=
GOOGLE_SHEET_ID=
EVAL_BYPASS_TOKEN=test-bypass-token
NODE_ENV=development
RATE_LIMIT_MONTHLY=10000
RATE_LIMIT_DAILY_IP=50
```

## Chạy local (dev)

**TailwindCSS watch (rebuild output.css khi sửa class):**
```bash
npm run dev
```

**Frontend (static files):** Mở `index.html` trực tiếp, hoặc dùng Live Server VS Code.

**Serverless API local:** Cần Vercel CLI:
```bash
npx vercel dev
```
Truy cập: `http://localhost:3000`

**Lưu ý quan trọng:** Các biến môi trường Vercel phải được pull về local:
```bash
npx vercel env pull .env.local
```

## Build (production)

Build compile CSS minified, kiểm tra syntax JavaScript và tạo static artifact trong `dist/`:
```bash
npm run build
```

Khi thêm Tailwind class mới, phải rebuild `output.css` và commit:
```bash
npm run dev     # chạy watch → lưu → Ctrl+C
git add output.css
```

## Test

```bash
npm test                 # 87 unit/contract test hiện tại (2026-07-02; tăng dần theo thời gian — kiểm tra lại số thật bằng `npm test` nếu nghi ngờ)
npm run ci               # test + build + production dependency audit mức High
npm run test:regression:tam-tru  # regression tích hợp 7 ca tạm trú trọng yếu, tự chấm PASS/FAIL
node scripts/run-regression.js --delay-ms 0  # full 30 câu, có thể lọc bằng --ids TR01,TR02,...
npm run prune:telemetry  # xóa log RTDB fallback đã quá hạn theo expires_at
```

GitHub Actions chạy `npm ci` và `npm run ci` trên pull request và push vào `main`.

Checklist thủ công trước khi commit/push:
- [ ] Bản đồ load và hiển thị đầy đủ marker trụ sở.
- [ ] Tìm kiếm trụ sở theo tên trả về đúng kết quả.
- [ ] Tìm trụ sở gần vị trí hiện tại hoạt động (cần HTTPS hoặc localhost).
- [ ] Chatbot: gửi tin nhắn → nhận stream → hiển thị đúng nguồn trích dẫn.
- [ ] Chatbot: câu ngoài scope → trả về thông báo liên hệ 0692.645.380.
- [ ] Không có API key / secret nào lộ trong DevTools console hay response.
- [ ] Layout mobile (≤768px) và desktop đều đúng.
- [ ] Không có lỗi CSP (Content Security Policy) trong console.

**Test EVAL bypass (local, không cần Turnstile thật):**
```
POST /api/chat
captchaToken: "test-bypass-token"   # = EVAL_BYPASS_TOKEN env
NODE_ENV: development
```

## Google Workspace / Apps Script cho pipeline bản đồ

1. Mở Google Sheet gắn với Form.
2. Tạo hoặc dán nội dung [apps-script.js](</D:/04. Github/bandocapt/setup/apps-script.js>) vào Apps Script bound với sheet.
3. Chạy `bootstrapLocationPipeline` một lần để tạo:
   - `Unit_Allowlist`
   - `Location_Staging`
   - `Published_Locations`
   - `Approval_Audit_Log`
4. Điền `Unit_Allowlist` với `unit_code`, `unit_name`, `allowed_emails`, `active`.
5. Tạo trigger `onFormSubmit` từ spreadsheet.
6. Trong phần cài đặt Google Form, giới hạn người trả lời theo Workspace/nhóm tài khoản vận hành nếu môi trường yêu cầu.
7. Reload sheet để hiện menu `Bản đồ số`.
8. Admin review tại `Location_Staging`:
   - `Phê duyệt dòng staging đang chọn`
   - `Từ chối dòng staging đang chọn`
   - `Thu hồi dòng published đang chọn`

Rollback bản ghi sai:

- Chọn dòng tại `Published_Locations` → `Thu hồi`.
- Nếu cần khôi phục bản ghi cũ, chọn staging record trước đó của cùng đơn vị và `Phê duyệt` lại.

## Deploy

**Tự động:** Merge/push vào branch `main` → Vercel chạy `npm run build` và deploy `dist/`.

**Manual:**
```bash
npx vercel --prod
```

**Cập nhật system prompt:**
→ Sửa hằng số `SYSTEM_PROMPT_BASE` trong `api/chat.js` rồi redeploy (không dùng Edge Config).

**Cập nhật biến môi trường:**
→ Vercel Dashboard → Project Settings → Environment Variables.

**Bật TTL cho Firestore telemetry:**
→ Tạo TTL policy cho field `expires_at` trên collection metric và diagnostic đang dùng.

## Môi trường

| Môi trường | Branch | URL |
|-----------|--------|-----|
| Production | `main` | https://bandocapt.vercel.app |
| Local | — | http://localhost:3000 (với `vercel dev`) |

## Lưu ý

- **Rate limit:** 3500 lượt chat/tháng (global) + 20 lượt/ngày/IP. Khi test nhiều → dùng
  `EVAL_BYPASS_TOKEN` và `NODE_ENV=development` để bypass.
- **Vercel function timeout:** `api/chat.js` có maxDuration 60s (cấu hình trong `vercel.json`).
- **Pinecone cold start:** Instance Pinecone có thể sleep sau thời gian không dùng → query đầu chậm.
- **Firebase Realtime DB:** Dùng `.firebaseio.app` domain Asia Southeast — latency ~100-200ms từ Vercel.
- **RTDB fallback retention:** khi dùng RTDB fallback, chạy `npm run prune:telemetry` bằng môi trường có
  `FIREBASE_DB_URL`/`FIREBASE_DB_SECRET` để xóa bản ghi hết hạn ở `chat_logs_metrics` và `chat_logs_diagnostic`.
- **System prompt:** hardcode trong `api/chat.js` (`SYSTEM_PROMPT_BASE`). Đổi prompt phải sửa code
  và redeploy — không còn cập nhật nóng qua Edge Config.
