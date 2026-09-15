# TTHC 2026 legal completeness — final audit

Task: `BANDOCAPT_TTHC_2026_LEGAL_COMPLETENESS_FINAL_AUDIT`

## VERDICT

`BANDOCAPT_TTHC_2026_LEGAL_COMPLETENESS_PARTIAL`

This audit closed real, evidence-backed gaps that PR #77 left open (a factual count error in
QĐ 5230's reconciliation, six 2026 legal sources missing from the registry, 17 catalog procedures
mislabeled `OUT_OF_SCOPE` when they were never actually reconciled against their own governing
law, and one stale "Công an cấp huyện" reference surviving the 2025 two-tier restructuring). None
of the 12 PASS conditions in section 11 of the task are fully met — most importantly, QĐ 5230's
8 newly created căn cước procedures are still not represented anywhere in the catalog, and this
session's egress restrictions (see "Tooling constraints" below) mean several leads could not be
confirmed against a primary Bộ Công an source before the 2026-09-15 cutoff. PARTIAL, not BLOCKED,
because this audit made verifiable forward progress (all validators/tests/build green, no
fabricated content, no production mutation) and every open item has a concrete owner-actionable
next step — it did not get stuck without result.

## SOURCE CUTOFF

Official sources checked through: **2026-09-15** (session date), subject to the tooling
constraint below. Registry `verified_at` bumped from `2026-09-11` to `2026-09-15`.

### Tooling constraint (read before trusting any "confirmed" claim below)

This remote session's `WebFetch` tool returned `EGRESS_BLOCKED` for every tested destination,
Vietnamese government domains and neutral references alike (`bocongan.gov.vn`,
`vanban.bocongan.gov.vn`, `congan.cantho.gov.vn`, `luatvietnam.vn`, `xaydungchinhsach.chinhphu.vn`,
even `en.wikipedia.org`). Direct retrieval of the QĐ 5230/QĐ 4245 attachments (whose SHA-256 hashes
are already recorded in the registry from a prior session) was not possible from here. All research
in this audit was done through the `WebSearch` tool's synthesized results, cross-checked across
2–4 independent secondary sources (province police mirrors, luatvietnam.vn, thuvienphapluat.vn,
xaydungchinhsach.chinhphu.vn) per finding, and only registered as a source when a search result
itself named an official `bocongan.gov.vn` / `vanban.bocongan.gov.vn` / `vanban.chinhphu.vn` URL.
Where no such URL could be found, the finding is reported as an **unconfirmed lead**, not added to
the registry, and not used to change any classification beyond flagging it for review. This is a
materially weaker verification method than direct primary-source retrieval and is itself a reason
this audit cannot conclude PASS — a future session with working egress to Bộ Công an's portal should
re-verify every new source added here.

## REPOSITORY STATE

