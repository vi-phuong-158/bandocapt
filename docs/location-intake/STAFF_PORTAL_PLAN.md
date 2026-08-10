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

**Thiết kế mới — hai workbook độc lập:**

| | Bảng tính CÔNG KHAI | Bảng tính RIÊNG TƯ (staff) |
| --- | --- | --- |
| Sheet | `Published_Locations` và chỉ sheet thật sự công khai | `Unit_Allowlist`, `Location_Staging`, `Approval_Audit_Log`, `Staff_Verification_Audit`, `Idempotency_Ledger`, `Intake_Setup_Info`, các sheet Form Responses |
| Chia sẻ | "Anyone with link" — bắt buộc, để GViz đọc được | **KHÔNG** publish to web, **KHÔNG** anyone-with-link |
| ID xuất hiện ở | `PUBLIC_LOCATION_SPREADSHEET_ID`/`GOOGLE_SHEET_ID` (server env) | **CHỈ** Apps Script Script Properties (`PRIVATE_LOCATION_SPREADSHEET_ID`) |
| Frontend thấy ID? | Không cần thiết, nhưng không phải bí mật | **Tuyệt đối không** |
| Ai đọc được | Bất kỳ ai | Chỉ Apps Script/backend trusted |

Private workbook là nơi chứa **toàn bộ operational data và operator PII**: email/phone người gửi,
notes nội bộ, audit, trạng thái staging, Form response và định danh file Drive. ID private không tới
browser và chỉ Apps Script/backend trusted được đọc.

Config bắt buộc:

```text
PRIVATE_LOCATION_SPREADSHEET_ID  # Apps Script private runtime
PUBLIC_LOCATION_SPREADSHEET_ID   # Published_Locations/public read
GOOGLE_SHEET_ID                  # alias server-side, luôn trỏ public workbook
```

Không dùng public workbook ID để suy ra private workbook.

**Khoảng cách với code hiện tại:** PR #41 runtime Apps Script còn dùng một
`LOCATION_SPREADSHEET_ID` và `setup/location-intake/Code.gs` đọc/ghi state trong cùng workbook.
Đây là nền Google Form hiện tại, không phải thiết kế Portal cuối. Implementation/migration phải
đổi sang hai config ở trên và tách approval write trước khi dùng dữ liệu staff thật.

| Boundary | Cho phép |
| --- | --- |
| Private read/write | `Unit_Allowlist`, `Location_Staging`, `Approval_Audit_Log`, `Staff_Verification_Audit`, `Idempotency_Ledger`, `Intake_Setup_Info`, Form Responses |
| Public write | Chỉ `Published_Locations`, chỉ qua admin approval/revoke lifecycle |
| Public read | `Published_Locations` qua `/api/google-sheet`, `lib/published-locations.js`, GViz, map và chatbot |

Staff Portal không direct-write public workbook. Không đưa email/phone cán bộ, audit, staging, notes
nội bộ hoặc image file IDs sang public workbook.

---

## 3. Kế hoạch migration toàn bộ operational data — KHÔNG THỰC HIỆN TRONG TASK NÀY

Chỉ viết kế hoạch. Không chạy trên production. Có thể tạo fixture/test data local.

1. **Inventory** — ghi row count, request IDs, record IDs, normalized email count, trạng thái,
   audit count, image file IDs, active/inactive units, Form destination và trigger configuration cho
   `Unit_Allowlist`, `Location_Staging`, `Approval_Audit_Log`, `Intake_Setup_Info` và Form Responses.
2. **Prepare** — tạo private workbook với toàn bộ sheet trên và thêm `Staff_Verification_Audit`;
   tạo private Form response destination. Không nhập email thật nếu permission chưa được kiểm tra.
3. **Copy** — copy dữ liệu private operational nguyên trạng; không xoá source.
4. **Validate** — đối chiếu row counts, request/record IDs, email/status/audit/image counts và
   xác nhận `active=false` không bị nuốt thành active.
5. **Configure dual workbook** — đặt `PRIVATE_LOCATION_SPREADSHEET_ID` và
   `PUBLIC_LOCATION_SPREADSHEET_ID`; giữ `GOOGLE_SHEET_ID` trỏ public. Switch Apps Script chỉ sau
   khi validation pass.
