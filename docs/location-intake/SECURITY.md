# Bảo mật dữ liệu địa điểm

- Email người gửi chỉ được dùng ở staging để kiểm tra allowlist; không được có trong `Published_Locations` hoặc API công khai.
- API lọc payload Google Visualization theo allowlist trường công khai, vì vậy cột nội bộ thêm nhầm trong sheet cũng không được trả ra.
- Chuỗi do người dùng nhập bắt đầu bằng `=`, `+`, `-`, `@` được tiền tố `'` trước khi ghi Sheet, chống formula injection. Mã trạng thái và dữ liệu hệ thống không bị đổi.
- MIME được lấy từ `DriveApp.File.getMimeType()`, không tin phần mở rộng; chỉ JPEG, PNG, WebP, HEIC, HEIF và đúng một ảnh được chấp nhận.
- Ảnh staging không công khai. Chỉ ảnh đã duyệt dùng `ANYONE_WITH_LINK`; thu hồi `STOP` sẽ thử đặt lại private/no access.
- Không ghi Form ID, Drive folder ID, email allowlist thật hoặc secret vào mã nguồn. Dùng Script Properties và phân quyền tối thiểu.
- `record_id` **không phải bí mật** — nó nằm trong payload công khai của `/api/google-sheet`. Vì vậy biết
  `record_id` không tạo ra quyền sửa: mọi yêu cầu trỏ tới một bản ghi đã publish đều phải có
  `unit_code` của bản ghi đó khớp đơn vị mà `Unit_Allowlist` đã authorize cho email người gửi, nếu không
  bị chặn bằng `TARGET_RECORD_UNIT_MISMATCH`. Kiểm tra chạy ở hai nơi: `buildStagingRecord` (khâu nhận,
  gồm cả yêu cầu `create` có mang sẵn `target_record_id`) và `applyApproval` (ngay trước khi ghi/xoá
  `Published_Locations`, phòng trường hợp ô `validation_errors` bị xoá tay trong Sheet). Bản ghi published
  thiếu `unit_code` không chứng minh được chủ sở hữu nên không ai sửa được cho tới khi quản trị viên bổ sung.

- **Còn mở:** `Unit_Allowlist` (email cán bộ) nằm cùng bảng tính với `Published_Locations`, mà bảng tính
  đó phải cho "ai có liên kết đều xem" để endpoint GViz không xác thực trong `lib/published-locations.js`
  đọc được. `GOOGLE_SHEET_ID` là biến môi trường, không phải kiểm soát truy cập. Phải tách
  `Unit_Allowlist` sang bảng tính riêng không chia sẻ công khai trước khi điền email cán bộ thật và
  trước khi triển khai Staff Location Portal. Xem cảnh báo trong `SETUP.md`.

Kiểm tra định kỳ `Approval_Audit_Log`, membership/ownership của Form, Spreadsheet và thư mục ảnh. Khi nghi lộ ảnh hoặc cấu hình sai, thu hồi quyền Drive trước, sau đó xử lý record published và audit theo quy trình vận hành.
