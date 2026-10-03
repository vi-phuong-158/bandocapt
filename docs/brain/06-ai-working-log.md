# 06 — AI Working Log

## [2026-10-03] Cấu hình Cloudflare Preview và sửa lỗi workerd
- **Agent:** Codex
- **Thay đổi:** owner cấp OAuth và token Queues Edit riêng; tạo Queue/consumer Preview, cấu hình bốn biến branch Preview Vercel và hai Cloudflare secrets, deploy Cron mỗi phút. Sửa compatibility date UTC và redirect manual/3xx reject; thêm mã lỗi cố định không lộ exception. Bổ sung test redirect, privacy và runtime workerd thật qua Miniflare đi kèm Wrangler.
- **File đã sửa:** cloudflare/zalo-queue/{worker.mjs,wrangler.toml}, test/zalo-cloudflare-consumer.test.js, docs/zalo-chat-hardening.md, docs/brain/{01,03,04,06}.
- **Lý do:** triển khai theo yêu cầu owner đã đăng nhập Cloudflare. Smoke thật phát hiện workerd không hỗ trợ redirect:error, khác Node mock; ngày2026-10-03 địa phương còn ở tương lai so với UTC2026-10-02. Không nâng gói hoặc thay cấu hình Production.
- **Kiểm tra:** targeted13/13 PASS, local826 tests817 PASS/9 Redis SKIP và build PASS trong snapshot sạch; hai validator và Wrangler dry-run PASS. Baseline CI823/823 Redis7 và120/120 Playwright PASS; CI cho commit runtime mới cần xem PR94. Token scoped verify/publish PASS; Preview thiếu chữ ký403, ký đúng job không có state200 ignored; Cloudflare consumer và Cron outcome ok, CPU1–2ms. Metadata Queue/Worker/deployment và hướng dẫn callback immutable ghi trong docs/zalo-chat-hardening.md. Không gọi AI/gửi Zalo trong smoke, batching OFF; token bot Preview dùng chung Production nên Zalo thật/Production chưa nghiệm thu. OAuth đọc subscriptions bị403, không suy diễn plan từ usage_model=standard; không thay billing.

## [2026-10-03] Chuyển Zalo queue sang Cloudflare Free
- **Agent:** Codex
- **Thay đổi:** bỏ SDK/module/schedule QStash; Cloudflare REST publisher, HMAC raw-body callbacks, consumer Worker metadata-only, Cron sweep mỗi phút. Queue/consumer tách Preview/Production, batchsize1/transport retry3, tôn trọng Retry-After, từ chối HTML/protection200 giả. Wrangler devDependency4.147.0 và dry-run CI; config/Free quotas/drain/acceptance cập nhật.
- **File đã sửa:** api/chat.js, lib/zalo-{queue,batch-store}.js, lib/zalo-qstash.js (xóa), cloudflare/zalo-queue/{worker.mjs,wrangler.toml}, scripts/register-zalo-bot-worker.js (xóa), package{,-lock}.json, .gitignore, .github/workflows/ci.yml, test/{zalo-batching,zalo-batch-handler,zalo-cloudflare-consumer}.test.js, docs/zalo-chat-hardening.md, docs/brain/{01,03,04,05,06}.
- **Lý do:** owner yêu cầu thay Cloudflare và không thêm phí hạ tầng; giữ webhook/RAG/Redis và3s/max8s batching/deadline/fencing/retention. Free có hạn mức, không tự nâng gói.
- **Kiểm tra:** 823 local tests:814 PASS/9 Redis SKIP; build, Wrangler dry-run và hai validator PASS. Production audit high PASS (còn3 moderate cũ); Node/WebCrypto HMAC tương thích, deny/tamper/timestamp/destination/schema, consumer retry/cron/privacy PASS. Test/build dùng snapshot temp sạch vì dist checkout Windows EPERM; CI chạy Redis7 và Playwright qua PR94. Máy chưa authenticated Cloudflare (`wrangler whoami`), chưa deploy consumer/config credentials/enable batching hoặc nghiệm thu Zalo thật; Production không thay đổi.