6. **Smoke** — resolveUnits, Form submit, Portal-style submitRequest, staging private, admin
   approve, public Published write, private audit, GViz read, stop/revoke, image sharing,
   confirm event và idempotent retry.
7. **Permission/cleanup** — kiểm tra unauthenticated access: public đúng chủ đích, private không
   public/anyone-with-link/publish-to-web. Chỉ sau smoke + privacy pass mới cô lập/xoá private sheets
   khỏi workbook cũ. Rollback trước cleanup là config switch; sau cleanup phải dùng backup/export.

**Không** chạy bước 1–7 trên production trong phiên này.

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

Nó dựng trên `buildAllowlistMap` — cùng bộ lọc `active`, cùng cách bỏ dòng thiếu `unit_name` và
cùng semantics duplicate hiện hành — để hai chiều không thể lệch nhau. Nếu duyệt `rows` riêng,
Portal có thể chào một đơn vị mà `buildStagingRecord` sau đó lại từ chối.

### 4.2. Luật bắt buộc của `resolveUnitsByEmail`

| Luật | Thực thi |
| --- | --- |
| Normalize email (trim + lowercase) | `normalizeEmail` |
| Bỏ qua đơn vị `active=FALSE` | `buildAllowlistMap` |
| Bỏ qua đơn vị không cấu hình email | `allowedEmails.includes()` trên mảng rỗng luôn false |
| Một email ở nhiều đơn vị → trả đủ | trả mảng |
| Deduplicate đơn vị trả về | `Set` theo `unitCode` đã lowercase |
| Fail closed | email rỗng/không khớp → `[]`, không bao giờ ném để "mở" |
| Không trả internal notes | chỉ `unitCode`, `unitName` |
| Không trả toàn bộ allowlist | chỉ đơn vị khớp email |

Ca kiểm thử: B08–B14 trong test matrix; B08–B13 đã pass trong `test/location-pipeline.test.js`.

### 4.3. Duplicate allowlist — health gate bắt buộc trước Portal

`buildAllowlistMap()` đang dùng `Map.set()`. Vì vậy **code prerequisite hiện tại là last-row-wins**
khi có hai dòng cùng `normalizeLabel(unit_name)`; nó không thật sự merge các dòng. Đây là hành vi
đã được B12 xác nhận để giữ `resolveUnitsByEmail` và `authorizeSubmission` cùng nguồn sự thật,
không phải một quy tắc dữ liệu được phép dùng trong production.

Trước khi bật Portal, health check/migration validator phải nhóm toàn bộ rows theo normalized
`unit_name` và:

- báo **error, chặn rollout** nếu duplicate khác `unit_code`, `active`, hoặc tập
  `allowed_emails` sau normalize;
- báo warning để dọn dữ liệu nếu duplicate hoàn toàn tương đương;
- không âm thầm phụ thuộc thứ tự row để quyết định quyền.

Cho đến khi health gate pass, không được nạp allowlist cán bộ thật. B14 là acceptance test cho
duplicate xung đột; implementation có thể thay helper sau health gate nhưng phải giữ hai chiều
authorization/resolve có cùng semantics.

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

- Cookie: `HttpOnly` · `Secure` (production) · `SameSite=Lax` · `Max-Age` = **8 giờ** (đã chốt: một
  ca làm việc, giới hạn cửa sổ giá trị của session bị đánh cắp). Quan trọng hơn con số này là
  reauthorize allowlist trước mỗi thao tác ghi (§6.1) — kể cả trong 8 giờ đó, quyền vẫn được kiểm lại.
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

**Đã chốt:** ghi vào sheet riêng `Staff_Verification_Audit` trong private workbook, không ghi
staff confirmation vào `Approval_Audit_Log`.

Schema tối thiểu:

```text
verification_id, request_id, record_id, unit_code, staff_email, verified_at,
snapshot_hash, source, note
```

`source` luôn là `STAFF_PORTAL`. `request_id` do Vercel derive từ identity/action/`operationId` và
là idempotency key cho confirm.

