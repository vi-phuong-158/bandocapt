# Hệ thống tiếp nhận cập nhật địa điểm

Hệ thống nhận yêu cầu qua Google Form, kiểm tra và lưu vào `Location_Staging`, sau đó chỉ công bố bản ghi đã duyệt tại `Published_Locations`. Một đơn vị có thể có nhiều `record_id`; mọi cập nhật, báo sai và ngừng hoạt động đều nhắm đúng `target_record_id`, không ghi đè theo `unit_code`.

Thành phần chính:

- `setup/apps-script.js`: nguồn logic nghiệp vụ duy nhất, có unit test Node.
- `setup/location-intake/Code.gs`: runtime Apps Script mỏng được ghép cùng logic qua `npm run build:location-intake`.
- `api/google-sheet.js`: chỉ trả allowlist trường công khai từ sheet published.
- `scripts/migrate-published-locations.js`: migration JSON an toàn, mặc định dry-run.

Xem [thiết lập](SETUP.md), [vận hành](OPERATIONS.md), [migration](MIGRATION.md) và [bảo mật](SECURITY.md) trước khi dùng dữ liệu thật.

## Staff Location Portal — kế hoạch, chưa triển khai

Lớp nhập liệu Google Form dự kiến được thay bằng Staff Location Portal tại `/can-bo` (đăng nhập
Google, cán bộ xem đúng dữ liệu đơn vị mình, xác nhận hoặc đề nghị chỉnh sửa). Luồng duyệt giữ
nguyên: `Location_Staging → Admin approval → Published_Locations`.

- [`STAFF_PORTAL_PLAN.md`](STAFF_PORTAL_PLAN.md) — kiến trúc, auth, session, phân quyền đa đơn vị,
  semantics confirm/update/stop/ảnh, gateway riêng tư.
- [`STAFF_PORTAL_TEST_MATRIX.md`](STAFF_PORTAL_TEST_MATRIX.md) — 86 ca kiểm thử, threat model, 17 invariant.

**Chưa có code Portal.** Điều kiện chặn: toàn bộ operational sheets (`Unit_Allowlist`,
`Location_Staging`, `Approval_Audit_Log`, `Staff_Verification_Audit`, `Intake_Setup_Info` và Form
Responses) phải ở private workbook trước khi điền email cán bộ thật.
