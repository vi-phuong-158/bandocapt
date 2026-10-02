# Zalo chat hardening — cấu hình và nghiệm thu

## Cấu hình

Batching mặc định OFF. Bản sửa validation/privacy/mixed intent/deadline hoạt động cả khi OFF; khi ON, webhook chuyển sang Redis/QStash. Worker vẫn xử lý hết công việc đã nhận khi OFF.

| Biến server-only | Yêu cầu |
| --- | --- |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Redis REST read/write, cấu hình riêng theo môi trường |
| `CHAT_LOG_HASH_SALT` | Salt HMAC không rỗng; không đổi trong khi còn công việc/phiên đang xử lý |
| `QSTASH_TOKEN` | Publish và quản lý lịch sweep |
| `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` | SDK xác thực JWT; hỗ trợ chuyển signing key |
| `ZALO_BOT_WORKER_URL` | HTTPS URL `/api/zalo-bot/worker`, không query/credential; dùng cho local đăng ký lịch và Production |
| `ZALO_BOT_BATCHING_ENABLED` | `on`/`true` mới bật; còn lại OFF |
| `ZALO_BOT_TOKEN`, `ZALO_BOT_WEBHOOK_SECRET` | Giữ xác thực và transport Bot Platform hiện có |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | System env khi Automation Bypass bật; dùng cho protected Preview, không in/log secret |
| `CHAT_DAILY_IP_LIMIT` | Hạn mức lượt Zalo đã gom/ngày, mặc định 50; không đổi quota website |

Trên Vercel Preview, worker tự lấy URL deployment từ `VERCEL_URL` và namespace riêng theo deployment. Khi đăng ký sweep từ máy local, đặt `VERCEL_ENV=preview`, `VERCEL_URL=<deployment-host>` tương ứng để URL và namespace khớp. Production dùng URL cấu hình cố định và namespace production. Không dùng namespace Preview để nghiệm thu Production.

Không commit `.env*`, token/signing key hoặc output lệnh env pull. Chỉ lưu biến môi trường qua quản trị Vercel. Redis phải chỉ được truy cập bằng credential server; namespace public contribution vẫn chỉ lưu counter như trước.

## Chi phí QStash

Lịch sweep mỗi phút tạo 1.440 deliveries/ngày, khoảng 43.200/30 ngày, chưa tính batch jobs và retries. Gói Free công bố 1.000 deliveries/ngày nên không đủ cho cấu hình này. Usage-based công bố $1/100.000 deliveries: riêng sweep khoảng $0,43/30 ngày, cộng jobs/retry và các phí provider khác nếu có. Kiểm tra [bảng giá hiện hành](https://upstash.com/pricing/qstash) trước khi bật; source/PR và Preview batching OFF không tự tạo tài khoản hay kích hoạt gói trả phí.

## Đăng ký worker

1. Deploy Preview với batching OFF, dùng bot test và credentials riêng cho nghiệm thu.
2. Cấu hình các biến Redis/QStash trên branch Preview. Project hiện bật protection cho Preview; dùng Automation Bypass hiện có. QStash gửi bypass bằng header và cấu hình redaction để secret không xuất hiện trong console/DLQ provider; lịch sweep cũng áp dụng. Script webhook thêm bypass query riêng khi VERCEL_ENV=preview và không in URL/response provider. Dùng bot test riêng khi đăng ký webhook Preview; không tắt protection toàn project.
3. Chạy `npm run zalo:worker:schedule` trong môi trường được inject đủ biến. Script đọc `.env.local` nếu có; không tự tải/in secret. Schedule ID ổn định theo namespace, cron `* * * * *`, body chỉ `{ "type": "sweep" }`. Đăng ký lại cùng ID cập nhật lịch, không tạo lịch trùng.
4. Chỉ bật `ZALO_BOT_BATCHING_ENABLED=on` trên Preview sau khi chữ ký worker và lịch sweep được kiểm tra. Nếu tạo deployment Preview mới, đăng ký lịch đúng URL/namespace mới; giữ lịch cũ tới khi drain xong rồi xóa qua console QStash.

## Hành vi và lưu trữ

- Mỗi tin hợp lệ cập nhật cửa sổ chờ 3 giây, tối đa 8 giây từ tin đầu. Redis cấp sequence nguyên tử; câu ghép giữ thứ tự nhận được, nối bằng xuống dòng. Thời điểm đủ điều kiện không đảm bảo thời điểm phản hồi nếu queue đang tải cao.
- Dedupe message ID băm, TTL 24 giờ. Thiếu ID vẫn xử lý và ghi `dedupe_unavailable`; không dùng text làm ID. Giới hạn spam 30 tin/phút theo cửa sổ phút cố định.
- Một batch chỉ reservation quota ngày một lần, nguyên tử với claim, theo giờ Việt Nam. Các batch vượt quota nhận câu hướng dẫn tĩnh, không chạy AI.
- Redis private: `chat` chứa routing chat ID và pending/active content (TTL 10 phút), `session` giữ tối đa 6 history items qua sanitizer (user 1.000/model 500 ký tự), TTL 5 phút không hoạt động; xóa content batch sau hoàn tất. `dedupe`, `done` chỉ metadata, TTL 24 giờ; `minute`/`daily` chỉ counters có TTL.
- `due` là sorted index chỉ chứa chat hash; sweep loại entry đã mất state và phát metadata expired. Không có nội dung trong QStash job, response worker hoặc diagnostic logs.
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

- Thứ tự PR: validation/privacy -> reply flow -> batching. Hai PR sau dựa trên nhánh đợt trước để review diff riêng; retarget main sau khi đợt trước merge.
- Ghi URL, SHA, cấu hình environment và bằng chứng từng ca Preview; không tuyên bố acceptance khi chưa có tài khoản Zalo thật.
- Sau Preview PASS mới cấu hình Redis/QStash Production, đăng ký sweep Production và bật cờ. Khởi đầu theo dõi mỗi ngày: số batch, fragment_count, duration_ms, retry/busy, expired, delivery_unknown/failed và sweep failure.
- Rollback: đặt cờ OFF, giữ code worker/schedule/Redis tới khi hết pending/active. Không xóa credential hoặc đổi salt khi đang drain; chưa merge hoặc promote tự động.
- Rà soát địa điểm có verified_at hằng tháng qua nguồn công khai/người duyệt hiện có. Rà soát pháp lý theo governance/approval hiện có. Đo mở chỉ đường/gọi điện giữ trong backlog, không thêm endpoint analytics.
