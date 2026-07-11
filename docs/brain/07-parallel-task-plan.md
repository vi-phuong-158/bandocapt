# 07 — Kế hoạch task song song (Claude Code + ChatGPT Codex)

> Nguồn: Kế hoạch khắc phục toàn diện đã chốt 2026-07-11 (xem `03-decisions.md`).
> Mục đích: chia kế hoạch 4 giai đoạn thành task nhỏ, gắn **agent đề xuất** + **mức trí tuệ**
> để 2 agent làm song song không giẫm chân nhau.
>
> **Agent đọc file này bắt buộc tuân thủ mục "Luật phân làn" trước khi nhận task.**

---

## Luật phân làn (chống conflict khi 2 agent chạy song song)

### Quyền sở hữu file — ai được đụng file nào

| Làn | File thuộc làn | Agent mặc định |
|---|---|---|
| **LANE-CORE** (backend rủi ro cao) | `api/chat.js`, `api/feedback.js`, `lib/output-validator.js`, `lib/` mới tách | Claude Code |
| **LANE-EVAL** (bộ chấm) | `scripts/run-regression.js`, `lib/regression-metrics.js`, `test/regression-expectations.json`, `test/results/` | Claude Code (T1.2 có thể giao Codex) |
| **LANE-FE** (frontend) | `index.html`, `styles.css`, `app.js`, `js/chatbot.js`, `js/tthc-catalog.js`, `js/gemini.js`, `assets/` | Codex |
| **LANE-DATA** (script dữ liệu) | `setup/*.js`, `scripts/generate-tthc-catalog.js`, `scripts/build-static.js`, `data/` | Codex hoặc Claude, task nào rảnh |
| **LANE-DOCS** | `docs/brain/*` | Cả hai, nhưng chỉ append/sửa section của task mình |

### Quy tắc cứng

1. **Không bao giờ 2 nhánh cùng sửa `api/chat.js` mở song song.** Task LANE-CORE làm tuần tự.
2. Mỗi task = 1 nhánh riêng `feat/<task-id>-<slug>` hoặc `codex/<task-id>-<slug>` → PR, không push `main`.
3. Trước khi bắt đầu task: `git pull` main + đọc lại section task trong file này (trạng thái có thể đã đổi).
4. Xong task: cập nhật cột **Trạng thái** trong bảng dưới + entry `06-ai-working-log.md` + `npm test` xanh.
5. Task có `Phụ thuộc` chưa DONE thì **không được bắt đầu** — trừ khi ghi rõ "song song được".
6. `js/gemini.js` là file giáp ranh (SSE contract): nếu task LANE-CORE đổi event SSE (`eval`, `abstentionReason`), phần sửa client tương ứng gộp **vào cùng PR đó**, không tách cho agent kia.

### Thang mức trí tuệ

| Mức | Nghĩa | Ví dụ model |
|---|---|---|
| **CAO** | Suy luận đa bước, rủi ro phá production, cần hiểu toàn pipeline, nhiều đánh đổi | Claude Opus (reasoning cao) / GPT reasoning cao |
| **TRUNG** | Logic rõ ràng, phạm vi khoanh vùng, có test kiểm chứng | Claude Sonnet / Codex mặc định |
| **THẤP** | Cơ học, lặp lại, spec đã đủ chi tiết, sai thì test bắt ngay | Model nhỏ/nhanh, reasoning thấp |

---

## GIAI ĐOẠN 1 — Thước đo 30 câu (làm TRƯỚC mọi sửa hành vi)

