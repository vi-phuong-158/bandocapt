# Zalo Bot — Kênh công khai thứ hai của Bản đồ Công an Phú Thọ

> Nguyên tắc kiến trúc: **MỘT LÕI — NHIỀU KÊNH**. Website (`/api/chat`) và Zalo Bot
> (`/api/zalo-bot`) dùng chung một hàm điều phối nghiệp vụ duy nhất (`runChatCore`,
> trong `api/chat.js`). Zalo không phải một chatbot AI thứ hai độc lập — nó là một
> transport adapter khác, giống hệt website nhưng không có browser/CAPTCHA.

## 1. Kiến trúc

```text
Website
   │
   ▼
POST /api/chat
   │
   ├── CORS whitelist + Origin check
   ├── Turnstile CAPTCHA
   ├── HMAC request signing (verifyRequestSignature)
   ├── Rate limit theo IP/ngày (Firebase)
   └── SSE transport (createSseSink)
            │
            ▼
      runChatCore(...)  ← LÕI NGHIỆP VỤ DÙNG CHUNG
            │
     ┌──────┼────────────────────┬────────────────┐
     ▼      ▼                    ▼                ▼
 Gemini/  Pinecone RAG    lib/published-locations   lib/output-validator
 DeepSeek (retrieval-governance)  (resolver địa điểm)   (validate câu trả lời)


Zalo
   │
   ▼
POST /api/zalo-bot   (Vercel rewrite → api/feedback.js?__route=zalo-bot → lib/zalo-bot-handler.js)
   │
   ├── Xác minh X-Bot-Api-Secret-Token (ZALO_BOT_WEBHOOK_SECRET)
   ├── ZALO_BOT_ENABLED kill switch
   ├── Parse event phòng thủ (extractIncomingMessage)
   ├── Dedupe theo chat_id + message_id (lib/zalo-session.js, Firestore)
   ├── Rate limit theo chat/global (lib/rate-limit-store.js — Upstash Redis)
   ├── ACK 200 ngay, xử lý nền qua waitUntil
   └── lib/zalo-bot-client.js (sendMessage/sendChatAction)
            │
            ▼
      runChatCore(...)  ← ĐÚNG CÙNG HÀM NHƯ WEBSITE, sink khác (BufferSink)
            │
            ▼
      lib/zalo-formatter.js → 1-3 tin nhắn Zalo
```

**Điều gì KHÔNG được dùng lại giữa hai kênh (transport riêng của website, không đụng đến):**
CORS, Turnstile CAPTCHA, HMAC request signing (`X-Request-Token`), rate limit IP/ngày
(`CHAT_DAILY_IP_LIMIT`), SSE. Zalo không giả lập browser, không có `SKIP_CAPTCHA`, không có
bypass token nào — nó xác thực bằng cơ chế riêng của Zalo (`X-Bot-Api-Secret-Token`) và có
rate limit riêng theo `chat_id`/global.

**Điều gì DÙNG CHUNG (một lõi duy nhất):** system prompt, Pinecone RAG, retrieval
governance, `Published_Locations` resolver + hợp đồng location-evidence fail-closed,
output validator, provider fallback logic (Gemini/DeepSeek). Tất cả nằm trong
`runChatCore` (`api/chat.js`) — không có bản sao logic nào cho Zalo.

### Vì sao không có `api/zalo-bot.js` là một file Serverless Function riêng

Dự án đang ở giới hạn 12 Serverless Function của gói Vercel Hobby (đã dùng đủ 12, xem
`test/vercel-preview-budget.test.js`). Thêm một file mới trực tiếp dưới `api/` sẽ vượt giới
hạn và có thể làm deploy thất bại. Endpoint công khai `https://bandocapt.io.vn/api/zalo-bot`
vẫn tồn tại đúng như nhiệm vụ yêu cầu, nhưng được `vercel.json` rewrite nội bộ:

