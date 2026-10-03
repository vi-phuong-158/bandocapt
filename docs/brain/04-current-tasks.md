# 04 — Current Tasks

## Trạng thái hiện hành — Zalo chat hardening (2026-10-03)

- **Nguồn:** main đã gồm toàn bộ Zalo hardening qua PR #94, merge 25e1ad6, tree trùng bản ff72e7e đã nghiệm thu.
- **Source:** đã có validation chung, privacy theo kênh, mixed intent, deadline; Redis/Cloudflare Queues, dedupe, quota theo batch, gom 3s/max8s, phiên 5 phút, worker có fencing và resume chunk.
- **Ràng buộc mới:** chỉ trả phí API AI; Cloudflare Workers/Queues Free, Redis/Vercel trong hạn mức Free. Không tự nâng gói.
- **Cấu hình:** mặc định source batching OFF; Production đã được owner cho phép bật ON và triển khai trực tiếp. Queue/consumer/cron và HMAC callback Production đã cấu hình, namespace Redis tách Production. Worker vẫn drain công việc đã nhận khi tắt ingress batching.
- **Nghiệm thu:** exact source ff72e7e đạt CI826/826 với Redis7 thật và120/120 Playwright. Production callback/Queue/cron đã xác minh; owner xác nhận test Zalo nhiều tin thành công, runtime ghi nhận done/fragment_count=2 cho RAG và địa điểm. Website/embed200, unsigned webhook/worker403.
- **Bản vá audit:** CI main25e1ad6 đạt826 tests/build nhưng bị chặn bởi hai cảnh báo high của @fastify/busboy3.2.0. Owner đã duyệt bản vá3.2.1; xem checks PR bản vá cho full CI Redis/worker dry-run/Playwright. Ba cảnh báo moderate cũ còn lại; không nới audit gate. Redis dùng chung dung lượng/credentials test/Preview để giữ Free, namespace Production riêng; Preview callback immutable vẫn cần đối chiếu khi đổi deployment.

## Backlog vận hành

- Rà soát địa điểm có verified_at hàng tháng; đối chiếu nguồn công khai và đưa thay đổi qua người duyệt hiện có.
- Rà soát nguồn pháp lý theo quy trình source/governance/approval hiện có; không tự thay corpus trong task này.
- Đo mở chỉ đường/gọi điện trong hành trình người dân: backlog thiết kế đo lường; không thêm endpoint analytics trong ba đợt hiện tại.
- Các task cũ vẫn giữ nguyên quyết định và hạn chế trong archive; archive không có nghĩa là tự đóng hay nghiệm thu các PR đang chờ người dùng.

## Lịch sử

Xem [archive/04-current-tasks-before-2026-10-02.md](archive/04-current-tasks-before-2026-10-02.md). Các trạng thái phát hành trong đó là bằng chứng tại thời điểm ghi, không thay thế trạng thái hiện hành bên trên.