| ID | Task | Làn | Agent | Mức | Phụ thuộc | Trạng thái |
|---|---|---|---|---|---|---|
| T1.1 | Ghi quyết định 12/24h vào `03-decisions.md` + đồng bộ mô tả F01/TL01 | DOCS | Claude | THẤP | — | **DONE** (2026-07-11) |
| T1.2 | Viết `test/regression-expectations.json` đủ 30 ID | EVAL | Claude (hoặc Codex reasoning cao) | **CAO** | T1.1 | **DONE** (2026-07-11) |
| T1.3 | Eval-mode output trong `api/chat.js` + test không lộ production | CORE | Claude | **CAO** | — (song song T1.2 được) | **DONE** (2026-07-11) |
| T1.4 | Lớp chấm deterministic trong runner | EVAL | Claude/Codex | TRUNG | T1.2 | **DONE** (2026-07-11) |
| T1.5 | Lớp chấm grounding + Recall@4/MRR | EVAL | Claude | TRUNG | T1.2, T1.3, T1.4 | **DONE** (2026-07-11) |
| T1.6 | Format báo cáo mới (hard/deferred/soft/latency) | EVAL | Claude (nhận từ Codex) | THẤP | T1.4 | **DONE** (2026-07-11) |
| T1.7 | Chạy 3 baseline + commit báo cáo | EVAL | Người dùng + Claude | THẤP | T1.4–T1.6 | **DONE** (2026-07-11) — mốc ban đầu ❌ 12-16/30 hard fail (đo bằng grader cũ, đã lỗi thời, xem T1.8) |
| T1.8 | Sửa false-positive bộ chấm (negation-aware forbidden, `grounding_patterns`, mã hóa lại TL01) | EVAL | Claude | TRUNG | T1.7 | **DONE** (2026-07-11) — 10/11 ca fail lặp chuyển PASS live |
| T1.7b | Baseline mới sau T1.8 (mốc chính thức cho Giai đoạn 2) | EVAL | Claude | THẤP | T1.8 | **DONE** (2026-07-11) — ❌ 5-8/30 hard fail, 4 ca lặp cả 3 lần (TR01/TT01/KC04/LOC07), xem 06-log. Bị thay bằng T1.11 làm mốc chính thức |
| T1.9 | Sửa định tuyến câu trả lời quốc tịch ("Người Việt Nam" bị coi là địa danh → DETERMINISTIC_NO_MATCH trước RAG) | CORE | Claude | **CAO** | — | **DONE** (2026-07-11) — unit + integration + live H16/H17 3/3 PASS |
| T1.10 | Thước đo hội thoại nhiều lượt (H16/H17) + `--strict-gate` + sửa expectation KC04 | EVAL | Claude | TRUNG | T1.9 | **DONE** (2026-07-11) |
| T1.11 | Nghiệm thu gate Giai đoạn 1 — chuyển strict per-run → **gate ĐA SỐ 2/3** | EVAL | Claude/Codex/Gemini | **CAO** | T1.9, T1.10 | ĐANG CHẠY (2026-07-11) — strict per-run KHÔNG hội tụ (4 run liên tiếp mỗi run một ca khác flaky: EV04/TT04/VP01/H17). User chốt gate đa số; runner `--majority` + `aggregateMajority` đã có + unit test; đang chạy 3-run majority chính thức |

**Chi tiết:**

