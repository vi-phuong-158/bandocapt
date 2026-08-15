# Bảo mật dữ liệu địa điểm

- Email người gửi chỉ được dùng ở staging để kiểm tra allowlist; không được có trong `Published_Locations` hoặc API công khai.
- API lọc payload Google Visualization theo allowlist trường công khai, vì vậy cột nội bộ thêm nhầm trong sheet cũng không được trả ra.
- Chuỗi do người dùng nhập bắt đầu bằng `=`, `+`, `-`, `@` được tiền tố `'` trước khi ghi Sheet, chống formula injection. Mã trạng thái và dữ liệu hệ thống không bị đổi.
- MIME được lấy từ `DriveApp.File.getMimeType()`, không tin phần mở rộng; chỉ JPEG, PNG, WebP, HEIC, HEIF và đúng một ảnh được chấp nhận.
- Ảnh staging không công khai. Chỉ ảnh đã duyệt dùng `ANYONE_WITH_LINK`; thu hồi `STOP` sẽ thử đặt lại private/no access.
- Không ghi Form ID, Drive folder ID, email allowlist thật hoặc secret vào mã nguồn. Dùng Script Properties và phân quyền tối thiểu.
- `record_id` **không phải bí mật** — nó nằm trong payload công khai của `/api/google-sheet`. Vì vậy biết
  `record_id` không tạo ra quyền sửa: mọi yêu cầu trỏ tới một bản ghi đã publish đều phải có
  `unit_code` của bản ghi đó khớp đơn vị mà `Unit_Allowlist` đã authorize cho email người gửi, nếu không
  bị chặn bằng `TARGET_RECORD_UNIT_MISMATCH`. Kiểm tra chạy ở hai nơi: `buildStagingRecord` (khâu nhận,
  gồm cả yêu cầu `create` có mang sẵn `target_record_id`) và `applyApproval` (ngay trước khi ghi/xoá
  `Published_Locations`, phòng trường hợp ô `validation_errors` bị xoá tay trong Sheet). Bản ghi published
  thiếu `unit_code` không chứng minh được chủ sở hữu nên không ai sửa được cho tới khi quản trị viên bổ sung.

- "Thêm địa điểm mới" luôn tạo bản ghi mới. Yêu cầu `create` mang theo `target_record_id` bị chặn bằng
  `CREATE_TARGET_RECORD_ID_NOT_ALLOWED` (không phải warning), và `record_id` của `create` luôn do
  `buildRecordId` sinh ở server chứ không kế thừa giá trị người gửi nhập. Kiểm tra chạy ở hai nơi:
  `buildStagingRecord` và `applyApproval` (phòng ô `validation_errors` bị xoá tay trong Sheet). Nhờ vậy
  một `create` không bao giờ ghi đè được bản ghi đang có trong `Published_Locations`, kể cả bản ghi của
  chính đơn vị mình — ca mà kiểm tra cross-unit không bắt được.
- **Dual-workbook foundation:** public readers resolve only `PUBLIC_LOCATION_SPREADSHEET_ID`, or the
  temporary compatibility value `GOOGLE_SHEET_ID` when the explicit public variable is absent. A public/
  legacy conflict or a public ID equal to `PRIVATE_LOCATION_SPREADSHEET_ID` fails closed. The P0 semantic
  schema guard remains mandatory. `Unit_Allowlist`, staging, all audits, `Idempotency_Ledger`, setup data
  and Form Responses are classified private and must never be exposed by `/api/google-sheet`.
- **Còn mở:** `Unit_Allowlist` (email cán bộ) nằm cùng bảng tính với `Published_Locations`, mà bảng tính
  đó phải cho "ai có liên kết đều xem" để endpoint GViz không xác thực trong `lib/published-locations.js`
  đọc được. `GOOGLE_SHEET_ID` là biến môi trường, không phải kiểm soát truy cập. Phải tách
  `Unit_Allowlist` sang bảng tính riêng không chia sẻ công khai trước khi điền email cán bộ thật và
  trước khi triển khai Staff Location Portal. Xem cảnh báo trong `SETUP.md`.
  Kế hoạch tách workbook + migration: `STAFF_PORTAL_PLAN.md` §2–§3 (chưa thực hiện). Phạm vi rộng hơn
  allowlist: `Location_Staging` và `Approval_Audit_Log` chứa `submitter_email`/`submitter_phone` nên
  cũng phải nằm phía riêng tư — tách mỗi `Unit_Allowlist` chỉ vá được một nửa lỗ rò PII.

Kiểm tra định kỳ `Approval_Audit_Log`, membership/ownership của Form, Spreadsheet và thư mục ảnh. Khi nghi lộ ảnh hoặc cấu hình sai, thu hồi quyền Drive trước, sau đó xử lý record published và audit theo quy trình vận hành.

## Staff Portal browser security (PR #48)

- `/can-bo` is a presentation layer only. The browser receives no Gateway URL/secret, private workbook ID,
  private row, session cookie value or server-derived request ID.
- The Google callback reference is used only long enough to POST `{ credential }` to Vercel. The client does
  not decode JWT claims, use email/sub for authorization, log the token, or write it to storage.
- API/Sheet text is inserted with `textContent`/form values and DOM node creation. Portal forms keep record
  ID and snapshot hash in application memory; staff are never asked to type either value.
- The route-specific CSP allowlists only `accounts.google.com/gsi/client` and its GIS iframe/style/connect
  endpoints. The generic site CSP excludes `/can-bo` so conflicting CSP headers are not combined.
- Browser image compression targets 2.5 MiB; Vercel's existing 3 MiB decoded preflight and Gateway magic
  byte checks remain authoritative. No mutation retries a stale snapshot silently.

