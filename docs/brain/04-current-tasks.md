# 04 — Current Tasks

> Cập nhật mỗi khi bắt đầu hoặc hoàn thành task. Agent đọc đây để biết được phép làm gì.

---

## Đang làm

### [ACTIVE] Kế hoạch khắc phục toàn diện 4 giai đoạn (2026-07-11)
- **Nguồn sự thật:** `docs/brain/07-parallel-task-plan.md` — chia task nhỏ cho 2 agent
  (Claude Code + ChatGPT Codex) chạy song song, kèm luật phân làn file, mức trí tuệ đề xuất,
  phụ thuộc và trạng thái từng task.
- **Bắt buộc:** agent nhận task từ kế hoạch này phải đọc mục "Luật phân làn" trong file 07
  trước khi bắt đầu, và cập nhật cột Trạng thái khi xong.
- **Thứ tự:** Giai đoạn 1 (thước đo 30 câu) hoàn thành TRƯỚC mọi sửa hành vi chatbot.
- Kế hoạch này **hấp thụ** các backlog cũ: TASK-UX-01-EXT mục 1 (→ T1.7), TASK-P0-04-EXT
  (→ T3.2–T3.4), TASK-FIX-01 mục telemetry trùng key (→ T2C), bước người dùng "3 run
  regression cho feat/rag-accuracy" (→ T1.7).
- **[DONE 2026-07-12] T1.11 — Giai đoạn 1 ĐÃ ĐÓNG:** gate ĐA SỐ 2/3 ĐẠT 2 lần liên tiếp (0 hard fail
  cả hai lần). VP06 (từ chối khai lùi ngày tạm trú) sửa xong PASS 3/3. F01 vẫn deferred theo đúng
  thiết kế 2026-07-11 (không chặn tới Giai đoạn 3). **Giai đoạn 2 (runtime safety + quick wins) đã mở
  khóa** — xem bảng T2A–T2D trong `07-parallel-task-plan.md`. Chi tiết bằng chứng: `06-ai-working-log.md`
  (2026-07-12) + `test/results/regression-majority-*.md`.
- **[DONE 2026-07-13] T2A:** đã hợp nhất `standaloneQuery`, thêm fail-closed abstention gated
  `RAG_FAIL_CLOSED=1`, giữ eval trace ở nhánh từ chối, bổ sung luật diễn giải viết tắt `TQ` và test
  failure-path. Gate majority chạy đủ 3 run đạt: 0 hard fail đa số, TYPO02 PASS 3/3; GD02 flaky 1/3
  và provider errors lẻ tẻ chỉ advisory. T2B-1 được mở khóa. Nguồn trạng thái: `07-parallel-task-plan.md`.
- **[DONE 2026-07-13] T2B-1:** buffered validation theo câu/bullet có unit + integration test ở
  tầng handler cho ba invariant; majority 3 run trên đúng worktree đạt 0 hard fail đa số và 0
  provider error. T2B-2 vẫn DEFERRED vì soft-warning/latency gate chưa đạt.
- **[DONE 2026-07-13] T2C + T2D-1..4:** mọi external stage của chat cùng dùng deadline 55s còn lại,
  provider fallback/telemetry không chặn SSE, và helper request-security đã tách khỏi chat handler. Frontend
  dùng avatar WebP 3.8KB, index TTHC 18KB, lazy loader có SRI/proxy deep-link, cùng static manifest content-hash.
  `npm test` 249/249 và `npm run test:e2e` 14/14 xanh. Một full regression sau T2C có 0 hard fail (F01
  deferred); majority 3-run mới cần chạy ở runner không bị giới hạn 10 phút trước bất kỳ rollout flag nào.