## [2026-10-02] Zalo hardening — đợt 3 Redis/QStash batching
- **Agent:** Codex
- **Thay đổi:** buffer nguyên tử 3s/max8s, dedupe ID24h, quota batch/ngày Việt Nam, spam gate30/phút; session3 cặp/5phút; lease65s/fencing/retry/sweep; response/chunk persistence; delivery unknown không resend; worker ký QStash dùng chung function chat. Batching mặc định OFF. Thêm cấu hình Preview protection và lịch sweep; archive tài liệu lịch sử, sửa provider/runtime và cập nhật Code Graph.
- **File đã sửa:** api/chat.js, lib/zalo-{bot,batch-store,batch-worker,qstash}.js, scripts/register-zalo-bot-{webhook,worker}.js, package{,-lock}.json, vercel.json, .github/workflows/ci.yml, test/{zalo-batching,zalo-batch-handler,zalo-bot,vercel-preview-budget}.test.js, test/helpers/zalo-redis.js, docs/zalo-chat-hardening.md, docs/brain/{00,01,02,03,04,05,06,archive/*}.
- **Lý do:** gom câu hỏi nhiều mảnh bền vững và giữ thứ tự/ngữ cảnh, bảo vệ nội dung, tránh quota/reply trùng theo kế hoạch. Cập nhật hai dependency gián tiếp mức high để CI audit thông qua.
- **Kiểm tra:** 814/814 npm test PASS, npm run build PASS trong bản sao source sạch; golden SSE và budget12 function PASS; validate:tthc-legal-refresh và validate:qd1523-mapping PASS. Local dùng Lua runtime tạm với transport Redis mô phỏng, không phải Redis service thật; CI chạy Redis7. Audit --omit=dev --audit-level=high PASS sau bản vá, còn3 moderate đã ghi nhận. Preview có Redis/Zalo nhưng thiếu ba QStash keys; chưa đăng ký schedule, bật batching hay nghiệm thu Zalo/Production. Ba đợt dùng PR xếp nối, không tự merge/promote.

## [2026-10-02] Zalo hardening — đợt 2 reply flow
- **Agent:** Codex
- **Thay đổi:** mixed intent vào shared RAG; giữ thủ tục trong location clarification; resolver nhận sanitized history; absolute deadline và timeout gửi theo thời gian còn lại.
- **File đã sửa:** api/chat.js, lib/chat-intent.js, lib/zalo-bot-v1.js, test/zalo-chat-flow.test.js, docs/brain/{01,03,06}.
- **Lý do:** trả lời đủ yêu cầu và chừa thời gian gửi trên function 60s.
- **Kiểm tra:** 61 targeted tests PASS, gồm mixed intent, clarification/topic change, deadline, PR #91 và golden SSE. Chưa nghiệm thu production.

## [2026-10-02] Vá dependency gián tiếp để nghiệm thu CI
- **Agent:** Codex
- **Thay đổi:** lockfile dùng @grpc/grpc-js 1.14.5 và brace-expansion 2.1.7.
- **File đã sửa:** package-lock.json, docs/brain/06-ai-working-log.md.
- **Lý do:** CI hai PR đầu bị chặn bởi hai cảnh báo high có sẵn trên main; bản vá giữ nguyên interface.
- **Kiểm tra:** bản triển khai đầy đủ dùng cùng hai bản vá đã PASS814 tests/build; npm audit --omit=dev --audit-level=high PASS, còn3 moderate. CI chạy lại theo từng nhánh.

## [2026-10-02] Zalo hardening — đợt 1 validation và privacy
- **Agent:** Codex
- **Thay đổi:** validation nội dung chung; channel policy khóa diagnostic/log content Zalo; allowlist metrics; redaction console theo async context; không gửi claims Zalo vào Telegram.
- **File đã sửa:** api/chat.js, lib/chat-validation.js, test/chat-channel-privacy.test.js, test/chat-zalo-bot-channel.test.js, docs/brain/{01,03,04,06}.
- **Lý do:** đóng hai lỗi P1 theo review và kế hoạch đã được yêu cầu triển khai.
- **Kiểm tra:** 43 targeted tests PASS, gồm handler diagnostic-on, injection/oversize và golden SSE. Test runner cần quyền chạy subprocess; không gọi API production.

## Lịch sử

Xem [archive/06-ai-working-log-before-2026-10-02.md](archive/06-ai-working-log-before-2026-10-02.md).
