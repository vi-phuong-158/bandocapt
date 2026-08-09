# Staff Location Portal — kế hoạch kiến trúc và bảo mật

> **Trạng thái: KẾ HOẠCH, CHƯA TRIỂN KHAI.** Tài liệu này không mô tả code đang chạy. Không có
> `/can-bo`, không có Google Sign-In, không có `/api/can-bo/*`, không có gateway HMAC và không có
> bảng tính riêng nào tồn tại tại thời điểm viết. Chủ dự án phải duyệt trước khi bắt đầu code.
>
> Nền tảng: PR #41 (merge commit `1f56121`). Quyết định mở scope auth:
> `docs/brain/03-decisions.md` — [2026-08-09]. Ma trận kiểm thử và threat model:
> [`STAFF_PORTAL_TEST_MATRIX.md`](STAFF_PORTAL_TEST_MATRIX.md).

---

## 0. Vấn đề cần giải

Google Form của PR #41 đúng về bảo mật nhưng không dùng được cho 148 đơn vị:

| Vấn đề | Hệ quả |
| --- | --- |
| Form không biết bản ghi hiện tại đang ghi gì | Sửa số điện thoại vẫn phải nhập lại địa chỉ, toạ độ, dịch vụ, ảnh |
| Form hiện enum kỹ thuật (`HEADQUARTERS`, `E_IDENTIFICATION`, `TEMPORARILY_PAUSED`) | Cán bộ chọn sai loại địa điểm |
| `target_record_id` là ô nhập tay | Cán bộ phải tự tra mã bản ghi; gõ sai → `TARGET_RECORD_ID_NOT_FOUND` |
| Một đơn vị nhiều địa điểm | Không có cách nào xem danh sách địa điểm của đơn vị mình |
| `IMAGE_REQUIRED` cho mọi request không phải `stop` | Bấm "thông tin vẫn đúng" cũng phải chụp lại ảnh trụ sở |

Portal thay lớp **nhập liệu**, không thay lớp **duyệt**.

---

## 1. Kiến trúc mục tiêu

```text
Cán bộ
   ↓
bandocapt.vercel.app/can-bo          (static, mobile-first, 100% tiếng Việt)
   ↓
Google Sign-In (Google Identity Services)
   ↓
Vercel: verify ID token → signed session cookie
   ↓
Authorization: email → authorizedUnits[] (đọc allowlist RIÊNG TƯ qua gateway)
   ↓
Staff APIs  /api/can-bo/*
   ↓
Apps Script private gateway (HMAC server-to-server)
   ↓
Location_Staging / Approval_Audit_Log / Drive
   ↓
Admin Review (giữ nguyên PR #41: menu Apps Script)
   ↓
Published_Locations
```

Luồng công khai **không đổi và không phụ thuộc** vào nhánh trên:

```text
Người dân → bản đồ / chatbot → /api/google-sheet → GViz → Published_Locations
```

`/api/google-sheet` **vẫn là API công khai**. Không biến nó thành API nội bộ, không thêm auth vào
nó, không đổi allowlist cột của nó.

---

## 2. Tách dữ liệu công khai / riêng tư — CHẶN PRODUCTION

Đây là prerequisite bắt buộc, không phải khuyến nghị.

**Tình trạng hiện tại:** `lib/published-locations.js` đọc `Published_Locations` bằng endpoint
Google Visualization **không xác thực**, nên bảng tính chứa sheet đó phải để "ai có liên kết đều
xem". `Unit_Allowlist` (cột `allowed_emails`) nằm **cùng bảng tính đó**. `GOOGLE_SHEET_ID` là biến
môi trường, không phải cơ chế kiểm soát truy cập — ai biết ID đều đọc được toàn bộ email cán bộ.

**Thiết kế mới — hai bảng tính:**

| | Bảng tính CÔNG KHAI | Bảng tính RIÊNG TƯ (staff) |
| --- | --- | --- |
| Sheet | `Published_Locations` (+ sheet công khai thật sự cần) | `Unit_Allowlist`, dữ liệu quyền cán bộ về sau |
| Chia sẻ | "Anyone with link" — bắt buộc, để GViz đọc được | **KHÔNG** publish to web, **KHÔNG** anyone-with-link |
| ID xuất hiện ở | `GOOGLE_SHEET_ID` (server env), payload GViz | **CHỈ** Apps Script Script Properties (`STAFF_SPREADSHEET_ID`) |
| Frontend thấy ID? | Không cần thiết, nhưng không phải bí mật | **Tuyệt đối không** |
| Ai đọc được | Bất kỳ ai | Chỉ Apps Script/backend trusted |