```json
{ "source": "/api/zalo-bot", "destination": "/api/feedback?__route=zalo-bot" }
```

`api/feedback.js` chỉ thêm đúng MỘT nhánh bridge ở đầu handler (kiểm tra
`req.query.__route === 'zalo-bot'` rồi gọi thẳng `lib/zalo-bot-handler.js`) — không đổi bất
kỳ hành vi feedback nào khác. Đây là kỹ thuật đã dùng trước đó cho
`/api/staff/auth/config → api/staff/auth/csrf.js`. Toàn bộ logic nghiệp vụ Zalo thật sự nằm
trong `lib/zalo-bot-handler.js` (không phải một file dưới `api/`, nên không tính vào giới hạn
12 hàm).

### Module map

| File | Vai trò |
|------|---------|
| `api/chat.js` → `runChatCore(ctx)` | Lõi nghiệp vụ dùng chung (đã tách khỏi phần transport/CORS/Turnstile/HMAC/rate-limit của website — xem `docs/brain/03-decisions.md`). |
| `lib/response-sink.js` | `createSseSink`/`createBufferSink` — sink đã có sẵn từ trước (PR-1, 2026-08-25); Zalo dùng `createBufferSink`. |
| `lib/zalo-bot-handler.js` | Webhook handler thật: bảo mật, parse event, dedupe, rate limit, gọi `runChatCore`, format, gửi tin. |
| `lib/zalo-bot-client.js` | Adapter gọi Zalo Bot API (`sendMessage`, `sendChatAction`, `setWebhook`, `getWebhookInfo`), retry giới hạn, không log token. |
| `lib/zalo-session.js` | Session (ngữ cảnh vài lượt gần nhất) + dedupe webhook, cùng dùng Firestore, key băm HMAC. |
| `lib/zalo-formatter.js` | Chuyển kết quả `runChatCore` thành 1-3 tin nhắn Zalo an toàn (cắt Unicode-safe, khối địa điểm/nguồn ngắn gọn). |
| `api/feedback.js` | Chỉ thêm 1 nhánh bridge đầu handler, logic feedback gốc không đổi. |
| `scripts/setup-zalo-webhook.js` | Script owner tự chạy để gọi `setWebhook`/`getWebhookInfo` bằng token trên máy của owner. |

## 2. Luồng dữ liệu (data flow)

1. Người dùng nhắn tin cho Bot trên Zalo → Zalo gọi webhook `POST /api/zalo-bot`.
2. `lib/zalo-bot-handler.js` xác minh `X-Bot-Api-Secret-Token`, kiểm tra `ZALO_BOT_ENABLED`.
3. Parse event phòng thủ → chỉ xử lý tin nhắn văn bản, chat PRIVATE (GROUP bị bỏ qua, xem
   mục 30 "không làm trong phase này").
4. Dedupe theo `sha256(chat_id:message_id)` qua `lib/zalo-session.js` (Firestore
   `docRef.create()` atomic — TTL mặc định 15 phút).
5. ACK `200 { ok: true }` ngay lập tức; phần còn lại chạy nền qua `waitUntil` (giữ đúng cơ
   chế `@vercel/functions` đã dùng trong `api/chat.js`/`api/feedback.js`).
6. Nền: intent tất định (`/start`, `/bando`, "đóng góp", "trang web") được trả lời ngay,
   không gọi AI. Câu hỏi khác đi qua `validateChatRequestBody` (dùng chung với website —
   giới hạn 1000 ký tự + chặn prompt injection), rồi rate limit theo `chat_id`/global.
7. Lấy `history` từ `lib/zalo-session.js` (tối đa 8 lượt gần nhất, TTL 45 phút mặc định).
8. Gọi `runChatCore({ userMessage, history, clientIP: 'zalo:<chatId>', sink: BufferSink, ... })`
   — đúng pipeline RAG/location/validator như website.
