# TTHC 2026 — QĐ 5230 NEW records narrow closure

Task: `BANDOCAPT_TTHC_2026_QD5230_NEW_RECORDS_CLOSURE`

This is a narrow follow-up to `docs/tthc/TTHC_2026_LEGAL_COMPLETENESS_CLOSURE.md`. It does **not**
re-run the full 101-record legal audit. It targets exactly one blocker: the identity of the
NEW procedures published by Quyết định 5230/QĐ-BCA-C06 (18/08/2026).

## VERDICT

`BANDOCAPT_QD5230_NEW_RECORDS_BLOCKED_PRIMARY_SOURCE`

## BASELINE

- Branch: `claude/tthc-2026-legal-audit-mi5fqz`
- Starting SHA: `1c72141` (`1c721416a4de27167bfd37227d4c4f114510b938`)
- Final SHA of this round: see commit created alongside this file
- PR: `#79`, state: **Draft** (unchanged — blocker not closed)

## PRIMARY SOURCE

- QĐ 5230 decision PDF: `https://bocongan.gov.vn/media/bca-media/library-20260826152206-1abcea7e-06cf-4b13-a9d6-c773f9a4d74d-quyet-inh-so-5230.pdf`
  (SHA-256 on file in `data/tthc-legal-sources.json` → `attachments[0].sha256`)
- Appendix source: not separately listed; presumed to be inside the same decision PDF (no
  distinct appendix URL was found this round).
- Access status: **EGRESS_BLOCKED**. WebFetch was attempted against the decision PDF itself and
  against every alternate official/secondary mirror found this round:
  `bocongan.gov.vn` (decision PDF), `dichvucong.gov.vn` (DVC detail page `matt=57072`),
  `mps.gov.vn`, `xaydungchinhsach.chinhphu.vn`, `congan.cantho.gov.vn`, `luatvietnam.vn`,
  `cafef.vn`, `baolaocai.vn` — all returned `EGRESS_BLOCKED` from the network egress proxy.
  This confirms (and generalizes) the prior rounds' finding: the block is not limited to
  `.gov.vn` — it covers government, commercial and news domains hosted in Vietnam alike. Only
  `WebSearch` (Anthropic-side synthesized snippets) is reachable in this environment.
- Evidence quality obtainable this round: **SECONDARY_ONLY** for everything. No
  `PRIMARY_CONFIRMED` or `PRIMARY_PARTIAL` evidence exists in this environment.

## QĐ 5230 COUNT RECONCILIATION

- `UNIQUE_PROCEDURE_COUNT`: **08** (stated verbatim in the decision's own announcement text,
  repeated near-identically across dozens of independent official mirrors — this is a direct
  quote from the decision's opening line, not a per-site paraphrase).
- `PUBLISHED_ROW_COUNT`: **10**, with an independently and repeatedly corroborated breakdown of
  **02 trung ương + 03 tỉnh + 05 xã**. This round found the same breakdown, in the same wording,
  echoed across at least 5 separate Công an tỉnh/thành mirrors (An Giang, Đồng Nai/Trảng Dài,
  Lào Cai, Quảng Trị, Ninh Bình), on top of the 2 sources found in the prior round.
- Explanation of the difference: the working hypothesis remains
  `STRUCTURAL_ANALOGY` to QĐ1523 (39 authority rows = 36 unique codes, because 3 codes are
  published once per authority level where they apply). Under that hypothesis, of the 8 unique
  QĐ5230 names, some subset is published at more than one authority level, adding 2 extra rows
  (8 unique → 10 rows). This round found *specific* supporting detail for that hypothesis (see
  below) but it is still a hypothesis, not confirmed by primary text — per task section 9, this
  is recorded as `STRUCTURAL_ANALOGY`, not legal proof.

## OFFICIAL NEW PROCEDURES

No official procedure code (mã TTHC) was found for any of the 8 procedures this round. Two of
the 8 unique names have SECONDARY_ONLY name/level evidence; the other 6 names and all 8 codes
remain completely unidentified.

| Code | Official name | Authority | Source | Catalog action | Status |
|---|---|---|---|---|---|
| UNRESOLVED | Cấp, cấp đổi, cấp lại thẻ căn cước | trung ương + tỉnh + xã (3 rows, SECONDARY_ONLY) | WebSearch-synthesized snippets, multiple independent Công an tỉnh mirrors | UNRESOLVED | Name-only lead, no code |
| UNRESOLVED | Khai thác thông tin công dân và người gốc Việt Nam chưa xác định được quốc tịch trong Cơ sở dữ liệu quốc gia về dân cư | trung ương + tỉnh (2 rows, SECONDARY_ONLY) | WebSearch-synthesized snippets | UNRESOLVED | Name-only lead, no code |
| UNRESOLVED | (6 remaining unique names — 1 more tỉnh-level row, 4 more xã-level rows) | unknown | not found | UNRESOLVED | No evidence at all |

A third candidate name surfaced during search — **"Khai thác thông tin công dân trong Cơ sở dữ
liệu căn cước"** — but was investigated and **rejected** as a QĐ5230 candidate: it is governed by
the pre-existing Quyết định 1523/QĐ-BCA-C06 (26/03/2026), already registered and already
reconciled in `data/qd1523-procedure-map.json` (result form DC03, no fee). Treating it as
QĐ5230-new would have double-counted an already-current procedure. This is recorded as a
"misleading lead" in the manifest, not added as a candidate.

## AUTHORITY DUPLICATION ANALYSIS

- **"Cấp, cấp đổi, cấp lại thẻ căn cước"**: found named at trung ương, tỉnh, and xã level across
  independent search snippets. If this is genuinely one procedure implemented at 3 levels (Case
  1, per task section 8), it alone would account for 3 of the 10 published rows from 1 unique
  code — directly analogous to the QĐ1523 multi-authority pattern. This has **not** been verified
  against official code/appendix content (task section 8 explicitly forbids inferring this from
  name similarity alone) — it stays a hypothesis.
- **"Khai thác thông tin công dân và người gốc Việt Nam..."**: found named at trung ương and
  tỉnh level. Same caveat — Case 1 vs Case 2 cannot be determined without the appendix.
- No evidence either way for the remaining 6 unique names / 5 rows — cannot analyze duplication
  for something with zero name evidence.

## CATALOG IMPACT

No catalog change is justified. Zero of the 8 unique procedures have both a confirmed official
code and confirmed name/authority — the task's own gate (section 12, 14: only add with
`PRIMARY_CONFIRMED`, or sufficiently strong `PRIMARY_PARTIAL`) is not met by any record.