`Location_Staging` và `Approval_Audit_Log` chứa `submitter_email` và `submitter_phone` → **phải
nằm ở phía riêng tư**, không phải phía công khai. (Hiện chúng nằm cùng bảng tính công khai — điểm
này phải được xử lý cùng lúc với `Unit_Allowlist`, nếu không việc tách allowlist chỉ vá một nửa lỗ
rò PII.)

---

## 3. Kế hoạch migration — KHÔNG THỰC HIỆN TRONG TASK NÀY

Chỉ viết kế hoạch. Không chạy trên production. Có thể tạo fixture/test data local.

1. **Inventory** — xuất toàn bộ `Unit_Allowlist` hiện tại: số dòng, số email phân biệt, số dòng
   `active=TRUE` / `active=FALSE`, dòng active thiếu `allowed_emails`.
2. **Copy** — tạo bảng tính riêng tư mới, copy nguyên sheet `Unit_Allowlist` sang. Không xoá bản gốc.
3. **Validate row count** — số dòng bản mới == bản gốc.
4. **Validate email count** — tập email phân biệt (đã `normalizeEmail`) hai bên bằng nhau.
5. **Validate active/inactive** — số dòng theo từng trạng thái `active` khớp; đặc biệt kiểm tra ô
   Sheets lưu boolean `FALSE` (xem chú thích `normalizeLabel`/`normalizeBoolean` trong
   `setup/apps-script.js` — `value || ''` từng nuốt `false` thành `''` và biến đơn vị đã tắt
   thành ACTIVE).
6. **Apps Script switch config** — đặt Script Property `STAFF_SPREADSHEET_ID`; đổi chỗ đọc
   allowlist từ `configuredSpreadsheet_()` sang bảng tính riêng tư. Giữ property cũ để rollback.
7. **Smoke auth lookup** — với 2–3 email thật đã biết, gọi `resolveUnitsByEmail` qua gateway và
   xác nhận trả đúng tập đơn vị; với 1 email không tồn tại, xác nhận trả `[]`.
8. **Rollback config** — nếu bước 7 sai, gỡ `STAFF_SPREADSHEET_ID` để quay lại đọc bảng cũ. Rollback
   chỉ là đổi config, không cần migrate ngược dữ liệu.
9. **Chỉ sau khi verify mới xoá** dữ liệu riêng tư khỏi bảng tính công khai. Xoá là bước cuối cùng
   và không thể lùi bằng config.

**Không** chạy bước 1–9 trên production trong phiên này.

---

## 4. Email → Unit là quan hệ 1:N

Không giả định một email chỉ thuộc một đơn vị. Một cán bộ có thể phụ trách nhiều xã/phường sau sáp
nhập, hoặc kiêm nhiệm.

```text
email  →  authorizedUnits[]
```

```json
{
  "email": "example@gmail.com",
  "authorizedUnits": [
    { "unitCode": "CA_A", "unitName": "Công an phường A" },
    { "unitCode": "CA_B", "unitName": "Công an phường B" }
  ]
}
```

### 4.1. Helper `resolveUnitsByEmail` — ĐÃ CÓ

Repo trước đây chỉ có chiều `unitName + email → authorized?` (`authorizeSubmission`), tức là chiều
kiểm tra một đơn vị mà **người gửi tự khai**. Portal cần chiều ngược, vì client không được quyết
định `unit_code`. Helper đã được thêm trong phiên này:

```js
// setup/apps-script.js
resolveUnitsByEmail(email, allowlistRows) → [{ unitCode, unitName }]
```

Đặt trong `setup/apps-script.js` vì đó là module logic nghiệp vụ thuần, chạy được cả ở Node (unit
test) lẫn Apps Script (GAS runtime), và đã là nguồn sự thật duy nhất cho phân quyền địa điểm.
**Không** đặt logic security này chỉ trong Vercel route hoặc frontend.

Nó dựng trên `buildAllowlistMap` — cùng bộ lọc `active`, cùng cách bỏ dòng thiếu `unit_name`, cùng
cách gộp dòng trùng tên — để hai chiều không thể lệch nhau. Nếu duyệt `rows` riêng, Portal có thể
chào một đơn vị mà `buildStagingRecord` sau đó lại từ chối.

### 4.2. Luật bắt buộc của `resolveUnitsByEmail`

| Luật | Thực thi |
| --- | --- |
| Normalize email (trim + lowercase) | `normalizeEmail` |
| Bỏ qua đơn vị `active=FALSE` | `buildAllowlistMap` |
| Bỏ qua đơn vị không cấu hình email | `allowedEmails.includes()` trên mảng rỗng luôn false |
| Một email ở nhiều đơn vị → trả đủ | trả mảng |
| Deduplicate đơn vị | `Set` theo `unitCode` đã lowercase |
| Fail closed | email rỗng/không khớp → `[]`, không bao giờ ném để "mở" |
| Không trả internal notes | chỉ `unitCode`, `unitName` |
| Không trả toàn bộ allowlist | chỉ đơn vị khớp email |

