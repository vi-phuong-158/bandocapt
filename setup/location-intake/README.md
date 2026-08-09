# Location intake Apps Script runtime

`Code.gs` is a thin Google Apps Script runtime. It only integrates FormApp, SpreadsheetApp, DriveApp, UrlFetchApp, ScriptApp, menus, triggers and locks; all location business rules come from `setup/apps-script.js`.

Do not deploy `Code.gs` directly. Generate the single deployable file first:

```powershell
npm run build:location-intake
```

Copy `dist/Code.gs` to one Apps Script project bound to the destination spreadsheet. Its banner identifies it as generated. Configure the IDs in Script Properties, then run `setupLocationIntakeSystem` once. Detailed instructions are in [docs/location-intake/SETUP.md](../../docs/location-intake/SETUP.md).

Never copy or modify `docs/Form/Code.gs`: it is user reference material and is not part of this runtime.
