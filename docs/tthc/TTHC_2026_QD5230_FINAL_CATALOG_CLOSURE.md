# TTHC 2026 — QĐ 5230 final catalog closure

Task: `BANDOCAPT_TTHC_2026_QD5230_FINAL_CATALOG_CLOSURE`

Follow-up to `docs/tthc/TTHC_2026_QD5230_FINAL_RECONCILIATION.md` (legal identity closed, catalog
content pending). This round used the owner-provided PDF's **Phần II** (full procedure content)
to close the actual catalog impact.

## VERDICT

`BANDOCAPT_TTHC_2026_LEGAL_COMPLETENESS_PASS_READY_FOR_OWNER_REVIEW`

## BASELINE

- Branch: `claude/tthc-2026-legal-audit-mi5fqz`
- Starting SHA: `7058a04`
- Final SHA of this round: see commit created alongside this file
- PR: `#79` — proposed for **Ready for Review** (owner decides; not self-merged)

## PRIMARY SOURCE

- File: `/root/.claude/uploads/9eb029a3-f641-5a70-9958-5b560aa6c7e2/c3808d08-5230.pdf`, confirmed
  present in this session's filesystem (72 pages, PDF 1.4, image-only scan with no extractable
  text layer — `pdftotext` returned 0 bytes; `poppler-utils` was installed this round to enable
  page-image rendering, then all 72 pages were read visually page-by-page).
- Parts/pages used: **all 72 pages** — Phần I (danh mục, mục 1/2/3, pages 3–13), Phần II (nội dung
  cụ thể từng thủ tục mới cấp Trung ương/tỉnh/xã và 2 thủ tục sửa đổi, pages 13–70), Phần III
  (danh sách mẫu đơn, page 70).

## PART I RECONCILIATION

Confirmed unchanged from the prior round, now directly re-verified against the actual PDF table:
`PUBLISHED_NEW_ROWS = 10`, `UNIQUE_NEW_TITLES = 5`, authority distribution 2 trung ương + 3 tỉnh +
5 xã — all `PRIMARY_CONFIRMED`. The bãi bỏ (mục 3) table was also read in full for the first time:
**28 old procedures bãi bỏ** (6 trung ương + 8 tỉnh + 14 xã), each with a real official code —
previously only the 14 xã-level ones (without codes) were known.

## PART II EXTRACTION

| Title | Authority | Dossier | Time | Fee | Result | Legal basis |
|---|---|---|---|---|---|---|
| T1 Cấp, cấp đổi, cấp lại thẻ căn cước | TW/tỉnh/xã (same content, 4 sub-cases a-d in one Phần II section) | CC01, DC02 (+DC01 nếu chưa có dữ liệu) | 07 ngày (05 ngày nếu trực tuyến toàn trình, mất/hỏng) | Miễn phí (sắp xếp ĐVHC); 50.000đ đổi / 70.000đ lại (giảm 50% đến 31/12/2026); miễn phí qua DVC trực tuyến với định danh mức 2 (15/8/2026–28/02/2027) | Thẻ căn cước | Luật CC 26/2023 sửa Luật 118/2025; NĐ70/2024 sửa NĐ58/2026; TT61/2025 sửa TT120/2026; TT17/2024 sửa TT53/2025+TT118/2026; TT16/2024; TT73/2024/TT-BTC; TT64/2025/TT-BTC; TT117/2026/TT-BTC |
| T2 Khai thác TT công dân, người gốc VN... CSDL quốc gia về dân cư | TW/tỉnh/xã (same content, 2 sub-cases) | DC02 + giấy tờ chứng minh | 03 ngày | Theo TT48/2022/TT-BTC | Phiếu cung cấp TT (DC03) | Luật CC; NĐ70/2024 sửa NĐ58/2026; TT61/2025; TT17/2024; TT117/2026/TT-BCA; TT48/2022/TT-BTC |
| T3 Khai thác TT công dân, người gốc VN... CSDL căn cước | tỉnh/xã (same content, 2 sub-cases) | DC02 + giấy tờ chứng minh | 03 ngày | Chưa quy định | Phiếu cung cấp TT (DC03) | như T2, trừ TT48/2022 (không áp dụng CSDL căn cước) |
| T4 Thu thập, cập nhật TT sinh trắc ADN, giọng nói vào CSDL căn cước | xã | DC02 (+ giấy tờ xác thực kết quả nếu có, + cam kết sức khỏe cho case đặc biệt) | 07 ngày | Chưa quy định | Thông báo kết quả | Luật CC; NĐ70/2024 sửa NĐ58/2026 (khoản 5 Điều 13); TT61/2025; TT17/2024; TT117/2026/TT-BCA |
| T5 Thu thập/cập nhật/điều chỉnh TT người gốc VN... + cấp/đổi/lại giấy chứng nhận CC | xã (3 sub-cases: thu thập trong phạm vi TỈNH; đổi/lại trong CẢ NƯỚC) | CC01 (+DC01 case a; +DC02+giấy tờ nếu có thay đổi case b/c) | 15 ngày (case a, không tính xác minh); 07 ngày (case b, c) | Không thu lệ phí | Giấy chứng nhận căn cước | như T4 |

