# Đẩy và chạy Apps Script bằng clasp

Mục đích: thay thao tác dán code thủ công vào trình soạn Apps Script bằng `clasp push`, và
cho phép chạy hàm + đọc log từ dòng lệnh khi smoke test hoặc vận hành.

Phiên bản dùng cố định: `@google/clasp@3.3.0`, gọi qua `npx` trong npm script nên không cần
cài toàn cục và không thêm dependency vào `package-lock.json`.

## Ranh giới cần biết trước

`clasp` chạy **dưới danh tính Google của người vận hành**. Việc đăng nhập và bấm đồng ý ở màn
hình OAuth là thao tác của người thật, không uỷ quyền cho công cụ hay AI agent làm thay.

Sau khi đã đăng nhập, các lệnh push/run/logs chạy được không cần tương tác.

## Thiết lập một lần

### 1. Đăng nhập cơ bản (đủ cho `push` và `logs`)

```bash
npm run clasp -- login
```

Trình duyệt mở màn hình đồng ý; chọn tài khoản quản trị của bộ dữ liệu test. Token lưu ở
`~/.clasprc.json` (đã nằm trong `.gitignore`).

### 2. Trỏ tới script

Mở Google Sheet vận hành → **Extensions → Apps Script** → **Project Settings** → chép
**Script ID**. Sau đó:

```bash
cp setup/location-intake/.clasp.json.example setup/location-intake/.clasp.json
```

Thay `DAN_SCRIPT_ID_CUA_BAN_VAO_DAY` bằng Script ID thật. File này **không commit** vì là dữ
liệu môi trường, mỗi người/mỗi bộ test một giá trị khác nhau.

### 3. Script Properties

Trong **Project Settings → Script properties**, đặt:

| Key | Giá trị |
| --- | --- |
| `TEMPLATE_FORM_ID` | ID Form mẫu (có đúng một câu hỏi tải tệp tên `Ảnh địa điểm`) |
| `DESTINATION_FOLDER_ID` | ID thư mục Drive chứa ảnh |
| `LOCATION_SPREADSHEET_ID` | ID Sheet vận hành — **chỉ cần khi chạy `setupLocationIntakeSystem` qua API**, vì lúc đó không có bảng đang mở |

### 4. Bổ sung để dùng được `clasp:run`

`run-function` gọi Apps Script API nên cần thêm, chỉ làm một lần:

1. Bật Apps Script API tại <https://script.google.com/home/usersettings>.
2. Gắn script vào một **GCP project chuẩn** (Project Settings → Google Cloud Platform project).
3. Trong GCP project đó, tạo **OAuth client ID** loại *Desktop app*, tải file JSON về, đặt tên
   `clasp-creds.json` (mẫu tên này đã bị `.gitignore` chặn).
4. Đăng nhập lại kèm scope của manifest:

```bash
npm run clasp -- login --creds clasp-creds.json --use-project-scopes
```

Nếu bỏ qua mục 4, `push` và `logs` vẫn dùng bình thường; chỉ `run` là không chạy được.

## Lệnh hằng ngày

```bash
npm run clasp:push
```

Build lại `setup/location-intake/dist/` (gồm `Code.gs` và `appsscript.json`) rồi đẩy lên. `dist/`
là push root, nên chỉ đúng hai file đó lên Google — không đẩy nhầm mã nguồn khác.

```bash
npm run clasp:run -- apiHealthCheckLocationIntake
npm run clasp:run -- apiReviewLocationRequest --params '["REQ-001","APPROVE","reviewer@example.com"]'
npm run clasp:run -- apiLocationIntakeSnapshot
npm run clasp:logs
```

## Hàm dùng được qua API và hàm không

Apps Script API chạy **không có giao diện và không có bảng đang mở**. Hàm chạm
`SpreadsheetApp.getUi()` hoặc `getActiveRange()` sẽ lỗi khi gọi qua `run`.

| Hàm | Qua `clasp run` | Ghi chú |
| --- | --- | --- |
| `apiHealthCheckLocationIntake` | Được | Trả mảng trạng thái thay vì hộp thoại |
| `apiReviewLocationRequest` | Được | Duyệt theo `request_id`, trả snapshot sau khi ghi |
| `apiLocationIntakeSnapshot` | Được | Đọc staging/published/audit để đối chiếu tự động |
| `setupLocationIntakeSystem` | Được, có điều kiện | Phải đặt `LOCATION_SPREADSHEET_ID` trước |
| `healthCheckLocationIntake` | Không | Bản dùng menu, hiện hộp thoại |
| `approveSelectedLocationRequest` và các hàm `*Selected*` | Không | Phụ thuộc dòng đang chọn trên bảng |

## Phần smoke test vẫn phải làm bằng tay

Gửi Form thật kèm tải ảnh không tự động hoá được: Google Forms không cho nộp phản hồi có tệp
đính kèm qua API. Bước này phải do người thật thực hiện, và đây cũng chính là bước kiểm chứng
MIME thật, quyền Drive thật và allowlist email thật — phần mà mock không thay thế được.

Sau khi Form đã được gửi, các bước còn lại (duyệt, công bố theo `record_id`, đối chiếu dữ liệu
công khai, thu hồi) chạy và kiểm chứng được bằng `clasp:run` và `clasp:logs`.