`snapshot_hash` là SHA-256 của canonical JSON với property order cố định trên các public content
fields: `record_id`, `unit_code`, `name`, `site_type`, `services`, `address`, `phone`,
`coordinates`, `google_maps_url`, `cccd_service_mode`, `service_schedule`, `served_units`,
`image_url`, `updated_at`. Không hash object chưa sort hoặc JSON stringify không deterministic.

Browser gửi `recordId + snapshotHash + operationId`; server đọc record hiện tại và tính lại hash. Hash lệch →
reject `STALE_RECORD`, không ghi success, UI báo: **"Thông tin vừa được cập nhật. Vui lòng kiểm
tra lại trước khi xác nhận."** Authorization cross-unit vẫn chạy trước stale check.

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

**Transport bắt buộc:** không dùng custom header. Request là:

```text
POST <APPS_SCRIPT_WEB_APP_URL>?action=submitRequest&timestamp=<unix_seconds>&signature=<hex>
```

Apps Script đọc `e.parameter.action`, `e.parameter.timestamp`, `e.parameter.signature` và raw
`e.postData.contents`. `requestId` do Vercel **derive** và nằm trong signed JSON body; frontend
không tự chọn identity, quyền, hoặc `requestId`.

**Canonical data:**

```text
POST\naction\ntimestamp\nsha256Hex(rawBody)
```

**Signature:** `HMAC-SHA256(canonical, LOCATION_GATEWAY_SECRET)`, hex.

**Apps Script phải:**

- verify chữ ký bằng `Utilities.computeHmacSha256Signature`, so sánh **toàn bộ chuỗi** (không so
  prefix);
- reject chữ ký sai định dạng (không phải 64 hex) trước khi tính toán;
- reject timestamp lệch quá **±5 phút**;
- **fail closed** — thiếu chữ ký, thiếu timestamp, body không parse được, secret chưa cấu hình →
  từ chối, không phải "cho qua";
- **không log secret**, không log toàn bộ body chứa email vào Stackdriver;
- **không** nhận secret từ frontend dưới bất kỳ hình thức nào.

Timestamp window ±5 phút là freshness check, **không phải replay protection hoàn chỉnh**. Phase 1
bắt buộc idempotency business xuyên qua HTTP retry:

- Browser sinh UUID `operationId` **một lần cho mỗi thao tác người dùng**, giữ nguyên ID đó khi
  browser retry sau timeout; `operationId` không mang quyền và không được dùng để xác thực người dùng.
- Vercel lấy `session.email` đã verify và `action`, validate định dạng UUID, rồi derive deterministic
  opaque `requestId = base64url(HMAC-SHA-256("staff-request-id\\n" + session.email + "\\n" + action +
  "\\n" + operationId, STAFF_SESSION_SECRET))`. Browser không gửi hoặc chọn `requestId`.
- Vercel gửi `requestId` trong body đã ký. Cùng `session.email + action + operationId` phải luôn ra
  cùng `requestId`, kể cả khi lần gọi Apps Script trước đã thành công nhưng response về browser/Vercel
  bị timeout.
- Apps Script idempotent theo `action + requestId`: trả kết quả hiện tại hoặc `ALREADY_PROCESSED`,
  không upload/ghi staging/ghi verification lần hai. Cùng key nhưng payload hash khác → reject
  `IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD`.

### 17.1. Atomic claim TRƯỚC side-effect — chống race, không chỉ chống replay

Idempotency theo `requestId` ở trên **chống replay tuần tự** (request thứ hai thấy request thứ nhất
đã xong). Nó **chưa đủ** để chống race đồng thời:

```text
request A: check "requestId đã xử lý?" → chưa
request B: check "requestId đã xử lý?" → chưa   (A chưa kịp ghi dấu)
request A: upload ảnh + append staging
request B: upload ảnh + append staging          ← hai file Drive, hai dòng staging
```

Deterministic `requestId` một mình không chặn được ca này vì cả hai request đọc trạng thái "chưa xử
lý" trước khi bên nào ghi. Bắt buộc **atomic claim trước side-effect**:

- Toàn bộ critical section — *kiểm tra idempotency → claim → side-effect (upload + append) →
  finalize* — phải nằm trong **cùng một `LockService` script lock** (`waitLock(30000)`), giống
  `onLocationFormSubmit` hiện có. Không release lock giữa claim và side-effect.
