# TTHC 2026 — QĐ 5230 final reconciliation

Task: `BANDOCAPT_TTHC_2026_QD5230_FINAL_RECONCILIATION`

This is the follow-up to `docs/tthc/TTHC_2026_QD5230_NEW_RECORDS_CLOSURE.md` (which ended
`BLOCKED_PRIMARY_SOURCE`). The owner supplied the actual text of QĐ5230's Phần I danh mục table
directly in this round's task instructions. This round uses that content to close the identity/
authority/count question definitively, and to determine the real catalog impact.

## VERDICT

`BANDOCAPT_QD5230_RECONCILIATION_PARTIAL`

Legal identity mapping (published rows, unique titles, authority distribution, OLD→NEW
replacement mapping) is now closed. Actual catalog impact is **not** closed: none of the 5 NEW
titles has procedure content (steps/dossier/fee/forms) available this round, so no
`data/tthc-catalog.json` record can responsibly be added yet — all 5 stay `UNRESOLVED` pending
Phần II.

## BASELINE

- Branch: `claude/tthc-2026-legal-audit-mi5fqz`
- Starting SHA: `b5d9637`
- Final SHA of this round: see commit created alongside this file
- PR: `#79`, state: **Draft** (stays Draft — see PR STATUS)

## PRIMARY SOURCE

- QĐ5230/QĐ-BCA-C06, 18/08/2026, "Quyết định về việc công bố thủ tục hành chính mới; thủ tục
  hành chính được sửa đổi, bổ sung và thủ tục hành chính bị bãi bỏ trong lĩnh vực cấp, quản lý
  căn cước thuộc thẩm quyền giải quyết của Bộ Công an."
- PDF status: **the binary PDF file was not present in this session's filesystem** (searched
  `/home`, `/tmp`, `/root` — not found). This round works from the **owner's direct transcription**
  of the PDF's `PHẦN I. DANH MỤC THỦ TỤC HÀNH CHÍNH > 1. Thủ tục hành chính mới` table, typed
  directly into the task instructions. This is treated as `PRIMARY_CONFIRMED` because it is the
  owner (who holds the actual document) relaying its content directly, not a secondary/press
  source — but it means only that one table was available, not the whole document.
- Sections used: Phần I, mục 1 (danh mục TTHC mới) — full 10-row table as given.
- Sections **not** available this round (and therefore not audited):
  - Phần II (nội dung cụ thể: trình tự, hồ sơ, phí, mẫu đơn, căn cứ pháp lý chi tiết cho 5 title
    NEW) — this is the piece needed to actually add catalog records.
  - Phần I, mục 2 (sửa đổi, bổ sung) full table — only 2 bare codes were given (`1.012564`,
    `1.014060`), no titles.
  - Phần I, mục 3 (bãi bỏ) full 28-row table — only the 14 rows already present in
    `data/tthc-2026-refresh-manifest.json` (from an earlier round, can_cuoc domain only) were
    available.

## CORRECTED NEW-PROCEDURE FACTS

| Fact | Value | Evidence quality |
|---|---|---|
| `PUBLISHED_NEW_ROWS` | **10** | `PRIMARY_CONFIRMED` |
| `UNIQUE_NEW_TITLES` | **5** | `PRIMARY_CONFIRMED` |
| Authority distribution | trung ương 2, tỉnh 3, xã 5 | `PRIMARY_CONFIRMED` |
| `UNIQUE_OFFICIAL_PROCEDURE_CODES` | **UNRESOLVED** | — |

The previous round's "08 unique procedure codes" hypothesis is **superseded** — it was built from
secondary sources and is wrong in the specific sense that there are 5 unique titles, not 8. It is
kept in the manifest tagged `SUPERSEDED_HYPOTHESIS` (not deleted), per audit-trail policy.

Official codes: QĐ5230's Phần I, mục 1 (NEW table) has no "Số hồ sơ TTHC" column — unlike mục 2
(AMENDED) and mục 3 (ABOLISHED), which both carry explicit codes (e.g. `1.012564`, `1.014060`,
`1.010095`). This is not a gap in reading — the source genuinely does not publish codes for the
NEW group. No code was invented.

## 10 AUTHORITY ROWS