### [ĐIỀU TRA XONG — TASK-GV02-FLAKY] Vì sao GV02 hay lỗi
- **Kết quả điều tra (2026-07-10):** Chạy GV02 đơn lẻ 10 lần liên tiếp → **10/10 thành công** (137-350 từ). Chạy thêm 2 lần full 30-câu → 1 lần sạch 100%, 1 lần GV02 TRUNCATED. Không bắt được thêm lần `BLOCKED_CONTENT` nào dù đã bật log chẩn đoán (`finishReason`/`promptFeedback`/`safetyRatings`).
- **Kết luận:** GV02 đã được xếp đúng ngân sách FULL (250 từ, không phải lỗi phân loại) nhưng chủ đề vốn dài (nhiều mẫu đơn/phí/bước) nên thỉnh thoảng vượt 250 từ và chạm trần cứng 3072 token. Đây là **biến thiên sampling tự nhiên của Gemini ở `temperature: 0.2`** (không đổi trong Giai đoạn 2/3) kết hợp chủ đề dài — KHÔNG liên quan exact-token-boost/query-rewrite/đổi model tiện ích (GV02 không có mã mẫu/số hiệu văn bản nên boost không kích hoạt; không có history nên query-rewrite không chạy). `BLOCKED_CONTENT` là hiện tượng xác suất thấp, nghi liên quan safety classifier nhạy cảm với cụm "người Trung Quốc" + tình trạng cư trú/visa, nhưng không tái hiện được để xác nhận category cụ thể. Chi tiết: `03-decisions.md` (2026-07-10, "Điều tra GV02 flaky").
- **Đã làm:** Giữ lại log chẩn đoán vĩnh viễn trong `api/chat.js` (nhánh `BLOCKED_CONTENT`) để lần sau xảy ra thật trong production có thể đọc được lý do từ Vercel logs.
- **Còn mở (tuỳ chọn, ưu tiên thấp):** Nếu muốn giảm rủi ro `BLOCKED_CONTENT` gây mất câu trả lời hợp lệ, cân nhắc thêm retry-on-block (đổi nhẹ wording hoặc fallback DeepSeek) — đây là thay đổi hành vi generation cần quyết định riêng, chưa làm.

## Đã hoàn thành gần đây (bổ sung)

- [2026-07-11] T4B Civic Modern UI: bottom navigation mobile `Bản đồ / Thủ tục / Hỏi đáp AI`, safe area thống nhất, preview vị trí 164px không che bản đồ, giữ marker khi đổi tab, nút định vị tránh sheet, marker 38/48px và clustering dưới zoom 14. User chủ động reprioritize T4B trước T4A; T4C benchmark/a11y mở rộng vẫn còn chờ.
- [2026-07-03] Progressive disclosure UI: quick-reply chips (khu vực cũ, quốc tịch mất hộ chiếu, mời hướng dẫn đầy đủ) + accordion thu gọn Hồ sơ/Trình tự trong `js/chatbot.js`. Chỉ client, không đổi `api/chat.js` logic — không cần chạy lại regression baseline. Chi tiết: `docs/brain/03-decisions.md` (2026-07-03) và `06-ai-working-log.md`.

---

## Chờ làm (backlog)

### [DONE] TASK-FIX-01: Dọn dẹp lỗi trong commit security `9e3b2d9` (api/chat.js)
- **Mô tả:** Review commit `feat(security)` phát hiện 4 lỗi do copy-paste / vô hiệu hóa code nửa vời. Đã được dọn dẹp và sửa dứt điểm.
- **Liên quan:** `api/chat.js` (toàn bộ trong file này)
- **Ưu tiên:** Cao
- **Phạm vi cứng:** CHỈ sửa 4 mục dưới đây. Không refactor lân cận, không đổi logic ký request mới (`verifyRequestSignature`).

**Mục 1 — Key trùng trong `buildTelemetryPayload`** (quanh dòng 198-209)
  - Object payload khai báo 2 lần các trường: `embedding_ms`, `retrieval_ms`, `rerank_ms`, `history_summary_ms`, `generation_ms`, `total_ms`.
  - [Bước] Xóa block lặp lại lần thứ 2 (giữ lần đầu, mỗi key chỉ còn 1 lần).
  - [Kiểm tra] `grep -c "embedding_ms:" api/chat.js` trong hàm này chỉ còn 1; `node --check api/chat.js` pass.

