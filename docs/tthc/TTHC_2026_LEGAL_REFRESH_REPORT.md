# TTHC 2026 legal refresh report

## Verdict

`BANDOCAPT_TTHC_2026_LEGAL_REFRESH_BLOCKED_ANNEX_RECONCILIATION_AND_RUNTIME_GATES`

The refresh is isolated in a clean sibling worktree from `origin/main` and is fail-closed. No candidate data is eligible for production import until the remaining legal reconciliation and runtime gates pass.

## Worktree and baseline

- Clean worktree: `D:\\04. Github\\bandocapt-tthc-refresh`.
- Branch: `feat/tthc-2026-legal-refresh`.
- Base: `origin/main` at `7729726f628f9f7c0949792ce74c30b05cb8f7ce`.
- Original dirty worktree and owner changes were preserved; no reset, stash, commit, push, PR, Pinecone write, namespace mutation, Vercel change or deploy was performed.

## Official sources and attachments

`data/tthc-legal-sources.json` records eight official Ministry of Public Security sources with issuer, issue/effective dates, precedence and official URLs. The following public attachments were downloaded and SHA-256 recorded:

- QĐ 1523 appendix PDF: `2EA06491E4700EA3C851E9022F94EA0BAFBB72B3522546FC840982988D3D9946`.
- QĐ 4245 decision PDF: `AC0799AFFBB25E6E4A7C2C272975AF5E32D412135310F02F9814F4A51910E168`.
- QĐ 4245 danh mục DOCX: `E731FB908A20274F16ABE73CD2CF4D72082C05B34D039C94825B3308B7A05EC1`.
- QĐ 5230 decision PDF: `8C741FE1AAFEFB11622DC486BBA76EFEFC3BA8CA408643816BA39F82E638728D`.

The QĐ 4245 DOCX was text-extracted and confirms eight amended IDs (`1.001471`, `2.000539`, `1.010382`, `2.00048`, `1.001456`, `1.001445`, `1.010384`, `1.010386`) and one abolished ID (`1.010385`). QĐ 5230 PDF pages were rendered and visually inspected; its public article says “08 new” while the article body enumerates ten new procedures, so the PDF annex remains the canonical source and the discrepancy is explicitly unresolved rather than guessed.

## Per-procedure manifest and catalog audit

- Baseline catalog: 92 procedures.
- Final candidate catalog after fail-closed filtering: 78 procedures.
- Manifest: 101 unique records covering every baseline procedure plus official QĐ 4245 procedure IDs not represented by the legacy slug catalog.
- Manifest classifications: 15 `ABOLISHED` (14 căn cước cấp xã + 1 QĐ 4245 cấp huyện), 10 `AMENDED` (2 QĐ 5230 căn cước + 8 QĐ 4245 xuất nhập cảnh), 76 `NEEDS_LEGAL_REVIEW`.
- The 14 historical căn cước cấp xã records are excluded from the candidate catalog and preserved in the manifest with evidence. `NEEDS_LEGAL_REVIEW` records are represented but never imported as verified replacements.
- Source precedence is encoded as `IN_FORCE_LEGAL_INSTRUMENT` > `LATEST_TTHC_DECISION` > `OFFICIAL_APPENDIX` > `OFFICIAL_DVC` > `INTERNAL_GUIDE`.

## Code and data changes

- `data/tthc-legal-sources.json`: official registry, attachment URLs and hashes.
- `data/tthc-2026-refresh-manifest.json`: per-procedure status/provenance manifest.
- `lib/tthc-legal-refresh.js`: registry/manifest validation and blocked-record filtering.
- `scripts/validate-tthc-legal-refresh.js` and `scripts/apply-tthc-legal-refresh-to-catalog.js`: validation and dry-run-first local application.
- `scripts/generate-tthc-catalog.js`: applies the checked-in manifest when generation succeeds.
- `data/tthc-catalog.json` and `data/tthc-index.json`: local candidate output only; no production mutation.

## Validation

- `node scripts/validate-tthc-legal-refresh.js`: PASS (8 sources, 101 manifest records, `NO_PRODUCTION_MUTATION`).
- `node scripts/apply-tthc-legal-refresh-to-catalog.js --apply`: PASS (92 -> 78, 14 excluded).
- `node scripts/generate-tthc-catalog.js --source=backups`: BLOCKED because the checked-in backup inputs are intentionally absent from this checkout.
- `npm test`: PASS (675/675) in the clean worktree using the existing local dependency tree; no dependency was installed.
- `npm run build`: PASS (CSS, both Apps Script bundles, syntax/staff/rate-limit checks and static build).
- `npm run ci`: BLOCKED at `npm audit --omit=dev --audit-level=high` by pre-existing `sharp <0.35.4` high advisory (plus five moderate transitive `uuid` findings); no dependency update was authorized.
- `npm run test:e2e`: 116/117 passed; one `panel-state-arbiter` timing failure. The failed test passed on an immediate focused rerun (1/1), while a full retry run was interrupted after test 15 to avoid an unbounded runtime. Chatbot browser scenarios themselves passed.

## Blockers and next step

1. Reconcile the QĐ 5230 article/PDF “new procedure” count from the full annex and map all new/amended official codes before candidate import.
2. Restore an approved, reproducible catalog input (live Pinecone export or reviewed backup artifact) to remove the generator-input blocker; do not fabricate backup files.
3. Complete one uninterrupted full E2E run (or accept the documented flaky timing result), then obtain an explicit production-release decision.

`NO_PRODUCTION_MUTATION` remains the enforced state.