| Title | Authority | Primary source | Status |
|---|---|---|---|
| T1 Cấp, cấp đổi, cấp lại thẻ căn cước | Trung ương | owner PDF transcription | PRIMARY_CONFIRMED |
| T1 Cấp, cấp đổi, cấp lại thẻ căn cước | Tỉnh | owner PDF transcription | PRIMARY_CONFIRMED |
| T1 Cấp, cấp đổi, cấp lại thẻ căn cước | Xã | owner PDF transcription | PRIMARY_CONFIRMED |
| T2 Khai thác thông tin của công dân, người gốc VN chưa xác định quốc tịch trong CSDL quốc gia về dân cư | Trung ương | owner PDF transcription | PRIMARY_CONFIRMED |
| T2 (as above) | Tỉnh | owner PDF transcription | PRIMARY_CONFIRMED |
| T2 (as above) | Xã | owner PDF transcription | PRIMARY_CONFIRMED |
| T3 Khai thác thông tin của công dân, người gốc VN chưa xác định quốc tịch trong CSDL căn cước | Tỉnh | owner PDF transcription | PRIMARY_CONFIRMED |
| T3 (as above) | Xã | owner PDF transcription | PRIMARY_CONFIRMED |
| T4 Thu thập, cập nhật thông tin sinh trắc học về ADN, giọng nói vào CSDL căn cước | Xã | owner PDF transcription | PRIMARY_CONFIRMED |
| T5 Thu thập, cập nhật, điều chỉnh thông tin người gốc VN chưa xác định quốc tịch vào CSDL quốc gia về dân cư, CSDL căn cước và cấp/cấp đổi/cấp lại giấy chứng nhận căn cước | Xã | owner PDF transcription | PRIMARY_CONFIRMED |

10/10 rows accounted for. Sum verified programmatically (`validateQd5230NewProcedures`).

## 5 UNIQUE TITLES

| Title | Authorities | Existing catalog match | Action |
|---|---|---|---|
| T1 Cấp, cấp đổi, cấp lại thẻ căn cước | TW, tỉnh, xã | NONE (checked exact/normalized/keyword against all 78) | UNRESOLVED — content pending |
| T2 Khai thác thông tin công dân + người gốc VN... CSDL quốc gia về dân cư | TW, tỉnh, xã | NONE | UNRESOLVED — content pending |
| T3 Khai thác thông tin công dân + người gốc VN... CSDL căn cước | tỉnh, xã | NONE | UNRESOLVED — content pending |
| T4 Thu thập, cập nhật sinh trắc học ADN, giọng nói vào CSDL căn cước | xã | NONE | UNRESOLVED — content pending |
| T5 Thu thập/cập nhật/điều chỉnh thông tin người gốc VN... + cấp/cấp đổi/cấp lại giấy chứng nhận căn cước | xã | NONE | UNRESOLVED — content pending |

No fuzzy auto-merge was used. Similarity was checked by exact title, normalized title, and
targeted keyword scan (`cấp đổi`, `cấp lại thẻ căn cước`, `ADN`, `giọng nói`, `sinh trắc học`,
`người gốc Việt Nam`, `khai thác thông tin`) against the live 78-record catalog — zero hits.

## OLD → NEW REPLACEMENT MAP

The catalog previously held 14 can_cuoc procedures (all cấp xã) already marked `ABOLISHED` with
`legal_basis: ["5230/QĐ-BCA-C06"]` from an earlier round, each honestly carrying
`new_procedure_id: null` ("không suy đoán thủ tục thay thế"). This round maps them to the 5 NEW
titles by exact decomposition of their subject/action/object phrasing — every one of the 14 old
titles accounts for exactly one new title, with zero leftover and zero double-assignment
(mechanically verified by the new validator):