Cả 2 thủ tục AMENDED cũng đọc đầy đủ: `1.012564` "Điều chỉnh thông tin trong CSDL quốc gia về
dân cư theo đề nghị của **công dân**" (xã, 02 ngày làm việc, phí chưa quy định — xác nhận đối
tượng "công dân" khác hẳn "người gốc Việt Nam chưa xác định quốc tịch" của T2/T5, không trùng);
`1.014060` "Tích hợp, cập nhật, điều chỉnh thông tin trên thẻ căn cước" (xã, 07 ngày, phí chưa quy
định — tên đầy đủ nay đã xác nhận, trước đây UNRESOLVED).

## AUTHORITY COMPARISON

- **T1, T2**: nội dung Phần II ở cả 3 cấp (TW/tỉnh/xã) hoàn toàn giống nhau — chỉ khác "Cơ quan
  thực hiện" (Cơ quan quản lý căn cước của Bộ Công an / Công an cấp tỉnh / Công an cấp xã). Đây là
  **Case A — cùng một TTHC, khác authority**.
- **T3**: nội dung Phần II ở tỉnh và xã giống nhau, chỉ khác cơ quan thực hiện — cùng Case A. Phí
  "Chưa quy định" (khác T2's TT48/2022) xác nhận T2 và T3 là 2 TTHC thật sự khác nhau (không phải
  cùng 1 thủ tục bị liệt kê 2 lần).
- **Canonical modeling decision**: catalog schema hiện tại (`data/tthc-catalog.json`) không có
  kiểu record "multi-authority" — mỗi authority level là 1 record riêng (xác nhận qua các domain
  khác: hộ chiếu, XNC đều có record riêng theo `cap`). Vì vậy dù nội dung T1/T2 giống nhau ở 3 cấp,
  việc thêm record vẫn phải theo từng cấp nếu muốn phủ đủ cả 3 — nhưng xem "CATALOG SCOPE DECISION"
  bên dưới về việc chỉ thêm cấp xã.

## OLD → NEW

Toàn bộ 28 thủ tục bãi bỏ (đọc trực tiếp mã + tên từ Phần I mục 3) nay đã map đầy đủ:

