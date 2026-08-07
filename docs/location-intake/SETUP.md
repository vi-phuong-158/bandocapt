# Thiết lập Google Form và Apps Script

## Chuẩn bị bằng tài khoản Google quản trị

1. Tạo một Google Form mẫu và thêm đúng một câu hỏi tải tệp có tiêu đề `Ảnh địa điểm`. Câu hỏi này phải cho phép đúng một tệp.
2. Tạo thư mục Drive riêng để chứa ảnh đã qua kiểm tra; không dùng thư mục cá nhân lẫn với dữ liệu khác.
3. Tạo Google Spreadsheet vận hành và mở Apps Script gắn với spreadsheet đó.
4. Chạy `npm run build:location-intake`, dán nội dung `setup/location-intake/dist/Code.gs` vào Apps Script.
5. Trong **Project Settings → Script properties**, đặt `TEMPLATE_FORM_ID` và `DESTINATION_FOLDER_ID`. Không commit ID thật vào repository.
6. Chạy `setupLocationIntakeSystem`. Lệnh này tạo các sheet `Unit_Allowlist`, `Location_Staging`, `Published_Locations`, `Audit_Log`, `Location_Intake_Info`; sao chép Form mẫu; lưu `LOCATION_FORM_ID`; và cài trigger submit/edit.
7. Cấp quyền theo các hộp thoại OAuth rồi chạy `healthCheckLocationIntake` để kiểm tra Form, trigger, thư mục ảnh và sheet.

Để đẩy code bằng `clasp` thay vì dán tay, xem `docs/location-intake/CLASP.md`.

## Danh sách đơn vị và quyền

Điền đủ 148 đơn vị vào `Unit_Allowlist`: `unit_code`, `unit_name`, `allowed_emails`, `active`. Mỗi email phải khớp với đơn vị người gửi chọn; không để một dòng active không có email. Người vận hành cần quyền chỉnh sửa Form/Spreadsheet, quyền di chuyển và chia sẻ tệp trong thư mục ảnh, và quyền quản lý trigger. Người duyệt cần quyền Spreadsheet/Drive tương ứng; người dùng công khai không cần quyền vào Drive folder.

## Chính sách ảnh công khai

Ảnh chỉ được chuyển sang `ANYONE_WITH_LINK` sau khi duyệt. Nếu Workspace cấm chia sẻ này, duy trì chính sách tổ chức và thay đường dẫn công khai bằng một cơ chế lưu trữ đã được phê duyệt; không nới chính sách miền chỉ để chạy hệ thống. Khi ngừng hoạt động, runtime cố gắng thu hồi sharing của ảnh đã công bố.

## Giới hạn cần biết

Google Forms/Workspace có thể hạn chế upload tệp, thu email ngoài miền, hay `ANYONE_WITH_LINK`. Link Google Maps rút gọn không đảm bảo luôn resolve được; trường hợp đó vào `NEEDS_REVIEW` để quản trị viên nhập tọa độ và xác nhận thủ công.
