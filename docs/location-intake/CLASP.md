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

1. Bật Apps Script API **cấp tài khoản** tại <https://script.google.com/home/usersettings>.
2. Gắn script vào một **GCP project chuẩn** (Project Settings → Google Cloud Platform project → Change project → dán project number → Set project).
3. Trong **đúng GCP project đó**, bật hai API (đây là điểm rất hay quên — bật cấp tài khoản ở mục 1 KHÁC bật trong project):
   - **Apps Script API**: `https://console.developers.google.com/apis/api/script.googleapis.com/overview?project=<PROJECT_NUMBER>`
   - **Google Drive API**: `https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=<PROJECT_NUMBER>` — cần vì `setImagePublic_`/`revokeImagePublic_` gọi `DriveApp.setSharing`, đi qua Drive API. Thiếu nó, duyệt/thu hồi sẽ ném `Permission denied while enabling APIs: drive`. **Lưu ý vận hành:** khi đã gắn project chuẩn thì **trigger duyệt thật cũng chạy dưới project đó**, nên Drive API phải bật kể cả khi không dùng clasp.
4. Cấu hình OAuth consent screen (User type **External**, thêm chính email bạn vào **Test users**).
5. Tạo **OAuth client ID** loại *Desktop app*, tải file JSON, đặt tên `clasp-creds.json` (đã bị `.gitignore` chặn).
6. Đăng nhập kèm **cả hai** bộ scope — thực thi (manifest) và quản lý (để `push` vẫn chạy):

```bash
npm run clasp -- login --creds clasp-creds.json --use-project-scopes --include-clasp-scopes
```

**Đừng quên `--include-clasp-scopes`.** Nếu chỉ `--use-project-scopes`, token thiếu scope `script.projects` và `clasp:push` sẽ báo `Insufficient Permission`. Nếu bỏ qua toàn bộ mục 4, `push` và `logs` vẫn chạy nhưng `run` thì không.

## Lệnh hằng ngày

```bash
npm run clasp:push
```

Build lại `setup/location-intake/dist/` (gồm `Code.gs` và `appsscript.json`) rồi đẩy lên. `dist/`
là push root, nên chỉ đúng hai file đó lên Google — không đẩy nhầm mã nguồn khác.

```bash
npm run clasp:run -- apiHealthCheckLocationIntake
npm run clasp:run -- apiLocationIntakeSnapshot
npm run clasp:run -- apiReviewLocationRequest --params '["<request_id>","APPROVE","reviewer@example.com"]'
npm run clasp:run -- apiRevokePublishedLocation --params '["<record_id>","reviewer@example.com"]'
npm run clasp:logs
```

## Hàm dùng được qua API và hàm không

Apps Script API chạy **không có giao diện và không có bảng đang mở**. Hàm chạm
`SpreadsheetApp.getUi()` hoặc `getActiveRange()` sẽ lỗi khi gọi qua `run`.

| Hàm | Qua `clasp run` | Ghi chú |
| --- | --- | --- |
| `apiHealthCheckLocationIntake` | Được | Trả mảng trạng thái thay vì hộp thoại |
| `apiReviewLocationRequest` | Được | Duyệt theo `request_id` (APPROVE/REJECT/NEED_VERIFICATION), trả snapshot sau khi ghi |
| `apiRevokePublishedLocation` | Được | Thu hồi theo `record_id`, trả ảnh về private, trả snapshot |
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
