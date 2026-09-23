# BANDOCAPT core project closure — 2026-09

## Verdict

`BANDOCAPT_CORE_PROJECT_CLOSURE_PASS`

The closure forward-port was pushed as `codex/core-project-closure`, merged by
PR #84, and deployed from the resulting `main` SHA.

## GitHub outcome

- PR #84: **MERGED**, merge commit
  `f28e911643814f2bc7180a03baf5a78fd8838480`.
- PRs #80, #81 and #82: **CLOSED as superseded by #84**.
- PR #60: **CLOSED as superseded** by current main and #84.
- PRs #67 and #76: **CLOSED as deferred optional modules**; neither was part of
  the core production rollout.
- Exact-head GitHub Actions run `35827809840`: **PASS**. It completed `npm ci`,
  `npm run ci`, Chromium installation and full E2E.

## Integrated changes

- Pinecone delta safety tooling with an exact APPLY guard for 5 inserts + 2
  updates. The live read-only dry-run is idempotent at 534 vectors / 768
  dimensions: `0 insert / 0 update / 0 delete / 7 unchanged` for the reviewed
  QĐ5230 scope. No mutation was performed during this closure round.
- Procedure/location intent routing with the location evidence gate preserved.
- Canonical location taxonomy and marker/label declutter forward-ported while
  preserving the existing main state arbiters.

## Validation

- `npm test`: **699/699 PASS**.
- Full Playwright E2E: **120/120 PASS** locally; CI full E2E also passed.
- Build-equivalent CSS, Apps Script bundles, static build, syntax, staff and
  rate-limit checks: **PASS**.
- `npm audit --omit=dev --audit-level=high`: exit 0; 7 known moderate `uuid`
  advisories remain, with no high-severity gate failure.

## Production deployment

- Deployment ID: `dpl_BCayxYFxruVnymiaaFENk3MABb7i`
- State: **READY**, target **production**
- Production commit SHA:
  `f28e911643814f2bc7180a03baf5a78fd8838480`
- GitHub `main` SHA and Vercel production commit SHA match exactly.

## Production smoke

- `GET https://bandocapt.vercel.app/`: HTTP 200.
- `GET /asset-manifest.json`: HTTP 200; hashed catalog assets resolved.
- Hashed catalog JSON: HTTP 200 and contains the QĐ5230 new procedure title.
- `GET /api/google-sheet`: HTTP 200.
- Direct chatbot calls without a Turnstile token remain rejected with the
  expected CAPTCHA guard; no bypass token was fabricated during smoke testing.

## Deferred modules

Accommodation Beta and Zalo Bot remain intentionally deferred. They were closed
with their history preserved and can be recreated from current main after an
explicit rollout decision.

No secrets, tokens, or private workbook fields are included in this report.
