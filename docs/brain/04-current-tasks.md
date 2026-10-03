# 04 — Current Tasks

## Trạng thái hiện hành — Zalo chat hardening (2026-10-03)

- **Nguồn:** main 9c2554c (PR #91), nhánh triển khai codex/zalo-chat-hardening; 3 đợt source/PR theo thứ tự validation/privacy → reply flow → batching.
- **Source:** đã có validation chung, privacy theo kênh, mixed intent, deadline; Redis/Cloudflare Queues, dedupe, quota theo batch, gom 3s/max8s, phiên 5 phút, worker có fencing và resume chunk.
- **Ràng buộc mới:** chỉ trả phí API AI; Cloudflare Workers/Queues Free, Redis/Vercel trong hạn mức Free. Không tự nâng gói.
- **Cấu hình mặc định:** batching OFF. Production chưa bật. Worker vẫn drain công việc đã nhận khi tắt ingress batching.
- **Nghiệm thu:** baseline CI823/823 tests với Redis7 thật và120/120 Playwright PASS. Preview đã có Queue, token scoped, HMAC secret và bypass; consumer/Cron smoke PASS, CPU1–2ms cho job metadata, thiếu chữ ký403/đúng chữ ký batch không tồn tại200 ignored. Đã sửa redirect incompatibility và thêm3 test, targeted13/13 PASS; local826 tests817 PASS/9 Redis SKIP, build/hai validator/Wrangler dry-run PASS; xem checks PR94 cho bằng chứng CI hiện hành. Build dùng source snapshot sạch do dist Windows bị khóa quyền xóa.
- **Còn cần trước bật tính năng:** đối chiếu callback immutable sau mỗi Preview mới; bot test riêng và owner nghiệm thu Zalo thật. Preview đang có Zalo credentials dùng chung Production, chưa đổi webhook hoặc bật batching. Production Redis/Queue chưa cấu hình; không ghi nhận production acceptance khi chưa có bằng chứng.

## Backlog vận hành

- Rà soát địa điểm có verified_at hàng tháng; đối chiếu nguồn công khai và đưa thay đổi qua người duyệt hiện có.
- Rà soát nguồn pháp lý theo quy trình source/governance/approval hiện có; không tự thay corpus trong task này.
- Đo mở chỉ đường/gọi điện trong hành trình người dân: backlog thiết kế đo lường; không thêm endpoint analytics trong ba đợt hiện tại.
- Các task cũ vẫn giữ nguyên quyết định và hạn chế trong archive; archive không có nghĩa là tự đóng hay nghiệm thu các PR đang chờ người dùng.

## Lịch sử

Xem [archive/04-current-tasks-before-2026-10-02.md](archive/04-current-tasks-before-2026-10-02.md). Các trạng thái phát hành trong đó là bằng chứng tại thời điểm ghi, không thay thế trạng thái hiện hành bên trên.
