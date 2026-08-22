# Migration Published_Locations

Script migration làm việc với file JSON export, không ghi trực tiếp vào Google Sheet production.

## Dual-workbook foundation — dry-run only

`npm run migrate:locations:dual:dry-run -- --source <source-export.json> --target <target-export.json>`
never contacts Google or writes a workbook. It inventories sheets and row counts, checks the semantic
`Published_Locations` schema plus coordinate validity, classifies public/private sheets, compares public
`record_id` values and reports missing, unexpected and duplicate records. Add `--report <file>` only to
write a local JSON evidence report. `--apply` and `--write` are deliberately rejected.

Treat a non-empty `blockers` list as a failed cutover check. In particular, an empty/invalid public target,
known private columns in public data, missing or unexpected public records, duplicate published/staging
stable IDs, missing source private sheets in the private target, unknown sheets, or a public/private
boundary leak must not proceed to cutover.

For each `record_id` shared by source and target, the tool compares canonical public fields and parsed
coordinates. It blocks `TARGET_COORDINATE_LOST`, `TARGET_COORDINATE_INVALID`, or
`TARGET_COORDINATE_CHANGED` per record; a non-coordinate public difference is
`TARGET_PUBLIC_RECORD_MISMATCH`. Approved Vietnamese/English column aliases and formatting-only coordinate
differences resolve to the same semantic value.

Expected target export shape is `{ "public": { "sheets": { ... } }, "private": { "sheets": { ... } } }`.
Use TEST exports for smoke exercises. No Production workbook or Production environment must be changed by
this command. Before any later alias promotion, run `npm run verify:published-locations` against the
candidate deployment and require valid semantic columns and coordinates.

## Operational baseline reconciliation — dry-run only

Legacy rows already in public `Published_Locations` are not historical staff submissions. The Gateway
therefore uses the separate private `Operational_Baseline` sheet to authorize an existing target without
inventing a `Location_Staging` request, approver, audit entry, or submitter identity. The public workbook
remains the public read model; the Gateway still never reads it at runtime.

`npm run migrate:locations:operational-baseline:dry-run -- --dry-run --input <dual-export.json> --report <local-report.json>`
accepts a local JSON export with `public.sheets.Published_Locations`,
`private.sheets.Unit_Allowlist`, and optionally `private.sheets.Operational_Baseline`. `--dry-run` is
explicit but also the default. It is deliberately dry-run only: `--apply`, `--write`, and `--execute` are
rejected. The command prints `PUBLIC_RECORDS`, `BASELINE_ELIGIBLE`, `BASELINE_EXISTING`,
`BASELINE_PLANNED`, `BASELINE_PROJECTED`, `DUPLICATE_RECORD_IDS`, `UNKNOWN_UNIT_CODES`, `BLOCKERS`, and
`WRITE_PERFORMED`. The local report may contain public
location data and must remain access-controlled.

Each proposed private baseline row is the public snapshot allowlist plus only these provenance fields:
`baseline_source=MIGRATED_PUBLISHED_LOCATION`, `baseline_status=ACTIVE`, `baseline_version=v1`,
`source_updated_at`, and `reconciled_at`. It contains no request ID, staff email, approver, audit snapshot,
Drive file ID, or historical approval claim.

The reconciliation fails closed for duplicate public/baseline `record_id`, missing public identity/name/
coordinates, unknown unit code, invalid baseline provenance/status/version, a baseline record absent from
public data, a public/baseline field mismatch, or projected public/private count mismatch. A repeat run
with matching baseline rows plans zero inserts.

The 2026-08-22 read-only Production dry-run reported: `PUBLIC_RECORDS=142`,
`BASELINE_ELIGIBLE=142`, `BASELINE_EXISTING=0`, `BASELINE_PLANNED=142`,
`DUPLICATE_RECORD_IDS=0`, `UNKNOWN_UNIT_CODES=0`, and no blockers. This is evidence only, not authority
to write Production.

An owner-approved Production migration is a separate future action. Its expected deltas are
`Published_Locations=0`, `Unit_Allowlist=0`, `Location_Staging=0`, `Approval_Audit_Log=0`,
`Idempotency_Ledger=0`, and `Operational_Baseline=+142`. It must create only the private sheet/header and
exact reviewed rows, under a controlled Apps Script/Sheets procedure; this CLI does not implement or invoke
that write.

## Cutover gate checklist — PR #48 preparation

The following is a manual, owner-approved sequence. It is a checklist only; PR #48 does not execute it,
change Production aliases, or write either workbook.

- [ ] Verify the candidate Vercel deployment contains the intended PR #47/API and PR #48 portal commits;
  check `/api/staff/auth/csrf` and both `/can-bo` paths before OAuth testing.
- [ ] Confirm Vercel Root Directory, `npm run build`, `dist` output and absence of a legacy `builds`
  override; keep Deployment Protection enabled and use the approved Preview access path.
- [ ] Verify Preview-only environment values and exact allowed origin (`GOOGLE_CLIENT_ID`,
  `STAFF_SESSION_SECRET`, `STAFF_GATEWAY_URL`, `LOCATION_GATEWAY_SECRET`, and public workbook config).
  Keep private workbook IDs, Gateway secrets and allowlist data server-side.
- [ ] Run `npm run verify:published-locations -- --base-url <candidate-url>` and require no blockers.
- [ ] Run `npm run migrate:locations:dual:dry-run -- --source <source-export.json> --target <target-export.json>`
  with TEST exports and require an empty `blockers` list; do not pass `--apply` or `--write`.
- [ ] Complete OAuth/session, authorized-unit, cross-unit, stale-snapshot, submit and revoke smoke checks
  on Preview; record evidence and rollback owner before any later alias promotion.
- [ ] Obtain a separate approval for workbook reconciliation and Production alias promotion. No production
  migration or cutover is part of PR #48.

```powershell
# Xem báo cáo, không thay đổi nguồn
npm run migrate:locations -- --input .\published-export.json

# Ghi kết quả sang file khác; nếu file đích đã có sẽ tạo .bak trước
npm run migrate:locations -- --input .\published-export.json --apply --output .\published-migrated.json
```

Migration giữ `record_id` đã có hoặc tạo mã cho bản ghi thiếu, chuyển `police_station` thành `POLICE_OFFICE` và `id_center` thành `CITIZEN_ID`. Các bản ghi cùng `unit_code` luôn còn riêng biệt. Báo cáo gồm tổng số bản ghi, hợp lệ, thiếu `record_id`, nghi trùng, thiếu tọa độ và ngoài phạm vi.

## Quy trình rollback

Kiểm tra kết quả dry-run trước. Lưu bản export gốc tại nơi kiểm soát truy cập. Khi đã `--apply`, khôi phục từ file nguồn hoặc từ tệp `.bak` script tạo khi ghi đè output. Chỉ import lại kết quả đã được người duyệt xác nhận vào Sheet; không chạy thử trên production.
