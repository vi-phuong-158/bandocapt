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
CHAT_LOG_HASH_SALT=
CHAT_DIAGNOSTIC_LOG=off
EDGE_CONFIG=
TURNSTILE_SECRET_KEY=
GOOGLE_SHEET_ID=
EVAL_BYPASS_TOKEN=test-bypass-token
NODE_ENV=development
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
npm test        # 24 unit/contract test hiện tại
npm run ci      # test + build + production dependency audit mức High
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

## Deploy

**Tự động:** Merge/push vào branch `main` → Vercel chạy `npm run build` và deploy `dist/`.

**Manual:**
```bash
npx vercel --prod
```

**Cập nhật system prompt** (không cần redeploy):
→ Vào Vercel Dashboard → Storage → Edge Config → cập nhật key `SYSTEM_PROMPT`.

**Cập nhật biến môi trường:**
→ Vercel Dashboard → Project Settings → Environment Variables.

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
- **Edge Config TTL:** System prompt được cache 5 phút trong serverless instance. Sau khi cập nhật
  Edge Config, phải chờ tối đa 5 phút hoặc trigger cold start mới.
