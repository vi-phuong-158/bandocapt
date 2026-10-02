# Zalo chat hardening — Cloudflare Queues Free và nghiệm thu

## Cấu hình

Từ 2026-10-03, Cloudflare Queues thay QStash theo yêu cầu owner. Batching mặc định OFF. Validation/privacy/mixed intent/deadline hoạt động cả khi OFF; khi ON, webhook chuyển sang Redis/Cloudflare Queues. Worker vẫn xử lý hết công việc đã nhận khi OFF.

### Biến server-only trên Vercel

| Biến | Yêu cầu |
| --- | --- |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Redis REST read/write riêng theo môi trường |
| `CHAT_LOG_HASH_SALT` | Salt HMAC; không đổi khi còn công việc/phiên đang xử lý |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID32 ký tự hex |
| `CLOUDFLARE_ZALO_QUEUE_ID` | Queue ID32 ký tự hex; Queue riêng cho môi trường/deployment |
| `CLOUDFLARE_ZALO_QUEUE_TOKEN` | API token có quyền Queues Write trên account cần dùng; không dùng Global API key |
| `ZALO_BOT_WORKER_SECRET` | Secret ngẫu nhiên ít nhất32 ký tự, giống secret trên consumer tương ứng |
| `ZALO_BOT_WORKER_URL` | HTTPS URL `/api/zalo-bot/worker`, không query/credential; Production dùng URL ổn định |
| `ZALO_BOT_BATCHING_ENABLED` | `on`/`true` mới bật, còn lại OFF |
| `ZALO_BOT_TOKEN`, `ZALO_BOT_WEBHOOK_SECRET` | Giữ transport/xác thực Zalo hiện có |
| `CHAT_DAILY_IP_LIMIT` | Quota Zalo batch/ngày, mặc định50; website không đổi |

Preview worker tự lấy URL deployment từ `VERCEL_URL`; consumer Cloudflare phải trỏ **đúng URL immutable này**. Namespace Redis Preview vẫn riêng theo deployment. Production dùng URL cấu hình ổn định. Queue/consumer Preview và Production độc lập; không dùng credential hoặc queue chung để nghiệm thu.

### Cấu hình Cloudflare consumer

File `cloudflare/zalo-queue/wrangler.toml` có hai environment `preview`/`production`, queue mỗi environment và Cron Trigger mỗi phút. Wrangler là devDependency; không nằm trong runtime Vercel. Chọn Workers Free, không nâng gói trả phí.

- `ZALO_BOT_WORKER_URL`: URL callback cố định trong `[env.preview.vars]` hoặc `[env.production.vars]`, phải giống URL worker dự kiến trên Vercel.
- `ZALO_BOT_WORKER_SECRET`: đặt bằng Wrangler secrets hoặc dashboard, không ghi vào toml/source.
- `VERCEL_AUTOMATION_BYPASS_SECRET`: secret chỉ cần khi callback Preview có deployment protection; đặt trên Cloudflare qua secrets/dashboard. Chỉ gửi bằng header, không vào queue body hoặc logs.
- Consumer chỉ nhận metadata `{chatHash,batchId}`; không có conversation/AI/Zalo token/Redis credential trên Cloudflare.
- Callback HMAC-SHA256 ký `timestamp + "\n" + callbackURL + "\n" + rawBody`, cửa sổ60s. Header `x-zalo-worker-timestamp`, `x-zalo-worker-signature`; `text/plain` giữ nguyên raw body trên Vercel. Redis claim/done kiểm soát replay.

Không commit `.env*`, `.dev.vars*`, token hoặc output chứa secret. Observability capture của Worker tắt; ứng dụng chỉ log trạng thái cố định. Queue body có thể được xem trong Cloudflare dashboard nhưng chỉ gồm hai khóa metadata.

## Hạn mức miễn phí