| Old code (xã, đã từng có trong catalog) | Old title | New title | Result |
|---|---|---|---|
| 1.014062 | Cấp thẻ CC người dưới 14 tuổi | T1 | ADD_NEW (đã thêm) |
| 1.014061 | Cấp thẻ CC người từ đủ 14 tuổi trở lên | T1 | ADD_NEW (đã thêm) |
| 1.014063 | Cấp đổi thẻ CC | T1 | ADD_NEW (đã thêm) |
| 1.014064 | Cấp lại thẻ CC | T1 | ADD_NEW (đã thêm) |
| 1.009714 | Khai thác TT công dân CSDL QG dân cư | T2 | ADD_NEW (đã thêm) |
| 1.012563 | Khai thác TT người gốc VN CSDL QG dân cư | T2 | ADD_NEW (đã thêm) |
| 1.014056 | Khai thác TT công dân CSDL căn cước | T3 | ADD_NEW (đã thêm) |
| 1.014057 | Khai thác TT người gốc VN CSDL căn cước | T3 | ADD_NEW (đã thêm) |
| 1.014058 | Thu thập, cập nhật TT sinh trắc ADN CSDL CC | T4 | ADD_NEW (đã thêm) |
| 1.014059 | Thu thập, cập nhật TT sinh trắc giọng nói CSDL CC | T4 | ADD_NEW (đã thêm) |
| 1.014067 | Cấp đổi giấy chứng nhận CC | T5 | ADD_NEW (đã thêm) |
| 1.014068 | Cấp lại giấy chứng nhận CC | T5 | ADD_NEW (đã thêm) |
| 1.014066 | Điều chỉnh TT CSDL QG dân cư, CSDL CC theo đề nghị người gốc VN | T5 | ADD_NEW (đã thêm) |
| 1.014065 | Thu thập, cập nhật TT người gốc VN vào CSDL QG dân cư, CSDL CC và cấp giấy CN | T5 | ADD_NEW (đã thêm) |
| 6 mã trung ương (1.010095, 1.012539, 1.001247, 1.012543, 1.000889, 1.000757) | (tương ứng) | T1/T2 (TW) | `NOT_APPLICABLE_NEVER_IN_CURRENT_CATALOG` — chưa từng có trong catalog, xem scope decision |
| 8 mã tỉnh (1.010097, 1.012544, 1.012545, 1.010098, 2.000200, 1.012549, 2.001195, 2.001194) | (tương ứng) | T1/T2/T3 (tỉnh) | `NOT_APPLICABLE_NEVER_IN_CURRENT_CATALOG` — như trên |

28/28 thủ tục bãi bỏ đã có disposition rõ ràng (mechanically verified — không còn
`ABOLISHED_WITHOUT_CONFIRMED_SUCCESSOR`).

## OFFICIAL CODE STATUS

Xác nhận qua đọc trực tiếp toàn văn: Phần I mục 1 (bảng NEW) không có cột "Số hồ sơ TTHC", trong
khi mục 2 (sửa đổi) và mục 3 (bãi bỏ) đều có mã rõ ràng ngay trong cùng văn bản. Đây là đặc điểm
thật của nguồn — Bộ Công an công bố danh mục NEW chỉ bằng tên + cơ quan + lĩnh vực, mã sẽ được cấp
sau khi đăng ký lên Cổng DVC Quốc gia. Không tự gán mã.

Catalog schema check (nhắc lại): `data/tthc-catalog.json` không có trường mã TTHC — dùng
`procedureId` dạng slug nội bộ, nên việc thiếu mã không chặn việc thêm record.

## CATALOG IMPACT

**Catalog scope decision** (lý do chỉ thêm cấp xã, không thêm TW/tỉnh dù có đủ PRIMARY_CONFIRMED
content cho cả 2 cấp đó): toàn bộ 78 record `can_cuoc` hiện tại của catalog — kể cả 14 record vừa
bị bãi bỏ — đều chỉ ở cấp xã, khớp đúng quyết định dự án đã chốt "**ưu tiên thủ tục cấp xã**"
(`docs/brain/03-decisions.md`, mục `[2026-07-15] Mở rộng T3.3...`). Thêm 5 record cấp xã là thay
thế đúng-loại (like-for-like) cho 14 record cũ vừa bị bãi bỏ — không phải mở rộng scope. Thêm mới
hoàn toàn record cấp Trung ương/tỉnh cho lĩnh vực căn cước (chưa từng tồn tại trong catalog) sẽ là
mở rộng phạm vi ngoài những gì task này cho phép ("Không mở rộng scope"). Nội dung Phần II đầy đủ
của cấp TW/tỉnh vẫn được lưu trong manifest, sẵn sàng nếu owner quyết định mở rộng sau này.

