# 01 - Architecture

## Stack

| Layer | Cong nghe |
|-------|-----------|
| Frontend | HTML5 + Tailwind CSS 3 + Vanilla JS |
| Ban do | Leaflet.js 1.9.4 + OpenStreetMap tiles |
| LLM / Chat | Gemini 2.5 Flash (streaming SSE), fallback DeepSeek |
| Embedding / RAG | Gemini Embedding 001 + Pinecone vector DB |
| Backend API | Vercel Serverless Functions (Node.js 20, CommonJS) + `@vercel/functions` `waitUntil` |
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
|- data/
|  `- tthc-catalog.json
|- js/
|  |- chatbot.js
|  |- gemini.js
|  |- location-data.js
|  `- tthc-catalog.js
|- lib/
|  |- output-validator.js
|  |- published-locations.js
|  |- regression-metrics.js
|  `- regression-grader.js
|- api/
|  |- chat.js
|  |- feedback.js
|  `- google-sheet.js
|- setup/
|- scripts/
|  |- generate-tthc-catalog.js
|  `- read-feedback.js
|- test/
|- assets/
|- vercel.json
`- package.json
```

## Code Graph

| Module / file | Vai tro | Duoc goi boi | Phu thuoc vao |
|---------------|---------|--------------|---------------|
| `index.html` | Shell UI, tai CSS/JS va DOM | Browser | `output.css`, `styles.css`, `app.js`, `js/chatbot.js`, `js/gemini.js`, `js/tthc-catalog.js` |
| `app.js` | Khoi tao Leaflet, tai tru so, tim kiem, marker | `index.html` | `js/location-data.js`, `api/google-sheet.js`, `data.js` |
| `data.js` | Fallback tinh cho map khi Google Sheets loi | `app.js` | - |
| `js/location-data.js` | Normalize payload `Published_Locations`, parse toa do, bounds check, doc them `search_aliases` neu co | `app.js`, `lib/published-locations.js`, test | - |
| `js/gemini.js` | Goi `POST /api/chat` (parse SSE stream) va `POST /api/feedback` (`sendFeedback`); ky HMAC dung chung qua `signRequestToken` | `js/chatbot.js` | `api/chat.js`, `api/feedback.js` |
| `js/chatbot.js` | UI chat, toggle panel, render stream, nut doi chieu TTHC khi source co `procedure_id`, va action bar 👍/👎 + form bao cao (sinh `turn_id` client, goi `GeminiAI.sendFeedback`) | `index.html` | `js/gemini.js`, `window.TthcCatalog` neu co |
| `js/tthc-catalog.js` | UI danh muc TTHC tinh: load JSON, loc/tim kiem, xem chi tiet, public API `window.TthcCatalog` | `index.html`, `js/chatbot.js` | `data/tthc-catalog.json` |
| `data/tthc-catalog.json` | Catalog TTHC tinh de nguoi dung doi chieu cau tra loi AI | `js/tthc-catalog.js` | sinh tu Pinecone live + audit phi, fallback backup khi local khong co key |
| `lib/published-locations.js` | Fetch GViz Google Sheets, cache 60s, stale fallback 5m, dedupe/conflict, hop nhat alias va match tru so theo hoi thoai | `api/google-sheet.js`, `api/chat.js`, test | `js/location-data.js`, Google Sheets GViz |
| `lib/output-validator.js` | Fail-closed output guard: doi chieu va redact SDT/Maps/toa do/so lieu phap ly khong co trong nguon xac minh | `api/chat.js`, test | - |
| `lib/regression-metrics.js` | Dem tu Unicode-safe va giu ngan sach verbosity 120/250 dong bo voi prompt answer-first | `scripts/run-regression.js`, test | `Intl.Segmenter` Node 20 |
| `lib/regression-grader.js` | Bo cham regression 2 lop (T1.4 deterministic: required/forbidden facts, ngon ngu, verbosity; T1.5 grounding: Recall@4/MRR/source recall + fact-in-docs) doc tu `test/regression-expectations.json`; verdict PASS/HARD_FAIL/DEFERRED_FAIL, F01 deferred khong chan gate | `scripts/run-regression.js`, test | `test/regression-expectations.json`, eval trace tu `api/chat.js` (T1.3) |
| `api/feedback.js` | Serverless nhan bao cao/phan hoi nguoi dung ve cau tra loi chatbot; tai dung CORS/HMAC/sanitize tu `api/chat.js`; rate limit best-effort IP/ngay + ghi `chat_feedback/<date_key>` tren RTDB voi TTL | `js/gemini.js` | `api/chat.js` (require cheo helper), Firebase RTDB |
| `scripts/read-feedback.js` | Doc `chat_feedback/<date_key>` tu RTDB, in bao cao theo ngay (loc `--down`) de admin ra soat | Developer / cron | Firebase RTDB, `.env` |
| `api/google-sheet.js` | Proxy chi cho phep `Published_Locations`, giu response payload hien tai | `app.js` | `lib/published-locations.js` |
| `api/chat.js` | Serverless chinh: xac thuc, rate limit, RAG Pinecone, split intent `tam_tru_khai_bao`/`tam_tru_the`, fail-closed branch filter, stream model, inject `<verified_locations>`, `buildCitationSource` tra them `procedure_id`/`title` cho nut doi chieu TTHC, dang ky groundedness background task | `js/gemini.js` | Pinecone, Gemini API, Firebase, `@vercel/functions`, `lib/published-locations.js` |
| `scripts/generate-tthc-catalog.js` | Sinh `data/tthc-catalog.json`; uu tien doc Pinecone live, mac dinh gom `tthc_*` + `guide_*` co noi dung (loc guide rong/noi bo), dedupe theo linh vuc+cap+ten, fallback backup khi local khong co env | Developer, test | `data/pinecone-backups/`, Pinecone, `.env`/`.env.local` |
| `setup/apps-script.js` | Pipeline allowlist -> staging -> published cho Google Sheets | Google Apps Script | SpreadsheetApp |
| `scripts/run-regression.js` | Runner regression API that, loc theo ID; gui `evalDebug:true` va tu cham DU 30 ca bang `lib/regression-grader.js` (2 lop); bao cao tach PASS/HARD_FAIL/DEFERRED_FAIL + grounding metric; exit 1 chi khi co hard fail | CLI / agent | `api/chat.js`, `lib/regression-grader.js`, `lib/regression-metrics.js`, `test/regression-expectations.json`, `test/cau-hoi/bo-test-regression-30-cau-nguoi-nuoc-ngoai-tthc.md`, `test/results/` |
| `scripts/repair-pinecone-temp-residence.js` | Script sua Pinecone `tthc_matt26265`: backup, re-embed, upsert UTF-8 sach, verify top-1 | CLI / agent | Pinecone, Gemini Embedding API, `.env`, `data/pinecone-backups/` |

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
   2. Check rate limit Firebase (P1.4.1: reserve IP/ngay va thang chay SONG SONG qua Promise.allSettled,
      rollback ben thanh cong neu ben kia fail — xem RATE_LIMIT_MAX_RETRIES)
   3. Sanitize history
   4. Detect nhu cau tra tru so tu current message + recent history, gom ca cau dau ngan chi la dia danh
   5. Skip FAQ cache neu cau hoi co dia diem/PII
   6. Tai Published_Locations qua helper cache 60s / stale 5m
   7. Dedupe ban ghi giong nhau, phat hien ban ghi mau thuan
   8. Match ten tru so/alias exact-normalized theo uu tien: ten hien hanh day du -> bo `Cong an` -> ten xa/phuong hien hanh -> `search_aliases`
   9. (P1.1.3) Ghep ngu canh cau truoc vao query embedding CHI KHI cau hien tai < 8 tu (follow-up ngan); cau du dai dung doc lap. Embed query -> Gemini Embedding 001
  10. Query Pinecone cho thu tuc/phap luat trong DUNG 1 namespace pin tu `PINECONE_NAMESPACE` (P1.1.1: bo vong thu nhieu namespace); van giu 1 fallback bo metadata filter neu co category ma 0 match. Tach intent `tam_tru_khai_bao` va `tam_tru_the`; voi `tam_tru_khai_bao`, chi giu lai tai lieu co `retrieval_intent` dung nhanh hoac tin hieu ro `NA17`/`KBTT`/nguoi nuoc ngoai/co so luu tru, dong thoi loai fail-closed tai lieu cu tru cong dan Viet Nam (`Thong bao luu tru`, `Dang ky tam tru`, `Luat Cu tru`, `VNeID`, moc 23h/08h)
  11. Loai runtime moi match `tru_so` khoi prompt va citation
  11b. Neu `detectXncAuthorityIntent` dung (thi thuc/gia han/the tam tru/e-visa/NNN mat ho chieu): bom tinh `XNC_RECEPTION_VERIFIED_BLOCK` (3 diem tiep dan Phong QLXNC, chi dia chi + SDT, chua co toa do) vao `<verified_locations>`, doc lap matcher
  11c. (P1.1.2) Rerank Gemini co dieu kien: bo qua (`shouldSkipRerank`) khi top-1 > 0.75 diem VA cach top-2 >= 0.05 — chi rerank khi con map mo
  12. Inject `<verified_locations>` + `<retrieved_documents>` vao system prompt
  13. Stream Gemini 2.5 Flash / DeepSeek
  14. Validate ban cuoi: redact token lien he/phap ly khong co trong nguon xac minh
  15. Ghi telemetry toi thieu, gom so luong/loai violation cua output validator; groundedness check chay sau response qua Vercel `waitUntil`
  16. (P1.2.1) Sau `res.end()`, dang ky `checkGroundednessAsync` bang Vercel `waitUntil`: neu answer
      co so lieu, Gemini Flash doi chieu voi legalCorpus va ghi `groundedness_checks/<date>` vao
      Firebase — chi canh bao, khong chan response
-> SSE ve client
```

