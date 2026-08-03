# Bảo mật dữ liệu địa điểm

- Email người gửi chỉ được dùng ở staging để kiểm tra allowlist; không được có trong `Published_Locations` hoặc API công khai.
- API lọc payload Google Visualization theo allowlist trường công khai, vì vậy cột nội bộ thêm nhầm trong sheet cũng không được trả ra.
- Chuỗi do người dùng nhập bắt đầu bằng `=`, `+`, `-`, `@` được tiền tố `'` trước khi ghi Sheet, chống formula injection. Mã trạng thái và dữ liệu hệ thống không bị đổi.
- MIME được lấy từ `DriveApp.File.getMimeType()`, không tin phần mở rộng; chỉ JPEG, PNG, WebP, HEIC, HEIF và đúng một ảnh được chấp nhận.
- Ảnh staging không công khai. Chỉ ảnh đã duyệt dùng `ANYONE_WITH_LINK`; thu hồi `STOP` sẽ thử đặt lại private/no access.
- Không ghi Form ID, Drive folder ID, email allowlist thật hoặc secret vào mã nguồn. Dùng Script Properties và phân quyền tối thiểu.

Kiểm tra định kỳ `Audit_Log`, membership/ownership của Form, Spreadsheet và thư mục ảnh. Khi nghi lộ ảnh hoặc cấu hình sai, thu hồi quyền Drive trước, sau đó xử lý record published và audit theo quy trình vận hành.
