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

Do not use a stale workbook/container for Production review. Do not copy `Location_Staging` rows
between workbooks: the private staging/audit history and the public record transition must remain in
the configured workbook pair.

No Apps Script deployment, version, Web App, Vercel configuration, Gateway source, or Gateway URL is
created or changed by this procedure.