Ca kiểm thử: B08–B13 trong test matrix, đã pass trong `test/location-pipeline.test.js`.

---

## 5. Google Sign-In

**Chọn:** Google Identity Services (Sign in with Google), backend verify ID token.
**Không chọn:** để người dùng tự nhập email rồi tin · OTP làm primary · password riêng.

Backend **phải** verify, không chỉ decode. Acceptance contract:

| Kiểm tra | Yêu cầu |
| --- | --- |
| Chữ ký | Verify bằng khoá công khai Google (JWKS), không bỏ qua |
| `aud` | `=== GOOGLE_CLIENT_ID` |
| `iss` | Thuộc tập issuer hợp lệ của Google |
| `exp` | Chưa hết hạn |
| `email_verified` | `=== true` |
| `email` | Có mặt, `normalizeEmail` trước khi authorize |

**Không** dùng endpoint `tokeninfo` làm verifier production (thêm một round-trip mạng vào đường
đăng nhập và biến Google thành single point of failure đồng bộ).

> Ở giai đoạn implementation, phải kiểm tra tài liệu chính thức của Google tại thời điểm đó — tên
> claim, danh sách issuer hợp lệ và cách lấy JWKS có thể đã đổi so với hôm nay.

---

## 6. Session

**Phase 1: stateless signed session**, không có session store. Đơn giản hơn, không thêm hạ tầng.

- Secret: `STAFF_SESSION_SECRET` (env, server-only).
- Payload tối thiểu:

```json
{ "email": "...", "unitCodes": ["..."], "exp": 0, "version": 1 }
```

- Cookie: `HttpOnly` · `Secure` (production) · `SameSite=Lax` · `Max-Age` có giới hạn (đề xuất 8–12
  giờ, một ca làm việc; chốt con số ở implementation).
- `version` để vô hiệu hoá hàng loạt session cũ khi đổi format hoặc khi cần force logout.

### 6.1. `unitCodes` trong session KHÔNG phải quyền vĩnh viễn

Đây là ràng buộc quan trọng nhất của phần session. `unitCodes` trong cookie chỉ là **cache hiển
thị**, không phải nguồn quyền.

**Trước mọi state-changing operation**, server phải reauthorize `email` với allowlist **hiện tại**:

```text
requestedUnitCode ∈ resolveUnitsByEmail(session.email, allowlist HIỆN TẠI)
```

Nếu email bị gỡ khỏi allowlist · đơn vị bị `active=FALSE` · quyền đã đổi → **fail closed**, từ chối
ghi, kể cả khi cookie còn hạn và chữ ký hợp lệ. Đánh đổi: mỗi lần ghi tốn thêm một lượt gọi gateway;
chấp nhận vì thao tác ghi hiếm và hậu quả của quyền tồn dư nghiêm trọng hơn độ trễ.

---

## 7. Chọn đơn vị (unit selection)

- Email có đúng **1** đơn vị → auto-select, vào thẳng danh sách địa điểm.
- Email có **nhiều** đơn vị → hiện danh sách đơn vị được cấp quyền, người dùng chọn một.

Server **luôn** verify `requestedUnitCode ∈ currentlyAuthorizedUnits`, không tin client — kể cả
trong trường hợp 1 đơn vị (client vẫn có thể gửi mã khác).

---

## 8. Danh tính người gửi (submitter identity)

Bất biến:

```text
submitter_email = email đã verify trong session
```

Không bao giờ:

```text
submitter_email = request.body.email
```

Nếu request body có trường email/`submitter_email`, server **bỏ qua** (không phải merge, không phải
ưu tiên body). Audit ghi danh tính từ session. Frontend không được quyết định actor identity.

---

## 9. Đọc danh sách địa điểm

Dữ liệu `Published_Locations` là công khai, nên **không cần** đi qua Apps Script gateway. Tái dùng
`lib/published-locations.js` đã có.

Luồng `GET /api/can-bo/locations`:

1. Server authenticate session.
2. Server resolve `authorizedUnits` (reauthorize theo allowlist hiện tại).
3. Server fetch `Published_Locations` (đi qua cache TTL 60s đã có).
4. Server **lọc theo `unit_code`** thuộc tập được phép.
5. Trả đúng các bản ghi đó.

