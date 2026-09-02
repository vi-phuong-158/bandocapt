# Nhà trọ an toàn — Beta

## Phạm vi và cờ tắt khẩn cấp

Lớp này là dữ liệu độc lập, **không phải** một loại `Published_Locations`, không dùng
`Location_Staging`, Staff API, Gateway hay form đóng góp công khai. Cờ duy nhất ở
`window.ACCOMMODATION_BETA_CONFIG` trong `data.js`.

- `enabled: false` là trạng thái phát hành mặc định: không nạp module Beta và không có request
  dữ liệu Beta.
- Khi bật, cấu hình phải có đúng một `pilotLocalityCodes` và tối đa 5.000 bản ghi.
- Tắt lại cờ hoặc nút layer sẽ gỡ layer Beta mà không ảnh hưởng marker, filter hay dữ liệu Công an.

## Hợp đồng dữ liệu công khai

Chỉ các trường sau được phép đi vào browser: `id` (`ACC_*`), `name`, `address`, `latitude`,
`longitude`, `localityCode`, `policeUnitCode`, `contactPhone`, `sourceType`,
`verificationStatus`, `lastVerifiedAt`, `updatedAt`. `sourceType` chỉ nhận `PILOT_INTERNAL` hoặc
`CSV_IMPORT`; chỉ `ACTIVE` được publish. Validator loại bản ghi ngoài địa bàn pilot, ID trùng,
toạ độ ngoài biên Phú Thọ, điện thoại/chuỗi không hợp lệ và mọi trường riêng tư vì DTO chỉ được
tạo theo allowlist.

Nguồn vận hành chỉ được import sau review: CSV do đầu mối được uỷ quyền hoặc danh sách nội bộ đã
duyệt. Không có import/apply command trong feature này. Không đưa email chủ nhà, CCCD, người ở,
ghi chú nội bộ, audit hoặc khoá nguồn vào cấu hình công khai.

## Hiển thị và liên kết Công an

Leaflet dùng `accommodationClusterGroup` và `selectedAccommodationLayer` riêng. Service chips vẫn
chỉ lọc `Published_Locations`; layer Beta có toggle riêng, marker xanh, badge BETA, tìm kiếm và
sắp xếp theo vị trí nếu người dùng bật định vị. Nút “Gần tôi” hiện hữu vẫn giữ semantics trụ sở
Công an.

`policeUnitCode` chỉ liên kết khi khớp đúng một `unitCode` trong dữ liệu Công an công khai. Không
khớp, trùng hoặc thiếu thì không suy đoán và detail ghi trạng thái chưa xác minh.

## Chatbot và quyền riêng tư

Sau owner approval ngày 02/09/2026, CTA gửi đúng một lần cùng lượt hỏi ba trường public-safe:
`accommodationName`, `localityCode`, `policeUnitCode`. Server validate strict, projection bỏ mọi
trường khác và nhúng dữ liệu dưới nhãn context (không phải chỉ dẫn). Context không được ghi vào
telemetry ứng dụng. Provider AI vẫn là một đích xử lý bên ngoài đã được owner chấp thuận; không gửi
email chủ nhà, CCCD, người ở, ghi chú nội bộ hay audit.

## Kiểm thử và benchmark

`node --test test/accommodation-beta.test.js` phủ cờ tắt, một pilot, toạ độ, DTO public-only,
mapping fail-closed, chuỗi HTML và filter benchmark 100/1.000/5.000 bản ghi. Benchmark unit đo
lọc dữ liệu; khi bật pilot thật, phải rehearsal trên trình duyệt cho marker creation, cluster,
toggle, keyboard và search trước release. Không có bản ghi pilot nào được bật trong source hiện tại.
