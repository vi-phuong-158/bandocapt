# Chatbot embed host — implementation log

## Initial worktree status (2026-07-26)

Recorded before implementation with `git status --short`:

```text
 M DESIGN_SYSTEM.md
 M api/chat.js
 M docs/brain/00-project-overview.md
 M docs/brain/01-architecture.md
 M docs/brain/03-decisions.md
 M docs/brain/04-current-tasks.md
 M docs/brain/05-testing-and-deploy.md
 M docs/brain/06-ai-working-log.md
 D presentation/Ban-do-Cong-an-so-Phu-Tho-V2.pptx
 M presentation/Ban-do-Cong-an-so-Phu-Tho.pptx
 M presentation/Ban-doc-lien-mach-Ban-do-Cong-an-so.md
 M test/p0-fixes.test.js
 M test/t2b-t2c.test.js
?? presentation/Ban-do-Cong-an-so-Phu-Tho-2.pptx
?? presentation/Ban-do-Cong-an-so-Phu-Tho-poster-A3.png
?? presentation/asset/poster-bg-ai-20260722.png
?? presentation/asset/poster-qr-bandocapt.png
?? presentation/build_poster.js
?? presentation/preview/
```

These pre-existing changes are preserved. In particular, `api/chat.js` is dirty and outside this host-only task, so it will not be modified.

## Scope

Create a standalone `/chat-embed.html` chatbot host for a future `capphutho` iframe integration. This step does not modify `capphutho`, the chat API contract, RAG, Turnstile configuration, telemetry, or the existing `index.html` chatbot UI.

## Files created

- `chat-embed.html` — standalone chat-only shell. It retains the DOM IDs used by the existing chatbot, but excludes the map, floating launcher, mobile navigation, and procedure catalog.
- `styles/chat-embed.css` — full-height iframe layout with one chat-history scroll area and no horizontal overflow.
- `js/chat-embed.js` — independent, sequential bootstrap for marked, DOMPurify, the existing Gemini adapter, the existing chatbot UI, and Turnstile. It accepts only `client=capphutho` and emits only safe READY/CAPTCHA_READY/ERROR events to the verified production parent origin.
- `test/chat-embed-config.test.js` — validates client allowlisting, concrete postMessage target origin, no catalog load, two fixed HTML build entries, and generated asset references.
- `test/e2e/chat-embed.spec.js` — browser coverage for direct embed opening, chat-only DOM, auto-open, main-page availability, and 360px overflow.

## Files modified

- `scripts/build-static.js` — adds the embed files as static inputs and introduces `ENTRY_HTML` so both `index.html` and `chat-embed.html` remain fixed entry filenames while all dependent assets remain content-hashed.
- `package.json` — includes `js/chat-embed.js` in the existing syntax check.
- `vercel.json` — gives only `/chat-embed.html` a no-cache, narrow CSP that allows `https://capphutho.vercel.app` as a frame ancestor. The catch-all CSP is made non-overlapping, so it continues to set `frame-ancestors 'none'` for the main site.

## Why no existing chatbot/API file was modified

No technical blocker required changing `api/chat.js`, `api/feedback.js`, `js/gemini.js`, `js/chatbot.js`, catalog/navigation/map files, request security, RAG, or data. The adapter loads the existing same-origin frontend modules and preserves the existing `/api/chat` request body and Turnstile flow.

`docs/brain/06-ai-working-log.md` is both outside the explicitly allowed file set and pre-existing dirty worktree state, so it was deliberately not edited. This file is the task-required implementation log instead.

## Test commands and results

| Command | Result |
|---|---|
| `node --check js/chat-embed.js` | PASS |
| `node --test test/chat-embed-config.test.js` | PASS: 3/3 |
| `node --test test/chat-embed-config.test.js test/google-sheet.test.js` | PASS: 8/8; confirms existing Vercel cache-policy test still passes |
| `npm run check:syntax` | PASS |
| `node scripts/build-static.js` | PASS: `22` inputs, `20` hashed assets |
| `npm test` | BLOCKED by missing installed dependencies: `dotenv`, `@pinecone-database/pinecone`, `@vercel/functions`, `sharp`; the new embed tests pass within that command. |
| `npm run build` | BLOCKED before static build by missing `node_modules/tailwindcss/lib/cli.js`. |
| `npm run test:e2e` | BLOCKED because it invokes `npm run build`, which is blocked by the missing Tailwind CLI. Playwright itself was therefore not reached. |

## Manual static-artifact verification

- `dist/index.html`, `dist/chat-embed.html`, and `dist/asset-manifest.json` exist.
- `dist/chat-embed.html` references existing hashed files for `tokens.css`, `output.css`, `styles.css`, `styles/chat-embed.css`, `assets/icon-128.webp`, and `js/chat-embed.js`.
- Neither `dist/chat-embed.html` nor its hashed bootstrap JS refers to `app.js`, `data.js`, `app-navigation.js`, `location-data.js`, or `tthc-catalog.js`.

## Limitations / not implemented

- No change was made in `capphutho`; iframe mounting and parent-side fallback are a later step.
- Phase 1 intentionally does not receive ASK/NAVIGATE/RESET/SET_LOCALE messages and does not send conversation or Turnstile tokens to a parent.
- E2E has been authored but cannot be executed until dependencies (and then Playwright browser availability) are restored.