**Không** trả toàn bộ `Published_Locations` rồi lọc ở browser. (Dữ liệu tuy công khai, nhưng lọc ở
client tạo thói quen sai và làm lộ ranh giới phân quyền trong payload.)

---

## 10. Quyền trên bản ghi (record ownership)

Mọi thao tác trên bản ghi đang có — `update`, `correct`, `stop`, và `confirm` nếu chọn thiết kế
target-based — phải kiểm tra:

```text
record.unit_code ∈ currentlyAuthorizedUnits
```

PR #41 đã có defense-in-depth ở hai chốt: `buildStagingRecord` (khâu nhận) và `applyApproval` (ngay
trước khi ghi/xoá `Published_Locations`, phòng ô `validation_errors` bị xoá tay trong Sheet), báo
lỗi `TARGET_RECORD_UNIT_MISMATCH`.

Portal **thêm** một lớp thứ ba ở tầng Vercel — **không thay thế** hai lớp kia. Test C23 kiểm lớp
Vercel, C24 kiểm lớp pipeline; cả hai phải pass độc lập.

---

## 11. Bất biến CREATE

Giữ nguyên PR #41, không regression:

```text
CREATE
→ target_record_id KHÔNG được phép        (CREATE_TARGET_RECORD_ID_NOT_ALLOWED, là error không phải warning)
→ record_id do server sinh bằng buildRecordId
→ không bao giờ overwrite bản ghi Published đang có, kể cả của chính đơn vị mình
```

Portal không được cho phép UI nào gửi `target_record_id` kèm request tạo mới.

---

## 12. Ngữ nghĩa STOP

Không tạo cột `active=false` trên `Published_Locations`. Giữ đúng PR #41:

```text
"Báo địa điểm ngừng hoạt động"
→ Location_Staging (request_type = stop)
→ admin approve
→ bản ghi bị XOÁ khỏi Published_Locations
→ Approval_Audit_Log giữ snapshot bản ghi đã xoá (action REVOKE)
→ ảnh đã publish được thu hồi sharing nếu khả thi
```

Không đổi schema công khai trong Phase 1.

---

## 13. Ngữ nghĩa CONFIRM

Nút **"Thông tin chính xác"** sẽ được bấm rất nhiều (148 đơn vị × nhiều địa điểm, định kỳ). Nếu mỗi
lần bấm tạo một dòng chờ duyệt thì hàng đợi admin vô dụng.

**Thiết kế:**

```text
confirm
→ ghi verification/audit event
→ KHÔNG thay đổi nội dung Published_Locations
→ KHÔNG vào hàng đợi duyệt nội dung
```

Cán bộ **không** được tự sửa `Published_Locations.verified_at` (đó là cột công khai, ghi bởi
`buildPublishedRecord` khi duyệt).

**Nơi lưu đề xuất** (chốt ở implementation, chọn một):

- **A — sheet audit riêng** `Location_Verification_Log` với cột
  `timestamp, record_id, unit_code, actor_email, session_id_hash, note`. Ưu: không đụng schema
  `Approval_Audit_Log` đang được admin dùng; dễ prune riêng. Nhược: thêm một sheet.
- **B — mở rộng `Approval_Audit_Log`** với `action = 'STAFF_CONFIRM'`. Ưu: một chỗ audit duy nhất.
  Nhược: trộn event tần suất cao vào log duyệt, làm khó đọc cho admin.

Khuyến nghị **A**, vì tần suất confirm khác hẳn tần suất duyệt.

Nếu sau này muốn hiển thị trạng thái "đã xác minh gần đây" ra công khai → **phase khác**, cần quyết
định riêng vì nó đổi schema công khai.

**Không implement trong task hiện tại.**

---

## 14. UPDATE — merge phía server

Đây là thay đổi lớn nhất so với Form. Frontend chỉ gửi **các trường đã đổi**.

```text
bản ghi published hiện tại
      +
thay đổi tường minh từ cán bộ
      =
bản ghi đề xuất ĐẦY ĐỦ  →  Location_Staging
```

Merge chạy ở **server**, không ở client, vì client không được quyết định nội dung không đổi.

### 14.1. Ba trạng thái của một trường — phải phân biệt

| Trạng thái | Biểu diễn trong payload | Ý nghĩa |
| --- | --- | --- |
| **Omitted** | key vắng mặt | Giữ nguyên giá trị hiện tại |
| **Explicit blank** | key có mặt, giá trị `""` | Xoá giá trị, chỉ với trường được phép rỗng |
| **Explicit replacement** | key có mặt, giá trị mới | Thay thế |

**Omitted ≠ delete.** Đây là bug hạng nhất nếu làm sai: gửi PATCH chỉ có `phone` mà backend coi các
trường vắng mặt là rỗng sẽ xoá sạch địa chỉ/toạ độ/dịch vụ của bản ghi.