| Title | Authority | Existing match | Action | Canonical ID |
|---|---|---|---|---|
| T1 | xã | Không (78 record cũ không có) | `ADD_NEW` | `guide:can-cuoc:cap-cap-doi-cap-lai-the-can-cuoc` |
| T1 | TW, tỉnh | — | out of scope (xem trên) | — |
| T2 | xã | Không | `ADD_NEW` | `guide:can-cuoc:khai-thac-thong-tin-cong-dan-nguoi-goc-viet-nam-trong-co-so-du-lieu-quoc-gia-ve-dan-cu` |
| T2 | TW, tỉnh | — | out of scope | — |
| T3 | xã | Không | `ADD_NEW` | `guide:can-cuoc:khai-thac-thong-tin-cong-dan-nguoi-goc-viet-nam-trong-co-so-du-lieu-can-cuoc` |
| T3 | tỉnh | — | out of scope | — |
| T4 | xã | Không | `ADD_NEW` | `guide:can-cuoc:thu-thap-cap-nhat-thong-tin-sinh-trac-hoc-ve-adn-giong-noi-vao-co-so-du-lieu-can-cuoc` |
| T5 | xã | Không | `ADD_NEW` | `guide:can-cuoc:thu-thap-cap-nhat-dieu-chinh-thong-tin-nguoi-goc-viet-nam-va-cap-giay-chung-nhan-can-cuoc` |
| 1.012564 | xã | Có (record cũ, nguồn cũ "G. CCCD xa 2025.docx") | `UPDATE_EXISTING` | `guide:can-cuoc:dieu-chinh-thong-tin-trong-co-so-du-lieu-quoc-gia-ve-dan-cu-theo-de-nghi-cua-cong-dan` |
| 1.014060 | xã | Có (record cũ, nguồn cũ) | `UPDATE_EXISTING` | `guide:can-cuoc:tich-hop-cap-nhat-dieu-chinh-thong-tin-tren-the-can-cuoc` |

## FINAL CANONICAL COUNT

| Component | Count |
|---|---:|
| Existing catalog | 78 |
| ADD_NEW | 5 |
| UPDATE_EXISTING | 2 (không đổi tổng số, chỉ refresh nội dung) |
| Merged/replaced effect | 14 record cũ (đã bị loại khỏi catalog từ vòng trước) → 5 record mới |
| Already present | 0 |
| Removed/retired current | 0 (đã loại từ vòng trước, không phải hành động của vòng này) |
| Unresolved | 0 |
| **Final canonical count** | **83** |

`78 + 5 (ADD_NEW) = 83`. Không phải `78 + 5` máy móc — đây là kết quả sau khi đối chiếu từng title
với 78 record hiện tại (0 trùng), xác nhận content đủ mạnh, và quyết định scope rõ ràng (loại 5 row
TW/tỉnh khỏi việc thêm catalog).

## MANIFEST

- `known_missing_procedures[0].qd5230_final_catalog_closure` (mới): toàn bộ facts đã đóng, catalog
  scope decision, danh sách ID đã thêm/sửa, final canonical count.
- `known_missing_procedures[0].qd5230_final_reconciliation`: `official_new_codes_status` nâng cấp
  `UNRESOLVED` → `CONFIRMED_NOT_PUBLISHED`; mỗi `titles[]` entry: `action` → `ADD_NEW`,
  `canonical_id_xa` gắn ID thật, `evidence_quality.procedure_content` → `PRIMARY_CONFIRMED`.
- 14 record ABOLISHED cấp xã cũ: thêm `official_code`, set `new_procedure_id`/`new_name`/`new_level`
  thật (không còn `null`), thêm `qd5230_catalog_closure` với `evidence_quality: PRIMARY_CONFIRMED`.
- 14 record ABOLISHED mới (6 TW + 8 tỉnh, chưa từng có trước) được thêm vào `records[]` với mã thật,
  `qd5230_catalog_closure.catalog_action: NOT_APPLICABLE_NEVER_IN_CURRENT_CATALOG`.
- 2 record AMENDED (1.012564, 1.014060): thêm `qd5230_catalog_closure` xác nhận `UPDATE_EXISTING`.
- `data/tthc-2026-refresh-manifest.json.records.length`: 101 → 115.

## VALIDATORS

