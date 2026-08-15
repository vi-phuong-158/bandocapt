# Vận hành và duyệt yêu cầu

1. Trigger submit khóa phiên bằng `LockService`, xác nhận email theo allowlist, kiểm tra MIME thực của đúng một ảnh, di chuyển/đổi tên ảnh và tạo dòng staging.
2. Người duyệt mở `Location intake` trong Spreadsheet, kiểm tra địa chỉ, ảnh, `record_id`, điểm Maps, cảnh báo trùng và thông tin dịch vụ.
3. Chọn `APPROVE`, `REJECT` hoặc `NEED_VERIFICATION` ở cột `review_action`; trigger edit ghi audit. Chỉ `APPROVE` mới thêm/cập nhật `Published_Locations` và bật link công khai cho ảnh.
4. Với yêu cầu `STOP`, nhập đúng `target_record_id`. Runtime xóa đúng bản ghi published, trả ảnh cũ về private và ghi audit.

## Duyệt dual-workbook (menu "Bản đồ CA - Duyệt địa điểm")

Dành cho kiến trúc dual-workbook (private `Location_Staging`/`Approval_Audit_Log` +
public `Published_Locations`), stacked trên PR #48, TEST-only cho tới khi được duyệt cutover.

1. Đặt Script Property `LOCATION_APPROVER_EMAILS` (danh sách email cách nhau bởi dấu phẩy) —
   chỉ email trong danh sách này mới duyệt được; thiếu property này mọi thao tác fail closed.
2. Mở PRIVATE workbook, vào sheet `Location_Staging`, chọn một dòng `PENDING`.
3. Dùng menu:
   - **Duyệt yêu cầu đã chọn** — CREATE/UPDATE/CORRECT ghi/cập nhật `Published_Locations` rồi mới
     công khai ảnh; STOP xoá bản ghi công khai rồi mới thử thu hồi chia sẻ ảnh.
   - **Từ chối yêu cầu đã chọn** / **Yêu cầu xác minh thêm** — chỉ ghi private, không chạm public.
   - **Đối soát / hoàn tất yêu cầu đã chọn** — dùng khi một lần duyệt trước đó dừng giữa chừng
     (mất mạng, hết thời gian chạy). Không cần chọn lại action; engine tự suy ra từ `status`/
     `request_type` hiện tại của dòng và chỉ hoàn tất phần còn thiếu, không lặp lại phần đã xong.
   - **Kiểm tra cấu hình duyệt** — read-only, không hiện secret/ID.

## Xử lý Maps

`EXTRACTED` được duyệt khi tọa độ nằm trong Phú Thọ. `INVALID_LINK`, `NEEDS_REVIEW`, `OUTSIDE_PHU_THO` không được tự công bố. Quản trị viên có thể sửa tọa độ sau khi kiểm tra nguồn và đặt `MANUALLY_CONFIRMED`; giữ nguyên URL gốc và URL sau redirect để truy vết.

## Sự cố

Chạy `healthCheckLocationIntake` để kiểm tra cấu hình/trigger. Nếu ảnh không thể public do chính sách Workspace, không cố bypass chính sách: chuyển yêu cầu về `NEED_VERIFICATION`, thông báo quản trị viên và dùng phương án lưu trữ được phê duyệt. Với lỗi trigger, kiểm tra quyền người sở hữu trigger và `Approval_Audit_Log` trước khi cài lại.

**Form báo "không còn chấp nhận phản hồi":** hầu như luôn do thư mục tải tệp bị thiếu sau khi Form được sao chép từ mẫu (xem `SETUP.md` bước 8). Mở Form trong trình chỉnh sửa, bấm **Phục hồi** ở hộp thoại *"Thư mục Tải lên tệp bị thiếu"*. Lưu ý `FormApp.isAcceptingResponses()` vẫn trả `true` trong tình huống này nên **không** dùng nó để phát hiện; phải mở Form kiểm tra bằng mắt. Mỗi lần chạy lại `setupLocationIntakeSystem` tạo Form mới → phải khôi phục lại.