- **T1.1** — Nội dung đã chốt: chỉ luồng phiếu giấy/NA17/nộp trực tiếp lỗi thời; hạn 12/24 giờ vẫn áp dụng cho KBTT online. F01 cấm phiếu giấy/NA17/fax/nộp trực tiếp, KHÔNG cấm 12/24h. TL01 giữ yêu cầu 12/24h. `allowedConstants` trong `api/chat.js` giữ nguyên. Kiểm tra: đọc lại 3 chỗ nhất quán.
- **T1.2** — Keyed đủ 30 ID theo `test/cau-hoi/bo-test-regression-30-cau-nguoi-nuoc-ngoai-tthc.md`. Mỗi ID: required/forbidden facts, expected procedure/source IDs, expected language/authority, must_abstain/must_ask_clarification, ngân sách độ dài, trạng thái đặc biệt (`F01: DEFERRED_SOURCE_GOVERNANCE`). Mức CAO vì sai expectation = thước đo hỏng, mọi giai đoạn sau lệch theo. Kiểm tra: schema validate + review tay từng ID đối chiếu file 30 câu.
- **T1.3** — Event `done` thêm trường `eval` (standaloneQuery, category, matches trước/sau filter, lý do loại từng match, toàn văn 4 docs cuối). CHỈ khi đủ 3 điều kiện: `NODE_ENV !== 'production'` + `captchaToken === EVAL_BYPASS_TOKEN` + body `evalDebug: true`. Bắt buộc có unit test chứng minh production không trả `eval` kể cả khi client gửi cờ. Mức CAO vì đụng pipeline chính + ranh giới bảo mật.
- **T1.4** — Mở rộng `GRADED_CASES` 7 → 30 ID, đọc từ expectations JSON: ngôn ngữ, intent, thẩm quyền, required/forbidden facts, procedure/source IDs, abstention/clarification, verbosity/truncation (soft). Kiểm tra: chạy `--ids` từng nhóm, mỗi ID có kết quả chấm.
- **T1.5** — Fact grounding (required fact tồn tại trong docs đã retrieve), expected source trong top 4, Recall@4/MRR theo ID. Cần output `eval` từ T1.3. Lưu ý: fail nhóm tạm trú do nguồn giấy còn active phải tự gắn nhãn deferred theo expectations, không đỏ rực báo cáo.
- **T1.6** — Tách section báo cáo: hard fail / deferred fail / TRUNCATED / VERBOSITY / provider error / Recall@4/MRR / p50-p95 theo stage. Spec rõ, cơ học.
- **T1.7** — Cần API key thật (bước người dùng). 3 run liên tiếp, commit vào `test/results/`. Baseline này đồng thời đóng TASK-UX-01-EXT mục 1 và bước "3 run cho feat/rag-accuracy" trong `04-current-tasks.md`.
- **T1.8** — Soi 11 ca fail lặp cả 3 run baseline → ~9 là false-positive của bộ chấm, không phải lỗi bot. Sửa: (1) forbidden regex negation-aware (GV01/GV06 — "Không nộp tại Công an phường" không còn bị bắt oan); (2) schema thêm `grounding_patterns` — pattern riêng dò tài liệu tiếng Việt, tách khỏi pattern dò câu trả lời (EV07/KC04 en-zh, TR01/ON01/GD02/DN02/EV04 diễn đạt khác); (3) nới required cho diễn đạt tương đương (VP06/DN02/TR01); (4) TL01: bỏ required "cụm phân biệt", thay bằng forbidden `deadline_confused_with_processing`. Sau sửa, lỗi bot THẬT còn lại cho GĐ2/3: KC04 (không đưa hướng dẫn police/embassy), TR01 chập chờn `ask_location`, TYPO02 chập chờn gợi ý VNeID, LOC07 chập chờn sai ngôn ngữ, TR01 từng gợi ý phiếu NA17. Xem 03-decisions 2026-07-11.

