# Staff API Vercel contract (PR #47)

PR #47 adds the server-only layer for a future `/can-bo` client. It does not add a UI, migrate a
workbook, deploy Apps Script, or change Production environment variables.

## Trust chain

1. `POST /api/staff/auth/google` requires an exact configured `Origin` and a matching `staff_csrf` cookie/header.
2. `google-auth-library` verifies the Google ID token against `GOOGLE_CLIENT_ID`. The verified `sub` is
   the immutable session identity; verified email is used for allowlist authorization and operational display.
3. Vercel calls Gateway V2 `resolveUnits` for every login and every protected request. Empty current units
   reject the request, even when the signed session has not expired.
4. State-changing routes require exact `Origin` and CSRF. The browser never receives either Gateway secret.

## Routes

| Route | Contract |
|---|---|
| `GET /api/staff/auth/csrf` | Returns `{ ok: true, data: { csrfToken } }` and sets a non-authentication `staff_csrf` cookie. |
| `POST /api/staff/auth/google` | Accepts only `{ credential }`; returns safe user/unit DTO and sets the signed session cookie. |
| `POST /api/staff/auth/logout` | Requires Origin + CSRF and clears the session/CSRF cookies. |
| `GET /api/staff/session` | Revalidates the session against current Gateway units and returns safe DTO only. |
| `GET /api/staff/locations` | Reads only public `Published_Locations`, filters by current authorized `unit_code`, and returns a canonical snapshot plus SHA-256 hash. |
| `POST /api/staff/requests` | Allows only the explicit intake DTO. Create rejects target/hash; update/correct/stop require an authorized fresh target. |
| `POST /api/staff/verification` | Builds the current snapshot server-side, rejects stale hashes with HTTP 409, and only then calls `writeVerificationEvent`. |

All responses are `no-store` and use `{ ok, data }` / `{ ok: false, error: { code } }`. Raw Gateway bodies,
private rows, credentials, cookie tokens, secrets, signatures, body hashes and Drive IDs are not returned.

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

## Snapshot and image boundaries

`lib/staff-location-contract.js` is the shared source of truth for `SNAPSHOT_FIELDS`, canonicalization and
stable stringify. The same module is included before Gateway V2 in the Apps Script build; Gateway behavior
and its 10 MiB decoded image limit remain unchanged. Vercel preflights images at **3 MiB decoded** because
the Vercel request platform limit is lower. Future PR #48 owns resize/compression UI.

## Cutover dependency

The public workbook must contain `unit_code` for ownership filtering. A current public record can still be
fresh while Gateway V2 has no matching private operational baseline. In that case the API returns
`STAFF_OPERATIONAL_BASELINE_NOT_READY` and does not retry or bypass Gateway ownership checks. A later,
approved cutover/reconciliation task must mirror/seeding operational records after candidate public-source
verification; PR #47 performs no migration or seeding.
