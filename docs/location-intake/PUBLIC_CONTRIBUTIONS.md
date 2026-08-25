# Public contributions runbook

## Contract

`/dong-gop` is an anonymous, create-only intake. A successful submission means only:

```text
PUBLIC WEB -> Vercel validation -> private Gateway -> Location_Staging/PENDING
           -> existing Admin Review -> APPROVE -> Published_Locations/public image
```

Public submission is not publication. The browser never receives a staff session, allowlist email,
private workbook/file ID, Gateway URL or `LOCATION_GATEWAY_SECRET`, and never calls Apps Script directly.

## Source and trust boundary

- `GET /api/location-contributions` calls the authenticated Gateway's `listPublicContributionUnits`.
  The Gateway reads private active `Unit_Allowlist` rows and returns only `{ unitCode, unitName }`, which
  Vercel projects to `{ unitCode, label }`; it is not derived from `Published_Locations`, so an active
  unit without a published location can receive its first contribution.
- `POST /api/location-contributions` requires an approved Origin, the shared request signature, Turnstile
  in protected deployments, `CHAT_LOG_HASH_SALT` for pseudonymous IP buckets, valid Google Maps
  coordinates inside Phú Thọ, one JPEG/PNG/WebP image and the daily pseudonymous IP limit
  (`PUBLIC_LOCATION_DAILY_IP_LIMIT`, default `10`).
- The Vercel server derives `sha256("public-location-v1|operationId")` as the Gateway request ID. IP,
  name and phone are never part of that ID.
- Apps Script `submitPublicContribution` rechecks the active private `Unit_Allowlist`, forces request
  type CREATE, rejects target IDs, sniffs image bytes, stores the image privately, and writes one staging
  row plus one `PUBLIC_SUBMIT` audit under the idempotency ledger and Script Lock.

## Review

Review the private staging row using the existing Admin Review flow. Confirm that:

1. `status` is `PENDING` and `auth_status` is `PUBLIC_CAPTCHA`.
2. `submitter_email` is `public-web@bandocapt.invalid`, never a real staff email.
3. `image_file_id` is private and no public image URL exists before approval.
4. APPROVE is the only step that can populate `Published_Locations` and make the image public.

Do not use a public submission to test UPDATE/CORRECT/STOP/CONFIRM. Those remain staff-only actions.

## Live rehearsal gate

Before a live rehearsal, the owner must separately approve the deployment/configuration steps for the
TEST/Production Gateway, private workbook, Script Properties, Vercel env and Admin Review. This source
task intentionally does not perform those mutations. The final acceptance must demonstrate:

```text
public form -> private PENDING row -> Admin APPROVE -> public map record/image
```

and verify that the image is not public before approval.

## Rollback

If the public flow must be stopped, revert the Vercel feature/API deployment or remove its public
route using the normal release process; do not delete private staging rows or Drive files. Keep any
existing `PENDING` rows for Admin Review, reject them explicitly if the owner decides they should not
be processed, and keep the Gateway action deployed until those rows are reconciled. Re-enable only
after the same source-to-Gateway version and private/public workbook checks pass again.
