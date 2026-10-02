# 06 — AI Working Log

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