## Final worktree status

`git status --short` after implementation:

```text
 M DESIGN_SYSTEM.md
 M api/chat.js
 M docs/brain/00-project-overview.md
 M docs/brain/01-architecture.md
 M docs/brain/03-decisions.md
 M docs/brain/04-current-tasks.md
 M docs/brain/05-testing-and-deploy.md
 M docs/brain/06-ai-working-log.md
 M package.json
 D presentation/Ban-do-Cong-an-so-Phu-Tho-V2.pptx
 M presentation/Ban-do-Cong-an-so-Phu-Tho.pptx
 M presentation/Ban-doc-lien-mach-Ban-do-Cong-an-so.md
 M scripts/build-static.js
 M test/p0-fixes.test.js
 M test/t2b-t2c.test.js
 M vercel.json
?? HOST_IMPLEMENTATION_LOG.md
?? chat-embed.html
?? js/chat-embed.js
?? presentation/Ban-do-Cong-an-so-Phu-Tho-2.pptx
?? presentation/Ban-do-Cong-an-so-Phu-Tho-poster-A3.png
?? presentation/asset/poster-bg-ai-20260722.png
?? presentation/asset/poster-qr-bandocapt.png
?? presentation/build_poster.js
?? presentation/preview/
?? styles/
?? test/chat-embed-config.test.js
?? test/e2e/chat-embed.spec.js
```

The changes attributable to this task are `package.json`, `scripts/build-static.js`, `vercel.json`, the four new host assets/tests, and this log. All other listed changes were present before the task and were left untouched.

## Hardening review fixes

### Files changed in this review

- `chat-embed.html` — restores the Be Vietnam Pro and Material Symbols font links used by `index.html`; adds the initial `aria-expanded="false"` and `aria-hidden="true"` states expected by the existing chatbot UI.
- `js/chat-embed.js` — separates UI bootstrap from Turnstile bootstrap, restores the existing CDN SRI values, and reports Turnstile failure/timeout safely.
- `test/chat-embed-config.test.js` — adds sandboxed behavior tests for SRI, UI-ready order, one-time captcha ready, safe payloads, and safe error codes.
- `test/e2e/chat-embed.spec.js` — delays Turnstile callback and verifies the UI opens first, the input stays disabled until the callback, then enables without overflow.
- `HOST_IMPLEMENTATION_LOG.md` — this record.

### Bootstrap order

1. Load Marked (SRI `sha384-H+hy9ULve6xfxRkWIh/YOtvDdpXgV2fmAGQkIDTxIgZwNoaoBal14Di2YTMR6MzR`) and DOMPurify (SRI `sha384-6gdBb4YMPz19eGx6Wf1vmT47Jh7wZArqJc84JuA3BRnoZQwt/X5qLfIip51LgpB/`) with `crossOrigin='anonymous'`.
2. Load the unchanged `js/gemini.js`, then unchanged `js/chatbot.js`.
3. Confirm `ChatbotUI.open`, open the UI, and send `BANDOCAPT_CHAT_READY`.
4. Only then load Turnstile. A usable token plus enabled input sends one `BANDOCAPT_CHAT_CAPTCHA_READY`.
5. A Turnstile load failure sends `TURNSTILE_LOAD_FAILED`; a 30-second token wait sends `CAPTCHA_TIMEOUT`. Both preserve the open UI and expose no stack, token, or conversation data to the parent.

### Dependency restoration

`package-lock.json` existed while required packages were absent from `node_modules`; `npm ci` was run as instructed. It installed 375 packages. It did **not** modify `package.json` or `package-lock.json`; `package.json` remains modified solely by the earlier host syntax-check change.

### Tests

| Command | Result |
|---|---|
| `node --check js/chat-embed.js` | PASS |
| `node --test test/chat-embed-config.test.js` | PASS: 5/5 |
| `npm run check:syntax` | PASS |
| `npm test` | PASS: 313/313 |
| `npm run build` | PASS |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'; npm run test:e2e` | PASS: 18/18 |

Post-build checks passed: both HTML entries and `asset-manifest.json` exist; every internal embed `href`/`src` resolves; the generated embed JS references the hashed Gemini and chatbot files; and it contains none of the map/catalog/navigation runtime assets.

### Diff and status

Tracked task-file diff statistic at the time of review:

```text
 package.json            |  2 +-
 scripts/build-static.js | 10 +++++++---
 vercel.json             | 23 ++++++++++++++++++++++-
 3 files changed, 30 insertions(+), 5 deletions(-)
```

`git status --short --untracked-files=all` was run after the review. The task-owned entries are `HOST_IMPLEMENTATION_LOG.md`, `chat-embed.html`, `js/chat-embed.js`, `styles/chat-embed.css`, `test/chat-embed-config.test.js`, and `test/e2e/chat-embed.spec.js`, plus the prior tracked host changes to `package.json`, `scripts/build-static.js`, and `vercel.json`. The remaining modified/deleted/untracked docs, API, tests, and presentation files are the pre-existing worktree changes recorded above and were not touched.