| Old code (procedure_id slug) | Old title | Authority | New replacement | Evidence |
|---|---|---|---|---|
| cap-doi-the-can-cuoc | Cấp đổi thẻ căn cước | xã | T1 | STRONG_INFERENCE_TITLE_DECOMPOSITION |
| cap-lai-the-can-cuoc | Cấp lại thẻ căn cước | xã | T1 | STRONG_INFERENCE_TITLE_DECOMPOSITION |
| cap-the-can-cuoc-cho-nguoi-duoi-14-tuoi | Cấp thẻ căn cước cho người dưới 14 tuổi | xã | T1 | STRONG_INFERENCE_TITLE_DECOMPOSITION |
| cap-the-can-cuoc-cho-nguoi-tu-du-14-tuoi-tro-len | Cấp thẻ căn cước cho người từ đủ 14 tuổi trở lên | xã | T1 | STRONG_INFERENCE_TITLE_DECOMPOSITION |
| khai-thac-thong-tin-cong-dan-trong-co-so-du-lieu-quoc-gia-ve-dan-cu | Khai thác thông tin công dân trong CSDL quốc gia về dân cư | xã | T2 | STRONG_INFERENCE_TITLE_DECOMPOSITION |
| khai-thac-thong-tin-nguoi-goc-viet-nam-chua-xac-dinh-duoc-quoc-tich-trong-co-so-du-lieu-quoc-gia-ve-dan-cu | Khai thác thông tin người gốc VN chưa xác định quốc tịch trong CSDL quốc gia về dân cư | xã | T2 | STRONG_INFERENCE_TITLE_DECOMPOSITION |
| khai-thac-thong-tin-cua-cong-dan-trong-co-so-du-lieu-can-cuoc | Khai thác thông tin của công dân trong CSDL căn cước | xã | T3 | STRONG_INFERENCE_TITLE_DECOMPOSITION |
| khai-thac-thong-tin-nguoi-goc-viet-nam-chua-xac-dinh-duoc-quoc-tich-trong-co-so-du-lieu-can-cuoc | Khai thác thông tin người gốc VN chưa xác định quốc tịch trong CSDL căn cước | xã | T3 | STRONG_INFERENCE_TITLE_DECOMPOSITION |
| thu-thap-cap-nhat-thong-tin-sinh-trac-hoc-ve-adn-vao-co-so-du-lieu-ve-can-cuoc | Thu thập, cập nhật thông tin sinh trắc học về ADN vào CSDL về căn cước | xã | T4 | STRONG_INFERENCE_TITLE_DECOMPOSITION |
| thu-thap-cap-nhat-thong-tin-sinh-trac-hoc-ve-giong-noi-vao-co-so-du-lieu-ve-can-cuoc | Thu thập, cập nhật thông tin sinh trắc học về giọng nói vào CSDL về căn cước | xã | T4 | STRONG_INFERENCE_TITLE_DECOMPOSITION |
| cap-doi-giay-chung-nhan-can-cuoc | Cấp đổi giấy chứng nhận căn cước | xã | T5 | STRONG_INFERENCE_TITLE_DECOMPOSITION |
| cap-lai-giay-chung-nhan-can-cuoc | Cấp lại giấy chứng nhận căn cước | xã | T5 | STRONG_INFERENCE_TITLE_DECOMPOSITION |
| dieu-chinh-thong-tin-...-nguoi-goc-viet-nam-chua-xac-dinh-duoc-quoc-tich | Điều chỉnh thông tin trong CSDL quốc gia về dân cư, CSDL căn cước theo đề nghị của người gốc VN chưa xác định quốc tịch | xã | T5 | STRONG_INFERENCE_TITLE_DECOMPOSITION |
| thu-thap-cap-nhat-thong-tin-cua-nguoi-goc-viet-nam-...-cap-giay-chung-nhan-can-cuoc | Thu thập, cập nhật thông tin của người gốc VN chưa xác định quốc tịch vào CSDL quốc gia về dân cư, CSDL căn cước và cấp giấy chứng nhận căn cước | xã | T5 | STRONG_INFERENCE_TITLE_DECOMPOSITION |

This is a genuine **CONSOLIDATION**, not a simple `+5`: 14 old, separately-published procedures
(split by subject — "công dân" vs "người gốc Việt Nam chưa xác định được quốc tịch" — and by
action — cấp/cấp đổi/cấp lại, or by data type — ADN/giọng nói) are consolidated into 5 combined
titles. `STRONG_INFERENCE_TITLE_DECOMPOSITION` (not `PRIMARY_CONFIRMED`) because this is a
structural reconstruction from phrase components, not a literal replacement statement quoted from
Phần II (not available this round).

