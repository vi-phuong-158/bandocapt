# Staff Location Portal — ma trận kiểm thử, threat model, invariant

> Đi kèm [`STAFF_PORTAL_PLAN.md`](STAFF_PORTAL_PLAN.md). **Portal chưa được code.** Đây là hợp đồng
> chấp nhận: implementation chỉ được coi là xong khi **91 ca** dưới đây pass.
>
> **Trạng thái hôm nay:** 9 test prerequisite mới (B08–B13 + 3 ca hỗ trợ) đã có trong
> `test/location-pipeline.test.js`; 11 control đã có từ PR #41 được kế thừa: E24–E27, J44–J46,
> K50–K51, L53, P73. 71 ca Portal còn lại là ĐẶC TẢ chờ implementation. Tổng = 9 + 11 + 71 = 91.
> Trước nghiệm thu, implementation PR phải link 11 control kế thừa tới test cụ thể thay vì chỉ
> tuyên bố coverage.

Cột **Lớp** cho biết ca chạy ở đâu: `pure` (unit test module thuần) · `vercel` (Vercel route) ·
`gas` (Apps Script gateway/pipeline) · `e2e` (Playwright).

---

## A. Xác thực Google (7 ca)

| ID | Ca | Kỳ vọng | Lớp |
| --- | --- | --- | --- |
| A01 | ID token hợp lệ | Pass, tạo session | vercel |
| A02 | Chữ ký sai | Reject 401 | vercel |
| A03 | `aud` ≠ `GOOGLE_CLIENT_ID` | Reject 401 | vercel |
| A04 | `iss` không thuộc issuer Google | Reject 401 | vercel |
| A05 | Token hết hạn (`exp` quá khứ) | Reject 401 | vercel |
| A06 | `email_verified === false` | Reject 401 | vercel |
| A07 | Token thiếu claim `email` | Reject 401 | vercel |

> A02–A07 phải fail **trước khi** chạm allowlist. Không được decode-then-trust.

---

## B. Allowlist (8 ca; B08–B13 đã có test)

| ID | Ca | Kỳ vọng | Lớp | Trạng thái |
| --- | --- | --- | --- | --- |
| B08 | Email không có trong allowlist | `[]`, từ chối đăng nhập | pure | ✅ pass |
| B09 | Email thuộc đơn vị `active=FALSE` | Đơn vị đó không được trả | pure | ✅ pass |
| B09b | Đơn vị active nhưng `allowed_emails` rỗng | Không bao giờ được trả | pure | ✅ pass |
| B10 | Email thuộc đúng 1 đơn vị active | Trả đúng 1 đơn vị | pure | ✅ pass |
| B11 | Email thuộc nhiều đơn vị active | Trả đủ các đơn vị đúng | pure | ✅ pass |
| B12 | Dòng trùng lặp tương đương | Trả 1 đơn vị; current helper last-row-wins nhưng hai chiều không lệch | pure | ✅ pass |
| B13 | Email khác hoa thường / có khoảng trắng thừa | Normalize đúng, vẫn khớp | pure | ✅ pass |
| B14 | Dòng trùng `unit_name` nhưng khác `unit_code`/`active`/email | Health check báo error, chặn rollout; không phụ thuộc thứ tự row | gas/pure |

Ca hỗ trợ đã có thêm: không rò `allowed_emails`/`notes` ra ngoài; tập đơn vị trả ra khớp đúng tập mà
`authorizeSubmission` chấp nhận (chống lệch hai chiều).

---

## C. Session (5 ca)

| ID | Ca | Kỳ vọng | Lớp |
| --- | --- | --- | --- |
| C14 | Session hợp lệ, còn hạn | Pass | vercel |
| C15 | Session hết hạn | Reject 401 | vercel |
| C16 | Session bị sửa payload (chữ ký không khớp) | Reject 401 | vercel |
| C17 | Email bị gỡ khỏi allowlist **sau khi** đăng nhập | Thao tác ghi bị từ chối | vercel |
| C18 | Đơn vị bị `active=FALSE` **sau khi** đăng nhập | Thao tác ghi bị từ chối | vercel |

> C17/C18 là lý do `unitCodes` trong session không phải quyền vĩnh viễn (PLAN §6.1). Chúng phải fail
> **dù cookie còn hạn và chữ ký hợp lệ**.

---

## D. Phân quyền đơn vị (3 ca)