9. Đọc kết quả từ `BufferSink.result()` (`{ fullText, sources, verifiedLocations }` hoặc
   `failure`), format bằng `lib/zalo-formatter.js`, gửi 1-3 tin nhắn qua `lib/zalo-bot-client.js`.
10. Ghi lại lượt hỏi/đáp vào session (không lưu chat.id thô).

## 3. Environment variables

Xem `.env.local` mẫu trong `docs/brain/05-testing-and-deploy.md`. Tóm tắt:

| Biến | Bắt buộc | Mô tả |
|------|----------|-------|
| `ZALO_BOT_ENABLED` | Có | `"true"` để bật; bất kỳ giá trị nào khác (kể cả rỗng/thiếu) = tắt hoàn toàn (kill switch). |
| `ZALO_BOT_TOKEN` | Có (khi bật) | Bot Token từ Zalo Bot Manager. Không hardcode, không log. |
| `ZALO_BOT_WEBHOOK_SECRET` | Có (khi bật) | Secret dùng để verify header `X-Bot-Api-Secret-Token`. 8-256 ký tự. |
| `PUBLIC_APP_URL` | Không (mặc định `https://bandocapt.io.vn`) | Dùng để dựng webhook URL và các link trả về người dùng. |
| `ZALO_REQUEST_DEADLINE_MS` | Không (mặc định 45000) | Deadline nội bộ cho `runChatCore` khi chạy qua Zalo. |
| `ZALO_SESSION_TTL_MINUTES` | Không (mặc định 45) | TTL ngữ cảnh hội thoại Zalo. |
| `ZALO_DEDUPE_TTL_MINUTES` | Không (mặc định 15) | TTL cửa sổ dedupe webhook. |
| `ZALO_CHAT_RATE_LIMIT` / `ZALO_GLOBAL_RATE_LIMIT` | Không (mặc định 20 / 300 mỗi giờ) | Rate limit theo chat và toàn hệ thống, dùng chung `lib/rate-limit-store.js` (Upstash Redis `KV_REST_API_URL`/`KV_REST_API_TOKEN` đã có sẵn cho `/api/location-contributions`; fallback bộ nhớ trong nếu chưa cấu hình). |
| `ZALO_MESSAGE_SAFETY_LIMIT` | Không (mặc định 1800) | Giới hạn ký tự an toàn mỗi tin nhắn Zalo (xem mục 5). |

Firestore dùng chung cấu hình đã có của dự án (`FIREBASE_SERVICE_ACCOUNT_JSON` hoặc
`FIREBASE_PROJECT_ID`/`FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY`) — không có biến mới
cho Firebase.

## 4. Webhook setup (owner thực hiện, không qua Claude/chat)

1. Tạo Bot bằng **Zalo Bot Manager** (`https://bot.zaloplatforms.com`), lấy Bot Token.
2. Tự sinh một chuỗi ngẫu nhiên 8-256 ký tự làm webhook secret.
3. Thêm 4 biến `ZALO_BOT_TOKEN`, `ZALO_BOT_WEBHOOK_SECRET`, `ZALO_BOT_ENABLED=true`,
   `PUBLIC_APP_URL` vào Vercel Environment Variables (Preview hoặc Production tuỳ nhu cầu).
4. Deploy.
5. Trên máy có quyền đọc các env vừa cấu hình (đã `vercel env pull .env.local`), chạy:
   ```bash
   npm run zalo:setup-webhook
   ```
   Script gọi `setWebhook` rồi in kết quả `getWebhookInfo` — không bao giờ in Bot Token.
6. Gửi `/start` cho Bot trên Zalo, xác nhận nhận được giới thiệu + cảnh báo không nhập dữ
   liệu nhạy cảm + link bản đồ.
7. Hỏi một câu địa điểm ("Công an xã Bình Xuyên ở đâu?") và một câu thủ tục, xác nhận có
   trả lời hợp lý, có nguồn/địa điểm khi phù hợp.