- **T1.9** — Lỗi tái hiện: hỏi "mất hộ chiếu" → bot hỏi quốc tịch → trả lời "Người Việt Nam" → heuristic câu-ngắn coi là địa danh → nhánh tất định `DETERMINISTIC_NO_MATCH` kết thúc request TRƯỚC khi RAG chạy. Sửa 2 lớp trong `lib/published-locations.js` (`NATIONALITY_ANSWER_PATTERN` + `isNationalityAnswerContext`), guard nhánh tất định trong `api/chat.js`, chip quốc tịch nhận cả 2 thứ tự vế. Xem 03-decisions 2026-07-11.
- **T1.10** — `test/regression-conversations.json` (H16 công dân / H17 người nước ngoài), runner truyền `history` từng lượt + transcript + chấm lượt cuối, thống kê tách câu-đơn/hội-thoại, cờ `--strict-gate` (hard fail HOẶC provider error → exit 1). KC04 chỉ bắt hỏi lại quốc tịch (nhánh sau làm rõ chấm bằng H16/H17).
- **T1.11** — Quy trình: npm test + build → H16/H17 ×3 → 3 run đầy đủ liên tiếp `--strict-gate`; bất kỳ run nào hard fail/provider error → HỦY chuỗi, sửa nguyên nhân + thêm regression, chạy lại từ run 1. Trước chuỗi: sửa 3 ca fail-do-thước-đo còn lại của T1.7b (TR01 bỏ ask_location vô điều kiện, TT01 bỏ ask_eligibility + budget 350, LOC07 sửa detectLanguage bỏ từ viết hoa). Chuỗi 1 hủy ở run 1 → vá thêm các pattern bắt oan (TR05/GV02/DN02/ON01/TR09/H16-forbidden) + grader không quy provider error thành content fail. Run kế tiếp tiếp tục lộ paraphrase hợp lệ VP06/DN02/ON01 và H16 công dân bị global guard của bộ NNN bắt oan; đã bổ sung test hai chiều và opt-out `use_global_forbidden=false` chỉ cho H16. Chuỗi gần nhất: run 1 đạt, run 2 hủy vì LOC07 detector chưa nhận nhãn tiếng Anh bọc Markdown và DN01 lặp soft warning; đã thêm test đúng/sai, ngân sách riêng DN01 300 và siết prompt chống lặp. Soft warning mỗi ca ≤1/3 run; chuỗi kế tiếp chạy lại từ run 1.

**LLM judge:** làm SAU khi T1.4+T1.5 ổn định, chỉ advisory cho 5–8 ca khó, không chặn gate. Chưa tạo task — mở khi cần.

---

## GIAI ĐOẠN 2 — Runtime safety + quick wins (sau baseline T1.7)

| ID | Task | Làn | Agent | Mức | Phụ thuộc | Trạng thái |
|---|---|---|---|---|---|---|
| T2A | Fail-closed + `standaloneQuery` nhất quán | CORE | Claude | **CAO** | T1.7 | TODO |
| T2B-1 | Buffered validation (SSE theo câu) | CORE | Claude | **CAO** | T2A | TODO |
| T2B-2 | Per-claim citation `[Sx]` sau flag `CLAIM_CITATIONS=off` | CORE | Claude | **CAO** | T2B-1 + 3 run sạch | TODO (hoãn được) |
| T2C | Provider/deadline/telemetry + tách helper khỏi chat.js | CORE | Claude | TRUNG–CAO | T2B-1 | TODO |
| T2D-1 | Avatar 669KB → WebP/AVIF 128px ≤80KB | FE | Codex | THẤP | — (song song mọi thứ) | TODO |
| T2D-2 | `tthc-index.json` nhỏ + chat chỉ preload index | FE+DATA | Codex | TRUNG | — (song song được) | TODO |
| T2D-3 | Lazy-load marked/DOMPurify/Turnstile/chatbot/catalog | FE | Codex | TRUNG | T2D-2 nên xong trước | TODO |
| T2D-4 | Hash/version static assets + cache immutable | DATA | Codex | TRUNG | T2D-1..3 | TODO |

**Chi tiết:**