Ví dụ sửa số điện thoại: `address` giữ · `coordinates` giữ · `services` giữ · `image` giữ ·
`google_maps_url` giữ · `site_type` giữ · `search_aliases` giữ.

### 14.2. Trường được phép "explicit blank"

Trường bắt buộc của pipeline **không** được phép rỗng — `buildStagingRecord` sẽ trả
`LOCATION_NAME_MISSING` / `ADDRESS_MISSING` / `SERVICES_MISSING` và block. Danh sách được phép xoá
(đề xuất, chốt ở implementation): `public_phone`, `service_schedule`, `served_units`,
`search_aliases`. Payload cố xoá trường bắt buộc → từ chối ở tầng Vercel với thông báo tiếng Việt,
không đẩy xuống staging để rồi bị BLOCK.

Test tương ứng: I36–I42.

---

## 15. Quy tắc ảnh

### 15.1. `IMAGE_REQUIRED` — luật mới cho Portal

PR #41 hiện yêu cầu ảnh cho **mọi** request không phải `stop`
(`if (!submission.imageFileId && requestType !== stop) errors.push('IMAGE_REQUIRED')`).

Portal:

| Tình huống | Luật |
| --- | --- |
| **Create** | Ảnh **bắt buộc** — không đổi |
| **Update**, bản ghi đích đã có ảnh hợp lệ | **Không** yêu cầu upload lại |
| **Update**, cán bộ có upload ảnh mới | Dùng ảnh mới sau khi duyệt |
| **Update**, cán bộ không upload | Giữ ảnh cũ |
| **Stop** | Không cần ảnh — không đổi |
| **Confirm** | Không cần ảnh (confirm không đổi nội dung) |

Cách thực hiện: Portal điền `imageFileId` của ảnh hiện tại vào submission trước khi gọi
`buildStagingRecord`, nên rule `IMAGE_REQUIRED` của pipeline **không cần sửa** — nó tự thoả. Đây là
lựa chọn có chủ đích: không nới lỏng guard đã có, chỉ cung cấp đủ dữ liệu cho nó.

### 15.2. Bản ghi legacy chưa có ảnh — chốt phương án

Bản ghi migrate từ dữ liệu cũ có thể không có `image_url`. Chốt:

> **Cho phép update metadata, đánh dấu `IMAGE_MISSING_WARNING`.**

Lý do chọn phương án này thay vì "bắt upload ảnh ở lần update đầu": bắt buộc ảnh sẽ chặn đúng những
sửa đổi cần nhất (sai địa chỉ, sai số điện thoại) chỉ vì một thiếu sót của dữ liệu cũ mà cán bộ
không gây ra. Cảnh báo hiện cho **admin** ở hàng đợi duyệt và cho cán bộ dưới dạng gợi ý mềm
("Địa điểm này chưa có ảnh, bạn có thể bổ sung"), không phải lỗi chặn.

`IMAGE_MISSING_WARNING` đi vào cột `warnings` của `Location_Staging` (cột đã tồn tại, dùng cùng cơ
chế với `POSSIBLE_DUPLICATE`), không phải cột `validation_errors`.

### 15.3. Khôi phục `image_file_id`

`Published_Locations` lưu `image_url` (`https://drive.google.com/uc?export=view&id=<fileId>`) nhưng
**không có cột `image_file_id`**. Portal cần file ID để giữ ảnh cũ khi update.

Hai nguồn, theo thứ tự:

1. **`findPublishedImageFileId(stagingRecords, recordId)`** — helper đã có trong
   `setup/apps-script.js`. Nó tìm dòng staging `APPROVED` gần nhất của `record_id` đó và trả
   `published_image_file_id || image_file_id`. Đây là nguồn chính xác nhất.
2. **Trích từ `image_url`** — parse tham số `id=` của URL Drive. Fallback cho bản ghi legacy không
   có lịch sử staging.

**Không** bắt cán bộ tải lại ảnh chỉ vì `Published_Locations` thiếu cột file ID. **Không** thêm cột
`image_file_id` vào schema công khai (nó là định danh nội bộ Drive, không thuộc dữ liệu công khai).

---

## 16. Apps Script private gateway

Portal cần một gateway server-to-server. **Không code trong task này.**

**Action tối thiểu — chỉ ba, không thêm:**

| Action | Mục đích | Vì sao phải qua gateway |
| --- | --- | --- |
| `resolveUnits` | email → `authorizedUnits[]` | Allowlist nằm ở bảng tính riêng tư, Vercel không có quyền đọc |
| `submitRequest` | Ghi một dòng `Location_Staging` (+ ảnh nếu có) | Ghi vào Sheet riêng tư, cần `LockService` |
| `writeVerificationEvent` | Ghi audit event cho `confirm` | Ghi vào sheet riêng tư |

