# 03 — Technical Decisions

## [2026-09-04] R1: Map-First Civic App Design Closure & Accessibility Arbiter

- **Bối cảnh:** Vòng thiết kế giao diện chính hoàn thiện theo hướng Map-first civic app. Cần giải quyết dứt điểm desktop reachability gap (vốn bị hoãn lại từ R2a/R3A), nâng cấp tìm kiếm hỗ trợ dịch vụ thủ tục hành chính, chuẩn hoá cấp bậc thông tin (information hierarchy) và loại bỏ hoàn toàn việc hiển thị giờ làm việc mặc định giả.
- **Quyết định 1 — Desktop single-sidebar lifecycle:**
  - `#search-panel` và `#detail-panel` loại trừ lẫn nhau (mutual exclusion). Khi vào `DETAIL`, `#search-panel` ẩn với transition mượt mà (`opacity: 0; pointer-events: none; transform: translate3d(-12px,0,0)`).
  - Nút `#back-to-list-btn` ("Quay lại danh sách") cho phép quay lại `BROWSING` với query tìm kiếm, chip lọc đang chọn và danh sách kết quả được bảo toàn nguyên vẹn.
  - Không bổ sung `PANEL_STATES.RESULTS`: SEARCH và RESULTS đều thuộc bề mặt `BROWSING`.
- **Quyết định 2 — Đồng bộ trợ năng theo Viewport (`syncSearchPanelAccessibility`):**
  - Trạng thái `inert` và `aria-hidden` của `#search-panel` phụ thuộc chặt chẽ vào cả `activePanelState` và `isMobileViewport()`:
    - Desktop + BROWSING: active (`inert=false, aria-hidden="false"`).
    - Desktop + DETAIL: `inert=true, aria-hidden="true"`.
    - Mobile + BROWSING: `inert=true, aria-hidden="true"` (search panel ở ngoài màn hình, chặn focus bàn phím/screen reader).
    - Mobile + MOBILE_SEARCH: active (`inert=false, aria-hidden="false"`).
    - Mobile + DETAIL: `inert=true, aria-hidden="true"`.
  - Được gọi từ `applyPanelChrome` (sole state writer) và `syncPanelsToViewport` khi co giãn qua 768px.
- **Quyết định 3 — Tìm kiếm theo nhãn dịch vụ chuẩn hóa:**
  - Copy placeholder: `"Tìm Công an xã/phường, địa chỉ hoặc dịch vụ"`.
  - `matchesSearch` tìm kiếm trên nhãn dịch vụ canonical (`canonicalServiceCodes(loc)` + `serviceLabel()`). Gõ "căn cước" khớp `IDENTITY`, "cư trú" khớp `RESIDENCE`, "đăng ký xe" khớp `VEHICLE_REGISTRATION` mà không hard-code taxonomy mới.
- **Quyết định 4 — Trung thực dữ liệu giờ làm việc & tách biệt lưu ý thủ tục (P0):**
  - `#detail-hours-container` chỉ hiển thị khi có `serviceSchedule` thật từ dữ liệu nguồn. Tuyệt đối không hiển thị giờ hành chính mặc định ("07h30–11h30 | 13h00–16h30").
  - Lưu ý thủ tục (`procedureNote` và `cccdServiceMode`) được hiển thị độc lập tại `#detail-procedure-note`.
- **Quyết định 5 — Kiểm định số điện thoại sử dụng được (`getUsablePublicPhone`):**
  - Loại bỏ các giá trị không hợp lệ: chuỗi rỗng, "Cập nhật sau...", khoảng trắng và chuỗi không có số điện thoại hợp lệ (< 7 chữ số).
  - Khi không có số điện thoại: ẩn link điện thoại và nút Gọi điện bằng `.detail-action--unavailable` (`display: none !important`), chuyển `#detail-actions-grid` sang `grid-cols-1` để nút Chỉ đường chiếm trọn bề ngang.
- **Bảo toàn PR #70:** Giữ nguyên vẹn ranh giới `api/chat.js` và `lib/published-locations.js`, không gây conflict khi PR #70 được merge vào `main`.

## [2026-09-03] R3A: map-selection/panel/drag-dismiss state hardening is forward-ported onto PR #66's taxonomy/filter UX, not restored from the superseded branch

- **Decision:** PR #66 (`f975702`, merged to `main`) is canonical for taxonomy/filter product
  behavior — single-select service-filter chips, `isIdentityLocation`-based classification, "Gần
  tôi" as a pure sort/center action with no Top-N hiding. The R0.5/R1/R2a/R2b work built on the
  earlier `fix/public-location-update-ux` branch diverged from this (different checkbox filter,
  different classification predicates) and cannot be merged as-is (see the R3 conflict review this
  decision follows). Only the **state-lifecycle invariants** R1/R2a/R2b proved — not their UI or
  taxonomy assumptions — are carried forward, onto a fresh branch based on current `main`.
- **What was actually wrong on `main` before this port, independent of the taxonomy question:**
  `main`'s `app.js` had the *exact* R1/R2a/R2b bugs already fixed once on the abandoned branch: (1)
  `filterAndRender`/`fetchHeadquarters` wrote `loc._visible` and touched marker layer membership as
  two separate, non-atomic statements at each call site; (2) `showMobileSearch`'s deselect called a
  bare `marker.setIcon(...)`, never moving the marker out of `selectedLayer`; (3) the mobile
  search-overlay's DOM chrome was duplicated inline across `showMobileSearch`/`hideMobileSearch`
  with every entry point manually remembering to close other surfaces first; (4) the Escape handler
  read `closeSearchBtn.offsetParent !== null`, true whenever the viewport is mobile-width regardless
  of whether the overlay is open; (5) `endSheetDrag` resolved a full dismiss by calling
  `setSheetState(HIDDEN, ...)` directly, bypassing selection cleanup. None of these are related to
  which taxonomy/filter model is canonical — they are the same structural risk class regardless of
  what decides a location's visibility.
- **Mechanism:** `setLocationVisible(loc, visible)` (R1) is the sole writer of `loc._visible`;
  `applyPanelChrome(state, opts)` (R2a) is the sole writer of `activePanelState`/
  `document.body.dataset.panelState` and mutual-exclusion arbiter between browsing/detail/mobile-search;
  `endSheetDrag` (R2b) routes a resolved-to-HIDDEN drag through the existing `closeDetailPanel()`
  instead of a bare sheet-state write. None of the three touch `canonicalServiceCodes`,
  `isIdentityLocation`, `matchesServiceFilter`, or `centerOnNearestVisible` — the taxonomy/filter
  layer and the state-lifecycle layer are orthogonal by construction, which is what made this port
  possible without redesigning PR #66's UX.
- **Test policy:** old E2E assertions written against `#filter-police`/`#filter-id`/`#filter-nearby`
  checkboxes were rewritten against the current `.service-chip[data-service]` chips — the invariant
  under test is unchanged, only the interaction target. No product behavior was changed to make an
  old test pass; where a test's own mechanism no longer matched reality, the test was updated, not
  the product.
- **Not decided here:** the desktop `#detail-panel`-covers-`#search-panel` reachability gap (R2a) is
  unchanged — a layout question, explicitly out of scope. PR #65 (`fix: close chatbot
  location-context leak`) carried this UI chain plus one independent chat-safety commit
  (`8403147`); the safety commit is forward-ported separately below (R3D) since it never touched
  UI/taxonomy code, and PR #65 itself is left open for the owner to close as superseded.

## [2026-09-03] R3D: chatbot location-context fail-closed fix forward-ported from PR #65's `8403147` onto current `main`

- **Decision:** `8403147` (`fix(chat): fail closed on missing location evidence`) never touched
  `app.js`/taxonomy code — it is a self-contained `api/chat.js` + `lib/published-locations.js` fix,
  independent of the R0.5–R2b UI chain it happened to share a branch with. `main`'s copies of both
  files were byte-identical to `8403147`'s parent (PR #66 never touched them), so it cherry-picks
  cleanly with zero code conflict; only this doc's own concurrent entries conflicted, resolved by
  keeping both.
- See the `[2026-09-01]` entry immediately below for the fix's own content (current-turn-scoped
  location evidence, fail-closed output buffering, ambiguous-match refusal).

## [2026-09-01] Location evidence is current-turn scoped and fail-closed

- **Decision:** A service intent such as `CITIZEN_ID`/CCCD only requests the location-resolution
  branch; it never supplies a location. A concrete location may be resolved only from the current
  user message or from a short immediate answer after the assistant's explicit location question.
- **History boundary:** Arbitrary recent user turns are not location evidence. This prevents an old
  location from being reused after a topic change and keeps conversation state request-scoped.
- **Safety boundary:** `no_match` and `unavailable` are passed to the model as structured status,
  but generation is buffered and checked server-side before SSE. A specific station/address/phone/
  Maps claim causes a deterministic generic location-evidence fallback. `ambiguous_*` never selects
  an option automatically.
- **Isolation:** `lib/published-locations.js` may cache only the shared published dataset. It does
  not cache messages, history, or last-location state; `/api/chat` has no module-level conversation
  state.

## [2026-08-31] One location marker with unified site/service taxonomy

- **Decision:** One physical location has one stable `record_id` and one marker; it may have N services. `site_type` is physical (HEADQUARTERS, PUBLIC_SERVICE_CENTER, SECONDARY_OFFICE, MOBILE_POINT, OTHER) while `services` is capability data.
- **Compatibility:** `CITIZEN_ID_POINT` remains readable as a legacy physical-type value and old storage service keys remain readable without an automatic Production migration. Unknown write values fail closed. The new identity UI category maps legacy CITIZEN_ID/E_IDENTIFICATION only for display; it does not invent either service for missing data.
- **Public mutation:** Anonymous UPDATE/STOP is allowed only after both Vercel's fresh public target lookup and the Gateway's private operational target check agree on the selected `record_id` and `unit_code`. The browser never receives private metadata and all requests remain pending review.

## [2026-08-25] PR-1: sink inversion thay vi boc `ask()` khoi `api/chat.js`

**Boi canh.** De tai dung RAG cho kenh thu hai (Messenger), can mot ranh gioi giua dieu phoi
va transport. De xuat ban dau la boc mot ham `ask()` tra ve `{ answer, sources, ... }`.

**Van de.** Khong ton tai ham nhu vay de boc. Handler dai ~1.295 dong voi 12 diem thoat ghi
thang vao `res` nam rai rac trong pipeline, va `emitValidatedSegments` chay validator grounding
TANG DAN roi `res.write()` ngay ben trong vong kiem. Cau tra loi chi ton tai nhu bien tich luy
cua vong stream. Boc `ask()` = viet lai duong tra loi cua website dang chay.

**Quyet dinh.** Dao nguoc huong: chen mot lop sink thay vi boc ham ra.

    res.writeHead(200, H)     -> sink.open(H)
    res.write(`data: ...`)    -> sink.event(payload)
    res.end()                 -> sink.close()
    res.status(n).json(p)     -> sink.fail(n, p)
    res.headersSent           -> sink.isOpen
    startSseHeartbeat(res)    -> sink.startHeartbeat()

- `SseSink` tai tao dung tung byte hien tai -> website khong doi hanh vi.
- `BufferSink` nhan cung chuoi su kien trong bo nho -> kenh khac dung lai DUNG pipeline
  grounding/validator cua website, khong phai mot ban sao long hon.
- `ask()` neu can sau nay chi la wrapper mong tren core + `BufferSink`.

**Ranh gioi da chot.** Sink bat dau tu `isClearlyOutOfScope` (diem thoat SSE dau tien). Moi thu
phia tren — CORS, method, validate body, HMAC, Turnstile, rate limit theo IP — GIU NGUYEN tren
`res`: theo kien truc muc tieu day la transport rieng cua kenh website, khong dung chung voi
kenh khac, nen chuyen chung sang sink chi tao churn ma khong co loi ich.

**Heartbeat chuyen vao sink.** `startSseHeartbeat` phu thuoc `res.writableEnded`/`destroyed` va
event `close`/`finish` — vong doi stream Node ma sink trong bo nho khong co. De no o tang dieu
phoi thi interface sink buoc phai mo phong vong doi stream va abstraction hong ngay. Ham duoc
chuyen sang `lib/response-sink.js` va van re-export tu `api/chat.js` de test hien co khong doi.

**Cong kiem chung.** Golden SSE byte-identical 7 kich ban, sinh TREN baseline truoc khi sua
(commit rieng), phu: writeHead 4-header va 3-header, text/done event, end, `status().json()`
giua orchestration, vong stream day du voi validator tang dan, nhanh empty-generation, va ca
hai nhanh cua `headersSent` trong catch.

**Khong lam trong PR-1.** Khong co code Messenger. Khong doi provider/retrieval/grounding/
validator/timeout. Khong wire `BufferSink` vao handler — do la viec cua PR-4.

## [2026-08-24] Admin Review authorization remains effective-user fail-closed, with read-only diagnostics

- **Decision:** Keep `Session.getEffectiveUser().getEmail()` as the authorization identity for the
  human menu action, normalized through the shared allowlist parser. An empty identity or missing
  `LOCATION_APPROVER_EMAILS` remains a hard deny; the active-user email is diagnostic evidence only
  and is not used as a privilege-escalation fallback.
- **Why:** Apps Script distinguishes the current active user from the account under whose authority
  execution runs. Without Production session evidence, silently switching identities would hide a
  container/authorization problem and could authorize the wrong account. The new read-only diagnostic
  reports both values and both allowlist matches so the next runtime rehearsal can classify the cause.
- **Diagnostic contract:** `Kiểm tra cấu hình duyệt` does not call `requireLocationApprover_()` and
  does not mutate Sheets, Drive, staging, audit, or public records. It reports workbook resolver and
  boundary status, allowlist presence (not its value), both session emails, match results, and required
  sheet/schema status. The diagnostic is implemented in the dedicated container-bound bundle only.
- **Consequence:** Production Script Properties, workbook data, Apps Script project identity, and
  deployment are unchanged by this code task. A live run is still required to identify whether the
  incident is configuration, stale artifact, wrong container, or Google session authorization.
## [2026-08-25] Public Turnstile sitekey is environment-aware without a new function

- **Decision:** serve only `{ turnstileSiteKey }` from the existing
  `/api/location-contributions?config=public` GET path, selecting `TURNSTILE_SITE_KEY` when
  configured and retaining the existing public sitekey as a safe fallback.
- **Why:** Preview needs a dedicated TEST/hostname-authorized sitekey, while adding another Vercel
  function would exceed the Hobby function-count limit already addressed by this branch.
- **Security boundary:** `TURNSTILE_SECRET_KEY` remains server-only; the public configuration DTO
  contains no secret, workbook identifier, Gateway URL, or private metadata. No CAPTCHA bypass is
  introduced.

## [2026-08-30] Public contribution GET accepts native same-origin browser metadata without weakening POST origin checks

- **Decision:** Keep explicit `Origin` validation for all requests when it is present. For anonymous
  `GET /api/location-contributions` only, accept an absent `Origin` solely when the browser supplies
  `Sec-Fetch-Site: same-origin` and a `Referer` whose origin exactly matches the forwarded request host.
- **Why:** Chromium omits `Origin` on the page's own same-origin GETs, which otherwise makes both
  Turnstile configuration and the safe unit list unreachable. Browser JavaScript cannot set `Origin`.
- **Security boundary:** A raw missing-Origin request, mismatched Referer, cross-site Fetch Metadata,
  and every POST still return `403`. POST keeps the existing Origin, request-signature, CAPTCHA,
  rate-limit, Gateway, and private-workbook gates.

## [2026-08-22] Legacy published records use a separate private operational baseline

- **Decision:** choose Option A: a provenance-marked private `Operational_Baseline` read model seeded
  from the current public snapshot through a dry-run-first reconciliation. Do not make the Gateway read the
  public workbook at runtime and do not insert synthetic `APPROVED` staging/audit history.
- **Why:** it preserves the public/private boundary, keeps current Gateway availability independent of a
  public GViz request, retains current staging/approval/idempotency semantics, and allows a deterministic
  count/fidelity gate before any owner-approved data write. Option B would couple the private mutation
  boundary to a public-reader service and weaken the documented fail-closed architecture.
- **Data contract:** baseline rows contain only the public snapshot allowlist plus source/status/version
  provenance. Duplicate IDs, unknown units, malformed provenance, mismatch with public snapshot, and
  count drift are blockers. A later approved staging row may supersede a same-unit baseline row; cross-unit
  conflicts fail closed.
- **Consequence:** this change adds only local source/tests/dry-run documentation. It does not deploy,
  create a Sheet, seed a baseline, alter public data, or authorize a Production mutation.

## [2026-08-17] Ảnh địa điểm công khai: một ảnh, lightbox nhẹ, không nới hợp đồng công khai

- **Quyết định — KHÔNG mở rộng schema để làm gallery nhiều ảnh.** Backend hiện tại là **một ảnh
  cho một bản ghi**: `Location_Staging.image_file_id` (một) → `Published_Locations.image_url`
  (một). Không có cột nào mang danh sách ảnh. Task yêu cầu gallery *nếu data model đã hỗ trợ*;
  nó không hỗ trợ, nên phần "nhiều ảnh" cố tình không làm. Thêm cột chỉ để có gallery sẽ kéo theo
  Gateway, staging, admin review và migration — vượt xa phạm vi hiển thị.
- **Quyết định — lightbox dùng lại đúng `src` của hero, không tự dựng URL khác.** Hero đã là
  `drive.google.com/thumbnail?id=...&sz=w1000` (đủ lớn cho mọi viewport). Dùng lại đúng URL đó
  nghĩa là: mở ảnh lớn **không phát sinh request mới** (cache hit, mở tức thì), và không tồn tại
  kịch bản "hero tải được nhưng ảnh lớn hỏng" cần xử lý riêng. Đây cũng là lý do không thêm
  error handler thứ hai cho lightbox — theo luật "không xử lý lỗi cho kịch bản không thể xảy ra".
- **Quyết định — hero vẫn `object-cover`, chỉ lightbox mới `object-contain`.** `#detail-hero` là
  một **banner có badge + tiêu đề đè lên**, không phải khung xem ảnh; đổi nó sang `object-contain`
  sẽ tạo hai dải trống và làm chữ tiêu đề nằm trên nền rỗng — tức là redesign popup, điều task
  cấm. Nhu cầu "xem đúng tỷ lệ, không crop" được đáp ứng ở lightbox, nơi ảnh hiển thị toàn vẹn.
- **Quyết định — `pointer-events-none` cho overlay không tương tác trong hero.** Khối badge+tiêu đề
  và badge khoảng cách là **nhãn**, nhưng vì `absolute ... z-10` nên chúng chặn cú bấm vào ảnh ở
  giữa hero (phát hiện bằng visual acceptance: Playwright báo `<div class="absolute bottom-6 ...">
  intercepts pointer events`). `#back-to-list-btn` **không** được đụng tới vì nó là control thật.
  Đánh đổi: không bôi đen chọn được chữ tiêu đề — chấp nhận, đổi lấy toàn bộ ảnh bấm được.
- **Quyết định — `--z-lightbox: 2100`, cố ý nằm ngoài thang token 0–400.** Nhóm launcher/cửa sổ
  chat và catalog dùng z-index cũ hardcode 1999–2001, vốn đã phá thang token từ trước. Lightbox
  phải phủ chúng, nếu không nút "Hỏi đáp AI" nổi đè lên ảnh đang xem. Chọn nâng đúng một biến của
  mình thay vì refactor z-index của chat/catalog — đó là việc không liên quan tới task này.
  Ràng buộc bằng assertion E2E so sánh z-index thực tế, để không ai vô tình hạ xuống.
- **Quyết định — fixture E2E đặt ảnh ở bản ghi thứ HAI, không phải bản ghi đầu.** Các spec sẵn có
  (`detail-panel`, `civic-mobile-ui`) bấm `.result-item` đầu tiên và khẳng định đúng hành vi mobile
  của ca **không ảnh** (hero ẩn, `#location-preview` hiện). Cho bản ghi đầu có ảnh sẽ làm hai spec
  đó đỏ — sửa fixture còn hơn sửa test của người khác để hợp ý mình.
- **Không đổi:** không thêm field/endpoint/schema/dependency; không nới `img-src` (CSP hiện tại đã
  có `drive.google.com` + `*.googleusercontent.com`); không đổi DTO filtering, ranh giới
  public/private workbook, hay semantics giữ-ảnh-cũ khi UPDATE không kèm ảnh (vẫn do
  `setup/location-admin-review.js` quyết định ở server, không tin browser).

## [2026-08-16] Staff Portal gộp UX chỉnh sửa và giữ ảnh cũ ở server

- **Quyết định:** `/can-bo` chỉ gửi `Cập nhật địa điểm đang có` cho mọi chỉnh sửa location hiện hữu;
  nút/mode CORRECT bị bỏ khỏi UI nhưng Gateway, staging và Admin Review vẫn hiểu request type CORRECT
  lịch sử. CREATE vẫn bắt buộc một ảnh mới; UPDATE/CORRECT không bắt buộc ảnh.
- **Giữ ảnh:** khi duyệt UPDATE/CORRECT không có `image_file_id`, Admin Review lấy `image_url` từ
  current target trong `Published_Locations`, không tin browser. `published_image_file_id` được lấy
  từ dòng staging đã APPROVED gần nhất cùng `record_id` nếu có; legacy record chỉ có URL public vẫn
  được duyệt và giữ URL, nhưng STOP không thể revoke Drive file khi private history không có ID.
- **Thay ảnh:** khi có ảnh mới, pipeline vẫn upload private, chỉ công khai trong APPROVE và ghi file ID
  mới. Sharing của ảnh cũ sau replacement hiện **STILL_PUBLIC**; thu hồi ảnh cũ cần một failure model
  reconciliation riêng nên được ghi follow-up, không mở rộng task này.
- **Không đổi:** snapshot hash/authoritative refresh, unit ownership, CSRF/Origin, HMAC Gateway,
  dual-workbook boundary, STOP và confirm semantics.

## [2026-08-16] Ghi dòng dữ liệu vào Google Sheet luôn ở định dạng plain text

- **Quyết định:** mọi ghi **dòng dữ liệu** vào các sheet location (`Location_Staging`,
  `Published_Locations`, `Approval_Audit_Log`, `Idempotency_Ledger`) phải đi qua
  `writeLocationValues_(range, values)` trong `setup/location-intake/Code.gs`, hàm này gọi
  `range.setNumberFormat('@')` trước `range.setValues(values)`. Chỉ hàng **tiêu đề** được phép gọi
  `setValues` trực tiếp.
- **Lý do:** `Range.setValues()` để Google Sheets tự suy kiểu. Chuỗi toàn chữ số bị ép thành
  number và **mất số 0 đứng đầu** — `"0210000049"` trở thành `210000049`. Live rehearsal ngày
  2026-08-16 xác nhận lỗi này làm hỏng `public_phone` ở staging rồi lan sang
  `Published_Locations.phone`, tức mọi số điện thoại Việt Nam hiển thị sai trên bản đồ công khai.
  Mọi cột của các sheet này về bản chất đều là văn bản (record_id, số điện thoại, mốc thời gian
  ISO, chuỗi toạ độ, JSON), nên plain text là kiểu đúng chứ không phải giải pháp chữa cháy.
- **Đánh đổi:** không thể sắp xếp/tính toán các cột này như số ngay trong Sheet. Chấp nhận được —
  đây là bảng lưu trữ vận hành, không phải bảng phân tích, và tính toàn vẹn dữ liệu quan trọng hơn.
- **Ràng buộc bằng test:** `test/location-intake-build.test.js` khẳng định đúng 5 điểm ghi dữ liệu
  dùng helper và mọi `setValues` trực tiếp còn lại chỉ ghi `[headers]`/`[missing]`. Test này sẽ đỏ
  nếu ai đó thêm một đường ghi mới bỏ qua helper.
- **Lưu ý dữ liệu cũ:** các ô đã bị ép kiểu từ trước **không** tự khỏi. Bản ghi cũ cần sửa lại thủ
  công hoặc nộp lại; bản vá chỉ chặn hỏng mới.

## [2026-08-15] Dual-workbook admin review — reconciliation model, reviewable states, conflict scope

Stacked on PR #48 (`feat/staff-location-admin-review` from `feat/staff-location-portal-ui`), not
merged. See `docs/brain/01-architecture.md` "Dual-workbook admin review" for the file map.

- **Decision — do not call `applyApproval`/`applyReviewAction` directly for the admin engine.**
  Both assume one atomic single-workbook pass: STOP's branch throws `TARGET_RECORD_ID_NOT_FOUND`
  when the public row is already absent. That is correct for a genuine "target never existed"
  mistake but wrong for a *retry* after a crash that already deleted the public row — exactly the
  case dual-workbook reconciliation must recover from. `setup/location-admin-review.js` instead
  calls the pure leaf functions directly (`buildPublishedRecord`, `sameUnitCode`, `buildAuditEntry`)
  and does its own idempotent public upsert/remove, `request_id`+`action`-deduped audit append, and
  status-if-changed staging write. This is reuse of the actual business rules (same field mapping,
  same audit shape, same ownership check), not a parallel reimplementation of them.
- **Decision — write order is staging status LAST.** For APPROVE-flavored transitions: public
  write/skip → (non-stop only) Drive image share → audit append (dedup) → staging status flip.
  For STOP: public remove/skip → audit append (dedup) → staging status flip → best-effort image
  revoke. Because staging status is the very last write, a PENDING row that crashed mid-transition
  is *still PENDING* on the next attempt — so the primary human action ("Duyệt yêu cầu đã chọn")
  is naturally retry-safe without needing the separate reconcile path for the common crash windows
  (F1/F3/F4 in the test matrix). A row that reached a terminal status is, by construction, fully
  finalized — there is no dangling step 4.
- **Decision — `APPROVAL_PUBLIC_CONFLICT` only applies to CREATE, not UPDATE/CORRECT.** The spec's
  Case A/B/C framework ("public exists but content differs from expected → fail closed") is only
  self-consistent for CREATE, where `target_record_id` is fresh/server-generated and nothing should
  legitimately be there yet. For UPDATE/CORRECT the target *always* pre-exists (it's the approval's
  own precondition, already checked as `TARGET_RECORD_ID_NOT_FOUND` otherwise) and its old content
  is *expected* to differ from the new content — that difference is the entire point of approving
  an update. Comparing old-vs-new content and failing closed on a mismatch would block every
  legitimate update. UPDATE/CORRECT instead revalidates exactly what item 24 of the task spec scopes
  for it — ownership (`sameUnitCode`) + target existence — and unconditionally upserts; content
  equality is checked only to skip a redundant Sheet write on retry, never to fail. Confirmed by a
  failing test before this fix: `buildStaging` with an unrelated `original` fixture — the ONLY
  observed diff was the intentionally-changed `address` field, which a naive content-equality
  conflict check flagged as `APPROVAL_PUBLIC_CONFLICT`.