| Code | Existing match | Action | Reason |
|---|---|---|---|
| — | — | `UNRESOLVED` (all 8) | No official code obtained; SECONDARY_ONLY evidence cannot justify `ADD_NEW`, `UPDATE_EXISTING`, or `MERGE_AUTHORITY` per section 14 |

## FINAL CATALOG COUNT

| Component | Count |
|---|---:|
| Existing canonical | 78 |
| Genuine NEW additions | 0 |
| Replaced/merged records | 0 |
| Already present equivalents | 0 (1 misleading lead rejected — pre-existing QĐ1523 procedure, not new) |
| Final canonical count | **78** |

`data/tthc-catalog.json` was not touched this round.

## VALIDATORS

- `npm run validate:tthc-legal-refresh` → PASS: `{"sources":16,"explicitRecords":101,"productionMutation":"NO_PRODUCTION_MUTATION"}`
- `npm run validate:qd1523-mapping` → PASS: `{"sourceDocument":"1523/QĐ-BCA-C06","rows":51,"NEW_UNIQUE_PROCEDURES":5,"AMENDED_AUTHORITY_ROWS":39,"AMENDED_UNIQUE_PROCEDURE_CODES":36,"DUPLICATED_ACROSS_AUTHORITY_LEVELS":3,"ABOLISHED_UNIQUE_PROCEDURES":7,"productionMutation":"NO_PRODUCTION_MUTATION"}`
- Legal reconciliation tests (`test/tthc-legal-refresh.test.js`): unchanged assertions, still PASS
  (manifest `records` array was not touched — only the free-form `known_missing_procedures`
  block gained a new sub-object, which carries no schema constraints).

## TESTS

`npm test` → **677/677 PASS**, 0 fail.

## BUILD

`npm run build` → PASS (CSS build, Apps Script bundles, syntax checks, static build all green).

## E2E

Not applicable this round — no frontend, catalog, or manifest `records` content changed; only a
free-form evidence block inside `known_missing_procedures` was added. No runtime behavior is
affected, so no E2E rerun was performed. Last known state (unchanged, not re-verified this round):
domain E2E 6/6 PASS, full CI 116/117 (1 pre-existing unrelated flake).

## FILES CHANGED

- `data/tthc-2026-refresh-manifest.json` — added `known_missing_procedures[0].qd5230_narrow_closure_round`
  evidence block (primary-source attempts, strengthened count-structure evidence, 2 named
  candidates with authority-level breakdown, 1 rejected misleading lead, explicit remaining-gap
  statement). `status` field left as `UNRESOLVED_PRIMARY_TEXT_NOT_ACCESSIBLE`. No other field
  changed; no `records` entries touched.
- `docs/tthc/TTHC_2026_QD5230_NEW_RECORDS_CLOSURE.md` (this file, new).
- `docs/brain/06-ai-working-log.md` — new entry appended.

## PR STATUS

PR #79 remains **Draft**. Not proposed for Ready for Review — the QĐ5230 blocker is narrowed but
not closed.

## PRODUCTION SAFETY

`NO_PRODUCTION_MUTATION` — no Pinecone update/re-embed/promote, no chatbot change, no Vercel
deploy, no location-corpus change, no production data mutation. Pinecone candidate stays at 78;
production Pinecone stays at 529.

## REMAINING RISKS

- The single largest open item is unchanged in kind: QĐ5230's Phụ lục I (official codes, and 6 of
  8 official names) cannot be read in this environment. WebFetch is blocked for every
  Vietnamese-hosted domain tried, government and commercial alike.
- The 2 named candidates (and the 3-level / 2-level row attribution) are `SECONDARY_ONLY` —
  WebSearch-synthesized text, not a direct quote from a specific page and not primary appendix
  content. They should be treated as leads to verify, not as facts to build on.
- The rejected "CSDL căn cước" lead shows search synthesis can conflate a QĐ5230-adjacent name
  with an unrelated pre-existing QĐ1523 procedure — a caution for whoever picks this up next with
  real primary-source access.
- 5 of the 10 published rows (1 tỉnh-level, 4 xã-level) have zero name evidence at all.

## NEXT STEP

QĐ5230 is **not** closed. The only legitimate next step is further legal verification with actual
primary-source access (a session/tool with unrestricted egress to `bocongan.gov.vn`, or a manual
download of the decision PDF supplied by the owner) to read Phụ lục I directly and obtain the 8
official codes/names. Do not proceed to `BANDOCAPT_TTHC_2026_LEGAL_COMPLETENESS_FINALIZATION` or
any Pinecone step until that is done.
