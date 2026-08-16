# 01 - Architecture

## Cập nhật rollout RAG 2026-07-17

- Namespace ứng viên `chatbot-tthc-xnc-web-rd-20260715` hiện có 503 vector: 157 thủ tục web/KBTT và 346 nguồn đã duyệt (152 `law`, 194 `guide`).
- Khi governance bật, truy hồi chạy theo tầng: ưu tiên `approved/current_procedure`; chỉ khi tầng này không có match mới nới sang `legal_basis`/`supplemental`. Cách này ngăn nguồn luật/hướng dẫn rộng lấn thủ tục cụ thể trong top-k.
- Code Graph: `api/chat.js` và `scripts/shadow-retrieval.js` cùng dùng `buildCurrentProcedureFilter()`/`buildGovernanceFilter()` từ `lib/retrieval-governance.js`; thay policy ở helper này ảnh hưởng cả runtime và thước đo shadow.
- Production đã thử cutover rồi rollback về `chatbot-tthc-xnc` do cổng generation chưa đạt; namespace ứng viên và backup migration được giữ nguyên.

## Published_Locations source guard update (2026-08-10)

| Module / file | Source guard responsibility |
|---------------|-----------------------------|
| `api/google-sheet.js` | Filters public fields, then requires semantic `name` and `coordinates`; source/schema mismatch returns `502 GOOGLE_SHEET_SCHEMA_MISMATCH`. |
| `js/location-data.js` | Resolves semantic columns; positional legacy fallback is allowed only for a complete 8-column legacy table. |
| `lib/published-locations.js` | Rejects a non-empty upstream dataset that yields zero valid locations and preserves an eligible stale last-known-good cache. |
| `scripts/verify-published-locations.js` | Read-only candidate-deployment smoke verifier; checks HTTP, semantic schema, row/valid/rejected counts and valid coordinates without printing Sheet IDs. |

Map data path: `Google GViz -> api/google-sheet schema guard -> js/location-data normalize -> map`.
Chat location data path: `Google GViz -> lib/published-locations schema/dataset guard -> cache -> api/chat`.

The GViz request must include `headers=1`. Without this explicit parameter, Google can infer a
second header row when the first public record is mostly text, folding that record's values into
the semantic column labels and causing the fail-closed schema guard to return
`GOOGLE_SHEET_SCHEMA_MISMATCH`.

`GET /api/google-sheet` only returns HTTP 200 for a public `Published_Locations` schema containing semantic
`name` and `coordinates` columns. It returns `502 GOOGLE_SHEET_SCHEMA_MISMATCH` for a source/config mismatch.

## Dual-workbook foundation (2026-08-10)

- `lib/location-workbooks.js` is the sole resolver for public location sources. Public map, chatbot,
  Vercel API and local `scripts/dev-server.js` reads use `PUBLIC_LOCATION_SPREADSHEET_ID`; only when it is absent can the current
  `GOOGLE_SHEET_ID` act as a compatibility fallback. Setting both to different values, or using the
  private workbook as the public source, fails closed before the Google GViz request.
- `PRIVATE_LOCATION_SPREADSHEET_ID` has no public fallback. The boundary declares
  `Published_Locations` public and `Unit_Allowlist`, `Location_Staging`, `Approval_Audit_Log`,
  `Staff_Verification_Audit`, `Idempotency_Ledger`, `Intake_Setup_Info` and Form Responses private.
- `scripts/dual-workbook-dry-run.js` accepts JSON exports only and is read-only. It inventories sheets,
  validates the P0 public schema and coordinates, classifies boundaries, compares record IDs and can write
  a local JSON cutover report. A target is not cutover-safe when its public dataset is empty/invalid,
  source records are missing or unexpected, stable IDs are duplicated, a private column is public, a
  source private sheet is absent, a shared record loses/invalidates/changes coordinates, its canonical
  public data changes, or a sheet crosses the declared boundary. Fidelity comparison canonicalizes
  approved Vietnamese/English labels and parsed coordinates per `record_id`. It rejects `--apply` and
  `--write`, including assignment forms.
- This foundation does not create workbooks, change Vercel/Production environment variables, migrate data,
  deploy, or add Staff Portal runtime. A candidate must pass the published-locations smoke verifier before
  alias promotion during any later cutover.

## Private Apps Script Gateway V2 (2026-08-11)

- `setup/staff-gateway.js` is the pure gateway core. It exposes only `resolveUnits`, `submitRequest`, and
  `writeVerificationEvent`, verifies raw-body HMAC before JSON parsing, enforces ±5 minute freshness,
  private-workbook config and explicit DTOs.
- `setup/location-intake/Code.gs` adapts Apps Script `PropertiesService`, `SpreadsheetApp`, `DriveApp`,
  `LockService` and `ContentService` to that core. `doPost(e)` verifies signature/action before opening
  the private workbook. The generated bundle includes `lib/location-workbooks.js` as the shared resolver.
- State-changing actions use private `Idempotency_Ledger` and Script Lock. `submitRequest` writes only
  private staging, validates image bytes server-side, uses deterministic Drive resource keys and never
  publishes an image. `writeVerificationEvent` writes only the private verification audit allowlist.
- The legacy Form setup intentionally does not create gateway-only ledger/verification sheets in the
  compatibility workbook. No gateway deployment, Staff Portal UI/auth, Vercel staff API or Production
  migration is included.

## Dual-workbook admin review (2026-08-15, stacked on PR #48)

Minimal Google Sheets/Apps Script admin approval so the project owner can review `PENDING`
requests from the Staff Portal without an Admin Web UI. Stacked on `feat/staff-location-portal-ui`
because it needs PR #48's staging/Gateway contract; not merged into `main` yet.

- `setup/location-admin-review.js` is the pure(-ish) engine — same DI shape as `setup/staff-gateway.js`
  (`pipeline`, `workbookConfig`, `runtime`, `privateStore`, `publicStore`). It does not call
  `SpreadsheetApp`/`DriveApp` itself. Two entry points: `reviewRequest()` (the three human menu
  actions — Duyệt/Từ chối/Yêu cầu xác minh thêm — requires `status === PENDING`) and
  `reconcileRequest()` (Đối soát — no status gate, derives the already-decided transition from the
  row's own `status`/`request_type` and completes whatever step didn't finish).
- Reuses `applyApproval`/`applyReviewAction`'s *shape* conceptually but does not call them directly:
  they assume one atomic single-workbook pass and would throw `TARGET_RECORD_ID_NOT_FOUND` on a
  STOP retry where the public row was already removed by a prior partial attempt. The admin engine
  instead calls `pipeline.buildPublishedRecord`/`pipeline.sameUnitCode`/`pipeline.buildAuditEntry`
  directly and does its own idempotent upsert/remove + dedup-by-`request_id`+`action` audit append +
  status-if-changed staging write — see `docs/brain/03-decisions.md` for why.
- `setup/location-intake/Code.gs` adds the GAS adapter: `adminPublicSpreadsheet_()` (new, mirrors
  the existing `gatewayPrivateSpreadsheet_()`), `requireLocationApprover_()` (Script Property
  `LOCATION_APPROVER_EMAILS` + `Session.getEffectiveUser().getEmail()`, fail closed), surgical
  single-row read/update/delete helpers (`adminFindRowNumber_`/`adminUpdateRow_`), and a second
  `SpreadsheetApp.getUi().createMenu('Bản đồ CA - Duyệt địa điểm')` appended inside the existing
  `onOpen()`. Every menu action first asserts the active spreadsheet is the private workbook.
  `onLocationStagingEdit` (legacy single-workbook trigger) gained a guard that no-ops if it ever
  fires against `PRIVATE_LOCATION_SPREADSHEET_ID`, since `writeLocationState_`'s `clearContents()`
  would corrupt the dual-workbook private sheets if that trigger were ever misinstalled there.
- `scripts/build-location-intake-apps-script.js` bundles `setup/location-admin-review.js` into
  `setup/location-intake/dist/Code.gs` alongside the existing pipeline/workbook-config/gateway files.

## Stack

| Layer | Cong nghe |
|-------|-----------|
| Frontend | HTML5 + Tailwind CSS 3 + Vanilla JS |
| Ban do | Leaflet.js 1.9.4 + Leaflet.markercluster 1.5.3 + OpenStreetMap tiles |
| LLM / Chat | DeepSeek V4 Flash (streaming SSE); Gemini chỉ fallback ổn định khi DeepSeek HTTP 429/5xx |
| Embedding / RAG | Gemini Embedding 001 + Pinecone vector DB |
| Backend API | Vercel Serverless Functions (Node.js 24.x — pin ở `.nvmrc` và `package.json` `engines.node`, CommonJS) + `@vercel/functions` `waitUntil`; CI gác cổng bằng đúng Node 24. Production/preview trên Vercel: xác minh qua API `GET /v9/projects/{id}` — `nodeVersion: "24.x"` (2026-08-06) |
| System prompt | Hardcode trong `api/chat.js` (`SYSTEM_PROMPT_BASE`) |
| Du lieu tru so | Google Sheets `Published_Locations` qua helper + proxy |
| Telemetry | Firebase Firestore + Firebase Realtime DB fallback |
| Rate limiting | Firebase Realtime DB, chỉ theo IP/ngày |
| CAPTCHA | Cloudflare Turnstile |
| Hosting | Vercel |
| CSS build | Tailwind CLI (`input.css` -> `output.css`) |