- **Decision — reviewable states are `{PENDING}` only; `NEED_VERIFICATION` and `BLOCKED` are not
  further reviewable in this minimal tool.** The task spec explicitly asked not to guess this and
  to decide after auditing existing semantics. `applyReviewAction` itself has no state-machine guard
  (it would happily re-reject an already-rejected row), and there is no Staff Portal resubmission
  flow that brings a `NEED_VERIFICATION`/`BLOCKED` row back to `PENDING` — reviewing either further
  would be undefined business behavior. `{APPROVED, REJECTED, REVOKED}` show "Yêu cầu này đã được xử
  lý."; `NEED_VERIFICATION`/`BLOCKED` fail closed with `REQUEST_NOT_REVIEWABLE`. Revisit when/if a
  resubmission flow is designed.
- **Decision — `reconcileRequest` (Đối soát) is a superset of `reviewRequest`, not a separate
  business path.** For a `PENDING` row it runs the exact same approve-flavored transition as
  clicking "Duyệt" (request_type alone determines create/update/correct vs stop, and request_type
  never changes). For `APPROVED`/`REVOKED` rows it re-runs the same transition as a pure repair —
  every step inside is dedup/idempotent, so it is safe to call on an already-fully-done row (only a
  still-failing image share, if any, actually retries). For `REJECTED`/`NEED_VERIFICATION` it only
  ensures the private audit entry exists (no public involvement ever). For `BLOCKED` it is a no-op
  reporting nothing to reconcile.
- **Decision — image ordering is asymmetric between APPROVE and STOP, matching the spec's own risk
  framing.** APPROVE: public content (with a deterministic `drive.google.com/uc?...` URL) is written
  *before* `DriveApp.setSharing`; a sharing failure aborts before any private mutation, so the row
  stays exactly `PENDING` and a retry only needs to retry the sharing call — the primary risk being
  guarded is an unapproved image becoming world-readable. STOP: the business transition (public
  removal + `REVOKED` status) commits first; image-revoke is best-effort afterward and a failure does
  not block or roll back the transition — the primary risk (stale/wrong public *data* staying live)
  is worse than a still-shared image for a few more minutes, and revoke is separately retryable via
  Đối soát.
- **Decision — `sameUnitCode` added to `setup/apps-script.js`'s exports.** It already existed
  internally and is used by `applyStagingRecord`/`applyApproval`'s own guards; the task spec names it
  as one of the four functions to reuse. Purely additive (one new key in the returned object), no
  behavior change to any existing caller.
- **Decision — no new trigger.** `onOpen()` in the shared `setup/location-intake/Code.gs` gained a
  second menu (`Bản đồ CA - Duyệt địa điểm`) rather than installing a new installable trigger — the
  task spec explicitly forbids adding one. Each menu action asserts `SpreadsheetApp.getActiveSpreadsheet()`
  equals the resolved private workbook before doing anything, so the menu is a safe no-op/clear-error
  if this Apps Script project's container binding isn't the private workbook. `onLocationStagingEdit`
  (legacy) also gained a defensive early-return if it ever fires on the private workbook's ID, since
  its `writeLocationState_` unconditionally `clearContents()`s three sheets — a real corruption risk
  if that trigger were ever accidentally re-installed there.
- **Consequence:** No Admin Web UI, no new npm dependency, no Production workbook touched, no change
  to Staff Portal (`/can-bo`) behavior, and `LOCATION_APPROVER_EMAILS` is a Script Property (never a
  literal email in source).

## [2026-08-15] PR #48 Google Maps coordinate precedence: place entity beats viewport

- **Evidence (live resolve 2026-08-15, 3 real short links):** every resolved final URL carried **two**
  different coordinate pairs, and all three URLs — three *different* places in Việt Trì — shared the
  identical viewport `@21.3140333,105.4126319`. Google fills `@` with a regional default camera when it
  resolves a short link, so `@` is not the place at all. The place lives in the `data=` blob as
  `!8m2!3d<lat>!4d<lng>`. Distance from the place to the operator's own reading: 74.6 m / 17.6 m / 26.7 m;
  from the shared viewport: 158.3 m / 545.3 m / 294.8 m.
- **Decision:** coordinate selection is by **semantic source**, with an explicit priority constant:
  `PLACE_ENTITY (!3d!4d) > QUERY (q|query|ll|destination|center) > VIEWPORT (@) > RAW`. The old parser
  took the first matching regex from an array whose first entry was `@`, which silently made *array
  order* the business rule. Extraction (`extractCoordinateCandidates`) is now separate from selection
  (`selectBestCoordinate`) so the rule is readable and testable.
- **Decision:** `@` is de-prioritised, never dropped. A `/maps/@lat,lng,15z` URL has no better source and
  must keep resolving (regression R5).
- **Decision:** selection never uses distance between candidates. "The two points are close, pick either"
  is not a rule — a trụ sở marker needs the entity coordinate, and proximity would silently accept the
  camera whenever the camera happened to be near.
- **Decision:** bounds validation stays fail-closed *on the selected candidate*. If the place entity falls
  outside Phú Thọ, the result is `COORDINATES_OUTSIDE_SERVICE_AREA` — it does **not** fall back to a
  lower-priority viewport just to pass bounds (regression R8).
- **Decision:** when a URL carries several `!3d!4d` pairs (search/directions blobs), the canonical
  `!8m2`-anchored block is preferred, then the first pair. Deterministic, no ambiguity fallback.
- **Trade-off:** `parseCoordinates` now returns an extra `source` field. It is internal/debug only —
  `resolveMapsCoordinates` still returns exactly `{lat, lng}`, so the Staff API DTO is unchanged and no
  new field reaches a sheet. Callers read named fields, so the additive field is safe.
- **Trade-off:** the operator's acceptance coordinates are manual readings that do not appear literally in
  any URL (17–75 m from Google's own place centroid). Returning them exactly would require a fixture→
  coordinate mapping, which is forbidden and would not generalise. The parser returns the place entity
  coordinate; regression tests assert that exact value plus a 100 m acceptance envelope.
- **Unchanged:** resolver security (HTTPS-only, Google host allowlist on the original URL *and* every hop,
  `redirect:'manual'` so no body is read, `MAX_REDIRECTS=5`, one shared 6 s deadline), Phú Thọ bounds,
  session/CSRF/Origin gate, Gateway HMAC and idempotency, and the paste→loading→✅ UX.

## [2026-08-15] PR #48 staff form simplification: authoritative identity/unit, Maps URL resolver

- **Decision:** Identity and unit are authoritative server/session data — the form never asks staff to
  re-type their unit or name when the system already knows it. `create` shows unit read-only (one
  authorized unit) or as a `<select>` scoped to `state.units` (multiple); `update`/`correct` never show
  a unit control since the target record's own unit is already authoritative server-side (unchanged).
  `submitter_name` is overridden server-side from the verified Google `name` claim when present.
- **Decision:** Google Maps coordinates are derived automatically when possible. New
  `lib/staff-maps-resolver.js` + `POST /api/staff/maps/resolve` follows Google Maps short-link
  redirects (`maps.app.goo.gl` etc.) server-side and returns `{ lat, lng }`. Manual coordinate entry is
  a fallback only, reached on resolver failure or by explicit user choice — never the default UI.
- **Decision:** No new coordinate-parsing implementation. The resolver reuses the existing
  `isGoogleMapsUrl`/`parseCoordinates` from `setup/apps-script.js` via `require()` rather than
  duplicating regex patterns; the Gateway's `classifyCoordinateStatus` (unchanged) stays the sole
  authoritative validator at actual submit time — the resolver is UX only.
- **Decision (SSRF):** The resolver is not a generic URL fetch proxy. Both the initial URL and every
  redirect hop must pass `isGoogleMapsUrl` (HTTPS + Google-owned host allowlist) before being followed;
  a redirect to any other host is rejected before the fetch happens. `redirect: 'manual'` means the
  response body is never read (only the `Location` header on 3xx). One shared `AbortController` bounds
  total wall time (6s default) across however many hops occur; `MAX_REDIRECTS=5` bounds hop count
  independently. All failure modes collapse to a small, already-existing error vocabulary
  (`COORDINATE_INVALID_LINK`/`COORDINATE_NEEDS_REVIEW`/`COORDINATE_OUTSIDE_PHU_THO`, plus one new
  `MAPS_RESOLVE_UNAVAILABLE` for transport-level failures) rather than inventing a parallel taxonomy.
- **Decision:** No `Staff_Allowlist` or other new identity store — verified Google identity plus the
  existing `Unit_Allowlist`-backed `resolveUnits` was already sufficient; adding a database would have
  been unjustified scope for what a session field addition already solves.
- **Rejected:** Making the visible `mapsUrl` input HTML5 `required` — an existing record can have valid
  preloaded `coordinates` with an empty stored `google_maps_url` (e.g. legacy data), and blocking native
  submission in that case would force a pointless re-paste. The actual requirement (coordinates present)
  is checked explicitly in `submitModal()` instead, uniformly regardless of how they were obtained.
- **Consequence:** No auth model change, no new Google Maps Platform API key/billing, no reverse
  geocoding, no Apps Script/Gateway code touched. `docs/location-intake/STAFF_API.md` and `SECURITY.md`
  document the new route and its SSRF posture.

## [2026-08-15] PR #48 Gateway mutation timeout widened again: 40s margin was still too tight

- **Decision:** `MUTATION_TIMEOUT_MS` raised from `40000` to `50000`; `vercel.json` `maxDuration` for
  `api/staff/requests.js`/`api/staff/verification.js` raised from `45` to `60`. `MUTATION_MAX_ATTEMPTS`
  stays `1`; `resolveUnits` (`DEFAULT_TIMEOUT_MS=8000`/`MAX_ATTEMPTS=2`) is untouched.
- **Evidence:** A second live rehearsal recorded a genuine `doPost` execution of 39.402s (`Idempotency_Ledger`
  `COMPLETED`, exactly one `Location_Staging` row, one Drive file, no duplicates) — the browser's first
  submit still received a false `STAFF_GATEWAY_UNAVAILABLE` 503 under the prior 40s timeout, since the
  margin (40s vs 39.402s) was effectively zero. The user's manual retry landed on the already-`COMPLETED`
  ledger entry and returned in ~8.1s, confirming the 2026-08-14 UX preservation fix and idempotency both
  worked exactly as designed even while the timeout itself was still miscalibrated.
- **Margin:** 50s gives ~10.6s over the observed 39.402s; 60s Vercel `maxDuration` gives ~10s of platform
  ceiling above that internal timeout, matching `api/chat.js`'s already-proven-safe value on this
  account/plan. Still evidence from individual observed durations (26.633s, then 39.402s), not a
  P50/P95 distribution — if a third false-503 surfaces, the right fix is investigating and reducing the
  actual Apps Script critical-path latency (Script Lock scope, Sheets/Drive call count), not raising the
  timeout a third time.
- **Rejected:** Raising `MUTATION_TIMEOUT_MS` all the way to match the 60s Vercel `maxDuration` — kept a
  deliberate gap so the caller's own abort fires and returns a clean, classified `STAFF_GATEWAY_UNAVAILABLE`
  before the Vercel platform would otherwise kill the function outright.
- **Consequence:** Same scope boundary as the prior entry — no Apps Script, HMAC, freshness, or
  idempotency change. This is the second timeout-margin correction; if actual execution duration keeps
  growing, that points at real Apps Script performance work as the next task, not a third timeout bump.

## [2026-08-14] PR #48 Gateway timeout per action, not one global constant

- **Decision:** `lib/staff-gateway-client.js`'s `callGateway()` takes a per-call `maxAttempts` option
  (in addition to the existing `timeoutMs`) instead of one module-wide `MAX_ATTEMPTS`/`DEFAULT_TIMEOUT_MS`
  applied to every action. `resolveUnits` keeps the original `DEFAULT_TIMEOUT_MS=8000`/`MAX_ATTEMPTS=2`
  (never takes the Script Lock, observed 1.8-2.6s — unchanged). `submitRequest`/`writeVerificationEvent`
  use new `MUTATION_TIMEOUT_MS=40000`/`MUTATION_MAX_ATTEMPTS=1`, wired explicitly from their `lib/staff-api.js`
  call sites.
- **Evidence:** Real production incident — Apps Script Executions log showed an image-bearing
  `submitRequest` (`doPost`) took 26.633s; `Idempotency_Ledger` reached `COMPLETED`, exactly one
  `Location_Staging` row and one Drive file were created, but the browser had already received a false
  `STAFF_GATEWAY_UNAVAILABLE` 503 at the old 8s timeout. Margin: 40s gives ~13.4s (~50%) over the single
  observed duration; not a distribution (P50/P95) yet, so this should be revisited if real traffic shows
  a wider spread.
- **Decision:** `submitRequest`/`writeVerificationEvent` get `maxAttempts=1` (no automatic HTTP retry),
  because both hold Apps Script's project-wide `LockService.getScriptLock()` for the whole operation — an
  automatic second attempt would arrive while the first is still holding the lock and just queue behind
  it, burning the caller's timeout budget on a wait that does nothing. `resolveUnits` keeps its 2-attempt
  retry since it never contends for the lock and is cheap to repeat.
- **Decision:** Manual user retry is intentionally left exactly as safe as before — `request_id`/`body_hash`
  Gateway-side idempotency ([GATEWAY.md](../location-intake/GATEWAY.md)) is unchanged, still the single
  source of truth for "same operation, don't duplicate." No idempotency/HMAC/freshness code touched.
- **Decision:** `vercel.json` `maxDuration` raised to 45s for `api/staff/requests.js` and
  `api/staff/verification.js` only (5s margin over `MUTATION_TIMEOUT_MS`) — `resolveUnits`-only routes
  (`session.js`, `locations.js`, `auth/google.js`) are untouched and keep failing fast. 45s stays well
  under the 60s already proven safe for `api/chat.js` on this account/plan.
- **Decision:** UX — `js/staff-portal.js` preserves entered text/select/services values in memory
  (`state.modal.values`) across a retryable server error, explicitly dropping the `image` field; the
  image must always be re-selected (browsers cannot programmatically restore a `File` into an
  `<input type=file>`). No `localStorage`/`sessionStorage` used.
- **Rejected:** Blanket-raising `DEFAULT_TIMEOUT_MS` to a large value for every action — would have made
  `resolveUnits` (called on every protected request, including page loads) needlessly slow to fail during
  a real outage. Rejected making `getOperationalRecords()` conditional/lazy for `create` as a latency
  optimization in a prior investigation pass — it also feeds `detectDuplicateWarnings()` for `create`,
  so skipping it would have silently disabled duplicate-location detection; out of scope for this fix
  (see BƯỚC 14 in the incident task: no Apps Script/Script Lock/Drive redesign in this change).
- **Consequence:** This closes the specific false-503 failure mode without touching Apps Script code,
  HMAC, freshness, or idempotency. Actual Apps Script execution latency (Script Lock contention, full
  Sheets scans, Drive API round trips) is unchanged and still the real cost driver — a follow-up
  performance task, not this one.

## [2026-08-13] PR #48 staff request contract remediation

- **Decision:** `create`, `update` and `correct` require services, a valid coordinate input and exactly
  one image in the portal UI and Gateway contract. `stop` remains exempt because it removes an existing
  published location and does not create a replacement record.
- **Decision:** Validate recognized request text fields and arrays at the Vercel API boundary with bounded
  lengths and HTTP 400 `STAFF_REQUEST_INVALID`; invalid input never reaches Apps Script. Keep the existing
  explicit DTO allowlist and server-derived identity/unit/request ID.
- **Decision:** Fix WebP detection using RIFF/WEBP magic bytes and keep JPEG/PNG/WebP byte validation
  authoritative at the Gateway. Allowlist only actionable business validation codes for the UI; unknown
  remote errors remain generic.
- **Consequence:** This closes the PR #48 contract/test gaps without adding rental, CSKV, multi-image,
  migration, seed, deployment, or Production alias changes. Live Production route and OAuth acceptance
  remain blocked until deployment configuration is verified by the environment owner.

## [2026-08-11] Vercel Staff Auth/API Gate (PR #47)

- **Decision:** Authenticate with Google ID tokens through the official `google-auth-library`, then resolve
  authorized units from the private Apps Script Gateway on every login and protected request. The browser
  cannot assert email, Google subject, unit, or authorization.
- **Decision:** Use a stateless HMAC-signed `staff_session` cookie with an eight-hour TTL, `HttpOnly`,
  `Secure`, `SameSite=Strict`, and a fail-closed `STAFF_SESSION_SECRET` of at least 32 characters. Session
  revocation is enforced by a fresh Gateway `resolveUnits` call rather than a client-visible allowlist cache.
- **Decision:** State-changing staff requests require an exact configured Origin and double-submit CSRF token.
  Gateway calls are server-only and use the exact UTF-8 JSON body, HMAC query signature, bounded transport
  retry, and deterministic request ID derived from verified subject/action/operation ID.
- **Decision:** Public locations are filtered by authorized `unit_code`; verification and update/correct/stop
  operations require a fresh shared snapshot hash and target ownership. Vercel rejects decoded images over
  3 MiB before the Gateway's existing 10 MiB limit.
- **Decision:** Public/read location lookups retain the bounded cache and stale fallback, but security-sensitive
  mutations use `forceRefresh: true, allowStale: false`. Source failure maps to `STAFF_PUBLIC_SOURCE_UNAVAILABLE`
  and blocks the Gateway call; create requests do not perform an unnecessary current-record read.
- **Decision:** Local Gateway infrastructure errors are preserved with their HTTP semantics; only allowlisted
  remote Gateway business codes are exposed, and unknown remote codes map to `STAFF_GATEWAY_REJECTED`.
- **Consequence:** This is an API/auth layer only. No Staff Portal UI, schema migration, seed, production
  environment mutation, Apps Script deployment, or alias promotion is included.

## [2026-08-11] Private Apps Script Gateway V2

- **Decision:** Keep Gateway V2 as a pure core plus Apps Script adapter. `doPost(e)` verifies the exact
  raw body, timestamp and signature before JSON parsing or opening the private workbook. The only allowed
  actions are `resolveUnits`, `submitRequest`, and `writeVerificationEvent`.
- **Decision:** Use `LocationWorkbookConfig.resolvePrivateLocationWorkbook()` as the only private ID
  resolver. Gateway-only sheets are not created by the legacy Form setup. `PRIVATE_LOCATION_SPREADSHEET_ID`
  and `LOCATION_GATEWAY_SECRET` are Script Properties; no Production values are committed or changed.
- **Decision:** State-changing actions claim `Idempotency_Ledger` under Script Lock. `CLAIMED`,
  `UPLOAD_PERSISTED`, `COMPLETED`, and `FAILED` distinguish crash recovery. A body-hash mismatch for a
  reused request ID is rejected, and deterministic Drive resource keys allow post-create retry recovery.
- **Decision:** Image acceptance is based on decoded bytes and magic signatures (JPEG/PNG/WebP), not client
  MIME/name/size; decoded size is capped at 10 MiB. Staging images remain private until a later approval
  lifecycle outside this PR.
- **Consequence:** No Google Sign-In, session, `/can-bo`, Vercel staff API, migration, Apps Script deploy,
  Production env mutation or alias promotion is part of this change.

## [2026-08-10] Dual-workbook foundation without production cutover

- **Decision:** Public location readers resolve `PUBLIC_LOCATION_SPREADSHEET_ID` first and use the
  existing `GOOGLE_SHEET_ID` only as a temporary, tested compatibility fallback. If both variables are
  set they must be equal; a configured private ID must never equal the public source. Every mismatch fails
  closed before a GViz request.
- **Decision:** `PRIVATE_LOCATION_SPREADSHEET_ID` is an explicit server-side/Apps Script contract with no
  public fallback. `Published_Locations` is the sole public sheet. Allowlist, staging, verification audit,
  idempotency ledger, intake setup and Form Responses are private by declaration and must not appear in a
  public endpoint.
- **Decision:** The new dual-workbook migration utility is JSON-export, dry-run only. It rejects write
  flags, reports inventory/schema/coordinate/boundary/record-ID differences, and never contacts Google.
  Empty or invalid public targets, public exposure of known private columns, source/target `record_id`
  mismatch, duplicate published/staging IDs, missing private target sheets and boundary violations are
  explicit cutover blockers rather than advisory report fields.
  For a shared `record_id`, it also compares canonical public fields (including semantic name) and parsed
  coordinates: loss, invalidity or location drift must block even when other target records remain valid.
  Existing source behavior is retained: individual invalid source rows are reported, while a non-empty
  source only fails the P0 dataset guard when it has no valid coordinates at all.
  A future production cutover must validate a candidate with `verify:published-locations` before alias
  promotion; it cannot substitute an unverified source workbook.
- **Consequence:** This change adds capability only. It does not create or migrate production workbooks,
  change production environment variables, deploy, or implement Staff Portal authentication/runtime.

## [2026-08-09] Khóa crash recovery Drive của Idempotency Ledger

- **Không dùng `IN_PROGRESS` mơ hồ:** ledger private có `CLAIMED`, `UPLOAD_PERSISTED`,
  `STAGING_PERSISTED`, `DONE`, `CLEANUP_PENDING`, `RESOURCE_RETAINED` và `FAILED_CLEANED` cùng
  resource pointer/state cần recovery. Claim persist deterministic `image_resource_key` trước upload.
- **Crash window sau upload:** persist `image_file_id` ngay sau upload, trong cùng `LockService` lock
  và trước staging append. Nếu process chết sớm hơn, retry lookup exact deterministic resource key;
  không thấy file mới upload, thấy một file reuse, thấy nhiều file fail closed để reconcile.
- **Cleanup safety:** staging append fail phải cập nhật ledger + cleanup trước release lock. Cleanup fail
  giữ pointer `RESOURCE_RETAINED` để retry reuse file, không tạo file mới; do đó attempt kế tiếp không
  race với cleanup của attempt cũ.

## [2026-08-09] Khóa contract retry, confirm và login trước implementation Staff Portal

- **Idempotency qua HTTP retry:** Browser tạo UUID `operationId` ổn định cho đúng một thao tác;
  Vercel derive opaque `requestId` từ verified `session.email + action + operationId`. Browser không
  chọn `requestId` hay quyền. Gateway idempotent theo `action + requestId`; cùng key nhưng payload
  khác bị reject. Điều này bao phủ trường hợp Apps Script thành công nhưng response về browser/Vercel
  timeout, nên retry không duplicate staging hoặc Drive upload.
- **Confirm contract:** `POST /api/can-bo/confirm` bắt buộc `{ recordId, snapshotHash, operationId }`.
  Thiếu hash bị reject; server chỉ ghi `Staff_Verification_Audit` sau khi compare hash của record hiện
  tại, do đó stale-confirm protection không phụ thuộc vào UI tự giác refresh.
- **CSRF/session contract:** Mọi POST state-changing kiểm `Origin`. Các endpoint protected cần session;
  riêng `/api/can-bo/auth/google` không cần session trước đó vì nó tạo session, nhưng phải verify Google
  credential, kiểm Origin và IP rate-limit.
- **Duplicate allowlist:** `buildAllowlistMap` hiện last-row-wins, không merge rows. Health gate/migration
  validator phải block rollout khi duplicate `unit_name` khác nội dung quyền; không được dựa vào thứ tự row.

## [2026-08-09] Finalize dual-workbook Staff Portal plan và idempotent recovery

- **Dual-workbook boundary:** `PUBLIC_LOCATION_SPREADSHEET_ID` chỉ chứa
  `Published_Locations` và là nguồn `GOOGLE_SHEET_ID` cho public map/chatbot/GViz. Private
  `PRIVATE_LOCATION_SPREADSHEET_ID` chứa toàn bộ operational sheets: `Unit_Allowlist`,
  `Location_Staging`, `Approval_Audit_Log`, `Staff_Verification_Audit`, `Idempotency_Ledger`,
  `Intake_Setup_Info` và Form Responses. Không public/link-share private workbook.
- **Distributed approval:** public write và private status/audit không phải transaction nguyên tử.
  `request_id + target_record_id + request_type` là reconciliation key; `reconcileLocationRequest`
  là recovery path chính thức. `LockService` chỉ chống concurrency trong Apps Script, không bảo đảm
  atomic cross-workbook transaction.
- **Gateway HMAC:** dùng query parameters `action`, `timestamp`, `signature`; canonical string cố
  định `POST\naction\ntimestamp\nsha256Hex(rawBody)`. Timestamp ±5 phút chỉ là freshness; mọi state-changing
  call phải có `requestId` do Vercel derive trong signed body để chống replay business.
- **Confirm:** luôn ghi `Staff_Verification_Audit` trong private workbook, với canonical SHA-256
  snapshot hash và reject `STALE_RECORD` khi record đã đổi. Không ghi confirm vào
  `Approval_Audit_Log` và không đổi public content.
- **E2E lifecycle:** Playwright global setup/teardown quản lý `scripts/preview-server.js` trực tiếp;
  không dùng nested npm `webServer`, không dùng `--forceExit`/`process.exit(0)` để che process leak.

## [2026-08-09] Cho phép authentication có phạm vi cho Staff Location Portal `/can-bo`

- **Quyết định CŨ bị thay đổi một phần:** `04-current-tasks.md` mục "Không làm lúc này" ghi
  *"Xây hệ thống đăng nhập / auth người dùng — ngoài scope dự án"*. Quyết định đó vẫn đúng cho
  bản đồ công khai và chatbot, nhưng KHÔNG còn đúng cho khu vực cán bộ.
- **Quyết định MỚI — Staff Portal Authentication được phép:** Được xây authentication giới hạn
  phạm vi, chỉ phục vụ `/can-bo` và các API `/api/can-bo/*`, với đúng năm mục đích:
  1. xác minh danh tính cán bộ bằng Google Sign-In (server verify ID token);
  2. map email đã xác minh → tập đơn vị được phép (`authorizedUnits[]`, quan hệ 1:N);
  3. bảo vệ Staff Location Portal API;
  4. ghi đúng `submitter_email` từ session, không lấy từ request body;
  5. chặn sửa dữ liệu chéo đơn vị ở tầng Vercel, CỘNG THÊM (không thay thế) các guard pipeline
     đã có từ PR #41.
- **KHÔNG phải** auth framework chung cho toàn dự án. Ngoài phạm vi, không được mở rộng thành:
  tài khoản người dân · đăng nhập chatbot · đăng nhập bản đồ public · database username/password
  riêng · IAM tổng quát · đưa Supabase vào chỉ để làm auth cho Portal · OTP email (nếu Google
  Sign-In hoạt động) · role system toàn dự án.
- **Lý do đổi quyết định:** Luồng Google Form của PR #41 chạy đúng về mặt bảo mật nhưng sai về
  mặt UX cho đúng nhóm người dùng nó nhắm tới:
  - bắt cán bộ nhập lại từ đầu những dữ liệu hệ thống đã có (địa chỉ, toạ độ, dịch vụ, ảnh),
    chỉ để sửa một trường như số điện thoại;
  - Form hiển thị enum kỹ thuật (`HEADQUARTERS`, `E_IDENTIFICATION`, `TEMPORARILY_PAUSED`…)
    thay vì tiếng Việt;
  - không hỗ trợ được workflow thật *"xem dữ liệu cũ → xác nhận đúng, hoặc chỉnh một phần"* —
    Form không biết bản ghi hiện tại đang ghi gì;
  - một đơn vị có nhiều địa điểm thì cán bộ phải tự tra và gõ tay `target_record_id`.
- **Ranh giới giữ nguyên:** Portal chỉ đổi lớp NHẬP LIỆU. Luồng dữ liệu vẫn là
  `Location_Staging → Admin approval → Published_Locations`. Cán bộ KHÔNG direct-write dữ liệu
  công khai, KHÔNG approve/reject/publish/revoke. Mọi bất biến của PR #41 (CREATE không mang
  `target_record_id`, `record_id` do server sinh, cross-unit bị chặn ở cả `buildStagingRecord`
  lẫn `applyApproval`, formula injection) giữ nguyên, không được regress.