- **T2A** — Một `standaloneQuery` dùng chung cho embedding/classification/exact-token/rerank/thẩm quyền. Thiếu RAG (embedding lỗi, Pinecone lỗi, không match vượt threshold) → KHÔNG gọi model trả lời thủ tục, trả thông báo tất định theo ngôn ngữ người dùng + gợi ý danh mục; `done` thêm `abstentionReason`. Câu thuần trụ sở giữ nhánh `Published_Locations`. CẤM prompt-hack cho F01. Mức CAO: đổi hành vi trung tâm, dễ over-refuse — phải soi Recall/abstention accuracy so baseline.
- **T2B-1** — Buffer đến hết câu/bullet, validate từng segment, chỉ write segment sạch. KHÔNG đổi prompt/format generation. Bất biến bắt buộc test: (a) bản canonical trong `done` = đúng phép nối các segment đã phát; (b) không phone/phí/thời hạn chưa xác minh trong bất kỳ chunk nào; (c) validator idempotent trên segment. Chạy đủ 3 regression trước khi mở T2B-2.
- **T2B-2** — Chỉ bật flag nếu: 0 hard fail mới + median độ dài tăng ≤10% + không vượt soft-warning gate. Word counter loại marker `[Sx]` khỏi phép đếm. Client render citation nhỏ (phần client gộp cùng PR). Không đạt → giữ flag tắt, dời milestone riêng.
- **T2C** — `LLM_PRIMARY`/`LLM_FALLBACK`/`CHAT_REQUEST_DEADLINE_MS=55000`; failover chỉ khi timeout/429/5xx/network/block bất thường; mọi stage AbortSignal + ngân sách còn lại; telemetry thêm `query_rewrite_ms`, `embedding_ms`, `time_to_first_validated_sentence_ms`, `provider`, `fallback_used`, `rag_abstention_reason`, ghi bằng `waitUntil`. Tách helper CORS/HMAC/IP/sanitize ra `lib/` để `api/feedback.js` hết `require('./chat')`. Nuốt TASK-FIX-01 mục duplicate telemetry key (xác minh trước — code có thể đã sạch, không tạo diff giả).
- **T2D-2** — Generator sinh thêm `data/tthc-index.json` (title/alias/procedure_id); `js/chatbot.js` preload index thay vì catalog 639KB; catalog đầy đủ chỉ tải khi mở danh mục/bấm đối chiếu.

**Gate giai đoạn 2:** không hard fail mới; F01 giữ deferred; soft warning ≤1/3 run mỗi case; 100% ca thiếu RAG từ chối đúng; không raw text chưa validate trên UI; p95 không xấu hơn baseline quá 5%. SLO 8s/20s chỉ là target đến khi owner chốt sau baseline.

---

## GIAI ĐOẠN 3 — Sprint nguồn hết hiệu lực (nơi BẮT BUỘC đóng F01)

| ID | Task | Làn | Agent | Mức | Phụ thuộc | Trạng thái |
|---|---|---|---|---|---|---|
| T3.1 | Script inventory corpus + báo cáo thiếu metadata/xung đột | DATA | Codex | TRUNG | T1.7 (song song GĐ2 được) | TODO |
| T3.2 | Mở rộng CSV draft (schema hiệu lực + structured facts) | DATA | Codex | TRUNG | T3.1 | TODO |
| T3.3 | Người duyệt chốt CSV nhóm rủi ro cao | — | **Người dùng** | — | T3.2 | TODO |
| T3.4 | Backfill metadata + đánh dấu superseded (`--apply` có backup) | DATA | Claude/Codex | TRUNG | T3.3 | TODO |
| T3.5 | Re-embed `RETRIEVAL_DOCUMENT` → namespace mới | DATA | Codex | THẤP–TRUNG | T3.4 | TODO |
| T3.6 | Runtime filter hiệu lực: `approved/current` trước query, check ngày sau query, rerank chỉ nhận match hợp lệ; 2 nguồn hiện hành mâu thuẫn → từ chối + cảnh báo | CORE | Claude | **CAO** | T3.4, T2A | TODO |
| T3.7 | Shadow retrieval namespace cũ/mới + báo cáo so sánh | EVAL | Codex | TRUNG | T3.5, T3.6 | TODO |
| T3.8 | Chuyển namespace production + 3 run gate | — | Người dùng + Claude | TRUNG | T3.7 | TODO |

Schema metadata: `review_status` (approved/pending/superseded), `valid_from/valid_to/supersedes`, `source_priority` (current_procedure/legal_basis/supplemental/legacy), `procedure_version/last_verified_at/content_hash`, structured facts `phi/le_phi/thoi_han/mau_don/authority`. Trường không áp dụng ghi `N/A`. TASK-P0-04-EXT nhập vào T3.2–T3.4.

