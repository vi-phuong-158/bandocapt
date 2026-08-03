# Vận hành và duyệt yêu cầu

1. Trigger submit khóa phiên bằng `LockService`, xác nhận email theo allowlist, kiểm tra MIME thực của đúng một ảnh, di chuyển/đổi tên ảnh và tạo dòng staging.
2. Người duyệt mở `Location intake` trong Spreadsheet, kiểm tra địa chỉ, ảnh, `record_id`, điểm Maps, cảnh báo trùng và thông tin dịch vụ.
3. Chọn `APPROVE`, `REJECT` hoặc `NEED_VERIFICATION` ở cột `review_action`; trigger edit ghi audit. Chỉ `APPROVE` mới thêm/cập nhật `Published_Locations` và bật link công khai cho ảnh.
4. Với yêu cầu `STOP`, nhập đúng `target_record_id`. Runtime xóa đúng bản ghi published, trả ảnh cũ về private và ghi audit.

## Xử lý Maps

`EXTRACTED` được duyệt khi tọa độ nằm trong Phú Thọ. `INVALID_LINK`, `NEEDS_REVIEW`, `OUTSIDE_PHU_THO` không được tự công bố. Quản trị viên có thể sửa tọa độ sau khi kiểm tra nguồn và đặt `MANUALLY_CONFIRMED`; giữ nguyên URL gốc và URL sau redirect để truy vết.

## Sự cố

Chạy `locationIntakeHealthCheck` để kiểm tra cấu hình/trigger. Nếu ảnh không thể public do chính sách Workspace, không cố bypass chính sách: chuyển yêu cầu về `NEED_VERIFICATION`, thông báo quản trị viên và dùng phương án lưu trữ được phê duyệt. Với lỗi trigger, kiểm tra quyền người sở hữu trigger và `Audit_Log` trước khi cài lại.