| ID | Ca | Kỳ vọng | Lớp |
| --- | --- | --- | --- |
| D19 | Người dùng yêu cầu đơn vị mình được phép | Pass | vercel |
| D20 | Người dùng gửi `unitCode` không được phép | Reject 403 | vercel |
| D21 | Frontend sửa `unit_code` trong payload | Không leo thang quyền; server dùng tập từ allowlist | vercel |

---

## E. Phân quyền bản ghi (6 ca)

| ID | Ca | Kỳ vọng | Lớp |
| --- | --- | --- | --- |
| E22 | Target thuộc đơn vị mình | Pass | vercel |
| E23 | Target thuộc đơn vị khác | Reject ở **Vercel** | vercel |
| E24 | Target thuộc đơn vị khác, gọi thẳng gateway/pipeline | Reject `TARGET_RECORD_UNIT_MISMATCH` ở **pipeline** | gas/pure |
| E25 | Thiếu target ở request cần target (`update`/`correct`/`stop`/`confirm`) | Reject `TARGET_RECORD_ID_REQUIRED` | pure |
| E26 | `create` kèm `target_record_id` | Reject `CREATE_TARGET_RECORD_ID_NOT_ALLOWED` | pure |
| E27 | `create` | `record_id` do server sinh (`buildRecordId`) | pure |

> E23 và E24 phải pass **độc lập**. Xoá guard Vercel mà E24 vẫn pass là đúng thiết kế
> defense-in-depth; xoá guard pipeline mà E24 vẫn pass là **hồi quy PR #41**.

---

## F. Danh tính người thực hiện (1 ca)

| ID | Ca | Kỳ vọng | Lớp |
| --- | --- | --- | --- |
| F28 | Request body chứa `submitter_email` của người khác | Bị bỏ qua/từ chối; audit ghi email từ **session** | vercel |

---

## G. Đọc dữ liệu published (3 ca)

| ID | Ca | Kỳ vọng | Lớp |
| --- | --- | --- | --- |
| G29 | Người dùng chỉ có đơn vị A | Chỉ nhận bản ghi của A | vercel |
| G30 | Người dùng nhiều đơn vị | Chỉ nhận bản ghi của các đơn vị được phép | vercel |
| G31 | Toàn bộ dataset không rò xuống browser | Response không chứa bản ghi ngoài phạm vi | e2e |

---

## H. Confirm (4 ca)

| ID | Ca | Kỳ vọng | Lớp |
| --- | --- | --- | --- |
| H32 | Confirm target hợp lệ | Ghi verification/audit event | gas |
| H33 | Confirm không đổi nội dung công khai | `Published_Locations` byte-identical trước/sau | gas |
| H34 | Confirm không vào hàng đợi duyệt nội dung | Không sinh dòng `PENDING` cần admin xử lý | gas |
| H35 | Confirm bản ghi của đơn vị khác | Reject | vercel + gas |

---

## I. Merge khi update (7 ca)

Kịch bản chung: bản ghi published đầy đủ, cán bộ chỉ gửi thay đổi `public_phone`.

| ID | Ca | Kỳ vọng | Lớp |
| --- | --- | --- | --- |
| I36 | Chỉ đổi số điện thoại | `address` giữ nguyên | vercel |
| I37 | ⇢ | `coordinates` giữ nguyên | vercel |
| I38 | ⇢ | `services` giữ nguyên | vercel |
| I39 | ⇢ | `google_maps_url` giữ nguyên | vercel |
| I40 | ⇢ | ảnh giữ nguyên | vercel |
| I41 | Xoá tường minh một trường được phép rỗng | Theo đúng semantics đã ghi (PLAN §14.2) | vercel |
| I42 | Trường vắng mặt trong payload | **Không** bị xoá | vercel |

> I42 là ca dễ hỏng nhất. Nếu backend coi key vắng mặt là `""`, một PATCH chỉ có `phone` sẽ xoá sạch
> địa chỉ và toạ độ, rồi `buildStagingRecord` trả `ADDRESS_MISSING` — triệu chứng hiện ra rất xa
> nguyên nhân.

---

## J. Create (5 ca)

