# Public contributions runbook

## Contract

`/dong-gop` is an anonymous CREATE/UPDATE/STOP intake. A successful submission means only:

```text
PUBLIC WEB -> Vercel validation -> private Gateway -> Location_Staging/PENDING
           -> existing Admin Review -> APPROVE -> Published_Locations/public image
```

Public submission is not publication. UPDATE/STOP first select a safe current-public target for the selected canonical unit. Vercel refreshes and verifies that target, then Gateway rechecks the private operational target/unit under its lock; unknown, private, cross-unit and non-baseline targets fail closed. The browser never receives a staff session, allowlist email,
private workbook/file ID, Gateway URL or `LOCATION_GATEWAY_SECRET`, and never calls Apps Script directly.

## Source and trust boundary

- `GET /api/location-contributions` calls the authenticated Gateway's `listPublicContributionUnits`.
  The Gateway reads private active `Unit_Allowlist` rows and returns only `{ unitCode, unitName }`, which
  Vercel projects to `{ unitCode, label }`; it is not derived from `Published_Locations`, so an active
  unit without a published location can receive its first contribution.
- A GET with `Origin` uses the normal allowlist. Native same-origin browser GETs that omit `Origin` are
  accepted only with matching `Sec-Fetch-Site: same-origin` and same-origin `Referer`; raw missing-Origin
  and cross-site requests fail closed. POST never uses this exception.
- `POST /api/location-contributions` requires an approved Origin, the shared request signature, Turnstile
  in protected deployments, `CHAT_LOG_HASH_SALT` for pseudonymous IP buckets, valid Google Maps
  coordinates inside Phú Thọ, one JPEG/PNG/WebP image and the daily pseudonymous IP limit
  (`PUBLIC_LOCATION_DAILY_IP_LIMIT`, default `10`).
- The Vercel server derives `sha256("public-location-v1|operationId")` as the Gateway request ID. IP,
  name and phone are never part of that ID.
- Rate limiting uses the Preview/TEST Upstash Redis resource through server-only `KV_REST_API_URL` and
  `KV_REST_API_TOKEN`. `lib/rate-limit-store.js` sends one atomic Lua command per request, keyed by
  `bandocapt:public-location:v1:<date_window>:<hmac_ip_bucket>`, and initializes a TTL through the next
  Vietnam-time daily reset. Redis contains only the pseudonymous bucket and numeric counter; Firebase is
  not required by this public contribution path. Missing/unavailable Redis fails closed with `503`.
- Apps Script `submitPublicContribution` rechecks the canonical unit, request type, target ownership,
  image policy and idempotency under the Script Lock. CREATE requires one private image; UPDATE may retain
  the approved image; STOP has no image/location-field requirement. Every request writes only private staging/audit data.

## Review

Review the private staging row using the existing Admin Review flow. Confirm that:

1. `status` is `PENDING` and `auth_status` is `PUBLIC_CAPTCHA`.
2. `submitter_email` is `public-web@bandocapt.invalid`, never a real staff email.
3. `image_file_id` is private and no public image URL exists before approval.
4. APPROVE is the only step that can populate `Published_Locations` and make the image public.

Public UPDATE and STOP use the same pending-review path; legacy CORRECT and staff CONFIRM remain staff-only actions.

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