8. Gửi lại follow-up ngắn để kiểm tra ngữ cảnh multi-turn còn giữ được.
9. Kiểm tra Vercel Function Logs không có Bot Token nào bị log.

## 5. Zalo API contract đã xác minh

**Quan trọng:** môi trường build phiên này bị chặn egress tới `docs.zaloplatforms.com` (và
các mirror liên quan), nên KHÔNG đọc trực tiếp được tài liệu chính thức mới nhất. Hợp đồng
dưới đây được suy ra từ việc đối chiếu ĐỘC LẬP nhiều SDK bên thứ ba (Go, Python, JS, n8n)
cho cùng một API — các nguồn đồng thuận với nhau, và khớp với giả định trong yêu cầu nhiệm
vụ (đặc biệt header `X-Bot-Api-Secret-Token`), nhưng **owner nên tự đối chiếu lại với tài
liệu chính thức tại `docs.zaloplatforms.com` trước khi coi đây là hợp đồng cuối cùng cho
production** (mục 3 của yêu cầu nhiệm vụ: "official Zalo documentation thắng prompt").

| Mục | Giá trị dùng trong code | Độ tin cậy |
|-----|--------------------------|------------|
| Base URL | `https://bot-api.zaloplatforms.com/bot<TOKEN>/<method>` | Trung bình — đối chiếu độc lập từ 2 nguồn (search kết quả trực tiếp nêu URL này). |
| Header verify webhook | `X-Bot-Api-Secret-Token` | Cao — 3 nguồn độc lập (Go SDK constant, n8n node, tổng hợp search) đều nêu đúng tên này, khớp với chính yêu cầu nhiệm vụ. |
| `sendMessage` | `POST .../sendMessage` body `{ chat_id, text }` | Cao — khớp nhiều SDK (Python `send_message(chat_id, text)`, Go, JS). |
| `sendChatAction` | `POST .../sendChatAction` body `{ chat_id, action }` | Cao — cùng nguồn trên. |
| `setWebhook` | `POST .../setWebhook` body `{ url, secret_token }`; secret 8-256 ký tự, URL phải HTTPS | Cao. |
| `getWebhookInfo` | `POST .../getWebhookInfo` không tham số | Trung bình — suy từ pattern Telegram-style + xác nhận có tồn tại method này ở mọi SDK. |
| Response envelope | `{ ok: boolean, result?, description? }` | Trung bình-cao — Go SDK định nghĩa `BaseResp[T]{ OK, Description, Result }` tường minh. |
| Webhook update JSON | Có `message.chat.id`, `message.message_id`, `message.text`; có thể bọc thêm `{ result: {...} }` | **Thấp — CHƯA xác minh được đầy đủ.** `lib/zalo-bot-handler.js#extractIncomingMessage` cố tình parse phòng thủ, chấp nhận cả hai dạng lồng/không lồng, và coi mọi dạng không khớp là "event không hỗ trợ" (bỏ qua an toàn, không throw) thay vì giả định cứng một shape duy nhất. |
| Giới hạn độ dài tin nhắn | ~2000 ký tự (giả định theo yêu cầu nhiệm vụ) | **Chưa xác minh bằng tài liệu chính thức.** Code dùng biên an toàn 1800 ký tự (`ZALO_MESSAGE_SAFETY_LIMIT`), có thể chỉnh qua env nếu con số thật khác. |
| Rate limit/quota, retry semantics của webhook | Không xác định được | Không giả định — code không dựa vào bất kỳ con số cụ thể nào; tự áp rate limit riêng phía server (mục 8 bên dưới) độc lập với quota thật của Zalo. |
| GROUP chat (Beta?) | Không hỗ trợ trong phase này | Chủ động loại trừ theo đúng phạm vi nhiệm vụ (mục 30), không phụ thuộc trạng thái Beta thật. |