**Mục 2 — Mojibake (double-encode UTF-8) trong block request-signing mới** (quanh dòng 1118)
  - Các chuỗi bị hỏng mã hóa, hiển thị lỗi cho người dùng. Sửa lại tiếng Việt đúng:
    - Comment `[Báº¢O Máº¬T #6] ... â€" HMAC ...` → `[BẢO MẬT #6] ... — HMAC ...`
    - `detail: 'Thiáº¿u request token.'` → `detail: 'Thiếu request token.'`
    - `detail: 'Request token khÃ´ng há»£p lá»‡.'` (xuất hiện 2 chỗ) → `detail: 'Request token không hợp lệ.'`
  - [Kiểm tra] `grep -nP "[\x80-\xff]{4,}" api/chat.js` không còn match rác; mở file xác nhận tiếng Việt đọc được.

**Mục 3 — Xóa code chết: block request-signing CŨ đã bị vô hiệu** (quanh dòng 1148-1186)
  - Block cũ bị tắt bằng `if (false && reqToken && reqTime)` và `else if (false && origin)`. Logic thật đã chuyển sang `verifyRequestSignature` (block mới phía trên).
  - [Bước] Xóa hẳn toàn bộ block `if (false ...)` và biến không dùng `reqToken`, `reqTime` khai báo cho nó.
  - [Kiểm tra] `grep -n "false &&" api/chat.js` không còn; chức năng ký request vẫn do `verifyRequestSignature` đảm nhiệm.

**Mục 4 — Validate input trùng**
  - `validateChatRequestBody` đã kiểm tra `userMessage` (rỗng/kiểu/độ dài/injection). Sau khi destructure vẫn còn block `if (!userMessage || typeof userMessage !== 'string' ...)` cũ.
  - [Bước] Xóa block validate inline thừa đó (giữ kết quả từ `validateChatRequestBody`).
  - [Kiểm tra] `node --test test/*.test.js` pass; request thiếu/sai `userMessage` vẫn trả 400.

- **Xác minh tổng:** `node --check api/chat.js` + `npm test` xanh. Sau khi xong, thêm entry vào `06-ai-working-log.md`.

### TASK-UX-01-EXT: Bổ sung bằng chứng 2 run regression + theo dõi 2 quan sát answer-first
- **Mô tả:** Review PR #15 (2026-07-02) phát hiện 3 điểm cần theo dõi sau khi merge answer-first:
  1. **Bằng chứng baseline chưa đủ:** working log ghi "3 run cloud sạch (Run 2, Run 3, Run 5)" nhưng chỉ 1 file báo cáo (Run 3 = `regression-latest.md`) được commit vào `test/results/`. Chuẩn P0.5 trước đây commit đủ 3 file. Cần bổ sung 2 báo cáo Run 2 + Run 5 (nếu còn giữ) hoặc chạy thêm 2 lần sạch nữa và commit — trước khi coi baseline answer-first là chính thức ngang chuẩn P0.5.
  2. **VP01 mất câu hedge:** bản answer-first khẳng định visa thuộc "giấy tờ cư trú" khi nêu mức phạt 500k–2tr (Nghị định 282/2025 Điều 21 nói về chứng nhận tạm trú/thẻ tạm trú; bản dài cũ có câu "không thể khẳng định chắc chắn 100%"). Số tiền + căn cứ đúng nguồn; chỉ cần theo dõi xem có nên thêm lại 1 câu hedge phạm vi áp dụng.
  3. **TR02 không nêu trụ sở Thanh Miếu đã xác minh:** kỳ vọng test là "Match Thanh Miếu, trả nơi nộp/trụ sở nếu có dữ liệu xác minh" — bản mới chỉ hướng online + QLXNC, bỏ qua điểm hỗ trợ trực tiếp Công an Phường Thanh Miếu dù dữ liệu xác minh có sẵn. An toàn nhưng dưới kỳ vọng LOCATION; cân nhắc nới prompt cho phép nêu trụ sở xã/phường như điểm hỗ trợ khi <verified_locations> có match.
- **Liên quan:** `test/results/`, `api/chat.js` (SYSTEM_PROMPT_BASE), bộ test `bo-test-regression-30-cau-*.md` (kỳ vọng TR02)
- **Ưu tiên:** Trung bình (mục 1 nên đóng trước khi công bố baseline; mục 2-3 gom vào vòng regression kế tiếp)