| ID | Ca | Kỳ vọng | Lớp |
| --- | --- | --- | --- |
| J43 | Create hợp lệ | Vào `Location_Staging`, status `PENDING` | gas |
| J44 | Create không có ảnh | Reject `IMAGE_REQUIRED` | pure |
| J45 | Create | `record_id` mới do server sinh | pure |
| J46 | Hai create cùng đơn vị | Hai `record_id` phân biệt | pure |
| J47 | Trước khi duyệt | `Published_Locations` không đổi | gas |

---

## K. Stop (4 ca)

| ID | Ca | Kỳ vọng | Lớp |
| --- | --- | --- | --- |
| K48 | Báo ngừng hoạt động | Vào staging, không xoá ngay | gas |
| K49 | Trước khi duyệt | `Published_Locations` không đổi | gas |
| K50 | Sau khi admin duyệt | Bản ghi bị xoá khỏi `Published_Locations` | pure |
| K51 | Sau khi duyệt | `Approval_Audit_Log` giữ snapshot bản ghi đã xoá | pure |

---

## L. Ảnh (6 ca)

| ID | Ca | Kỳ vọng | Lớp |
| --- | --- | --- | --- |
| L52 | Ảnh hợp lệ | Chấp nhận | gas |
| L53 | MIME không hợp lệ | Reject `IMAGE_MIME_NOT_ALLOWED` | pure |
| L54 | Ảnh vượt giới hạn | Reject | vercel |
| L55 | Update không kèm ảnh mới | Giữ ảnh cũ, **không** đòi upload lại | vercel |
| L56 | Update kèm ảnh mới | Ảnh mới thay ảnh đề xuất | vercel |
| L57 | Ghi staging fail **sau khi** đã upload | Cleanup file Drive nếu đã tạo | gas |

> L54: MIME phải lấy từ `DriveApp.File.getMimeType()`, không tin `Content-Type` client khai.

---

## M. Gateway HMAC và idempotency (12 ca)

| ID | Ca | Kỳ vọng | Lớp |
| --- | --- | --- | --- |
| M58 | Chữ ký hợp lệ | Pass | gas |
| M59 | Chữ ký sai | Reject | gas |
| M60 | Body bị sửa sau khi ký | Reject (hash body nằm trong canonical data) | gas |
| M61 | Timestamp quá cũ (> 5 phút) | Reject | gas |
| M62 | Timestamp tương lai ngoài cửa sổ | Reject | gas |
| M63 | Thiếu hoàn toàn chữ ký | Reject (fail closed) | gas |
| M83 | Replay `submitRequest` cùng `requestId` (tuần tự) | Không thêm staging row thứ hai | gas |
| M84 | Replay `submitRequest` có ảnh cùng `requestId` (tuần tự) | Không upload Drive file thứ hai | gas |
| M85 | Replay confirmation cùng `requestId` (tuần tự) | Không thêm verification event thứ hai | gas |
| M86 | Gateway đã success nhưng response về Vercel/browser timeout; browser retry cùng `operationId` | Vercel derive cùng `requestId`; chỉ có một staging row và một Drive file | vercel + gas |
| M87 | **Hai `submitRequest` ĐỒNG THỜI** cùng `requestId`/`operationId` (race, không phải replay tuần tự) | Đúng một request thực hiện side-effect: **một** Drive file, **một** staging row; request kia trả `ALREADY_PROCESSED`. Claim atomic trước side-effect trong cùng `LockService` lock (PLAN §17.1) | gas |
| M88 | Cùng idempotency key (`requestId`) nhưng **payload khác** (body hash khác) | Reject `IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD`; không ghi đè claim cũ, không side-effect | gas |

---

## N. CSRF / Origin (4 ca)

| ID | Ca | Kỳ vọng | Lớp |
| --- | --- | --- | --- |
| N64 | Origin được phép | Pass | vercel |
| N65 | POST state-changing từ Origin lạ | Reject | vercel |
| N66 | POST thiếu `Origin` | Theo đúng chính sách đã ghi (đề xuất: reject) và **có test** | vercel |
| N67 | `POST /auth/google` không có session nhưng credential + Origin hợp lệ | Verify credential, IP rate-limit, tạo session; không áp session guard trước login | vercel |

---

## O. Rate limit (4 ca)

| ID | Ca | Kỳ vọng | Lớp |
| --- | --- | --- | --- |
| O67 | Sử dụng bình thường | Pass | vercel |
| O68 | Một email vượt `STAFF_DAILY_REQUEST_LIMIT` | Bị throttle | vercel |
| O69 | Email thứ hai dùng chung IP | **Không** bị chặn oan bởi hạn mức của email thứ nhất | vercel |
| O70 | Request chưa xác thực gửi email tuỳ ý để chọn limiter key | Không được phép — key chỉ lấy từ email **đã verify** | vercel |

