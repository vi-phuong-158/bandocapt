# 01 — Architecture

## Stack

| Layer | Công nghệ |
|-------|-----------|
| Frontend | HTML5 + Tailwind CSS 3 + Vanilla JS (không framework) |
| Bản đồ | Leaflet.js 1.9.4 + MarkerCluster 1.5.3 + OpenStreetMap tiles |
| LLM / Chat | Gemini 2.5 Flash (streaming SSE), fallback DeepSeek |
| Embedding / RAG | Gemini Embedding 001 + Pinecone vector DB |
| Backend API | Vercel Serverless Functions (Node.js 20, CommonJS) |
| Config động | Vercel Edge Config (system prompt không cần redeploy) |
| Dữ liệu trụ sở | Google Sheets (qua `api/google-sheet.js` proxy) |
| Telemetry | Firebase Firestore + Firebase Realtime DB (fallback, metric tối thiểu mặc định) |
| Rate limiting | Firebase Realtime DB (đếm lượt/tháng + lượt/ngày/IP) |
| CAPTCHA | Cloudflare Turnstile |
| Hosting | Vercel (static + serverless) |
| CSS build | TailwindCSS CLI (`input.css` → `output.css`, pre-built) |

## Cấu trúc thư mục chính

```
bandocapt/
├── index.html              # Entry point duy nhất — toàn bộ UI
├── styles.css              # CSS tùy chỉnh bổ sung TailwindCSS
├── output.css              # TailwindCSS đã build và commit; build production cũng tái tạo file
├── input.css               # Source TailwindCSS (chỉ dùng khi dev local)
├── tailwind.config.js      # Cấu hình Tailwind
├── app.js                  # Logic bản đồ Leaflet, tìm kiếm, hiển thị marker
├── data.js                 # Dữ liệu trụ sở tĩnh (fallback khi Google Sheets lỗi)
├── js/
│   ├── chatbot.js          # UI chatbot (mở/đóng panel, gửi tin, hiển thị stream)
│   ├── gemini.js           # Client gọi api/chat, xử lý SSE stream
│   └── location-data.js    # Parse/validate/normalize dữ liệu Published_Locations
├── api/
│   ├── chat.js             # Serverless: proxy Gemini/DeepSeek + RAG Pinecone (logic chính)
│   └── google-sheet.js     # Serverless: proxy Google Sheets để ẩn Sheet ID
├── setup/                  # Script tiện ích (không deploy): import dữ liệu, kiểm tra
├── scripts/                # Build static artifact và preview server
├── test/                   # Node test runner: P0, location data, Google Sheet API
├── .github/workflows/ci.yml # CI test, build và audit trên push/PR
├── dist/                   # Artifact build local/Vercel (ignored)
├── logo.png                # Logo ứng dụng
├── icon.png                # Favicon
├── vercel.json             # Cấu hình Vercel (outputDirectory, function timeout, headers)
└── package.json            # deps: pinecone, @vercel/edge-config, firebase-admin
```

## Code Graph (bản đồ module)

> Mục quan trọng nhất. Agent đọc đây để biết "đụng vào X ảnh hưởng đâu" trước khi sửa.
> Cập nhật lại MỖI KHI thay đổi cấu trúc/quan hệ phụ thuộc.

### Module/file then chốt

| Module / file | Vai trò | Được gọi bởi | Phụ thuộc vào |
|---------------|---------|--------------|---------------|
| `index.html` | Shell UI — tải tất cả script, định nghĩa DOM | Trình duyệt | `output.css`, `styles.css`, `app.js`, `js/chatbot.js`, `js/gemini.js` |
| `app.js` | Khởi tạo Leaflet/cluster, tải trụ sở, tìm kiếm, marker | `index.html` (script tag) | `js/location-data.js`, `api/google-sheet.js` (fetch) |
| `data.js` | Dữ liệu trụ sở tĩnh (array) — fallback khi Sheets lỗi | `app.js` | — |
| `js/location-data.js` | Parse tọa độ, kiểm tra bounding box và normalize payload Google Sheet | `app.js`, unit test | — |
| `js/gemini.js` | Gọi `POST /api/chat`, nhận SSE stream, parse chunk | `js/chatbot.js` | `api/chat.js` (HTTP) |
| `js/chatbot.js` | UI chatbot: panel toggle, render tin nhắn, gọi gemini.js | `index.html` (script tag) | `js/gemini.js` |
| `api/chat.js` | Serverless chính: xác thực, RAG, streaming Gemini/DeepSeek | `js/gemini.js` (HTTP POST) | Pinecone, Gemini API, Edge Config, Firebase |
| `api/google-sheet.js` | Proxy CommonJS chỉ cho phép `Published_Locations`, validate payload và cache endpoint | `app.js` (fetch) | Google Sheets API |

