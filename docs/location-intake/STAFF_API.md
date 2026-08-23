# Staff API Vercel contract (PR #47)

PR #47 adds the server-only layer for a future `/can-bo` client. It does not add a UI, migrate a
workbook, deploy Apps Script, or change Production environment variables.

## Trust chain

1. `POST /api/staff/auth/google` requires an exact configured `Origin` and a matching `staff_csrf` cookie/header.
2. `google-auth-library` verifies the Google ID token against `GOOGLE_CLIENT_ID`. The verified `sub` is
   the immutable session identity; verified email is used for allowlist authorization and operational display.
   The verified `name` claim (already present under the GIS button's default scope) is bounded, signed into
   the same session, and returned to the client alongside `email` for read-only display.
3. Vercel calls Gateway V2 `resolveUnits` for every login and every protected request. Empty current units
   reject the request, even when the signed session has not expired. Authorized units are also the sole
   source of the `unitCode`/`unitName` a `create` request may use — the client cannot submit an unauthorized
   unit and have it accepted.
4. State-changing routes require exact `Origin` and CSRF. The browser never receives either Gateway secret.

## Routes

| Route | Contract |
|---|---|
| `GET /api/staff/auth/csrf` | Returns `{ ok: true, data: { csrfToken } }` and sets a non-authentication `staff_csrf` cookie. |
| `POST /api/staff/auth/google` | Accepts only `{ credential }`; returns safe user/unit DTO and sets the signed session cookie. |
| `POST /api/staff/auth/logout` | Requires Origin + CSRF and clears the session/CSRF cookies. |
| `GET /api/staff/session` | Revalidates the session against current Gateway units and returns safe DTO only. |
| `GET /api/staff/locations` | Reads only public `Published_Locations`, filters by current authorized `unit_code`, and returns a canonical snapshot plus SHA-256 hash plus a safe projection of pending staged requests for those units. |
| `POST /api/staff/requests` | Allows only the explicit intake DTO. Create rejects target/hash; update/correct/stop require an authorized fresh target. `submitter_name` is overridden server-side from the verified session `name` whenever one is present — a client-submitted value is only used as a fallback while no verified name exists. |
| `POST /api/staff/verification` | Builds the current snapshot server-side, rejects stale hashes with HTTP 409, and only then calls `writeVerificationEvent`. |
| `POST /api/staff/maps/resolve` | Requires Origin + CSRF + valid session. Resolves a Google Maps URL (including `maps.app.goo.gl` short links) to `{ coordinates: { lat, lng } }` for UX only — see "Maps URL resolver" below for the authoritative contract. |

All responses are `no-store` and use `{ ok, data }` / `{ ok: false, error: { code } }`. Raw Gateway bodies,
private rows, credentials, cookie tokens, secrets, signatures, body hashes and Drive IDs are not returned.

## Pending-request projection

The locations response is additive: `{ locations, pendingRequests }`. `pendingRequests` comes from the
private Gateway read action `listStaffRequestStatuses`, which re-resolves the signed session email against
`Unit_Allowlist` and returns only rows that are both `PENDING` and in an authorized unit. Each safe row is
`{ locationId, unitCode, type, status, submittedAt }`; it excludes opaque server-derived request IDs,
submitter/reviewer/audit text, validation fields and every private image/Drive pointer. `locationId` is the
staging target ID for an existing location and empty for a CREATE request, allowing a pending CREATE to
remain visible before it has a public `Published_Locations` row. A failed status read fails the whole
protected locations response; the browser therefore never treats an unavailable private source as “no
pending request”.

Current workflow semantics are intentionally preserved: CREATE/UPDATE/CORRECT/STOP have `Location_Staging`
review state (`PENDING` until the admin decision); APPROVED/REJECTED/NEED_VERIFICATION/REVOKED are not
returned as a history feed. CONFIRM is a completed `Staff_Verification_Audit` event, not a staging/Admin
Review request, so it is not falsely shown as pending.

For a target location, Gateway rejects a distinct CREATE/UPDATE/CORRECT/STOP request while any request for
that target is still `PENDING`; the check is performed inside the existing Script Lock. This closes a
second-tab race independently of the portal's disabled controls. CREATE remains exempt because it has no
target and a unit may legitimately submit more than one new location.

## Cache and authoritative snapshot policy

Public/read consumers may use the default `getPublishedLocations()` cache (fresh for 60 seconds with the
existing bounded stale fallback). Security-sensitive mutation decisions do not: verification and
update/correct/stop request flows call the reader with `forceRefresh: true, allowStale: false`, then compute
the current snapshot hash from that successful authoritative source. A source, schema or dataset failure
returns `STAFF_PUBLIC_SOURCE_UNAVAILABLE` (HTTP 503); cached or stale records are never accepted and the
Gateway mutation is not called. Create requests validate the authorized requested unit and do not fetch a
current Published_Locations record when no target is present.

## Signing and idempotency

The Gateway client serializes the final envelope once, signs and sends that exact UTF-8 raw string with
`HMAC-SHA256(LOCATION_GATEWAY_SECRET, timestamp + '.' + rawBody)` and query parameters `timestamp` and
`signature`. Transport retry keeps the same request ID and raw body while allowing a new timestamp/signature.

The browser supplies only a bounded `operationId` (`[A-Za-z0-9_-]`). Vercel derives:

```text
SHA-256("staff-v1|" + verifiedGoogleSub + "|" + gatewayAction + "|" + operationId)
```

Payload drift therefore cannot create a new idempotency key. Client identity fields are ignored; Vercel
injects verified email, current authorized unit and the derived request ID.

## Request validation and business errors

Before building the Gateway DTO, Vercel trims and bounds the recognized text fields and the `services`
array. Non-string values, oversized values, malformed arrays or invalid array items return HTTP 400 with
`STAFF_REQUEST_INVALID`; the rejected payload is not sent to Apps Script. Unknown client fields remain
excluded by the explicit DTO builder.

For `create`, `update` and `correct`, the Gateway may return the safe user-actionable codes
`IMAGE_REQUIRED`, `SERVICES_MISSING`, `ADDRESS_MISSING`, `LOCATION_NAME_MISSING`,
`COORDINATE_NEEDS_REVIEW`, `COORDINATE_INVALID_LINK` or `COORDINATE_OUTSIDE_PHU_THO`. The portal maps
these to Vietnamese guidance. Unknown Gateway codes and infrastructure failures remain generic and do
not expose raw remote bodies or internal configuration.

## Snapshot and image boundaries

`lib/staff-location-contract.js` is the shared source of truth for `SNAPSHOT_FIELDS`, canonicalization and
stable stringify. The same module is included before Gateway V2 in the Apps Script build; Gateway behavior
and its 10 MiB decoded image limit remain unchanged. Vercel preflights images at **3 MiB decoded** because
the Vercel request platform limit is lower. Future PR #48 owns resize/compression UI.

CREATE must include a replacement image at both Vercel and Gateway. UPDATE and legacy CORRECT may omit
`image`; their browser DTO omits the field rather than sending `null`. On approval without a new file,
the server preserves the current public `image_url` and recovers the latest approved private file ID when
available. No browser value is authoritative for either retained value.

The staff card renders only this existing public `image_url` contract. A legacy public Drive view URL is
converted in-browser to its `lh3.googleusercontent.com` content form for the route's narrow image CSP;
this does not read or expose a private staging file ID. Missing, malformed or failed images are removed
without breaking the card. A pending replacement image remains private; the card continues to show only
the currently published image.

## Browser portal additions (PR #48)

`GET /api/staff/auth/config` is a public, `no-store` endpoint that returns only
`{ ok: true, data: { googleClientId } }` from `GOOGLE_CLIENT_ID`. It returns HTTP 503 with
`STAFF_AUTH_CONFIG_INVALID` when the client ID is missing and never returns session, Gateway or private
configuration.

The browser route is `/can-bo`; it bootstraps CSRF then session, renders the official Google Identity
Services button without One Tap, and posts the callback credential only to `/api/staff/auth/google`.
Credential, session cookie and CSRF token are never persisted in browser storage. Portal reads and writes
remain same-origin Vercel calls; the browser never calls Apps Script directly.

## Maps URL resolver (PR #48 form simplification)

`lib/staff-maps-resolver.js` reuses the existing `isGoogleMapsUrl`/`parseCoordinates` from
`setup/apps-script.js` — no separate URL/coordinate parsing implementation. It is a plain redirect
chaser, not a generic URL fetch proxy:

- Both the initial URL and every redirect hop must pass `isGoogleMapsUrl` (HTTPS + Google Maps host
  allowlist only); a redirect to any other host is rejected before it is ever followed.
- `redirect: 'manual'` — only the `Location` header is read; the response body is never fetched, so
  there is no body-size concern.
- One `AbortController` bounds total wall time (`DEFAULT_TIMEOUT_MS`, currently 6s) across however
  many hops occur; a fixed `MAX_REDIRECTS` (5) bounds hop count independently of the timeout.
- If the URL already encodes coordinates directly (e.g. `@lat,lng`), no network call happens at all.
- All failure modes (non-Google redirect, too many redirects, timeout, no coordinates in the final
  URL) collapse to a small, already-existing vocabulary of safe codes
  (`COORDINATE_INVALID_LINK`/`COORDINATE_NEEDS_REVIEW`/`COORDINATE_OUTSIDE_PHU_THO`/`MAPS_RESOLVE_UNAVAILABLE`)
  — the client shows one generic "couldn't determine the location" state and offers manual entry.

This is UX only. The Gateway's `classifyCoordinateStatus`/`parseCoordinates` (`setup/apps-script.js`,
unchanged) remain the sole authoritative check when `/api/staff/requests` actually submits — whatever
ends up in the `coordinates` field (resolved, preloaded, or manually typed) is re-parsed and
re-validated against the Phú Thọ bounds server-side regardless of what the client claims.

## Cutover dependency

The public workbook must contain `unit_code` for ownership filtering. A current public record can still be
fresh while Gateway V2 has no matching private operational baseline. In that case the API returns
`STAFF_OPERATIONAL_BASELINE_NOT_READY` and does not retry or bypass Gateway ownership checks. A later,
approved cutover/reconciliation task must mirror/seeding operational records after candidate public-source
verification; PR #47 performs no migration or seeding.