Correction to the prior round: the prior round flagged "Khai thác thông tin công dân trong CSDL
căn cước" as a *misleading lead* possibly belonging to QĐ1523 rather than QĐ5230. That caution is
now superseded — the manifest's own pre-existing record for this exact old title already carried
`legal_basis: ["5230/QĐ-BCA-C06"]`, `classification: ABOLISHED`, from an earlier round's direct
appendix reading, and it maps cleanly into T3 with no leftover. The prior round's caution is
retained in the manifest tagged `SUPERSEDED_HYPOTHESIS`, not deleted.

## AMENDED CODES (1.012564, 1.014060)

| Code | Found in QĐ1523 map | Title | Relation to 5 NEW titles |
|---|---|---|---|
| `1.012564` | Yes (tỉnh + xã) | "Điều chỉnh thông tin trong CSDL quốc gia về dân cư theo đề nghị của **công dân**" | **Not** one of the 5 NEW titles — different subject ("công dân" vs "người gốc Việt Nam chưa xác định được quốc tịch" in T2/T5). Likely QĐ5230 further amends the same QĐ1523-amended procedure, but as a separate AMENDED record. Not double-counted into NEW. |
| `1.014060` | No | UNRESOLVED | Not one of the 5 NEW titles (QĐ5230's NEW table has no codes at all, and the task's own facts list this code under the separate AMENDED group). Title unresolved with data available this round. |

## OFFICIAL CODE STATUS

QĐ5230's Phần I mục 1 (NEW table) genuinely does not publish a "Số hồ sơ TTHC" column for the 5
new titles — this is confirmed by contrast with mục 2 and mục 3 of the same document, which do
carry codes. This is a real gap in the source itself, not a reading gap. No code was invented for
any of T1–T5.

Catalog schema check: `data/tthc-catalog.json` procedures use an internal slug `procedureId`
(e.g. `guide:can-cuoc:...`) and have **no** `official_code` field at all in the current schema.
So the missing official code does **not**, by itself, block adding a catalog record — what blocks
it is missing procedure **content** (see below). No schema change was made or proposed.

A single external lead was found and rejected: `dichvucong.gov.vn` lists code `1.000889` for
"Cấp đổi thẻ căn cước (thực hiện tại cấp trung ương)" — its title does not exactly match T1's
combined title ("Cấp, cấp đổi, cấp lại thẻ căn cước"), so per the task's own matching rule
(title + authority + content must all match) this was **not** accepted as T1's code. Recorded as
`OFFICIAL_CODE_PENDING_EXTERNAL_REGISTRY`, not adopted.

## CATALOG IMPACT

| Component | Count |
|---|---:|
| Existing canonical | 78 |
| New canonical records added | 0 |
| Existing records updated | 0 |
| Existing records merged/replaced | 0 (14 old records already correctly ABOLISHED; now annotated with resolved successor title, still 0 live catalog records) |
| Abolished records removed from current view | 14 (already excluded before this round) |
| Code-pending legal records | 0 (code is not the blocker) |
| Final canonical current count | **78** |

`data/tthc-catalog.json` was **not** mutated this round. All 5 titles have `title` + `authority`
at `PRIMARY_CONFIRMED`, but `procedure_content` is `UNRESOLVED` (Phần II not provided) — per the
task's own gate, `ADD_NEW` requires all three at sufficient strength. Catalog stays 78 → 78.

## MANIFEST CHANGES

- `data/tthc-2026-refresh-manifest.json`:
  - `known_missing_procedures[0]`: prior hypotheses (`count_discrepancy`, `candidate_new_procedure_names`)
    tagged `SUPERSEDED_HYPOTHESIS` (kept, not deleted). New `qd5230_final_reconciliation` block added
    with the 5 titles, authority distribution, OLD→NEW mapping, AMENDED-code review, and catalog
    impact summary. `status` changed from `UNRESOLVED_PRIMARY_TEXT_NOT_ACCESSIBLE` to
    `LEGAL_IDENTITY_RESOLVED_CATALOG_CONTENT_PENDING`.
  - 14 `ABOLISHED` can_cuoc records (legal_basis `5230/QĐ-BCA-C06`): each got a new
    `qd5230_successor` annotation (resolved title, authority levels, mapping confidence,
    `catalog_status: NOT_YET_ADDED_CONTENT_PENDING`). `new_procedure_id` left `null` — no real
    catalog record exists yet, so no fabricated pointer was written.
  - No `records[]` entries were added, removed, or reclassified. No official codes invented.
