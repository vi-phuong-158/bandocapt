# Dedicated container-bound admin review

## Purpose and boundary

`setup/location-admin-review/` is a separate, container-bound Apps Script bundle for an approver
to review `Location_Staging` in the configured private workbook and update `Published_Locations`
only through the configured public workbook. It reuses the audited pipeline, workbook resolver and
`LocationAdminReview` engine; it does not reuse the Staff Gateway Web App runtime.

The generated manifest intentionally has no `webapp` section, no `doPost`, no Staff submission
action, and no `LOCATION_GATEWAY_SECRET`. Its menu is only **Bản đồ CA - Duyệt địa điểm**.

Required Script Properties are:

- `PRIVATE_LOCATION_SPREADSHEET_ID`
- `PUBLIC_LOCATION_SPREADSHEET_ID`
- `GOOGLE_SHEET_ID`
- `LOCATION_APPROVER_EMAILS`

For Production, `PUBLIC_LOCATION_SPREADSHEET_ID` and `GOOGLE_SHEET_ID` must be the same public
workbook ID and must differ from `PRIVATE_LOCATION_SPREADSHEET_ID`. No image-folder property is
needed: image sharing/revocation resolves the already-authorized staging file by ID at review time.

## Owner-only creation procedure

Do not use `clasp create --parentId` to bind to an existing workbook. In `@google/clasp@3.3.0`, the
`--parentId` path is not a safe existing-spreadsheet binding mechanism; `--type sheets` creates a
new spreadsheet/container instead. Either outcome violates the Production boundary.

1. Open the intended private workbook in Google Sheets.
2. Choose **Extensions → Apps Script**. This creates a new project bound to that exact open workbook.
3. Set the project name to `Production Location Admin Review (Private)`.
4. In Project Settings, set only the required properties listed above, verify the public/private ID
   relationship, and do not copy any Gateway secret.
5. Verify the local clasp identity against the Script ID from Project Settings through the approved
   owner-controlled procedure; the Script ID is runtime configuration and is never committed.
6. Copy the verified Script ID into the ignored `setup/location-admin-review/.clasp.json`, created from
   `.clasp.json.example`.
7. Build and push the reviewed artifact:

```powershell
npm run build:location-admin-review
npx --yes @google/clasp@3.3.0 -P setup/location-admin-review push --force
```

8. Reload the private workbook, run **Kiểm tra cấu hình duyệt**, then verify the dedicated menu.

## Authorization diagnostic and troubleshooting

**Kiểm tra cấu hình duyệt** is read-only and is intentionally available before authorization.
It reports:

- active workbook match against the configured private workbook;
- private/public workbook resolver status and boundary;
- whether `LOCATION_APPROVER_EMAILS` exists (the allowlist value is not shown);
- the effective and active user email seen by Apps Script, plus each allowlist match;
- required `Location_Staging`, `Approval_Audit_Log`, and `Published_Locations` schema status.

When the menu reports **Tài khoản hiện tại không được phép duyệt**, check in this order:

1. Sign into Google as the intended approver and confirm the diagnostic's effective email.
2. Confirm the active workbook is the Production Private Workbook.
3. Confirm the menu came from this dedicated container-bound project, not Staff Gateway,
   Location Intake, a TEST project, or a legacy copied workbook.
4. Confirm `LOCATION_APPROVER_EMAILS` is configured in this project's Script Properties.
5. Compare effective and active emails; a blank or mismatch identifies a Google session/authorization
   issue rather than an allowlist parser issue.
6. Confirm the deployed manifest includes `https://www.googleapis.com/auth/userinfo.email`,
   then re-authorize the dedicated project if the scope was added after first use.
7. Rebuild and push the exact reviewed artifact if the runtime source is stale.

`LOCATION_APPROVER_EMAILS` belongs to the **dedicated Admin Review container-bound Apps Script
project**. It is not read from Staff Gateway, Location Intake, Apps Script TEST, or Vercel.

Do not use a stale workbook/container for Production review. Do not copy `Location_Staging` rows
between workbooks: the private staging/audit history and the public record transition must remain in
the configured workbook pair.

No Apps Script deployment, version, Web App, Vercel configuration, Gateway source, or Gateway URL is
created or changed by this procedure.