## Cau truc thu muc chinh

```text
bandocapt/
|- index.html
|- app.js
|- styles.css
|- input.css
|- output.css
|- data.js
|- data/
|  |- tthc-catalog.json
|  `- tthc-index.json
|- js/
|  |- chatbot.js
|  |- gemini.js
|  |- lazy-features.js
|  |- location-data.js
|  `- tthc-catalog.js
|- lib/
|  |- output-validator.js
|  |- location-workbooks.js
|  |- published-locations.js
|  |- request-security.js
|  |- regression-metrics.js
|  `- regression-grader.js
|- api/
|  |- chat.js
|  |- feedback.js
|  `- google-sheet.js
|- setup/
|- scripts/
|  |- generate-tthc-catalog.js
|  |- dual-workbook-dry-run.js
|  `- read-feedback.js
|- test/
|- assets/
|- vercel.json
`- package.json
```

## Staff Portal browser UI (PR #48, 2026-08-11)

- `/can-bo` is a static, mobile-first entry (`can-bo/index.html`). Its browser assets are split into
  `js/staff-portal.js` (state machine and safe DOM rendering), `js/staff-api-client.js` (same-origin
  Vercel DTO client), `js/staff-google-signin.js` (official GIS rendered button), `js/staff-image.js`
  (device-side image compression), and `styles/staff-portal.css` (design-system tokens).
- The browser boot sequence is `GET /api/staff/auth/csrf` then `GET /api/staff/session`. A valid session
  loads `GET /api/staff/locations`; a 401 renders login and `STAFF_ACCESS_REVOKED` clears private UI.
  The browser never reads the HttpOnly session cookie or decodes/stores the Google credential.
- State-changing calls carry the CSRF token in JS memory. API request DTOs are built explicitly; create
  omits target/hash, target mutations carry the displayed record/hash, verification carries only its
  confirmation DTO, and operation IDs are stable for the same retry payload.
- The static builder keeps `can-bo/index.html` unhashed while hashing every portal CSS/JS asset. Preview
  routing maps both `/can-bo` and `/can-bo/` to that entry. Vercel excludes both paths from the generic
  CSP and applies the narrow GIS CSP/COOP/no-store security headers.

### PR #48 code graph

```text
can-bo/index.html
  -> js/staff-portal.js
      -> js/staff-api-client.js -> /api/staff/* -> lib/staff-api.js
      -> js/staff-google-signin.js -> accounts.google.com/gsi/client
      -> js/staff-image.js -> browser canvas/FileReader only
  -> styles/staff-portal.css -> tokens.css
scripts/build-static.js -> dist/can-bo/index.html + hashed portal assets
vercel.json -> portal-specific CSP/COOP/no-store headers
```

## PR #48 staff contract remediation (2026-08-13)

- `js/staff-portal.js` marks image, coordinates and services as required for `create`, `update` and
  `correct`; `stop` keeps its intentional no-image/no-coordinate/no-services contract. Vietnamese field
  and Gateway validation messages are mapped without exposing internal diagnostics.
- `lib/staff-api.js` validates the recognized request text fields and `services` array at the Vercel
  boundary, returning `STAFF_REQUEST_INVALID` with HTTP 400 before any Gateway call. The existing
  server-derived email, authorized unit, target ownership and snapshot checks remain authoritative.
- `lib/staff-gateway-client.js` and `lib/staff-api-errors.js` allowlist the Gateway's user-actionable
  validation codes (`IMAGE_REQUIRED`, services/address/location/coordinate errors) while preserving
  generic handling for unknown or infrastructure failures.
- `setup/staff-gateway.js` classifies WebP with RIFF/WEBP byte signatures; JPEG, PNG and WebP remain
  validated from decoded bytes rather than browser MIME or filename.

### PR #48 remediation code graph

```text
js/staff-portal.js -> js/staff-api-client.js -> /api/staff/requests|verification
  -> lib/staff-api.js (boundary text/array validation, server authority)
  -> lib/staff-gateway-client.js (safe remote error mapping)
  -> Apps Script Gateway -> setup/staff-gateway.js (byte validation)
lib/staff-api-errors.js <- route adapters and browser error presentation
```

No route, deployment, workbook, migration, or public/private boundary change is included in this
remediation. Production 404 classification remains an external Vercel deployment/configuration check.

## PR #48 Gateway timeout policy (2026-08-14)

Real incident evidence (Apps Script Executions log) showed an image-bearing `submitRequest` took
26.633s end to end — `submitRequest`/`writeVerificationEvent` both hold Apps Script's project-wide
`LockService.getScriptLock()` for the whole operation (Sheets reads/writes plus, for `submitRequest`,
Drive image persist), which can legitimately exceed the old flat `DEFAULT_TIMEOUT_MS=8000`/`MAX_ATTEMPTS=2`
used for every Gateway action. The caller aborted at 8s and returned a false `STAFF_GATEWAY_UNAVAILABLE`
503 even though the Gateway went on to complete successfully (`Idempotency_Ledger` `COMPLETED`, one
`Location_Staging` row, one Drive file) — the browser saw a failure for an operation that actually
succeeded.

- `lib/staff-gateway-client.js` `callGateway()` now accepts a per-call `options.maxAttempts` (alongside
  the existing `options.timeoutMs`) instead of a single module-wide `MAX_ATTEMPTS`. New exported
  constants `MUTATION_TIMEOUT_MS=40000`/`MUTATION_MAX_ATTEMPTS=1` are the policy for lock-holding
  mutations; `DEFAULT_TIMEOUT_MS=8000`/`MAX_ATTEMPTS=2` remain the default for `resolveUnits` (observed
  1.8-2.6s, unchanged, still retry-capable since it never takes the Script Lock).
- `lib/staff-api.js` passes `timeoutMs: MUTATION_TIMEOUT_MS, maxAttempts: MUTATION_MAX_ATTEMPTS`
  explicitly on the `submitRequest` and `writeVerificationEvent` `gatewayCall(...)` sites only; the
  `resolveUnits` call site is untouched and keeps the client's defaults.
- `vercel.json` raises `maxDuration` to 45s for `api/staff/requests.js` and `api/staff/verification.js`
  (5s margin over `MUTATION_TIMEOUT_MS`) so the Vercel function itself isn't killed by the platform
  before `callGateway`'s own internal timeout can fire; `api/chat.js` already proves 60s is accepted on
  this account/plan.
- Automatic retry for `submitRequest`/`writeVerificationEvent` is now `attempts=1` by design: a second
  automatic attempt would arrive while the first is still holding the Script Lock and just queue behind
  it, wasting the caller's own timeout budget without doing useful work. Manual user retry stays safe —
  unchanged — via the Gateway's existing `request_id`/`body_hash` idempotency ledger (`GATEWAY.md`).
- `js/staff-portal.js` `submitModal()`/`renderModal()`: on a retryable server/network error the modal no
  longer rebuilds blank. Entered text/select/services values are kept in `state.modal.values` (in-memory
  only, no `localStorage`/`sessionStorage`, `image` explicitly excluded) and restored on re-render, so a
  false-503-looking failure doesn't read as "the Submit button did nothing." The image file input can
  never be programmatically restored by a browser, so the user is always asked to re-select it, with an
  inline hint when values were preserved.

No change to HMAC signing, freshness window, request-id/body-hash derivation, or any Apps Script code
(`setup/staff-gateway.js`, `Code.gs`) — this is caller-side timeout/attempts policy and UX only.

### Follow-up: mutation timeout margin widened again (2026-08-15)

A second live rehearsal produced a genuine `doPost` execution of 39.402s — the 40s value above left
almost no margin and still false-503'd on the browser's first submit (user then retried on the
UX-preserved form; the retry hit the now-`COMPLETED` idempotency ledger and returned in ~8.1s). Raised
`MUTATION_TIMEOUT_MS` to `50000` (~10.6s margin over the observed 39.402s) and `vercel.json`
`maxDuration` for `api/staff/requests.js`/`api/staff/verification.js` to `60` (matching `api/chat.js`'s
already-proven-safe ceiling on this account). `MUTATION_MAX_ATTEMPTS` stays `1`; `resolveUnits` untouched.
Same caveat as before: this is still evidence from individual observed durations, not a P50/P95
distribution — revisit if real traffic shows a wider spread than ~40s.

### PR #48 staff form simplification + Google Maps resolver (2026-08-15)

Principle: identity and unit are authoritative server/session data (never re-typed by staff); Google
Maps coordinates are derived automatically when possible, with manual entry as fallback only.