## PR #48 form simplification & Maps resolver SSRF hardening (2026-08-15)

- Identity and unit are authoritative server/session data, never free-text: `submitter_name` is
  overridden server-side from the verified Google `name` claim whenever present (client-submitted
  value is fallback-only, never authoritative when a verified name exists); `unit_code` on `create` is
  always checked against the session's `resolveUnits` result, same as before — the UI now also stops
  offering an editable unit field for single-unit accounts and restricts the dropdown to authorized
  units only for multi-unit accounts, but the server-side check this relies on already existed.
- `POST /api/staff/maps/resolve` is a new authenticated (session + Origin + CSRF), same-origin
  endpoint that follows Google Maps short-link redirects server-side so the browser never needs
  CORS/direct access to `maps.app.goo.gl`. It is not a generic URL fetch proxy: both the initial URL
  and every redirect hop are checked against the existing `isGoogleMapsUrl` allowlist (HTTPS + Google
  Maps hosts only), the response body is never read (only the `Location` header on 3xx hops), redirect
  count and total wall time are both bounded, and no Google Maps Platform API key/billing was added —
  coordinates already embedded in the URL text are extracted directly, nothing more.
- Google Maps coordinates are derived automatically when possible; manual coordinate entry is a
  fallback only, shown on resolver failure or by explicit choice. Either way, the resolver's output is
  UX convenience only — the Gateway's existing `classifyCoordinateStatus`/`parseCoordinates`
  (unchanged) remain the sole authoritative validation when a mutation actually submits.

## Private Gateway V2

- Browser không được gọi Apps Script gateway trực tiếp; chỉ Vercel server đã xác thực mới được ký HMAC.
- `doPost(e)` xác thực raw body HMAC-SHA256 và freshness trước khi parse JSON hoặc mở private workbook.
- Gateway chỉ allowlist `resolveUnits`, `submitRequest`, `writeVerificationEvent`; mọi action khác fail closed.
- Gateway chỉ đọc/ghi `Unit_Allowlist`, `Location_Staging`, `Staff_Verification_Audit`,
  `Approval_Audit_Log` và `Idempotency_Ledger` trong private workbook. Không publicize ảnh trong submit.
- `LOCATION_GATEWAY_SECRET` và `STAFF_GATEWAY_IMAGE_FOLDER_ID` chỉ ở Script Properties. PR này không deploy
  Apps Script hoặc thay Production properties.

## Vercel Staff API remediation (PR #47)

- Public/read location lookups may use the bounded 60-second cache and stale-read fallback. Snapshot-sensitive
  verification and update/correct/stop mutations force an authoritative Published_Locations fetch with
  `allowStale: false`; source failure returns `STAFF_PUBLIC_SOURCE_UNAVAILABLE` and never reaches Gateway.
- Gateway infrastructure errors remain distinct from remote business errors: `STAFF_GATEWAY_UNAVAILABLE`
  (503), `STAFF_GATEWAY_CONFIG_INVALID` (503), and `STAFF_GATEWAY_INVALID_RESPONSE` (502) are not remapped
  to `STAFF_GATEWAY_REJECTED`.

## PR #48 request-boundary hardening (2026-08-13)

- Vercel validates recognized text fields and the `services` array before constructing the Gateway DTO;
  malformed or oversized values return safe HTTP 400 `STAFF_REQUEST_INVALID` and never reach Apps Script.
- `create`, `update` and `correct` require an image, services and valid coordinates in the portal/Gateway
  contract. `stop` remains the only mutation mode exempt from replacement-image/location-field checks.
- Remote image/business validation codes are explicitly allowlisted for user guidance. Unknown codes,
  raw Gateway bodies, secrets, private IDs and diagnostic details remain hidden.

## Vercel Staff API (PR #47)

- Google AuthN và Unit_Allowlist AuthZ là hai lớp riêng. Vercel chỉ nhận `{ credential }`, xác minh bằng
  `google-auth-library`/`GOOGLE_CLIENT_ID`, dùng Google `sub` làm identity session và gọi Gateway
  `resolveUnits` để biết quyền hiện tại. Không tin email/sub/name từ body và không restrict chỉ bằng domain.
- Session là stateless HMAC-SHA256 cookie `staff_session` với `STAFF_SESSION_SECRET` riêng, tối thiểu 32
  ký tự, `HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`. Thiếu/ yếu secret fail closed.
- Mọi POST Staff API yêu cầu exact `Origin` từ `STAFF_ALLOWED_ORIGINS` (hoặc origin Preview/Production
  được Vercel derive chính xác) và CSRF cookie/header constant-time. Không có permissive CORS.
- Mỗi request protected re-resolves allowlist. Session hợp lệ nhưng email bị deactivate trả
  `STAFF_ACCESS_REVOKED` và có thể xóa cookie ngay.
- Gateway URL/secret chỉ nằm server-side. Payload được allowlist và server tự inject email, unit và
  request ID; không spread body client sang Gateway. `operationId` bị giới hạn charset/độ dài, còn
  `request_id` là SHA-256 deterministic từ verified `sub + action + operationId`.
- `/api/staff/locations` chỉ đọc `Published_Locations` qua public resolver và lọc `unit_code`; không đọc
  private workbook. Snapshot hash dùng contract chung với Gateway. Mọi update/correct/stop/confirm phải
  kiểm ownership + hash hiện tại trước khi gọi Gateway; stale trả HTTP 409 và không có side effect.
- Vercel giới hạn ảnh ở 3 MiB decoded; Gateway vẫn là authority magic-byte/10 MiB. Các response private
  đều `Cache-Control: no-store`.
- PR này không tạo auth bypass, không migrate/seed workbook, không thay Production env và không tạo UI.