Đọc `Published_Locations` **không** đi qua gateway (§9).

Không thêm action `approve`, `reject`, `publish`, `revoke`, `listAllowlist`, `getUnit` — Portal
không có nghiệp vụ nào cần chúng, và mỗi action thừa là một bề mặt tấn công thừa.

Gateway triển khai bằng `doPost` trên Apps Script Web App, deploy chế độ "Execute as: me", "Who has
access: Anyone" (bắt buộc để Vercel gọi được) — **do đó HMAC là lớp xác thực duy nhất và phải đúng.**

---

## 17. Hợp đồng HMAC

Secret: `LOCATION_GATEWAY_SECRET` — đặt ở cả Vercel env và Apps Script Script Properties. Không bao
giờ tới browser.

**Canonical data:**

```text
method \n action \n timestamp \n sha256Hex(body)
```

**Signature:** `HMAC-SHA256(canonical, LOCATION_GATEWAY_SECRET)`, hex.

Gửi qua header (hoặc field trong body nếu Apps Script không đọc được header tuỳ chỉnh — kiểm tra ở
implementation): `X-Location-Signature`, `X-Location-Timestamp`.

**Apps Script phải:**

- verify chữ ký bằng `Utilities.computeHmacSha256Signature`, so sánh **toàn bộ chuỗi** (không so
  prefix);
- reject chữ ký sai định dạng (không phải 64 hex) trước khi tính toán;
- reject timestamp lệch quá **±5 phút**;
- **fail closed** — thiếu chữ ký, thiếu timestamp, body không parse được, secret chưa cấu hình →
  từ chối, không phải "cho qua";
- **không log secret**, không log toàn bộ body chứa email vào Stackdriver;
- **không** nhận secret từ frontend dưới bất kỳ hình thức nào.

**Replay strategy Phase 1 — giới hạn đã biết:** chỉ có timestamp window ±5 phút. Trong cửa sổ đó,
một request bị chặn bắt (ví dụ qua log proxy) có thể replay được. Chấp nhận ở Phase 1 vì:
gateway chỉ nhận HTTPS, canonical data ràng buộc cả body nên không sửa được nội dung, và hậu quả
tối đa là một dòng staging trùng (admin thấy và reject). Nếu cần chặt hơn ở phase sau: thêm nonce
lưu trong `CacheService` với TTL 5 phút và reject nonce đã dùng — hợp đồng testable, xem M58–M63.

---

## 18. CSRF / Origin

Mọi POST tới `/api/can-bo/*` phải:

- yêu cầu session cán bộ hợp lệ;
- validate `Origin` bằng `isAllowedOrigin` trong `lib/request-security.js` (**tái dùng, không viết
  stack bảo mật trùng lặp**);
- cookie `SameSite=Lax` là lớp phòng thủ thứ hai, không phải lớp duy nhất.

**Chính sách `Origin` vắng mặt phải được ghi rõ và test** (case N66). Đề xuất: state-changing POST
thiếu `Origin` → **từ chối** (fail closed). Trình duyệt hiện đại luôn gửi `Origin` cho POST
cross-origin và same-origin; thiếu nó nghĩa là không phải trình duyệt.

Lưu ý `isAllowedOrigin` hiện có nhánh nới cho `process.env.VERCEL` (chấp nhận origin khớp
`x-forwarded-host`) để preview deployment hoạt động. Ở implementation phải xác nhận nhánh này không
biến bất kỳ host nào tự đặt header thành origin hợp lệ.

---

## 19. Rate limit

| Loại request | Key chính | Ghi chú |
| --- | --- | --- |
| Login attempt (verify Google token) | IP | Chưa có email đã verify tại thời điểm này |
| Read (`/me`, `/locations`) | email đã verify | Giới hạn rộng |
| State-changing (`/confirm`, `/requests`) | **email đã verify** | Giới hạn chặt, `STAFF_DAILY_REQUEST_LIMIT` |

**Key chính là email đã verify, không phải IP.** Cán bộ dùng chung Wi-Fi cơ quan, chung NAT, hoặc
CGNAT di động — IP-only sẽ khoá oan cả đơn vị vì một người.

IP chỉ là key **phụ**, dùng cho login attempt và như lớp chống lạm dụng thô.

**Bắt buộc:** chỉ dùng email làm limiter key **sau khi** đã verify. Request chưa xác thực không
được chọn key limiter bằng email tuỳ ý trong body (case O70) — nếu không, kẻ tấn công có thể ghi
đầy quota của một cán bộ cụ thể.