- Branch: `claude/tthc-2026-legal-audit-mi5fqz`
- Base SHA (branch point, = PR #77 merge commit): `721df042715a0fc174af0be80e0762c1554a3297`
- Final SHA: recorded in the commit that accompanies this report (see PR)
- Working tree: clean at time of writing; only the files listed under "Code and data changes" below
  were touched

## LEGAL SOURCES

### Already in registry (unchanged, 8 sources, `verified_at` 2026-09-11 as recorded by PR #77)

`58/2026/NĐ-CP`, `1523/QĐ-BCA-C06`, `62/2026/TT-BCA`, `1583/QĐ-BCA-QLXNC` (superseded),
`4245/QĐ-BCA-QLXNC`, `87/2026/TT-BCA`, `4118/QĐ-BCA-C07`, `5230/QĐ-BCA-C06`.

### Newly added this audit (6 sources, `verified_at` 2026-09-15)

| Document | Issued | Effective | Domain | Supersedes | Official URL host |
|---|---|---|---|---|---|
| `37/2026/TT-BCA` | 2026-04-24 | 2026-06-08 | dang_ky_xe | (amends 79/2024, 13/2025, 51/2025/TT-BCA) | vanban.chinhphu.vn |
| `236/2026/NĐ-CP` | 2026-06-26 | 2026-07-01 | dang_ky_xe | (amends 151/2024/NĐ-CP) | xaydungchinhsach.chinhphu.vn |
| `131/2026/TT-BCA` | 2026-06-30 | 2026-07-01 | khieu_nai_to_cao | `98/2021/TT-BCA` | vanban.bocongan.gov.vn |
| `118/2025/QH15` | 2025-12-10 | 2026-07-01 | thuong_tru, xuat_nhap_canh | — | vanban.chinhphu.vn |
| `70/2026/TT-BCA` | 2026-05-25 | 2026-07-01 | thuong_tru, xuat_nhap_canh, tam_tru | `04/2015/TT-BCA` | bocongan.gov.vn |
| `320/2026/NĐ-CP` | 2026-08-13 | **2026-09-28 (NOT_YET_EFFECTIVE)** | dinh_danh_dien_tu, can_cuoc | (amends 69/2024/NĐ-CP) | bocongan.gov.vn |

`isOfficialUrl()` in `lib/tthc-legal-refresh.js` was extended to accept `vanban.chinhphu.vn` and
`xaydungchinhsach.chinhphu.vn` — both first-party Chính phủ domains matching the task's own
priority-2 source ("Cơ sở dữ liệu văn bản pháp luật của Chính phủ"). No non-government hostname
was added.

### Unconfirmed leads found but NOT added to the registry

- **`02/2026/TT-BCA`** (vũ khí, vật liệu nổ, công cụ hỗ trợ) — reported effective 2026-01-11,
  amending `75/2024/TT-BCA` and `77/2024/TT-BCA`, by two secondary aggregators (vietlex.vn,
  luatquanghuy.vn). No `bocongan.gov.vn`/`vanban.bocongan.gov.vn` article was found this session.
  Flagged on the one affected catalog record (see below); not registered as a source.
- **`4685/QĐ-BCA-C08`** (23/7/2026, ~33 TTHC in "trật tự, an toàn giao thông đường bộ") — found via
  WebSearch synthesis only. Relevance to this catalog's `dang_ky_xe` domain (distinct from the
  driver's-license/traffic-violation TTHC this decision more likely covers) is **unconfirmed**; not
  added, not used for any classification.

## QĐ 5230 (căn cước) reconciliation

| | Manifest before this audit | Official count (this audit, 3+ independent secondary sources) |
|---|---|---|
| NEW | 0 records tagged `NEW`; **prior report text claimed "10 NEW"** | **08** |
| AMENDED | 2 (`1.012564`, `1.014060`) | 02 — **matches, confirmed correct** |
| ABOLISHED | 15 (matched against legacy catalog guides) | 28 (only 15 had a corresponding legacy guide in this catalog to remove) |

**Correction:** `docs/tthc/TTHC_2026_LEGAL_REFRESH_REPORT.md` (2026-09-13) states "QĐ5230 is
reconciled as 10 NEW, 2 AMENDED and 28 ABOLISHED." The "10 NEW" figure is factually wrong — every
independently corroborating secondary source (thuvienphapluat.vn's own change-alert digest,
cafef.vn, xaydungchinhsach.chinhphu.vn's summary, multiple province police mirrors) states **08
NEW**. That report file is left as a historical record of PR #77 and was not edited; the correction
is recorded here and in `data/tthc-2026-refresh-manifest.json.known_missing_procedures`.

**Catalog representation of the 8 NEW procedures: 0 of 8.** No manifest record carries
classification `NEW`, and no catalog procedure was added for them. This is exactly the gap flagged
by the task's Section A warning ("loại các guide căn cước cũ nhưng chưa bổ sung đầy đủ TTHC mới
tương ứng") — confirmed true. This audit did **not** attempt to fabricate the 8 new procedures'
codes, dossiers, or content: the WebSearch snippets available this session name at most 5 of the 8
by title only (căn cước điện tử/tài khoản định danh mức 2, khóa/mở khóa căn cước điện tử, hủy/xác
lập lại số định danh, xác nhận số CMND 9 số — coincidentally the same 5 legacy guides already
carried as `NEEDS_LEGAL_REVIEW` in this catalog, but this audit found **no evidence strong enough to
assert they are the same procedures** as QĐ 5230's 8 new ones, so no identity mapping was made).
The gap is tracked explicitly in `data/tthc-2026-refresh-manifest.json` under the new
`known_missing_procedures` array, with an explicit `action_required` note that the original
attachment (SHA-256 already on file) must be read before any content is added.

**Unresolved discrepancy:** the exact identity of the 8 NEW procedures, and whether any of the 5
already-`NEEDS_LEGAL_REVIEW` legacy guides above are in fact superseded by (rather than merely
co-located in the same decision as) those 8 — requires primary-source access this session did not
have.

## NEEDS_LEGAL_REVIEW

| | Before this audit | After this audit |
|---|---|---|
| Count | 39 | **56** |
| Resolved (moved out of review to a firm disposition) | — | 0 |
| Newly added to review (were mislabeled `OUT_OF_SCOPE`) | — | 17 |
| Enriched with new evidence, classification unchanged | — | 15 (13 xuất/nhập cảnh + thị thực records citing stale `04/2015/TT-BCA` forms; 2 căn cước records citing stale "Công an cấp huyện") |
| Still unresolved, with concrete reason each | 39 | 56 |

This audit did not attempt to force any of the original 39 down to 0 — per the task's own
instruction, that is not the goal, and doing so without primary-source text would violate the
fail-closed rule. Every one of the 56 records carries a non-empty `reconciliation.reason` and
`matchMethod` (enforced by `validateManifest()` in `lib/tthc-legal-refresh.js`, which the added test
assertion in `test/tthc-legal-refresh.test.js` locks to `NO_EXACT_OFFICIAL_IDENTITY` or the new
`NEW_2026_SOURCE_PENDING_FULL_TEXT_RECONCILIATION`).

**Why the 39→56 increase is correct, not scope creep:** the 2026-09-13 reconciliation script
(`scripts/reconcile-tthc-legal-review.js`) classified every `guide:dang-ky-xe:*` /
`guide:khieu-nai-to-cao:*` / `guide:vu-khi:*` record, plus the three `thuong_tru` người-nước-ngoài
records, as `OUT_OF_SCOPE` purely because they fall outside **QĐ 1523's own annex** — a true but
narrow fact about one specific decision, not a legal-currency verdict about the procedure itself.
Task Section 3.C explicitly warned against treating "not covered by the document I already checked"
as equivalent to "verified current." This audit found that all four of those domains have their own
2026 sources that were never checked (see table above), so `OUT_OF_SCOPE` was retracted in favor of
`NEEDS_LEGAL_REVIEW` for 17 records (11 dang_ky_xe + 2 khieu_nai_to_cao + 3 thuong_tru + 1 vu_khi).
Two `cu_tru` records that were also `OUT_OF_SCOPE` were left unchanged — they are guide-text
fragments describing a conditional exemption ("công dân có sự điều chỉnh về hộ tịch...") and a
general filing-method note, not distinct TTHC with their own governing decision, so the earlier
disposition still stands on its own merits.

## VEHICLE REGISTRATION 2026

- **`37/2026/TT-BCA`** (hiệu lực 08/06/2026): amends `79/2024/TT-BCA` directly — and `79/2024/TT-BCA`
  is the exact "Căn cứ pháp lý" cited by all 11 `dang_ky_xe` catalog procedures for form ĐKX10 and the
  registration/plate-issuance rules. Reported changes (via secondary sources; not primary-text
  confirmed): updated technical/environmental inspection certificate templates, a 5-year plate
  retention rule on surrender, VNeTraffic integration.
- **`236/2026/NĐ-CP`** (hiệu lực 01/07/2026): amends `151/2024/NĐ-CP` — explicitly permits electronic
  copies/documents in road-traffic administrative procedures where the prior text required paper.
- **Impact on catalog:** genuine, but its exact scope (which specific steps/forms/dossier items
  actually changed vs. merely gained an additional legal-basis citation) could not be confirmed
  without the primary text. Per the task's own instruction ("Nếu chỉ cần bổ sung căn cứ pháp lý mà
  nội dung TTHC không đổi thì ghi đúng như vậy") this audit does **not** assert the procedure content
  changed — it asserts only that the legal basis is incomplete and the possibility of a content
  change is open, and reclassified all 11 procedures to `NEEDS_LEGAL_REVIEW` on that basis rather
  than guessing either way.
- **Not touched:** `60/2023/TT-BTC` and `71/2025/TT-BTC` (fee basis) — no 2026 amendment was found
  for either this session; fee content is left as-is.

## CATALOG AUDIT

- Procedures before this audit: 78
- Procedures after this audit: **78** (unchanged — no procedure was added, removed, or content-edited;
  this audit only changed manifest classifications/evidence and registry sources, per the fail-closed
  rule against fabricating unverified content)
- Added: 0 (the 8 QĐ 5230 NEW procedures remain a tracked, unfilled gap — see above)
- Amended (content): 0 (no catalog procedure text was rewritten this audit)
- Removed: 0 (no `ABOLISHED` procedure was found still present in `data/tthc-catalog.json` — the
  15 known abolished căn cước guides were already correctly absent, confirmed by direct scan)
- Still uncertain: 56 `NEEDS_LEGAL_REVIEW` manifest records + the 8-procedure QĐ 5230 gap
- Structural checks performed and clean: no duplicate `procedureId`; the 10 duplicate-title pairs
  found are legitimate same-procedure-at-different-authority-level entries (`5568-tw-01` vs
  `5568-tinh-01` etc.), not accidental duplicates; every procedure has a non-empty `cap`; no
  `cap: 'huyen'` value exists anywhere (the district tier was correctly dropped from the taxonomy)
- Stale content found: two căn cước procedures
  (`guide:can-cuoc:huy-xac-lap-lai-so-dinh-danh-ca-nhan`,
  `guide:can-cuoc:dieu-chinh-thong-tin-trong-co-so-du-lieu-quoc-gia-ve-dan-cu-theo-de-nghi-cua-cong-dan`)
  still describe procedural steps routed through "Công an cấp huyện" — the district police tier that
  no longer exists under the 2-tier (tỉnh/xã) model in effect since 2025-07-01. Both were already
  `NEEDS_LEGAL_REVIEW`; this audit added the concrete stale-authority finding to their evidence.
- 16 procedures (all XNC/thị thực/thường trú for foreigners) cite `04/2015/TT-BCA` for their forms;
  all 16 were already or are now `NEEDS_LEGAL_REVIEW`, so none were incorrectly marked resolved while
  citing a superseded form basis — but `70/2026/TT-BCA` (which amends `04/2015/TT-BCA`) was added to
  13 of them that did not yet reference it.
- PCCC/CNCH: registry carries `4118/QĐ-BCA-C07` but the catalog has **zero** `pccc_cnch` procedures
  and no manifest record references it — the source is orphaned relative to this product's actual
  content; not a completeness gap in the sense the task means, just noted for hygiene.

## TEST RESULTS

- `node scripts/validate-tthc-legal-refresh.js`: PASS — 14 sources, 101 manifest records,
  `NO_PRODUCTION_MUTATION`
- `npm run validate:qd1523-mapping`: PASS — unchanged (51 rows, 5 NEW, 39 AMENDED authority rows /
  36 unique codes, 7 ABOLISHED)
- `npm test`: **PASS 677/677** (0 fail) — first run in this session failed 25/430 files because
  `node_modules` was not installed at session start (`@pinecone-database/pinecone` etc. missing);
  `npm ci` was run to install the pinned lockfile dependencies, after which the full suite is green.
  This was a pre-existing environment-setup gap, not something this audit's changes caused.
- `npm run build`: PASS — CSS, both Apps Script bundles, syntax/staff/rate-limit checks, static
  build to `dist/` all succeeded
- `npx playwright test` (full suite, pointed at the session's pre-installed Chromium via
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium` — the pinned `@playwright/test` version
  otherwise tries to launch a `chrome-headless-shell` build not pre-installed in this container):
  **59/117 passed, 58 failed.** All 6 `test/e2e/tthc-catalog.spec.js` specs — the only E2E suite that
  exercises this audit's domain (the TTHC catalog UI) — **passed cleanly**. Every one of the 58
  failures is in a map/marker/Leaflet-dependent spec (`civic-mobile-ui`, `detail-panel`,
  `location-image`, `location-visibility-arbiter`, `marker-identity-card`, `mobile-real-device-ux`,
  `mobile-sheet-dismiss`, `near-me-pure-action`, `panel-state-arbiter`, `r1-design-closure`,
  `chat-embed`), none of which this audit's diff touches. Inspecting one failure directly
  (`mobile-real-device-ux.spec.js`) shows `#results-list .result-item` never becomes visible — the
  dev server's `/api/google-sheet` route (`scripts/dev-server.js` → `api/google-sheet.js`) fetches
  live location data from Google's GViz endpoint, an outbound call that goes through this session's
  restrictive egress proxy exactly like `WebFetch` does (see "Tooling constraint" above); `index.html`
  also loads Leaflet/MarkerCluster from `unpkg.com`. Either dependency failing would explain the
  exact pattern observed: every spec that needs live location data and/or the map red, the
  catalog-only `tthc-catalog.spec.js` (driven by the locally bundled `data/tthc-catalog.json`, no
  external fetch) green. This was not independently proven (this session cannot directly probe
  Google's GViz endpoint or `unpkg.com` outside the app itself), so it is reported as the most likely
  explanation, not a certainty. The prior baseline (117/117, working log 2026-09-13) was recorded on
  a different machine (Windows, system Chrome) with presumably unrestricted network access.
- **Environment caveat:** this session's Node is `v22.22.2`; `package.json`/`.nvmrc` pin `24.x`. This
  is a pre-existing constraint of the remote session and was not changed by this audit; tests/build
  were still run and passed on the available runtime, but exact-Node-24 CI parity was not verified
  here.

## PRODUCTION STATE

`NO_PRODUCTION_MUTATION` — no Pinecone write, no namespace change, no Vercel env change, no Google
Sheet write, no deploy, no merge. All changes are local commits on `claude/tthc-2026-legal-audit-mi5fqz`.

## Code and data changes

- `data/tthc-legal-sources.json`: `verified_at` → `2026-09-15`; 6 new sources added (see table above)
- `data/tthc-2026-refresh-manifest.json`: `verified_at` → `2026-09-15`; 17 records reclassified
  `OUT_OF_SCOPE` → `NEEDS_LEGAL_REVIEW` with concrete new-source evidence; 15 records enriched with
  additional evidence (13 with `70/2026/TT-BCA`, 2 with the stale-`cấp huyện` finding); new
  `known_missing_procedures` array documenting the QĐ 5230 8-NEW gap
- `lib/tthc-legal-refresh.js`: `isOfficialUrl()` allowlist extended with `vanban.chinhphu.vn` and
  `xaydungchinhsach.chinhphu.vn` (both first-party Chính phủ domains, matching the task's own
  priority-2 source tier)
- `scripts/reconcile-tthc-legal-review.js`: added a guard so a record already re-audited by a later
  pass (`reconciledAt` ≠ `2026-09-13`) is never silently reprocessed and reverted if this historical
  script is rerun
- `test/tthc-legal-refresh.test.js`: updated the hardcoded classification-count assertion to the
  corrected `{ OUT_OF_SCOPE: 2, NEEDS_LEGAL_REVIEW: 56 }` (from `{ 19, 39 }`), with an inline comment
  explaining why the prior expectation was wrong and pointing at this report; widened the
  `matchMethod` assertion to accept the new method name
- `docs/tthc/TTHC_2026_LEGAL_COMPLETENESS_FINAL_AUDIT.md`: this report

No frontend, chatbot runtime, UI/UX, or feature code was touched, per task scope.

## Outstanding blockers for a future PASS

1. Obtain direct (non-egress-blocked) access to `bocongan.gov.vn`/`vanban.bocongan.gov.vn` to
   re-verify all 6 sources added this audit against their primary text, and to identify the exact
   8 NEW QĐ 5230 procedures (codes, names, dossiers) so they can be added to the catalog.
2. Confirm or refute the `02/2026/TT-BCA` (vũ khí) and `4685/QĐ-BCA-C08` (giao thông) leads with an
   official URL before they can be registered as sources or used to change any classification.
3. Full-text reconcile `37/2026/TT-BCA` + `236/2026/NĐ-CP` against each of the 11 `dang_ky_xe`
   procedures' current dossier/steps/forms text.
4. Full-text reconcile `131/2026/TT-BCA` against the 2 `khieu_nai_to_cao` procedures' authority/steps.
5. Full-text reconcile `118/2025/QH15` + `70/2026/TT-BCA` against the 3 `thuong_tru` procedures'
   dossier requirements (the law's own change summary already names "cấp lại thẻ thường trú" as
   affected).
6. Re-check `320/2026/NĐ-CP` once it takes effect on 2026-09-28.
7. Independently work through the remaining 39 pre-existing `NEEDS_LEGAL_REVIEW` records this audit
   did not touch (thi_thuc, tam_tru, xac_nhan_thong_tin, giay_thong_hanh, nguoi_khong_quoc_tich,
   dac_doanh, can_cuoc, dinh_danh_dien_tu, xuat_nhap_canh, khu_vuc_cam_bien_gioi) against their
   already-cited sources' full text.
8. Re-run this whole audit with working WebFetch/browser access instead of WebSearch-only synthesis.