### TASK-02: Cập nhật dữ liệu Pinecone
- **Mô tả:** Bổ sung/cập nhật văn bản pháp luật mới vào Pinecone index khi có Nghị định/Thông tư mới.
- **Liên quan:** `api/chat.js` (PINECONE_NAMESPACE, indexing script trong setup/)
- **Ưu tiên:** Trung bình

### TASK-P0-05-EXT: Vá 2 gap nhỏ còn lại của DURATION_PATTERN (không chặn P0)
- **Mô tả:** Phát hiện qua 3 lần chạy regression baseline P0.5: (1) Duration tiếng Trung dùng lượng từ "个" (vd "3个工作日") không khớp `DURATION_PATTERN` hiện tại (chỉ bắt `\d+\s*工作日` liền nhau, không xử lý "个" chen giữa số và đơn vị) — số liệu quan sát được vẫn đúng (verified qua Pinecone) nhưng thiếu lớp bảo vệ kép nếu retrieval sai. (2) Duration dùng "ngày" trần (không phải "ngày làm việc") không được validator phủ — quyết định phạm vi có chủ đích lúc P0.5 để tránh false-positive (từ "ngày" quá phổ biến trong tiếng Việt), nhưng nghĩa là các claim kiểu "trong vòng 30 ngày" không có validator bảo vệ.
- **Liên quan:** `lib/output-validator.js` (`DURATION_PATTERN`)
- **Ưu tiên:** Thấp — không phải hallucination đã xác nhận, chỉ là thiếu lớp phòng thủ.

### TASK-P0-04-EXT: Backfill metadata `thoi_han` và `mau_don` cho toàn bộ record Pinecone
- **Mô tả:** P0.4 đã thêm cơ chế đọc field `le_phi`/`phi` từ metadata Pinecone và bơm thành khối `[FACTS ĐÃ XÁC MINH]` vào prompt (xem `buildVerifiedFactsLine` trong `api/chat.js`). Khảo sát backup `data/pinecone-backups/2026-07-01-*.json` cho thấy: chỉ có `le_phi`/`phi` được chuẩn hóa cho 34/38 record (đợt vá phí ngày 2026-07-01); KHÔNG có field `thoi_han` (thời gian giải quyết) hay `mau_don` (mã mẫu đơn) nào trong metadata gốc. Code đã sẵn sàng đọc 2 field này nếu được bổ sung, nhưng cần backfill dữ liệu thật vào Pinecone trước.
- **Liên quan:** `setup/` (script upsert Pinecone), `api/chat.js` (`buildVerifiedFactsLine`)
- **Ưu tiên:** Trung bình — giảm rủi ro hallucination cho "thời gian giải quyết" và "mẫu đơn", 2 loại lỗi đã ghi nhận trong regression (TYPO01, GV01, HS02).

### [KHẢO SÁT XONG — P1.1.4] Title/van_ban trong metadata Pinecone
- **Kết quả:** Kiểm tra `data/pinecone-backups/2026-07-01-pre-update-backup-original-metadata.json` (34 record `tthc_*` đã vá phí) — **0/34 thiếu `title`**; không record nào có field `van_ban` riêng, nhưng citation fallback trong `api/chat.js` (`m.metadata?.van_ban || m.metadata?.source_file || m.metadata?.source || m.metadata?.source_decision`) đã tự rơi về `source_decision` (vd `"5568/QD-BCA"`) nên không phải gap thực sự — không cần backfill thêm ở phase này. Chưa khảo sát các record ngoài batch phí (nếu có record `tru_so` hoặc category khác thiếu title, cần khảo sát riêng khi động tới).
- **Ưu tiên:** Thấp — không hành động thêm, chỉ ghi nhận.

### TASK-P1-02: Mở rộng test chatbot và trình duyệt
- **Mô tả:** Bổ sung CORS/injection/SSE parser và E2E desktop-mobile-keyboard ngoài 39 unit test hiện có.
- **Liên quan:** `api/chat.js`, `js/gemini.js`, `js/chatbot.js`, `test/`
- **Ưu tiên:** Trung bình