**Hành động đề nghị cho owner:** khi có quyền truy cập `docs.zaloplatforms.com` (ngoài môi
trường sandbox này), đối chiếu lại đúng 3 mục "Thấp"/"chưa xác minh" ở trên. Nếu khác, chỉ
cần sửa `extractIncomingMessage` (parse event) và/hoặc `ZALO_MESSAGE_SAFETY_LIMIT` — các
phần còn lại của kiến trúc (dedupe, session, rate limit, shared chat core) không phụ thuộc
vào chi tiết này.

## 6. Bảo mật

- **Webhook secret:** so sánh bằng `crypto.timingSafeEqual` (chống timing attack), fail-closed
  503 nếu `ZALO_BOT_WEBHOOK_SECRET` chưa cấu hình, 403 nếu thiếu/sai.
- **Token:** chỉ đọc từ `process.env.ZALO_BOT_TOKEN`; không log ở bất kỳ đường lỗi nào
  (`lib/zalo-bot-client.js` không bao giờ trả về hay in ra `url` — vốn chứa token trong path).
- **Kill switch:** `ZALO_BOT_ENABLED` được kiểm tra ĐẦU TIÊN, trước cả bước verify secret —
  khi tắt, không một dòng code Firestore/AI/Zalo API nào chạy.
- **Không giả lập browser:** không gọi `/api/chat`, không Turnstile bypass, không request
  signature giả, không public internal token nào trong source.
- **Ranh giới public/private:** `lib/zalo-bot-handler.js` không import bất kỳ module nào của
  `/can-bo`, `lib/staff-*`, hay Gateway. Location resolver dùng đúng
  `lib/published-locations.js` mà website dùng — chỉ dữ liệu `Published_Locations` (công khai,
  đã duyệt); hợp đồng "location lookup intent không phải location evidence" (P0,
  2026-09-06) áp dụng y hệt cho Zalo vì cùng một hàm `runChatCore`.
- **Không hardcode secret.** Toàn bộ token/secret qua biến môi trường.

## 7. Privacy

- Zalo là kênh **PUBLIC**. Bot không có đường nào chạm tới `/can-bo`, staff API, Google
  staff auth, request review, verification workflow, location moderation, dữ liệu chưa
  publish, Google Sheet riêng tư, hay admin functions — vì `lib/zalo-bot-handler.js` chỉ gọi
  `runChatCore` (đúng pipeline public của website) và `lib/published-locations.js`
  (chỉ đọc `Published_Locations`).
- `chat.id` không bao giờ lưu thô: `lib/zalo-session.js#hashChatId` băm HMAC-SHA256 (dùng
  chung `CHAT_LOG_HASH_SALT` đã có) trước khi dùng làm Firestore document ID hoặc rate-limit
  key.
- Session chỉ lưu tối đa 8 lượt gần nhất, TTL mặc định 45 phút — không lưu hội thoại vĩnh
  viễn theo mặc định.
- Telemetry tối thiểu qua `console.log` có cấu trúc (`channel`, `status`, `latency_ms`,
  `used_rag`, `source_count`, `error_class`) — không lưu chat.id thô, IP, hay toàn văn hội
  thoại. Xem mục "Remaining risks" trong báo cáo bàn giao: `provider` (Gemini/DeepSeek) chưa
  lộ ra được ở tầng telemetry Zalo vì `runChatCore`'s `done` event không expose field này ra
  ngoài eval mode (tránh phải sửa event contract dùng chung với website).

## 8. Chống lạm dụng (không dùng Turnstile)

- **Per-chat rate limit:** `ZALO_CHAT_RATE_LIMIT` (mặc định 20/giờ) theo `hashChatId`.
- **Global rate limit:** `ZALO_GLOBAL_RATE_LIMIT` (mặc định 300/giờ) — chặn một người dùng
  hoặc một đợt spam làm cạn quota Gemini/RAG chung cho toàn hệ thống.