- **Điều kiện chặn production (chưa xử lý, phải làm trước khi có email cán bộ thật):**
  `Unit_Allowlist` phải chuyển sang bảng tính riêng KHÔNG chia sẻ công khai. Hiện nó nằm cùng
  bảng tính với `Published_Locations`, mà bảng tính đó buộc phải link-readable để endpoint GViz
  không xác thực trong `lib/published-locations.js` đọc được.
- **Trạng thái:** Mới là KẾ HOẠCH. Chưa code Portal, chưa có `/can-bo`, chưa có Google Sign-In,
  chưa có gateway HMAC, chưa migrate Sheet. Thiết kế đầy đủ:
  `docs/location-intake/STAFF_PORTAL_PLAN.md`; ma trận kiểm thử + threat model:
  `docs/location-intake/STAFF_PORTAL_TEST_MATRIX.md`.
- **Prerequisite duy nhất đã code trong phiên này:** pure helper
  `resolveUnitsByEmail(email, allowlistRows)` trong `setup/apps-script.js` — chiều ngược của
  `authorizeSubmission`, dựng trên `buildAllowlistMap` để hai chiều không thể lệch nhau. Không
  caller nào gọi nó ở runtime hiện tại nên không đổi hành vi production; nó tồn tại để khoá sớm
  mô hình 1:N và các luật fail-closed trước khi ai đó cài quyền vào Vercel route hoặc frontend.
- **Đánh đổi:** Thêm một bề mặt tấn công mới (session cookie, Google token verify, gateway
  server-to-server) vào một dự án trước đây hoàn toàn không có auth. Chấp nhận vì thay thế nó là
  giữ Google Form — vốn đã có bề mặt riêng (Drive folder, Form sharing) và UX không dùng được cho
  148 đơn vị. Bù lại bằng: fail closed ở mọi lớp, reauthorize theo allowlist hiện tại trước mỗi
  thao tác ghi, và giữ nguyên approval pipeline nên không có đường ghi thẳng ra dữ liệu công khai.
- **Người quyết định:** user (giao đặc tả Gate 3–5) / Claude Code (Opus 5) thiết kế.

## [2026-08-06] Heartbeat SSE + phân loại nguyên nhân abort thay vì mã TIMEOUT chung

- **Bối cảnh:** Chatbot thỉnh thoảng hiện "Phản hồi quá lâu. Vui lòng thử lại." dù backend vẫn xử lý
  bình thường. Điều tra cho thấy nhiều nguyên nhân khác nhau bị quy về cùng 1 mã `TIMEOUT`: frontend
  huỷ sau 60s tổng, huỷ sau 15s không nhận thêm dữ liệu SSE, người dùng bấm nút Dừng, và backend vẫn
  đang buffer đến ranh giới câu cho output-validator (không phát gì trong lúc đó) khiến idle timeout
  15s dễ chạm dù server không hề treo. Bốn giới hạn thời gian (`CHAT_REQUEST_DEADLINE_MS` 55s, frontend
  total 60s, Vercel `maxDuration` 60s, frontend idle 15s) cũng nằm sát nhau, gần như không có đệm.
- **Quyết định:**
  1. `api/chat.js`: thêm `startSseHeartbeat(res, intervalMs=5000)` — phát lại event `status:generating`
     đã có sẵn (không tạo protocol mới) mỗi 5s trong lúc chờ generation, KHÔNG đi qua output-validator vì
     không phải nội dung câu trả lời. Dừng sạch ở mọi điểm thoát (`BLOCKED_CONTENT`, `done`, catch ngoài
     cùng) cộng listener `close`/`finish` và kiểm tra phòng vệ `writableEnded`/`destroyed` trước mỗi write.
  2. `js/gemini.js`: thêm `abortReason` (giữ nguyên lý do đầu tiên, timer đến sau không ghi đè). Timeout
     tổng 60s → 65s (đệm sau `maxDuration`/deadline backend, KHÔNG đổi ngân sách xử lý thực tế phía
     backend). Idle timeout 15s → 25s (heartbeat 5s/lần liên tục reset nên chỉ kết nối treo thật mới
     chạm). External signal (nút Dừng) map thành `user_cancelled`. `catch` trả đúng 1 trong
     `USER_CANCELLED`/`IDLE_TIMEOUT`/`REQUEST_TIMEOUT`, ưu tiên `STREAM_ERROR`+`partialText` nếu đã có
     nội dung (giữ hành vi cũ). Giữ `TIMEOUT` cũ chỉ để tương thích ngược, luồng mới không phát mã này.
  3. `js/chatbot.js`: khi biết chắc là người dùng chủ động dừng (`activeAbortMode==='stop'` hoặc
     `result.error==='USER_CANCELLED'`) thì KHÔNG gắn khung lỗi đỏ và KHÔNG dùng thông điệp timeout —
     hiện "Đã dừng phản hồi." hoặc giữ `partialText` kèm notice trung tính.
- **Không đổi:** RAG/Pinecone/provider/`LLM_PRIMARY`/`LLM_FALLBACK`/rerank/system prompt/output-validator/
  Turnstile/Firebase rate limit/`vercel.json`/`maxDuration`. Backend deadline vẫn 55s như cũ.
- **Đánh đổi:** Idle timeout 25s nghĩa là kết nối treo THẬT (server chết hẳn, không còn heartbeat) sẽ mất
  tới 25s mới báo lỗi thay vì 15s trước đây — chấp nhận được vì trường hợp phổ biến hơn nhiều là server
  vẫn sống nhưng đang buffer, và heartbeat giúp phân biệt rõ hai tình huống này thay vì đoán mò qua timer.
- **Kiểm chứng:** `npm test` 341/341 PASS (`test/chat-sse-heartbeat.test.js`,
  `test/gemini-stream-abort.test.js` 10 ca theo đặc tả, `test/chatbot-abort-messages.test.js`). `npm run
  build` sạch. Chưa chạy smoke test trình duyệt thật trong phiên này (cần key thật ngoài phạm vi).
- **Người quyết định:** user (giao đặc tả chi tiết) / Claude Code (Sonnet 5) triển khai, user tiếp tục vá
  thêm `EMPTY_RESPONSE` (xem entry ngay dưới) và làm cứng bộ test tránh flaky giữa Node 20/24.

## [2026-08-06] Tắt reasoning ở generation DeepSeek + tách EMPTY_RESPONSE khỏi BLOCKED_CONTENT

- **Bối cảnh:** Người dùng báo chatbot trả "Câu hỏi này không phù hợp…" cho câu hỏi hoàn toàn hợp lệ
  ("thủ tục cấp căn cước công dân"). Tái hiện bằng handler thật: DeepSeek trả HTTP 200 nhưng toàn bộ
  output nằm ở `reasoning_content`, `delta.content` rỗng suốt → `rawText` rỗng → gắn nhãn
  `BLOCKED_CONTENT`. Đo 20 lượt hỏi thật: 1 lỗi cứng + 3 câu trả lời bị cắt cụt.
- **Nguyên nhân:** Quyết định [2026-07-23] chỉ tắt `thinking` cho payload **utility**; payload
  **generation** bị bỏ sót nên reasoning vẫn tiêu chung ngân sách `max_tokens: 3072` với câu trả lời.
  Cộng thêm hai nhánh cứu khi stream rỗng đều bị chặn cứng cho DeepSeek (`!useDeepSeek`,
  `provider !== 'deepseek'`), mà chế độ strict lại không có provider kế tiếp → không còn đường lui nào.
- **Quyết định:** (1) `buildDeepSeekChatPayload()` dựng payload chat DeepSeek cho cả stream lẫn
  non-stream và **luôn gửi `thinking: { type: 'disabled' }`** — đồng bộ với utility call. (2) Stream rỗng
  chữ thì thử lại non-stream ĐÚNG provider đó, sau đó mới sang `providerOrder` kế tiếp nếu có;
  không hardcode tên provider ở hai nhánh này nữa. (3) `classifyEmptyGenerationError()` chỉ trả
  `BLOCKED_CONTENT` khi provider nói rõ là chặn (`promptFeedback.blockReason`, finishReason
  `SAFETY`/`PROHIBITED_CONTENT`/`BLOCKLIST`/`content_filter`); còn lại là `EMPTY_RESPONSE` với thông điệp
  "hệ thống chưa soạn xong câu trả lời" ở cả 4 ngôn ngữ.
- **Giữ nguyên chính sách strict:** Vì nhánh (2) đi theo `providerOrder`, chế độ strict
  (`LLM_PRIMARY=deepseek`, không đặt `LLM_FALLBACK`) vẫn KHÔNG rời DeepSeek sang Gemini — đúng ràng buộc
  của quyết định [2026-07-23]. Muốn có đường lui phải bật rõ `LLM_FALLBACK=gemini`.
- **Kiểm chứng:** Cùng bộ 20 lượt hỏi thật, sau sửa: 0 lỗi, 0 cắt cụt (trước: 1 lỗi, 3 cắt cụt). Câu hỏi
  trong ảnh người dùng báo lỗi: 5/5 lượt trả lời tốt (trước: 1/5 lượt lỗi). Độ trễ giảm còn 6–9s vì
  không đốt token vào reasoning. 8 test mới ở `test/chat-empty-response.test.js`.
- **Đánh đổi:** Tắt reasoning có thể làm giảm chất lượng suy luận nhiều bước; chấp nhận được vì câu trả
  lời phải bám `<retrieved_documents>` chứ không tự suy diễn, và ngân sách 3072 token vốn dành cho câu
  trả lời. Nếu sau này cần bật lại reasoning thì phải tách ngân sách riêng, không dùng chung `max_tokens`.

## [2026-07-23] Giai đoạn 1 — DeepSeek-primary, Gemini chỉ embedding

- **Quyết định:** Khi có `DEEPSEEK_API_KEY`, `api/chat.js` mặc định dùng `deepseek-v4-flash` cho generation
  và mọi tác vụ phụ: rewrite follow-up, dịch truy hồi, rerank, tóm tắt lịch sử, groundedness. Payload utility
  luôn gửi `thinking: { type: 'disabled' }`. Gemini chỉ gọi `gemini-embedding-001` một lần cho câu hỏi RAG
  (cache-hit, out-of-scope và nhánh từ chối tất định không gọi embedding).
- **Chế độ:** strict là mặc định (`LLM_PRIMARY=deepseek`, không đặt fallback). Stable phải bật rõ
  `LLM_FALLBACK=gemini`; chỉ DeepSeek HTTP 429 hoặc 5xx mới được chuyển sang Gemini. Lỗi mạng/timeout,
  4xx khác và lỗi ứng dụng không được fallback sang Gemini.
- **Tương thích/quan sát:** Gemini utility vẫn giữ khả năng rollback qua `GEMINI_UTILITY_MODEL` hoặc
  `LLM_UTILITY_MODEL`; telemetry ghi riêng số call theo provider để kiểm tra Gemini không bị gọi cho
  generation/utility. Embedding không retry để giữ đúng một request Gemini vật lý cho mỗi câu hỏi RAG.
- **Lý do:** Gemini free tier đã 429 khi nhiều người dùng cùng truy cập; tài khoản DeepSeek là paid. Giảm luồng
  bình thường từ khoảng 2–6 lượt Gemini xuống một request embedding, không thay đổi hệ vector hiện hữu.
- **Đánh đổi:** Nếu DeepSeek timeout/lỗi mạng ở strict, người dùng nhận lỗi thay vì dùng Gemini; stable chỉ giảm
  rủi ro quá tải/dịch vụ, không che lỗi cấu hình hoặc lỗi request.

## [2026-07-23] Bỏ quota tổng tháng, chỉ giữ rate limit theo IP/ngày

- **Quyết định:** `/api/chat` chỉ reserve counter Firebase `usage_ips/<date>/<ip_hash>` với giới hạn
  `CHAT_DAILY_IP_LIMIT` (mặc định 50). Bỏ hoàn toàn việc đọc/ghi `usage/<month>`, bỏ
  `CHAT_MONTHLY_LIMIT` khỏi runtime và bỏ nhánh trả lỗi khi tổng lượt toàn hệ thống chạm quota tháng.
- **Lý do:** Nhiều người dùng hợp lệ truy cập cùng lúc không được làm toàn bộ chatbot bị khóa vì một
  ngân sách tổng. Giới hạn IP/ngày vẫn giữ lớp chống spam và vẫn atomic bằng ETag/CAS dưới tải đồng thời.
- **Đánh đổi:** Chi phí nhà cung cấp AI không còn được chặn bằng quota tổng của ứng dụng; phải kiểm soát
  bằng billing/quota của DeepSeek/Gemini và telemetry vận hành. Một mạng NAT dùng chung vẫn chia sẻ cùng
  bucket IP/ngày.
- **Người quyết định:** user / Codex.

## [2026-07-21] Deck slide 1 dùng hero nền tối (ảnh bản đồ) — ngoại lệ có chủ đích của design system

- **Quyết định:** Riêng slide TIÊU ĐỀ được phép dùng nền tối dạng ảnh (`asset/hero-map-bg.png` —
  bản đồ VN mạch điện phát sáng, ghép bằng `sharp`) thay cho nền navy phẳng của hệ thống. Các
  slide còn lại GIỮ nguyên hệ "phẳng, nền sáng/navy phẳng, một accent teal". Thêm type slide mới
  `painCycle` (infographic 6 nút vòng tròn) trong `build_pptx.js` cho slide "nỗi đau người dân".
- **Lý do:** `DESIGN_SYSTEM.md` chủ trương phẳng + một accent, dễ khiến agent/đời sau "sửa lại"
  nền tối ảnh về phẳng. Ghi rõ đây là NGOẠI LỆ có chủ đích: slide bìa cần lực hút thị giác, ảnh
  bản đồ đúng chủ đề (công nghệ + Việt Nam) và đã kiểm chứng chữ vẫn đọc rõ trên nửa trái tối.
  Ý tưởng lấy từ bản Canva của người dùng nhưng dựng lại/chọn lọc, KHÔNG import ảnh stock/AI
  (ảnh người, ký hiệu tiền tệ... trong bản Canva bị loại vì lạc đề/rủi ro).
- **Đánh đổi:** Deck có 1 slide lệch tông (tối) so với phần còn lại — chấp nhận vì là slide bìa.
  `painCycle` dùng nút navy làm "vấn đề", KHÔNG dùng teal (teal vẫn chỉ mang nghĩa tích cực).
- **Kiểm chứng:** render slide 1 & 2 bằng PowerPoint COM: hero liền mạch (mask radial khử viền
  vuông), 6 nút không đè nhau/đè hub/đè tiêu đề. Xem log `[2026-07-21] Deck: hero bản đồ...`.

## [2026-07-18] Ổn định gate DN01/LOC02/TT04/VP01 và fail-closed URL công khai

- **Quyết định:** Giữ phương án A gồm hàng rào chủ thể người nước ngoài độc lập với classify và
  query bổ sung KBTT cho tình huống "mới đến/đến ở". Nếu riêng query bổ sung timeout thì giữ kết quả
  query chính và dùng record `tthc_matt26265` đã duyệt trong catalog cục bộ làm fallback; không để lỗi
  bổ sung xóa toàn bộ context. Với câu mất/cấp lại thẻ tạm trú, nếu top RAG
  không có đúng biến thể cấp lại thẻ tạm trú thì trả lời tất định bằng thẩm quyền + ba điểm QLXNC
  đã xác minh (`DETERMINISTIC_PROCEDURE_GAP`), không gọi model. Bộ chấm VP01 nhận các câu từ chối
  tương đương dùng "căn cứ/thông tin/dữ liệu" nhưng vẫn fail câu tự nêu mức phạt. Output validator
  chỉ giữ URL HTTP(S) có trong RAG/citation/trụ sở đã xác minh và redact domain typo/tự tạo.
- **Lý do:** Gate sau phương án A xác nhận DN01/LOC02 ổn định, nhưng TT04 vẫn 2/3 lần khẳng định
  "nộp tại" dù thiếu thủ tục đúng biến thể; VP01 bị regex bắt oan hai câu từ chối an toàn; TR03 có
  một URL `xuatnhhapcanh` sai chính tả lọt ra UI. Prompt đơn thuần không bảo đảm TT04/URL dưới sampling.
- **Đánh đổi:** TT04 ít linh hoạt hơn và bỏ generation khi nguồn chưa đủ, đổi lại không suy diễn thủ
  tục. URL chính thức chỉ được hiện khi backend có bằng chứng cấu trúc; link model nhớ đúng nhưng không
  có trong context cũng bị loại theo nguyên tắc fail-closed. Fallback DN01 tạo một bản sao runtime của
  record KBTT, nhưng chỉ kích hoạt khi query phụ lỗi và lấy từ catalog đã sinh bởi cùng corpus governance.
- **Kiểm chứng:** targeted DN01/VP01/PI01 đạt 3/3 từng ca; full majority 3×30 ngày 2026-07-18 đạt,
  không có hard-fail đa số, chỉ TYPO01 flaky 1/3 không chặn.
- **Người quyết định:** user / Codex

## [2026-07-18] Danh mục TTHC — duyệt 2 tầng (lĩnh vực → thủ tục), bỏ 17 chip phẳng

- **Quyết định:** Đổi UI danh mục thủ tục từ 1 danh sách phẳng + 17 chip lọc cuộn ngang sang mô
  hình **3 view**: (1) home search-first + lưới 17 lĩnh vực gom thành 4 cụm; (2) danh sách thủ tục
  của lĩnh vực/kết quả tìm kiếm (hàng chia dòng, không card nổi); (3) chi tiết với tóm tắt nhanh +
  note phí trung tính + accordion. Áp dụng qua taste-skill (dials trust-first VARIANCE 4/MOTION 3/
  DENSITY 4). Chỉ sửa `js/tthc-catalog.js` + `styles.css` + phần thân `#tthc-catalog-window` trong
  `index.html`; KHÔNG đổi dữ liệu, public API (`TthcCatalog.open/openProcedure/openByTitle/…`),
  deep-link từ chat, hay tích hợp mobile bottom-nav.
- **Vì sao "không thân thiện":** 62% thủ tục (57/92) có phí = "Chưa xác minh" nhưng card cũ lại dẫn
  bằng chính dòng phí đó; 17 chip cuộn ngang giấu phần lớn lĩnh vực; 92 card nổi đồng nhất tạo tường
  nặng; chi tiết là tường text `pre-wrap`. Xem chẩn đoán trong `06-ai-working-log.md`.
- **Điểm kỹ thuật đáng ghi:** parser accordion phải nhận **2 định dạng** — nhãn TTHC chuẩn ("Hồ sơ:")
  và nhãn wiki đánh số của guide ("15.1. Trình tự thực hiện:"). Guide chiếm ~62% catalog nên nếu chỉ
  khớp nhãn tthc thì đa số thủ tục rơi hết vào 1 mục "Thông tin khác". `classifySection` phân loại
  theo từ khóa (không phân biệt dấu) để gộp về Hồ sơ / Trình tự / Yêu cầu / Căn cứ pháp lý / Khác,
  bảo toàn toàn bộ nội dung (không mục nào bị bỏ).
- **Đánh đổi:** Bỏ lọc-đa-chọn theo lĩnh vực trên 1 màn; muốn xem chéo lĩnh vực phải qua tìm kiếm.
  Đổi lại giảm tải thị giác và khớp cách người dân nghĩ ("tôi cần làm hộ chiếu"). Phí "Chưa xác minh"
  không hiển thị trên card/list nữa, chỉ còn note trung tính ở chi tiết.
- **Kiểm chứng:** 48 unit test liên quan pass (giữ `__test` exports + `resolveProcedureIdFromList`);
  verify trong app thật cả 3 tầng + back + tìm kiếm + accordion cho cả guide lẫn tthc. Xem
  `06-ai-working-log.md` (2026-07-18).

## [2026-07-17] T3.8 — Current-procedure-first và rollback khi gate suy giảm

- **Quyết định:** Sau khi người dùng duyệt toàn bộ, sao chép 346 law/guide sang namespace ứng viên với `review_status=approved`. Truy hồi chính ưu tiên riêng `tthc/current_procedure`; law/guide chỉ là fallback có governance.
- **Lý do:** Cutover thử với truy vấn chung cho cả ba role làm shadow giảm từ mốc 88 PASS/2 WARN xuống 73 PASS/18 WARN. Sau khi tách tầng, kết quả trở lại 88 PASS/2 WARN/0 FAIL; XE03 lỗi mạng nhất thời và PASS khi chạy lại.
- **An toàn vận hành:** Đã rollback Production về namespace cũ ngay khi thấy suy giảm. Không phát hành lại vì cổng generation 3 lượt bị quota Gemini 429 và vòng đầu đã có hard-fail nội dung. Chỉ cutover lại sau khi có đủ quota và majority gate sạch.
- **Đánh đổi:** Law/guide không cạnh tranh top-k với thủ tục hiện hành; chúng chỉ tham gia khi không có current procedure phù hợp. Điều này ưu tiên độ chính xác vận hành hơn độ phủ giải thích pháp lý trong mọi câu hỏi.

> Ghi lại quyết định kỹ thuật quan trọng để agent sau không "phát minh lại" hoặc đảo ngược
> mà không biết lý do. Mỗi entry: quyết định gì, vì sao, đánh đổi gì.

## [2026-07-17] T3.7 — Truy hồi câu ngoại ngữ: dịch sang tiếng Việt + sửa nhận nhầm ngôn ngữ + model tiện ích

- **Bối cảnh:** Shadow retrieval báo `EN01` ("How can a foreigner declare temporary residence…")
  abstain ở namespace mới. Truy 3 lớp nguyên nhân chồng nhau:
  1. **Nhận nhầm ngôn ngữ:** `isLikelyVietnamese` match từ đơn không dấu `can` → câu tiếng Anh chứa
     "How **can**…" bị nhận thành 'vi'. Hệ quả kép: không kích hoạt dịch + TRẢ LỜI sai ngôn ngữ.
  2. **Embedding xuyên ngữ:** corpus là tiếng Việt; query tiếng Anh embed ra các doc sai nhánh
     ("thẻ tạm trú") còn doc đúng ("khai báo tạm trú") xếp ngoài top-8 → branch filter split-intent
     loại sạch → abstain. (Branch filter chạy ĐÚNG; lỗi ở ranking xuyên ngữ.)
  3. **Model tiện ích chết:** `gemini-2.5-flash-lite` trả 404 với key hiện tại → rerank/rewrite/dịch
     âm thầm fail-open (no-op).
- **Quyết định:**
  - `isLikelyVietnamese`: cụm nhiều từ đặc trưng ("thu tuc"/"tam tru"/"ho chieu"…) nhận ngay; từ đơn
    dễ trùng tiếng Anh (can/ban/hoi/toi/muon) cần ≥2 tín hiệu. (`test/language-detection.test.js`)
  - Thêm `translateQueryForRetrieval`: câu ngoại ngữ dịch sang tiếng Việt CHO TRUY HỒI (embed/classify),
    ngôn ngữ trả lời giữ theo `userLang` gốc. Fail-open.
  - Model tiện ích cấu hình qua `LLM_UTILITY_MODEL`, mặc định `gemini-flash-lite-latest` (còn sống).
- **Đánh đổi / cần lưu ý:** Sửa model tiện ích **khôi phục rerank + rewrite follow-up** (đang chết) →
  là BEHAVIOR CHANGE cho generation, **phải chạy 30 câu lõi × 3 (majority) trước khi merge/T3.8** để
  xác nhận không hồi quy. Nếu key production vẫn dùng được `gemini-2.5-flash-lite`, có thể pin lại qua env.
- **Kiểm chứng:** EN01 shadow 0→1 match (dịch "Người nước ngoài… khai báo tạm trú…" → doc KBTT 0.781
  top-1, cap=xa). Xem `06-ai-working-log.md` (2026-07-17) + báo cáo shadow.

## [2026-07-17] T3.6 — Cấp thực hiện là ưu tiên MỀM, không phải ràng buộc cứng

- **Quyết định:** Trong nhánh governance (`RAG_GOVERNANCE_FILTER=1`), ràng buộc theo cấp thực hiện
  (`cap_normalized`) chỉ được áp dụng như ưu tiên MỀM: nếu KHÔNG có thủ tục nào đúng cấp người dùng
  nêu, hệ thống trả về thủ tục ở cấp khác (vẫn qua governance role + hiệu lực) thay vì rỗng. Vai trò
  nguồn + hiệu lực vẫn fail-closed cứng.
- **Vì sao:** Đo live namespace `chatbot-tthc-xnc-web-rd-20260715` cho thấy câu "đăng ký xe tại Công
  an cấp xã" bị filter cap cứng loại sạch (0 match) → bot từ chối hoàn toàn, vì snapshot web gắn 10
  thủ tục đăng ký xe = Cấp Tỉnh trong khi thực tế dân nộp ở cấp xã (người dùng xác nhận nghiệp vụ).
  Từ chối một câu hỏi hợp lệ tệ hơn việc trả thủ tục ở cấp thực tế kèm ghi chú cấp.
- **Đánh đổi:** Cap không còn "khóa" tuyệt đối theo lời người dùng; nếu dữ liệu cấp bị sai, kết quả
  vẫn hiện (kèm cấp thật trong doc để model không khẳng định sai cấp). Đây là lựa chọn có chủ đích:
  ưu tiên không-abstain-oàn hơn là chính xác-cấp-tuyệt-đối khi hai nguồn tỉnh còn mâu thuẫn.
- **Ranh giới:** Đây là fix ở tầng retrieval, KHÔNG sửa dữ liệu. Việc namespace ứng viên thiếu đăng
  ký xe cấp xã là lỗi DỮ LIỆU, xử lý riêng ở T3.3/T3.4 (seed từ snapshot đã duyệt). Cap cứng vẫn
  được tôn trọng khi CÓ thủ tục đúng cấp (vd căn cước cấp xã route đúng, không bị nới oan).
- **Kiểm chứng:** `test/retrieval-governance.test.js` +2 ca; probe live xác nhận đăng ký xe cấp xã
  0→8 match, căn cước cấp xã giữ nguyên đúng cấp. Xem `06-ai-working-log.md` (2026-07-17).