- Trong lock, thứ tự bắt buộc: **claim trước, side-effect sau**. Ghi một dòng ledger idempotency
  (sheet `Idempotency_Ledger`) trạng thái `CLAIMED` cho `action + requestId` **trước khi** upload
  Drive hoặc append staging. Claim luôn phải chứa `body_hash` và `image_resource_key` deterministic
  (`staff-request-<requestId>` trong private Drive folder), nên crash sau claim không để lại một
  side-effect không thể truy vết.
- Request đồng thời B block ở `waitLock`; khi vào được lock, nó đọc ledger thấy `DONE` (hoặc
  trạng thái recoverable của một attempt đã chết → reconcile idempotently theo §17.2) và trả
  `ALREADY_PROCESSED`, **không** upload/append lần hai.
- `LockService` là mutex, **không phải transaction**: recovery không được giả định process luôn chạy
  tới finalize. Sau upload phải persist `image_file_id` và trạng thái `UPLOAD_PERSISTED` **vẫn trong
  lock, trước** khi append staging; sau append phải persist `staging_ref`/`record_id` và
  `STAGING_PERSISTED`, rồi mới `DONE`.
- **Cùng `requestId` nhưng body hash khác** (`operationId` bị tái sử dụng cho payload khác) → reject
  `IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD`, không ghi đè claim cũ.

### 17.2. Crash recovery Drive ↔ ledger ↔ staging

`Idempotency_Ledger` là private sheet, có tối thiểu:

```text
action, request_id, body_hash, status, image_resource_key, image_file_id,
staging_ref, record_id, last_error, updated_at
```

Lifecycle của request có ảnh là `CLAIMED → UPLOAD_PERSISTED → STAGING_PERSISTED → DONE`.
`CLAIMED` luôn có `image_resource_key`, còn mọi trạng thái sau upload luôn có `image_file_id`; không
release lock với trạng thái mơ hồ về side-effect.

Recovery cùng `action + requestId`, luôn giữ cùng script lock:

1. Nếu có `staging_ref` hoặc tìm thấy một staging row cùng `request_id`, persist con trỏ còn thiếu rồi
   finalize `DONE`; không append thêm row.
2. Nếu ledger có `image_file_id`, verify file còn tồn tại rồi reuse nó. Nếu chưa có pointer, tìm trong
   private upload folder đúng filename/resource key deterministic `staff-request-<requestId>`.
   - Một file: persist `image_file_id` + `UPLOAD_PERSISTED`, rồi tiếp tục append staging.
   - Không có file: upload đúng một file với resource key đó, **ngay lập tức persist** file ID +
     `UPLOAD_PERSISTED` trước bất kỳ append nào.
   - Nhiều file: fail closed `IDEMPOTENCY_RESOURCE_AMBIGUOUS`, không upload mới; dọn/reconcile thủ
     công hoặc theo job vận hành có lock.
3. Nếu append staging lỗi sau upload, trong **cùng lock** ghi `last_error`, chuyển ledger sang
   `CLEANUP_PENDING`, rồi thử cleanup file. Cleanup thành công → `FAILED_CLEANED`; cleanup thất bại →
   `RESOURCE_RETAINED` và giữ nguyên `image_file_id`. Chỉ sau update ledger + cleanup attempt mới
   release lock.
4. Retry từ `RESOURCE_RETAINED` reuse pointer để append staging, không upload file mới. Retry từ
   `FAILED_CLEANED` có thể tạo lại đúng resource key sau khi xác minh file cũ đã mất. Cả hai nhánh
   vẫn chỉ tạo tối đa một staging row.

Vì vậy crash đúng sau `DriveApp` upload nhưng trước lần ghi ledger tiếp theo vẫn recover được qua
resource key deterministic; cleanup của attempt A không thể xóa file mà attempt B đang reuse vì B
không vào critical section trước khi A hoàn tất cleanup/ledger update.

Approval và reconciliation dùng `request_id + target_record_id + request_type` để biết operation đã
hoàn tất tới bước nào. Nonce trong `CacheService` chỉ là defense-in-depth optional, không thay thế
business idempotency.

---

## 18. CSRF / Origin