### Luong danh muc TTHC

```text
index.html load
-> js/tthc-catalog.js init
-> user mo "Danh muc thu tuc hanh chinh"
-> fetch data/tthc-catalog.json same-origin
-> render chip loc linh vuc + tim kiem + danh sach
-> xem chi tiet thu tuc voi text nguyen van va phi da resolve

Developer chay `npm run gen:catalog`
-> scripts/generate-tthc-catalog.js
-> neu co PINECONE_API_KEY hop le: list/fetch Pinecone namespace, lay `tthc_*`, group `guide_*` co `Noi dung wiki` theo ten thu tuc
-> loai guide noi bo/rong, dedupe guide neu trung tieu de voi `tthc_*`, tom tat fee tu than muc phi/le phi, sort theo category/cap
-> neu khong co env hop le: fallback backup trong repo (va co the `--fetch-missing` cho 4 record thieu)
-> ghi data/tthc-catalog.json

Chat source co procedure_id
-> js/chatbot.js render nut "Doi chieu trong danh muc"
-> window.TthcCatalog.openProcedure(procedure_id)
-> mo dung chi tiet thu tuc neu catalog co id; neu khong thi hien thong bao thieu
```

## Mo hinh du lieu / API

### `POST /api/chat`

```json
{
  "userMessage": "string (max 1000 ky tu)",
  "history": [{ "role": "user|model", "parts": [{ "text": "..." }] }],
  "captchaToken": "string",
  "evalDebug": "boolean (tuy chon, CHI eval-run non-production — xem T1.3)"
}
```