---

## P. Tách dữ liệu công khai / riêng tư (6 ca)

| ID | Ca | Kỳ vọng | Lớp |
| --- | --- | --- | --- |
| P71 | GViz công khai truy cập `Unit_Allowlist` | Không thể (khác spreadsheet) | vận hành |
| P72 | Browser lấy allowlist | Không có đường nào | e2e |
| P73 | Payload `/api/google-sheet` | Không chứa email cán bộ | vercel ✅ (đã có allowlist cột) |
| P74 | Bảng tính riêng tư | Không publish-to-web, không anyone-with-link | vận hành |
| P75 | Apps Script vẫn resolve được email → units | Pass sau khi đổi config | gas |
| P82 | Private workbook bị public/publish-to-web ngoài ý muốn | Production gate fail, không cho rollout | vận hành |

> P71/P74/P82 là kiểm tra **vận hành**, không phải test tự động — phải nằm trong checklist migration
> (PLAN §3) và được ký xác nhận trước khi điền email thật.

## H.1. Confirm snapshot và stale protection (3 ca)

| ID | Ca | Kỳ vọng | Lớp |
| --- | --- | --- | --- |
| H76 | `POST /confirm { recordId, snapshotHash, operationId }`, hash khớp record hiện tại | Ghi `Staff_Verification_Audit` đúng một lần | vercel + gas |
| H77 | `POST /confirm` thiếu hash hoặc có `snapshotHash` cũ sau khi Published thay đổi | Reject `SNAPSHOT_HASH_REQUIRED`/`STALE_RECORD`, không ghi success | vercel |
| H78 | Target cross-unit với hash hợp lệ | Reject authorization trước confirm | vercel + gas |

## Q. Consistency giữa hai workbook (3 ca)

| ID | Ca | Kỳ vọng | Lớp |
| --- | --- | --- | --- |
| Q79 | Public write thành công, private finalize thất bại | Reconciliation hoàn tất, không publish duplicate | gas |
| Q80 | Private state có, public write thiếu | Retry publish đúng một lần | gas |
| Q81 | Approval request retry cùng `request_id` | Published không duplicate, trạng thái không mất | gas |

---

# Threat model

