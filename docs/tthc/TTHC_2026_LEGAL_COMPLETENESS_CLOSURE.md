# TTHC 2026 legal completeness — closure round

Task: `BANDOCAPT_TTHC_2026_LEGAL_COMPLETENESS_CLOSURE`, continuing Draft PR #79 (which carries
`docs/tthc/TTHC_2026_LEGAL_COMPLETENESS_FINAL_AUDIT.md`, the prior `PARTIAL` audit). This document
is the closure round's own report; it does not replace or edit the prior one, which remains the
historical record of what PR #79 found before this round.

## VERDICT

`BANDOCAPT_TTHC_2026_LEGAL_COMPLETENESS_PARTIAL_NEW_RECORDS_UNRESOLVED`

QĐ 5230's 8 NEW căn cước procedures — the task's own priority-1 blocker — remain unresolved: this
round narrowed the space considerably (see below) but could not obtain a primary-source reading of
the decision's Phụ lục I, so no procedure code, official name, or dossier can be asserted for any of
the 8. Per section 20 of the task, that alone caps the verdict at `PARTIAL_NEW_RECORDS_UNRESOLVED`
regardless of how much other work closed cleanly. This round did close real gaps (see below) and
found two errors in its own predecessor's reasoning, which it corrected rather than repeated.

## BASELINE