Headers bat buoc:

- `X-Request-Token`
- `X-Request-Time`

SSE response events:

- `{ "status": "generating" }` (P3.1: phát 1 lần sau khâu truy hồi, trước token đầu — client đổi nhãn typing "Đang tra cứu…" → "Đang soạn trả lời…"; client cũ bỏ qua an toàn)
- `{ "text": "chunk" }`
- `{ "done": true, "fullText": "...", "history": [...], "sources": [...] }`
- `{ "error": "..." }`

**Eval-mode output (T1.3):** event `done` đính thêm trường `eval` (trace retrieval cho bộ chấm
grounding) CHỈ khi đủ 3 điều kiện AND: `NODE_ENV !== 'production'` + `captchaToken === EVAL_BYPASS_TOKEN`
+ body `evalDebug: true` (`shouldAttachEvalDebug` trong `api/chat.js`). Production KHÔNG BAO GIỜ trả
`eval`. Cấu trúc: `{ standaloneQuery, classifyQuery, category, matchesRaw[], matchesFinal[] (kèm rank),
excluded[] (id + lý do: location_vector/wrong_branch/below_threshold/rerank_or_topk_cut), matchedDocs }`.

### `POST /api/feedback`

Nhan bao cao/phan hoi cua nguoi dung ve mot luot tra loi cua chatbot. Headers bat buoc khi co Origin:
`X-Request-Token`, `X-Request-Time` (HMAC ky tren chuoi `${turn_id}:${rating}`, cung cong thuc voi `/api/chat`).