Mọi POST state-changing tới `/api/can-bo/*` phải validate `Origin` bằng `isAllowedOrigin` trong
`lib/request-security.js` (**tái dùng, không viết stack bảo mật trùng lặp**); cookie `SameSite=Lax`
là lớp phòng thủ thứ hai, không phải lớp duy nhất.

Mọi endpoint protected phải yêu cầu session cán bộ hợp lệ, **ngoại trừ**
`POST /api/can-bo/auth/google`: endpoint này tạo session đầu tiên nên không thể đòi session có sẵn.
Nó bắt buộc verify Google credential theo §5, validate `Origin`, và IP rate-limit theo §19. Các
POST protected khác (`/logout`, `/confirm`, `/requests`) phải có session trước khi xử lý.

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
POST /api/can-bo/auth/google     body { credential } → verify credential + Origin + IP rate-limit → set session cookie
POST /api/can-bo/logout          xoá cookie

GET  /api/can-bo/me              → { email, authorizedUnits[] }
GET  /api/can-bo/locations       ?unitCode= → bản ghi của đơn vị được phép

POST /api/can-bo/confirm         { recordId, snapshotHash, operationId } → verification event
POST /api/can-bo/requests        { type, unitCode, recordId?, changes{}, image?, operationId } → staging
```

`operationId` phải là UUID được browser giữ ổn định cho đúng thao tác/retry (§17). `snapshotHash`
là bắt buộc cho `confirm`; thiếu hash phải reject, không được suy đoán từ record hiện tại.

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

**Thứ tự bắt buộc trong `submitRequest`** (các bước từ 6 trở đi nằm **trong cùng một `LockService`
lock**, xem §17.1):

1. authenticate session;
2. authorize đơn vị (reauthorize theo allowlist hiện tại);
3. authorize bản ghi đích (`record.unit_code ∈ authorizedUnits`);
4. validate các trường;
5. validate ảnh (MIME, kích thước, đúng một ảnh);
6. **acquire lock** (`waitLock(30000)`);
7. **atomic claim/recovery**: đọc ledger theo `action + requestId`. `DONE` → trả kết quả cũ
   (`ALREADY_PROCESSED`), thoát; trạng thái recoverable → reconcile theo §17.2; chưa có → ghi
   `CLAIMED` với body hash + deterministic `image_resource_key`. Body hash khác cùng key → reject
   `IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD`;
8. lookup/reuse file theo ledger/resource key, hoặc upload ảnh vào Drive đúng một lần;
9. **persist ngay** `image_file_id` + `UPLOAD_PERSISTED` vào ledger;
10. ghi dòng `Location_Staging`, rồi persist `staging_ref`/`record_id` + `STAGING_PERSISTED`;
11. finalize ledger sang `DONE`;
12. nếu bước 10 fail sau upload: ghi `CLEANUP_PENDING`, cleanup và update `FAILED_CLEANED` hoặc
    `RESOURCE_RETAINED` **trong lock**; không release lock trước khi trạng thái resource xác định;
13. **release lock**.

Claim (bước 7) phải xảy ra **trước** mọi side-effect (bước 8–9) và trong cùng lock — đây là điểm
chống race, không chỉ chống replay tuần tự. Ảnh chỉ được upload **sau khi** đã qua toàn bộ
authorization và đã claim — không upload rồi mới kiểm quyền hoặc mới claim.

Mẫu `LockService` đã có sẵn trong `onLocationFormSubmit` và `reviewLocationRequest_`; gateway phải
theo cùng mẫu (bao cả critical section, không chỉ dòng append).

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
3. `GOOGLE_CLIENT_ID`, `STAFF_SESSION_SECRET`, `LOCATION_GATEWAY_SECRET`,
   `PRIVATE_LOCATION_SPREADSHEET_ID`, `PUBLIC_LOCATION_SPREADSHEET_ID`
   phải được cấu hình; không secret nào tới browser (`GOOGLE_CLIENT_ID` là public theo thiết kế của
   Google Identity Services — đây là ngoại lệ duy nhất và nó không phải secret).
4. Gateway Apps Script phải được deploy và verify HMAC trước khi Vercel route trỏ tới nó.
5. **Mọi cutover đổi nguồn `Published_Locations` phải đi qua candidate deployment trước alias
   promotion.** Candidate phải dùng đúng cấu hình public workbook dự kiến, chạy
   `npm run verify:published-locations -- --url <candidate-url>` và chỉ được promote alias khi
   verifier pass HTTP 200, semantic schema `name` + `coordinates`, row count khác 0 và có ít nhất
   một tọa độ hợp lệ. Không được đổi workbook nguồn chỉ vì endpoint còn trả 200; mismatch phải
   fail closed (`GOOGLE_SHEET_SCHEMA_MISMATCH`). Gate này áp dụng độc lập với Portal và không cho
   phép thay production env/deploy trong PR kế hoạch.

---

## 28. Approval giữa hai workbook — failure model và recovery

Sau khi tách workbook, approval không còn là transaction nguyên tử. Luồng chuẩn là:

```text
PRIVATE Location_Staging=PENDING
  → admin approve + revalidate
  → PUBLIC Published_Locations write
  → PRIVATE staging=APPROVED + Approval_Audit_Log append
