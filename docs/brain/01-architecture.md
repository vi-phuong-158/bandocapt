# 01 - Architecture

## Stack

| Layer | Cong nghe |
|-------|-----------|
| Frontend | HTML5 + Tailwind CSS 3 + Vanilla JS |
| Ban do | Leaflet.js 1.9.4 + OpenStreetMap tiles |
| LLM / Chat | Gemini 2.5 Flash (streaming SSE), fallback DeepSeek |
| Embedding / RAG | Gemini Embedding 001 + Pinecone vector DB |
| Backend API | Vercel Serverless Functions (Node.js 20, CommonJS) |
| System prompt | Hardcode trong `api/chat.js` (`SYSTEM_PROMPT_BASE`) |
| Du lieu tru so | Google Sheets `Published_Locations` qua helper + proxy |
| Telemetry | Firebase Firestore + Firebase Realtime DB fallback |
| Rate limiting | Firebase Realtime DB |
| CAPTCHA | Cloudflare Turnstile |
| Hosting | Vercel |
| CSS build | Tailwind CLI (`input.css` -> `output.css`) |

## Cau truc thu muc chinh

```text
bandocapt/
|- index.html
|- app.js
|- styles.css
|- input.css
|- output.css
|- data.js
|- js/
|  |- chatbot.js
|  |- gemini.js
|  `- location-data.js
|- lib/
|  `- published-locations.js
|- api/
|  |- chat.js
|  `- google-sheet.js
|- setup/
|- scripts/
|- test/
|- assets/
|- vercel.json
`- package.json
```

## Code Graph

| Module / file | Vai tro | Duoc goi boi | Phu thuoc vao |
|---------------|---------|--------------|---------------|
| `index.html` | Shell UI, tai CSS/JS va DOM | Browser | `output.css`, `styles.css`, `app.js`, `js/chatbot.js`, `js/gemini.js` |
| `app.js` | Khoi tao Leaflet, tai tru so, tim kiem, marker | `index.html` | `js/location-data.js`, `api/google-sheet.js`, `data.js` |
| `data.js` | Fallback tinh cho map khi Google Sheets loi | `app.js` | - |
| `js/location-data.js` | Normalize payload `Published_Locations`, parse toa do, bounds check, doc them `search_aliases` neu co | `app.js`, `lib/published-locations.js`, test | - |
| `js/gemini.js` | Goi `POST /api/chat`, parse SSE stream | `js/chatbot.js` | `api/chat.js` |
| `js/chatbot.js` | UI chat, toggle panel, render stream | `index.html` | `js/gemini.js` |
| `lib/published-locations.js` | Fetch GViz Google Sheets, cache 60s, stale fallback 5m, dedupe/conflict, hop nhat alias va match tru so theo hoi thoai | `api/google-sheet.js`, `api/chat.js`, test | `js/location-data.js`, Google Sheets GViz |
| `lib/output-validator.js` | Fail-closed output guard: doi chieu va redact SDT/Maps/toa do/so lieu phap ly khong co trong nguon xac minh | `api/chat.js`, test | - |
| `api/google-sheet.js` | Proxy chi cho phep `Published_Locations`, giu response payload hien tai | `app.js` | `lib/published-locations.js` |
| `api/chat.js` | Serverless chinh: xac thuc, rate limit, RAG Pinecone, stream model, inject `<verified_locations>` | `js/gemini.js` | Pinecone, Gemini API, Firebase, `lib/published-locations.js` |
| `setup/apps-script.js` | Pipeline allowlist -> staging -> published cho Google Sheets | Google Apps Script | SpreadsheetApp |

## Luong xu ly chinh

### Luong ban do

```text
index.html load
-> app.js init
-> fetch /api/google-sheet?sheet=Published_Locations
-> lib/published-locations.js fetch Google GViz payload
-> js/location-data.js normalize/validate
-> render markers
```

### Luong quan tri du lieu ban do

```text
Google Form submit
-> setup/apps-script.js onFormSubmit
-> Unit_Allowlist check
-> ghi Location_Staging + Approval_Audit_Log
-> admin approve/reject/revoke
-> Published_Locations update
```

### Luong chatbot RAG