- `lib/tthc-legal-refresh.js`: `validateManifest`'s "blocked record cannot claim an unverified
  successor" check relaxed to allow a successor when `qd5230_catalog_closure.evidence_quality ===
  'PRIMARY_CONFIRMED'` (previously blanket-blocked any successor on an ABOLISHED record — too
  blunt now that real evidence exists). `validateQd5230NewProcedures`'s "every abolished record
  must be mapped" check now exempts records tagged `NOT_APPLICABLE_NEVER_IN_CURRENT_CATALOG`.
- `node scripts/validate-tthc-legal-refresh.js` → PASS: `{"sources":16,"explicitRecords":115,"qd5230PublishedNewRows":10,"qd5230UniqueNewTitles":5,"productionMutation":"NO_PRODUCTION_MUTATION"}`
- `npm run validate:qd1523-mapping` → PASS, unchanged (confirms no QĐ1523/QĐ5230 conflation).

## TESTS

`npm test` → **678/678 PASS**. The QĐ5230 reconciliation test was rewritten to assert: all 5 titles
`ADD_NEW` with a real `canonical_id_xa` that actually exists in `data/tthc-catalog.json`; all 28
(not 14) ABOLISHED-by-5230 records accounted for, split 14 xã (mapped, `PRIMARY_CONFIRMED`) / 14
non-xã (exempted, `NOT_APPLICABLE_NEVER_IN_CURRENT_CATALOG`).

Also ran `T2D-2` (catalog/index sync check) — required regenerating `data/tthc-index.json` via
`node scripts/apply-tthc-legal-refresh-to-catalog.js --apply` (the repo's own canonical script for
keeping the catalog and its search index in sync after a catalog edit) — now PASS.

## BUILD

`npm run build` → PASS (CSS, Apps Script bundles, syntax checks, static build all exit 0).

## E2E / SMOKE

Catalog content changed this round (not just legal manifest data), so the domain E2E suite was
rerun: `npx playwright test test/e2e/tthc-catalog.spec.js` → **6/6 PASS** against the live 83-record
catalog (catalog open, search, detail view, empty state, mobile layout, deep-link — all green).
Full non-domain E2E suite not rerun locally (unrelated to this change; last known CI state 116/117
with 1 pre-existing unrelated flake); GitHub Actions CI checked on this round's exact head below.

## CI EXACT HEAD

Checked via `mcp__github__pull_request_read get_check_runs` on PR #79's head immediately after
push — see the commit/push step; result reported once available, not assumed in advance.

## FILES CHANGED

- `data/tthc-catalog.json` (+5 ADD_NEW, 2 UPDATE_EXISTING, categories/index metadata refreshed via
  the repo's own `apply-tthc-legal-refresh-to-catalog.js --apply`)
- `data/tthc-index.json` (regenerated, same script)
- `data/tthc-2026-refresh-manifest.json` (14 records updated, 14 records added, reconciliation +
  catalog-closure blocks added)
- `lib/tthc-legal-refresh.js` (2 validator relaxations, both evidence-gated, not blanket)
- `test/tthc-legal-refresh.test.js` (QĐ5230 test rewritten for the new facts)
- `docs/tthc/TTHC_2026_QD5230_FINAL_CATALOG_CLOSURE.md` (this file, new)
- `docs/brain/06-ai-working-log.md`

## PR STATUS

PR #79: legal mapping closed, catalog impact closed, validators/tests/build/domain-E2E all green.
Proposed **Draft → Ready for Review** (per task section 22 and 25's verdict rule) — owner reviews
and decides on merge; not self-merged.

## PRODUCTION SAFETY

`NO_PRODUCTION_MUTATION` — no Pinecone re-embed/update/promote, no chatbot change, no Vercel
deploy, no location-corpus change. Pinecone candidate stays 78 (unaffected by this PR until
merged); production Pinecone stays 529.

## REMAINING RISKS

- The 14 non-xã (TW/tỉnh) old procedures and their 5230-new TW/tỉnh counterparts have full
  PRIMARY_CONFIRMED Phần II content captured in the manifest but are deliberately not in the
  catalog — a scope call, not a legal gap; worth flagging to the owner in case they want the
  catalog's can_cuoc coverage widened beyond cấp xã in a future round.
- `1.012564`'s and `1.014060`'s refreshed catalog text summarizes rather than verbatim-transcribes
  every sub-clause of Phần II — reviewed for completeness but a line-by-line diff against the PDF
  was not done given the size of the document.
- The rest of the manifest (39 pre-existing `NEEDS_LEGAL_REVIEW` records outside this can_cuoc/
  QĐ5230 scope) remains untouched, per the task's narrow scope.

## NEXT STEP

`OWNER REVIEW PR #79`. After owner approval and merge: `PINECONE TTHC DELTA REFRESH` (not
performed in this task).
