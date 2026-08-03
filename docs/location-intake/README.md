# Hệ thống tiếp nhận cập nhật địa điểm

Hệ thống nhận yêu cầu qua Google Form, kiểm tra và lưu vào `Location_Staging`, sau đó chỉ công bố bản ghi đã duyệt tại `Published_Locations`. Một đơn vị có thể có nhiều `record_id`; mọi cập nhật, báo sai và ngừng hoạt động đều nhắm đúng `target_record_id`, không ghi đè theo `unit_code`.

Thành phần chính:

- `setup/apps-script.js`: nguồn logic nghiệp vụ duy nhất, có unit test Node.
- `setup/location-intake/Code.gs`: runtime Apps Script mỏng được ghép cùng logic qua `npm run build:location-intake`.
- `api/google-sheet.js`: chỉ trả allowlist trường công khai từ sheet published.
- `scripts/migrate-published-locations.js`: migration JSON an toàn, mặc định dry-run.

Xem [thiết lập](SETUP.md), [vận hành](OPERATIONS.md), [migration](MIGRATION.md) và [bảo mật](SECURITY.md) trước khi dùng dữ liệu thật.