```text
User nhap
-> js/chatbot.js
-> js/gemini.js
-> POST /api/chat
-> api/chat.js
   1. Verify CORS + Turnstile + HMAC
   2. Check rate limit Firebase
   3. Sanitize history
   4. Detect nhu cau tra tru so tu current message + recent history, gom ca cau dau ngan chi la dia danh
   5. Skip FAQ cache neu cau hoi co dia diem/PII
   6. Tai Published_Locations qua helper cache 60s / stale 5m
   7. Dedupe ban ghi giong nhau, phat hien ban ghi mau thuan
   8. Match ten tru so/alias exact-normalized theo uu tien: ten hien hanh day du -> bo `Cong an` -> ten xa/phuong hien hanh -> `search_aliases`
   9. Embed query -> Gemini Embedding 001
  10. Query Pinecone cho thu tuc/phap luat; tach intent `tam_tru_khai_bao` va `tam_tru_the`, map ve metadata Pinecone chung roi post-filter theo title/text de tranh tron `NA17` voi `NA6/NA8`
  11. Loai runtime moi match `tru_so` khoi prompt va citation
  11b. Neu `detectXncAuthorityIntent` dung (thi thuc/gia han/the tam tru/e-visa/NNN mat ho chieu): bom tinh `XNC_RECEPTION_VERIFIED_BLOCK` (3 diem tiep dan Phong QLXNC, chi dia chi + SDT, chua co toa do) vao `<verified_locations>`, doc lap matcher
  12. Inject `<verified_locations>` + `<retrieved_documents>` vao system prompt
  13. Stream Gemini 2.5 Flash / DeepSeek
  14. Validate ban cuoi: redact token lien he/phap ly khong co trong nguon xac minh
  15. Ghi telemetry toi thieu, gom so luong/loai violation cua output validator
-> SSE ve client
```

## Mo hinh du lieu / API

### `POST /api/chat`

```json
{
  "userMessage": "string (max 1000 ky tu)",
  "history": [{ "role": "user|model", "parts": [{ "text": "..." }] }],
  "captchaToken": "string"
}
```

Headers bat buoc:

- `X-Request-Token`
- `X-Request-Time`

SSE response events:

- `{ "text": "chunk" }`
- `{ "done": true, "fullText": "...", "history": [...], "sources": [...] }`
- `{ "error": "..." }`

### `GET /api/google-sheet`

Tra ve payload GViz da parse cua sheet `Published_Locations`. Public contract giu nguyen.

## Bien moi truong

```text
GEMINI_API_KEY
PINECONE_API_KEY
PINECONE_INDEX_NAME
PINECONE_INDEX_HOST
PINECONE_NAMESPACE
FIREBASE_SERVICE_ACCOUNT_JSON
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
FIREBASE_DB_URL
FIREBASE_DB_SECRET
FIRESTORE_CHAT_COLLECTION
FIRESTORE_DIAGNOSTIC_COLLECTION
CHAT_LOG_HASH_SALT
CHAT_DIAGNOSTIC_LOG
CHAT_DIAGNOSTIC_LOG_APPROVED
CHAT_DIAGNOSTIC_LOG_UNTIL
CHAT_DIAGNOSTIC_LOG_SAMPLE_RATE
TELEMETRY_METRIC_RETENTION_DAYS
TELEMETRY_DIAGNOSTIC_RETENTION_DAYS
TURNSTILE_SECRET_KEY
ALLOWED_ORIGINS
DEEPSEEK_API_KEY
DEEPSEEK_MODEL
EVAL_BYPASS_TOKEN
GOOGLE_SHEET_ID
RATE_LIMIT_MONTHLY
RATE_LIMIT_DAILY_IP
```

## Luu y kien truc quan trong

- `output.css` duoc commit va `npm run build` se tai tao lai file nay truoc khi tao `dist/`.
- FAQ cache trong `api/chat.js` la in-memory theo tung serverless instance, khong shared giua cac instance.
- Cau hoi co nhu cau tra dia diem/tru so khong duoc dung FAQ cache 1 gio de tranh dia chi cu sau khi Google Sheet cap nhat.
- `Published_Locations` la nguon runtime duy nhat cho ten don vi, dia chi, so dien thoai, toa do va Google Maps cua chatbot.
- `Location_Staging` va `Published_Locations` co the co cot tuy chon `search_aliases` (chuoi phan cach bang `|`) de luu dia danh cu/viet tat; runtime chi hien thi `name` la ten don vi hien hanh.
- Helper `lib/published-locations.js` cache fresh 60 giay, cho phep dung stale toi da 5 phut neu Google Sheets loi.
- Ban ghi trung hoan toan duoc gop va hop nhat alias. Ban ghi cung ten nhung khac dia chi/toa do thi chatbot khong tu chon, phai hoi lai user.
- Runtime mo ta dia gioi hien hanh theo mo hinh `tinh Phu Tho -> xa/phuong`; alias lich su chi duoc dung neu backend da match tu `search_aliases`.
- Vector Pinecone `tru_so` van duoc giu trong index de rollback, nhung runtime `api/chat.js` loai bo khoi prompt va citation.
- `Published_Locations` public khong doc `Form_Responses`; pipeline admin van di qua `Unit_Allowlist` -> `Location_Staging` -> `Published_Locations`.
- Neu `DEEPSEEK_API_KEY` ton tai thi runtime chat chuyen sang DeepSeek thay Gemini.