### Luồng xử lý chính

**Luồng bản đồ:**
```
index.html load → app.js init →
  fetch /api/google-sheet?sheet=Published_Locations → Google Sheets →
  js/location-data.js validate/normalize → render MarkerCluster
  (bản ghi lỗi) → loại khỏi marker + data-quality warning
```

**Luồng chatbot (RAG):**
```
User nhập → js/chatbot.js →
  js/gemini.js → POST /api/chat (HMAC token + Turnstile) →
    api/chat.js:
      1. Verify CORS + Turnstile + HMAC
      2. Check rate limit Firebase (tháng + ngày/IP)
      3. Check FAQ cache (in-memory)
      4. Detect prompt injection
      5. Embed query → Gemini Embedding 001
      6. Query Pinecone (top-8, filter by category, re-rank)
      7. Build system prompt (Edge Config || fallback hardcode)
      8. Stream → Gemini 2.5 Flash (hoặc DeepSeek)
      9. SSE stream → client
     10. Ghi metric tối thiểu → Firestore (fallback: RTDB đã cấu hình)
  js/gemini.js parse SSE chunks →
  js/chatbot.js render từng chunk
```

## Mô hình dữ liệu / API

**POST /api/chat** (body JSON):
```json
{
  "userMessage": "string (max 1000 ký tự)",
  "history": [{ "role": "user|model", "parts": [{ "text": "..." }] }],
  "captchaToken": "string (Turnstile)"
}
```
Headers bắt buộc: `X-Request-Token` (HMAC-SHA256), `X-Request-Time` (timestamp ms).

SSE response events:
- `{ "text": "chunk" }` — từng đoạn text streaming
- `{ "done": true, "fullText": "...", "history": [...], "sources": [...] }` — kết thúc
- `{ "error": "..." }` — lỗi

**GET /api/google-sheet** — trả về JSON array trụ sở từ Google Sheets.

## Biến môi trường

```
GEMINI_API_KEY              # Gemini API key
PINECONE_API_KEY            # Pinecone API key
PINECONE_INDEX_NAME         # Tên index Pinecone (default: chatbot-tthc-xnc)
PINECONE_INDEX_HOST         # Host Pinecone index
PINECONE_NAMESPACE          # Namespace Pinecone
FIREBASE_SERVICE_ACCOUNT_JSON  # JSON key Firebase Admin (hoặc tách ra 3 biến dưới)
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
FIREBASE_DB_URL             # Firebase Realtime DB URL
FIREBASE_DB_SECRET          # Auth token Firebase RTDB
FIRESTORE_CHAT_COLLECTION   # Tên collection Firestore (default: chat_logs)
CHAT_LOG_HASH_SALT          # Salt cho hash IP trong log
CHAT_DIAGNOSTIC_LOG         # on/true mới ghi question/answer; mặc định off, cần privacy approval
EDGE_CONFIG                 # Vercel Edge Config connection string
TURNSTILE_SECRET_KEY        # Cloudflare Turnstile secret
ALLOWED_ORIGINS             # Comma-separated extra CORS origins
DEEPSEEK_API_KEY            # (tuỳ chọn) Nếu có → dùng DeepSeek thay Gemini
DEEPSEEK_MODEL              # (tuỳ chọn) Model DeepSeek (default: deepseek-v4-flash)
EVAL_BYPASS_TOKEN           # Token để bypass rate limit/captcha khi test nội bộ
GOOGLE_SHEET_ID             # Sheet ID cho dữ liệu trụ sở (dùng trong api/google-sheet.js)
```

## Lưu ý kiến trúc quan trọng

- **output.css được commit** vào repo và `npm run build` tái tạo CSS minified trước khi tạo `dist/`.
  Khi sửa Tailwind class, commit cả source và `output.css` mới.
- **FAQ cache in-memory** trong `api/chat.js` chỉ tồn tại trong 1 serverless instance — không
  shared giữa các instance, không persist khi cold start.
- **Pinecone namespace fallback**: code thử lần lượt nhiều namespace nếu namespace chính trả về rỗng.
- **Edge Config cache**: system prompt được cache 5 phút trong bộ nhớ serverless để giảm latency.
- **Firebase rate limit** dùng key HMAC của IP, ETag + optimistic reservation và fail-closed khi store lỗi. Test hiện tại
  khóa các nhánh lỗi; test tải đồng thời để chứng minh không vượt quota vẫn là backlog.
- **Published data boundary**: runtime public không được đọc `Form_Responses`; việc tạo/phê duyệt
  `Published_Locations` thuộc pipeline quản trị bên ngoài và phải được kiểm chứng riêng.
- **DeepSeek override**: nếu biến `DEEPSEEK_API_KEY` tồn tại, toàn bộ chat chuyển sang DeepSeek (không phải Gemini).