## [2026-07-16] Kiểm tra trùng lặp corpus law/guide — không tìm thấy trùng nội dung

- **Quyết định/Kết luận:** Quét trực tiếp 346 record `law`/`guide` trên namespace production
  (`chatbot-tthc-xnc`, chỉ đọc) để kiểm tra trùng lặp theo yêu cầu người dùng (nguồn tự biên soạn
  từ luật + tài liệu đã xác minh). Không phát hiện thủ tục nào bị nhập trùng nội dung.
- **Chi tiết đối chiếu:**
  - Các nhóm 11–12 record cùng `procedure_title` (Đăng ký thường trú, Tách hộ, Đăng ký tạm trú,
    Gia hạn tạm trú, v.v.) là các mục con ("Trình tự thực hiện", "Cách thức thực hiện", "Thành phần
    hồ sơ"...) của CÙNG 1 thủ tục bị chia nhỏ để embedding — mỗi mục `content_hash` khác nhau, không
    phải trùng lặp.
  - `guide_cap_xa_2025_g_03_*` và `g_04_*` cùng tên "Khai thác thông tin người gốc Việt Nam... CSDL
    quốc gia về dân cư" nhưng là 2 biến thể hợp lệ theo đối tượng thực hiện (cá nhân vs cơ quan/tổ
    chức) — mẫu hình phổ biến trong TTHC, không phải lỗi.
  - `g_05` tên gần giống nhưng nói về CSDL Căn cước (khác CSDL quốc gia về dân cư theo Luật Căn cước
    2023) — thủ tục khác, không trùng.
  - `law_cu_tru_ieu_3__126` và `__129` cùng gắn `van_ban="Quy chế phối hợp"` + `dieu="Điều 3."`
    nhưng nội dung khác hẳn (một là điều khoản thi hành cuối văn bản, một là "Nguyên tắc phối hợp"
    ở Chương I) — đây là 2 văn bản "Quy chế phối hợp" KHÁC NHAU vô tình trùng tên gọi chung chung,
    không phải cùng 1 văn bản bị nhập 2 lần. `van_ban` hiện không kèm số hiệu/ngày ban hành nên
    không tự phân biệt được — cần lưu ý khi audit tiếp, nhưng không phải lỗi trùng lặp cần sửa ngay.
  - So khớp chính xác `procedure_title` (194 guide) với "Tên thủ tục" trong text của 39 record
    `tthc` — **0 trùng khớp**. Guide không mô tả lại thủ tục nào TTHC chính thức đã có.
- **Tác động:** Không có hành động sửa dữ liệu nào cần thực hiện từ kết quả này. Kết luận này chỉ
  xác nhận chất lượng corpus law/guide trước khi review/duyệt (`pending` → `approved`) theo lộ
  trình đã chốt trong entry "Governance fail-closed theo vai trò nguồn" bên dưới; không ảnh hưởng
  quyết định đó.
- **Người xác nhận nguồn:** user (tự biên soạn từ luật + tài liệu đã xác minh).

## [2026-07-16] Governance fail-closed theo vai trò nguồn

- **Quyết định:** Khi `RAG_GOVERNANCE_FILTER=1`, mọi record phải có vai trò nguồn được duyệt và
  đúng policy: `tthc` = `approved/current_procedure`, `law` = `approved/legal_basis`, `guide` =
  `approved/supplemental`. Record thiếu/mismatch metadata, `pending`, `superseded`, `legacy` hoặc
  ngoài hiệu lực bị loại ở cả Pinecone filter lẫn hậu kiểm. Không dùng bypass cho record thiếu
  `source_type`.
- **Lý do:** Kiểm tra trực tiếp corpus production cho thấy không thể suy ra an toàn từ prefix:
  trong 194 `guide`, có 42 record `Toàn văn thủ tục` chứa đủ trình tự, cách nộp, hồ sơ/mẫu, thời
  hạn, phí và cơ quan. Chúng không được cung cấp facts vận hành cho đến khi được review. Law/guide
  đã duyệt vẫn được retrieval với vai trò phù hợp, nhưng không ghi đè TTHC hiện hành.
- **Thực thi:** `filterGovernedMatches` và `buildGovernanceFilter` dùng chung policy role; ràng
  buộc cấp chỉ áp dụng cho `tthc`/`guide`. Context giữ `current_procedure` nếu có và chỉ role này
  tạo `[FACTS ĐÃ XÁC MINH]`. Script backfill chỉ gắn type/priority, đặt record chưa có quyết định
  thành `pending`, có full backup + retry verify + rollback upsert; mọi ghi yêu cầu namespace xác
  nhận tường minh.
- **Tác động:** Không đổi cờ hay namespace production trong PR này. Không chạy `--apply` ở PR #34.
  Review và migration law/guide đã duyệt sang namespace ứng viên là công việc tiếp theo, bắt buộc
  trước T3.7/T3.8.
- **Người quyết định:** user

## [2026-07-15] Backup Pinecone không commit vào git

- **Quyết định:** `data/pinecone-backups/` được đưa vào `.gitignore` và gỡ khỏi tracking. Toàn bộ
  dump pre/post (chứa vector 768 chiều) và manifest vẫn sinh ra trên máy vận hành mỗi lần chạy
  script import/apply, nhưng không còn commit vào repo.
- **Lý do:** ~103 file / 21MB, chủ yếu là vector dump, khiến repo phình nhanh và cộng dồn sau mỗi
  lần chạy. Audit trail vẫn còn trên máy vận hành + trong git history của các commit trước đó.
- **Tác động:** Agent/script sau vẫn ghi backup ra thư mục này như cũ; chỉ khác là không kỳ vọng
  chúng xuất hiện trong `git status`. Nếu cần lưu audit trail lâu dài, chuyển sang lưu trữ ngoài git.
- **Người quyết định:** user

## [2026-07-15] Mở rộng T3.3 từ đối chiếu corpus cũ sang đầy đủ thủ tục cấp xã

- **Quyết định:** Dự án ưu tiên thủ tục cấp xã. Snapshot web có 157 mục (114 cấp tỉnh, 43 cấp xã),
  nên bộ duyệt mới phải liệt kê đủ 43 mục cấp xã thay vì chỉ ghép với 39 record TTHC cũ. Trong 43
  mục: 42 ứng viên hiện hành; mục Phiếu/NA17 vẫn được ghi trong bảng đối chiếu nhưng `reject`/
  `exclude_superseded` theo quyết định nghiệp vụ đã chốt.
- **Lý do:** 17 đối chiếu trước chỉ phản ánh độ giao nhau với corpus cũ, không phản ánh số thủ tục đã
  thu thập. Nếu re-embed ngay sẽ bỏ sót phần lớn thủ tục cấp xã cần cho dự án.
- **Tác động:** T3.5 phải dùng danh sách cấp xã đã duyệt làm nguồn tạo namespace mới. 114 thủ tục cấp
  tỉnh và thủ tục trung ương để chờ duyệt sau. Trường website không công bố ghi `N/A`, không tự suy đoán.
- **Người quyết định:** user / Codex

## [2026-07-15] Duyệt đầy đủ 42 thủ tục cấp xã hiện hành

- **Quyết định:** Người dùng duyệt toàn bộ 42 thủ tục cấp xã hiện hành trong snapshot web và giữ
  quyết định loại mục “Khai báo tạm trú ... bằng Phiếu/NA17”. Manifest duyệt được khóa theo SHA-256
  của snapshot để lần nhập tiếp theo không vô tình áp dụng cho dữ liệu web đã thay đổi.
- **Tác động:** 41 record sẽ được tạo mới, `tthc_xa-01` sẽ được cập nhật. Quyết định này chỉ xác nhận
  nội dung nguồn; chưa ghi thêm Pinecone và chưa chuyển namespace production.
- **Người quyết định:** user

## [2026-07-15] Nhập thủ tục cấp xã vào namespace Pinecone tách biệt

- **Quyết định:** Nhập 42 thủ tục đã duyệt vào namespace mới `chatbot-tthc-xnc-xa-rd-20260715`, dùng
  Gemini `RETRIEVAL_DOCUMENT`, không ghi namespace production hiện hành. Mỗi record mang facts nguồn,
  metadata `approved/current`, hash nội dung và URL chính thức; Phiếu/NA17 không có trong namespace.
- **Tình trạng:** Đã hoàn tất 42/42 vector 768 chiều. Lần đầu bị dừng bởi quota Gemini 429 và Pinecone
  chập chờn; sau đó chạy tiếp với delay 10 giây/lần. Kết quả gồm 16 embedding mới + 26 record được
  resume/xác minh lại. Resume chỉ bỏ qua record có vector/hash/metadata đã xác minh.
- **Người quyết định:** user (ủy quyền ghi Pinecone) / Codex

## [2026-07-15] Mở rộng nhập toàn bộ thủ tục hiện hành trên website

- **Quyết định:** Theo yêu cầu mới, mở rộng từ 42 cấp xã lên toàn bộ snapshot website: 157 mục thu thập,
  trong đó 156 mục hiện hành được nhập (114 cấp tỉnh + 42 cấp xã). Mục Phiếu/NA17 vẫn giữ ngoại lệ
  `superseded` vì quyết định nghiệp vụ trước xác nhận luồng giấy không còn dùng.
- **Tình trạng:** Namespace `chatbot-tthc-xnc-web-rd-20260715` đã ghi đủ 156/156 record; thống kê index xác nhận
  156 vector dimension 768. Phiếu/NA17 vẫn loại theo quyết định duyệt; namespace production chưa đổi.
- **Người quyết định:** user / Codex

## [2026-07-15] Snapshot TTHC tỉnh chỉ hỗ trợ T3.3, không tự động phê duyệt nguồn

- **Quyết định:** Thu thập tuần tự toàn bộ trang TTHC Công an tỉnh Phú Thọ thành snapshot có URL và
  `content_hash`; sinh bảng đối chiếu riêng cho 39 record HIGH. Ghép tự động chỉ được coi là `matched`
  khi tiêu đề chính xác **và cấp thực hiện tương thích**; fuzzy cùng cấp chỉ là `review_suggestion`.
  Không sửa `final_*`, không ghi Pinecone và không suy ra `review_status=approved` từ việc trang tồn tại.
- **Lý do:** Nguồn tỉnh bổ sung được thời hạn/phí/biểu mẫu còn thiếu, nhưng không bao phủ thủ tục cấp
  trung ương. Quan trọng hơn, trang hiện đồng thời đăng cả KBTT online và mục “bằng Phiếu khai báo tạm
  trú”, trong khi người quản trị đã xác nhận luồng phiếu/NA17 lỗi thời. Crawl toàn bộ rồi auto-approve
  sẽ tái đưa đúng nguồn F01 cần loại bỏ vào corpus.
- **Đánh đổi:** Sau crawl 157/157 trang, chỉ 14/39 HIGH khớp chính xác cùng cấp và 3/39 là gợi ý cần
  kiểm tay; 22/39 giữ unmatched. Tiến độ T3.3 chậm hơn auto-fill nhưng tránh trộn thẩm quyền tỉnh/trung
  ương và giữ đúng gate nguồn hết hiệu lực.
- **Người quyết định:** user / Codex

## [2026-07-14] Nâng firebase-admin 13→14, chấp nhận 6 lỗ hổng moderate còn lại

- **Quyết định:** Nâng `firebase-admin` từ `^13.10.0` lên `^14.1.0` (rà soát bảo mật trước pilot
  lãnh đạo phát hiện `npm audit` báo 9 lỗ hổng moderate, trong đó `uuid` bounds-check chỉ vá được
  qua nâng major này). `npm audit fix` (không force) đồng thời vá `postcss` (XSS trong CSS
  stringify, devDependency của tailwindcss) — không breaking, giữ nguyên.
- **Xác minh an toàn:** Code chỉ dùng API modular tối giản của firebase-admin
  (`firebase-admin/app: cert/getApps/initializeApp`, `firebase-admin/firestore: getFirestore`,
  rồi `db.collection(name).add(payload)` — 1 chỗ duy nhất trong `api/chat.js:getFirestoreDb`).
  Breaking changes chính thức của v14 (Firestore SDK v7, Storage SDK v7, TypeScript 5.1, tối
  thiểu Node 16) không chạm tới bề mặt API này; Vercel chạy Node 20 nên thỏa điều kiện. `npm test`
  259/259 PASS, `npm run build` sạch, `npm run ci` audit (`--omit=dev --audit-level=high`) exit 0.
- **6 lỗ hổng moderate còn lại (chấp nhận, không chặn pilot):** cùng 1 chuỗi `uuid` xuyên qua
  `@google-cloud/storage` → `teeny-request`/`retry-request`, là dependency bắt buộc của
  `firebase-admin` (mọi version hiện có trên npm, kể cả bản mới nhất, đều kéo theo). Ứng dụng
  KHÔNG dùng Cloud Storage (chỉ Firestore + RTDB), nên code path chứa lỗ hổng không bao giờ được
  gọi tới ở runtime — rủi ro thực tế gần như bằng 0 dù `npm audit` vẫn báo. Chờ firebase-admin tự
  nâng cấp `@google-cloud/storage` ở bản sau; không tự ý downgrade theo gợi ý `npm audit fix
  --force` (nó đề xuất hạ về `firebase-admin@10.3.0`, cũ hơn bản đang chạy production).
- **Đánh đổi:** Bump major dependency luôn có rủi ro API ẩn, nhưng bề mặt sử dụng thực tế trong
  repo quá hẹp để breaking change chạm tới; đổi lại giảm 9 → 6 lỗ hổng audit và không mắc kẹt ở
  bản firebase-admin cũ mãi mãi.

## [2026-07-13] Deeplink fail-safe theo ID -> title/alias và trạng thái thiếu tọa độ

- **Quyết định:** Chat chỉ tạo nút đối chiếu sau khi index TTHC đã tải và `resolveProcedureId` xác nhận
  đích tồn tại. Thứ tự resolve là `procedure_id` chính xác, sau đó title/alias khớp chính xác đã chuẩn hóa;
  không fuzzy-match để tránh mở nhầm thủ tục. Source có ID nhưng không resolve được phải hiện trạng thái thiếu.
- **Vị trí:** `verifiedLocations` giữ cả bản ghi có tên nhưng chưa có `mapsUrl`; client hiển thị tên/địa chỉ
  cùng thông báo thiếu tọa độ, tuyệt đối không dựng URL suy đoán. Bản ghi có URL xác minh vẫn mở Google Maps.
- **Kiểm soát dữ liệu:** Unit test bắt index bao phủ đúng toàn bộ ID của catalog; E2E dùng ID cũ để chứng minh
  fallback title và đồng thời kiểm tra cả vị trí có/không có tọa độ.
- **Đánh đổi:** Nút đối chiếu xuất hiện sau một lượt tải index bất đồng bộ; đổi lại không còn nút dead-end và
  không che giấu nguyên nhân thiếu link. Title/alias lệch thực sự vẫn fail-safe và cần sửa dữ liệu nguồn.

## [2026-07-13] Khép review Phase 2 — conditional grounding và latency eval trace

- **Quyết định:** Một câu từ chối nêu mức phạt vì thiếu bằng chứng được khai trong
  `grounding_exempt_patterns`; nó vẫn phải khớp expectation deterministic nhưng không bị yêu cầu xuất hiện
  trong tài liệu RAG. Claim khẳng định như `Điều 21` vẫn dùng `grounding_patterns` và fail nếu corpus không có.
- **Quan sát latency:** Event `done.eval` ở chế độ eval bảo mật mang timing từng stage, provider và trạng thái
  fallback. Runner tổng hợp median/p95 theo stage; production không lộ trường này do vẫn qua cổng eval ba điều kiện.
- **Runtime:** Failover chỉ nuốt lỗi mạng/timeout đã phân loại. Exception lập trình bị ném lại; SSE không phát
  chunk text rỗng. Lazy loader hiện cảnh báo có thể bấm thử lại.
- **Static/Vercel:** Bỏ route alternation raw-regex không hợp lệ, dùng các path pattern tách riêng; reference
  build chỉ thay token đường dẫn độc lập để không sửa nhầm chuỗi con như `metadata.js`.
- **Đánh đổi:** Schema expectation có thêm một trường tùy chọn; đổi lại grader mô hình hóa đúng hai nhánh
  “khẳng định có căn cứ” và “từ chối do thiếu căn cứ”, không cần prompt-hack wording.

## [2026-07-13] T2C/T2D — deadline end-to-end, request helper chung va static lazy-load

- **Quyết định:** Mỗi request `/api/chat` có một deadline tuyệt đối `CHAT_REQUEST_DEADLINE_MS=55000`, nằm
  trong `maxDuration=60s`. Turnstile, rate limit, rewrite, embedding, Pinecone, rerank, provider và từng
  lần đọc stream đều chỉ được dùng ngân sách còn lại; stage hết hạn hủy được fetch/reader. Không chờ hết
  60s rồi mới fail. Failover DeepSeek chỉ được phép cho lỗi retry-class trước khi đã phát chunk hợp lệ.
- **Telemetry:** Timing/provider/fallback và lý do RAG abstention chạy `waitUntil`, vì telemetry không được
  kéo dài SSE người dùng. Ghi Firestore/RTDB dùng `Promise.allSettled` để một sink lỗi không làm hỏng sink còn lại.
- **Tách helper:** CORS, IP, HMAC, sanitize diagnostic và Telegram chuyển vào `lib/request-security.js`.
  `api/feedback.js` không còn `require('./chat')`; điều này tránh nạp handler/model dependency chỉ để dùng helper.
- **TTHC/UI:** Dùng avatar `icon-128.webp` 3.8KB. Generator tạo `tthc-index.json` chỉ gồm id/title/alias;
  chat chỉ warm index, catalog đầy đủ tải lúc người dùng mở. `js/lazy-features.js` nạp marked/DOMPurify (SRI),
  Turnstile, chat và catalog theo nhu cầu; proxy giữ tương thích `window.TthcCatalog.openProcedure(id)`.
- **Static cache:** Build đổi tên CSS/JS/JSON/asset theo SHA-256 ngắn, viết `asset-manifest.json`, đặt immutable
  cache cho asset đã hash và no-cache cho HTML/manifest. Nếu thêm runtime asset, phải thêm allowlist build và
  kiểm tra reference đã rewrite.
- **Rollback:** Có thể trả loader/catalog/avatar về bản trước bằng rollback deploy; với runtime generation,
  bỏ `LLM_FALLBACK` hoặc hạ `CHAT_REQUEST_DEADLINE_MS` không đòi migrate dữ liệu. Không bật
  `CLAIM_CITATIONS` vì T2B-2 vẫn deferred.
- **Kiểm tra:** 249 unit/integration và 14 E2E PASS; full regression sau T2C có 0 hard fail (F01 deferred).
  Majority 3-run tuần tự đã hoàn tất: gate **KHÔNG ĐẠT** do VP01 hard fail 2/3; TT04/EV01/EV04/DN01/TYPO02
  flaky 1/3. Không dùng kết quả này để rollout flag; VP01 cần được điều tra trước khi chạy lại gate.

---

## [2026-08-10] Fail-closed guard for Published_Locations source/schema mismatch

- **Context:** Production was pointed to a workbook with 142 rows but only three columns. Structural GViz
  validation passed, then every row was misreported as `COORDINATES_MISSING`.
- **Decision:** The public API requires semantic `name` and `coordinates` columns and returns
  `502 GOOGLE_SHEET_SCHEMA_MISMATCH` otherwise. Positional fallback is restricted to the complete
  eight-column legacy layout. A non-empty upstream dataset yielding zero valid locations cannot replace
  the last-known-good cache; an eligible stale cache is used instead. The read-only verifier checks a
  candidate deployment before promotion and exits non-zero on HTTP/schema/dataset failure.
- **Trade-off:** A misconfigured source fails visibly (or serves stale data for at most five minutes),
  rather than rendering an empty map that disguises a source/config error. Complete legacy datasets remain
  supported by the internal loader.
- **Decision maker:** user / Codex.

---

## [2026-07-13] T2B-1 chỉ phát segment đã validate — trạng thái chờ live gate

- **Quyết định:** Buffer raw stream đến ranh giới câu/bullet; chạy `validateAnswer` trên segment hoàn
  chỉnh rồi mới phát SSE. `done.fullText` được dựng trực tiếp từ các segment đã phát, không validate
  lại một bản toàn văn khác.
- **Bằng chứng cục bộ:** Có test tích hợp tầng handler chứng minh canonical bằng đúng phép nối chunk và
  không chunk nào để lọt phone/phí/thời hạn chưa xác minh; validator idempotent được test riêng.
- **Kết quả live gate:** Majority mới `regression-majority-2026-07-13_03-42-51.md` đạt 0 hard fail
  đa số và 0 provider error; TT01/TT04 flaky 1/3 advisory. T2B-1 chuyển DONE.
- **Quyết định T2B-2:** Tiếp tục DEFERRED và giữ flag tắt vì soft warnings lặp quá 1/3 ở một số ca,
  đồng thời p95 hai run vượt mốc baseline +5%; không đủ điều kiện bật per-claim citation.

---

## [2026-07-12] T2A live gate — sửa diễn giải viết tắt cho TYPO02

- **Quan sát:** Chạy `RAG_FAIL_CLOSED=1 node scripts/run-regression.js --majority --runs 3
  --strict-gate` đủ 3 run. Retrieval hoạt động bình thường; gate rớt do `TYPO02` HARD_FAIL đa số
  2/3. Câu trả lời đã hiểu đúng "TQ" là Trung Quốc và nói đúng nghĩa vụ, nhưng hai run chỉ viết
  "phải khai báo" thay vì diễn giải rõ "phải khai báo tạm trú", nên grader không nhận được fact
  `understand_tq`.
- **Quyết định:** Bổ sung vào `SYSTEM_PROMPT_BASE` quy tắc: với câu viết tắt/không dấu trong ngữ
  cảnh người nước ngoài, phải diễn giải lại từ viết tắt và dùng cụm đầy đủ "khai báo tạm trú".
  Đây là cải thiện độ rõ nghĩa cho người dùng, không nới expectation/grader.
- **Trạng thái gate:** Lần chạy đầu chưa đạt do TYPO02 2/3; sau khi vá prompt, chạy lại đủ 3 run
  đạt 0 hard fail đa số. TYPO02 PASS 3/3; GD02 flaky 1/3 và provider errors lẻ tẻ chỉ advisory.

---

## [2026-07-12] T2A — standaloneQuery hợp nhất + fail-closed abstention (gated `RAG_FAIL_CLOSED`, mặc định TẮT)

- **Bối cảnh:** Mở Giai đoạn 2 sau khi Giai đoạn 1 đóng. T2A (LANE-CORE, mức CAO) gồm 2 việc: (1)
  một query độc lập dùng chung cho embedding/classify/exact-token/rerank/thẩm quyền — trước đây
  embedding dùng `searchQuery` (đã ghép ngữ cảnh/rewrite) nhưng classify/exact-token/rerank/XNC dùng
  `userMessage` thô, lệch pha ở câu follow-up ngắn; (2) fail-closed: thiếu RAG → không gọi model trả
  lời thủ tục mà trả thông báo tất định.
