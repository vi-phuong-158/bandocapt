# Private Apps Script Gateway V2

Gateway V2 là lớp cuối private dành cho Staff Portal. PR #46 thêm `doPost(e)` và business core;
PR #47 thêm Vercel staff API server caller/auth gate. Chưa có Staff Portal UI hay Production cutover.

## Contract

Browser **MUST NOT** gọi gateway trực tiếp. Chỉ Vercel server sau khi xác thực user mới được ký request
đến Apps Script. Request body giữ nguyên raw bytes và có envelope:

```json
{"action":"submitRequest","request_id":"REQ_...","payload":{}}
```

Signature dùng `HMAC-SHA256(secret, timestamp + "." + raw_body)`. Apps Script nhận timestamp/signature
qua `X-Location-Timestamp`/`X-Location-Signature` hoặc signed query metadata khi runtime không expose
custom headers ổn định. Timestamp là epoch milliseconds, freshness window là ±5 phút.

Chỉ ba action được allowlist:

- `resolveUnits`: đọc `Unit_Allowlist` private và trả `{ unitCode, unitName }` đã được phép.
- `submitRequest`: xác thực email/unit, ghi đúng một dòng `Location_Staging` private và không publish.
- `writeVerificationEvent`: validate event/snapshot hash và ghi `Staff_Verification_Audit` private.

Action khác trả `UNKNOWN_ACTION`. Response luôn là structured JSON; không trả stack trace, secret, raw
signature, private row, body hash, snapshot JSON hoặc Drive ID không cần thiết.

## Private resources

Gateway resolve `PRIVATE_LOCATION_SPREADSHEET_ID` qua `LocationWorkbookConfig.resolvePrivateLocationWorkbook()`.
Thiếu private ID, public/private collapse hoặc public config conflict đều fail closed. Gateway không đọc
public workbook. Legacy Form setup chỉ tạo bốn sheet cũ; gateway ledger/audit sheet không được tạo vào
workbook legacy.

Script Properties cần cho runtime:

```text
PRIVATE_LOCATION_SPREADSHEET_ID
PUBLIC_LOCATION_SPREADSHEET_ID (nếu đã cấu hình)
LOCATION_GATEWAY_SECRET
STAFF_GATEWAY_IMAGE_FOLDER_ID
```

`LOCATION_GATEWAY_SECRET` không nằm trong source. `STAFF_GATEWAY_IMAGE_FOLDER_ID` phải là thư mục

## Vercel staff API caller (PR #47)

- Browser chỉ gọi `/api/staff/*`; chỉ server route của Vercel được phép gọi Gateway.
- Vercel gửi đúng một JSON envelope mỗi attempt: `{"action","request_id","payload"}`. Chuỗi được
  `JSON.stringify` một lần, ký bằng `HMAC-SHA256(LOCATION_GATEWAY_SECRET, timestamp + "." + raw_body)` và
  truyền `timestamp`/`signature` trong query string `/exec`.
- Retry chỉ dành cho lỗi transport/timeout, tối đa một lần; retry giữ nguyên raw body và `request_id` nhưng
  ký timestamp mới. Gateway là nơi bảo vệ idempotency cuối cùng.
- `request_id` được server derive từ verified Google `sub`, action và client `operationId`; client không được
  gửi identity, unit hoặc request ID để thay thế.
- Các mutation gửi `record_snapshot` và `snapshot_hash` lấy từ public snapshot hiện tại. Snapshot hash dùng
  contract chung `lib/staff-location-contract.js`; mismatch bị từ chối trước Gateway.
- Image bị giới hạn 3 MiB decoded ở Vercel trước khi gọi Gateway (Gateway vẫn giữ giới hạn 10 MiB).
- Response lỗi từ Gateway được map thành mã an toàn; raw body, chữ ký, stack trace, Drive ID và private row
  không được trả về browser.
private; `submitRequest` không gọi `ANYONE_WITH_LINK`.

## Idempotency and recovery

`submitRequest` và `writeVerificationEvent` claim `Idempotency_Ledger` trong Script Lock trước side effect.
Ledger dùng `CLAIMED`, `UPLOAD_PERSISTED`, `COMPLETED`, `FAILED`, lưu `body_hash`, timestamps, result và
Drive resource pointer. Cùng request ID + body khác bị từ chối bằng
`IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD`. Retry cùng body trả deterministic result.

Image resource key là `staff-request-<request_id>-<sha256(image_bytes)>`. Retry tìm lại file private theo
key sau crash giữa Drive create và ledger update; không tạo file thứ hai. Staging append cũng kiểm tra
request ID trước khi append. Approval audit là side effect phụ: nếu append fail sau staging success,
ledger vẫn `COMPLETED` với `AUDIT_APPEND_FAILED`, tránh retry tạo staging duplicate.

## Image policy

Gateway bỏ qua MIME, filename và size do client khai. Base64 phải hợp lệ; bytes sau decode mới là nguồn
size authoritative, giới hạn 10 MiB. Magic bytes bắt buộc là JPEG (`FF D8 FF`), PNG hoặc WebP RIFF/WEBP.
Fake extension/MIME, malformed base64 và oversized decoded image đều bị reject trước Drive create.

## Snapshot verification

`writeVerificationEvent` chỉ nhận snapshot fields public allowlist, tự tính canonical SHA-256 và so với
`snapshot_hash`; actor role/auth status/client timestamp bị bỏ qua. Unit trong snapshot phải khớp allowlist
hiện tại. Stale compare với Published snapshot là trách nhiệm Vercel Staff API ở phase sau; gateway vẫn
không đọc public workbook.

## Runtime smoke

PR này không có quyền Apps Script TEST resource nên runtime smoke deployment là `NOT_RUN`. Node harness
chạy actual gateway core với fake `SpreadsheetApp`/`DriveApp`/`LockService`/`PropertiesService` adapters;
không dùng fake business implementation song song và không chạm Production.