---

## Không làm lúc này

- Thêm framework frontend (React, Vue) — quyết định dùng Vanilla JS có chủ đích, xem 03-decisions.
- Xây hệ thống đăng nhập / auth người dùng — ngoài scope dự án.
- Tích hợp thanh toán — ngoài scope.

---

## Đã hoàn thành gần đây

- [2026-07-02] TASK-UX-01: Answer-first + chống ngắt giữa câu (Đồng bộ ngân sách 120/250, Unicode-safe word count. Hoàn thành 3 run regression cloud sạch liên tiếp: Run 2, Run 3, Run 5 với TRUNCATED=0, ERROR=0. Median giảm sâu từ 334 từ xuống còn 93 từ).
- [2026-06-29] Sửa dứt điểm các lỗi P0 sau Regression Run 1 (fix citation `undefined`, lọc intent chính xác, thêm luật cấm hallucinate mức phạt/địa danh vào `SYSTEM_PROMPT_BASE`)
- [2026-06-29] Chạy Regression Test (30 câu) và Fix thuật toán nhận diện địa danh `Published_Locations` (nhận diện đúng các tên rút gọn có chứa dấu câu)
- [2026-06-27] Tích hợp chatbot/gemini vào UI; thay FAQ tĩnh cũ bằng chatbot RAG streaming
- [2026-06-27] Runtime chỉ đọc Published_Locations; validation tọa độ và data-quality report
- [2026-06-27] Pipeline staging/approval Google Sheets: allowlist, approve/reject/revoke, audit và rollback path
- [2026-06-27] Turnstile/rate-limit storage fail-closed; DOMPurify được nâng và pin SRI
- [2026-06-27] Chứng minh rate limiter atomic dưới tải đồng thời 50 request, có rollback quota rò
- [2026-06-27] Tách metric/diagnostic telemetry, thêm TTL metadata, sanitizer, gate expiry/sampling và RTDB prune script
- [2026-06-27] Telemetry tối thiểu, bỏ RTDB hardcode; bật OSM attribution
- [2026-06-27] Sửa close-mid-stream chatbot, modal mobile full-screen và citation ưu tiên official_url
- [2026-06-27] Node test runner 24 test, build artifact thật và GitHub Actions CI
- [2026-06-27] Khởi tạo bộ não dự án (CLAUDE.md, AGENTS.md, docs/brain/)
- [2025] Fix OpenStreetMap 403 bằng cách xóa no-referrer meta tag
- [2025] Cải thiện hiển thị Desktop sidebar
- [2025] Chuyển logic Google Sheet sang Vercel Serverless để ẩn Sheet ID
- [2025] Implement RAG + Pinecone + Gemini Embedding
- [2025] Bảo mật: CORS whitelist, HMAC signing, Turnstile CAPTCHA, prompt injection detection
---

## Cap nhat bo sung 2026-07-09

### TASK-TTHC-CATALOG-01: Backfill 4 thu tuc thieu toan van vao backup (chi anh huong mode backup)
- **Mo ta:** O mode live (mac dinh khi co key) ca 4 id (`5568-tinh-04`, `5568-tinh-05`, `5568-tw-08`, `5568-tw-10`) da co day du, `missingFromBackups` rong. Task nay chi con lien quan khi chay offline `--source=backups`: backup repo van thieu toan van 4 id nay nen catalog offline se hep hon live. Bo sung backup neu muon snapshot offline day du.
- **Lien quan:** `scripts/generate-tthc-catalog.js`, `data/tthc-catalog.json`, `data/pinecone-backups/`
- **Uu tien:** Trung binh
- **Kiem tra:** `npm run gen:catalog`; `npm test`; xac nhan `missingFromBackups` giam khi bo sung backup va catalog van build duoc o mode backup.