- Branch: `claude/tthc-2026-legal-audit-mi5fqz`
- Starting SHA (= PR #79's prior head, itself based on PR #77's merge `721df04`): `1ab49dc9c4a506e60257799cbfcceb86979e67bf`
- Final SHA: recorded in the commit accompanying this report
- PR: #79 (draft, unchanged — still not ready for review)
- Working tree: clean at close; only files listed under "Files changed" below were touched. No
  owner/unrelated changes were present in the tree at the start of this round (verified via `git
  status`/`git fetch` before editing; PR #79's remote head matched local head exactly).

## Tooling constraint (unchanged from the prior round — re-verified, not assumed)

`WebFetch` was re-tested this round against `bocongan.gov.vn`, `vanban.chinhphu.vn`, `vbpl.vn`, and
`dichvucong.bocongan.gov.vn` and returned `EGRESS_BLOCKED` for all four. This is a session-level
network policy, not something that improved between rounds. Every finding below therefore comes from
`WebSearch`'s synthesized results — cross-checked across multiple independent mirrors where possible
— never from reading a primary PDF/DOCX/HTML page directly. Evidence quality is labeled per finding
using the scale the task defines (`PRIMARY_CONFIRMED` / `PRIMARY_PARTIAL` / `SECONDARY_ONLY` /
`UNVERIFIED`); nothing in this round is labeled `PRIMARY_CONFIRMED`, because that requires actually
reading the source, which remained impossible this session.

## QĐ 5230 CLOSURE

| # | Candidate identity | Level | Evidence quality | Status |
|---|---|---|---|---|
| 1–8 | Not individually identifiable | — | — | `UNRESOLVED` |

Two figures both appear in independent secondary sources for QĐ 5230's total NEW count: **"08 thủ
tục hành chính mới ban hành"** is the almost-verbatim, near-universally repeated announcement
sentence (found identically worded across a dozen+ independent provincial-police mirrors and
policy-news outlets — `PRIMARY_PARTIAL`: strong multi-source verbatim agreement on the decision's own
preamble text, still without reading the PDF itself), while a more detailed secondary breakdown
states **"10 thủ tục hành chính mới (02 cấp Trung ương + 03 cấp tỉnh + 05 cấp xã)"** (`SECONDARY_ONLY`,
two independent sources). The most defensible reading, by direct analogy to QĐ 1523's own confirmed
pattern (39 authority-level rows representing 36 unique procedure codes, because 3 codes apply at
both `tỉnh` and `xã`), is that "08" counts unique new procedure names and "10" counts authority-level
rows — but this is a **hypothesis**, not a confirmed reconciliation, because the actual annex was
not read.

Two candidate names for the 2 central-level ("cấp Trung ương") procedures were identified with
`SECONDARY_ONLY` quality: "Cấp, cấp đổi, cấp lại thẻ căn cước (thực hiện tại cấp Trung ương)" and
"Khai thác thông tin công dân và người gốc Việt Nam chưa xác định được quốc tịch trong Cơ sở dữ liệu
quốc gia về dân cư (thực hiện tại cấp Trung ương)". A DVC portal code `matt=57072` was found for a
related central-level "Cấp thẻ căn cước cho người dưới 14 tuổi" entry, in a numeric range distinct
from the existing tỉnh/huyện-level codes (26093–26099), suggesting a freshly issued code batch — but
this was not confirmed by reading the portal page itself (blocked), so it is corroborating, not
conclusive.

One adjacent, out-of-scope finding worth recording so nobody re-discovers it as a false lead: from
01/09/2026, Nghị định 301/2026/NĐ-CP + Quyết định 1868/QĐ-BTP (**Bộ Tư pháp**, not Bộ Công an) let a
child under 6 get a căn cước card inside the birth-registration liên thông group. This is a different
issuing channel under a different ministry and was **not** treated as one of QĐ 5230's 8/10 new
procedures, and was **not** added to the catalog.

**Correction to the prior round:** the 2026-09-15 `FINAL_AUDIT` report stated flatly that "10 NEW"
(PR #77's figure) was simply wrong and "08 NEW" was the correct count. This round found that
conclusion **too simple** — see the authority-row hypothesis above. Neither prior claim is retracted
as fully wrong; both are now flagged as unresolved without primary-text confirmation.

**Catalog action: none.** 0 of the (8 or 10) new procedures were added to `data/tthc-catalog.json`.
Fabricating a code, name, or dossier from secondary-source fragments would violate the task's
fail-closed rule. The finding is tracked in `data/tthc-2026-refresh-manifest.json` under
`known_missing_procedures[0]`, now considerably more detailed than the prior round's entry (candidate
names, the count-discrepancy hypothesis, the DVC code lead, the Tư pháp adjacent-finding caveat).

## NEW LEGAL DOCUMENT RECONCILIATION

### 37/2026/TT-BCA + 236/2026/NĐ-CP (đăng ký xe) — 11 records affected

- **Scope confirmed (not just guessed) this round:** TT37/2026/TT-BCA amends **khoản 6 Điều 3**
  TT79/2024/TT-BCA (kết quả đăng ký xe nay nhận qua Cổng DVC/bưu chính/trực tiếp theo nhu cầu chủ xe;
  tích hợp VNeTraffic) and **điểm c khoản 2 Điều 16** TT79/2024/TT-BCA (hồ sơ đăng ký sang tên xe —
  chứng từ chuyển quyền sở hữu). `SECONDARY_ONLY`, multiple independent mirrors agree on the specific
  Điều/khoản numbers.
- **Before → After per subgroup:**
  - All 11 records: generic "chưa xác minh" submission-method text → specific note that result
    delivery now goes through Cổng DVC/bưu chính/trực tiếp + VNeTraffic (khoản 6 Điều 3).
  - 1 record ("Cấp chứng nhận đăng ký xe... đăng ký sang tên xe"): generic → **confirmed dossier
    citation**, điểm c khoản 2 Điều 16 (chứng từ chuyển quyền sở hữu).
  - 2 records ("Thu hồi chứng nhận/giấy chứng nhận đăng ký xe, biển số xe"): generic → note on the
    reported 5-year plate-retention-on-surrender rule.
- **Also found:** QĐ 1383/QĐ-BCA (28/02/2025, hiệu lực 01/03/2025) is the actual "quyết định công bố
  TTHC" (LATEST_TTHC_DECISION tier) underlying this domain — replaces QĐ 9093/QĐ-BCA (13/12/2024),
  itself replacing QĐ 2609/QĐ-BCA-C08 (20/4/2021). The registry had **no LATEST_TTHC_DECISION-tier
  source at all** for this domain before this round — only the content-substance Thông tư/Nghị định.
  Added to the registry and cited on all 11 records. `SECONDARY_ONLY` (consistent across
  Quảng Ngãi/Bắc Giang/Đắk Nông police mirrors + `mps.gov.vn`, not confirmed via
  `vanban.bocongan.gov.vn` directly).
- **Classification:** unchanged, `NEEDS_LEGAL_REVIEW` (already correctly set by the prior round).

### 131/2026/TT-BCA vs 98/2021/TT-BCA + 136/2025/QH15 (khiếu nại/tố cáo) — 2 records affected

- **Correction to the prior round:** the prior round cited TT131/2026/TT-BCA as the operative new
  source for both "Giải quyết khiếu nại..." and "Giải quyết tố cáo..." records. This round found that
  TT131/2026/TT-BCA governs only the **tiếp công dân** (citizen-reception intake) step — nguyên tắc
  tiếp công dân, địa điểm, tiếp nhận đơn/tài liệu, từ chối tiếp công dân, hình thức trực tuyến — not
  the substantive **giải quyết** (resolution) authority/timeline that these 2 procedures are actually
  titled after.
- **What actually governs the resolution authority:** Luật số 136/2025/QH15 ("Luật sửa đổi, bổ sung
  một số điều của Luật Tiếp công dân, Luật Khiếu nại, Luật Tố cáo", thông qua 10/12/2025, hiệu lực
  01/07/2026) — a **law**, higher precedence than TT131/2026 — explicitly clarifies authority to
  resolve khiếu nại/tố cáo at `xã`/`tỉnh` level consistent with the 2-tier local government model.
  This source was missing from the registry entirely before this round; added now
  (`vanban.chinhphu.vn`, `SECONDARY_ONLY`).
- **Before → After:** both records' `source_url_ref` changed from `131/2026/TT-BCA` to
  `136/2025/QH15`; `legal_basis` now carries both (the law for resolution authority, the circular for
  the adjacent intake step). Classification unchanged, `NEEDS_LEGAL_REVIEW`.

### 118/2025/QH15 + 70/2026/TT-BCA (người nước ngoài / XNC / cư trú) — differentiated this round

- **Precise scope found:** within Luật 118/2025/QH15's amendment of the Luật Nhập cảnh, xuất cảnh,
  quá cảnh, cư trú của người nước ngoài, it names exactly **3 procedures**: cấp thị thực, cấp thị
  thực điện tử, cấp lại thẻ thường trú. `SECONDARY_ONLY`, one detailed independent source.
- **Before → After, thuong_tru (3 records):** the prior round treated all 3 (cấp mới / cấp đổi / cấp
  lại thẻ thường trú) as equally covered. This round **downgraded confidence on 2 of them**
  ("cấp mới", "cấp đổi" — not named in the 3-procedure list; link is now explicitly marked weaker,
  resting only on the law's general scope + TT70/2026's shared form update) and **strengthened the
  3rd** ("cấp lại" — named directly, confidence stays `low` but evidence upgraded from generic to
  specific).
- **Before → After, thi_thuc (7 records):** 4 records ("Cấp thị thực...", "Cấp thị thực điện tử...",
  ×2 each at 2 authority levels) got a **confirmed specific match** to the named 3-procedure list and
  `118/2025/QH15` added to `legal_basis`. The other 3 ("Gia hạn tạm trú cho người miễn thị thực" ×2,
  "Kiểm tra, xét duyệt nhân sự... nhập cảnh") do **not** match the named list — explicitly noted as
  such, `118/2025/QH15` **not** added to their `legal_basis` (no unjustified citation).
- **Also found, case A (citation completeness, no content-change claim):** Luật 118/2025/QH15 also
  amends Điều 40 Luật Xuất cảnh, nhập cảnh của công dân Việt Nam (separate law, domestic passports —
  affects the catalog's 6 `ho_chieu` `AMENDED` records) and Điều 27 Luật Cư trú (domestic household
  relationship documents — affects 4 of the `cu_tru` `AMENDED` records: đăng ký/xóa đăng ký tạm
  trú/thường trú). Both amendments are a general "don't resubmit data already in a database"
  simplification principle. No evidence of a specific dossier/authority rewrite was found for either,
  so both groups were left `AMENDED` (their classification already rests on an exact QĐ4245/QĐ1523
  code match — much stronger evidence than this general principle) and simply gained
  `118/2025/QH15` as an additional `legal_basis` entry.
- Registry entry for `118/2025/QH15` updated: `domains` widened from `[thuong_tru, xuat_nhap_canh]`
  to `[thuong_tru, thi_thuc, ho_chieu, cu_tru]` to reflect what was actually confirmed this round.

### 320/2026/NĐ-CP (định danh điện tử) — future-effective, confirmed not-yet-in-force

- Issued 13/08/2026, effective **28/09/2026** — after this audit's 15/09/2026 cutoff. Registry status
  `NOT_YET_EFFECTIVE` (unchanged from prior round, re-verified).
- **`FUTURE_EFFECTIVE` annotation added** (per task section 13) to all 9 records most likely to be
  affected once it takes effect (`can_cuoc`/`dinh_danh_dien_tu`/`tai_khoan_dien_tu` domain records
  currently `NEEDS_LEGAL_REVIEW` under `5230/QĐ-BCA-C06`) — annotation only, **no** classification or
  `legal_basis` change, per the task's explicit instruction not to treat a not-yet-effective law as
  current.

### Citation-completeness fixes (case A, no classification change) found during the domain sweep

- 3 `dac_doanh` records cited only `1523/QĐ-BCA-C06` (a `LATEST_TTHC_DECISION`-tier source) despite
  `58/2026/NĐ-CP` (`IN_FORCE_LEGAL_INSTRUMENT`-tier, top of the source-precedence chain) explicitly
  listing `dac_doanh` as a covered domain and never being cited by any record in it. Added.
- Same gap, same fix, for all `can_cuoc`/`cu_tru` `AMENDED`/`UNCHANGED` records (13 total) relative to
  `58/2026/NĐ-CP`.

## UNVERIFIED LEADS

- **`02/2026/TT-BCA`** (vũ khí, vật liệu nổ, công cụ hỗ trợ): the prior round's already-thin lead
  (2 non-official secondary aggregators) could **not be reproduced** this round — a fresh, differently
  worded search for it surfaced only the base circulars it allegedly amends (TT75/2024, TT77/2024) and
  unrelated 2026 circulars (TT14/2026, TT48/2026, TT62/2026), never TT02/2026 itself. Confidence
  **lowered**, not raised. Remains `UNVERIFIED_LEAD`; not added to the registry; not used for any
  classification. The 1 affected catalog record (`guide:vu-khi:khai-bao-vu-khi-tho-so-...`) keeps its
  prior round's `NEEDS_LEGAL_REVIEW` status unchanged.
- **`QĐ 4685/QĐ-BCA-C08`** (23/7/2026, "bảo đảm trật tự, an toàn giao thông đường bộ"): confirmed to
  exist with a specific count this round (10 NEW + 5 AMENDED + 33 ABOLISHED, `SECONDARY_ONLY` via
  Cần Thơ/An Giang/Gia Lai police mirrors), but its relationship to this catalog's `dang_ky_xe` domain
  remains **unconfirmed**. A same-topic MPS article title ("đăng ký, quản lý phương tiện giao thông")
  turned out on closer check to describe the *separate*, older QĐ 1383/QĐ-BCA (28/2/2025, added to the
  registry this round — see above), not QĐ 4685. No direct successor link between QĐ 1383 and QĐ 4685
  could be established. Remains `UNVERIFIED_LEAD`, not added to the registry, not cited by any record.

## LEGAL STATE SUMMARY

| State (this task's contract) | Manifest classification used | Count |
|---|---|---:|
| CURRENT | `UNCHANGED` | 7 |
| AMENDED | `AMENDED` | 21 |
| ABOLISHED | `ABOLISHED` | 15 |
| NEW | *(none — see QĐ5230 closure above)* | 0 |
| NEEDS_LEGAL_REVIEW | `NEEDS_LEGAL_REVIEW` | 58 |
| **Total manifest records** | | **101** |

`OUT_OF_SCOPE` no longer appears anywhere in the manifest: the task's classification contract for
this round (section 5) does not include it, so the 2 remaining `OUT_OF_SCOPE` records from the prior
round (non-procedure cư trú guide-text fragments — an exemption clause and a section heading, not
named TTHC) were moved to `NEEDS_LEGAL_REVIEW` with a reason asking whether they are even distinct
TTHC at all, which this audit cannot answer on its own.

`NEEDS_LEGAL_REVIEW` rose from 56 (end of prior round) to 58 (those same 2 records) — not because
anything got harder to resolve, but because the classification contract itself changed. No record
was moved *out of* `NEEDS_LEGAL_REVIEW` this round; none of the enrichment above (citation fixes,
narrower/wider confidence notes, the two corrected group attributions) changed a single
classification value except the QĐ4685-vs-QĐ1383 disambiguation (which added a source, not a
reclassification) and the 2 OUT_OF_SCOPE→NEEDS_LEGAL_REVIEW moves.

## CANONICAL CATALOG

| Change type | Count |
|---|---:|
| Existing current (start of this round) | 78 |
| Added NEW | 0 |
| Amended (content rewritten) | 0 |
| Removed/abolished | 0 |
| **Final canonical** | **78** |
| Unresolved impact (NEEDS_LEGAL_REVIEW, content not re-verified) | 58 |

No procedure was added to, removed from, or content-edited in `data/tthc-catalog.json` this round.
This is a direct consequence of the fail-closed rule, not an oversight: every substantive finding this
round (QĐ5230's new procedures, the vehicle-registration dossier changes, the khiếu nại/tố cáo
authority source) was confirmed only to `SECONDARY_ONLY`/`PRIMARY_PARTIAL` quality — enough to
correct a manifest classification's *reasoning* and *evidence*, not enough to safely rewrite what a
citizen reads on the page. The catalog count staying at 78 should not be read as "nothing changed" —
58 of those 78 records now carry a materially different, more specific legal-basis chain than they
did at the start of this round.

## VALIDATORS

- `node scripts/validate-tthc-legal-refresh.js`: **PASS** — 16 sources (was 14), 101 records,
  `NO_PRODUCTION_MUTATION`
- `npm run validate:qd1523-mapping`: **PASS**, unchanged (51 rows: 5 NEW/39 AMENDED authority rows /
  36 unique codes / 7 ABOLISHED)
- New validator check added this round to `lib/tthc-legal-refresh.js` `validateManifest()`: a record
  citing a registry source that has since been `superseded_by` another source now fails validation
  unless the superseding source is also cited (or is the record's own `source_url_ref`). Verified this
  fires correctly against the existing `1583/QĐ-BCA-QLXNC → 4245/QĐ-BCA-QLXNC` supersession before
  committing (no record violated it — confirmed by direct inspection prior to adding the check).

## TESTS

- `npm test`: **PASS 677/677** (re-run fresh this round after `npm ci`/dependency check at session
  start — dependencies were already present, unlike the prior round which needed a fresh `npm ci`)
- `test/tthc-legal-refresh.test.js` specifically: 5/5, with the hardcoded classification-count
  assertion updated from `{ OUT_OF_SCOPE: 2, NEEDS_LEGAL_REVIEW: 56 }` to
  `{ OUT_OF_SCOPE: 0, NEEDS_LEGAL_REVIEW: 58 }` and the allowed `matchMethod` set widened to include
  the new `NOT_A_DISTINCT_PROCEDURE_PENDING_PRODUCT_DECISION` method — both changes justified inline
  in the test file's own comments, not silently changed

## BUILD

`npm run build`: **PASS** (exit 0) — CSS, both Apps Script bundles, syntax/staff/rate-limit checks,
static build to `dist/` all succeeded, re-run fresh this round.

## E2E

- **Domain/legal result:** `test/e2e/tthc-catalog.spec.js` (the only E2E suite exercising this task's
  domain): **6/6 PASS**, run fresh this round with `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium`.
- **Full result:** `DOMAIN_E2E_PASS_FULL_E2E_BLOCKED`. This round did not re-run the full 117-spec
  local suite a second time (the prior round already established, and this round's real CI run
  reconfirmed independently — see next line — that the local sandbox's map/location-data specs fail
  for environment reasons unrelated to this diff). Instead, this round pulled the **actual GitHub
  Actions result** for this PR's current head (`1ab49dc`, run `34925063839`, job `test-build-audit`):
  **116/117 passed**, with real, unrestricted network access. The single failure —
  `test/e2e/panel-state-arbiter.spec.js:102` ("repeated transitions never show two mutually-exclusive
  surfaces at once") — is a mobile panel-state timing assertion in frontend code this PR's diff does
  not touch (`app.js`/UI layer; this PR touches only legal data/validators/tests). A re-run of the
  failed job was attempted to rule out a one-off flake; it failed with `403 Resource not accessible by
  integration` (this session's GitHub token lacks `actions:write`). Documented as a standing-down
  comment on PR #79 rather than silently ignored (see "Files changed" / PR activity below). Not fixed
  here: out of this task's explicit scope (frontend), and no evidence ties it to this PR's diff.
- **Environment blocker, stated plainly:** this sandbox's local Playwright run cannot reach
  `unpkg.com` (Leaflet CDN) and/or Google's GViz endpoint (`/api/google-sheet` → live location data),
  both blocked by the same session-level egress restriction documented above for `WebFetch`. That is
  why a from-scratch local "full E2E" run in this environment is not a meaningful signal here — the
  real CI run is the authoritative number for this PR.

## FILES CHANGED

- `data/tthc-legal-sources.json`: `verified_at` → `2026-09-15` (already was, re-confirmed); 2 new
  sources added (`136/2025/QH15`, `1383/QĐ-BCA`, bringing the round's cumulative total to 16 vs the
  audit round's 14); `domains` widened on `118/2025/QH15`; explanatory `notes` added/extended on
  several entries
- `data/tthc-2026-refresh-manifest.json`: `known_missing_procedures[0]` (QĐ5230 gap) substantially
  rewritten with this round's findings; 2 records' `source_url_ref`/`legal_basis` corrected
  (khiếu nại/tố cáo: `131/2026/TT-BCA` → `136/2025/QH15` as primary); confidence/evidence
  differentiated on 3 `thuong_tru` + 7 `thi_thuc` records; `FUTURE_EFFECTIVE` annotations added to 9
  records; citation-completeness (`58/2026/NĐ-CP`, `1383/QĐ-BCA`) added to 27 records across
  `dac_doanh`/`can_cuoc`/`cu_tru`/`dang_ky_xe`; the last 2 `OUT_OF_SCOPE` records reclassified to
  `NEEDS_LEGAL_REVIEW`
- `lib/tthc-legal-refresh.js`: `isOfficialUrl()` allowlist extended with `mps.gov.vn` (flagged in the
  registry `notes` as needing re-confirmation once direct portal access is available); new
  `validateManifest()` check for citing a superseded source without its replacement
- `test/tthc-legal-refresh.test.js`: classification-count assertion and `matchMethod` allowlist
  updated to match, with inline justification
- `docs/tthc/TTHC_2026_LEGAL_COMPLETENESS_CLOSURE.md`: this report (new file; the prior round's
  `TTHC_2026_LEGAL_COMPLETENESS_FINAL_AUDIT.md` is left untouched as the historical record of what
  PR #79 found before this round)

No frontend, chatbot runtime, UI/UX, Pinecone, or production file was touched, per task scope.

## PRODUCTION SAFETY

`NO_PRODUCTION_MUTATION` — no Pinecone write (production 529-vector namespace or the 78-record
candidate namespace), no embedding, no Vercel env change, no Google Sheet write, no chatbot deploy, no
merge. All changes are local commits on `claude/tthc-2026-legal-audit-mi5fqz`, pushed to the existing
Draft PR #79.

## REMAINING RISKS

1. **QĐ 5230's 8/10 NEW procedures are still not identified**, let alone added to the catalog — the
   task's own priority-1 blocker remains open. Without primary-text access this cannot be closed from
   this environment.
2. `mps.gov.vn` was added to the official-URL allowlist on the strength of its content matching known
   `vanban.bocongan.gov.vn` article titles almost exactly, not on independently verified domain
   ownership — a future session with working `WebFetch` should confirm this is genuinely a Bộ Công an
   first-party domain before trusting it further.
3. The `02/2026/TT-BCA` and `QĐ 4685/QĐ-BCA-C08` leads remain open; `4685` in particular is now known
   to be real and sizeable (10/5/33) but its relevance to this catalog's `dang_ky_xe` domain is
   unresolved — worth prioritizing in the next round given its scale.
4. 39 pre-existing `NEEDS_LEGAL_REVIEW` records (thi_thuc remainder, tam_tru, xac_nhan_thong_tin,
   giay_thong_hanh, nguoi_khong_quoc_tich, can_cuoc remainder, dinh_danh_dien_tu, xuat_nhap_canh,
   khu_vuc_cam_bien_gioi) were checked for internal consistency this round (no stale/superseded source
   citations found) but received no new source research — they carry the same evidence as the prior
   audit round.
5. This entire round's evidence ceiling is `SECONDARY_ONLY`/`PRIMARY_PARTIAL` because `WebFetch` is
   blocked in this environment for every government and news domain tested. Every specific finding
   above should be treated as "worth checking against the primary text," not as settled fact.
6. `panel-state-arbiter.spec.js` CI flake (see E2E section) is unresolved; needs a human to either
   re-run the job or confirm it as a known pre-existing flake unrelated to this PR.

## NEXT STEP

**Not** `PINECONE TTHC DELTA REFRESH`. Legal state is not closed: the priority-1 blocker (QĐ5230's new
procedures) is unresolved, and every new source found this round is `SECONDARY_ONLY` evidence pending
primary-text confirmation. The next step is further legal verification — specifically, a session or
process with working access to `bocongan.gov.vn`/`vanban.bocongan.gov.vn` (or the owner manually
supplying the already-hashed QĐ5230 attachment from a prior session that did have such access) to
read Phụ lục I directly and resolve the 8/10-NEW question definitively.
