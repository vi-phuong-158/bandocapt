# Staff Portal browser contract

The `/can-bo` page is a presentation layer over the Vercel Staff API from PR #47. It does not call Apps
Script or read either workbook directly.

## Browser flow

1. Load `GET /api/staff/auth/csrf`; keep the returned token in JavaScript memory.
2. Load `GET /api/staff/session`. A valid session goes to locations; HTTP 401 shows the Google login.
3. Login uses the official `https://accounts.google.com/gsi/client` rendered button. The callback posts
   only `{ credential }` to Vercel. The browser does not decode, log, or persist that credential.
4. `GET /api/staff/locations` returns only the server-filtered authorized locations and their current
   snapshot hash. `record_id` and the hash remain in memory and are not shown as operator fields.

## Mutations

All POST mutations use `credentials: same-origin` and `X-Staff-CSRF`. The client builds allowlisted DTOs:

- create: `operationId`, request type, selected authorized unit and editable fields; no target/hash;
- update/correct: `operationId`, request type, target record ID, snapshot hash and editable fields;
- stop: operation ID, request type, target record ID, snapshot hash and review note;
- confirm: operation ID, record ID, snapshot hash, `eventType=CONFIRM` and optional note.

The operation ID is reused for a retry of the same payload. The UI never claims that a public record was
published; successful requests say they were sent and are awaiting review. A 409 stale snapshot stops
submission, reloads locations, and asks the operator to review the new record. There is no silent retry.

## Image and security boundaries

Images are accepted as JPG, PNG or WebP and compressed in the browser toward 2.5 MiB, below the Vercel
3 MiB decoded preflight. The Gateway remains authoritative for magic bytes and its own limit. API text is
rendered with DOM node creation and `textContent`, never interpolated into HTML.

The route has `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`, `frame-ancestors 'none'`,
and a route-specific CSP allowing only the official GIS script, its iframe, style and connect endpoints.
`Cross-Origin-Opener-Policy: same-origin-allow-popups` is scoped to the portal for GIS popup compatibility.

## Operational dependency

This PR does not migrate or cut over Production workbooks, seed the private operational baseline, change
Production environment variables, or implement admin review/approval UI. If the API returns
`STAFF_OPERATIONAL_BASELINE_NOT_READY`, the portal displays the safe support message and does not bypass
the server check.