Không over-engineer: tái dùng cơ chế counter Firebase ETag/CAS đã có cho `/api/chat`.

---

## 20. Web API dự kiến

```text
POST /api/can-bo/auth/google     body { credential } → set session cookie
POST /api/can-bo/logout          xoá cookie

GET  /api/can-bo/me              → { email, authorizedUnits[] }
GET  /api/can-bo/locations       ?unitCode= → bản ghi của đơn vị được phép

POST /api/can-bo/confirm         { recordId }          → verification event
POST /api/can-bo/requests        { type, unitCode, recordId?, changes{}, image? } → staging
```

Route không bắt buộc đúng tên nếu implementation tìm được cấu trúc tốt hơn.

**Không tạo `/upload` riêng** — xem §21.

---

## 21. Upload ảnh

**Ưu tiên:**

```text
một business request = các trường + ảnh (tuỳ chọn), trong cùng một lượt
```

**Tránh:**

```text
POST /upload → nhận file id → POST /requests với file id
```

vì bước hai có thể không bao giờ xảy ra (người dùng đóng tab, mạng rớt) → file mồ côi trong Drive
mà không có dòng staging nào trỏ tới, và không có cách nào biết nó thuộc về ai.

**Thứ tự bắt buộc trong `submitRequest`:**

1. authenticate session;
2. authorize đơn vị (reauthorize theo allowlist hiện tại);
3. authorize bản ghi đích (`record.unit_code ∈ authorizedUnits`);
4. validate các trường;
5. validate ảnh (MIME, kích thước, đúng một ảnh);
6. upload ảnh vào Drive;
7. ghi dòng `Location_Staging`;
8. nếu bước 7 fail sau khi bước 6 đã tạo file → **cleanup file** khi khả thi (bọc try/catch, không
   để lỗi cleanup che lỗi gốc).

Ảnh chỉ được upload **sau khi** đã qua toàn bộ authorization — không upload rồi mới kiểm quyền.

Apps Script dùng `LockService` ở vùng ghi critical (đã có sẵn trong `onLocationFormSubmit` và
`reviewLocationRequest_`; gateway phải theo cùng mẫu).

---

## 22. Giới hạn ảnh phía client

| Mục | Giá trị |
| --- | --- |
| Loại chấp nhận | Chỉ ảnh — JPEG, PNG, WebP, HEIC, HEIF (khớp `IMAGE_MIME_TYPES` trong `setup/apps-script.js`) |
| Resize/compress ở browser | Bắt buộc, trước khi gửi |
| Cạnh dài mục tiêu | ~1600px |
| Dung lượng mục tiêu sau nén | ~≤1–2MB |
| Giới hạn tuyệt đối phía server | Riêng, chặt hơn giới hạn hạ tầng |

MIME phía server **không được tin phần mở rộng hay `Content-Type` do client khai** — PR #41 lấy MIME
từ `DriveApp.File.getMimeType()`, giữ nguyên nguyên tắc đó.

> **Implementation phase must verify current official Vercel body-size limits before choosing exact
> server maximum.** Không hardcode con số từ tài liệu kế hoạch này.

---

## 23. UI — 100% tiếng Việt

Portal **không** hiển thị enum kỹ thuật ở bất kỳ đâu. Bảng ánh xạ dưới đây phủ **toàn bộ** enum
hiện có trong code (`setup/location-intake/Code.gs` và `normalizeServices` trong
`setup/apps-script.js`).

### 23.1. `site_type`

| Enum | Nhãn tiếng Việt |
| --- | --- |
| `HEADQUARTERS` | Trụ sở Công an |
| `SECONDARY_OFFICE` | Điểm làm việc / Trụ sở phụ |
| `CITIZEN_ID_POINT` | Điểm cấp căn cước |
| `MOBILE_POINT` | Điểm lưu động |
| `PUBLIC_SERVICE_CENTER` | Điểm tiếp nhận thủ tục hành chính |
| `OTHER` | Khác |

### 23.2. `services`

| Enum | Nhãn tiếng Việt |
| --- | --- |
| `POLICE_OFFICE` | Trụ sở Công an |
| `CITIZEN_ID` | Cấp căn cước |
| `E_IDENTIFICATION` | Hỗ trợ VNeID / định danh điện tử |
| `RESIDENCE` | Cư trú |
| `VEHICLE_REGISTRATION` | Đăng ký xe |
| `DUTY` | Trực ban |
| `CRIME_REPORT` | Tiếp nhận tin báo, tố giác tội phạm |
| `OTHER` | Khác |