- `lib/tthc-legal-refresh.js`: new `validateQd5230NewProcedures(manifest, qd1523Map)` — derives
  and checks (from manifest data, not hardcoded): row/title sum, authority distribution, no
  fabricated official codes, all 14 abolished-by-5230 records mapped exactly once, and a guard
  against any NEW title exactly colliding with a QĐ1523 official name (conflation check).
- `scripts/validate-tthc-legal-refresh.js`: wired in the new validator; output now also reports
  `qd5230PublishedNewRows` / `qd5230UniqueNewTitles`.
- `test/tthc-legal-refresh.test.js`: new test exercising the validator and the 14/14 mapping
  invariant.

## VALIDATORS

`node scripts/validate-tthc-legal-refresh.js` → PASS:
```
{"sources":16,"explicitRecords":101,"qd5230PublishedNewRows":10,"qd5230UniqueNewTitles":5,"productionMutation":"NO_PRODUCTION_MUTATION"}
```
`npm run validate:qd1523-mapping` → PASS (unchanged): 39 authority rows / 36 unique codes / 3
cross-authority duplicates — confirms QĐ1523 data was not touched or conflated with QĐ5230.

## TESTS

`npm test` → **678/678 PASS** (677 baseline + 1 new QĐ5230 reconciliation test). Number increased
from the stated baseline because a test was added this round — reporting the new number, not the
old one, per task instructions.

## BUILD

`npm run build` → PASS (CSS, Apps Script bundles, syntax checks, static build all exit 0).

## CI / E2E

No runtime or catalog-serving code changed this round (only manifest data + a validator + a
test). No full local E2E rerun was performed for that reason. GitHub Actions CI on this round's
exact new head will be checked after push, per task section 21; result reported once available
rather than assumed.

## FILES CHANGED

- `data/tthc-2026-refresh-manifest.json`
- `lib/tthc-legal-refresh.js`
- `scripts/validate-tthc-legal-refresh.js`
- `test/tthc-legal-refresh.test.js`
- `docs/tthc/TTHC_2026_QD5230_FINAL_RECONCILIATION.md` (this file, new)
- `docs/brain/06-ai-working-log.md`

## PR STATUS

PR #79 stays **Draft**. Per section 22: catalog impact for the 5 NEW titles is still
`UNRESOLVED` (content pending), which is a "canonical catalog vẫn không thể xác định" condition —
Draft is the correct state until Phần II content lets these become real `ADD_NEW` catalog
records (or until the owner decides differently).

## PRODUCTION SAFETY

`NO_PRODUCTION_MUTATION` — no Pinecone re-embed/update/promote, no chatbot change, no Vercel
deploy, no location-corpus change. Pinecone candidate stays 78; production Pinecone stays 529.

## REMAINING RISKS

- The 5 NEW titles cannot become real catalog entries without Phần II content (steps, dossier,
  fee, forms, legal basis detail) — this round could not obtain that text.
- The OLD→NEW mapping is `STRONG_INFERENCE_TITLE_DECOMPOSITION`, not a literal quote from the
  source's own replacement statement (Phần II not available) — worth a quick primary-text
  cross-check once Phần II is available, even though the decomposition currently accounts for
  all 14 old titles with zero ambiguity.
- `1.014060`'s title is still completely unknown.
- The `1.012564` AMENDED-vs-QĐ1523 relationship is a plausible read (`PRIMARY_PARTIAL`), not
  independently confirmed against QĐ5230's own mục 2 text.
- The rest of the manifest (39 pre-existing `NEEDS_LEGAL_REVIEW` records outside this can_cuoc/
  QĐ5230 scope) was intentionally not touched this round, per the task's own narrow-scope
  instruction.

## NEXT STEP

Legal completeness is **not yet PASS**. The concrete next step is narrow and specific: obtain
Phần II of QĐ5230 (the detailed content section) for the 5 NEW titles — either by the owner
pasting/attaching that section directly (as they did for Phần I this round), or by primary-source
network access this session does not have — so the 5 `UNRESOLVED` catalog actions can become real
`ADD_NEW` records with full procedure content. Do not propose `OWNER REVIEW / MERGE PR #79` or
any Pinecone step until that catalog impact is actually resolved.