- `lib/staff-auth.js`/`lib/staff-session.js`: verified Google `name` claim (already present under the
  GIS button's default scope) is bounded and carried into the signed session alongside `sub`/`email`.
  `lib/staff-api.js` returns it as `user.name` from both `google`/`session`, and overrides
  `submitter_name` on `create`/`update`/`correct` from it — a client-submitted value is fallback-only.
- `js/staff-portal.js` `renderModal()`: `create` mode shows the unit read-only (single authorized unit)
  or as a `<select>` scoped to `state.units` (multiple) — never a free-text field; `update`/`correct`
  never show a unit control at all, since the target record's own unit is already authoritative
  (`findAuthorizedUnit(units, currentTarget.unitCode)`, unchanged). A `HEADQUARTERS` site type
  auto-fills the location name from the unit's own `unitName` when the field is still empty.
- New `lib/staff-maps-resolver.js` + `POST /api/staff/maps/resolve` (session + Origin + CSRF
  protected): resolves a pasted Google Maps URL, including `maps.app.goo.gl` short links, to
  `{ lat, lng }` server-side (browser has no CORS/direct path to Google's redirect chain). Reuses
  `isGoogleMapsUrl`/`parseCoordinates` from `setup/apps-script.js` — both the initial URL and every
  redirect hop are checked against that same host allowlist, `redirect: 'manual'` means the response
  body is never read, and one shared `AbortController` bounds total wall time across the whole chain
  regardless of hop count. See `docs/location-intake/STAFF_API.md` for the full contract.
- `js/staff-portal.js`'s `mapsField()` replaces the old free-text `coordinates` input with this
  resolver-driven UI (loading/success/error states + a hidden `coordinates` field the resolver
  populates); manual coordinate entry remains available as an explicit fallback. This is UX only — the
  Gateway's existing `classifyCoordinateStatus`/`parseCoordinates` (`setup/apps-script.js`, untouched)
  remain the sole authoritative check at actual submit time, regardless of how `coordinates` got filled.
- No Google Maps Platform API key, billing, geocoding or Places API was added — only the existing
  Maps-URL coordinate-in-URL convention, resolved server-side instead of requiring the user to extract
  it manually.

### Coordinate precedence in a Maps URL (2026-08-15)

A resolved Google Maps URL usually carries **more than one** coordinate pair, and they do not mean the
same thing. `parseCoordinates` in `setup/apps-script.js` therefore splits
`extractCoordinateCandidates()` (list every pair with its `source`) from `selectBestCoordinate()`
(pick by the explicit `COORDINATE_SOURCE_PRIORITY` constant), so the rule is not the accidental order of
a regex array:

| Priority | Source | URL shape | Meaning |
|----------|--------|-----------|---------|
| 1 | `PLACE_ENTITY` | `!8m2!3d<lat>!4d<lng>`, else bare `!3d!4d` | the place the link points at |
| 2 | `QUERY` | `?q=` `query=` `ll=` `destination=` `center=` | coordinate stated explicitly by the link author |
| 3 | `VIEWPORT` | `@<lat>,<lng>` | map camera. **Not the place** — Google fills it with a regional default when resolving a short link, so different places can share one `@` value |
| 4 | `RAW` | `lat,lng` | coordinates typed by staff |

`@` is de-prioritised, never dropped: a `/maps/@lat,lng,15z` URL still resolves. Bounds validation is
fail-closed on the **selected** candidate — a place entity outside Phú Thọ returns
`COORDINATES_OUTSIDE_SERVICE_AREA` rather than falling back to a viewport that happens to be in bounds.
Selection never considers distance between candidates. `parseCoordinates` returns an extra `source`
field for tests/debug; `resolveMapsCoordinates` still returns exactly `{lat, lng}`, so the Staff API DTO
is unchanged. `js/location-data.js` keeps a twin parser for the public map and follows the same
precedence, so the frontend and the authoritative server/Gateway path cannot diverge.

## Code Graph

| Module / file | Vai tro | Duoc goi boi | Phu thuoc vao |
|---------------|---------|--------------|---------------|
| `index.html` | Shell UI, tai JS nen va lazy loader; asset runtime duoc doi sang URL content-hash trong `dist/` | Browser | `output.css`, `styles.css`, `app.js`, `js/lazy-features.js` |
| `js/app-navigation.js` | Dieu phoi 3 tab mobile Ban do/Thu tuc/Hoi dap AI, dong bo `aria-current` va ghi nhan lan dau mo AI | `index.html` | public surface callbacks tu `app.js`, `js/chatbot.js`, `js/tthc-catalog.js` |
| `app.js` | Khoi tao Leaflet, tai tru so, tim kiem, marker/cluster, preview vi tri mobile | `index.html`, `js/app-navigation.js` | `js/location-data.js`, `api/google-sheet.js`, `data.js`, Leaflet.markercluster |
| `data.js` | Fallback tinh cho map khi Google Sheets loi | `app.js` | - |
| `js/location-data.js` | Normalize payload `Published_Locations`, parse toa do, bounds check, doc them `search_aliases` neu co | `app.js`, `lib/published-locations.js`, test | - |
| `js/gemini.js` | Goi `POST /api/chat` (parse SSE stream) va `POST /api/feedback` (`sendFeedback`); ky HMAC dung chung qua `signRequestToken`. (2026-08-06) Phan loai abort qua `abortReason`: `USER_CANCELLED`/`IDLE_TIMEOUT` (25s)/`REQUEST_TIMEOUT` (65s), uu tien `STREAM_ERROR`+`partialText` neu da co noi dung | `js/chatbot.js` | `api/chat.js`, `api/feedback.js` |
| `js/lazy-features.js` | Nap chat/catalog khi click/hover; pin SRI marked/DOMPurify, nap Turnstile sau chat, giu proxy deep-link `TthcCatalog`; loi tai hien thong bao retryable cho nguoi dung | `index.html` | `js/gemini.js`, `js/chatbot.js`, `js/tthc-catalog.js` |
| `js/chatbot.js` | UI chat, toggle panel, render stream; doi catalog/index de resolve deeplink theo ID -> title/alias, hien trang thai neu catalog thieu; dung `verifiedLocations` tao link chi duong hoac thong bao thieu toa do; action bar 👍/👎 + form bao cao | `js/lazy-features.js` | `js/gemini.js`, `window.TthcCatalog` |
| `js/tthc-catalog.js` | UI danh muc TTHC duyet 2 tang (3 view): home search-first + luoi 17 linh vuc gom 4 cum -> danh sach thu tuc/ket qua tim kiem (hang chia dong) -> chi tiet (tom tat + note phi + accordion). `parseProcedureSections`/`classifySection` nhan CA nhan TTHC ("Ho so:") lan nhan wiki danh so cua guide ("15.1. Trinh tu:"). Public `resolveProcedureId`/`openProcedure`/`openByTitle` giu nguyen (deep-link tu chat mo thang chi tiet); chi warm index nhe, catalog day du chi fetch khi mo panel | `js/lazy-features.js`, `js/chatbot.js`, `js/app-navigation.js` | `data/tthc-index.json`, `data/tthc-catalog.json` |
| `data/tthc-index.json` | Chi muc nhe `{procedure_id,title,aliases}` de chat doi chieu nhanh | `js/tthc-catalog.js` | `scripts/generate-tthc-catalog.js --index-only` |
| `data/tthc-catalog.json` | Catalog TTHC tinh de nguoi dung doi chieu cau tra loi AI | `js/tthc-catalog.js` | sinh tu Pinecone live + audit phi, fallback backup khi local khong co key |
| `lib/published-locations.js` | Fetch GViz Google Sheets, cache 60s, stale fallback 5m, dedupe/conflict, hop nhat alias va match tru so theo hoi thoai. T1.9: cau tra loi quoc tich ("Nguoi Viet Nam"...) KHONG phai dia danh — `NATIONALITY_ANSWER_PATTERN` loai khoi heuristic cau ngan; `isNationalityAnswerContext` cho `api/chat.js` ne nhanh tat dinh no_match khi bot vua hoi quoc tich | `api/google-sheet.js`, `api/chat.js`, test | `js/location-data.js`, Google Sheets GViz |
| `lib/location-workbooks.js` | Resolves public/private workbook IDs with fail-closed conflict and boundary checks; explicitly classifies sheet trust boundary | `api/google-sheet.js`, `lib/published-locations.js`, migration dry-run, test | environment contract only; never Google credentials |
| `lib/output-validator.js` | Fail-closed output guard: doi chieu va redact SDT/Maps/toa do/URL cong khai/so lieu phap ly khong co trong nguon xac minh; URL chi duoc giu khi xuat hien trong RAG/citation/tru so da duyet | `api/chat.js`, test | - |
| `lib/request-security.js` | CORS, lay IP, HMAC request, sanitize diagnostic va Telegram alert dung chung | `api/chat.js`, `api/feedback.js` | Node crypto, fetch |
| `lib/regression-metrics.js` | Dem tu Unicode-safe va giu ngan sach verbosity 120/250 dong bo voi prompt answer-first | `scripts/run-regression.js`, test | `Intl.Segmenter` Node 20 |
| `lib/regression-grader.js` | Bo cham regression 2 lop (T1.4 deterministic: required/forbidden facts, ngon ngu, verbosity; T1.5 grounding: Recall@4/MRR/source recall + fact-in-docs) doc tu `test/regression-expectations.json`; verdict PASS/HARD_FAIL/DEFERRED_FAIL, F01 deferred khong chan gate. Fact co the khai `grounding_patterns` rieng cho tai lieu va `grounding_exempt_patterns` cho loi tu choi do thieu bang chung, tranh bat cau abstention phai co trong corpus. T1.11: `detectLanguage` chi do mat do dau tren tu khong viet hoa dau | `scripts/run-regression.js`, test | `test/regression-expectations.json`, eval trace tu `api/chat.js` |
| `api/feedback.js` | Serverless nhan bao cao/phan hoi nguoi dung ve cau tra loi chatbot; tai dung CORS/HMAC/sanitize tu helper chung; rate limit best-effort IP/ngay + ghi `chat_feedback/<date_key>` tren RTDB voi TTL | `js/gemini.js` | `lib/request-security.js`, Firebase RTDB |
| `scripts/read-feedback.js` | Doc `chat_feedback/<date_key>` tu RTDB, in bao cao theo ngay (loc `--down`) de admin ra soat | Developer / cron | Firebase RTDB, `.env` |
| `api/google-sheet.js` | Proxy chi cho phep `Published_Locations`, giu response payload hien tai | `app.js` | `lib/published-locations.js` |
| `scripts/dual-workbook-dry-run.js` | Read-only JSON-export inventory and cutover comparison; validates P0 schema/coordinates and detects missing, unexpected or duplicate record IDs | Operator / test | `lib/location-workbooks.js`, `js/location-data.js` |
| `api/chat.js` | Serverless chinh: xac thuc, rate limit atomic chi theo IP/ngay (khong quota tong ngay/thang), RAG Pinecone; Gemini chi mot request embedding/cau hoi RAG, DeepSeek V4 Flash sinh cau tra loi va utility (rewrite/dich/rerank/tom tat/groundedness, utility tat thinking); strict default khong fallback, stable chi DeepSeek 429/5xx -> Gemini; T2C deadline/telemetry; stream model da validator. (2026-08-06) `startSseHeartbeat()` phat `status:generating` moi 5s trong luc cho generation, tranh client tu huy do idle timeout gia | `js/gemini.js` | Pinecone, Gemini/DeepSeek, Firebase, `@vercel/functions`, `data/tthc-catalog.json`, `lib/published-locations.js`, `lib/request-security.js` |
| `scripts/generate-tthc-catalog.js` | Sinh `data/tthc-catalog.json`; uu tien doc Pinecone live, mac dinh gom `tthc_*` + `guide_*` co noi dung (loc guide rong/noi bo), dedupe theo linh vuc+cap+ten, fallback backup khi local khong co env | Developer, test | `data/pinecone-backups/`, Pinecone, `.env`/`.env.local` |
| `scripts/scrape-phutho-tthc.js` | Thu thap tuan tu 18 linh vuc/chi tiet TTHC Cong an Phu Tho; sinh snapshot co hash + CSV doi chieu 39 record HIGH, khong tu dong approved/ghi Pinecone | Developer / nguoi duyet T3.3 | `https://congan.phutho.gov.vn/TTHC.aspx`, `data/corpus-governance-draft.csv` |
| `scripts/generate-phutho-xa-review.js` | Loc day du 43 muc cap xa tu snapshot; doi chieu corpus cu, de xuat tao moi/cap nhat/loai va sinh CSV + Markdown de nguoi dung duyet | Developer / nguoi duyet T3.3 mo rong | `data/tthc-phutho-source.json`, `data/corpus-governance-draft.csv` |
| `scripts/approve-phutho-xa-review.js` | Khoa quyet dinh duyet 42 thu tuc cap xa hien hanh va 1 luong Phieu/NA17 bi loai thanh manifest co hash snapshot; mac dinh dry-run | Developer / nguoi duyet T3.3 | `data/tthc-phutho-xa-review.csv`, snapshot TTHC |
| `scripts/import-phutho-xa-to-pinecone.js` | Nhap 42 thu tuc cap xa da duyet vao namespace Pinecone moi voi `RETRIEVAL_DOCUMENT`; kiem hash snapshot, backup manifest, verify vector 768 chieu va ho tro `--resume` | Developer duoc uy quyen | snapshot + manifest duyet, Pinecone, Gemini Embedding |
| `scripts/import-phutho-web-to-pinecone.js` | Mo rong nhap toan bo thu tuc hien hanh tren snapshot web (cap xa + cap tinh), tai su dung vector cap xa khi co, delay free-tier va resume | Developer duoc uy quyen | `data/tthc-phutho-source.json`, Pinecone, Gemini Embedding |
| `data/tthc-phutho-source.json` | Snapshot nguon tinh da trich xuat, giu URL/field/attachment/content_hash de doi chieu va phat hien thay doi | T3.3 reviewer | `scripts/scrape-phutho-tthc.js` |
| `data/tthc-phutho-xa-review.csv` | Bang duyet day du 43 muc cap xa, co facts nguon, doi chieu corpus cu va cot `final_decision` | T3.3 reviewer | `scripts/generate-phutho-xa-review.js` |
| `data/tthc-phutho-xa-review-decisions.json` | Manifest quyet dinh 42 `approve` / 1 `reject`, gan voi SHA-256 snapshot de T3.4/T3.5 khong nhap sai dot du lieu | T3.4/T3.5 | `scripts/approve-phutho-xa-review.js` |
| `data/tthc-phutho-high-review.csv` | Bang ghep an toan theo title + cap cho 39 record HIGH; `review_suggestion` van bat buoc kiem tay | T3.3 reviewer | snapshot nguon + governance draft |
| `scripts/apply-phutho-tthc-approvals.js` | T3.4 chi merge 17 doi chieu da duyet va KBTT giu nguyen; backup pre/post, verify metadata va bat bien text/vector | Developer duoc uy quyen | Pinecone, snapshot + manifest duyet |
| `scripts/patch-matt26265-mau-don.js` | Script mot-muc de xoa gia tri `mau_don` loi thoi cua `tthc_matt26265`; mac dinh dry-run, chi backup + upsert khi co `--apply`, giu nguyen vector/text/content_hash | Developer duoc uy quyen | Pinecone, `.env`, `data/pinecone-backups/` |
| `setup/apps-script.js` | Pipeline private allowlist/staging/audit -> public published approval. Phan quyen hai chieu: `authorizeSubmission` (unitName+email -> authorized?) va `resolveUnitsByEmail` (email -> units[], chua co caller runtime, prerequisite Staff Portal) | Google Apps Script, `test/location-pipeline.test.js` | SpreadsheetApp; `PRIVATE_LOCATION_SPREADSHEET_ID`, `PUBLIC_LOCATION_SPREADSHEET_ID` |
| `scripts/dev-server.js` | Local static server delegates `/api/google-sheet` to the production handler; never fetches or returns raw GViz directly | Developer | `api/google-sheet.js`, public workbook resolver/schema guard |
| `setup/staff-gateway.js` | Pure HMAC/freshness/action/idempotency/image/DTO gateway core for three private actions | `setup/location-intake/Code.gs`, Node security tests | `setup/apps-script.js`, `lib/location-workbooks.js` |
| `setup/location-admin-review.js` | Pure(-ish) dual-workbook admin review/reconciliation engine: `reviewRequest` (gated, PENDING only) + `reconcileRequest` (ungated repair); idempotent public upsert/remove, dedup-by-request_id+action audit, image-share-before-finalize ordering | `setup/location-intake/Code.gs` menu handlers, `test/location-admin-review.test.js` | `setup/apps-script.js` (`buildPublishedRecord`/`sameUnitCode`/`buildAuditEntry`, not `applyApproval` directly — see 03-decisions.md) |
| `scripts/preview-server.js` | Preview HTTP server dùng chung bởi Playwright global setup/teardown; tự đóng keep-alive connections | `test/e2e/global-setup.js`, `npm run preview` | Node `http` |
| `scripts/run-regression.js` | Runner regression API that, loc theo ID (ca ID hoi thoai H16/H17); gui `evalDebug:true`, cham 30 ca va bao cao latency tong cung p50/p95 theo tung stage eval-only, provider/fallback. `--strict-gate` chan hard fail/provider error; `--majority`/`--runs N` tong hop hard fail da so va flaky advisory | CLI / agent | `api/chat.js`, `lib/regression-grader.js`, `lib/regression-metrics.js`, expectations/conversations va `test/results/` |
| `scripts/repair-pinecone-temp-residence.js` | Script sua Pinecone `tthc_matt26265`: backup, re-embed, upsert UTF-8 sach, verify top-1 | CLI / agent | Pinecone, Gemini Embedding API, `.env`, `data/pinecone-backups/` |

## Luong xu ly chinh

### Luong ban do

```text
index.html load
-> app.js init
-> fetch /api/google-sheet?sheet=Published_Locations
-> lib/published-locations.js fetch Google GViz payload
-> js/location-data.js normalize/validate
-> render marker vao clusterGroup/selectedLayer
-> zoom < 14 gom cum; zoom >= 14 bung marker va hien nhan
-> chon marker mobile mo preview 164px, desktop mo detail sidebar
```

### Luong quan tri du lieu ban do

```text
Google Form submit
-> setup/apps-script.js onFormSubmit
-> Unit_Allowlist check
-> ghi Location_Staging + Approval_Audit_Log
-> admin approve/reject/revoke
-> Published_Locations update
```

### Luong chatbot RAG

```text
User nhap
-> js/chatbot.js
-> js/gemini.js
-> POST /api/chat
-> api/chat.js
   1. Verify CORS + Turnstile + HMAC
   2. Check rate limit Firebase: reserve atomic bang ETag/CAS cho tung IP/ngay; khong doc/ghi
      counter tong ngay/thang, nen luu luong cua IP khac khong khoa toan he thong
   3. Sanitize history
   4. Detect nhu cau tra tru so tu current message + recent history, gom ca cau dau ngan chi la dia danh
   5. Skip FAQ cache neu cau hoi co dia diem/PII
   6. Tai Published_Locations qua helper cache 60s / stale 5m
   7. Dedupe ban ghi giong nhau, phat hien ban ghi mau thuan
   8. Match ten tru so/alias exact-normalized theo uu tien: ten hien hanh day du -> bo `Cong an` -> ten xa/phuong hien hanh -> `search_aliases`
   9. (P1.1.3) Ghep ngu canh cau truoc vao query embedding CHI KHI cau hien tai < 8 tu (follow-up ngan); cau du dai dung doc lap.
   9b. (T3.7) Neu `detectUserLanguage(query) !== 'vi'`: dich query sang tieng Viet cho TRUY HOI (`translateQueryForRetrieval`, DeepSeek utility voi thinking tat) — corpus la tieng Viet, embedding xuyen ngu bo sot dung thu tuc. Fail-open: loi/timeout giu query goc. Ngon ngu TRA LOI van theo `userLang` goc. Sau do embed query -> Gemini Embedding 001 (mot request)
  10. Query Pinecone cho thu tuc/phap luat trong DUNG 1 namespace pin tu `PINECONE_NAMESPACE` (P1.1.1: bo vong thu nhieu namespace); van giu 1 fallback bo metadata filter neu co category ma 0 match. Tach intent `tam_tru_khai_bao` va `tam_tru_the`; voi `tam_tru_khai_bao`, chi giu lai tai lieu co `retrieval_intent` dung nhanh hoac tin hieu ro `NA17`/`KBTT`/nguoi nuoc ngoai/co so luu tru, dong thoi loai fail-closed tai lieu cu tru cong dan Viet Nam (`Thong bao luu tru`, `Dang ky tam tru`, `Luat Cu tru`, `VNeID`, moc 23h/08h)
  10a. (2026-07-18, phuong an A) Neu query co chu the NNN du dien dat gian tiep (quoc tich/lao dong/khach) thi loai tai lieu cu tru cong dan doc lap voi classify; neu tinh huong "moi den/den o" chua co doc KBTT trong pool thi query bo sung `retrieval_intent=tam_tru_khai_bao_nguoi_nuoc_ngoai` va giu 1 slot top-4 sau rerank. Neu RIENG query bo sung timeout/loi, giu nguyen ket qua query chinh va chen record `tthc_matt26265` da duyet tu `data/tthc-catalog.json`; khong lam mat toan bo RAG context.
  11. Loai runtime moi match `tru_so` khoi prompt va citation
  11b. Neu `detectXncAuthorityIntent` dung (thi thuc/gia han/the tam tru/e-visa/NNN mat ho chieu): bom tinh `XNC_RECEPTION_VERIFIED_BLOCK` (3 diem tiep dan Phong QLXNC, chi dia chi + SDT, chua co toa do) vao `<verified_locations>`, doc lap matcher
  11c. (P1.1.2) Rerank DeepSeek co dieu kien, thinking tat: bo qua (`shouldSkipRerank`) khi top-1 > 0.75 diem VA cach top-2 >= 0.05 — chi rerank khi con map mo
  11d. (T2A, gated `RAG_FAIL_CLOSED=1`) Neu khong co match RAG vuot nguong, khong co tru so xac minh va khong co khoi XNC: tra abstention tat dinh theo ngon ngu + `abstentionReason`, KHONG goi model generation. Eval-mode van dinh retrieval trace rong de grader khong bo qua grounding.
  11e. (2026-07-18, TT04) Neu nguoi dung hoi mat/cap lai the tam tru ma top RAG khong co dung bien the cap lai the tam tru, tra `DETERMINISTIC_PROCEDURE_GAP` bang tham quyen + 3 diem QLXNC da xac minh; khong goi generation de suy dien tu cap moi/cap lai the thuong tru.
  12. Inject `<verified_locations>` + `<retrieved_documents>` vao system prompt
  12b. (T2C) Moi fetch/retry/rerank/provider/stream read dung phan ngan sach con lai cua
       `CHAT_REQUEST_DEADLINE_MS` (mac dinh 55s); strict default khong fallback. Stable mode chi failover
       DeepSeek -> Gemini khi HTTP 429/5xx truoc khi da phat text hop le (khong fallback network/timeout).
  13. Stream Gemini 2.5 Flash / DeepSeek
  14. (T2B-1) Buffer đến hết câu/bullet, validate từng segment rồi mới phát SSE; `done.fullText`
      là phép nối chính xác các segment đã phát. Không đưa raw model text chưa validate lên UI.
      URL HTTP(S) chi duoc giu neu co trong tai lieu/citation/tru so xac minh; domain typo/tu tao bi redact truoc SSE.
  15. Ghi telemetry toi thieu, gom so luong/loai violation cua output validator va timing/provider/fallback;
      telemetry + groundedness check chay sau response qua Vercel `waitUntil`
  16. (P1.2.1) Sau `res.end()`, dang ky `checkGroundednessAsync` bang Vercel `waitUntil`: neu answer
      co so lieu, DeepSeek utility (thinking tat) doi chieu voi legalCorpus va ghi `groundedness_checks/<date>` vao
      Firebase — chi canh bao, khong chan response
-> SSE ve client
```

### Luong danh muc TTHC

```text
index.html load
-> js/lazy-features.js init (chat/catalog chua tai)
-> user mo chat: nap marked + DOMPurify (SRI) + gemini + chatbot + Turnstile
-> user mo "Danh muc thu tuc hanh chinh": nap js/tthc-catalog.js
-> chat warm fetch data/tthc-index.json same-origin; catalog day du chi fetch khi mo panel/chi tiet
-> fetch data/tthc-catalog.json same-origin khi can render danh sach
-> TANG 1: home search-first + luoi 17 linh vuc gom 4 cum (icon + so thu tuc)
-> TANG 2 (bam 1 cum hoac go tim kiem): danh sach thu tuc hang chia dong, meta dan la "Nop tai: cap xa/tinh/TW"
-> TANG 3 (bam 1 thu tuc): chi tiet = tom tat nhanh + note phi trung tinh (khong con hien "Chua xac minh") + accordion nhom (Ho so/Trinh tu/Yeu cau/Can cu phap ly/Khac)
-> nut Quay lai: chi tiet -> danh sach -> home; deep-link tu chat mo thang TANG 3

Developer chay `npm run gen:catalog` (hoac `npm run gen:catalog:index` neu catalog da duoc cap nhat)
-> scripts/generate-tthc-catalog.js
-> neu co PINECONE_API_KEY hop le: list/fetch Pinecone namespace, lay `tthc_*`, group `guide_*` co `Noi dung wiki` theo ten thu tuc
-> loai guide noi bo/rong, dedupe guide neu trung tieu de voi `tthc_*`, tom tat fee tu than muc phi/le phi, sort theo category/cap
-> neu khong co env hop le: fallback backup trong repo (va co the `--fetch-missing` cho 4 record thieu)
-> ghi data/tthc-catalog.json + data/tthc-index.json

Chat source co procedure_id/title
-> js/chatbot.js doi lazy catalog + index tai xong
-> window.TthcCatalog.resolveProcedureId(procedure_id, title)
-> uu tien ID chinh xac; ID cu/thieu thi fallback title hoac alias khop chinh xac
-> neu resolve duoc: render nut "Doi chieu trong danh muc" va mo dung chi tiet
-> neu source co procedure_id nhung khong resolve duoc: hien trang thai chua co trong danh muc
```

### Luong bo sung nguon cho T3.3

```text
Trang TTHC Cong an Phu Tho (18 linh vuc)
-> scripts/scrape-phutho-tthc.js (tuan tu, delay, retry)
-> data/tthc-phutho-source.json (157 thu tuc, URL + content_hash)
-> doi chieu title VA cap thuc hien voi 39 dong HIGH
-> data/tthc-phutho-high-review.csv
-> nguoi duyet chot final_* trong corpus-governance-draft.csv
-> T3.4 moi duoc phep backup + backfill Pinecone
```

Nguon tinh chi la bang chung duyet. Mot muc con hien tren website khong du de suy ra `approved/current`;
vi du website van dang dong thoi luong KBTT online va muc co ten phieu khai bao tam tru.

## Mo hinh du lieu / API

### `POST /api/chat`

```json
{
  "userMessage": "string (max 1000 ky tu)",
  "history": [{ "role": "user|model", "parts": [{ "text": "..." }] }],
  "captchaToken": "string",
  "evalDebug": "boolean (tuy chon, CHI eval-run non-production — xem T1.3)"
}
```

Headers bat buoc:

- `X-Request-Token`
- `X-Request-Time`

SSE response events:

- `{ "status": "generating" }` (P3.1: phát lần đầu sau khâu truy hồi, trước token đầu — client đổi nhãn typing "Đang tra cứu…" → "Đang soạn trả lời…"; client cũ bỏ qua an toàn). **(2026-08-06) Sau lần đầu, cùng event này được `startSseHeartbeat()` phát lại định kỳ 5s/lần trong suốt lúc backend chờ Gemini/DeepSeek hoặc buffer đến ranh giới câu cho output-validator** — heartbeat không mang nội dung câu trả lời, chỉ giữ kết nối sống và liên tục reset idle timeout phía client; dừng sạch khi response finish/close/error.
- `{ "text": "chunk" }`
- `{ "done": true, "fullText": "...", "history": [...], "sources": [...], "verifiedLocations": [{ "name": "...", "address": "...", "mapsUrl": "..." }] }`
- `{ "error": "..." }`

**(2026-08-06) Phân loại timeout/abort phía client (`js/gemini.js`):** không còn quy mọi abort về
1 mã `TIMEOUT` chung. `callGeminiStream` trả `USER_CANCELLED` (nút Dừng hoặc external signal),
`IDLE_TIMEOUT` (25s không nhận thêm dữ liệu — heartbeat liên tục reset mốc này), `REQUEST_TIMEOUT`
(hết ngân sách tổng 65s), hoặc `STREAM_ERROR` kèm `partialText` nếu đã nhận được một phần nội dung
trước khi bị abort (ưu tiên cao nhất, bất kể lý do abort). Mã `TIMEOUT` cũ vẫn được giữ trong
`js/chatbot.js` chỉ để tương thích ngược, luồng mới không còn phát mã này.

`verifiedLocations` chi co khi matcher `Published_Locations` tim thay tru so da xac minh. Client dung truong
nay de tao deeplink Google Maps, khong phu thuoc model co tu viet URL trong cau tra loi hay khong. `mapsUrl`
co the rong: khi do client van hien ten/dia chi va thong bao chua co toa do, khong tao link gia. Cac diem QLXNC
tinh chua nam trong matcher `Published_Locations` van khong duoc dua vao truong nay.

**Fail-closed abstention (T2A, gated `RAG_FAIL_CLOSED=1`, mặc định TẮT):** khi thiếu RAG hoàn toàn
(không match Pinecone vượt threshold + không có trụ sở xác minh + không có khối thẩm quyền XNC), event
`done` mang `finishReason:'RAG_ABSTAINED'` + `abstentionReason` (`no_pinecone_config`/`embedding_failed`/
`pinecone_error`/`no_relevant_match`); `fullText` là thông báo tất định theo ngôn ngữ, không gọi model.
Client (`js/gemini.js`) parse `done` chung nên field `abstentionReason` được bỏ qua an toàn, text vẫn render.

**Eval-mode output (T1.3):** event `done` đính thêm trường `eval` (trace retrieval cho bộ chấm
grounding) CHỈ khi đủ 3 điều kiện AND: `NODE_ENV !== 'production'` + `captchaToken === EVAL_BYPASS_TOKEN`
+ body `evalDebug: true` (`shouldAttachEvalDebug` trong `api/chat.js`). Production KHÔNG BAO GIỜ trả
`eval`. Cấu trúc: `{ standaloneQuery, classifyQuery, category, matchesRaw[], matchesFinal[] (kèm rank),
excluded[] (id + lý do: location_vector/wrong_branch/below_threshold/rerank_or_topk_cut), matchedDocs }`.

### `POST /api/feedback`

Nhan bao cao/phan hoi cua nguoi dung ve mot luot tra loi cua chatbot. Headers bat buoc khi co Origin:
`X-Request-Token`, `X-Request-Time` (HMAC ky tren chuoi `${turn_id}:${rating}`, cung cong thuc voi `/api/chat`).

```json
{
  "turn_id": "t_<ts>_<n>_<rand>",
  "rating": "up | down",
  "category": "sai_thong_tin | thieu_thong_tin | khong_lien_quan | ngon_tu | khac (tuy chon)",
  "comment": "string (<=1000, tuy chon)",
  "contact": "string (<=200, tuy chon)",
  "question": "string (<=4000, tuy chon)",
  "answer": "string (<=4000, tuy chon)",
  "sources": "[{ file, article, url, procedure_id }] (toi da 8)"
}
```

Response: `200 { ok: true }` · `400` (body/rating/turn_id/category sai) · `403` (origin/token) · `429` (rate limit IP/ngay) · `503` (khong ghi duoc). Luu vao RTDB `chat_feedback/<date_key>` (giờ VN), IP HMAC-hash, noi dung sanitize PII, co TTL `expires_at`. Ngoai le privacy co kiem soat: CO luu Q/A vi nguoi dung chu dong opt-in (xem 03-decisions).

### `GET /api/google-sheet`

Tra ve payload GViz da parse cua sheet `Published_Locations`. Public contract giu nguyen.

### `GET /data/tthc-catalog.json`

File tinh same-origin duoc copy vao `dist/` boi `scripts/build-static.js`. Frontend chi doc file nay de hien thi
danh muc doi chieu; runtime khong goi Pinecone tu trinh duyet.

## Bien moi truong

```text
GEMINI_API_KEY
PINECONE_API_KEY
PINECONE_INDEX_NAME
PINECONE_INDEX_HOST
PINECONE_NAMESPACE
FIREBASE_SERVICE_ACCOUNT_JSON
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
FIREBASE_DB_URL
FIREBASE_DB_SECRET
FIRESTORE_CHAT_COLLECTION
FIRESTORE_DIAGNOSTIC_COLLECTION
CHAT_LOG_HASH_SALT
CHAT_DIAGNOSTIC_LOG
CHAT_DIAGNOSTIC_LOG_APPROVED
CHAT_DIAGNOSTIC_LOG_UNTIL
CHAT_DIAGNOSTIC_LOG_SAMPLE_RATE
TELEMETRY_METRIC_RETENTION_DAYS
TELEMETRY_DIAGNOSTIC_RETENTION_DAYS
TURNSTILE_SECRET_KEY
ALLOWED_ORIGINS
DEEPSEEK_API_KEY
DEEPSEEK_MODEL
EVAL_BYPASS_TOKEN
GOOGLE_SHEET_ID
CHAT_DAILY_IP_LIMIT
FEEDBACK_DAILY_IP_LIMIT
FEEDBACK_RETENTION_DAYS
EMBED_TASK_TYPE
RAG_FAIL_CLOSED
LLM_PRIMARY
LLM_FALLBACK
LLM_UTILITY_MODEL
CHAT_REQUEST_DEADLINE_MS
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
```

Biến mới (2026-07-17):
- `LLM_UTILITY_MODEL` (T3.7): model tiện ích cho rerank / rewrite follow-up / dịch truy hồi.
  Mặc định `gemini-flash-lite-latest`. `gemini-2.5-flash-lite` cũ trả 404 "no longer available to
  new users" với một số key → rerank/rewrite/dịch âm thầm fail-open (no-op). Đặt env này để pin
  model cụ thể (vd giữ `gemini-2.5-flash-lite` nếu key production còn quyền).

Biến mới (2026-07-10):
- `EMBED_TASK_TYPE` (P2.2): khi đặt `RETRIEVAL_QUERY`, query embedding dùng taskType bất đối xứng —
  CHỈ bật đồng bộ với corpus đã re-embed `RETRIEVAL_DOCUMENT` (`setup/reembed-corpus.js`) sang namespace mới.
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` (P3.4): opt-in cảnh báo groundedness-fail và feedback 👎; thiếu → no-op.

Biến mới (2026-07-12):
- `RAG_FAIL_CLOSED` (T2A): đặt `1` để bật fail-closed abstention khi thiếu RAG. Chạy được cả
  production nhưng **mặc định TẮT**; không đặt → giữ hành vi cũ (model tự báo "không tìm thấy tài liệu").
  Bật + đo `--majority` (0 hard fail mới, 100% ca thiếu RAG từ chối đúng) trước khi coi là mặc định.

Biến mới (2026-07-13):
- `LLM_PRIMARY` / `LLM_FALLBACK`: thứ tự provider generation. **Từ 2026-07-28 (commit `e126799`): có
  `DEEPSEEK_API_KEY` thì mặc định là DeepSeek và KHÔNG có fallback ngầm** — `LLM_FALLBACK` không đặt thì
  `providerOrder` chỉ còn một phần tử. Muốn Gemini đỡ lưng phải đặt rõ `LLM_FALLBACK=gemini` (chế độ
  stable). Provider chỉ được đổi trước chunk hợp lệ đầu tiên, khi lỗi timeout/429/5xx/network — riêng
  DeepSeek→Gemini chỉ cho 429/5xx. Thiếu key hoặc cấu hình không hợp lệ thì provider đó bị bỏ qua.
- Stream kết thúc mà không có chữ nào (2026-08-06): thử lại non-stream **đúng provider đó** một lần, rồi
  mới sang provider kế tiếp nếu `providerOrder` còn phần tử. Vẫn rỗng thì trả `EMPTY_RESPONSE`;
  `BLOCKED_CONTENT` chỉ dành cho ca provider nói rõ là chặn (xem `classifyEmptyGenerationError`).
- `CHAT_REQUEST_DEADLINE_MS`: deadline chung của request, mặc định `55000`, phải thấp hơn Vercel
  `maxDuration` 60s. Mỗi stage dùng `min(stage cap, thời gian còn lại)` và hủy fetch/stream khi hết hạn.

## Luu y kien truc quan trong

- **CSP header** (P1.3.4): Content-Security-Policy KHONG con o meta tag trong `index.html` nua —
  chuyen sang header that trong `vercel.json` (route `/(.*)`), kem `X-Content-Type-Options: nosniff`
  va `Referrer-Policy: strict-origin-when-cross-origin`. 1 nguon su that duy nhat; sua CSP phai sua
  `vercel.json`, khong sua `index.html`. `frame-ancestors 'none'` chi hoat dong qua header (meta tag
  khong ho tro directive nay).
- **CORS** (P1.3.1-3): khong con gui `Access-Control-Allow-Credentials` (app khong dung cookie).
  `isAllowedOrigin` chi cho fallback so `x-forwarded-host` khi `process.env.VERCEL` ton tai (platform
  tu set header nay, client khong gia mao duoc); ngoai Vercel thi fallback bi tat. IP client cho rate
  limit uu tien `x-vercel-forwarded-for` -> `x-real-ip` -> `x-forwarded-for` (XFF client co the tu chen
  gia tri gia vao dau chuoi).
- `output.css` duoc commit va `npm run build` se tai tao lai file nay truoc khi tao `dist/`.
- Mobile duoi 768px dung bottom navigation co dinh 3 tab; chat/catalog la tab surface khong phai modal, va detail preview giu selection khi doi tab.
- Leaflet.markercluster duoc pin 1.5.3 tren unpkg voi SRI. `clusterGroup` chua marker thuong, `selectedLayer` giu marker dang chon noi tren cum; clustering tat tu zoom 14.
- `scripts/build-static.js` dung allowlist file ro rang va doi ten moi input (tru `index.html`) bang content hash;
  manifest `dist/asset-manifest.json` la cau noi cho deep-link/test. Khi them file runtime tinh nhu
  `js/tthc-catalog.js` hoac `data/tthc-catalog.json` phai them vao allowlist, neu khong preview/production se 404.
- `data/tthc-catalog.json` la snapshot tinh dung cho UI doi chieu; generator uu tien Pinecone live neu local co env hop le,
  nhung frontend van chi fetch file same-origin nay va khong goi Pinecone runtime tu browser.
- `.env.local` co the ton tai key Pinecone rong; generator bo qua gia tri rong va fallback ve `.env` thay vi coi nhu da cau hinh.
- FAQ cache trong `api/chat.js` la in-memory theo tung serverless instance, khong shared giua cac instance.
- Cau hoi co nhu cau tra dia diem/tru so khong duoc dung FAQ cache 1 gio de tranh dia chi cu sau khi Google Sheet cap nhat.
- `Published_Locations` la nguon runtime duy nhat cho ten don vi, dia chi, so dien thoai, toa do va Google Maps cua chatbot.
- `Location_Staging` va `Published_Locations` co the co cot tuy chon `search_aliases` (chuoi phan cach bang `|`) de luu dia danh cu/viet tat; runtime chi hien thi `name` la ten don vi hien hanh.
- Helper `lib/published-locations.js` cache fresh 60 giay, cho phep dung stale toi da 5 phut neu Google Sheets loi.
- Ban ghi trung hoan toan duoc gop va hop nhat alias. Ban ghi cung ten nhung khac dia chi/toa do thi chatbot khong tu chon, phai hoi lai user.
- Runtime mo ta dia gioi hien hanh theo mo hinh `tinh Phu Tho -> xa/phuong`; alias lich su chi duoc dung neu backend da match tu `search_aliases`.
- Vector Pinecone `tru_so` van duoc giu trong index de rollback, nhung runtime `api/chat.js` loai bo khoi prompt va citation.
- `Published_Locations` public khong doc `Form_Responses`; pipeline admin van di qua `Unit_Allowlist` -> `Location_Staging` -> `Published_Locations`.

## Location intake (2026-08-03)

- `setup/apps-script.js` is the single UMD/IIFE source of location intake rules. It runs in Node tests and in the generated Apps Script bundle; no business-rule copy is maintained in `docs/Form`.
- `scripts/build-location-intake-apps-script.js` concatenates the pure module with `setup/location-intake/Code.gs` into the generated deployable `setup/location-intake/dist/Code.gs`, and copies `setup/location-intake/appsscript.json` next to it so `dist/` is a complete clasp push root. The build refuses to emit a manifest missing the `webapp` block (`USER_DEPLOYING`/`ANYONE_ANONYMOUS`), because `clasp push` replaces the remote manifest wholesale and would otherwise delete the Staff Gateway Web App deployment that `STAFF_GATEWAY_URL` targets. Before updating a TEST deployment, rebuild this bundle from the checked-out commit; `test/location-intake-build.test.js` locks the request-type-aware image rule across `setup/apps-script.js`, `setup/staff-gateway.js`, and generated `Code.gs` so only CREATE remains image-required.
- The thin Apps Script runtime owns only Google integrations: Form, Spreadsheet, Drive, Maps redirect fetch, Script Properties, installable triggers, LockService, menu and health check.
- Intake flow is `Unit_Allowlist -> Location_Staging -> Published_Locations -> api/google-sheet.js -> js/location-data.js/app.js/chatbot`. A unit may own many `record_id`; all update/report/stop operations require and operate on `target_record_id`.
- `Published_Locations` has a public allowlist schema. `api/google-sheet.js` filters the GViz table again before responding, so accidental internal columns cannot leak through the proxy.
- `scripts/migrate-published-locations.js` migrates exported JSON in dry-run mode by default and writes only an explicit output file on `--apply`; it never changes a production sheet.
- Deploy/run bằng `clasp` (`npm run clasp:push|clasp:run|clasp:logs`, pin `@google/clasp@3.3.0` qua `npx`, không thêm dependency). Push root là `dist/`, cấu hình môi trường (`.clasp.json`, `.clasprc.json`, `clasp-creds*.json`) không commit. Xem `docs/location-intake/CLASP.md`.
- **(2026-08-09) Phân quyền có hai chiều, cùng nguồn sự thật.** `authorizeSubmission(unitName, email, rows)`
  kiểm tra một đơn vị mà **người gửi tự khai** (đường Google Form). `resolveUnitsByEmail(email, rows)`
  đi chiều ngược: từ email suy ra `[{ unitCode, unitName }]` được phép — cần cho Staff Portal vì
  client không được quyết định `unit_code`. Cả hai dựng trên `buildAllowlistMap`, nên tập đơn vị hai
  chiều **không thể lệch nhau**; `buildAllowlistMap` hiện lọc `active`, bỏ dòng thiếu `unit_name` và
  có semantics duplicate **last-row-wins**. Health gate Portal phải chặn duplicate xung đột trước
  rollout, không được coi behavior này là merge dữ liệu. `resolveUnitsByEmail` hiện **chưa có caller
  runtime** — nó là prerequisite của kế hoạch `docs/location-intake/STAFF_PORTAL_PLAN.md` (chưa triển khai).
- **(2026-08-09) Staff Portal dùng dual-workbook boundary.** Public read tiếp tục đi qua
  `GOOGLE_SHEET_ID` → `Published_Locations`; private operational sheets (allowlist, staging, audit,
  verification, idempotency ledger, setup và Form Responses) chỉ Apps Script/backend trusted đọc/ghi qua
  `PRIVATE_LOCATION_SPREADSHEET_ID`. Admin approval là public write duy nhất qua
  `PUBLIC_LOCATION_SPREADSHEET_ID`; cross-workbook approval recover theo `request_id`, không coi
  `LockService` là transaction phân tán.
- **(2026-08-09) Playwright preview lifecycle.** Không dùng `webServer: npm run preview` vì Windows
  có thể giữ npm child process sau khi test xong. `globalSetup` start/stop `preview-server` trong
  cùng runner và server đóng keep-alive connections; đây là test infrastructure, không thay đổi
  production runtime.
- **(2026-08-09) Staff Portal retry/auth contracts.** Browser tạo `operationId` UUID ổn định cho
  một thao tác; Vercel derive `requestId` từ verified session email + action + operationId để HTTP
  retry không duplicate staging/Drive/audit. `POST /api/can-bo/confirm` luôn cần `recordId` +
  `snapshotHash` + `operationId`; `/auth/google` là ngoại lệ duy nhất không cần pre-existing session
  nhưng vẫn bắt buộc Origin, Google credential verification và IP rate limit.
- **(2026-08-09) Staff Portal Drive crash recovery.** `Idempotency_Ledger` private claim một
  `image_resource_key` deterministic trước side-effect. Upload persist `image_file_id` trong cùng
  script lock trước staging append; retry crash lookup theo resource key, reuse/cleanup idempotently.
  Cleanup và ledger state update hoàn tất trong lock, nên retry không thể reuse file đang bị attempt
  trước xóa.
- Apps Script API không có UI và không có bảng đang mở, nên runtime tách đôi: hàm menu (`healthCheckLocationIntake`, `*Selected*`) chạm `getUi()`/`getActiveRange()` và chỉ dùng trong Sheet; hàm `api*` (`apiHealthCheckLocationIntake`, `apiReviewLocationRequest`, `apiLocationIntakeSnapshot`) trả giá trị và gọi được qua `clasp run`. `setupLocationIntakeSystem` rơi về Script Property `LOCATION_SPREADSHEET_ID` khi `getActiveSpreadsheet()` trả null.
- Provider generation theo `LLM_PRIMARY`/`LLM_FALLBACK` (xem "Bien moi truong 2026-07-13"): mac dinh
  van la Gemini ke ca khi co `DEEPSEEK_API_KEY` — key nay chi tu dong lam **fallback** (khi
  `LLM_FALLBACK` khong dat rieng) va **CHI** duoc thu truoc khi da phat chunk hop le dau tien, gap
  timeout/429/5xx/network/block. Muon DeepSeek lam primary phai dat `LLM_PRIMARY=deepseek` ro rang.
## [2026-07-16] T3.6 retrieval governance

- Runtime có cờ `RAG_GOVERNANCE_FILTER=1`: Pinecone chỉ nhận record `approved` + `current_procedure`; hậu kiểm thêm ngày hiệu lực và cấp xã/tỉnh. Fallback không được bỏ các điều kiện governance hoặc cấp người dùng nêu rõ.
- Namespace ứng viên `chatbot-tthc-xnc-web-rd-20260715` có 157 vector: 156 thủ tục website hiện hành và record KBTT trực tuyến `tthc_matt26265`; Phiếu/NA17 không được đưa vào nội dung retrieval.
- Metadata mới: `cap_normalized`, `canonical_procedure_key`, `submission_channel`, `support_authority`. Hai nguồn hiện hành cùng khóa thủ tục mâu thuẫn fact quan trọng sẽ trả `RAG_CONFLICT`, không gọi model để suy đoán.
  - Hai intent tạm trú (`tam_tru_khai_bao`, `tam_tru_the`) phải truy vấn cả metadata `xuat_nhap_canh` của snapshot website; hậu kiểm split-intent vẫn chỉ giữ tài liệu đúng nhánh. Citation cho nguồn TTHC cho phép chính xác domain `congan.phutho.gov.vn`.
  - Importer website luôn liệt kê namespace đích trước dry-run/apply, từ chối namespace production hoặc namespace đã có record nếu không có `--resume`; chỉ `--resume` mới fetch các ID dự kiến để tái sử dụng vector.
  - Governance dùng policy theo vai trò nguồn, áp dụng thống nhất ở Pinecone filter và hậu kiểm: `tthc` phải `approved/current_procedure`; `law` phải `approved/legal_basis`; `guide` phải `approved/supplemental`. Record thiếu/mismatch `source_type`, `source_priority`, `review_status`, hết hiệu lực hoặc `superseded` đều fail-closed. Ràng buộc cấp chỉ áp dụng cho `tthc`/`guide`; `law` không bị loại vì không có cấp.
  - **[2026-07-17] Cap là ưu tiên MỀM (không phải ràng buộc cứng).** Vai trò nguồn + hiệu lực fail-closed là cứng; cấp thực hiện chỉ thu hẹp kết quả KHI có thủ tục đúng cấp người dùng nêu. `api/chat.js` nới fallback governance theo thứ tự `(lĩnh vực+cap) → (lĩnh vực, bỏ cap) → (bỏ cả hai)` — giữ lĩnh vực lâu hơn cấp; `filterGovernedMatches` trả nhóm governed cấp khác nếu 0 match đúng cấp. Lý do: namespace web có đăng ký xe chỉ ở cấp tỉnh trong khi dân nộp ở cấp xã → cap cứng sẽ khiến bot từ chối oàn. Doc retrieve mang "Cấp thực hiện" để model nêu cấp thật.
  - Context tối đa 4 tài liệu luôn giữ một `current_procedure` nếu có; chỉ nguồn này sinh `[FACTS ĐÃ XÁC MINH]`. Header RAG ghi rõ vai trò để `legal_basis`/`supplemental` không ghi đè facts vận hành.
  - `scripts/backfill-law-guide-governance.js` chỉ gắn nhãn law/guide và đặt record chưa có quyết định thành `pending`; dry-run báo riêng các guide `Toàn văn thủ tục`. `--apply`/`--rollback` bắt buộc xác nhận namespace, lưu full record (vector + metadata), retry verify và rollback bằng upsert.

## Vercel Staff API Gate (PR #47, 2026-08-11)

- **Auth boundary:** `api/staff/auth/{csrf,google,logout}.js` and `api/staff/{session,locations,requests,verification}.js`
  are thin route adapters over `lib/staff-api.js`. `lib/staff-auth.js` verifies Google ID tokens with
  `google-auth-library`; `lib/staff-session.js`, `lib/staff-csrf.js`, and `lib/staff-origin.js` own the
  cookie, double-submit token, and exact Origin policy.
- **Authorization boundary:** `lib/staff-api.js` calls `lib/staff-gateway-client.js` `resolveUnits` for
  login and every protected request. Unit ownership is derived from the Gateway response and public
  records are filtered by normalized `unitCode`/`unit_code`; no private workbook is read by Vercel.
- **Mutation flow:** browser `operationId` -> server derives `request_id` from verified Google `sub`, action,
  and operation ID -> server validates current public target/snapshot and explicit allowlisted fields ->
  `staff-gateway-client` signs the exact UTF-8 JSON envelope -> private Gateway performs final validation and
  idempotency. Transport retry reuses the exact body/request ID with a fresh timestamp signature.
- **Snapshot contract:** `lib/staff-location-contract.js` is UMD so the same canonical field allowlist and
  stable serialization are bundled before the Apps Script Gateway by `scripts/build-location-intake-apps-script.js`.
  Vercel and Gateway therefore compute the same `snapshot_hash`; stale or cross-unit mutations fail closed.
- **Operational limits:** Vercel staff responses are no-store and map Gateway failures to safe codes. Vercel
  rejects decoded images over 3 MiB; the private Gateway retains its independent 10 MiB decoded cap.
- **Image semantics (2026-08-16):** CREATE requires a new image at the browser, Vercel, Gateway and
  staging boundaries. UPDATE and legacy CORRECT accept no replacement image; Admin Review uses the
  authoritative current public `image_url` and latest approved private file pointer instead of any
  browser-supplied retained-image value. A replacement image remains private until APPROVE.
- **Configuration/dependency:** server runtime requires `GOOGLE_CLIENT_ID`, `STAFF_SESSION_SECRET`,
  `STAFF_GATEWAY_URL`, `LOCATION_GATEWAY_SECRET`, and explicit `PUBLIC_LOCATION_SPREADSHEET_ID` (with the
  existing public resolver rules). `google-auth-library` is the only new runtime dependency. This PR adds
  no UI, migration, seed, production env mutation, or deployment.

### PR #47 code graph

```text
api/staff/auth/* ─┐
api/staff/{session,locations,requests,verification}.js
                  └─> lib/staff-api.js
                      ├─> staff-auth.js -> google-auth-library
                      ├─> staff-session.js / staff-csrf.js / staff-origin.js
                      ├─> staff-gateway-client.js -> Apps Script Gateway /exec
                      ├─> published-locations.js -> public Published_Locations
                      └─> staff-location-contract.js -> same contract in Gateway bundle
```