> `normalizeServices` cho phép giá trị tự do lọt qua (`toUpperCase().replace(/\s+/g,'_')`). Portal
> chỉ hiện checkbox 8 giá trị trên; giá trị lạ từ dữ liệu cũ hiện nguyên văn kèm nhãn "Dịch vụ
> khác", không làm vỡ giao diện.

### 23.3. `cccd_service_mode`

| Enum | Nhãn tiếng Việt |
| --- | --- |
| `NOT_PROVIDED` | Không tiếp nhận căn cước |
| `PERMANENT` | Tiếp nhận thường xuyên |
| `SCHEDULED` | Tiếp nhận theo lịch |
| `CAMPAIGN` | Tiếp nhận theo đợt cao điểm |
| `MOBILE` | Tiếp nhận lưu động |
| `TEMPORARILY_PAUSED` | Tạm dừng tiếp nhận |
| `UNKNOWN` | Chưa xác định |

**Không trộn enum:** `MOBILE` (cccd mode) và `MOBILE_POINT` (site type) là hai khái niệm khác nhau
và phải có nhãn khác nhau. `POLICE_OFFICE` (service) và `HEADQUARTERS` (site type) cùng dịch là
"Trụ sở Công an" nhưng nằm ở hai nhóm câu hỏi khác nhau — UI phải tách rõ hai nhóm.

---

## 24. Luồng giao diện

**Mobile-first.** Cán bộ dùng điện thoại tại hiện trường.

### Đăng nhập

```text
CẬP NHẬT THÔNG TIN ĐỊA ĐIỂM
Dành cho cán bộ Công an xã, phường

[ Tiếp tục bằng Google ]
```

### Sau đăng nhập

- 1 đơn vị → vào thẳng.
- Nhiều đơn vị → chọn một trong các đơn vị được cấp quyền.

### Danh sách địa điểm

Card dễ đọc: tên · địa chỉ · điện thoại · dịch vụ (nhãn tiếng Việt) · nút mở Google Maps · ảnh nếu có.

Mỗi card có ba hành động:

- `Thông tin chính xác`
- `Đề nghị chỉnh sửa`
- `Báo ngừng hoạt động`

Cuối danh sách: `+ Thêm địa điểm mới`

### Tuyệt đối không hiển thị

`record_id` · `unit_code` · trạng thái nội bộ (`PENDING`/`BLOCKED`/`NEED_VERIFICATION`) · enum tiếng
Anh · mã lỗi kỹ thuật (`TARGET_RECORD_UNIT_MISMATCH` → "Địa điểm này không thuộc đơn vị của bạn").

---

## 25. Admin

**KHÔNG xây admin Portal ở Phase 1.** Giữ nguyên luồng review/publish của PR #41 (menu Apps Script
trên spreadsheet).

Người dùng Portal **không** approve · **không** reject · **không** publish · **không** revoke bản
ghi công khai trực tiếp.

---

## 26. Google Form — đường dự phòng

Google Form được giữ lại tạm thời sau khi Portal chạy.

> **⚠ Dự phòng KHÔNG tức thời.** Form hiện tại được **sao chép** từ Form mẫu bằng Apps Script. Bản
> sao **mất liên kết thư mục lưu file upload**, và Google **tự tắt nhận phản hồi** kèm hộp thoại
> *"Thư mục Tải lên tệp bị thiếu"*. Chủ sở hữu phải mở Form editor và bấm **Phục hồi / Restore**
> trước khi Form nhận phản hồi trở lại.
>
> Đây **không phải** automatic rollback. Nếu Portal hỏng lúc 22h, Form không tự nhận việc — phải có
> người có quyền sở hữu Form thao tác tay. Kế hoạch vận hành phải tính thời gian đó.

Xem `SETUP.md` bước 8.

---

## 27. Điều kiện chặn production

Phải xử lý xong trước khi Portal chạy với dữ liệu thật:

1. **`Unit_Allowlist` phải được chuyển sang bảng tính riêng tư trước khi điền email cán bộ thật.**
2. `Location_Staging` và `Approval_Audit_Log` chứa `submitter_email`/`submitter_phone` → cũng phải
   nằm phía riêng tư (§2).
3. `GOOGLE_CLIENT_ID`, `STAFF_SESSION_SECRET`, `LOCATION_GATEWAY_SECRET`, `STAFF_SPREADSHEET_ID`
   phải được cấu hình; không secret nào tới browser (`GOOGLE_CLIENT_ID` là public theo thiết kế của
   Google Identity Services — đây là ngoại lệ duy nhất và nó không phải secret).
4. Gateway Apps Script phải được deploy và verify HMAC trước khi Vercel route trỏ tới nó.