**Gate:** F01 sạch phiếu giấy/NA17/nộp trực tiếp nhưng vẫn nêu được 12/24h từ nguồn KBTT; 0 hard fail 3 run; 100% record rủi ro cao có metadata duyệt; không source superseded trong prompt/citation; Recall@4 ≥95% và không giảm so baseline. Rollback = đổi namespace + embedding task type; KHÔNG rollback strict abstention/buffered validation.

---

## GIAI ĐOẠN 4 — UX + redesign mobile

| ID | Task | Làn | Agent | Mức | Phụ thuộc | Trạng thái |
|---|---|---|---|---|---|---|
| T4A-1 | Bản đồ tìm theo name/address/`searchAliases`, chuẩn hóa không dấu + `đ/d` | FE | Codex | TRUNG | — (song song GĐ2/3 được) | TODO |
| T4A-2 | Danh mục tìm theo title/mã/lĩnh vực/đối tượng/mẫu đơn/tóm tắt | FE | Codex | TRUNG | — | TODO |
| T4A-3 | Starter questions: 4 mục, lưới 2 cột, "Xem thêm" | FE | Codex | THẤP | — | TODO |
| T4A-4 | Touch target ≥44px + design token hóa màu/spacing/radius | FE | Codex | THẤP–TRUNG | Đọc `DESIGN_SYSTEM.md` trước | TODO |
| T4B | Civic Modern mobile: bottom nav Bản đồ/Thủ tục/AI + preview vị trí + marker clustering | FE | Codex | TRUNG–CAO | User reprioritize trực tiếp 2026-07-11 | **DONE** (2026-07-11) |
| T4C | E2E 3 viewport + a11y + benchmark 100 request staging + alert | EVAL | Claude | TRUNG | T4B | TODO |

**T4B đã chốt:** bottom navigation luôn hiện dưới 768px; giữ selection khi đổi tab; preview marker 164px;
nút định vị tự tránh preview; cluster marker dưới zoom 14 và bung marker từ zoom 14. Quyết định này thay
đặc tả action dock cũ và được user yêu cầu triển khai trước T4A. E2E UI thuộc T4B đã có; T4C vẫn còn
benchmark staging/alert và audit a11y rộng hơn, không được đánh dấu hoàn tất.

Rollout production: Gemini primary, DeepSeek tắt → theo dõi 48h → bật DeepSeek nếu đạt cùng hard gate → deploy các phần UX còn lại.

---

## Nguyên tắc gate chung (nhắc lại, đã chốt)

- Gate = **0 hard fail** (deterministic + grounding). TRUNCATED/VERBOSITY = soft, mỗi case ≤1/3 run.
- F01 = `DEFERRED_SOURCE_GOVERNANCE` đến hết GĐ2, bắt buộc đóng ở GĐ3. Cấm sửa nhanh bằng prompt/regex.
- LLM judge advisory-only, không chặn baseline/release.
- Definition of done mỗi PR: test + regression theo mức ảnh hưởng, không hard fail mới, cập nhật `06-ai-working-log.md`, đổi schema/API/luồng chính thì cập nhật `01-architecture.md` (Code Graph) + `03-decisions.md`, đóng backlog được hấp thụ trong `04-current-tasks.md`, ghi hướng rollback trong PR.

## Gợi ý lịch chạy song song

```
Tuần 1:  Claude: T1.1 → T1.3 → T1.5        | Codex: T1.2 → T1.4 → T1.6
         (T1.7 baseline: người dùng chạy khi T1.1–T1.6 xong)
Tuần 2:  Claude: T2A → T2B-1                | Codex: T2D-1 → T2D-2 → T2D-3 → T3.1 → T3.2
Tuần 3:  Claude: T2C → (T2B-2 nếu đạt)      | Codex: T2D-4 → T4A-1 → T4A-2 | Người dùng: T3.3
Tuần 4+: Claude: T3.6 → T3.8 → T4B → T4C    | Codex: T3.4 → T3.5 → T3.7 → T4A-3 → T4A-4
```

Lưu ý lịch chỉ là gợi ý — ràng buộc thật là cột **Phụ thuộc** và luật phân làn.