Theo [Cloudflare Queues pricing](https://developers.cloudflare.com/queues/platform/pricing/), Free có10.000 operations/ngày, retention24h; job nhỏ thường3 operations (write/read/delete), retry thêm read. **Không tương đương10.000 câu hỏi**: mỗi mảnh publish job, deferred/retry/sweep phục hồi có thể tăng số operations. Hạn mức dùng chung toàn account, gồm Preview và Production.

[Workers Free](https://developers.cloudflare.com/workers/platform/pricing/) có100.000 requests/ngày và CPU10ms/invocation. Consumer batchsize1 để giảm CPU, chỉ HMAC/fetch metadata; thời gian chờ network không phải CPU. Phải đo CPU thật trên Preview, không tự nâng plan nếu vượt giới hạn. Sweep đi thẳng Cron -> Vercel, khoảng1.440 callback/ngày/môi trường, không đưa các tick vào Queue; sweep chỉ publish khi có việc đến hạn.

Redis/Vercel vẫn phải trong hạn mức Free hiện có. Khi quota/hạ tầng lỗi, trả503 và phục hồi từ outbox trong10phút; không cam kết miễn phí vô hạn hoặc phục hồi sau khi dữ liệu đã hết hạn. Chưa có tài khoản/config thì chưa deploy consumer hoặc bật batching.

## Thiết lập Preview

1. Giữ Vercel batching OFF, deploy nhánh PR và ghi URL immutable của deployment. Dùng bot test riêng khi nghiệm thu Zalo; không đổi webhook bot Production.
2. Đăng nhập Cloudflare Workers Free từ máy vận hành bằng `npx wrangler login`. Chỉ bước owner đăng nhập có tương tác; không gửi credential vào chat.
3. Tạo Queue riêng: `npx wrangler queues create bandocapt-zalo-preview`. Lấy Queue ID từ dashboard/kết quả lệnh. Queue Production chỉ tạo sau nghiệm thu Preview. Nếu tạo nhiều Preview hoạt động cùng lúc, mỗi deployment có Queue/Worker riêng và tên riêng trong bản config vận hành.
4. Sửa callback Preview trong toml thành `https://<immutable-deployment-host>/api/zalo-bot/worker`; đối chiếu tên queue với Queue vừa tạo. Account ID có thể đặt qua `CLOUDFLARE_ACCOUNT_ID` trên máy deploy.
5. Tạo secret ngẫu nhiên và lưu giống nhau trên Vercel Preview và Cloudflare Preview. Ví dụ đặt Cloudflare secret bằng `npx wrangler secret put ZALO_BOT_WORKER_SECRET --config cloudflare/zalo-queue/wrangler.toml --env preview`; nhập qua prompt. Đặt bypass secret tương tự bằng `wrangler secret put VERCEL_AUTOMATION_BYPASS_SECRET` cho Preview được bảo vệ.
6. Tạo API token scoped Queues Write, đặt token/Account ID/Queue ID và worker secret trên Vercel Preview. Không đưa token deploy Wrangler vào ứng dụng. SDK QStash và QSTASH_* không còn được dùng.
7. Kiểm tra artifact `npm run zalo:queue:check`, rồi `npm run zalo:queue:deploy:preview`. Cấu hình này deploy consumer và Cron mỗi phút; không tạo schedule qua QStash. Không deploy environment mặc định không có consumer.
8. Kiểm tra callback ký đúng, callback sai/thiếu chữ ký bị403, sweep chạy được và quota/CPU trên dashboard. Chỉ sau đó bật batching Preview và chạy ma trận bên dưới. Ghi URL/SHA/QueueID (metadata), kết quả từng ca; không ghi secrets.

### Preview mới và rollback

Callback consumer cố định cho một deployment, không route tùy ý theo queue body. Khi thay Preview deployment: đặt ingress cũ OFF, giữ consumer/URL/credential/sweep cũ tới khi Redis pending/active drain hết rồi mới đổi callback và Queue ID; hoặc tạo Queue/consumer riêng cho deployment mới. **Không trỏ consumer cũ vào namespace deployment mới khi còn công việc.** Vercel tạo Preview mới sau thay config/commit: đối chiếu URL cuối cùng trên consumer trước bật flag. Khi deploy lại config, commit không được chứa secret; nếu đã bật batch, làm quy trình drain này trước.

Production chỉ cấu hình/deploy `npm run zalo:queue:deploy:production` sau nghiệm thu. OFF vẫn drain worker đã nhận. Rollback code provider phải drain Cloudflare jobs trước đổi transport/secret; QStash chưa từng cấu hình/bật ở đợt trước nên hiện không có việc QStash cần di chuyển.

## Hành vi và lưu trữ

- Mỗi tin hợp lệ cập nhật cửa sổ chờ 3 giây, tối đa 8 giây từ tin đầu. Redis cấp sequence nguyên tử; câu ghép giữ thứ tự nhận được, nối bằng xuống dòng. Thời điểm đủ điều kiện không đảm bảo thời điểm phản hồi nếu queue đang tải cao.
- Dedupe message ID băm, TTL 24 giờ. Thiếu ID vẫn xử lý và ghi `dedupe_unavailable`; không dùng text làm ID. Giới hạn spam 30 tin/phút theo cửa sổ phút cố định.
- Một batch chỉ reservation quota ngày một lần, nguyên tử với claim, theo giờ Việt Nam. Các batch vượt quota nhận câu hướng dẫn tĩnh, không chạy AI.
- Redis private: `chat` chứa routing chat ID và pending/active content (TTL 10 phút), `session` giữ tối đa 6 history items qua sanitizer (user 1.000/model 500 ký tự), TTL 5 phút không hoạt động; xóa content batch sau hoàn tất. `dedupe`, `done` chỉ metadata, TTL 24 giờ; `minute`/`daily` chỉ counters có TTL.
- `due` là sorted index chỉ chứa chat hash; sweep loại entry đã mất state và phát metadata expired. Không có nội dung trong Cloudflare Queue job, response worker hoặc diagnostic logs.
- Claim có owner token + lease 65 giây. Tin đến sau claim vào batch tiếp theo; mỗi principal PRIVATE chỉ một batch active. Batch tối đa 4 processing attempts, giữ phản hồi và chỉ số chunk đã xác nhận; retry 10/20/40 giây. Sweep mỗi phút phục hồi publish failure/lease hết hạn, công việc quá 10 phút bỏ bằng status expired.
- Worker có deadline 55 giây; RAG đến giây 40, gửi từng chunk tối đa 8 giây trong phần thời gian còn lại. HTTP 429 của sendMessage retry từ chunk chưa xác nhận; lỗi network/5xx/JSON không xác nhận hoặc worker chết khi đang gửi -> `delivery_unknown`, không tự gửi lại. Không cam kết exactly-once delivery.
- Khi lỗi lưu/giao việc, webhook trả 503. Bộ đệm đã ghi vẫn nằm trong outbox để sweep phục hồi; không giả định Zalo chắc chắn retry.
- Nội dung không hợp lệ lưu câu hướng dẫn an toàn thay vì input bị chặn. Toàn bộ câu ghép được validate lại; quá 1.000 ký tự yêu cầu rút gọn, không cắt âm thầm.

## Kiểm thử local và CI

```sh
npm test
npm run build
npm run validate:tthc-legal-refresh
npm run validate:qd1523-mapping
```

CI chạy Redis 7 trên localhost và đặt `ZALO_TEST_REDIS_PORT=6379`; test adapter chỉ đổi transport REST -> RESP, chạy đúng Lua production. Không đặt biến này trỏ dịch vụ production. Khi không có Redis local, suite tích hợp Redis được báo SKIP; unit tests validation, intent, chữ ký, privacy và golden SSE vẫn chạy.

Windows checkout có thể bị khóa quyền xóa `dist`; chạy bộ kiểm thử/build trong bản sao source sạch khi gặp EPERM, ghi rõ nơi và loại runtime Redis đã dùng. Test Lua local không thay thế bằng chứng CI Redis thật hoặc nghiệm thu Zalo thật.

## Ma trận nghiệm thu Preview

| Ca | Kết quả cần đạt |
| --- | --- |
| Ba tin: quốc tịch → địa bàn → câu hỏi tạm trú | Một câu hỏi đầy đủ, một reservation, một phản hồi đúng đối tượng |
| Tin bổ sung sau 10–20 giây | Dùng ngữ cảnh phiên, không coi quốc tịch/địa bàn là câu độc lập thiếu ý |
| Qua 5 phút không hoạt động / đổi chủ đề | Không dùng phiên hết hạn hoặc ép vào location follow-up cũ |
| Hai người gửi đồng thời | Không lẫn câu hỏi, lịch sử hoặc nơi gửi |
| Webhook/job trùng; tin đến sau claim | Không nhân quota/reply; mảnh sau không mất |
| Câu vừa hỏi hồ sơ vừa hỏi trụ sở | Trả đủ hai phần, địa điểm từ nguồn đã xác minh |
| Injection / câu ghép quá dài | Không gọi AI, có câu hướng dẫn |
| Diagnostic website bật | Không có question/answer/raw IDs/tokens trong log/storage Zalo |
| Worker bị ngắt trước gửi / publish lỗi | Retry/sweep phục hồi; chưa gửi không bị đánh dấu thành công |
| Tin gửi mất xác nhận / chunk 1 thành công, chunk 2 bị 429 | Unknown không gửi lại; 429 resume không gửi lại chunk 1/gọi lại AI |
| Tắt batching giữa lượt | Ingress trở về legacy đã harden, việc cũ tiếp tục drain |

## Phát hành và vận hành

- Thứ tự PR: validation/privacy -> reply flow -> batching (PR94 đã đổi Cloudflare theo quyết định2026-10-03). Hai PR sau dựa trên nhánh đợt trước để review diff riêng; retarget main sau khi đợt trước merge.
- Ghi URL, SHA, cấu hình environment và bằng chứng từng ca Preview; không tuyên bố acceptance khi chưa có tài khoản Zalo thật.
- Sau Preview PASS mới cấu hình Redis/Cloudflare Queues Production, deploy consumer/Cron Production và bật cờ. Khởi đầu theo dõi mỗi ngày: số batch, fragment_count, duration_ms, retry/busy, expired, delivery_unknown/failed và sweep failure.
- Rollback: đặt cờ OFF, giữ code worker/schedule/Redis tới khi hết pending/active. Không xóa credential hoặc đổi salt khi đang drain; chưa merge hoặc promote tự động.
- Rà soát địa điểm có verified_at hằng tháng qua nguồn công khai/người duyệt hiện có. Rà soát pháp lý theo governance/approval hiện có. Đo mở chỉ đường/gọi điện giữ trong backlog, không thêm endpoint analytics.
