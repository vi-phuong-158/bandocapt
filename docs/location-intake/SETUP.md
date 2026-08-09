# Thiết lập Google Form và Apps Script

## Chuẩn bị bằng tài khoản Google quản trị

1. Tạo một Google Form mẫu và thêm đúng một câu hỏi tải tệp có tiêu đề `Ảnh địa điểm`. Câu hỏi này phải cho phép đúng một tệp.
2. Tạo thư mục Drive riêng để chứa ảnh đã qua kiểm tra; không dùng thư mục cá nhân lẫn với dữ liệu khác.
3. Tạo Google Spreadsheet vận hành và mở Apps Script gắn với spreadsheet đó.
4. Chạy `npm run build:location-intake`, dán nội dung `setup/location-intake/dist/Code.gs` vào Apps Script.
5. Trong **Project Settings → Script properties**, đặt `TEMPLATE_FORM_ID` và `DESTINATION_FOLDER_ID`. Không commit ID thật vào repository.
6. Chạy `setupLocationIntakeSystem`. Lệnh này tạo các sheet `Unit_Allowlist`, `Location_Staging`, `Published_Locations`, `Approval_Audit_Log`, `Intake_Setup_Info`; sao chép Form mẫu; lưu `LOCATION_FORM_ID`; và cài trigger submit/edit.
7. Cấp quyền theo các hộp thoại OAuth rồi chạy `healthCheckLocationIntake` để kiểm tra Form, trigger, thư mục ảnh và sheet.
8. **BẮT BUỘC — khôi phục thư mục tải tệp:** Mở Form vừa tạo (link edit trong sheet `Intake_Setup_Info`). Vì Form được **sao chép** từ mẫu có câu hỏi tải tệp, bản sao **mất liên kết thư mục lưu file upload**, và Google **tự tắt nhận phản hồi** kèm hộp thoại *"Thư mục Tải lên tệp bị thiếu"*. Bấm **Phục hồi (Restore)** để Google tạo lại thư mục; chỉ khi đó Form mới nhận phản hồi. Nếu bỏ qua, người dân mở link Form sẽ thấy *"không còn chấp nhận phản hồi"*. Đây là hệ quả cố hữu vì Apps Script `FormApp` không tạo được câu hỏi tải tệp bằng code nên buộc phải copy mẫu.

Để đẩy code bằng `clasp` thay vì dán tay, xem `docs/location-intake/CLASP.md`.

## Danh sách đơn vị và quyền

Điền đủ 148 đơn vị vào `Unit_Allowlist`: `unit_code`, `unit_name`, `allowed_emails`, `active`. Mỗi email phải khớp với đơn vị người gửi chọn; không để một dòng active không có email. Người vận hành cần quyền chỉnh sửa Form/Spreadsheet, quyền di chuyển và chia sẻ tệp trong thư mục ảnh, và quyền quản lý trigger. Người duyệt cần quyền Spreadsheet/Drive tương ứng; người dùng công khai không cần quyền vào Drive folder.

> **⚠ Chưa điền email cán bộ thật vào bộ tài nguyên production.** `lib/published-locations.js` đọc
> `Published_Locations` qua endpoint GViz **không xác thực**, nên bảng tính chứa sheet đó phải ở chế độ
> ai có liên kết đều xem được. `Unit_Allowlist` hiện nằm **cùng bảng tính**, tức là bất kỳ ai biết
> `GOOGLE_SHEET_ID` đều đọc được toàn bộ email cán bộ — `GOOGLE_SHEET_ID` chỉ là biến môi trường phía
> máy chủ chứ không phải cơ chế kiểm soát truy cập. Chừng nào `Unit_Allowlist` chưa được tách sang một
> bảng tính riêng **không** chia sẻ công khai (ID chỉ nằm trong Script Properties), chỉ dùng email thử
> nghiệm. Việc tách là điều kiện bắt buộc trước khi triển khai Staff Location Portal.

## Chính sách ảnh công khai

Ảnh chỉ được chuyển sang `ANYONE_WITH_LINK` sau khi duyệt. Nếu Workspace cấm chia sẻ này, duy trì chính sách tổ chức và thay đường dẫn công khai bằng một cơ chế lưu trữ đã được phê duyệt; không nới chính sách miền chỉ để chạy hệ thống. Khi ngừng hoạt động, runtime cố gắng thu hồi sharing của ảnh đã công bố.

## Giới hạn cần biết

Google Forms/Workspace có thể hạn chế upload tệp, thu email ngoài miền, hay `ANYONE_WITH_LINK`. Link Google Maps rút gọn không đảm bảo luôn resolve được; trường hợp đó vào `NEEDS_REVIEW` để quản trị viên nhập tọa độ và xác nhận thủ công.