```json
{
  "turn_id": "t_<ts>_<n>_<rand>",
  "rating": "up | down",
  "category": "sai_thong_tin | thieu_thong_tin | khong_lien_quan | ngon_tu | khac (tuy chon)",
  "comment": "string (<=1000, tuy chon)",
  "contact": "string (<=200, tuy chon)",
  "question": "string (<=4000, tuy chon)",
  "answer": "string (<=4000, tuy chon)",
  "sources": "[{ file, article, url, procedure_id }] (toi da 8)"
}
```

Response: `200 { ok: true }` · `400` (body/rating/turn_id/category sai) · `403` (origin/token) · `429` (rate limit IP/ngay) · `503` (khong ghi duoc). Luu vao RTDB `chat_feedback/<date_key>` (giờ VN), IP HMAC-hash, noi dung sanitize PII, co TTL `expires_at`. Ngoai le privacy co kiem soat: CO luu Q/A vi nguoi dung chu dong opt-in (xem 03-decisions).

### `GET /api/google-sheet`

Tra ve payload GViz da parse cua sheet `Published_Locations`. Public contract giu nguyen.

### `GET /data/tthc-catalog.json`

File tinh same-origin duoc copy vao `dist/` boi `scripts/build-static.js`. Frontend chi doc file nay de hien thi
danh muc doi chieu; runtime khong goi Pinecone tu trinh duyet.

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
FEEDBACK_DAILY_IP_LIMIT
FEEDBACK_RETENTION_DAYS
EMBED_TASK_TYPE
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
```

Biến mới (2026-07-10):
- `EMBED_TASK_TYPE` (P2.2): khi đặt `RETRIEVAL_QUERY`, query embedding dùng taskType bất đối xứng —
  CHỈ bật đồng bộ với corpus đã re-embed `RETRIEVAL_DOCUMENT` (`setup/reembed-corpus.js`) sang namespace mới.
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` (P3.4): opt-in cảnh báo groundedness-fail và feedback 👎; thiếu → no-op.

## Luu y kien truc quan trong

- **CSP header** (P1.3.4): Content-Security-Policy KHONG con o meta tag trong `index.html` nua —
  chuyen sang header that trong `vercel.json` (route `/(.*)`), kem `X-Content-Type-Options: nosniff`
  va `Referrer-Policy: strict-origin-when-cross-origin`. 1 nguon su that duy nhat; sua CSP phai sua
  `vercel.json`, khong sua `index.html`. `frame-ancestors 'none'` chi hoat dong qua header (meta tag
  khong ho tro directive nay).
- **CORS** (P1.3.1-3): khong con gui `Access-Control-Allow-Credentials` (app khong dung cookie).
  `isAllowedOrigin` chi cho fallback so `x-forwarded-host` khi `process.env.VERCEL` ton tai (platform
  tu set header nay, client khong gia mao duoc); ngoai Vercel thi fallback bi tat. IP client cho rate
  limit uu tien `x-vercel-forwarded-for` -> `x-real-ip` -> `x-forwarded-for` (XFF client co the tu chen
  gia tri gia vao dau chuoi).
- `output.css` duoc commit va `npm run build` se tai tao lai file nay truoc khi tao `dist/`.
- `scripts/build-static.js` dung allowlist file ro rang; khi them file runtime tinh nhu `js/tthc-catalog.js` hoac
  `data/tthc-catalog.json` phai them vao allowlist, neu khong preview/production se 404.
- `data/tthc-catalog.json` la snapshot tinh dung cho UI doi chieu; generator uu tien Pinecone live neu local co env hop le,
  nhung frontend van chi fetch file same-origin nay va khong goi Pinecone runtime tu browser.
- `.env.local` co the ton tai key Pinecone rong; generator bo qua gia tri rong va fallback ve `.env` thay vi coi nhu da cau hinh.
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
