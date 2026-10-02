# 04 — Current Tasks

## Trạng thái hiện hành — Zalo chat hardening (2026-10-03)

- **Nguồn:** main 9c2554c (PR #91), nhánh triển khai codex/zalo-chat-hardening; 3 đợt source/PR theo thứ tự validation/privacy → reply flow → batching.
- **Source:** đã có validation chung, privacy theo kênh, mixed intent, deadline; Redis/Cloudflare Queues, dedupe, quota theo batch, gom 3s/max8s, phiên 5 phút, worker có fencing và resume chunk.
- **Ràng buộc mới:** chỉ trả phí API AI; Cloudflare Workers/Queues Free, Redis/Vercel trong hạn mức Free. Không tự nâng gói.
- **Cấu hình mặc định:** batching OFF. Production chưa bật. Worker vẫn drain công việc đã nhận khi tắt ingress batching.
- **Nghiệm thu:** Cloudflare local823 tests,814 PASS/9 Redis integration SKIP (không có Redis local); build, hai validator và Wrangler dry-run PASS. CI dùng Redis7 thật và test trình duyệt; xem checks PR94 cho bằng chứng hiện hành. Source snapshot sạch do dist Windows bị khóa quyền xóa. Preview/Zalo acceptance còn chờ account/login/config Cloudflare.
- **Còn cần trước bật tính năng:** cấu hình Redis/Cloudflare Queues theo environment; deploy consumer/Cron sweep mỗi phút; Cloudflare/Zalo truy cập được Preview; owner nghiệm thu bằng tài khoản Zalo thật. Không ghi nhận production acceptance khi chưa có bằng chứng.

## Backlog vận hành

- Rà soát địa điểm có verified_at hàng tháng; đối chiếu nguồn công khai và đưa thay đổi qua người duyệt hiện có.
- Rà soát nguồn pháp lý theo quy trình source/governance/approval hiện có; không tự thay corpus trong task này.
- Đo mở chỉ đường/gọi điện trong hành trình người dân: backlog thiết kế đo lường; không thêm endpoint analytics trong ba đợt hiện tại.
- Các task cũ vẫn giữ nguyên quyết định và hạn chế trong archive; archive không có nghĩa là tự đóng hay nghiệm thu các PR đang chờ người dùng.

## Lịch sử

Xem [archive/04-current-tasks-before-2026-10-02.md](archive/04-current-tasks-before-2026-10-02.md). Các trạng thái phát hành trong đó là bằng chứng tại thời điểm ghi, không thay thế trạng thái hiện hành bên trên.