- **Quyết định:**
  1. **`standaloneQuery` (= `searchQuery`) dùng chung** cho `classifyQuestion`, `extractExactTokens`,
     `rerankWithGemini`, `detectXncAuthorityIntent`, và regex `foreignNationalScopeContext`. Câu đơn
     (không history) → `standaloneQuery === userMessage.trim()` nên **KHÔNG đổi hành vi** cho bộ 30 câu
     đơn; chỉ khác ở câu follow-up ngắn (< 8 từ, có history — H16/H17). Nhánh khớp trụ sở
     (`findVerifiedLocationMatches`, `isBarePlaceNameQuery`, `isNationalityAnswerContext`) **cố ý GIỮ**
     `userMessage` vì cần đúng câu người dùng vừa gõ (bảo toàn fix T1.9).
  2. **Fail-closed abstention** đặt SAU khi bơm khối XNC, TRƯỚC khi build prompt generation. Hàm thuần
     `shouldAbstainForMissingRag({hasMatchedDocs, hasVerifiedLocation, hasXncAuthorityBlock})` = true chỉ
     khi cả ba rỗng. Khi đó trả `getRagAbstentionReply(userLang)` (vi/en/zh/ko, không số liệu, có "liên
     hệ Công an" để ca must_abstain như TR05 vẫn PASS), event `done` thêm `finishReason:'RAG_ABSTAINED'`
     + `abstentionReason` (`no_pinecone_config`/`embedding_failed`/`pinecone_error`/`no_relevant_match`).
  3. **Gated sau env `RAG_FAIL_CLOSED` (mặc định TẮT).** Lý do: gate T2A đòi "0 hard fail mới" +
     "100% ca thiếu RAG từ chối đúng" — cần đo bằng `--majority`. Quota Gemini embedding đang cạn theo
     NGÀY (2026-07-12) nên **chưa chạy được regression live**. Mặc định tắt = 0 thay đổi hành vi
     production, an toàn để merge; bật + đo khi quota hồi, rollback tức thì bằng gỡ env.
- **Đánh đổi / rủi ro:** Fail-closed có rủi ro over-refuse (baseline Recall@4 ~57-60%, một số câu đang
  trả nhờ match vừa đủ). Đã khoanh vùng: abstain CHỈ khi RAG rỗng hoàn toàn VÀ không có trụ sở xác minh
  VÀ không có khối thẩm quyền XNC (loại TT04/H17 lost-passport, câu location, câu có docs). Vẫn PHẢI
  chạy `--majority` với `RAG_FAIL_CLOSED=1` để xác nhận trước khi bật mặc định — gate này đã đạt ngày
  2026-07-13; flag production vẫn giữ mặc định TẮT cho đến khi owner quyết định rollout.
- **Kiểm tra:** `npm test` 236/236. `test/t2a-fail-closed.test.js` phủ cổng thuần, thông báo đa
  ngôn ngữ, đủ 4 `abstentionReason`, abstain bật/tắt, không gọi generation, eval trace không bị mất,
  nhánh XNC trực tiếp và follow-up đã rewrite không bị over-refuse. `npm run build` sạch (17 file
  `dist/`). Live majority sau khi quota hồi: **ĐẠT**, 0 hard fail đa số; report
  `test/results/regression-majority-2026-07-12_23-20-52.md`. KHÔNG dùng prompt-hack cho F01.
- **Người quyết định:** user ("thực hiện đi" Giai đoạn 2) / Claude Code (Fable 5). Chi tiết:
  `07-parallel-task-plan.md` (T2A).

---

## [2026-07-12] Sửa root cause F01 bằng định tuyến retrieval (chờ verify sạch để đóng Giai đoạn 3)

- **Bối cảnh:** F01 ("Tôi là người nước ngoài, cần **đăng ký tạm trú**") mang trạng thái
  `DEFERRED_SOURCE_GOVERNANCE` từ 2026-07-11, được phép fail tới Giai đoạn 3. Chẩn đoán trực tiếp trên
  Pinecone (script `scripts/diag-f01.js`) cho root cause CHÍNH XÁC, khác giả định "R@4=0 bí ẩn":
  - Nguồn đúng `tthc_matt26265` (`KBTT_HD_Trang_CSLT_v2.0.pdf`, `loai=tam_tru`) **thực tế xếp #2**
    (score 0.782) khi query KHÔNG filter — nó KHÔNG mất tín hiệu.
  - Nhưng câu hỏi dùng cụm CÔNG DÂN "đăng ký tạm trú" (không phải "khai báo tạm trú"), nên
    `detectSplitTempResidenceIntent` trả null → `classifyQuestion` fallback khớp "người nước ngoài"
    → phân loại **`xuat_nhap_canh`**. Filter Pinecone khi đó giới hạn `loai_thu_tuc=xuat_nhap_canh`
    → **loại mất** `matt26265` (tam_tru) khỏi retrieval → R@4=0 ở tầng app. Đồng thời nhánh lọc
    `filterMatchesByQuestionCategory` (phạt tài liệu cư trú công dân qua `CITIZEN_RESIDENCE_PATTERN`)
    KHÔNG chạy vì category không thuộc split-branch → bot trả lời từ tài liệu XNC chung + nhét thuật
    ngữ "đăng ký tạm trú" của công dân (`global_forbidden`).
  - Không vector nào trong index có `review_status`/`supersedes` (hạ tầng supersession mới chỉ được
    ĐỌC trong `summarizeMatchForEval`, chưa populate dữ liệu).
- **Quyết định:** Sửa root cause bằng **định tuyến intent** trong `detectSplitTempResidenceIntent`
  (`api/chat.js`): người nước ngoài + cụm "đăng ký tạm trú" → route vào nhánh `tam_tru_khai_bao`.
  Khi đó filter categories thành `['tam_tru','cu_tru']` (surfacing `matt26265`) và nhánh lọc chạy để
  phạt/loại tài liệu cư trú công dân. Đây là tiêu chí đóng Giai đoạn 3 đã chốt ("lọc được nguồn lỗi
  thời khỏi retrieval") — sửa ở tầng RETRIEVAL, **không phải** "regex chặn từ khóa ở output" mà quyết
  định 2026-07-11 (T1.1) cấm.
- **Bằng chứng fix đúng:** F01 live, lượt DUY NHẤT embedding không 429 (`05-09-20`) cho:
  `[RAG-03] Filter category: tam_tru_khai_bao` (trước là `xuat_nhap_canh`) →
  `Split branch filter reduced matches: 8 -> 1` (loại 7 tài liệu công dân/lệch nhánh, giữ `matt26265`)
  → **Grade: PASS** (không rò NA17, không rò "đăng ký tạm trú" công dân). Unit test classifier pass
  (đăng-ký-tạm-trú→khai_bao; gia-hạn→thị_thực). `npm test` 225/225.
- **CHƯA đóng hẳn — giữ `DEFERRED_SOURCE_GOVERNANCE`:** không lấy được 1 lượt 3/3 sạch vì Gemini
  embedding endpoint 429 liên tục (cạn quota do chạy dồn API trong phiên; chờ 180s không hồi → nghi
  giới hạn theo ngày). Khi 429 thì RAG bị bỏ → mọi ca fail grounding, không riêng F01. **Bước đóng
  Giai đoạn 3:** khi quota hồi, chạy `node scripts/run-regression.js --majority` sạch (không chạy song
  song) xác nhận F01 PASS ≥2/3 → mới flip F01 sang `ACTIVE` trong `test/regression-expectations.json`.
- **[CẬP NHẬT 05-44] Đã dọn dữ liệu production, user xác nhận rõ trước khi ghi:** bản ghi
  `tthc_matt26265` (namespace `chatbot-tthc-xnc`) có field `mau_don="Khai báo điện tử trên hệ thống
  KBTT; trường hợp dùng phiếu khai báo thì theo mẫu NA17."` — field này bị bơm vào ngữ cảnh model qua
  `MAU_DON=...` (`buildVerifiedFactsLine`, `api/chat.js`), rủi ro rò forbidden `obsolete_paper_flow`.
  Patch **chỉ sửa `mau_don`** (bỏ cụm NA17/phiếu) qua `scripts/patch-matt26265-mau-don.js` — **KHÔNG
  re-embed**: `values` (vector 768-dim), `text`, `content_hash` giữ nguyên 100% (script assert cả 3
  không đổi sau upsert). Tránh re-embed vì quota Gemini `embed_content` đã cạn theo NGÀY
  (`EmbedContentRequestsPerDayPerProjectPerModel-FreeTier`, xác nhận qua lỗi RESOURCE_EXHAUSTED) —
  metadata-only upsert không cần gọi embedding API nên không bị chặn. Backup trước/sau tại
  `data/pinecone-backups/2026-07-12_05-44-00-{pre,post}-patch-mau-don-tthc_matt26265.json`; script
  báo lỗi verify do đọc-lại-ngay gặp eventual consistency của Pinecone, nhưng fetch độc lập sau đó xác
  nhận `mau_don` mới đã lên live. Giá trị trung gian này được thay bằng `N/A` lúc 08-47 để giữ đúng
  schema metadata; backup trước/sau cuối cùng là
  `data/pinecone-backups/2026-07-12_08-47-07-{pre,post}-patch-mau-don-tthc_matt26265.json`.
- **Còn lại — chờ quota reset để đóng hẳn Giai đoạn 3:** vẫn giữ F01 `DEFERRED_SOURCE_GOVERNANCE` (xem
  mục "Bước đóng Giai đoạn 3" ở trên) — patch `mau_don` giảm rủi ro nhưng KHÔNG thay thế việc xác nhận
  live 3/3 sạch. Metadata-supersession đầy đủ (tag vector lỗi thời qua `review_status`/`supersedes`) để
  dành lớp sâu hơn, chưa cần cho F01.
- **Người quyết định:** user (yêu cầu "xử lý dứt điểm F01", xác nhận rõ ràng thao tác ghi Pinecone
  trước khi chạy) / Claude Code (Sonnet 5).

- **Cập nhật review PR #30:** Script patch `mau_don` mặc định dry-run; chỉ ghi Pinecone khi truyền
  `--apply`. Metadata mới dùng `N/A` thay vì mô tả cách khai trực tuyến để `buildVerifiedFactsLine`
  không đưa thông tin đó vào nhãn `MAU_DON` như một biểu mẫu. Hướng dẫn KBTT vẫn nằm trong `text` đã
  re-embed của record.

---

## [2026-07-11] Bộ chấm: `grounding_patterns` tách pattern dò tài-liệu khỏi pattern dò câu-trả-lời; forbidden phải negation-aware (T1.8)

- **Bối cảnh:** Baseline T1.7 đỏ 12–16/30 hard fail, nhưng soi từng ca cho thấy ~9/11 ca fail lặp
  lại là **false-positive của bộ chấm**, không phải lỗi bot: (1) forbidden regex bắt cả câu phủ định
  đúng ("**Không** nộp tại Công an phường" vẫn khớp `nộp tại Công an phường`); (2) grounding check
  tái dùng pattern của câu trả lời để dò tài liệu — vỡ khi câu trả lời là en/zh (EV07: pattern chữ Hán
  dò trong docs tiếng Việt = luôn fail) hoặc diễn đạt khác từ ngữ docs (ON01/GD02: R@4 100% vẫn bị
  "ungrounded"); (3) required pattern quá hẹp, trượt diễn đạt tương đương ("không **miễn** nghĩa vụ"
  ≠ "không **thay thế**").
- **Quyết định:**
  - **Schema expectations mở rộng:** fact có thể khai thêm `grounding_patterns` (match **any**) —
    bộ pattern RIÊNG (tiếng Việt) để dò trong `matchedDocs`; không khai thì fallback dùng `patterns`
    như cũ. Grader (`gradeGrounding`) ưu tiên `grounding_patterns` khi có.
  - **Forbidden facts phải negation-aware:** viết pattern với lookbehind
    `(?<!không[^.!?\n]{0,N})` + giới hạn trong cùng câu `[^.!?\n]{0,M}` thay vì `.*` xuyên câu.
    Đã áp cho GV01/GV06; pattern forbidden MỚI phải theo chuẩn này.
  - **TL01 mã hóa lại theo đúng ý định T1.1:** bỏ required fact "phải có cụm phân biệt hạn khai báo
    vs thời gian xử lý" (bắt oan câu trả lời đúng, gọn); thay bằng **forbidden**
    `deadline_confused_with_processing` — chỉ fail khi bot thực sự trình bày 12/24 giờ như thời gian
    xử lý/giải quyết.
- **Đánh đổi:** `grounding_patterns` lỏng hơn (chỉ cần bằng chứng chủ đề trong docs, không cần đúng
  nguyên văn khẳng định) → giảm độ nhạy bắt hallucination tinh vi; bù lại hết false-positive hệ thống
  (đã có test 2 chiều: docs không có bằng chứng → vẫn ungrounded). Xác minh live: 10/11 ca từng fail
  lặp lại chuyển PASS, KC04 còn fail là **gap bot thật** (không đưa hướng dẫn police/embassy).
- **Người quyết định:** user ("Mở T1.8 sửa grader") / Claude Code (Fable 5). Chi tiết: `07-parallel-task-plan.md` (T1.8).
## [2026-07-11] Civic Modern mobile navigation + clustering co kiem soat (T4B)

- **Quyet dinh:** Mobile duoi 768px dung bottom navigation co dinh `Ban do / Thu tuc / Hoi dap AI`; bo 2 launcher noi tren mobile, giu launcher desktop. Chat va catalog tro thanh tab surface nam tren safe area. Marker click mobile chi mo preview 164px; detail day du chi mo khi bam/xoay keo. Marker thuong 38px, marker chon 48px va tach sang `selectedLayer`. Tai zoom <14, marker thuong duoc gom bang Leaflet.markercluster 1.5.3; zoom >=14 bung tung marker.
- **Ly do:** Launcher AI va danh muc dang chong len nhau/che thong tin vi tri; bottom sheet collapsed 50% cua sheet 85vh che khoang 42,5% ban do; 140 marker rieng le lam mat kha nang doc o zoom tinh. Bottom navigation tao 3 diem den on dinh, preview nho giu ban do lam trung tam, clustering giam che phu.
- **Danh doi:** Quyet dinh nay **thay the** quyet dinh [2026-06-28] loai MarkerCluster de luon thay moi pin. O zoom thap nguoi dung thay so cum thay vi tung vi tri, nhung cham cum se zoom vao bounds va zoom 14 bung het marker. Them 1 CDN dependency da pin + SRI; neu plugin khong tai duoc, runtime fallback ve `L.layerGroup()` de ban do van hoat dong.
- **Thu tu:** User yeu cau trien khai truc tiep T4B ngay 2026-07-11, duoc ghi nhan la reprioritize co chu dich so voi phu thuoc T4A trong ke hoach cu.
- **Nguoi quyet dinh:** user / Codex

---

## [2026-07-11] Eval-mode output: gate 3-điều-kiện, tái dùng EVAL_BYPASS_TOKEN (T1.3)

- **Quyết định:** Event SSE `done` đính thêm trường `eval` (trace retrieval: standaloneQuery, category,
  toàn bộ match trước/sau lọc, lý do loại từng match, toàn văn 4 docs cuối) để bộ chấm grounding (T1.5)
  kiểm được Recall@4/fact-in-source mà không phải gọi Pinecone lần hai. Cổng bật là hàm thuần
  `shouldAttachEvalDebug` — true CHỈ khi `NODE_ENV !== 'production'` **AND** `captchaToken` khớp
  `EVAL_BYPASS_TOKEN` **AND** body `evalDebug === true`.
- **Vì sao tái dùng `EVAL_BYPASS_TOKEN`** (thay vì token eval riêng): token này đã là bí mật chỉ bộ
  regression biết (đang dùng để bỏ Turnstile + rate limit), non-production-only, và có sẵn cảnh báo
  khởi động nếu lỡ đặt trên production (`api/chat.js` dòng ~22). Thêm token thứ hai chỉ tăng bề mặt
  cấu hình mà không tăng an toàn. Cờ `evalDebug` tách riêng để eval-run bình thường (đo latency) không
  kéo theo payload trace nặng trừ khi chủ động xin.
- **Đánh đổi:** `eval` chứa toàn văn tài liệu nội bộ → tuyệt đối không được rò production; guard bằng
  `NODE_ENV` (điều kiện đầu tiên, không có đường vòng) + unit test 2 ca bảo mật. Trace chỉ dựng khi
  evalMode (`evalTrace = null` mặc định) nên hot-path production không tốn thêm gì. KHÔNG đụng 4 điểm
  `done` khác (cache-hit, deterministic bare-place…) vì chúng không có dữ liệu retrieval.
- **Người quyết định:** user (kế hoạch) / Claude Code (Opus 4.8). Chi tiết: `07-parallel-task-plan.md` (T1.3).

---

## [2026-07-11] Nội dung: mốc khai báo 12/24 giờ VẪN áp dụng — chỉ luồng phiếu giấy/NA17 là lỗi thời (T1.1)

- **Bối cảnh:** Review 2026-07-11 phát hiện nguy cơ mâu thuẫn trong bộ chấm regression: nếu vừa
  cấm F01 hướng dẫn phiếu giấy vừa không phân biệt rõ, bộ chấm có thể vô tình cấm luôn mốc "12 giờ /
  24 giờ" — trong khi TL01 lại BẮT BUỘC nêu đúng mốc này, và `allowedConstants` trong
  `api/chat.js` whitelist "12 giờ"/"24 giờ" làm hằng số pháp lý lõi. Ba chỗ này phải nhất quán
  trước khi codify vào `test/regression-expectations.json` (T1.2).
- **Quyết định (nội dung, do người dùng chốt):**
  - **LỖI THỜI (phải chặn):** luồng khai báo bằng **phiếu giấy**, mẫu **NA17**, khai báo qua
    **fax/điện thoại**, và hướng dẫn **nộp phiếu trực tiếp** tại trụ sở như con đường chính.
  - **CÒN HIỆU LỰC (giữ nguyên):** **hạn khai báo tạm trú 12 giờ** (hoặc **24 giờ** tại vùng
    sâu/vùng xa) — mốc thời hạn này ÁP DỤNG cho khai báo **trực tuyến qua KBTT**
    (`https://kbtt.xuatnhapcanh.gov.vn`). Lỗi thời là *phương thức* (giấy), KHÔNG phải *thời hạn*.
- **Đồng bộ 3 chỗ (điều kiện hoàn thành T1.1):**
  1. **F01** (`test/cau-hoi/bo-test-regression-30-cau-nguoi-nuoc-ngoai-tthc.md`): kỳ vọng bổ sung
     "cấm phiếu giấy / NA17 / fax / nộp trực tiếp; KHÔNG cấm mốc 12–24 giờ". F01 mang trạng thái
     `DEFERRED_SOURCE_GOVERNANCE` — được phép fail đến hết Giai đoạn 2, chỉ Giai đoạn 3 mới đóng
     (khi metadata supersession lọc được nguồn giấy lỗi thời khỏi retrieval). CẤM sửa nhanh bằng
     prompt/regex chặn từ khóa.
  2. **TL01**: giữ nguyên yêu cầu trả đúng mốc 12 giờ / 24 giờ khi RAG có căn cứ; phân biệt "hạn
     khai báo" với "thời gian xử lý".
  3. **`allowedConstants`** (`api/chat.js`, quanh dòng 2298): **GIỮ NGUYÊN** "12 giờ"/"24 giờ" +
     các bản dịch đã duyệt. T1.1 KHÔNG sửa `api/chat.js` (thuộc LANE-CORE) — chỉ xác minh còn nguyên.
- **Đánh đổi:** F01 baseline sẽ đỏ (deferred) cho tới Giai đoạn 3 — chấp nhận có chủ đích để
  không che lỗi nguồn lỗi thời bằng thủ thuật prompt. Runner phải tự gắn nhãn deferred (không tính
  hard fail) để báo cáo baseline không nhiễu.
- **Người quyết định:** user (chốt nội dung 12/24h) / Claude Code (Opus 4.8). Chi tiết task:
  `docs/brain/07-parallel-task-plan.md` (T1.1).

---

## [2026-07-10] 3 run regression sau Giai doan 2/3 — CHUA dat chuan "sach", phat hien GV02 flaky

- **Ket qua:** Chay 3 lan lien tiep `node scripts/run-regression.js` tren nhanh `feat/chat-ux` (gom code Giai doan 1-3). Khong co `LEGAL_HALLUCINATION` xac nhan o ca 3 lan. Nhung KHONG dat tieu chi "sach" nghiem ngat: Run 1 co 1 FAIL tu cham (GD02 — regex harness doi "tre em" nhung bot viet "tre", noi dung THUC TE dung/khong mien tru, Run 2+3 cung cau PASS → la loi harness, khong phai loi bot) va 1 ERROR `BLOCKED_CONTENT` (GV02); Run 2 co 2 ERROR `BLOCKED_CONTENT` (GV02 + EV01); Run 3 co 1 TRUNCATED (GV02, nhung xu ly dung thiet ke — lui ve ranh gioi cau + notice, khong dut giua cau).
- **Phat hien:** Ca 3 lan deu vuong o **GV02** ("Toi la nguoi Trung Quoc visa DN sap het han, can chuan bi gi?") — luc bi Gemini tu chan (safety filter, khong doi trong Giai doan 2/3), luc cham tran token (maxOutputTokens khong doi). Khong lien quan retrieval/exact-token-boost (cau nay khong co ma mau/so hieu van ban nen khong kich hoat boost). Nghi la Gemini safety classifier khong on dinh voi cum "nguoi Trung Quoc" + "visa" trong ngu canh nay, hoac cau tra loi qua chi tiet (nhieu doc match) de cham tran o mot so lan.
- **Quyet dinh:** VAN commit 3 bao cao vao `test/results/` lam bang chung (dung convention repo), nhung KHONG cong bo day la baseline "san xuat dat chuan" moi — GV02 can dieu tra rieng (xem TASK moi trong `04-current-tasks.md`) truoc khi coi Giai doan 2/3 la an toan tuyet doi cho retrieval. Cac thay doi retrieval (exact-token boost, query rewrite, model tien ich) KHONG gay hallucination moi qua 3 lan — rui ro chinh con lai la flakiness cua GV02, thuoc tang generation/safety chu khong phai RAG.
- **Nguoi quyet dinh:** user (yeu cau chay regression) / Claude Code (Fable 5)

---

## [2026-07-10] Dieu tra GV02 flaky — ket luan: sampling variance o tang generation, khong phai RAG

- **Phuong phap:** (1) Them log chan doan tam thoi (`finishReason`/`promptFeedback`/`safetyRatings` cua Gemini) vao nhanh `BLOCKED_CONTENT` trong `api/chat.js`. (2) Chay GV02 don le 10 lan lien tiep — **10/10 THANH CONG**, dai 137-350 tu (khong bi chan, khong cham tran). (3) Chay full 30-cau them 2 lan nua — 1 lan sach hoan toan (0 FAIL/TRUNCATED/ERROR), 1 lan GV02 tiep tuc TRUNCATED. Tong cong da chay 4 lan full 30-cau: 2 lan co loi GV02, 1 lan GV02 truncated, 1 lan sach 100%. Khong lan nao trong toan bo dieu tra bat duoc dong log `BLOCKED_CONTENT` moi (khong xay ra them trong cac lan sau khi bat log).
- **Ket luan:** GV02 ("Toi la nguoi Trung Quoc visa DN sap het han, can chuan bi gi?") da duoc xep dung ngan sach FULL (250 tu, KHONG phai loi phan loai NARROW/FULL) nhung chu de nay von can tra loi dai (nhieu mau don NA6/NA8, nhieu muc phi, nhieu buoc) — sinh ra 137-350 tu tuy lan, thinh thoang vuot ca 250 va cham tran cung 3072 token. Day la **bien thien sampling tu nhien cua Gemini o `temperature: 0.2`** (khong doi trong Giai doan 2/3) ket hop voi chu de von dai, KHONG phai do exact-token-boost/query-rewrite/doi model tien ich (GV02 khong co ma mau/so hieu van ban nen exact-token-boost khong kich hoat; khong co history nen query-rewrite khong chay; model tien ich chi dung cho rerank/groundedness/summary, khong dung cho generation chinh). `BLOCKED_CONTENT` (Gemini tu chan, tra candidate rong) la hien tuong xac suat thap, co the lien quan classifier an toan nhay cam voi cum "nguoi Trung Quoc" + tinh trang cu tru/visa, nhung KHONG tai hien duoc de bat log chan doan xac nhan category cu the.
- **Quyet dinh:** Giu log chan doan (`api/chat.js`, doi tu "TEMP DEBUG" thanh comment vinh vien P3.5) de lan sau xay ra that trong production co the doc duoc finishReason/safetyRatings tu Vercel logs. KHONG doi threshold safety hay them retry-on-block ngay (can quyet dinh rieng, anh huong toan bo generation). TRUNCATED da duoc xu ly dung thiet ke (lui ranh gioi cau + notice) — chap nhan duoc, khong phai rui ro du lieu. Xoa cac bao cao regression 1-cau phat sinh trong luc dieu tra (khong phai bang chung chinh thuc), giu lai 1 full-run sach moi lam bang chung bo sung.
- **Nguoi quyet dinh:** user (yeu cau dieu tra) / Claude Code (Fable 5)

---

## [2026-07-10] Giai doan 3 UX + khep vong chat luong (SSE status, starter chips, guide deep-link, Telegram alert)

- **Quyet dinh:**
  1. **SSE status 1 event** (`api/chat.js`): thay vi restructure toan bo SSE head de phat 2 pha `retrieving`/`generating` (se pha vo cac nhanh `res.status().json()` xu ly loi TRUOC stream), chi phat 1 event `{status:'generating'}` tai diem writeHead san co (ngay sau khau truy hoi). Client hien "Dang tra cuu…" tu luc gui, doi sang "Dang soan tra loi…" khi nhan event. Event khong co `text`/`done` nen client cu bo qua an toan. `js/gemini.js` them tham so `onStatus`.
  2. **Starter chips khi mo chat** (`js/chatbot.js` `renderStarterChips`): hoi thoai trong → 6 chip cau hoi pho bien, tai dung class `ai-chat-quick-replies` (bi `clearQuickReplies` don khi gui). Chip click dien input + `handleChatSend`.
  3. **Guide deep-link theo title khop chinh xac** (`js/tthc-catalog.js` `findByTitle`/`openByTitle`/`preload`): guide co `procedure_id=guide:*` la id TONG HOP tu catalog, KHONG ton tai trong metadata Pinecone runtime — nen citation guide khong the deep-link qua procedure_id. Giai phap: resolve theo title khop CHINH XAC (chuan hoa `normalizeVi`) trong catalog. `appendSources` chi hien nut doi chieu khi `findByTitle` tra ve id → KHONG bao gio mo nham. Warm catalog trong nen khi MO CHAT (`preload`) de nut resolve duoc, khong eager-load luc tai trang.
  4. **Telegram alert opt-in** (`sendTelegramAlert` trong `api/chat.js`, dung boi groundedness-fail va feedback 👎 trong `api/feedback.js`): no-op neu thieu `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`. Khep vong: `scripts/read-feedback.js --down` hang tuan → them ca sai that vao bo regression.
- **Danh doi:** SSE status don gian hoa (1 event thay 2 pha) danh doi do chi tiet lay an toan error-handling. Guide deep-link phu thuoc title khop chinh xac — neu title citation runtime lech title catalog (vd cat ngan) thi nut khong hien (fail-safe, khong sai). Telegram alert trong feedback `await` truoc khi tra 200 → them chut latency cho vote 👎 (chi khi bat env, feedback goi it).
- **Nguoi quyet dinh:** user / Claude Code (Fable 5)

---

## [2026-07-10] Giai doan 2 nang cap do chinh xac retrieval (exact-token boost, query rewrite, model tien ich, taskType gated)

- **Quyet dinh:**
  1. **Exact-token boost** (`api/chat.js` `extractExactTokens`/`boostExactTokenMatches`): cau hoi chua ma mau don (NA17, TT01) hoac so hieu van ban (5568/QD-BCA, 47/2014) thi don match co token khop NGUYEN VAN len dau TRUOC buoc loc nguong 0.62, va cuu match duoi nguong neu score >= san mem 0.45 (`EXACT_TOKEN_RESCUE_FLOOR`). Rerank sau do van la cong chat luong cuoi. Ly do: bao cao P0.5 ghi nhan bien thien retrieval giua cac lan chay lam bo sot dung van ban nguoi dung goi ten; vector search lam mo token chinh xac.
  2. **Query rewrite follow-up** (`rewriteFollowUpQuery`): cau follow-up ngan (<8 tu) duoc viet lai thanh cau doc lap bang model tien ich (temp 0, 64 token, timeout 2s) truoc khi embed; loi/timeout → fallback heuristic BOT-04 cu (noi keyword tho). Do qua `stageTimings.query_rewrite_ms`.
  3. **Model tien ich → gemini-2.5-flash-lite** (`GEMINI_RERANK_URL`, dung chung cho rerank + groundedness nen + tom tat lich su): the he moi hon 2.0-flash, re/nhanh, du cho tac vu xep hang/tom tat. Generation chinh GIU nguyen gemini-2.5-flash.
  4. **taskType embedding bat doi xung — GATED** (`EMBED_TASK_TYPE`): query-side chi them `taskType` khi env `EMBED_TASK_TYPE` duoc dat; mac dinh khong dat → giu hanh vi cu. Phai kich hoat DONG BO voi re-embed corpus (`RETRIEVAL_DOCUMENT`) sang namespace moi, neu khong query va corpus lech khong gian embedding lam GIAM chat luong. Script `setup/reembed-corpus.js` (mac dinh dry-run) va `setup/backfill-tthc-metadata.js` (mac dinh draft) chi ghi Pinecone khi truyen `--apply`.
- **Danh doi:** (1) Boost co the keo 1 doc duoi nguong vao prompt khi nguoi dung goi dung so hieu — chap nhan vi do la doc lien quan nhat, va san mem 0.45 chan nhieu thuan; (2) Query rewrite them 1 call LLM trong hot path cho cau ngan (timeout 2s bao ve, fallback an toan); (3) Doi model rerank/tom tat co the doi thu tu doc → CAN chay lai 3 run regression truoc khi coi la baseline moi (chua chay het trong dot nay, moi smoke 1 cau TR03 PASS). taskType chua kich hoat cho toi khi corpus duoc re-embed.
- **Nguoi quyet dinh:** user / Claude Code (Fable 5)

---

## [2026-07-10] Tinh nang Bao cao Chatbot: endpoint feedback rieng, luu RTDB, turn_id phia client

- **Quyet dinh:** Them `api/feedback.js` rieng thay vi nhet vao `api/chat.js`. Endpoint tai dung nguyen 4 helper cua chat qua require cheo (`isAllowedOrigin`, `resolveClientIp`, `verifyRequestSignature`, `sanitizeDiagnosticText`) de HMAC khong bao gio lech pha giua client/server. (1) **Luu tru = RTDB** `chat_feedback/<date_key>` (khong dung firebase-admin/Firestore) — 1 fetch REST, cung ha tang telemetry fallback, `scripts/read-feedback.js` doc lai. (2) **`turn_id` sinh phia CLIENT** (`js/chatbot.js`) — de KHONG phai sua 5 diem phat event `done` trong `api/chat.js` (thay doi phau thuat). Bao cao dinh kem san cau hoi + cau tra loi + sources nen khong can doi soat voi telemetry server. (3) **Nut 👍/👎 co san** (truoc chi `lockFeedback` tai cho) duoc noi vao: 👍 gui vote ngay, 👎 mo form (5 loai van de + mo ta + lien he), "Bo qua" van ghi 1 phieu 👎. (4) **Rate limit best-effort** IP/ngay tren RTDB (khong atomic nhu quota chat ton phi LLM) — chi chan spam, fail-open khi loi doc.
- **Ngoai le privacy co kiem soat:** Khac quyet dinh telemetry [2026-06-27] (mac dinh KHONG luu Q/A), feedback CO luu cau hoi + cau tra loi cua luot bi bao cao. Ly do: nguoi dung CHU DONG bam gui (opt-in dong y), va thieu Q/A thi admin khong biet bot sai o dau. Van sanitize PII (email/token/so ho chieu) qua `sanitizeDiagnosticText`, IP HMAC-hash, va co TTL `expires_at` (`FEEDBACK_RETENTION_DAYS` mac dinh 90 ngay).
- **Danh doi:** `api/feedback.js` require `api/chat.js` → keo Pinecone client vao bundle feedback (cold-start nang hon) nhung doi lai HMAC parity tuyet doi; chap nhan vi feedback goi it. `turn_id` client kem tin cay hon server khi doi soat cross-log, nhung du dung vi record da tu chua Q/A. RTDB thay Firestore: option user chon la "Firestore + script" nhung RTDB la cung Firebase, don gian hon va read script van doc duoc — neu sau nay can query/dashboard manh hon thi chuyen sang Firestore collection `chat_feedback`.
- **Nguoi quyet dinh:** user (chon: Firebase + script doc · ca vote nhanh + form chi tiet · co luu Q/A) / Claude Code (Opus 4.8)

---

## [2026-07-10] Fix catalog guide rong va dong bo lenh sinh catalog day du

- **Quyet dinh:** `npm run gen:catalog` nay chay `scripts/generate-tthc-catalog.js --include-guides`; CLI mac dinh `includeGuides=true` va co `--exclude-guides` de audit rieng tap `source_type='tthc'`. Generator bo cac chunk guide khong co `Noi dung wiki`/`Nội dung wiki` that, khong con tao detail chi la `<title>:`; `extractGuideFee` chi tom tat phi tu body muc phi/le phi, khong suy phi tu tieu de. Snapshot `data/tthc-catalog.json` sau regenerate = 92 muc (35 tthc that + 57 guide co noi dung), van du 17 linh vuc.
- **Ly do:** Review commit `0f84233` phat hien 46/102 guide trong snapshot 137 muc gan nhu rong khi mo chi tiet, va `npm run gen:catalog` co the tai sinh sai mode neu khong truyen `--include-guides`. Hai loi nay lam danh muc kho dung trong UI va lam snapshot khong reproducible.
- **Danh doi:** So muc catalog giam tu 137 xuong 92 vi loai guide chi co tieu de/section rong; mot so FAQ/heading ho chieu khong con hien neu KB Pinecone chua co than noi dung. Chap nhan vi card cong khai phai co noi dung doi chieu that. Deep-link tu chatbot van chi cham 35 tthc that nhu truoc.
- **Nguoi quyet dinh:** user / Codex

---

## [2026-07-10] Dao huong 1: catalog gom ca guide, chi loc noi dung noi bo chatbot

- **Quyet dinh:** `data/tthc-catalog.json` da commit gio sinh bang `--include-guides` (137 thu tuc = 35 tthc that + 102 guide). Them `INTERNAL_GUIDE_TITLE_PATTERN` trong `scripts/generate-tthc-catalog.js` de LOAI cac muc guide thuc chat la noi dung noi bo chatbot (title khop `nguyên tắc trả lời | quản trị viên | chatbot | ^người dùng:`) — 8 muc bi loai. Test `data/tthc-catalog.json da commit` doi ky vong sang `includeGuides=true`, ~100–200 muc, phai co ca entry guide lan tthc, va assert 0 muc lo noi dung noi bo.
- **Ly do:** User yeu cau khoi phuc danh muc day du: ban chi-tthc (35) bo sot nhieu linh vuc nguoi dan can (cu tru 13, can cuoc 21, dang ky xe 11, dinh danh dien tu 3, nganh nghe ANTT 3, khieu nai to cao 2, xuat nhap canh 3). Cac linh vuc nay CHI ton tai duoi dang guide trong KB. Bo hoan toan guide (huong 1) la mat scope thuc te. Nhung noi lo lo noi dung noi bo cua huong 1 van dung — nen thay vi bo het guide, chi loc dung 8 muc noi bo.
- **Danh doi:** Danh muc rong hon (137 vs 35) nhung 102 guide co `procedure_id = guide:*` KHONG direct-link tu nut "Doi sanh thu tuc goc" trong chat (nut do chi match `procedure_id` cua tthc). Nghia la: panel duyet day du 17 linh vuc, nhung deep-link tu citation chatbot van chi cham 35 tthc that. Guide chi doc duoc qua duyet danh muc, khong qua nut doi sanh. 6 linh vuc chi-co-tthc (thuong tru, giay thong hanh, tai khoan dien tu, xac nhan thong tin, nguoi khong quoc tich, khu vuc cam) van giu nguyen 17 muc tthc.
- **Nguoi quyet dinh:** user / Claude Code (Opus 4.8) — dao quyet dinh [2026-07-09] "huong 1" ngay duoi.

---

## [2026-07-09] Catalog chi chua TTHC that; guide la opt-in (huong 1) — DA DAO NGAY 2026-07-10

- **Quyet dinh:** Mac dinh `scripts/generate-tthc-catalog.js` CHI xuat thu tuc hanh chinh that (`source_type='tthc'`). Kho `guide` (wiki/FAQ/huong dan noi bo chatbot) chi duoc gop vao khi bat `--include-guides`. Them dedupe theo (linh vuc + cap + ten chuan hoa), giu ban day du hon (uu tien phi da xac minh, roi text dai hon). `missingFromBackups` tinh lai tren tap TRUOC dedupe (audit id khong tai duoc tu Pinecone) — o live mode du du lieu thi rong. Regenerate `data/tthc-catalog.json` = 35 thu tuc that (39 fetch - 4 ban trung title+cap).
- **Ly do:** Che do live truoc do nap CA corpus Pinecone, bien moi chunk RAG thanh mot "thu tuc" (149 entry, 110 guide). Lam lo noi dung noi bo ("Nguyen tac tra loi cua chatbot", "Goi y cho quan tri vien"), cau hoi mau ('Nguoi dung: "..."'), va xe mot thu tuc thanh ~35 manh — phan tac dung voi muc dich "nguon de doi chieu". Chi tiet review: xem log [2026-07-09] duoi.
- **Danh doi:** Catalog hep hon (35 thay vi 149) nhung dung nghia thu tuc hanh chinh. Neu sau nay muon lam san pham "wiki huong dan" rieng thi bat `--include-guides` (code parse guide + test van con). Guide procedure_id la tong hop nen khong direct-link tu chat — khong con la van de vi guide da tach khoi catalog mac dinh.
- **Nguoi quyet dinh:** user / Claude Code (Opus 4.8)

---

## [2026-07-09] Catalog TTHC tinh de doi chieu cau tra loi AI

- **Quyet dinh:** Giu frontend doc `data/tthc-catalog.json` tinh same-origin, nhung doi `scripts/generate-tthc-catalog.js` sang che do uu tien Pinecone live neu local co env hop le. Generator lay ca record `tthc_*` va group `guide_*` thanh mot thu tuc de catalog khong bi hep vao bo backup XNC cu; neu local khong co key hop le thi fallback ve backup trong repo. Chat van chi hien nut doi chieu khi source co `procedure_id`.
- **Ly do:** KB thuc te trong Pinecone rong hon bo backup dang track trong repo; neu tiep tuc sinh catalog tu backup cu thi UI se lech scope va bo sot nhieu TTHC nhu cu tru, can cuoc, dang ky xe. Van giu file tinh o frontend de khong mo Pinecone ra browser.
- **Danh doi:** Catalog van la snapshot, nen muon dong bo voi KB moi nhat phai chay lai `npm run gen:catalog`, commit JSON moi va build lai. Cac guide duoc tong hop theo heuristics (ten thu tuc + muc wiki), nen `procedure_id` direct-link hien chi co cho nhom `tthc_*`; 4 record thieu toan van trong backup cu van duoc ghi nhan o `missingFromBackups` de theo doi.
- **Nguoi quyet dinh:** user / Codex

---

## [2026-07-03] Progressive disclosure UI — quick-reply chips + accordion (chỉ client, không đổi API)

- **Quyết định:** (1) `js/chatbot.js` thêm `detectQuickReplies(fullText)` — hàm thuần nhận diện 3 loại follow-up có tập lựa chọn hữu hạn bằng regex khớp NGUYÊN VĂN phrasing cố định trong `SYSTEM_PROMPT_BASE`/`XNC_RECEPTION_VERIFIED_BLOCK` (api/chat.js): hỏi khu vực cũ (Phú Thọ/Vĩnh Phúc/Hòa Bình) → 3 chip; hỏi quốc tịch khi mất hộ chiếu chưa rõ đối tượng → 2 chip vi/en; câu mời "hướng dẫn đầy đủ hồ sơ" (chế độ HẸP) → 1 chip. Click chip = điền `input.value` rồi gọi lại `handleChatSend()` (tái dùng nguyên luồng gửi, kể cả guard Turnstile). Chip bị dọn (`clearQuickReplies`) mỗi khi gửi tin mới. (2) `applyProgressiveDisclosure(content)` — sau khi render markdown, gom 2 khối `📋 Hồ sơ`/`📝 Trình tự` (nếu CẢ HAI cùng xuất hiện — tức câu trả lời trọn thủ tục) vào `<details>` đóng mặc định; `📍 Nơi nộp`, `📚 Căn cứ` và đáp án mở đầu luôn hiển thị. Câu hỏi hẹp (chỉ 1 marker hoặc 0) giữ nguyên phẳng.
- **Lý do:** Tiếp nối answer-first (xem entry 2026-07-02 ngay dưới) — bot đã trả lời ngắn hơn và kết bằng đúng 1 câu hỏi follow-up, nhưng người dân vẫn phải đọc và gõ lại thủ công (dễ gõ mơ hồ, chậm trên mobile). Chip hóa các follow-up có tập lựa chọn hữu hạn giúp rút ngắn hội thoại mà không đổi nội dung câu trả lời.
- **Đánh đổi:** Chip phụ thuộc CHẶT vào phrasing đúng nguyên văn trong prompt — đã thêm comment cross-reference tại 3 vị trí trong `api/chat.js` (dòng cạnh câu hỏi mất hộ chiếu, câu mời hướng dẫn đầy đủ, và đầu `XNC_RECEPTION_VERIFIED_BLOCK`) nhắc agent sau phải sửa đồng bộ. Không có test nào tự động phát hiện lệch pha giữa prompt và regex — nếu đổi phrasing mà quên sửa `detectQuickReplies`, chip chỉ lặng lẽ ngừng hiện (không lỗi, không crash) — người dân vẫn dùng được bằng cách gõ tay như trước, chỉ mất phần tiện ích. Vì đây là thay đổi thuần client (không đụng `api/chat.js` logic/response, chỉ thêm 3 dòng comment), KHÔNG cần chạy lại 3× regression baseline.
- **Người quyết định:** user / Claude Code

---

## [2026-07-02] Answer-first + ngân sách độ dài + lưới chống ngắt giữa câu

- **Quyết định:** (1) `SYSTEM_PROMPT_BASE` chuyển sang answer-first: câu đầu tiên phải là đáp án trực tiếp; tách 2 chế độ trả lời — câu hỏi HẸP (1 chi tiết, mục tiêu < 120 từ, không dump hồ sơ/trình tự) và câu hỏi TRỌN THỦ TỤC (cấu trúc A, mục tiêu < 250 từ); cấm chào hỏi/xã giao, tối đa 1 câu hỏi follow-up, không lặp thông tin 2 chỗ, mỗi điểm tiếp dân 1 dòng. Chỉ sửa phần mục tiêu/cấu trúc/văn phong — khối "DỮ LIỆU & CHỐNG BỊA" giữ nguyên 100%. (2) Khi chạm trần token (Gemini `MAX_TOKENS` hoặc DeepSeek `length`): `trimToSentenceBoundary()` trong `lib/output-validator.js` cắt lùi về ranh giới câu hoàn chỉnh và nối câu chốt theo ngôn ngữ (`getTruncationNotice`), chạy TRƯỚC `validateAnswer` — người dân không bao giờ thấy văn bản đứt giữa câu. Nếu không có ranh giới an toàn thì bỏ fragment; response truncated không được lưu FAQ cache; notice canonical chỉ nằm trong `fullText`. Giữ `maxOutputTokens: 3072`. (3) `scripts/run-regression.js` đếm từ Unicode bằng `Intl.Segmenter`, gắn soft-fail `VERBOSITY` đúng ngân sách prompt (câu hẹp > 120 từ, câu đầy đủ > 250 từ) và `TRUNCATED`, thêm bảng tổng hợp đầu báo cáo.
- **Lý do:** Đo trên `regression-latest.md` (2026-07-02): trung bình 306 từ/câu, median 334, 6/30 câu > 500 từ (~8-10 màn hình cuộn mobile); câu hỏi có/không như HS02 bị trả 507 từ. Nguyên nhân gốc là prompt cũ ép "sau MỖI câu trả lời phải đủ giấy tờ + nơi nộp" và áp cấu trúc A cho mọi câu. Câu dài cũng là nguyên nhân chạm `MAX_TOKENS` gây đứt giữa câu (VP01/EV01). User yêu cầu rõ: không được để AI ngắt giữa câu.
- **Đánh đổi:** Sửa prompt bắt buộc chạy lại 3 lần regression 30 câu sạch (0 Tier-1, 0 LEGAL_HALLUCINATION, 0 TRUNCATED) trước khi coi là baseline mới — chưa chạy được trong môi trường thiếu API key, phải chạy ở môi trường có key. Rủi ro rút gọn làm mất câu tự khai "chưa có dữ liệu xác minh" được giám sát bằng chính 3 lần chạy đó; lớp bảo vệ chính (output-validator code-level) không phụ thuộc prompt nên không bị ảnh hưởng. VERBOSITY là soft-fail (cảnh báo trong báo cáo), không chặn cứng.
- **Người quyết định:** user / Claude Code

---

## [2026-07-01] Output validator fail-closed tren ban tra loi cuoi

- **Quyet dinh:** Giu streaming thô de bao toan UX, nhung truoc event `done` phai chay `lib/output-validator.js` va redact tai cho SDT, link Maps, toa do, muc phi, ma mau, so hieu van ban va thoi han khong ton tai trong `verified_locations`, tai lieu RAG hoac danh sach hang so prompt da duyet.
- **Ly do:** Prompt khong chan duoc hoan toan hallucination; regression TR02 va EV07 van lo SDT, ma mau va so lieu khong co nguon.
- **Danh doi:** Text thô co the thoang hien trong luc stream, sau do client render lai ban canonical da lam sach. Regex fail-closed can duoc duy tri bang unit test de tranh false-positive.
- **Nguoi quyet dinh:** user / Codex

---

## [2026-07-01] So khop can cu theo so hieu loi, duration log-only

- **Quyet dinh:** Legal reference duoc doi chieu bang so hieu loi `NN/YYYY` thay vi ca chuoi de khong nhay cam voi chu `so`; regex bat tron hau to co chu so nhu `QH13`. Duration tam thoi chi ghi violation, khong redact.
- **Ly do:** Regression that cho thay cac can cu dung bi xoa khi corpus va answer khac dinh dang, dong thoi `QH13` bi cat con `13`. Duration co rui ro false-positive cao khi dinh dang so khac nhau.
- **Danh doi:** Whitelist van can duoc duy tri khi khung phap ly thay doi; duration chua duoc hard-block cho toi khi co matcher tot hon.
- **Nguoi quyet dinh:** user / Codex

---

## [2026-07-02] Tieu chi "dat chuan dua vao thuc te" cho chatbot RAG

- **Quyet dinh:** Chatbot chi duoc coi la san sang production khi dat ca 4 dieu kien: (1) 3 lan chay lien tiep bo regression 30 cau khong co loi Tier-1 (SDT/dia chi/Maps bia) va khong co LEGAL_HALLUCINATION; (2) telemetry co canh bao khi ty le `output_validator_violation` vuot nguong; (3) disclaimer AI hien thi cho nguoi dung (da co); (4) quy trinh cap nhat van ban phap luat moi vao Pinecone co nguoi duyet (tuong tu pipeline staging da co cho tru so).
- **Ly do:** Bao cao review 2026-07-02 xac nhan baseline 27/30 (1 hallucination that EV07, 1 soft-fail TR02) chua du de nhan danh co quan Cong an tra loi tu dong; can tieu chi do luong ro rang thay vi danh gia cam tinh.
- **Danh doi:** Se ton them thoi gian/API quota de chay regression nhieu lan truoc moi lan coi la "baseline moi"; doi lai giam manh rui ro dua thong tin sai ra cong khai.
- **Nguoi quyet dinh:** user / Claude Code (Sonnet 5)

---

## [2026-07-02] P0: Bo fallback duoi nguong, redact duration, allowedConstants chi con hang so loi, structured facts tu metadata

- **Quyet dinh:**
  1. **Bo fallback lay top-3 khi khong co match vuot nguong 0.62** (`api/chat.js`, RAG-03 block) — truoc day khi khong co match nao du diem, code van lay 3 match yeu nhat lam `matchedDocs`, tao nguyen lieu cho model "lap cho trong". Gio khi duoi nguong, `matchedDocs` de rong, di vao nhanh "khong tim thay tai lieu phu hop" da co san trong prompt.
  2. **DURATION_PATTERN chuyen tu `log_only` sang `redact`** (`lib/output-validator.js`) — dung chung co che `redact()` nhu MONEY/FORM, doi chieu voi `legalCorpus` + `allowedConstants`.
  3. **`allowedConstants` trong validator chi con hang so phap ly loi bat bien** (`'12 gio', '24 gio', 'Dieu 33'`) — cac so hieu van ban cu the (47/2014, 51/2019...) bi xoa khoi hardcode vi da nam trong `legalCorpus` (matchedDocs) khi tai lieu tuong ung thuc su duoc Pinecone tra ve; neu van ban khong duoc truy xuat ma model van neu so hieu thi DUNG y do la phai bi redact (fail-closed), tranh no bao tri khi them van ban moi ma quen sua code.
  4. **Structured facts tu metadata Pinecone** — them `buildVerifiedFactsLine()` doc field `le_phi`/`phi` (va `thoi_han`/`mau_don` khi co du lieu trong tuong lai) tu metadata, bom thanh dong `[FACTS DA XAC MINH]` ngay duoi tung tai lieu trong `matchedDocs`. System prompt duoc them 1 dong chi dao uu tien dong FACTS thay vi tu dien giai tu van ban thuong.
- **Ly do:** Diet goc 3 nguon hallucination chinh ma bao cao review chi ra: tai lieu yeu duoc dua vao prompt, duration khong duoc chan (chi log), whitelist so hieu van ban la nguon that su xa roi Pinecone that.
- **Phat hien khi khao sat du lieu (quan trong cho TASK-P0-04-EXT):** Kiem tra truc tiep `data/pinecone-backups/2026-07-01-*.json` cho thay metadata Pinecone GOC (38 record) KHONG co field `thoi_han` hay `mau_don` nao ca — chi co `le_phi`/`phi` duoc chuan hoa cho 34/38 record trong dot va phi ngay 2026-07-01. Code `buildVerifiedFactsLine` da viet san de doc ca 3 field nhung 2 field con lai se khong bao gio kich hoat cho toi khi du lieu Pinecone duoc backfill (xem TASK-P0-04-EXT trong `04-current-tasks.md`).
- **Danh doi:** Cau tra loi co the tro nen "it thong tin hon" o mot so cau ma truoc day dua vao tai lieu yeu de tra loi (dung y do thiet ke, khong phai loi); can chay lai regression de do tac dong thuc te.
- **Nguoi quyet dinh:** user / Claude Code (Sonnet 5)

---

## [2026-07-02] P0.5: Baseline production da dat, 3 lo hong validator vs them vao qua thuc nghiem

- **Quyet dinh:** Baseline chinh thuc la 3 file `regression-run-2026-07-02_06-13-26.md`, `_06-24-57.md`, `_06-39-56.md` — ca 3 chay lien tiep khong loi Tier-1, khong LEGAL_HALLUCINATION xac nhan. Dieu kien "dat chuan production" (entry truoc) coi la DA DAT cho vong P0.
- **3 lo hong vaidator vs them trong qua trinh chay (khong phat hien duoc qua doc code tinh, chi lo ra khi chay that nhieu lan):**
  1. `MEASUREMENT_PATTERN` moi — bat thong so vat ly (cm/mm/px/MB/KB/GB, ca don vi chu Han 厘米/毫米/公分) — vd EV07 bia "4×6cm/JPEG/≤2MB" khong pattern nao cu phu toi.
  2. Sua bien `(?<!\w)`/`(?!\w)` trong MONEY_PATTERN chi ap dung rieng cho token `đ` bare (khong doi bien chung — da thu doi bien chung `\w` -> `\p{L}\p{N}` mot lan va lam mu hoan toan phat hien tien te tieng Trung do so dinh lien chu Han khong dau cach; revert va chi sua hep pham vi token `đ`).
  3. `allowedConstants` trong `api/chat.js` them ban dich EN/ZH/KO cua dung 2 hang so "12 gio"/"24 gio" (`12 hours/24 hours/12小时/24小时/12시간/24시간`) — hoi quy do P0.2 (duration tu log-only sang redact that) lam hong cau tra loi da ngon ngu: dich "12 gio" sang "12 hours" khong con khop legalCorpus tieng Viet nen bi xoa oan.
  4. `MONEY_RANGE_PATTERN` moi — cum "X den Y dong" chi co don vi o cuoi, MONEY_PATTERN don le chi bao ve duoc so Y.
- **Phat hien quan trong (khong phai quyet dinh, nhung anh huong cach doc ket qua sau nay):** Da query truc tiep Pinecone de xac minh — cac con so "nghi van hallucination" trong EV07/GV06/HS02/TT01/VP01 (25/50 USD e-visa, 145/155/165 USD the tam tru, 10 USD/lan gia han, 4x6cm/JPEG/≤2MB, 3 ngay lam viec) **DEU la du lieu that trong Pinecone** (record `tthc_5568-tw-06/07/08` etc.), khong phai model bia. Sai lech giua cac lan chay la do retrieval tra ve chunk khac nhau (bien thien tu nhien cua embedding search), khong phai loi validator hay loi model — validator dang hoat dong dung thiet ke (redact khi khong co chunk lien quan, giu khi co).
- **Danh doi:** Sua o pham vi hep (chi token `đ`, chi 2 hang so thoi han) de tranh pha vo cac phat hien dung khac (tieng Trung, cac gia tri khac). Con lai 2 gap da biet nhung chap nhan duoc: duration tieng Trung dung luong tu "个" (vd "3个工作日") khong khop pattern; duration dung "ngay" tran (khong phai "ngay lam viec") khong duoc phu de tranh false-positive qua rong.
- **Nguoi quyet dinh:** user / Claude Code (Sonnet 5)

---

## [2026-07-01] Tach intent `tam_tru` thanh 2 nhanh retrieval

- **Quyet dinh:** Tach bucket intent runtime thanh `tam_tru_khai_bao` (NA17, Cong an cap xa, co so luu tru) va `tam_tru_the` (NA6/NA7/NA8, Cong an cap tinh, giay phep lao dong). Luc query van map ve metadata Pinecone hien co (`tam_tru`, `cu_tru`), sau do post-filter theo `title`/`text` de loai chunk khac nhanh.
- **Ly do:** Pinecone hien dang dung chung nhan `tam_tru` cho ca khai bao tam tru va the tam tru. Vi vay cau hoi khai bao tam tru co the keo nham chunk `Cap the tam tru ... Phí/lệ phí: Không phí`, dan den bot tra `No fee` sai ngu canh.
- **Danh doi:** Tang them mot lop heuristics trong runtime va bo test unit canh goc retrieval. Khong giai quyet triệt để neu KB metadata sau nay tiep tuc gom nhieu thu tuc khac nhau vao cung mot nhan, nhung du de chan hoi quy TR09/TT01 trong hien trang.
- **Nguoi quyet dinh:** user / Codex

---

## [2026-06-29] Đưa giới hạn Rate Limit vào biến môi trường

- **Quyết định:** Chuyển các giới hạn `monthlyLimit` và `dailyIpLimit` từ hardcode sang cấu hình thông qua biến môi trường `CHAT_MONTHLY_LIMIT` và `CHAT_DAILY_IP_LIMIT` (mặc định tương ứng 10.000 và 50).
- **Lý do:** Đáp ứng tính linh hoạt trong quá trình demo và vận hành thực tế, tránh sửa code mỗi lần muốn đổi giới hạn quota.
- **Đánh đổi:** Cần cấu hình thêm 2 biến môi trường trên Vercel.
- **Người quyết định:** user / Antigravity

## [2026-06-29] Alias dia danh cho Published_Locations, nhung chi tra don vi hien hanh

- **Quyet dinh:** Bo sung cot tuy chon `search_aliases` cho `Location_Staging` va `Published_Locations` de luu dia danh cu/viet tat phan cach bang `|`. Runtime chatbot chi hien thi `name` la ten don vi Cong an hien hanh, con alias chi dung de match.
- **Ly do:** Sau thay doi dia gioi hanh chinh 2025, nguoi dan co the nhap dia danh cu nhu `Bach Hac`, `Tien Cat`, `Tho Son`, `Song Lo` hoac cau dau ngan chi la `Thanh Mieu`. Can map ve don vi hien hanh mot cach xac dinh ma khong de model suy dien tu tai lieu cu.
- **Danh doi:** Pipeline Google Sheets va Apps Script phai mang theo them mot truong schema; matcher phai exact-normalized theo ranh gioi tu, khong fuzzy, va khi alias trung nhieu don vi thi chatbot bat buoc hoi lai thay vi tu chon.
- **Nguoi quyet dinh:** user / Codex

---

## [2026-06-28] Chatbot lay tru so chi tu Published_Locations

- **Quyet dinh:** Runtime chatbot van dung Pinecone cho thu tuc/phap luat, nhung ten don vi, dia chi, so dien thoai, toa do va Google Maps chi duoc lay tu Google Sheet `Published_Locations` qua helper `lib/published-locations.js`. Vector Pinecone `tru_so` duoc giu lai de rollback nhung khong dua vao prompt/citation.
- **Ly do:** Pinecone rerank co the day chunk `tru_so` ra khoi top ket qua khi cau hoi ghep thu tuc + noi nop, dan den luc dau chatbot bao "chua co du lieu" nhung hoi lai thi tim thay. `Published_Locations` la nguon duoc duyet va co cau truc on dinh hon cho dia chi tru so.
- **Danh doi:** Backend phai them cache Google Sheets 60 giay va stale fallback 5 phut, them logic match exact-normalized khong fuzzy, va xu ly rieng ban ghi mau thuan thay vi de model tu suy dien.
- **Nguoi quyet dinh:** user / Codex

---

## [2025] Static site — không dùng framework frontend

- **Quyết định:** Frontend là HTML + TailwindCSS + Vanilla JS thuần, không React/Vue/Svelte.
- **Lý do:** Deploy nhanh trên Vercel (không cần build step), bundle size nhỏ, không dependency JS
  framework, dễ debug. Dự án chủ yếu là bản đồ + chatbot — không cần reactivity phức tạp.
- **Đánh đổi:** Không có component reuse tốt; state management thủ công.
- **Người quyết định:** user

---

## [2025] TailwindCSS pre-built — không build trên Vercel

- **Quyết định:** `output.css` được build local và commit vào repo. Vercel build command là `echo`.
- **Lý do:** Đơn giản hóa CI, tránh lỗi build trên Vercel. Dự án tĩnh không cần build pipeline.
- **Đánh đổi:** Phải nhớ rebuild `output.css` local (`npm run dev`) mỗi khi thêm Tailwind class mới
  và commit cả `output.css`.
- **Người quyết định:** user

---

## [2026-06-27] System Prompt hardcode trong code, BỎ Vercel Edge Config

- **Quyết định:** System prompt chatbot là hằng số `SYSTEM_PROMPT_BASE` trong `api/chat.js`
  (nguồn duy nhất). `getSystemPrompt()` trả thẳng hằng số này, KHÔNG đọc Edge Config nữa.
- **Lý do:** bandocapt và `mohinh-andn` dùng chung Edge Config store → cùng đọc key `SYSTEM_PROMPT`
  sẽ đè prompt của nhau. Hai dự án cần prompt khác nhau. Hardcode loại bỏ rủi ro đụng độ và làm
  prompt minh bạch trong source.
- **Đánh đổi:** Đổi system prompt phải sửa code + redeploy (không còn cập nhật nóng qua dashboard).
  Chấp nhận được vì prompt ít đổi và tính đúng đắn quan trọng hơn tốc độ cập nhật.
- **Hệ quả:** Gỡ `require('@vercel/edge-config')` trong `api/chat.js`; biến env `EDGE_CONFIG`,
  `EDGE_CONFIG_ID` trở thành không dùng (vô hại nếu vẫn còn trên Vercel).
- **Thay thế quyết định cũ** "[2025] System Prompt lưu trên Vercel Edge Config".
- **Người quyết định:** user

---

## [2025] RAG với Pinecone + Gemini Embedding

- **Quyết định:** Dùng Pinecone làm vector DB, Gemini Embedding 001 để tạo vector, re-rank bằng
  Gemini 2.0 Flash trước khi trả kết quả cho LLM.
- **Lý do:** Gemini Embedding 001 hỗ trợ đa ngôn ngữ tốt (vi/en/zh/ko) — không cần dịch query.
  Pinecone có managed hosting, SDK Node.js ổn định.
- **Đánh đổi:** Chi phí Pinecone + Gemini API; latency tăng do pipeline embed → query → rerank.
- **Người quyết định:** user

---

## [2025] Rate limiting bằng Firebase (không Redis)

- **Quyết định:** Dùng Firebase Realtime DB để đếm lượt dùng (tháng: 3500, ngày/IP: 20). Dùng
  ETag + Optimistic Locking để tránh race condition.
- **Lý do:** Firebase có free tier, không cần setup Redis riêng. Vercel KV tốn phí hơn.
- **Đánh đổi:** Firebase Realtime DB có latency cao hơn Redis; cần retry/rollback nhiều hơn để giữ
  quota đúng dưới tải đồng thời. Harness local 50 concurrent request đã khóa hành vi không vượt quota,
  nhưng độ ổn định vẫn phụ thuộc semantics ETag của RTDB.
- **Người quyết định:** user

---

## [2025] Bảo mật nhiều lớp (CORS + HMAC + Turnstile + Injection Detection)

- **Quyết định:** Kết hợp 4 lớp bảo vệ: CORS whitelist, HMAC request signing, Cloudflare Turnstile
  CAPTCHA, và prompt injection pattern matching.
- **Lý do:** Chatbot dùng API tốn phí (Gemini/Pinecone) — phải chống bot và abuse. Mỗi lớp bắt
  một loại tấn công khác nhau.
- **Đánh đổi:** Code phức tạp hơn; developer cần biết tất cả lớp bảo vệ khi debug.
- **Người quyết định:** user

---

## [2025] Google Sheets làm nguồn dữ liệu trụ sở (với fallback tĩnh)

- **Quyết định:** Dữ liệu trụ sở Công an được lưu trên Google Sheets, lấy qua `api/google-sheet.js`
  proxy. `data.js` là fallback tĩnh khi Sheets lỗi.
- **Lý do:** Cho phép cán bộ cập nhật dữ liệu không cần deploy code. Sheet ID được ẩn qua proxy.
- **Đánh đổi:** Phụ thuộc vào Google Sheets availability; data.js phải được cập nhật thủ công khi
  có thay đổi lớn.
- **Người quyết định:** user

---

## [2025] DeepSeek là LLM dự phòng (override Gemini)

- **Quyết định:** Nếu `DEEPSEEK_API_KEY` tồn tại trong env, toàn bộ chat dùng DeepSeek thay Gemini.
- **Lý do:** Dự phòng khi Gemini rate limit hoặc giá tăng.
- **Đánh đổi:** Phải convert payload từ Gemini format sang OpenAI format; cần test riêng với DeepSeek.
- **Người quyết định:** user

---

## [2025] Xóa no-referrer meta tag để fix OpenStreetMap 403

- **Quyết định:** Bỏ `<meta name="referrer" content="no-referrer">` khỏi index.html.
- **Lý do:** OpenStreetMap tile server từ chối request không có Referer header (trả 403).
- **Đánh đổi:** Trình duyệt sẽ gửi Referer khi tải tile — chấp nhận được vì đây là URL public.
- **Người quyết định:** user (commit 91718ec)

---

## [2026-06-27] Runtime chỉ đọc Published_Locations và loại tọa độ không hợp lệ

- **Quyết định:** API Google Sheet chỉ allowlist `Published_Locations`; frontend normalize dữ liệu qua
  `js/location-data.js` và không tạo marker nếu tọa độ sai hoặc ngoài vùng phục vụ.
- **Lý do:** Ngăn submission thô hoặc tọa độ rác xuất hiện như một trụ sở hợp lệ trên bản đồ công khai.
- **Đánh đổi:** Pipeline quản trị phải duy trì sheet đã phê duyệt và xử lý báo cáo bản ghi bị loại.
- **Người quyết định:** user / Claude Code

---

## [2026-06-27] Pipeline dữ liệu bản đồ qua allowlist → staging → published

- **Quyết định:** Dữ liệu Google Form không đi thẳng ra public; Apps Script quản trị ghi vào
  `Location_Staging`, chỉ admin mới approve/reject/revoke để cập nhật `Published_Locations`, và mọi
  hành động append vào `Approval_Audit_Log`.
- **Lý do:** Chặn bản ghi giả hoặc sai đơn vị trước khi xuất hiện trên bản đồ công khai, đồng thời giữ
  truy vết submitter + reviewer cho từng marker.
- **Đánh đổi:** Cần triển khai trigger/menu trong Google Workspace thật và vận hành allowlist/audit.
- **Người quyết định:** user / Codex

---

## [2026-06-27] Telemetry tối thiểu, diagnostic content là opt-in

- **Quyết định:** Log mặc định chỉ chứa metric tổng hợp và HMAC bucket của IP; question/answer chỉ
  được ghi khi `CHAT_DIAGNOSTIC_LOG=on|true`, còn nằm trong cửa sổ `CHAT_DIAGNOSTIC_LOG_UNTIL`, qua
  sample rate cấu hình và có `CHAT_DIAGNOSTIC_LOG_APPROVED` nếu chạy ở production. RTDB fallback bắt buộc
  dùng `FIREBASE_DB_URL` từ env.
- **Lý do:** Giảm thu thập dữ liệu cá nhân trong hội thoại pháp luật và loại fallback cross-project.
- **Đánh đổi:** Điều tra lỗi nội dung cần phê duyệt privacy và bật cờ vận hành có kiểm soát.
- **Người quyết định:** user / Claude Code

---

## [2026-06-27] Tách metric và diagnostic telemetry, TTL theo `expires_at`

- **Quyết định:** Metric log và diagnostic log được ghi vào collection/path riêng; cả hai đều có
  `retention_days` và `expires_at`. Diagnostic content bị sanitize email/token/số hộ chiếu trước khi lưu.
- **Lý do:** Giảm blast radius của dữ liệu nhạy cảm, cho phép TTL policy riêng cho metric và diagnostic,
  và giữ RTDB fallback có thể prune tự động bằng script.
- **Đánh đổi:** Cần thêm cấu hình vận hành cho TTL Firestore và chạy prune job cho RTDB fallback khi dùng.
- **Người quyết định:** user / Codex

---

## [2026-06-27] Build và CI kiểm tra artifact thật

- **Quyết định:** `npm run build` compile Tailwind, kiểm tra syntax và tạo `dist/`; CI chạy
  `npm test`, build và production dependency audit bằng Node.js 20.
- **Lý do:** Ngăn deploy code sai syntax, CSS/artifact thiếu hoặc regression ở các boundary P0.
- **Đánh đổi:** Build mất thêm thời gian và vẫn cần kiểm tra trình duyệt cho hành vi UI thực tế.
- **Người quyết định:** user / Claude Code

---

## [2026-06-28] Loại bỏ MarkerCluster khỏi bản đồ

- **Quyết định:** Gỡ bỏ thư viện `Leaflet.markercluster`, hiển thị tất cả các marker trực tiếp qua `L.layerGroup()`.
- **Lý do:** Khi zoom khu vực rộng, marker bị gộp lại thành các con số (cluster) khiến người dùng không thể nhìn thấy trực tiếp vị trí các trụ sở. Người dùng muốn xem tất cả vị trí mọi lúc.
- **Đánh đổi:** Nếu số lượng trụ sở tăng lên rất lớn (hàng nghìn), bản đồ có thể bị chậm do phải render quá nhiều DOM node cùng lúc trên Leaflet.
- **Người quyết định:** user / Antigravity

---

## [2026-06-30] Stopword tên tỉnh + giới hạn nhánh trả lời tất định (location matcher)

- **Quyết định:** (1) Tên cấp tỉnh/khu vực trùng `bareName` đơn vị (`phu tho`, `tinh phu tho`, `viet tri`, `vinh phuc`, `hoa binh`) bị cấm match qua bareName/approved trần — chỉ match khi người dùng nói rõ "phường/xã <tên>". (2) Nhánh trả lời tất định (bỏ qua LLM) chỉ áp dụng khi `isVietnamese && !hasProcedureIntent && status ∈ {no_match, unavailable}`; `ambiguous_*` luôn đi qua LLM để trình option/hỏi lại.
- **Lý do:** Người dùng nhắc tên tỉnh như ngữ cảnh vùng, không phải tên đơn vị → match trần gây sai trụ sở diện rộng (KC04/DN01). Câu mơ hồ nhiều đơn vị (ambiguous) cần hỏi lại chứ không phải "không có dữ liệu"; câu khác ngôn ngữ không được nhận boilerplate tiếng Việt.
- **Đánh đổi:** Người dùng muốn tra đúng phường Phú Thọ/Việt Trì phải gõ kèm "phường/xã"; nếu sau này có địa danh hợp lệ trùng stopword phải thêm alias rõ ràng trong sheet.
- **Người quyết định:** user / Claude Code

---

## [2026-06-30] Bơm tĩnh dữ liệu Phòng QLXNC theo intent + retry lỗi mạng

- **Quyết định:** (1) Dữ liệu trụ sở Phòng QLXNC (3 điểm tiếp dân, hiệu lực 13/4/2026) được nhúng **tĩnh trong `api/chat.js`** (`XNC_RECEPTION_VERIFIED_BLOCK`) và bơm vào `<verified_locations>` khi `detectXncAuthorityIntent()` đúng — KHÔNG đi qua sheet `Published_Locations` vì chưa có tọa độ chính thức (sheet bắt buộc tọa độ, thiếu thì bị loại). Chỉ nêu địa chỉ + SĐT, không tạo link Maps tới khi có tọa độ. (2) `fetchWithRetry` retry cả lỗi mạng dạng throw, không chỉ HTTP 429/503.
- **Lý do:** Matcher trụ sở là so khớp từ khóa, không hiểu thẩm quyền → câu visa/XNC không match được đơn vị cấp tỉnh nên model bịa địa chỉ/SĐT (EV04, GV06). Bơm theo intent đảm bảo model luôn có dữ liệu thật, độc lập matcher (kể cả khi matcher khớp nhầm một phường). Retry lỗi mạng để VP01-style ECONNRESET không làm rỗng câu trả lời.
- **Đánh đổi:** Dữ liệu QLXNC nằm trong code thay vì sheet → khi đổi địa chỉ phải sửa code + deploy (chấp nhận vì đơn vị cấp tỉnh ít, tĩnh). Khi có tọa độ chính thức nên cân nhắc chuyển sang `Published_Locations` để hiển thị trên bản đồ + tạo link Maps. Retry lỗi mạng có thể tăng độ trễ tối đa khi mạng chập chờn (vẫn trong ngân sách <10s/lần fetch).
- **Người quyết định:** user (chọn phương án B, chưa cấp tọa độ) / Claude Code

---

## [2026-07-01] Vá trực tiếp dữ liệu phí/lệ phí trong Pinecone (source_type=tthc) — không phải sửa code

- **Bối cảnh:** Codex phát hiện bug ở tầng ingest (không nằm trong repo này): khi dựng `metadata.text` cho các bản ghi `source_type: "tthc"`, hai trường `Lệ phí` và `Phí` bị gộp thành 1 dòng `Phí/lệ phí: <giá trị>`, khiến giá trị `Phí` (vd phí thẻ tạm trú 145/155/165 USD) bị `Lệ phí` (thường là "Không") nuốt mất. Đây chính là nguyên nhân TT01/GV06 trả lời sai "miễn phí" trong `regression-run-1.md`, KHÔNG phải lỗi model hay lỗi prompt.
- **Quyết định:** Vì không có script ingest nào trong repo để sửa tận gốc, đã **trực tiếp vá metadata trong Pinecone** (namespace `chatbot-tthc-xnc`, 38 record `tthc_*`) qua `ns.update()` (metadata-only, giữ nguyên vector):
  - 4 record đã được user tự sửa trước (`5568-tinh-05`, `5568-tw-10`, `5568-tw-08`, `5568-tinh-04`).
  - 26 record được Claude Code vá với số liệu **đã tra cứu và đối chiếu với Thông tư 28/2026/TT-BTC** (hiệu lực từ 01/4/2026, thay thế Thông tư 25/2021/TT-BTC) qua 4 sub-agent nghiên cứu song song + WebFetch trực tiếp.
  - 8 record KHÔNG có nguồn đủ tin cậy (mâu thuẫn giữa các nguồn, hoặc không tìm thấy số cụ thể) — chủ động ghi `le_phi`/`phi` = **"Chưa xác minh"** kèm ghi chú trong `text`, thay vì để nguyên giá trị bịa cũ hoặc tự đoán số mới. Danh sách: `5568-tinh-11` (giấy phép khu vực cấm), `5568-tw-01`/`5568-tinh-01` (hộ chiếu phổ thông — phí mâu thuẫn giữa các Thông tư theo từng giai đoạn), `5568-tinh-08` (thẻ thường trú cấp mới), `tinh-02`/`xa-02` (giấy thông hành VN-Lào — chưa rõ áp dụng TT nào), `5568-tinh-09` (cấp đổi thẻ thường trú), `5568-tw-09` (xét duyệt nhân sự cấp phép nhập cảnh).
  - Đã sao lưu toàn bộ metadata gốc của 34 record trước khi ghi đè, lưu tại `data/pinecone-backups/` (không track git, xem `.gitignore`/thêm nếu cần):
    - `2026-07-01-pre-update-backup-original-metadata.json` — metadata gốc của 34 record trước khi sửa (dùng để khôi phục nếu cần).
    - `2026-07-01-fee-corrections-map-applied.json` — mapping `le_phi`/`phi` đã áp dụng cho từng `procedure_id` (nhóm `write` vs `uncertain`).
    - `2026-07-01-apply-log.json` — log kết quả ghi từng record (UPDATED / UPDATED_AS_UNCERTAIN).
    - `2026-07-01-audit-after-fix.json` — snapshot toàn bộ 38 record sau khi vá (để so sánh khi audit lại sau này).
- **Lý do:** Không được lặp lại đúng lớp lỗi đang cố diệt (bịa số liệu pháp lý) khi "sửa" dữ liệu — nếu không chắc chắn, phải nói rõ "chưa xác minh" để prompt chống-bịa (đã thêm ở P1) xử lý đúng, thay vì tự tổng hợp số liệu từ suy luận.
- **Đánh đổi:** 8 record vẫn thiếu số liệu phí cụ thể — bot sẽ nói "chưa có thông tin/cần liên hệ trực tiếp" cho các thủ tục đó cho tới khi ai đó xác minh và cập nhật. Toàn bộ 38 record vẫn còn ghi "Căn cứ pháp lý: ... Thông tư số 25/2021/TT-BTC" (đã hết hiệu lực) trong phần cuối `text` — CHƯA cập nhật số hiệu thông tư mới vì phạm vi lần vá này chỉ nhắm vào dòng phí/lệ phí; cần dọn lại citation này ở lượt sau.
- **Việc còn tồn đọng cho agent sau:**
  1. Xác minh 8 record "Chưa xác minh" ở trên (tra Thông tư 28/2026/TT-BTC bản gốc hoặc gọi trực tiếp cơ quan) rồi vá tiếp bằng cùng cơ chế `ns.update()`.
  2. Cập nhật lại phần "Căn cứ pháp lý" trong `text` của toàn bộ 38 record từ "Thông tư 25/2021/TT-BTC" sang "Thông tư 28/2026/TT-BTC" (số tiền không đổi, chỉ đổi số hiệu văn bản).
  3. Ingest pipeline gốc (không có trong repo) vẫn còn bug gộp `Phí`/`Lệ phí` — nếu có đợt ingest mới/khác trong tương lai (thêm thủ tục mới, category khác `source_type`), rất có thể lặp lại đúng lỗi này; nên kiểm tra khi thấy `text` chứa chuỗi `"Phí/lệ phí:"`.
- **Người quyết định:** user (yêu cầu "khắc phục luôn") / Claude Code, dựa trên chẩn đoán gốc của Codex

---

## [2026-07-02] P1: Retrieval, giam sat, bao mat, hieu nang

- **Quyet dinh:**
  1. **Bo vong thu 4 namespace Pinecone** (`api/chat.js`) — pin dung 1 namespace tu `PINECONE_NAMESPACE`, chi giu lai 1 fallback bo metadata filter khi co category ma 0 match (van co san truoc do). Giam worst-case tu 4 query tuan tu xuong 1-2.
  2. **Rerank co dieu kien** — them `shouldSkipRerank(matches)`: bo qua `rerankWithGemini` khi top-1 > 0.75 diem VA cach top-2 >= 0.05 (ket qua da ro rang, khong map mo). Tiet kiem 1 LLM call + 0.5-2s cho da so cau hoi co match manh.
  3. **Query rewriting nhe** — chi ghep tu khoa cau truoc vao query embedding khi cau hien tai < 8 tu (follow-up ngan); cau du dai (>= 8 tu) da tu du nghia, dung doc lap giu embedding sach.
  4. **Groundedness check (canh bao, khong chan)** — them `checkGroundednessAsync()`, dang ky bang Vercel `waitUntil` SAU `res.end()` (khong tang latency nguoi dung thay, van bao dam invocation song toi khi task xong hoặc function timeout). Neu answer chua so lieu co don vi, goi Gemini Flash doi chieu voi legalCorpus, ghi ket qua vao Firebase `groundedness_checks/<date_key>`. Day la lop giam sat THEM, khong thay the `lib/output-validator.js` (van fail-closed nhu cu).
  5. **`scripts/check-violations.js`** — script doc tay/cron sau, tong hop ty le `output_validator_violation` theo ngay tu RTDB fallback `chat_logs_metrics`. Khong dung ha tang alert moi trong phase nay.
  6. **Bao mat:** bo `Access-Control-Allow-Credentials` (app khong dung cookie); `isAllowedOrigin` chi tin fallback `x-forwarded-host` khi `process.env.VERCEL` ton tai; IP rate-limit uu tien `x-vercel-forwarded-for` -> `x-real-ip` -> `x-forwarded-for`; CSP chuyen tu meta tag (`index.html`) sang header that (`vercel.json`, route `/(.*)`), them `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.
  7. **Hieu nang:** `reserveRateLimitQuota` doi tu tuan tu (IP/ngay roi thang) sang **song song** qua `Promise.allSettled` — ke ca khi mot request throw, ket qua ben con lai van duoc thu thap de rollback neu da reserve thanh cong. DeepSeek timeout 50s xac nhan hop le vi `vercel.json` co `maxDuration: 60` (chi them comment).
  8. **Vong doi background task:** Groundedness check sau SSE response phai dang ky bang `@vercel/functions` `waitUntil`; Promise fire-and-forget sau `res.end()` khong duoc Vercel bao dam hoan tat.
- **Phat hien quan trong khi lam P1.4.1 (anh huong toi RATE_LIMIT_MAX_RETRIES):** Chay song song 2 reservation + rollback tao ra toi da ~2N-1 (khong phai N) luot ghi CAS tuan tu can thanh cong tren CUNG 1 counter IP khi nhieu request tu CUNG 1 IP dong thoi bi chan o tang thang (rollback IP cho cac request that bai them 1 vong CAS nua canh tranh voi cac reservation IP con dang retry). Test harness 50-concurrent xac nhan `RATE_LIMIT_MAX_RETRIES=64` khong du trong kich ban nay (14/50 bi `store_error` sai); da nang len **150** va xac minh lai bang script doc lap (xem lich su chay trong phien nay) — khong con `store_error` sai o 50 concurrent.
- **Ly do:** Giam latency retrieval (namespace pin + rerank co dieu kien + query rewriting), them lop giam sat mem cho hallucination con lot qua validator regex-based, giam bang tan cong CORS/rate-limit khong can thiet, va giam round-trip Firebase cho rate limit ma khong pha vo bat bien "khong vuot quota duoi tai dong thoi" da chot tu truoc.
- **Danh doi:** `RATE_LIMIT_MAX_RETRIES=150` co the keo dai worst-case latency mot chut duoi tai cuc doan (hiem, chi khi rat nhieu request tu CUNG 1 IP dong thoi va gan cham quota thang); chap nhan duoc vi RTDB read/write re va bat bien dung quota quan trong hon vai chuc ms. Groundedness check them 1 Gemini Flash call moi khi answer co so lieu (chi phi API va thoi gian invocation qua `waitUntil`, khong chan response nguoi dung).
- **Nguoi quyet dinh:** user / Claude Code (Sonnet 5)

---

## Template cho entry mới

```
## [YYYY-MM-DD] Tiêu đề quyết định

- **Quyết định:** <mô tả>
- **Lý do:** <vì sao chọn hướng này>
- **Đánh đổi:** <cái gì bị đánh đổi>
- **Người quyết định:** <user / Claude / Codex>
```
## [2026-07-03] Va record `tthc_matt26265` theo tai lieu KBTT co so luu tru chinh thong

- **Quyet dinh:** Cap nhat truc tiep metadata Pinecone cua vector `tthc_matt26265` trong namespace `chatbot-tthc-xnc` theo tai lieu `KBTT_HD_Trang_CSLT_v2.0.pdf` cua Cuc Quan ly xuat nhap canh. Giu ten thu tuc cu de bao toan kha nang retrieval, nhung sua cac fact sai: bo mo ta `Cap Tinh`, bo `Thoi han: 24 gio den 07 ngay`, doi lai thanh luong khai bao online danh cho co so luu tru tai `https://kbtt.xuatnhapcanh.gov.vn`, gan tham quyen voi Cong an cap xa noi co so luu tru, va backfill metadata `thoi_han` + `mau_don`.
- **Ly do:** Record cu tron lan giua huong dan su dung he thong va TTHC chung, dan den chatbot co nguy co tra sai tham quyen tiep nhan va sai cach thuc khai bao. PDF chinh thong cho thay day la luong thao tac cua co so luu tru tren he thong KBTT, khong phai quy trinh `Cap Tinh` nhu metadata cu.
- **Danh doi:** Day la metadata-only update, giu nguyen vector embedding cu de tranh phu thuoc vao pipeline ingest moi; vi vay retrieval van dua tren embedding cua noi dung gan cu. Chap nhan duoc vi semantic chinh van la `khai bao tam tru nguoi nuoc ngoai online`, nhung neu sau nay co pipeline ingest chuan thi nen re-embed record nay tu noi dung da sua.
- **Nguoi quyet dinh:** user / Codex

---

## [2026-07-03] Fail-closed nhanh `tam_tru_khai_bao` va re-embed record KBTT

- **Quyet dinh:** Dong bo sua ca runtime va du lieu cho nhanh `tam_tru_khai_bao`: (1) `api/chat.js` chi chap nhan tai lieu co `retrieval_intent=tam_tru_khai_bao_nguoi_nuoc_ngoai` hoac tin hieu manh `NA17`/`KBTT`/nguoi nuoc ngoai/co so luu tru`; loai bo tai lieu cu tru cong dan Viet Nam co dau hieu `Thong bao luu tru`, `Dang ky tam tru`, `Luat Cu tru`, `VNeID`, moc 23h/08h; va khi khong con tai lieu hop le thi tra `[]` thay vi fail-open. (2) Record Pinecone `tthc_matt26265` khong sua metadata-only nua ma phai **re-embed** sau khi sua text UTF-8 sach, cap nhat `content_hash`, them `retrieval_intent` + `subject_scope`, backup truoc/sau va verify query mau `khai bao tam tru nguoi nuoc ngoai online cho co so luu tru` tra dung record nay top-1.
- **Ly do:** Dot va ngay 2026-07-03 truoc do da de lai 2 gap nghiem trong: metadata Pinecone bi `?` lam mat het tin hieu tieng Viet, va branch filter `tam_tru_khai_bao` van fail-open khi khong tim duoc positive match nen keo lai tai lieu cu tru cong dan Viet Nam.
- **Danh doi:** Runtime se it "co gang tra loi bang moi gia" hon cho nhanh nay; khi KB khong co can cu dung branch, chatbot phai noi thieu can cu thay vi tu mo rong sang thu tuc khac. Regression tich hop phai chay rieng bang API that (`npm run test:regression:tam-tru`, `node scripts/run-regression.js`) thay vi dua vao unit test mac dinh.
- **Nguoi quyet dinh:** user / Codex

---

## [2026-07-11] T1.9: Câu trả lời quốc tịch không phải địa danh — chặn ở cả heuristic lẫn nhánh tất định

- **Quyết định:** `lib/published-locations.js` thêm `NATIONALITY_ANSWER_PATTERN` (loại "Người/Công dân Việt Nam", "Người nước ngoài", biến thể EN khỏi `looksLikeShortLocationText`) và `isNationalityAnswerContext(currentMessage, history)` (nhận diện bot vừa hỏi quốc tịch trong 2 lượt model gần nhất). `api/chat.js` dùng hàm này để KHÔNG rơi vào nhánh trả lời tất định `DETERMINISTIC_NO_MATCH` khi người dùng đang trả lời câu hỏi quốc tịch. Chip quốc tịch trong `js/chatbot.js` nhận cả hai thứ tự vế hỏi ("công dân VN hay người nước ngoài" và ngược lại).
- **Lý do:** Heuristic "câu ≤4 từ không dính từ khóa loại trừ = địa danh" nuốt câu trả lời quốc tịch, kết thúc request trước khi RAG chạy → hội thoại mất hộ chiếu gãy ngay sau lượt làm rõ (lỗi tái hiện được trong review Giai đoạn 1). Chặn 2 lớp (pattern + ngữ cảnh) để cả biến thể không khớp pattern ("Việt Nam" trần) vẫn an toàn ngay sau câu hỏi quốc tịch.
- **Đánh đổi:** Nếu người dùng thật sự muốn tra một địa danh trần ngay sau khi bot hỏi quốc tịch (hiếm, off-context) thì lượt đó đi qua LLM thay vì matcher trụ sở; các tín hiệu địa điểm tường minh (từ khóa "công an/trụ sở/xã/phường", khai nơi ở) vẫn ưu tiên vào luồng địa điểm như cũ.
- **Người quyết định:** user (review Giai đoạn 1) / Claude Code

---

## [2026-07-11] T1.10–T1.11: Gate nghiêm ngặt, thước đo hội thoại nhiều lượt, tái hiệu chỉnh KC04/TR01/TT01/LOC07

- **Quyết định:** (1) Runner nhận `--strict-gate`: exit ≠ 0 khi có hard fail HOẶC provider error; hard fail hội thoại cũng chặn gate. (2) Hội thoại nhiều lượt chạy thật qua handler với `history`, định nghĩa trong `test/regression-conversations.json` (H16 công dân / H17 người nước ngoài cho luồng mất hộ chiếu), chấm lượt cuối bằng `gradeCase`, thống kê tách riêng khỏi bộ 30 câu đơn. Global forbidden của bộ NNN được bật mặc định, nhưng fixture công dân H16 khai `use_global_forbidden=false` vì VNeID/Cổng DVC là hợp lệ trong thủ tục hộ chiếu công dân. (3) Tái hiệu chỉnh expectation theo paraphrase đã quan sát, luôn kèm test hai chiều: KC04 chỉ bắt hỏi lại quốc tịch khi câu hỏi chưa rõ đối tượng; TR01 bỏ `ask_location` vô điều kiện; TT01 bỏ `ask_eligibility` vô điều kiện + budget 250→350; VP06/DN02/ON01 nhận diễn đạt tương đương nhưng vẫn giữ forbidden bắt chiều sai; `detectLanguage` bỏ từ viết hoa đầu khi đo mật độ dấu để địa chỉ tiếng Việt trong câu trả lời tiếng Anh không bị chấm oan (LOC07).
- **Lý do:** Baseline T1.7b còn 4 ca fail 3/3 run — soi từng ca cho thấy toàn bộ là lỗi thước đo (encoding mâu thuẫn chính kỳ vọng gốc, hoặc detector ngôn ngữ nhầm vì tên riêng), không phải lỗi bot. Gate Giai đoạn 1 chỉ có giá trị khi 0 hard fail là 0 hard fail THẬT, và provider error không được che trong run baseline.
- **Đánh đổi:** Việc bot "chủ động hỏi xã/phường" (TR01) và các cải thiện hành vi khác bị đưa ra khỏi gate GĐ1 — phải theo dõi ở backlog, không được quên. detectLanguage bỏ qua từ viết hoa nên câu vi toàn từ viết hoa (hiếm) có thể bị nhận nhầm en — chấp nhận vì mẫu <5 từ đã có fallback đo trên toàn bộ từ.
- **Hiệu chỉnh sau strict run `13-12-22`:** LOC07 dùng đúng nhãn tiếng Anh nhưng Markdown bọc đậm `**Address:**`/`**Phone:**`, nên detector phải nhận cả nhãn có Markdown và `Google Maps` không có hậu tố `Directions`; test thuần tiếng Việt vẫn phải fail. DN01 đồng thời bao phủ hai luồng bắt buộc (khai báo tạm trú và thủ tục doanh nghiệp bảo lãnh), nên ngân sách riêng là 300 từ như TT01 đã có ngân sách riêng 350; prompt trọn thủ tục vẫn giữ giới hạn chung tối đa 250 từ và thêm bước tự bỏ phần lặp/ngoài câu hỏi. Chuỗi 3 run bị hủy và chạy lại từ đầu.
- **Người quyết định:** user (plan T1.9–T1.11) / Claude Code

---

## [2026-07-11] T1.11: Gate nghiệm thu Giai đoạn 1 chuyển sang ĐA SỐ 2/3 (thay strict per-run)

- **Quyết định:** Tiêu chí nghiệm thu gate Giai đoạn 1 đổi từ "0 hard fail mỗi run × 3 run liên tiếp" sang **đa số**: chạy N run đầy đủ (mặc định 3), một ca chỉ tính HARD FAIL THẬT (chặn gate) khi rớt ≥ ⌊N/2⌋+1 run; rớt lẻ tẻ (1..ngưỡng-1 run) là **flaky** — báo advisory, KHÔNG chặn. Provider error cũng áp quy tắc đa số dưới `--strict-gate`. Cài trong `scripts/run-regression.js` qua `--majority`/`--runs N` + hàm thuần `aggregateMajority`; báo cáo tổng hợp `test/results/regression-majority-*.md`. Lỗi bot THẬT (vd VP01 bịa mức phạt) vẫn phải sửa ở prompt, không được nới grader để né.
- **Lý do:** Grader regex chấm trên output LLM không tất định về mặt cấu trúc không thể ổn định đạt "0 hard fail × 3 run liên tiếp": mỗi run một ca KHÁC diễn đạt câu đúng theo cách lệch pattern (bằng chứng: 4 run đầy đủ liên tiếp fail EV04/TT04/VP01/H17, mỗi run một ca khác). Vòng "rớt → nới regex cho khớp câu vừa nói → reset" hoặc không hội tụ, hoặc làm rỗng gate. Đa số tách nhiễu 1-run của model khỏi lỗi hệ thống (ca fail ≥2/3 mới là tín hiệu thật) — trung thực về thống kê, đúng cách các ca đang dao động ~1/3.
- **Đánh đổi:** Gate không còn bắt được lỗi chỉ xuất hiện 1/3 lần — chấp nhận, vì đó là nhiễu diễn đạt/độ nhiễu model, không phải hồi quy ổn định; các ca flaky vẫn được liệt kê advisory để theo dõi. Không thay việc sửa lỗi bot thật ở prompt. Muốn chặt hơn có thể nâng N (5/7…) hoặc thêm LLM-judge (đã xếp "làm SAU").
- **Người quyết định:** user (chọn "gate đa số 2/3") / Claude Code (Opus 4.8)

---

## [2026-07-13] Deeplink thủ tục và trụ sở phải được dựng tất định từ dữ liệu có cấu trúc

- **Quyết định:** Event `done` của `/api/chat` gửi thêm `verifiedLocations` lấy từ các bản ghi
  `Published_Locations` đã match; client tự dựng link chỉ đường. Nút đối chiếu thủ tục chờ lazy module và
  index catalog tải xong rồi mới resolve `procedure_id`/title, thay vì chỉ kiểm tra một lần lúc render.
- **Lý do:** Lazy-load có thể hoàn tất sau câu trả lời làm mất nút thủ tục; link Maps do model tự viết có
  tính ngẫu nhiên nên có lượt không xuất hiện dù backend đã xác minh được trụ sở.
- **Đánh đổi:** Hợp đồng SSE thêm một trường tùy chọn; client cũ bỏ qua an toàn. Điểm QLXNC chưa có tọa độ
  không được tạo deeplink để tránh chỉ đường suy đoán.
- **Người quyết định:** user / Codex

---
## [2026-07-15] Chốt duyệt nguồn TTHC Công an tỉnh Phú Thọ cho T3.3

- **Quyết định:** Người dùng duyệt 17 đối chiếu nguồn tỉnh (14 exact, 3 title suggestion) để dùng cho
  bước merge T3.4 có backup. Luồng khai báo tạm trú bằng Phiếu/NA17 được coi là lỗi thời và không
  nhập. Với thủ tục cấp thị thực giữ mã mẫu `NA5` dù website đính kèm `NA15` không phù hợp; với cấp
  lại thẻ thường trú giữ `NA13`, vì `NA12` là đơn xin thường trú. Giữ nguyên record KBTT trực tuyến
  `tthc_matt26265`: 12/24 giờ là hạn khai báo, không dùng thông tin 24 giờ/07 ngày trên cổng tỉnh để
  ghi đè thành thời gian giải quyết.
- **Lý do:** Quyết định nghiệp vụ trực tiếp của người dùng sau khi đối chiếu nguồn web; tránh để
  metadata/đính kèm còn tồn tại trên trang tỉnh làm sai luồng chatbot.
- **Tác động:** `data/tthc-phutho-review-decisions.json` là manifest duyệt cho T3.4. Chưa ghi Pinecone
  hay xuất bản chatbot trong T3.3.

## [2026-07-15] Áp dụng phạm vi T3.4 đã duyệt vào Pinecone

- **Quyết định:** Cập nhật metadata cho 17 record có đối chiếu nguồn tỉnh đã được duyệt và record KBTT
  `tthc_matt26265` theo quyết định “giữ nguyên”. Mỗi record có backup trước/sau và được xác minh;
  không thay `text` hoặc vector, nên T3.5 vẫn phải re-embed nếu muốn đưa nội dung nguồn mới vào retrieval.
- **Lý do:** Đưa facts đã duyệt (phí, hạn, mẫu, cơ quan và governance) vào runtime nhưng không mở rộng
  sang 22 record chưa có nguồn tương thích.
- **Tác động:** 18 record có `review_status=approved`; KBTT giữ hạn khai báo 12/24 giờ, và metadata có
  cờ xung đột nguồn tỉnh. Các record chưa duyệt vẫn không đổi.
## [2026-07-16] T3.6 dùng governance filter có cờ rollout

- **Quyết định:** Chỉ bật enforcement khi `RAG_GOVERNANCE_FILTER=1` cùng namespace ứng viên. Điều kiện `review_status=approved`, `source_priority=current_procedure` và cấp được nêu rõ là bất biến cả ở lượt fallback. Nhờ vậy production cũ không bị ảnh hưởng trước T3.8.
- **Quyết định:** Bổ sung KBTT `tthc_matt26265` vào namespace ứng viên với kênh khai báo điện tử, hạn 12/24 giờ và hỗ trợ Công an cấp xã; metadata và text không nêu Phiếu/NA17. Bản website 2372-17 được giữ làm tham chiếu nhưng bị loại khỏi nhánh F01 để không lẫn hạn 24 giờ/07 ngày.
- **Rollback:** tắt `RAG_GOVERNANCE_FILTER` và giữ `PINECONE_NAMESPACE=chatbot-tthc-xnc`; không thay dữ liệu production.
## [2026-07-16] Ngoại lệ vận hành F01: KBTT thay bản website

- **Quyết định người dùng:** Với thủ tục khai báo tạm trú người nước ngoài, chỉ dùng bản KBTT đã chốt; không dùng bản website `2372-17` trong retrieval.
- **Thực thi:** `tthc_phutho_web_2372-17` được đánh dấu `superseded`/`legacy`, trỏ `superseded_by=tthc_matt26265`. Bản KBTT online là nguồn `approved/current` duy nhất cho F01.

## [2026-07-16] Bảo toàn retrieval thẻ tạm trú và namespace ứng viên

- **Quyết định:** Cả hai nhánh intent tạm trú truy vấn thêm `xuat_nhap_canh`, vì importer website chuẩn hóa lĩnh vực “Quản lý xuất nhập cảnh” thành giá trị này. Hậu kiểm split-intent vẫn fail-closed để không cho KBTT/NA17 lẫn sang nhánh thẻ tạm trú. Citation chấp nhận URL HTTPS tại `congan.phutho.gov.vn`.
- **Quyết định:** Importer website từ chối namespace bằng `PINECONE_NAMESPACE` và luôn liệt kê namespace đích; namespace đã có record chỉ được tiếp tục với `--resume`.
- **Lý do:** Tránh bỏ sót thủ tục cấp thẻ tạm trú hợp lệ trong namespace ứng viên, mất liên kết nguồn chính thức, hoặc upsert nhầm vào namespace production/đã có dữ liệu.
- **Tác động:** Không đổi cờ `RAG_GOVERNANCE_FILTER` hay namespace production; áp dụng cho dry-run/apply importer và retrieval ứng viên.
## [2026-08-03] Location intake uses canonical record IDs and generated Apps Script

## [2026-08-11] PR #48 browser staff portal boundary

- **Decision:** Keep `/can-bo` as a vanilla static page. The browser uses only the Vercel Staff API;
  it never calls Apps Script, reads a workbook, receives a Gateway secret, or decides authorization.
- **Decision:** Load CSRF then session before rendering private location forms. Use the official Google
  Identity Services rendered button without One Tap, JWT decoding, credential persistence, or OAuth revoke.
- **Decision:** Add `GET /api/staff/auth/config` as a no-store public config endpoint returning only
  `GOOGLE_CLIENT_ID`; missing configuration fails closed with `STAFF_AUTH_CONFIG_INVALID`/503.
- **Decision (2026-08-25):** Keep the public config URL but rewrite it to the existing CSRF function
  with an internal marker. This keeps the Vercel Hobby deployment at or below its 12-function limit
  after adding public location contributions, without merging auth handlers or changing their security
  contracts.
- **Decision:** Use explicit client DTO builders and in-memory operation-id reuse for retries. Image input
  is compressed toward 2.5 MiB before the existing Vercel 3 MiB decoded limit; mutations never update a
  public card optimistically and stale snapshots are refreshed without silent retry.
- **Decision:** `/can-bo` and `/can-bo/*` get a separate CSP with the narrow GIS allowlist and
  `same-origin-allow-popups`; the generic site CSP excludes these routes to avoid duplicate headers.

- **Decision:** A location is identified by `record_id`, not `unit_code`. A unit can have multiple locations; update, report and stop requests require an existing `target_record_id` and cannot silently become creates.
- **Decision:** `setup/apps-script.js` is the only business-rule source. The Apps Script deployable is generated from it plus a thin integration runtime, keeping Node tests and Google runtime behavior aligned.
- **Decision:** `Published_Locations` and `api/google-sheet.js` use explicit public field allowlists. Internal submitter/reviewer/validation data stays in staging even if a sheet configuration accidentally exposes extra columns.
- **Decision:** Migration is an export-to-export JSON workflow, dry-run by default, with backup before output overwrite. It is intentionally not a direct production-sheet mutation tool.

## [2026-08-07] clasp là đường deploy Apps Script, kèm lớp entry point API-safe

- **Decision:** Dùng `@google/clasp` 3.3.0 gọi qua `npx` trong npm script, **không** thêm vào `devDependencies`. Lý do: chỉ người vận hành mới cần, giữ `package-lock.json` không đổi so với `main`, và phiên bản vẫn cố định nên tái lập được. Đổi lại: mỗi máy tốn một lần tải về cache npx.
- **Decision:** Push root là `setup/location-intake/dist/` (đã nằm trong `.gitignore`), chứa đúng `Code.gs` sinh ra và `appsscript.json`. Không đẩy mã nguồn khác lên Google. `appsscript.json` là file nguồn có commit, build copy sang `dist/`.
- **Decision (2026-08-16):** `appsscript.json` nguồn phải khai `webapp` (`executeAs: USER_DEPLOYING`, `access: ANYONE_ANONYMOUS`) và `dependencies: {}`. `clasp push` **thay thế** manifest từ xa chứ không merge, nên manifest sinh ra mà thiếu `webapp` sẽ xoá cấu hình Web App của Staff Gateway — chính endpoint `/exec` mà `STAFF_GATEWAY_URL` trên Vercel gọi. Build script kiểm tra khối này và ném lỗi trước khi ghi `dist/`, vì `clasp:push` chạy build chứ không chạy test. Đánh đổi: manifest dùng chung cho cả script intake lẫn script gateway, nên script intake cũng mang khối `webapp` dù không deploy Web App — vô hại, vì manifest chỉ mô tả cấu hình, Web App chỉ tồn tại sau khi người vận hành tạo deployment.
- **Decision:** `.clasp.json`, `.clasprc.json`, `clasp-creds*.json` không commit — chứa script ID và OAuth credential theo môi trường. Có `.clasp.json.example` để dựng lại.
- **Decision:** Tách hàm menu và hàm API thay vì cố làm một hàm chạy được cả hai nơi. Apps Script API không có UI và không có bảng đang mở, nên `getUi()`/`getActiveRange()` sẽ ném lỗi. Các hàm `api*` trả giá trị để kiểm chứng tự động; hàm menu giữ nguyên trải nghiệm người duyệt.
- **Decision:** `setupLocationIntakeSystem` rơi về Script Property `LOCATION_SPREADSHEET_ID` khi `getActiveSpreadsheet()` trả null, thay vì tạo hàm setup thứ hai cho API.
- **Giới hạn đã biết:** Nộp Google Form kèm tải ảnh không tự động hoá được (Forms API không hỗ trợ nộp phản hồi có tệp). Bước này vẫn phải do người thật làm, và chính nó mới kiểm chứng MIME thật, quyền Drive thật và allowlist email thật.

## [2026-08-08] Ràng buộc runtime GAS phát hiện qua smoke test thật

- **Decision:** Không dùng `new URL()`/`URLSearchParams` hay host object của trình duyệt/Node trong `setup/apps-script.js`. Apps Script V8 KHÔNG có `URL` global; unit test chạy trên Node có `URL` nên không bắt được. Phân tích host bằng regex; có regression test gỡ `globalThis.URL` để chốt ràng buộc.
- **Decision:** Không dùng `PropertiesService.setProperties(props, true)` — cờ `deleteAllOthers=true` xoá cả `TEMPLATE_FORM_ID`/`DESTINATION_FOLDER_ID` mà runtime cần mỗi lần nhận Form.
- **Decision:** Khi gắn GCP project chuẩn cho Apps Script phải bật **Drive API** trong chính project đó (không chỉ Apps Script API). `DriveApp.setSharing` đi qua Drive API; thiếu sẽ hỏng cả `clasp run` lẫn trigger duyệt thật. Chi tiết ở `docs/location-intake/CLASP.md`.
- **Decision:** `normalizeLabel` không được dùng `value || ''` — boolean `false`/số `0` (Google Sheets lưu ô FALSE thành boolean false) bị nuốt thành '' làm `normalizeBoolean(false)` trả nhầm ACTIVE, đơn vị đã tắt vẫn hiện trong Form và vẫn qua `authorizeSubmission`. Form filter và authorization dùng chung `normalizeBoolean` để không lệch logic. Có regression test.
- **Giới hạn vận hành (không sửa được bằng code):** Form sao chép từ mẫu có câu hỏi tải tệp bị mất liên kết thư mục upload → Google tự tắt nhận phản hồi, chủ Form phải mở editor bấm **Phục hồi**. `isAcceptingResponses()` vẫn trả `true` nên không tự phát hiện được. Buộc copy mẫu vì `FormApp` không tạo được câu hỏi tải tệp bằng code. Ghi ở `SETUP.md` bước 8 / `OPERATIONS.md`.
- **Trạng thái:** Toàn bộ luồng đã smoke test end-to-end trên tài nguyên test (không production), **8/8 kịch bản đạt** (gồm một-đơn-vị-nhiều-địa-điểm và đơn-vị-active-false), đối chiếu quyền ảnh public/private bằng Drive API. Xem `06-ai-working-log.md` [2026-08-08].

## [2026-08-16] GViz Published_Locations phải khai báo đúng một hàng tiêu đề

- **Quyết định:** `lib/published-locations.js` luôn gửi `headers=1` trong truy vấn Google GViz.
- **Lý do:** TEST `Published_Locations` có đúng 18 cột semantic, nhưng GViz tự suy đoán
  `parsedNumHeaders=2` khi dòng dữ liệu đầu tiên chủ yếu là chuỗi. Khi đó nhãn trở thành dạng
  `record_id TEST_RECORD_A`, làm guard public từ chối đúng cách với `GOOGLE_SHEET_SCHEMA_MISMATCH`.
  Khai báo một hàng tiêu đề giữ nguyên schema và không nới validation.
- **Phạm vi:** chỉ áp dụng public GViz reads; không đổi trust boundary, schema, cache hoặc
  Production environment.

## [2026-08-16] TEST Gateway phải đồng bộ bundle theo commit trước khi rehearsal

- **Quyết định:** `setup/location-intake/dist/Code.gs` chỉ được build từ exact checked-out commit rồi mới cập nhật version của cùng TEST Web App deployment. Không tạo URL mới hoặc thay Vercel env cho một source sync.
- **Lý do:** Source Node đã cho phép UPDATE không có ảnh nhưng Apps Script TEST version cũ vẫn áp dụng rule ảnh cho mọi request, tạo lỗi runtime `IMAGE_REQUIRED`. Parity test giữ helper CREATE-only trong source và bundle.
- **Phạm vi:** chỉ TEST Gateway; giữ nguyên HMAC, allowlist, snapshot, image preservation và Production.

## [2026-08-23] Staff Portal pending status is a Gateway-safe projection

- **Quyết định:** Use `listStaffRequestStatuses` in the private Gateway rather than granting Vercel or the
  browser direct staging access. It reauthorizes the email against the unit allowlist and emits only PENDING
  `{locationId, unitCode, type, status, submittedAt}` records; opaque server-derived request IDs remain
  private. Vercel filters that additive DTO again against current authorized units and fails closed if the
  read cannot complete. CREATE has no target `locationId` and is rendered separately; existing-location
  actions are disabled while a pending staging request targets that location. Gateway also rejects a distinct
  pending request for the same target inside its Script Lock, covering a second-tab race. CONFIRM stays outside
  this display because it is a completed verification audit event, not an Admin Review state machine.
- **Ảnh:** Approved image rendering remains tied solely to public `Published_Locations.image_url`. The portal
  may normalize a public legacy Drive URL to Google content delivery to satisfy its narrow CSP, but never
  asks for or returns the private staging file ID. A pending replacement is not previewed.

## [2026-08-25] Anonymous public location contribution is CREATE-only

- **Decision:** Add `/dong-gop` and `POST /api/location-contributions` for anonymous public intake. The
  browser may only propose a new location; it cannot update, correct, stop, confirm, read private sheets,
  call Apps Script, or receive Staff/Gateway credentials.
- **Trust boundary:** Vercel validates Origin, explicit DTOs, HMAC, Turnstile, image bytes, Maps URL/
  coordinates, and a pseudonymous IP/day quota before signing `submitPublicContribution` to the private
  Gateway. The Gateway independently validates the exact active `Unit_Allowlist` unit and never trusts
  the public dropdown.
- **Provenance:** Public submissions use the non-person system principal
  `public-web@bandocapt.invalid`, `auth_status=PUBLIC_CAPTCHA`, and audit action `PUBLIC_SUBMIT`; this
  value must never be replaced with a staff email. The submitted image is private until the existing Admin
  Review approves the staging row.
- **Idempotency:** Vercel derives the Gateway `request_id` from
  `sha256("public-location-v1|" + operationId)`, excluding IP/contact/name. The Gateway ledger compares
  the complete signed payload hash, reuses a deterministic private image resource, and rejects payload drift.
- **Unit directory:** Public GET calls the authenticated Gateway's `listPublicContributionUnits`, which
  reads the private active `Unit_Allowlist` and projects only `{ unitCode, unitName }`. It does not derive
  eligibility from `Published_Locations`, so an active unit can receive its first location contribution.
- **Privacy:** Public GET returns only `{ unitCode, label }`; successful POST returns only `PENDING` and a
  safe receipt. No staging row, private workbook/file ID, audit content, reviewer, allowlist email or
  Gateway URL crosses the public response.
- **Scope:** This decision adds source/tests/build/docs only. It does not deploy Gateway, mutate any
  workbook, change Script Properties/Vercel Production env, or publish a location.

## [2026-08-26] Public contribution rate limiting moves from Firebase RTDB to Upstash Redis

- **Decision:** Replace Firebase RTDB persistence only in `/api/location-contributions` with the
  Vercel Marketplace Upstash for Redis TEST resource. The Preview integration uses its actual
  server-only `KV_REST_API_URL` and `KV_REST_API_TOKEN` variables; Production is not connected.
- **Semantics:** Preserve `PUBLIC_LOCATION_DAILY_IP_LIMIT` (default 10), the Vietnam-time daily window,
  `CHAT_LOG_HASH_SALT` HMAC pseudonymization and `429 RATE_LIMIT_EXCEEDED`/`503 SERVICE_UNAVAILABLE`
  behavior. A single Lua `EVAL` performs the check, increment and TTL initialization atomically, so
  concurrent requests cannot race a GET-then-SET sequence and the configured Nth request remains allowed.
- **Privacy:** Redis keys contain only an explicit public-location namespace, date window and HMAC IP
  bucket. Redis values are numeric counters with TTL; raw IP, salt and contribution PII are never sent
  to or stored by the rate-limit adapter.
- **Boundary:** Firebase remains for unrelated chatbot/feedback/telemetry paths. Google Sheets and
  Drive remain authoritative for location and image business data; no business-data storage changes.
- **Reason:** Firebase project quota blocked a safe dedicated TEST RTDB, while Upstash provides a
  Vercel-native atomic key/value resource with a TEST-only Preview binding and no architecture change
  to the contribution workflow.