```

`LockService` vẫn bắt buộc bao quanh critical section của Apps Script để chống concurrency trong
một runtime, nhưng **không** biến hai workbook thành cross-workbook transaction thật.

Các trạng thái một phần phải được coi là recoverable:

| Tình huống | Recovery |
| --- | --- |
| Public write thành công, private status/audit thất bại | retry private finalize theo cùng `request_id`; không publish lại |
| Private state có nhưng public write thất bại | retry public write đúng một lần rồi finalize private |
| Cả hai thành công nhưng client timeout | đọc state theo `request_id`, trả kết quả hiện tại |

`request_id + target_record_id + request_type` là khóa reconciliation. Thiết kế recovery path chính
thức là `reconcileLocationRequest(request_id)`: đọc staging private, public record và private audit,
xác định bước đã hoàn tất, rồi chỉ hoàn tất phần còn thiếu idempotently. Không thực hiện business
mutation lần hai.

### 28.1. Idempotency theo business request

- Mỗi state-changing request có `request_id` do Vercel derive từ verified session email, action và
  browser `operationId`; browser retry phải reuse cùng `operationId`.
- `submitRequest` retry sau client/Vercel timeout với cùng operation không upload ảnh lần hai và
  không thêm staging row lần hai.
- `confirm` retry với cùng operation không thêm `Staff_Verification_Audit` event lần hai.
- Approval/reconciliation retry cùng ID không duplicate `Published_Locations` hoặc tạo record mới.
- `create` vẫn giữ invariant PR #41: không có `target_record_id`, `record_id` do server sinh.

---

## 29. E2E runner — quyết định vận hành

Root cause đã xác định: `playwright.config.js` dùng `webServer: npm run preview`; trên Windows,
Playwright phải terminate npm child process sau test, bị treo tại `Terminating the WebServer` dù
19/19 test đã pass.

Fix nhỏ, không che leak bằng `--forceExit` hay `process.exit(0)`:

- `scripts/preview-server.js` export `startPreviewServer`/`stopPreviewServer`, đóng keep-alive
  connections và hỗ trợ shutdown tự nhiên.
- `test/e2e/global-setup.js` start server trong Playwright global setup và teardown cùng process.
- `playwright.config.js` bỏ nested `webServer` process.
- `playwright.config.js` pin `workers: 1`: trên Windows, teardown nhiều browser context song song có
  thể timeout dù assertions đã chạy. Runner phải serial cho tới khi multi-worker teardown được chứng
  minh ổn định; không dùng `--forceExit` hay `process.exit(0)` để che lifecycle lỗi.

Evidence: một test pass và `npm.cmd run test:e2e` pass **19/19**, exit code 0 sau fix.

---

## 30. Trạng thái kế hoạch sau Gate finalization

Đây vẫn là planning/security prerequisite branch. Chưa có `/can-bo`, Google Sign-In runtime,
`/api/can-bo/*`, HMAC gateway runtime, workbook migration, real staff email hay production deploy.

Production chỉ được mở sau khi private/public workbook boundary, dual-workbook smoke/reconciliation,
OAuth/session/gateway implementation và toàn bộ acceptance matrix được review và approve.