- Dùng lại `lib/rate-limit-store.js` (Upstash Redis atomic, đã kiểm chứng cho
  `/api/location-contributions`); fallback bộ nhớ trong khi chưa cấu hình `KV_REST_API_URL`
  (chấp nhận được cho pilot, không chặn deploy).
- **Max message length:** dùng chung `validateChatRequestBody` với website (1000 ký tự +
  chặn prompt injection) — không viết lại luật riêng cho Zalo.
- **Duplicate protection:** xem mục "Idempotency" bên dưới.
- **Malformed event:** `extractIncomingMessage` trả `null` cho mọi payload không parse
  được — ACK 200, không xử lý, không crash.
- **Timeout:** `ZALO_REQUEST_DEADLINE_MS` (mặc định 45s, nhỏ hơn `maxDuration: 60` của
  `api/feedback.js` trong `vercel.json`) giới hạn ngân sách `runChatCore` chạy qua Zalo.

## 9. Idempotency (chống xử lý trùng)

`lib/zalo-session.js#claimMessageOnce(sha256(chat_id:message_id))` dùng
`docRef.create()` của Firestore (atomic — thất bại nếu tài liệu đã tồn tại), TTL mặc định 15
phút. Webhook trả `duplicate: true` ngay khi claim thất bại, KHÔNG bao giờ gọi lại
`runChatCore`/gửi lại tin nhắn cho cùng một `message_id`. Test:
`test/zalo-bot-handler.test.js` (nhóm C — cùng `message_id` gửi hai lần chỉ xử lý một lần;
`message_id` khác nhau dù cùng nội dung text được xử lý độc lập).

## 10. Rollback

```
ZALO_BOT_ENABLED=false
```

Khi tắt: webhook ACK ngay `{ ok: true, disabled: true }`, không chạm Firestore, không gọi
AI, không gửi tin Zalo nào. Website (`/api/chat`) hoàn toàn không phụ thuộc cờ này — không
cần rollback riêng cho chatbot website khi tắt Zalo.

## 11. Local testing

Toàn bộ test Zalo đều mock Zalo API/Firestore/Gemini — không cần Bot Token thật, không gọi
mạng thật trong CI:

```bash
node --test test/zalo-bot-client.test.js     # lib/zalo-bot-client.js (retry/backoff/error contract)
node --test test/zalo-bot-formatter.test.js  # lib/zalo-formatter.js (cắt Unicode-safe, khối địa điểm/nguồn)
node --test test/zalo-bot-session.test.js    # lib/zalo-session.js (session TTL, dedupe atomic)
node --test test/zalo-bot-handler.test.js    # webhook end-to-end (bảo mật, parsing, dedupe, multi-turn, fallback)
npm test                                     # toàn bộ 735 test, gồm cả website hiện có
```

## 12. Troubleshooting

| Triệu chứng | Nguyên nhân khả dĩ |
|---|---|
| Webhook trả 503 | `ZALO_BOT_WEBHOOK_SECRET` chưa cấu hình trên môi trường đang deploy. |
| Webhook trả 403 | Secret trên Zalo Bot Manager không khớp `ZALO_BOT_WEBHOOK_SECRET`, hoặc chưa `setWebhook` lại sau khi đổi secret. |
| Bot không phản hồi gì | `ZALO_BOT_ENABLED` không phải chuỗi `"true"` chính xác. |
| Bot trả lời "Hệ thống tra cứu đang tạm thời bận." | `runChatCore` lỗi (Gemini/DeepSeek/Pinecone) — xem Vercel Function Logs của `api/feedback.js` (nơi thực thi thật). |
| Bot lặp lại trả lời cũ cho follow-up | Session Firestore hết hạn (TTL) hoặc `FIREBASE_*` chưa cấu hình đúng trên môi trường đang chạy. |
| `setWebhook` báo lỗi | Kiểm tra `ZALO_BOT_TOKEN` đúng, secret dài 8-256 ký tự, `PUBLIC_APP_URL` là HTTPS thật. |
