# TTHC 2026 legal refresh report

## Verdict

`BANDOCAPT_TTHC_2026_LEGAL_REFRESH_PASS_READY_FOR_OWNER_REVIEW_WITH_PREEXISTING_SECURITY_GATE`

The refresh is isolated in a clean sibling worktree from `origin/main` and is fail-closed. QĐ1523 count reconciliation and runtime gates pass. Candidate data remains subject to owner review and an explicit production-release decision; no production mutation has occurred.

## Worktree and baseline

- Clean worktree: `D:\\04. Github\\bandocapt-tthc-refresh`.
- Branch: `feat/tthc-2026-legal-refresh`.
- Base: `origin/main` at `7729726f628f9f7c0949792ce74c30b05cb8f7ce`.
- Original dirty worktree and owner changes were preserved; no Pinecone write, namespace mutation, Vercel change or deploy was performed. Changes are pushed to the existing PR #77.

## Official sources and attachments

`data/tthc-legal-sources.json` records eight official Ministry of Public Security sources with issuer, issue/effective dates, precedence and official URLs. The following public attachments were downloaded and SHA-256 recorded:

- QĐ 1523 appendix PDF: `2EA06491E4700EA3C851E9022F94EA0BAFBB72B3522546FC840982988D3D9946`.
- QĐ 4245 decision PDF: `AC0799AFFBB25E6E4A7C2C272975AF5E32D412135310F02F9814F4A51910E168`.
- QĐ 4245 danh mục DOCX: `E731FB908A20274F16ABE73CD2CF4D72082C05B34D039C94825B3308B7A05EC1`.
- QĐ 5230 decision PDF: `8C741FE1AAFEFB11622DC486BBA76EFEFC3BA8CA408643816BA39F82E638728D`.

The QĐ 4245 DOCX was text-extracted and confirms eight amended IDs (`1.001471`, `2.000539`, `1.010382`, `2.00048`, `1.001456`, `1.001445`, `1.010384`, `1.010386`) and one abolished ID (`1.010385`). QĐ5230 is reconciled as 10 NEW, 2 AMENDED and 28 ABOLISHED; it remains the later applicable source for căn cước.

## Per-procedure manifest and catalog audit

- Baseline catalog: 92 procedures.
- Final candidate catalog after fail-closed filtering: 78 procedures.
- Manifest: 101 unique records covering every baseline procedure plus official QĐ 4245 procedure IDs not represented by the legacy slug catalog.
- Manifest classifications after deterministic re-review: 15 `ABOLISHED`, 21 `AMENDED`, 7 `UNCHANGED`, 19 `OUT_OF_SCOPE`, and 39 `NEEDS_LEGAL_REVIEW`.
- All 76 initial review records carry an explicit reconciliation disposition: 11 exact name + authority matches, 7 exhaustive-annex absence determinations, 19 out-of-scope determinations, and 39 concrete no-exact-identity reasons. No mass “current” assertion was made.
- The 14 historical căn cước cấp xã records are excluded from the candidate catalog and preserved in the manifest with evidence. `NEEDS_LEGAL_REVIEW` records are represented but never imported as verified replacements.
- Source precedence is encoded as `IN_FORCE_LEGAL_INSTRUMENT` > `LATEST_TTHC_DECISION` > `OFFICIAL_APPENDIX` > `OFFICIAL_DVC` > `INTERNAL_GUIDE`.

## Code and data changes

- `data/tthc-legal-sources.json`: official registry, attachment URLs and hashes.
- `data/tthc-2026-refresh-manifest.json`: per-procedure status/provenance manifest.
- `lib/tthc-legal-refresh.js`: registry/manifest validation and blocked-record filtering.
- `scripts/validate-tthc-legal-refresh.js` and `scripts/apply-tthc-legal-refresh-to-catalog.js`: validation and dry-run-first local application.
- `scripts/generate-tthc-catalog.js`: applies the checked-in manifest when generation succeeds.
- `data/tthc-catalog.json` and `data/tthc-index.json`: local candidate output only; no production mutation.
- `data/qd1523-procedure-map.json`: 51 directly observed QĐ1523 annex rows (5 NEW, 39 AMENDED, 7 ABOLISHED), with code/name/domain/level/change/source locator/effective date for every row.
- `docs/tthc/QD1523_ANNEX_MAPPING.md`: scan limitations, precedence and count reconciliation.
- `scripts/validate-qd1523-mapping.js`: deterministic schema/hash/count validator; exposed as `npm run validate:qd1523-mapping`.
- `scripts/reconcile-tthc-legal-review.js`: deterministic re-review of every initial `NEEDS_LEGAL_REVIEW` record; exposed as `npm run reconcile:tthc-legal-review`.

## Validation

- `node scripts/validate-tthc-legal-refresh.js`: PASS (8 sources, 101 manifest records, `NO_PRODUCTION_MUTATION`).
- `node scripts/apply-tthc-legal-refresh-to-catalog.js --apply`: PASS and idempotent (78 -> 78, 15 historical records excluded).
- `node scripts/generate-tthc-catalog.js --source=backups`: BLOCKED because the checked-in backup inputs are intentionally absent from this checkout.
- `npm test`: PASS (677/677) in the clean worktree using the existing local dependency tree; no dependency was installed.
- `npm run build`: PASS (CSS, both Apps Script bundles, syntax/staff/rate-limit checks and static build).
- `npm run validate:qd1523-mapping`: PASS (51 observed rows; source hash verified; `NO_PRODUCTION_MUTATION`).
- QĐ1523 count reconciliation: PASS — 5 NEW unique procedures, 39 AMENDED authority rows, 36 AMENDED unique procedure codes, 3 permitted multi-authority codes (`1.009714`, `1.012564`, `1.014056`), 7 ABOLISHED unique procedures.
- `npm run ci`: BLOCKED at `npm audit --omit=dev --audit-level=high` by pre-existing `sharp <0.35.4` high advisory (plus five moderate transitive `uuid` findings); no dependency update was authorized.
- `npm ci --dry-run --ignore-scripts`: resolution-only check completed (would change 18 packages/remove 1); no install was performed against the shared dependency junction.
- `npm run test:e2e`: PASS (117/117) with system Chrome `C:\Program Files\Google\Chrome\Application\chrome.exe`, version `152.0.7977.83`, temporary Playwright profile, no browser download.
- Chatbot browser smoke: PASS (5/5: embed, full-procedure, region chips, narrow answer, comparison/deeplink scenarios).

## Blockers and next step

1. QĐ1523 declares 36 amended procedures. The annex has 39 authority-level rows because `1.009714`, `1.012564` and `1.014056` each apply at both provincial and commune levels. Therefore 39 authority rows represent 36 unique amended TTHC; no count contradiction remains.
2. Procedure names `1.013313` and `1.013314` were corrected against the National Public Service Portal; the reversed phrase “nhà ở đã có tranh chấp” is prohibited by regression validation.
3. The 39 remaining `NEEDS_LEGAL_REVIEW` entries are intentionally fail-closed and each has a concrete no-exact-identity reason. They require owner evidence, not a repeat of QĐ1523 count work.
4. `npm ci` was not rerun because this checkout uses a junction to the owner worktree's dependency tree; deleting/replacing it would mutate unrelated user state. Existing audit blocker remains pre-existing (`sharp` high, five `uuid` moderate).
5. Generator `--source=backups` remains blocked because approved backup inputs are absent; do not fabricate them. Obtain an approved reproducible input before production release.

`NO_PRODUCTION_MUTATION` remains the enforced state.