### Hoan thanh gan day
- [2026-07-10] TASK-FEEDBACK-01: Tinh nang Bao cao Chatbot. Them `api/feedback.js` (nhan vote 👍/👎 + form bao cao chi tiet), `js/gemini.js` `sendFeedback`, noi 2 nut co san trong `js/chatbot.js` + form + `turn_id` client, `scripts/read-feedback.js` de admin doc bao cao theo ngay. Luu RTDB `chat_feedback/<date_key>`, sanitize PII, TTL 90 ngay. `npm test` 144/144. Chi tiet: `03-decisions.md` (2026-07-10) va `06-ai-working-log.md`. Ton dong (tuy chon): (1) neu muon dashboard/query manh hon co the chuyen luu sang Firestore collection thay RTDB; (2) neu muon thong bao tuc thoi co the them webhook email/Telegram.
- [2026-07-10] Fix catalog guide rong + dong bo `npm run gen:catalog`: generator mac dinh sinh catalog day du co guide, nhung bo guide khong co noi dung wiki va khong suy phi tu tieu de. Snapshot con 92 muc (35 tthc + 57 guide co noi dung), van du 17 linh vuc. `npm test` 121/121.
- [2026-07-10] Dao Huong 1: catalog commit gom ca guide = 137 muc (35 tthc + 102 guide), phu du 17 linh vuc. Them bo loc `INTERNAL_GUIDE_TITLE_PATTERN` loai 8 muc noi dung noi bo chatbot. `npm test` 119/119, build sach. Ton dong: guide `procedure_id=guide:*` chua direct-link tu nut doi sanh trong chat.
- [2026-07-09] Hoan thien Goi A cho catalog TTHC: preview server tra MIME JSON, architecture/decision/current-tasks ghi nhan luong catalog tinh va backlog backfill.
- [2026-07-09] Mo rong generator catalog sang Pinecone live + group `guide_*`: danh muc preview hien 149 thu tuc, co them cu tru, can cuoc, dang ky xe, nganh nghe ANTT.
- [2026-07-09] Huong 1: loc catalog ve CHI thu tuc that (`source_type='tthc'`), guide thanh opt-in `--include-guides`; them dedupe title+cap; fix `missingFromBackups` (rong o live mode). `data/tthc-catalog.json` = 35 thu tuc that, khong con lo noi dung noi bo chatbot.

---

## Cap nhat 2026-07-10 — Nang cap do chinh xac / UX / hieu nang (3 giai doan)

Trien khai theo ke hoach review 2026-07-10. Moi giai doan = 1 nhanh feature:

- **[DONE] Giai doan 1 — hieu nang** (`feat/perf-quick-wins`): defer 4 script ban do (`index.html`),
  cache-control static (`vercel.json`). `npm test` 144/144, build sach.
- **[DONE-code] Giai doan 2 — do chinh xac retrieval** (`feat/rag-accuracy`): exact-token boost,
  query rewrite follow-up, model tien ich → flash-lite, taskType embedding gated. Script
  `setup/backfill-tthc-metadata.js` + `setup/reembed-corpus.js` (mac dinh KHONG ghi Pinecone).
  `npm test` 151/151, smoke TR03 PASS.
- **[DONE-code] Giai doan 3 — UX + khep vong** (`feat/chat-ux`, stack tren Giai doan 2): SSE status,
  starter chips, guide deep-link theo title, Telegram alert opt-in. `npm test` 154/154.

### Con lai (BUOC NGUOI DUNG — can key/quyet dinh):
1. **Chay 3 run regression 30 cau sach** (`node scripts/run-regression.js`) truoc khi cong bo baseline moi
   cho Giai doan 2 (doi model rerank + boost + rewrite). Commit bao cao vao `test/results/`.
2. **Backfill metadata**: `node setup/backfill-tthc-metadata.js` → duyet `data/tthc-metadata-draft.csv`
   → `--apply` de ghi `thoi_han`/`mau_don` vao Pinecone.
3. **Re-embed corpus** (neu muon bat taskType): `node setup/reembed-corpus.js --apply --target <ns>` →
   dat `PINECONE_NAMESPACE=<ns>` + `EMBED_TASK_TYPE=RETRIEVAL_QUERY` tren Vercel.
4. **Telegram alert** (tuy chon): dat `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` tren Vercel.
5. **Push + PR** cac nhanh (chua push — theo quy tac khong tu push `main`).