| # | Mối đe doạ | Mitigation | Test |
| --- | --- | --- | --- |
| T1 | Người dùng sửa `unit_code` trong payload để thao tác đơn vị khác | Server không đọc `unit_code` từ client; tập đơn vị suy ra từ `resolveUnitsByEmail` với allowlist hiện tại | D20, D21, B08–B14 |
| T2 | Người dùng sửa `target_record_id` sang bản ghi đơn vị khác (`record_id` là công khai) | `sameUnitCode(targetRecord.unit_code, authorization.unitCode)` ở `buildStagingRecord` **và** `applyApproval`, cộng lớp Vercel | E22, E23, E24 |
| T3 | Người dùng khai `submitter_email` của người khác để đổ lỗi | `submitter_email` luôn lấy từ session đã verify; body bị bỏ qua | F28 |
| T4 | Session bị đánh cắp hoặc dùng lại sau khi quyền bị thu hồi | Cookie `HttpOnly`/`Secure`/`SameSite=Lax`, `Max-Age` giới hạn; **reauthorize theo allowlist hiện tại trước mỗi thao tác ghi** | C15, C16, C17, C18 |
| T5 | Formula injection qua trường nhập tự do (`=IMPORTXML(...)`) | `sanitizeUserFields` tiền tố `'` cho chuỗi bắt đầu `= + - @`, **gồm cả `record_id` và `target_record_id`** | Đã có test PR #41 |
| T6 | CSRF: site lạ khiến trình duyệt cán bộ gửi POST | Validate `Origin` bằng `lib/request-security.js` + `SameSite=Lax`; session cho protected POST, Google credential verify cho `/auth/google` | N64–N67 |
| T7 | Replay request gateway đã bắt được | HMAC raw-body + timestamp ±5 phút + business `requestId` derive từ `operationId`; nonce chỉ optional | M60–M63, M83–M86 |
| T7b | Race đồng thời: hai request cùng `requestId` cùng vượt qua check trước khi bên nào ghi dấu → double upload/append | Atomic claim ledger **trước** side-effect trong cùng `LockService` lock (PLAN §17.1); reject key tái dùng với payload khác | M87, M88 |
| T8 | Gọi thẳng Apps Script gateway (Web App phải mở "Anyone") | Query-param HMAC là lớp xác thực duy nhất → fail closed tuyệt đối; secret không tới browser | M58–M63, M83–M85 |
| T9 | Workbook công khai làm rò PII cán bộ (email, số điện thoại) | Tách toàn bộ operational sheets sang private workbook | P71–P75, P82 |
| T10 | File Drive mồ côi do upload tách rời việc ghi staging | Một business request duy nhất; upload sau authorization; cleanup khi ghi staging fail | L57 |
| T11 | Vô tình publish thẳng, bỏ qua duyệt | Portal không có action approve/publish; gateway chỉ có 3 action, không có action nào chạm `Published_Locations` | J47, K49, H33 |
| T12 | Admin xoá tay ô `validation_errors` trong Sheet rồi duyệt | Chốt chặn thứ hai trong `applyApproval` cho cả cross-unit lẫn bất biến CREATE | E24, E26 |
| T13 | Một cán bộ làm cạn quota của cả đơn vị dùng chung NAT | Rate limit key chính là email đã verify, IP chỉ là key phụ | O68, O69, O70 |
| T14 | Update xoá mất dữ liệu do hiểu sai "trường vắng mặt" | Merge phía server; omitted ≠ delete; ba trạng thái tường minh | I36–I42 |
| T15 | Private workbook accidentally public/publish-to-web | Permission checklist, unauthenticated verification và deployment gate | P82 |
| T16 | Partial cross-workbook approval | `request_id`, idempotent writes, reconciliation, state checks và LockService; LockService không phải transaction | M83–M87, Q79–Q81 |
| T17 | Staff confirm snapshot cũ sau khi Published thay đổi | Canonical snapshot hash và compare current hash trước ghi | H76–H78 |

---

# Acceptance criteria — invariant

| ID | Invariant | Ca kiểm chứng |
| --- | --- | --- |
| INV-01 | Danh tính Google được **server** verify (chữ ký, `aud`, `iss`, `exp`, `email_verified`), không chỉ decode | A01–A07 |
| INV-02 | Email quyết định tập đơn vị được phép; **client không quyết định quyền** | B08–B14, D19–D21 |
| INV-03 | Một email có thể có **nhiều** đơn vị | B11 |
| INV-04 | Sửa bản ghi chéo đơn vị **không thể xảy ra** ở bất kỳ lớp nào | E22–E24, H35 |
| INV-05 | CREATE **không bao giờ** ghi đè bản ghi đang có | E26, E27, J45, J46 |
| INV-06 | Cán bộ **không** direct-write `Published_Locations` | J47, K49, H33, T11 |
| INV-07 | Mọi thay đổi **nội dung** phải qua staging + admin approval | J43, J47, K48, K49 |
| INV-08 | Confirm **không** thay đổi nội dung công khai | H33, H34 |
| INV-09 | Email cán bộ **không** nằm trong bảng tính đọc được công khai | P71–P75, P82 |
| INV-10 | `submitter_email` **luôn** lấy từ session | F28 |
| INV-11 | Dữ liệu hiện có được tái sử dụng; update **không** bắt nhập lại trường không đổi | I36–I42 |
| INV-12 | Update **không** bắt upload ảnh mới nếu target đã có ảnh hợp lệ | L55 |
| INV-13 | Secret **không** tới browser (`STAFF_SESSION_SECRET`, `LOCATION_GATEWAY_SECRET`, `PRIVATE_LOCATION_SPREADSHEET_ID`) | P72, M58–M63, M83–M85 |
| INV-14 | Apps Script private gateway **fail closed** | M63, T8 |
| INV-15 | Private operational data + staff PII không nằm trong public-readable workbook | P71–P75, P82 |
| INV-16 | Cross-workbook approval/revoke recoverable và idempotent theo `request_id`; claim atomic trước side-effect chống cả replay tuần tự lẫn race đồng thời | M83–M88, Q79–Q81 |
| INV-17 | Staff confirmation gắn đúng snapshot/version record đã nhìn thấy | H76–H78 |

Một invariant bị vi phạm = implementation chưa xong, không phải "cải thiện sau".
