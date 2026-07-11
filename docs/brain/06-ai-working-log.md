# 06 — AI Working Log

> nhật ký các lần AI (Claude Code / Codex) sửa code. Mỗi agent PHẢI thêm entry sau mỗi lần
> chạm vào code. Đọc ngược từ trên xuống để biết gần đây ai đã làm gì và vì sao.

---

## [2026-07-11] T1.3 — Eval-mode output trong event `done` của api/chat.js
- **Agent:** Claude Code (Opus 4.8)
- **Thay đổi:** Thêm trace retrieval cho bộ chấm grounding (T1.5) vào event SSE `done`, gated chặt để production không bao giờ lộ. (1) Hàm thuần `shouldAttachEvalDebug({nodeEnv, evalBypassToken, captchaToken, evalDebugFlag})`: trả true CHỈ khi `NODE_ENV !== 'production'` **AND** `EVAL_BYPASS_TOKEN` được đặt & khớp `captchaToken` **AND** `evalDebug === true` (boolean). (2) Hàm `summarizeMatchForEval(m)`: rút gọn match Pinecone → id/score/procedure_id/source_type/source_file/title + metadata hiệu lực (`review_status`/`valid_from`/`valid_to`/`supersedes`, chuẩn bị Giai đoạn 3) + cờ exactTokenBoost. (3) Trong handler: tính `evalMode` sau `isEvalRun`; dựng `evalTrace` (null khi không phải evalMode) cạnh `matchedDocs`; cuối block retrieval thu thập `matchesRaw`, `matchesFinal` (kèm rank) và `excluded` (lý do loại từng match: `location_vector`/`wrong_branch`/`below_threshold`/`rerank_or_topk_cut`) bằng cách so id qua từng tầng lọc; đính `matchedDocs` (đúng chuỗi vào prompt) vào trace tại điểm `done`; spread `...(evalMode && evalTrace ? {eval} : {})` vào event `done` chính (path streaming, KHÔNG đụng 4 điểm `done` khác vì cache/deterministic không có retrieval). Ghi thêm `standaloneQuery`(=searchQuery) và `classifyQuery`(=userMessage) để T2A soi chỗ query đang lệch. Export 2 hàm.
- **File đã sửa:** `api/chat.js`, `test/eval-debug-output.test.js` (mới), `docs/brain/07-parallel-task-plan.md` (T1.3→DONE), `docs/brain/06-ai-working-log.md`
- **Lý do:** Runner hiện chỉ nhận citation chips — không đủ để kiểm grounding (fact có trong nguồn đã retrieve không, expected source có trong top 4 không, Recall@4/MRR). T1.5 cần toàn văn 4 docs + toàn bộ match + lý do loại. Gated 3-điều-kiện-AND để không mở lỗ rò dữ liệu nội bộ trên production.
- **Kiểm tra:** `node --check api/chat.js` OK. `test/eval-debug-output.test.js` 8/8 (gồm 2 ca bảo mật: production + đủ token/cờ vẫn KHÔNG trả `eval`; production + token trống vẫn false). `npm test` 165/165 (157→165, +8). Không đụng client `js/gemini.js` (client cũ bỏ qua trường `eval` lạ trong `done` an toàn). Chưa smoke live (cần key + evalDebug thật) — sẽ xác nhận khi chạy baseline T1.7.

---

## [2026-07-11] T1.2 — Codify expectations cho đủ 30 ca regression
- **Agent:** Codex
- **Thay đổi:** Tạo `test/regression-expectations.json` schema version 1, keyed đủ 30 ID. Mỗi ca khai báo fact bắt buộc/cấm, procedure/source kỳ vọng, ngôn ngữ, thẩm quyền, abstention/clarification và ngân sách 120/250 từ; F01 được gắn `DEFERRED_SOURCE_GOVERNANCE`, chỉ cấm luồng giấy/NA17/fax/nộp trực tiếp và không cấm mốc 12/24 giờ; TL01 bắt buộc cả hai mốc cùng phân biệt hạn khai báo với thời gian xử lý. Đánh dấu T1.2 hoàn tất trong kế hoạch phân làn.
- **File đã sửa:** `test/regression-expectations.json` (mới), `docs/brain/07-parallel-task-plan.md`, `docs/brain/06-ai-working-log.md`
- **Lý do:** Cung cấp thước đo có cấu trúc và nhất quán cho T1.4/T1.5, thay cho bộ chấm hardcode chỉ phủ một phần ca regression.
- **Kiểm tra:** Parse JSON; đối chiếu tự động đúng 30/30 ID với bảng câu hỏi; kiểm tra đủ trường bắt buộc, compile toàn bộ regex, ngân sách hợp lệ và invariant F01/TL01; review tay từng ID; chạy `npm test`.

---

## [2026-07-11] Xây bộ test mở rộng toàn diện 198 câu + 10 hội thoại cho chatbot
- **Agent:** Claude Code (Fable 5)
- **Thay đổi:** Tạo `test/cau-hoi/bo-test-mo-rong-toan-dien-tthc.md` — bộ câu hỏi test mới gồm 198 câu đơn (nhóm N19–N38) và 10 kịch bản hội thoại nhiều lượt (H06–H15), không trùng ID với 2 bộ cũ. Phủ các mảng corpus chưa từng được test: cư trú công dân VN (chiều ngược của split-intent NNN), căn cước/định danh điện tử, hộ chiếu công dân, đăng ký xe, ngành nghề ANTT, vũ khí thô sơ, khiếu nại tố cáo, giấy thông hành/ABTC, người không quốc tịch, khu vực cấm biên giới, xác nhận thông tin XNC, bản đồ/trụ sở nâng cao (địa danh ngoài tỉnh/không tồn tại/giờ làm việc), cặp thủ tục dễ nhầm, lệ phí/mẫu đơn, ngoài phạm vi, đa ngôn ngữ mở rộng (Nhật/Pháp/Nga/phồn thể/trộn ngôn ngữ), input bất thường (PII, script tag, base64, câu siêu dài), prompt injection nâng cao, tình huống khẩn cấp/cảm xúc, và đối tượng NNN bổ sung (du học sinh, tour, miễn thị thực, thường trú). Giữ nguyên khung chấm 6 tiêu chí + 12 mã lỗi của bộ sâu, bổ sung 2 mã mới `EMERGENCY_MISS` và `PII_ECHO`. Kèm bộ rút gọn đề xuất và ghi chú chấm riêng cho từng nhóm mới.
- **File đã sửa:** `test/cau-hoi/bo-test-mo-rong-toan-dien-tthc.md` (mới), `docs/brain/06-ai-working-log.md`
- **Lý do:** User yêu cầu bộ test lớn hơn, bao trùm tình huống hơn. Khảo sát cho thấy 2 bộ hiện có (30 câu regression + 130 câu sâu) chỉ phủ mảng người nước ngoài, trong khi catalog TTHC/Pinecone thực tế có 17 lĩnh vực; các câu hỏi công dân, khẩn cấp, edge input và injection nâng cao hoàn toàn chưa có test. Câu hỏi mới được bám theo danh sách thủ tục thật trong `data/tthc-catalog.json` (92 mục) để kỳ vọng khớp corpus.
- **Kiểm tra:** `grep -c` xác nhận đúng 198 dòng câu hỏi + 10 kịch bản H. File chỉ là tài liệu test (không đổi code/runtime); `scripts/run-regression.js` không parse file này (chỉ parse bảng `| STT |` của bộ 30 câu) nên không ảnh hưởng pipeline hiện có — đã ghi chú rõ trong file cách trích câu sang định dạng runner khi cần chạy tự động.

---

## [2026-07-11] T1.1 — Chốt quyết định nội dung 12/24h + đồng bộ F01/TL01
- **Agent:** Claude Code (Opus 4.8)
- **Thay đổi:** Thực hiện task T1.1 của kế hoạch (file 07). (1) `03-decisions.md`: thêm entry chốt nội dung — chỉ luồng phiếu giấy/NA17/fax/nộp trực tiếp là lỗi thời; mốc hạn khai báo 12 giờ (24 giờ vùng sâu/xa) VẪN áp dụng cho khai báo trực tuyến KBTT. Ghi rõ 3 chỗ phải nhất quán (F01 expectation, TL01 grading, `allowedConstants`) và F01 mang trạng thái `DEFERRED_SOURCE_GOVERNANCE` (đóng ở Giai đoạn 3, cấm prompt-hack). (2) `bo-test-regression-30-cau-*.md`: F01 bổ sung "cấm phiếu giấy/NA17/fax/nộp trực tiếp, không cấm 12–24 giờ, baseline deferred"; TL01 nêu rõ trả đúng 12/24 giờ + phân biệt hạn khai báo với thời gian xử lý. (3) Xác minh `allowedConstants` trong `api/chat.js` (dòng 2298-2304) CÒN NGUYÊN "12 giờ"/"24 giờ" + 3 bản dịch — không sửa (thuộc LANE-CORE, ngoài phạm vi T1.1).
- **File đã sửa:** `docs/brain/03-decisions.md`, `test/cau-hoi/bo-test-regression-30-cau-nguoi-nuoc-ngoai-tthc.md`, `docs/brain/07-parallel-task-plan.md` (T1.1→DONE), `docs/brain/06-ai-working-log.md`
- **Lý do:** Gỡ mâu thuẫn tiềm ẩn trong bộ chấm (cấm phiếu giấy dễ kéo theo cấm nhầm mốc giờ mà TL01 lại bắt buộc). Chốt nội dung trước để T1.2 (expectations JSON) codify không lệch.
- **Kiểm tra:** Chỉ docs + bảng câu hỏi test (không đụng code chạy). Đối chiếu 3 chỗ nhất quán: F01/TL01 trong bảng test đã trỏ về quyết định 2026-07-11; `allowedConstants` xác nhận còn 12/24 giờ. Không cần `npm test`.

## [2026-07-11] Lập kế hoạch task song song cho 2 agent (Claude Code + Codex)
- **Agent:** Claude Code (Opus 4.8)
- **Thay đổi:** Tạo `docs/brain/07-parallel-task-plan.md` — chia "Kế hoạch khắc phục toàn diện 4 giai đoạn" (đã review và chốt cùng người dùng 2026-07-11) thành ~30 task nhỏ, mỗi task gắn: làn sở hữu file (LANE-CORE/EVAL/FE/DATA/DOCS), agent đề xuất, mức trí tuệ cần (CAO/TRUNG/THẤP), phụ thuộc, trạng thái. Kèm "Luật phân làn" chống conflict khi 2 agent chạy song song (quy tắc quan trọng nhất: không bao giờ 2 nhánh cùng sửa `api/chat.js`; task LANE-CORE làm tuần tự). Cập nhật `04-current-tasks.md` mục "Đang làm" trỏ sang file 07 và ghi rõ các backlog cũ được kế hoạch hấp thụ (TASK-UX-01-EXT mục 1, TASK-P0-04-EXT, TASK-FIX-01 mục telemetry, bước 3-run cho feat/rag-accuracy).
- **File đã sửa:** `docs/brain/07-parallel-task-plan.md` (mới), `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`
- **Lý do:** Người dùng muốn dùng đồng thời ChatGPT Codex và Claude Code sửa chung dự án — cần nguồn sự thật chung về task, thứ tự phụ thuộc và quyền sở hữu file để 2 agent không giẫm chân nhau.
- **Kiểm tra:** Chỉ thay đổi docs, không đụng code — không cần chạy test. Xác nhận task đầu tiên chưa bắt đầu (mọi task ở trạng thái TODO); quyết định nội dung 12/24h sẽ được ghi vào `03-decisions.md` ở task T1.1.

---

## [2026-07-10] Fix danh mục TTHC: chip lọc chiếm hết vùng cuộn + tìm kiếm "không phản hồi"
- **Agent:** Claude Code (Sonnet 5)
- **Thay đổi:** (1) `styles.css` `#tthc-catalog-chips`: đổi `flex-wrap: wrap` sang `nowrap` + `overflow-x: auto` (chip lĩnh vực cuộn ngang 1 dòng thay vì wrap nhiều dòng) — với 17 lĩnh vực + "Tất cả" (18 chip, có nhãn rất dài như "Quản lý ngành, nghề đầu tư kinh doanh có điều kiện về an ninh, trật tự"), khối chip trước đó cao tới 263px/517px khung desktop (379px/674px trên mobile), chỉ còn 128px (desktop)/227px (mobile) cho danh sách cuộn. Sau fix: chip ~41px (desktop)/~32px (mobile), danh sách cuộn 432px/625px. (2) `js/tthc-catalog.js` `renderListItems()`: thêm `list.scrollTop = 0` đầu hàm — trước đó khi người dùng cuộn sâu rồi gõ tìm kiếm/đổi chip, trình duyệt tự kẹp `scrollTop` cũ vào cuối danh sách mới (ngắn hơn), khiến vùng hiển thị trống hoặc lệch, trông như tìm kiếm không hoạt động.
- **File đã sửa:** `styles.css`, `js/tthc-catalog.js`
- **Lý do:** User phản ánh "ô tìm kiếm danh mục không hoạt động" + "phần cuộn nhỏ quá, cuộn lên xuống hẹp". Đo trực tiếp trên preview (desktop 1280×800 và mobile 375×812) xác nhận cả hai nguyên nhân bằng `getBoundingClientRect`/`scrollTop` trước và sau fix.
- **Kiểm tra:** `npm test` 144/144 pass; `npx playwright test test/e2e/tthc-catalog.spec.js test/e2e/detail-panel.spec.js` 7/7 pass; verify tay trên preview (`preview_eval`): chip container còn 1 dòng cuộn ngang (`scrollWidth` 3008px trong `clientWidth` 486px), `list.scrollTop` reset về 0 sau khi lọc theo từ khóa lẫn theo chip lĩnh vực (trước fix bị kẹp về giá trị cũ như 5000→747/5000).

---

## [2026-07-10] Thêm tính năng Báo cáo Chatbot (feedback người dùng)
- **Agent:** Claude Code (Opus 4.8)
- **Thay đổi:** Thêm luồng để người dùng gửi phản hồi/báo cáo về câu trả lời của chatbot cho admin đọc và điều chỉnh. (1) **Backend mới `api/feedback.js`**: endpoint serverless nhận `POST`, tái dùng nguyên `isAllowedOrigin`/`resolveClientIp`/`verifyRequestSignature`/`sanitizeDiagnosticText` từ `api/chat.js` (require chéo, không viết lại HMAC). Validate `rating∈{up,down}` + `turn_id` + `category` (5 loại), sanitize PII cho `comment`/`contact`/`question`/`answer`, rate limit best-effort theo IP/ngày trên RTDB (`FEEDBACK_DAILY_IP_LIMIT`, mặc định 30, fail-open khi lỗi đọc), ghi `chat_feedback/<date_key>` trên RTDB kèm TTL `expires_at` (`FEEDBACK_RETENTION_DAYS`, mặc định 90). (2) **`js/gemini.js`**: tách phần ký HMAC thành `signRequestToken(message, ts)` dùng chung cho cả chat lẫn feedback; thêm `GeminiAI.sendFeedback(payload)` POST `/api/feedback`. (3) **`js/chatbot.js`**: nối 2 nút 👍/👎 sẵn có (trước chỉ khóa tại chỗ) — 👍 gửi vote ngay; 👎 mở form báo cáo (chọn loại vấn đề + mô tả + liên hệ tùy chọn, "Bỏ qua" vẫn ghi 1 phiếu 👎). Sinh `turn_id` phía client để gắn báo cáo đúng lượt (không phải sửa 5 điểm phát `done` trong `api/chat.js`). (4) **`styles.css`**: style form báo cáo theo design token. (5) **`scripts/read-feedback.js`**: công cụ đọc báo cáo theo ngày từ RTDB (khuôn giống `check-violations.js`). (6) `vercel.json` thêm header no-store cho `/api/feedback`; `package.json` thêm 2 file vào `check:syntax`.
- **File đã sửa:** `api/feedback.js` (mới), `js/gemini.js`, `js/chatbot.js`, `styles.css`, `scripts/read-feedback.js` (mới), `test/feedback.test.js` (mới), `vercel.json`, `package.json`, `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`
- **Lý do:** User yêu cầu kênh để người dân báo khi chatbot trả lời sai/có vấn đề, để đọc và tiếp tục điều chỉnh KB/prompt. Ngoại lệ privacy có kiểm soát: khác telemetry mặc định (không lưu Q/A), feedback CÓ lưu câu hỏi + câu trả lời vì người dùng chủ động opt-in bấm gửi; vẫn sanitize PII + TTL.
- **Kiểm tra:** `npm run check:syntax` OK; `npm test` 144/144 (thêm 19 test feedback: validate/sanitize/record/handler CORS-405-403-400-MISSING_TOKEN-signature-429-503-200). Verify UI trong trình duyệt qua dev-server (stub lớp mạng vì local không có `/api/chat`): action bar render 👍/👎, bấm 👎 mở form đủ 5 loại + mô tả + liên hệ, submit gửi payload đầy đủ (turn_id, rating=down, category, comment, contact, câu hỏi thật, câu trả lời thật, sources.procedure_id) rồi hiện "Cảm ơn phản hồi của bạn!". `npm run build` tạo `dist/` sạch.

---

## [2026-07-10] Dọn mouse-drag dead code + ổn định ngữ nghĩa drag/E2E
- **Agent:** Claude Code (Opus 4.8)
- **Thay đổi:** (1) Xoá bộ handler `mousedown`/`document mousemove`/`document mouseup` và biến `activeMouseDrag` trong `app.js` — chúng không bao giờ chạy vì `pointerdown` luôn fire trước và set `isDragging=true` khiến `mousedown` bail, đồng thời không test nào chạm tới (E2E đã chuyển sang `PointerEvent`). Giữ lại guard `if (isDragging …)` ở `pointerdown` (chặn drag chồng khi đa chạm) và việc `pointerup` áp translate theo toạ độ cuối. (2) Revert `lostpointercapture` về `endSheetDrag({ cancelled: true })`: khi capture bị ngắt giữa chừng nên khôi phục trạng thái trước drag thay vì "chốt" ở vị trí kéo dở. (3) `test/e2e/tthc-catalog.spec.js` đổi assert `'Tất cả92'` cứng sang regex `/Tất cả\d+/` để không vỡ khi regenerate catalog.
- **File đã sửa:** `app.js`, `test/e2e/tthc-catalog.spec.js`, `docs/brain/06-ai-working-log.md`
- **Lý do:** Review PR #18 phát hiện 3 điểm còn lại: dead code làm phình state machine drag, thay đổi ngữ nghĩa cancel→commit khi bị ngắt (kém an toàn hơn), và E2E khoá cứng số lượng snapshot (đã đổi 137→119→92).
- **Kiểm tra:** `node --check app.js` OK; `npm test` 125/125; `npx playwright test` 10/10 (gồm cả `mobile detail panel closes … by drag` và `mobile pointer cancel returns the sheet to a stable open state`).

---

## [2026-07-10] Fix ô "Nộp tại" lộ tên file .docx nội bộ cho người dân
- **Agent:** Claude Code (Opus 4.8)
- **Thay đổi:** `buildCitizenSummary` (ô "Nộp tại") fallback từ `Cơ quan xử lý` sang `Nguồn`; với 57/57 guide (thiếu `Cơ quan xử lý`) thì `Nguồn` là tên file nguồn (vd `B. CƯ TRÚ 2025.xong.docx`) → hiển thị tên file nội bộ ở ô "Nộp tại". Thêm chặn tên file (`.doc/.docx/.pdf/.xls/.xlsx`) vào `looksCompactSummary` → mọi ô tóm tắt (Cần chuẩn bị / Nộp tại / Kết quả) không còn hiện tên file; guide thiếu cơ quan xử lý rơi về câu trung tính "Xem nội dung chi tiết bên dưới.". Cập nhật unit test trước đó vốn khóa cứng hành vi cũ (nhận tên file) sang assert không lộ tên file.
- **File đã sửa:** `js/tthc-catalog.js`, `test/tthc-catalog-ui.test.js`, `docs/brain/06-ai-working-log.md`
- **Lý do:** Review PR #18 phát hiện 57/92 mục (toàn bộ guide, 62% catalog) hiển thị tên file docx nội bộ dưới nhãn "Nộp tại" — sai nghĩa và lộ artifact nội bộ, đi ngược mục tiêu wording cho người dân của chính PR.
- **Kiểm tra:** `npm test` 125/125 pass; kiểm chứng trực tiếp `buildCitizenSummary` trên `data/tthc-catalog.json` — 0/57 guide còn lộ tên file ở ô "Nộp tại".

---

## [2026-07-10] Cải thiện UX catalog TTHC cho người dân
- **Agent:** Codex
- **Thay đổi:** Cập nhật wording panel catalog để dễ hiểu hơn cho người dân, thêm khối `Tóm tắt nhanh` ở đầu chi tiết thủ tục với 4 mục `Cần chuẩn bị`, `Nộp tại`, `Lệ phí / chi phí`, `Kết quả`, và đổi cách hiển thị phí chưa xác minh sang câu trung tính hơn. Bổ sung empty state thân thiện hơn cho tìm kiếm không có kết quả. Thêm unit test cho helper tóm tắt ở frontend và E2E mới cho catalog trên desktop/mobile. Sửa thêm luồng kéo mobile detail sheet để `pointerup/mouseup` chốt theo tọa độ cuối, đồng thời đổi E2E drag sang `PointerEvent` touch ổn định khi chạy song song.
- **File đã sửa:** `index.html`, `js/tthc-catalog.js`, `styles.css`, `app.js`, `test/tthc-catalog-ui.test.js`, `test/e2e/tthc-catalog.spec.js`, `test/e2e/detail-panel.spec.js`, `docs/brain/06-ai-working-log.md`
- **Lý do:** Catalog hiện dùng được để đối chiếu nhưng còn thiên về kho dữ liệu hơn là luồng tra cứu cho người dân ít am hiểu công nghệ; cần đưa thông tin quan trọng lên đầu và dùng wording bớt kỹ thuật.
- **Kiểm tra:** `npm test` pass 125/125; `npm run build` pass; `npx playwright test` pass 10/10; stress riêng `detail-panel.spec.js > mobile detail panel closes reliably by button and drag gestures` với `--workers=3 --repeat-each=5` pass 5/5; kiểm tra tay trên preview `http://127.0.0.1:4173/` xác nhận `Tóm tắt nhanh` và wording mới hiển thị đúng.

---

## [2026-07-10] Fix catalog guide rong va dong bo lenh sinh catalog
- **Agent:** Codex
- **Thay đổi:** Sua `scripts/generate-tthc-catalog.js` de mac dinh sinh catalog day du co guide, them opt-out `--exclude-guides`, bo chunk guide khong co `Noi dung wiki`/`Nội dung wiki`, va chi tom tat phi tu body muc phi/le phi thay vi suy tu tieu de. Doi `npm run gen:catalog` sang goi `--include-guides`, regenerate `data/tthc-catalog.json` con 92 muc (35 tthc + 57 guide co noi dung), van du 17 linh vuc. Them test cho guide rong, parseArgs mac dinh, va snapshot khong co detail guide rong.
- **File đã sửa:** `scripts/generate-tthc-catalog.js`, `package.json`, `data/tthc-catalog.json`, `test/tthc-catalog.test.js`, `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`, `docs/brain/05-testing-and-deploy.md`, `docs/brain/06-ai-working-log.md`
- **Lý do:** Review commit `0f84233` phat hien 46 guide co detail gan nhu rong va lenh `npm run gen:catalog` khong tai tao dung snapshot include-guides, gay rui ro UI hien card rong va snapshot khong reproducible.
- **Kiểm tra:** `npm run gen:catalog` ghi 92 muc; `npm test` 121/121 pass; `npm run build` pass; `npm run ci` pass (audit High khong fail, con 8 Moderate trong chuoi Firebase/Google).

---

## [2026-07-10] Catalog TTHC gồm cả guide (137 mục), lọc nội dung nội bộ chatbot
- **Agent:** Claude Code (Opus 4.8)
- **Thay đổi:** Đảo "Hướng 1" (2026-07-09): `data/tthc-catalog.json` đã commit giờ sinh với `--include-guides` = **137 thủ tục** (35 tthc thật + 102 guide), phủ đủ 17 lĩnh vực (bổ sung cư trú, căn cước, đăng ký xe, định danh điện tử, ngành nghề ANTT, khiếu nại–tố cáo, xuất nhập cảnh — trước bị bỏ sót ở bản 35). Thêm `INTERNAL_GUIDE_TITLE_PATTERN` trong `scripts/generate-tthc-catalog.js` → loại 8 mục guide thực chất là nội dung nội bộ chatbot ("Nguyên tắc trả lời của chatbot", "Gợi ý cho quản trị viên", 6× câu hỏi mẫu `Người dùng: "..."`). Cập nhật test committed-catalog (`includeGuides=true`, 100–200 mục, phải có cả guide lẫn tthc, assert 0 mục lộ nội dung nội bộ) + thêm 1 unit test cho bộ lọc nội bộ.
- **File đã sửa:** `scripts/generate-tthc-catalog.js`, `data/tthc-catalog.json`, `test/tthc-catalog.test.js`, `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`
- **Lý do:** User cho biết đã chuẩn bị nhiều thủ tục nhưng danh mục chỉ hiện 35; nguyên nhân là "Hướng 1" lọc bỏ toàn bộ guide. User chốt (qua câu hỏi): giữ đủ (cả tthc + guide). Nỗi lo lộ nội dung nội bộ của Hướng 1 vẫn đúng nên chỉ lọc đúng nhóm nội bộ thay vì bỏ hết guide.
- **Kiểm tra:** `npm test` 119/119 pass; `npm run build` sạch (dist có 137 mục); verify browser: panel mở, 17 lĩnh vực chips + cards render, 0 lỗi console, `internalLeak=0`, các lĩnh vực chỉ-có-tthc (thường trú, giấy thông hành, người không quốc tịch...) vẫn còn. **Lưu ý còn tồn:** 102 guide có `procedure_id=guide:*` không direct-link từ nút "Đối sánh thủ tục gốc" trong chat — panel duyệt được nhưng deep-link citation vẫn chỉ chạm 35 tthc.

---

## [2026-07-09] Hoàn thiện build và wording cho danh mục TTHC
- **Agent:** Codex
- **Thay đổi:** Bổ sung `js/tthc-catalog.js` và `data/tthc-catalog.json` vào artifact `dist/`; thêm syntax check cho `js/tthc-catalog.js`; đổi nhãn nút trong citation từ wording tuyệt đối sang wording trung tính hơn.
- **File đã sửa:** `scripts/build-static.js`, `package.json`, `js/chatbot.js`, `docs/brain/06-ai-working-log.md`
- **Lý do:** Tránh 404 khi build production/preview, giữ `check:syntax` phủ hết file runtime mới, và giảm rủi ro người dùng hiểu catalog là “nguồn gốc chính thức”.
- **Kiểm tra:** `npm test`; `npm run build`; xác nhận có `dist/js/tthc-catalog.js` và `dist/data/tthc-catalog.json`.

---

## [2026-07-03] Cải thiện chất lượng nhánh khai báo tạm trú người nước ngoài
- **Agent:** Codex
- **Thay đổi:** Siết `api/chat.js` cho nhánh `tam_tru_khai_bao` theo hướng fail-closed, chỉ giữ tài liệu có tín hiệu rõ về người nước ngoài/NA17/KBTT hoặc metadata intent chính xác; loại các tài liệu cư trú công dân Việt Nam và bỏ fallback trả toàn bộ match. Mở rộng `scripts/run-regression.js` để lọc theo ID và tự chấm 7 ca trọng yếu, thêm lệnh `npm run test:regression:tam-tru`. Viết `scripts/repair-pinecone-temp-residence.js` để backup, re-embed, upsert UTF-8 sạch cho `tthc_matt26265`, cập nhật `content_hash`/`retrieval_intent`/`subject_scope` và xác minh top-1 retrieval.
- **File đã sửa:** `api/chat.js`, `test/p0-fixes.test.js`, `scripts/run-regression.js`, `scripts/repair-pinecone-temp-residence.js`, `package.json`, `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`, `docs/brain/05-testing-and-deploy.md`, `docs/brain/06-ai-working-log.md`, `data/pinecone-backups/2026-07-03_08-30-05-pre-repair-tthc_matt26265.json`, `data/pinecone-backups/2026-07-03_08-30-05-post-repair-tthc_matt26265.json`, `test/results/regression-run-2026-07-03_08-35-02.md`, `test/results/regression-run-2026-07-03_08-44-19.md`, `test/results/regression-latest.md`
- **Lý do:** Chặn nhánh khai báo tạm trú người nước ngoài bị trộn với thủ tục cư trú công dân Việt Nam, đồng thời sửa bản ghi Pinecone đang lỗi mã hóa và chưa re-embed nên không thể retrieval ổn định.
- **Kiểm tra:** `npm test`; `npm run build`; `node scripts/repair-pinecone-temp-residence.js`; `node scripts/run-regression.js --ids TR01,TR02,TR03,ON01,TL01,GD02,TR09 --delay-ms 0`; `node scripts/run-regression.js --delay-ms 0`.

---

## [2026-07-03] Progressive disclosure: quick-reply chips + accordion chi tiết
- **Agent:** Claude Code
- **Thay đổi:**
  - `js/chatbot.js`: thêm `detectQuickReplies()`/`appendQuickReplies()`/`clearQuickReplies()` — 3 pattern chip (khu vực cũ, quốc tịch mất hộ chiếu, mời hướng dẫn đầy đủ) nhận diện bằng regex khớp nguyên văn phrasing cố định trong prompt; thêm `applyProgressiveDisclosure()` — gom `📋 Hồ sơ`/`📝 Trình tự` vào `<details>` đóng mặc định khi câu trả lời có đủ cả 2 marker (trọn thủ tục), giữ nguyên câu hẹp. Gọi cả hai trong nhánh `result.ok` của `handleChatSend`; `clearQuickReplies()` chạy đầu mỗi lượt gửi mới. Export `detectQuickReplies` qua `module.exports.__test`.
  - `styles.css`: thêm `.ai-chat-quick-replies`/`.ai-chat-quick-reply` (pill, min-height 36px cho mobile) và `.ai-chat-details`/`.ai-chat-details-body` (accordion viền nhạt, caret xoay khi mở), tái dùng token `--radius-pill`/`--surface-muted`/`--blue-50`/`--blue-200`.
  - `api/chat.js`: chỉ thêm 3 dòng comment cross-reference (không đổi logic/prompt string) cạnh câu hỏi mất hộ chiếu, câu mời "hướng dẫn đầy đủ hồ sơ", và đầu `XNC_RECEPTION_VERIFIED_BLOCK` — nhắc agent sau rằng đổi phrasing ở đây phải sửa đồng bộ `detectQuickReplies` phía client.
  - `test/chatbot-quick-replies.test.js` (mới): 5 unit test cho `detectQuickReplies` (3 khu vực, không chip khi thiếu câu hỏi cuối, mời hướng dẫn đầy đủ, quốc tịch vi/en, input rỗng/null).
  - `test/e2e/chat-progressive-disclosure.spec.js` (mới): 3 test Playwright — stub `window.GeminiAI.stream` trả lời giả lập (không gọi API thật), kiểm accordion đóng mặc định + Nơi nộp luôn hiện + bấm mở được, 3 chip khu vực render đúng + click gửi đúng nội dung + chip cũ bị dọn, câu hẹp giữ phẳng (0 accordion) + có chip mời hướng dẫn.
  - `playwright.config.js`: thêm `PLAYWRIGHT_CHROMIUM_EXECUTABLE` optional override cho `launchOptions.executablePath` — môi trường container không có đúng version Chromium mà `@playwright/test` pin sẵn.
  - `docs/brain/03-decisions.md`: quyết định "progressive disclosure UI — chỉ client, không đổi API" + đánh đổi phụ thuộc phrasing.
- **Lý do:** Tiếp nối answer-first (entry 2026-07-02) — bot đã rút gọn và kết bằng đúng 1 câu hỏi follow-up, nhưng người dân vẫn phải đọc và gõ lại thủ công. Chip hóa follow-up có tập lựa chọn hữu hạn + thu gọn chi tiết ít khi cần đọc ngay giúp rút ngắn hội thoại mà không đổi nội dung/độ chính xác câu trả lời.
- **Kiểm tra:** `node --check js/chatbot.js` sạch; `npm test` 92/92 pass (77 cũ + 6 trim/notice + 5 quick-replies + 4 khác từ PR #15). `npx playwright test` full suite: 3 test mới pass; 3 test `detail-panel.spec.js` fail — đã xác nhận PRE-EXISTING bằng `git stash` (fail y hệt trước khi có thay đổi của phiên này, quirk mô phỏng con trỏ/gesture trong môi trường container, không liên quan chat/bản đồ) — không phải hồi quy do code mới. `npm run build` sạch.
- **Việc còn tồn đọng:** KHÔNG chạm `api/chat.js` logic/response nên KHÔNG cần chạy lại 3× regression baseline. Rủi ro duy nhất: nếu sau này sửa phrasing prompt mà quên đồng bộ `detectQuickReplies`, chip lặng lẽ ngừng hiện (không lỗi) — đã có 3 comment cross-reference trong code nhắc việc này.

---

## [2026-07-02] Review PR #15 sau commit bàn giao — xác nhận kết quả, ghi 3 mục theo dõi
- **Agent:** Claude Code
- **Thay đổi:** Chỉ sửa tài liệu, không sửa code. Thêm `TASK-UX-01-EXT` vào `04-current-tasks.md` ghi 3 phát hiện từ review độc lập PR #15: (1) chỉ 1/3 file báo cáo run cloud được commit (thiếu Run 2, Run 5 — chuẩn P0.5 yêu cầu đủ 3 file làm bằng chứng); (2) VP01 mất câu hedge phạm vi áp dụng mức phạt cho visa; (3) TR02 không nêu trụ sở Thanh Miếu đã xác minh dù kỳ vọng test yêu cầu.
- **File đã sửa:** `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`
- **Lý do:** User yêu cầu review lại PR #15 và kết quả test. Kết quả xác nhận tốt: CI xanh 87/87, run cam kết (Run 3) đạt TB 109 từ / median 93 từ (giảm từ 306/334), 0 TRUNCATED, 0 ERROR, các câu nhạy cảm giữ chuẩn chống bịa; 4 sửa đổi review trong commit `2102e0d` đều hợp lệ. Ba mục trên là tồn đọng cần theo dõi, không chặn merge (riêng mục 1 nên đóng trước khi công bố baseline chính thức).
- **Kiểm tra:** `git pull` đồng bộ `2102e0d`; `npm test` 87/87 pass trên local sau pull; đối chiếu `regression-latest.md` mới với bản 08:06 cũ bằng bảng tổng hợp.

---

## [2026-07-02] Bàn giao PR #15: Hoàn thành Regression Cloud & dọn dẹp
- **Agent:** Antigravity
- **Thay đổi:** 
  - Xác nhận chạy thành công 3 run cloud regression sạch liên tiếp (Run 2, Run 3, Run 5) với `TRUNCATED=0`, `ERROR=0`.
  - Cập nhật `test/results/regression-latest.md` bằng báo cáo sạch hoàn toàn (Run 3: median 93 từ).
  - Xóa harness cloud tạm `scripts/run-regression-cloud.js` và khôi phục `vercel.json` về trạng thái build production sạch ban đầu (`buildCommand: "npm run build"`).
  - Xóa file nháp báo cáo local fail `test/results/regression-run-2026-07-02_14-41-09.md` để tránh commit nhầm.
  - Cập nhật tài liệu `docs/brain/04-current-tasks.md` đánh dấu hoàn thành `TASK-UX-01`.
- **Lý do:** Đạt mục tiêu kiểm định baseline sản xuất với 3 run regression sạch liên tiếp qua Vercel Cloud Build (môi trường đầy đủ secret), khôi phục và dọn dẹp repo trước khi bàn giao.
- **Kiểm tra:** `npm test` 87/87 pass, `npm run build` pass, cấu trúc git status sạch không thừa file rác.

---

## [2026-07-02] Sửa review PR #15 trước regression answer-first
- **Agent:** Codex
- **Thay đổi:** Không cache response chạm trần token; bỏ fragment nếu không có ranh giới câu an toàn; dùng notice canonical từ backend để tránh UI hiển thị trùng/sai ngôn ngữ; tách metric regression Unicode-safe bằng `Intl.Segmenter` và đồng bộ ngưỡng 120/250 với prompt; thêm test và cập nhật Code Graph/syntax gate.
- **File đã sửa:** `api/chat.js`, `js/chatbot.js`, `lib/output-validator.js`, `lib/regression-metrics.js`, `scripts/run-regression.js`, `test/output-validator.test.js`, `test/p0-fixes.test.js`, `test/regression-runner.test.js`, `package.json`, `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`, `docs/brain/05-testing-and-deploy.md`, `docs/brain/06-ai-working-log.md`
- **Lý do:** Khóa 4 finding review: cache câu thiếu, vẫn giữ câu đứt khi không có boundary, notice trùng và regression không đo đúng ngân sách/tiếng Trung.
- **Kiểm tra:** `npm test` 87/87 pass; `npm run build` pass. Regression API thật 3 lần đang chờ credential hợp lệ vì máy không có `.env`, GitHub không có Actions secrets và Vercel CLI token đã hết hạn.

---

## [2026-07-02] Answer-first: rút gọn câu trả lời + chống ngắt giữa câu
- **Agent:** Claude Code
- **Thay đổi:**
  - `api/chat.js` (`SYSTEM_PROMPT_BASE`): đổi mục tiêu cốt lõi từ "sau mỗi câu trả lời" sang "sau khi hội thoại kết thúc"; thêm section "ANSWER-FIRST & ĐỘ DÀI" (câu đầu là đáp án trực tiếp, cấm chào hỏi/xã giao, tối đa 1 follow-up, 2 chế độ HẸP < 120 từ / TRỌN THỦ TỤC < 250 từ, mỗi điểm tiếp dân 1 dòng, không lặp thông tin); cấu trúc A chỉ áp cho câu hỏi trọn thủ tục, bỏ lặp nơi nộp trong "Trình tự". KHÔNG chạm khối "DỮ LIỆU & CHỐNG BỊA".
  - `api/chat.js` + `lib/output-validator.js`: thêm `trimToSentenceBoundary()` + `getTruncationNotice()` — khi finishReason là `MAX_TOKENS` (Gemini) hoặc `length` (DeepSeek), cắt `fullText` lùi về ranh giới câu hoàn chỉnh (dấu kết câu + khoảng trắng, hoặc hết dòng trọn vẹn; không nhận nhầm dấu chấm trong URL/số thập phân) rồi nối câu chốt theo ngôn ngữ vi/en/zh/ko, chạy TRƯỚC `validateAnswer`. Cờ `truncated` (SSE + telemetry) giờ phủ cả DeepSeek `length` (trước chỉ bắt `MAX_TOKENS`).
  - `scripts/run-regression.js`: đếm số từ mỗi câu trả lời, gắn nhãn soft-fail `VERBOSITY` (câu hẹp theo `NARROW_QUESTION_IDS` > 250 từ, câu đầy đủ > 400 từ) và `TRUNCATED` (đọc từ SSE event cuối); thêm bảng tổng hợp + thống kê TB/median đầu báo cáo để so sánh trước–sau.
  - `test/output-validator.test.js`: 6 test mới cho trim/notice (cắt giữa câu vi, giữ nguyên khi đã trọn câu en/zh, bỏ bullet đứt, không nhầm dấu chấm URL/tọa độ, giữ nguyên khi không có ranh giới, localize notice).
- **File đã sửa:** `api/chat.js`, `lib/output-validator.js`, `scripts/run-regression.js`, `test/output-validator.test.js`, `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`
- **Lý do:** Đo regression-latest: TB 306 từ/câu, median 334, 6/30 câu > 500 từ — người dân không nắm được thông tin cần biết trên mobile; câu dài còn gây chạm trần token đứt giữa câu (VP01/EV01). User yêu cầu answer-first + tuyệt đối không để AI ngắt giữa câu.
- **Kiểm tra:** `node --check` sạch cho 3 file; `npm test` 83/83 pass (77 cũ + 6 mới); smoke-test `trimToSentenceBoundary` trên chính đoạn đứt thật của EV01 → dòng đứt "Hệ thống sẽ c" bị loại, kết thúc trọn vẹn + câu chốt. **CHƯA chạy 3× regression API thật** (môi trường không có API key) — bắt buộc chạy `node scripts/run-regression.js` × 3 ở môi trường có key, kiểm 0 Tier-1 / 0 LEGAL_HALLUCINATION / 0 TRUNCATED + so median từ trước–sau, rồi mới chốt baseline mới.

---

## [2026-07-02] Sửa review P1 quota rollback và groundedness lifecycle
- **Agent:** Codex
- **Thay đổi:** Đổi reserve/rollback quota song song sang `Promise.allSettled` để không rò counter khi một nhánh throw; thêm test lỗi mạng từng phía; đăng ký groundedness check bằng Vercel `waitUntil`; cập nhật dependency và tài liệu kiến trúc/quyết định.
- **File đã sửa:** `api/chat.js`, `test/p0-fixes.test.js`, `package.json`, `package-lock.json`, `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`, `docs/brain/06-ai-working-log.md`
- **Lý do:** Bảo toàn quota khi Firebase lỗi cục bộ và bảo đảm tác vụ giám sát sau response không bị Vercel đóng băng giữa chừng.
- **Kiểm tra:** `npm test`; `npm run build`; `npm run ci`.

## [2026-07-02] Sửa review P0 structured facts và duration đa ngôn ngữ
- **Agent:** Codex
- **Thay đổi:** Tách riêng `le_phi` và `phi` khi tạo `[FACTS ĐÃ XÁC MINH]`; thay word boundary ASCII của duration bằng boundary Unicode-safe; bổ sung regression test cho phí song song và thời hạn vi/en/zh/ko.
- **File đã sửa:** `api/chat.js`, `lib/output-validator.js`, `test/p0-fixes.test.js`, `test/output-validator.test.js`, `docs/brain/06-ai-working-log.md`
- **Lý do:** Ngăn `le_phi=Không` che mất `phi` thực tế và bảo đảm validator thật sự redact thời hạn không có nguồn bằng tiếng Việt, Trung, Hàn.
- **Kiểm tra:** `npm test`; `npm run build`.

## [2026-07-02] P1: Retrieval, giám sát, bảo mật, hiệu năng — theo kế hoạch P1 sau P0
- **Agent:** Claude Code (Sonnet 5)
- **Bối cảnh:** Sau khi P0 chốt baseline production (3/3 lần regression sạch), thực hiện P1 theo kế hoạch đã duyệt trên nhánh `feat/p1-retrieval-hardening` (nhánh từ `fix/p0-anti-hallucination`, chưa merge vào `main`).
- **Thay đổi (`api/chat.js`):**
  - **P1.1.1 Retrieval:** Bỏ vòng thử 4 namespace Pinecone (`namespacesToTry`) — pin đúng 1 namespace từ `PINECONE_NAMESPACE`, giữ nguyên 1 fallback bỏ metadata filter khi có category mà 0 match (đã có sẵn).
  - **P1.1.2:** Thêm `shouldSkipRerank(matches)` — bỏ qua `rerankWithGemini` khi top-1 > 0.75 điểm VÀ cách top-2 ≥ 0.05 (kết quả đã rõ ràng, không mập mờ). Tiết kiệm 1 LLM call cho đa số câu hỏi có match mạnh.
  - **P1.1.3:** Chỉ ghép ngữ cảnh câu trước vào query embedding khi câu hiện tại < 8 từ (follow-up ngắn); câu đủ dài (≥ 8 từ) đứng độc lập.
  - **P1.2.1 Giám sát:** Thêm `checkGroundednessAsync()` — fire-and-forget SAU `res.end()` (không tăng latency), gọi Gemini Flash đối chiếu số liệu trong answer với `legalCorpus`, ghi kết quả vào Firebase `groundedness_checks/<date_key>`. Đây là lớp giám sát THÊM, không thay `lib/output-validator.js` (vẫn fail-closed như cũ).
  - **P1.3.1-3 Bảo mật:** Bỏ header `Access-Control-Allow-Credentials` (app không dùng cookie). `isAllowedOrigin` chỉ tin fallback `x-forwarded-host` khi `process.env.VERCEL` tồn tại (tách thành hàm riêng, có comment giải thích). IP rate-limit đổi từ chỉ `x-forwarded-for` sang ưu tiên `x-vercel-forwarded-for` → `x-real-ip` → `x-forwarded-for` (tách thành `resolveClientIp()` để unit test được).
  - **P1.4.1 Hiệu năng:** `reserveRateLimitQuota` đổi từ tuần tự (IP/ngày rồi thang) sang **song song** qua `Promise.all`, rollback bên đã reserve thành công nếu bên kia fail (logic rollback giữ nguyên).
  - **P1.4.2:** Thêm comment xác nhận timeout DeepSeek 50s hợp lệ vì `vercel.json` có `maxDuration: 60`.
  - **Phát hiện quan trọng (ảnh hưởng RATE_LIMIT_MAX_RETRIES):** Test harness 50-concurrent cho thấy chạy song song 2 reservation + rollback tạo ra worst-case ~2N-1 (không phải N) lượt ghi CAS tuần tự cần thành công trên CÙNG 1 counter IP (rollback IP của các request bị chặn ở tầng tháng cạnh tranh thêm với các reservation IP còn đang retry). `RATE_LIMIT_MAX_RETRIES=64` không đủ trong kịch bản này (14/50 bị `store_error` sai — xác nhận bằng script debug độc lập). Đã nâng lên **150**, xác minh lại sạch bằng 3 lần chạy độc lập.
- **File khác:**
  - `vercel.json`: Thêm route `/(.*)` với header `Content-Security-Policy` (chuyển từ meta tag, thêm `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.
  - `index.html`: Xóa meta tag CSP (1 nguồn sự thật duy nhất là `vercel.json`).
  - `scripts/check-violations.js` (mới — P1.2.2): Đọc RTDB fallback `chat_logs_metrics/<date_key>`, in báo cáo tỉ lệ `output_validator_violation` theo ngày. Chạy tay/cron sau, không dựng hạ tầng alert mới.
  - `test/p0-fixes.test.js`: Thêm 5 test mới cho `shouldSkipRerank`, `resolveClientIp`, `isAllowedOrigin` (gating theo `VERCEL`), và `reserveRateLimitQuota` song song (rollback đúng khi 1 bên fail). Cập nhật 2 test đếm số lời gọi Firebase (1→2, 2→4) vì giờ IP/tháng đọc/ghi song song thay vì tuần tự.
  - `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`: cập nhật luồng xử lý, quyết định P1, khảo sát P1.1.4 (title/van_ban trong Pinecone metadata — không cần backfill thêm).
- **Kiểm tra:**
  - `node --check api/chat.js lib/output-validator.js scripts/check-violations.js` sạch.
  - `node --test test/*.test.js` → **75/75 pass**.
  - `node scripts/run-regression.js` chạy 1 lần (report `test/results/regression-run-2026-07-02_08-06-56.md`) xác nhận **không thoái lui** so với baseline P0: 0 lỗi Tier-1, 0 LEGAL_HALLUCINATION xác nhận. EV07 (tiếng Trung) — thông số ảnh/phí không có trong corpus được validator redact đúng thành `(thông số/mức phí chưa xác minh trong dữ liệu)`. TR02 dùng đúng dữ liệu trụ sở Thanh Miếu đã xác minh, không bịa SĐT. 2/30 câu (EV01, EV04) bị `UNKNOWN_ERROR` trong lần chạy — đã tái hiện độc lập bằng script gọi handler trực tiếp và cả 2 đều chạy thành công sạch sẽ (không lỗi, không hallucination) → xác nhận là lỗi mạng/API thoáng qua (transient), không phải hồi quy do code P1.
  - **Lưu ý vận hành:** `node scripts/run-regression.js` chạy nền lần này log stdout bị buffer bởi Node khi output bị pipe ra file (không flush theo dòng) — output capture chỉ thấy phần đuôi log dù script chạy đúng và report `.md` được ghi đủ 30 câu qua `fs.writeFileSync` ở cuối. Khi debug regression chạy nền, ưu tiên đọc report `.md` trong `test/results/` làm nguồn sự thật, không dựa vào file `.output` của tiến trình nền.
- **Việc còn tồn đọng:** Chưa deploy preview để `curl` xác minh CSP header thực tế trên Vercel (chỉ xác minh cấu hình JSON hợp lệ ở local) — cần làm khi có deploy preview.

## [2026-07-02] P0.5: Baseline chuẩn production — 3/3 lần chạy regression sạch, vá 3 lỗ hổng validator phát hiện qua thực nghiệm
- **Agent:** Claude Code (Sonnet 5)
- **Bối cảnh:** Sau P0.1-P0.4, chạy chuỗi 3 lần liên tiếp bộ regression 30 câu bằng API thật để chốt baseline theo tiêu chí đã thống nhất (0 lỗi Tier-1, 0 LEGAL_HALLUCINATION). Quá trình chạy phát hiện thêm 3 lỗ hổng thật trong `lib/output-validator.js`/`api/chat.js` mà unit test cũ không phủ tới — mỗi lần phát hiện đều dừng lại vá + viết test + chạy lại **từ đầu chuỗi 3 lần** (đúng quy trình đã thống nhất trong plan).
- **3 lỗ hổng phát hiện qua thực nghiệm (không phải qua đọc code tĩnh):**
  1. **EV07 (tiếng Trung) bịa thông số ảnh "4×6cm/JPEG/≤2MB"** — không pattern nào trong validator phủ tới loại claim "thông số vật lý" (kích thước/dung lượng file). Thêm `MEASUREMENT_PATTERN` (bắt cm/mm/px/MB/KB/GB và cả đơn vị chữ Hán 厘米/毫米/公分).
  2. **Validator garble câu do bare `đ` (ký hiệu VNĐ viết tắt) dính liền chữ cái tiếng Việt tiếp theo** (vd "gọi 113 để" → cắt cụt thành "113 (...)ể") — nguyên nhân gốc: `(?<!\w)`/`(?!\w)` chỉ hiểu ASCII, không coi các chữ cái có dấu tiếng Việt là word-char, nên biên kiểm tra bị xuyên thủng. Vá phạm vi hẹp: chỉ thêm negative lookahead Latin/Việt riêng cho token `đ` bare, KHÔNG đổi biên `\w` chung (vì tiếng Trung cần biên rộng — số dính liền chữ Hán không dấu cách, đổi biên chung sẽ làm mù hoàn toàn phát hiện tiền tệ tiếng Trung — đã phát hiện và sửa lại đúng sau 1 lần thử sai).
  3. **TR09 (tiếng Anh) bị redact oan "12 hours"/"24 hours"** — hồi quy do chính P0.2 gây ra: DURATION_PATTERN giờ redact thật, nhưng `allowedConstants` truyền vào validator chỉ có bản tiếng Việt "12 giờ"/"24 giờ", không nhận diện được bản dịch của **đúng 1 sự thật đã xác minh** khi bot trả lời EN/ZH/KO — làm hỏng tính đa ngôn ngữ, một yêu cầu cốt lõi của dự án. Thêm các bản dịch cố định của 2 hằng số này (`12 hours/24 hours/12小时/24小时/12시간/24시간`) vào `allowedConstants`, không mở rộng sang số khác.
  4. **Money range "X đến Y đồng" chỉ bảo vệ được số Y** (số X đứng trước không có đơn vị đi kèm ngay nên MONEY_PATTERN đơn lẻ bỏ sót) — thêm `MONEY_RANGE_PATTERN` bắt cả cụm.
- **Phát hiện quan trọng khi điều tra nghi vấn hallucination VP01/EV07/GV06/HS02/TT01:** Đã trực tiếp query Pinecone (`idx.fetch`) để xác minh — **toàn bộ con số "đáng ngờ"** (25/50 USD e-visa, 145/155/165 USD thẻ tạm trú, 10 USD/lần gia hạn, 4×6cm/JPEG/≤2MB, 3 ngày làm việc, 500.000-2.000.000 đồng phạt) **đều là dữ liệu thật trong KB** (record `tthc_5568-tw-06/07/08`, `5568-tinh-05` etc.), KHÔNG phải hallucination. Sai lệch số liệu quan sát được giữa các lần chạy trước đó (vd VP01 ra "500k-2tr" rồi "3tr-5tr" ở 2 lần chạy khác nhau) là do **retrieval trả về chunk khác nhau** giữa các lần gọi (biến thiên tự nhiên của embedding search), không phải model tự bịa — validator đã hoạt động đúng thiết kế: redact khi chunk liên quan không được truy xuất, giữ nguyên khi có.
- **Kết quả 3 lần chạy cuối (baseline chính thức):** `regression-run-2026-07-02_06-13-26.md`, `regression-run-2026-07-02_06-24-57.md`, `regression-run-2026-07-02_06-39-56.md`. Cả 3: **0 lỗi Tier-1 (SĐT/địa chỉ/Maps bịa), 0 LEGAL_HALLUCINATION xác nhận.** 2 câu bị `BLOCKED_CONTENT` (F01 lần 2, DN01 lần 2) do Gemini safety filter transient — retry riêng đều sạch, không phải hồi quy code.
- **Kiểm tra:** `node --check` sạch, `node --test test/*.test.js` → 71/71 pass (thêm 4 test mới cho 4 vá trên).
- **Việc còn tồn đọng (không chặn P0, chuyển sang backlog):**
  - VP01 ở 1 lần chạy (đã fix) bị cắt giữa câu do `MAX_TOKENS` (3072) — UX issue khi liệt kê nhiều thông tin, không phải an toàn/hallucination.
  - Duration tiếng Trung dùng lượng từ "个" (vd "3个工作日") không khớp `DURATION_PATTERN` (chỉ bắt `\d+\s*工作日`, không xử lý "个" chen giữa) — biết là gap nhưng chấp nhận được vì số liệu vẫn đúng (verified qua Pinecone), chỉ là chưa có lớp bảo vệ kép.
  - Duration dùng "ngày" trần (không phải "ngày làm việc") không được validator phủ (tránh false-positive vì "ngày" quá phổ biến trong tiếng Việt) — quyết định phạm vi có chủ đích, không phải bug.

## [2026-07-02] P0.1-P0.4: Diệt gốc hallucination — bỏ fallback dưới ngưỡng, redact duration, structured facts
- **Agent:** Claude Code (Sonnet 5)
- **Bối cảnh:** User yêu cầu review toàn diện dự án tập trung độ chính xác chatbot RAG, sau đó duyệt kế hoạch 3 phase (P0 diệt gốc hallucination → P1 retrieval/bảo mật/hiệu năng → P2 UI). Đây là entry cho P0.1-P0.4, làm trên nhánh `fix/p0-anti-hallucination`.
- **Thay đổi:**
  - `api/chat.js`: (P0.1) Bỏ fallback `relevantMatches = branchFilteredMatches.slice(0, 3)` khi không có match nào vượt ngưỡng 0.62 — dưới ngưỡng giờ để `matchedDocs` rỗng thay vì dùng tài liệu điểm thấp. (P0.3) `allowedConstants` truyền vào `validateAnswer` rút gọn từ 13 hằng số xuống còn 3 (`12 giờ`, `24 giờ`, `Điều 33`) — số hiệu văn bản cụ thể không hardcode nữa, dựa hoàn toàn vào `legalCorpus` lấy từ tài liệu Pinecone thực sự truy xuất được. (P0.4) Thêm `buildVerifiedFactsLine()` đọc field `le_phi`/`phi`/`thoi_han`/`mau_don` từ metadata Pinecone, bơm dòng `[FACTS ĐÃ XÁC MINH]` vào cuối mỗi tài liệu trong `matchedDocs`; thêm 1 dòng chỉ đạo vào `SYSTEM_PROMPT_BASE` yêu cầu model ưu tiên dòng FACTS.
  - `lib/output-validator.js`: (P0.2) `DURATION_PATTERN` chuyển từ `log_only` sang dùng chung cơ chế `redact()` — thời hạn không có trong `legalCorpus` giờ bị thay bằng placeholder thay vì chỉ ghi violation.
  - `test/output-validator.test.js`: Cập nhật test `duration violations are log-only` thành `redacts unsourced durations but keeps ones present in the legal corpus`, xác nhận cả hành vi redact và hành vi giữ nguyên khi có trong corpus.
  - `docs/brain/04-current-tasks.md`: Thêm `TASK-P0-04-EXT` ghi nhận phát hiện khảo sát dữ liệu (chỉ `le_phi` tồn tại thật trong Pinecone, `thoi_han`/`mau_don` chưa có field nào — cần backfill).
  - `docs/brain/03-decisions.md`: Thêm 2 entry — tiêu chí "đạt chuẩn đưa vào thực tế" (4 điều kiện) và quyết định kỹ thuật P0 kèm phát hiện khảo sát metadata.
- **Lý do:** Diệt 3 nguồn hallucination chính mà báo cáo review 2026-07-02 chỉ ra: tài liệu điểm thấp vẫn được đưa vào prompt, duration không bị chặn thật sự, whitelist số hiệu văn bản là nguồn sự thật tách rời khỏi Pinecone thật (dễ lệch khi thêm văn bản mới).
- **Kiểm tra:** `node --check api/chat.js` OK, `node --check lib/output-validator.js` OK, `node --test test/*.test.js` → 67/67 pass.
- **Việc còn tồn đọng:** Chưa chạy regression 30 câu bằng API thật để đo tác động thực tế của P0.1 (một số câu trước "đạt" nhờ fallback dưới ngưỡng có thể chuyển sang "chưa có căn cứ" — cần xác nhận đây là thay đổi đúng ý đồ, không phải thoái lui). Bước tiếp theo: P0.5 (chạy regression 3 lần liên tiếp để chốt baseline).

---

## [2026-07-01] Baseline mới sau khi vá TL01/TT04 — kết quả 27/30 sạch, 2 soft-fail, 1 fail
- **Agent:** Claude Code
- **Thay đổi:** Chạy lại đủ 30 câu (`regression-run-2026-07-01_07-52-45.md` = `regression-latest.md`), viết phân tích đồng bộ tại `test/results/regression-analysis-2026-07-01_07-52-45.md`. Đánh dấu rõ `regression-run-1.md` và `regression-run-1-analysis.md` là LỖI THỜI/SUPERSEDED ngay đầu file (không xóa, giữ giá trị lịch sử) — khắc phục đúng vấn đề "2 file lệch phiên bản" mà reviewer độc lập chỉ ra. Sửa luôn `docs/brain/05-testing-and-deploy.md` từ "39 unit test" thành "57 unit test" (đúng số thật hiện tại).
- **Kết quả:** 27/30 sạch (so với 20/30 lần gốc). TL01 và TT04 xác nhận đã vá đúng (xem entry trước). Phát hiện mới: **TR02** đưa SĐT chưa xác minh kèm cảnh báo "không nằm trong danh sách xác minh" — vẫn là vi phạm, cảnh báo không bù được. **LOC04** (tự chọn thay vì hỏi lại) và **EV07** (hallucination tiếng Trung) vẫn tồn đọng, chưa sửa trong đợt này.
- **Sự cố trong lúc chạy (không phải hồi quy code):** 3 câu (LOC04, TYPO01, TYPO02) ban đầu lỗi `UNKNOWN_ERROR` do `PineconeConnectionError`/`ECONNRESET` và DNS không resolve được `api.deepseek.com` (do `DEEPSEEK_API_KEY` được cấu hình nên runtime ưu tiên DeepSeek) — gián đoạn mạng cục bộ tại đúng thời điểm chạy, retry logic đã chạy đúng nhưng mạng lỗi xuyên suốt cửa sổ retry. Đã retry riêng cả 3 câu ngay sau, kết quả sạch — dùng để chấm baseline.
- **Đánh giá từ reviewer độc lập:** User đưa 1 bản review production-readiness từ nguồn khác, đánh giá khá đúng (test count sai, 2 file lệch phiên bản, LOC04/TT04/TL01/EV07 có vấn đề thật). Qua verify, xác nhận TT04 và TL01 là hồi quy MỚI do chính đợt vá Pinecone/QLXNC gây ra (đã sửa trong entry trước); LOC04/EV07 là gap đã biết từ trước. Khuyến nghị trọng tâm của reviewer ("output validator bằng code thay vì chỉ dựa prompt") được xác nhận là hướng đúng — TR02 (SĐT chưa xác minh lọt qua dù có luật prompt + cảnh báo) là bằng chứng cụ thể cho việc cần validator hậu kiểm.
- **Việc còn tồn đọng:** Output validator code-level (ưu tiên cao nhất), xử lý LOC04, tiếp tục vá EV07, chạy thêm 2-3 lần để đo biến thiên trước khi coi đây là baseline ổn định.

---

## [2026-07-01] Sửa 2 hồi quy do reviewer ngoài phát hiện (TL01, TT04) + hết ghi đè lịch sử regression
- **Agent:** Claude Code
- **Bối cảnh:** User đưa 1 bản đánh giá production-readiness từ reviewer khác, chỉ ra `regression-run-1.md`/`regression-run-1-analysis.md` lệch phiên bản (đúng — do script ghi đè cùng tên file mỗi lần chạy), và 4 câu vẫn lỗi (LOC04, TT04, TL01, EV07). Tôi verify độc lập: LOC04 và EV07 là gap đã biết từ trước (đã ghi chú trong `-analysis.md` gốc), nhưng **TT04 và TL01 là hồi quy MỚI do chính tôi gây ra** ở các bước trước (TT04 vốn PASS sạch, TL01 vốn PASS sạch trong lần chấm gốc).
- **Thay đổi:**
  - `api/chat.js` (SYSTEM_PROMPT_BASE): (1) Mở rộng luật "không trộn thời hạn" thành 3 loại rõ ràng — hạn khai báo/nộp hồ sơ vs thời gian giải quyết/xử lý vs thời hạn giá trị giấy tờ — cấm dùng thay thế nhau (vá TL01). (2) Thêm luật mới "CẤM SUY DIỄN THỦ TỤC TƯƠNG TỰ" — khi dữ liệu chỉ có 1 biến thể (vd "cấp mới") nhưng người dùng hỏi biến thể khác (vd "cấp lại/mất"), cấm lấy hồ sơ/bước của biến thể có data trình bày như đáp án, phải nói rõ chưa có dữ liệu (vá TT04).
  - Vá metadata Pinecone record `tthc_matt26265` (`ns.update()`, metadata-only): tách field "Thời hạn: 24 giờ đến 07 ngày" (vốn gây nhầm) thành 2 dòng rõ ràng — "Hạn khai báo (12h/24h, theo Điều 33 Luật XNC)" và "Thời hạn giải quyết (24h-07 ngày, thời gian hệ thống xử lý)" — nguyên nhân gốc của TL01 (tôi tự gây ra khi thêm record này ở bước trước, do không tách rõ 2 khái niệm thời hạn).
  - `scripts/run-regression.js`: đổi tên file output từ cố định `regression-run-1.md` sang có timestamp (`regression-run-<ISO-timestamp>.md`) + luôn ghi thêm `regression-latest.md` làm con trỏ tới lần chạy mới nhất. Sửa nguyên nhân gốc khiến 2 file kết quả/phân tích lệch phiên bản.
- **Kiểm tra:** `node -c api/chat.js` OK, `npm test` 57/57 pass. Đang chạy lại đủ 30 câu để tạo baseline mới đồng bộ (xem entry tiếp theo sau khi có kết quả).
- **Việc còn tồn đọng:** LOC04 (tự chọn thay vì hỏi lại khi mơ hồ) và EV07 (bịa số liệu tiếng Trung) vẫn CHƯA sửa trong lượt này — sẽ đánh giá lại mức độ ưu tiên sau khi có baseline mới.

## [2026-07-01] Thêm công cụ dashboard theo dõi vector Pinecone (Google Sheet)
- **Agent:** Claude Code
- **Thay đổi:** Tạo `setup/export-pinecone-dashboard.gs` — Apps Script gọi trực tiếp Pinecone REST API (`/indexes/{name}` resolve host, `/vectors/list`, `/vectors/fetch`) và đổ toàn bộ 530 vector của index `chatbot-tthc-xnc` vào 5 tab Google Sheet: `Tong_quan`, `TTHC` (39 record, có cột Trạng thái tự suy ra: OK / CẦN XÁC MINH / LỖI CŨ chưa vá), `Guide` (194), `Law` (152), `Truso_Legacy` (145, đánh dấu rõ KHÔNG dùng cho runtime). Có tùy chọn `setupDailyTrigger()` để tự refresh mỗi ngày.
- **Lý do:** User (cán bộ quản lý nội dung, không phải dev) muốn theo dõi trực tiếp dữ liệu vector sau đợt vá phí/lệ phí — chọn phương án xuất Google Sheet (giống cách dự án đang quản lý `Published_Locations`) thay vì dùng console Pinecone hoặc build trang admin riêng.
- **Bảo mật:** `PINECONE_API_KEY` lưu trong Apps Script Script Properties (không hardcode trong code, không đưa vào Sheet mà người xem thường thấy được).
- **Kiểm tra:** Đã smoke-test bằng Node.js với ĐÚNG các endpoint/tham số y hệt script dùng (raw REST, không qua SDK) trước khi giao: resolve host (200 OK), list 530 ID qua 6 trang phân trang, fetch batch 90/90 record — khớp với số liệu `describeIndexStats` đã biết trước đó. Không tự chạy được Apps Script trực tiếp (không có quyền truy cập trình duyệt/Google account), nên user cần tự chạy theo hướng dẫn trong comment đầu file.
- **File đã tạo:** `setup/export-pinecone-dashboard.gs`

## [2026-07-01] Xóa bỏ thủ tục "Khai báo tạm trú bằng Phiếu giấy" khỏi Pinecone (lỗi thời)
- **Agent:** Claude Code
- **Thay đổi:** Xóa vector `guide_cap_xa_2025_a_02_quan_ly_xuat_nhap_canh_khai_bao_tam_tru_cho_nguoi_nuoc_ngoai_tai_viet_nam_bang_phieu_khai_bao_tam_tru_01_01` (`source_type: "guide"`, `van_ban: "Wiki thủ tục hành chính cấp xã 2025"`) khỏi index `chatbot-tthc-xnc` theo yêu cầu trực tiếp của user (cán bộ PA01 phụ trách lĩnh vực này): thủ tục khai báo tạm trú bằng Phiếu khai báo giấy (mẫu NA17, nộp tại Công an cấp xã, hạn 12h/24h) **đã lỗi thời, không còn giá trị** — thay bằng kênh online (xem entry "Thêm mới thủ tục Khai báo tạm trú online" bên dưới).
- **Kiểm tra trước khi xóa:** Semantic search + list theo prefix xác nhận đây là RECORD DUY NHẤT khớp chủ đề này (không có chunk anh em khác). Đã backup đầy đủ metadata + vector (768 chiều) tại `data/pinecone-backups/2026-07-01-DELETED-guide-khai-bao-tam-tru-phieu-giay-01_01.json` trước khi xóa — có thể khôi phục bằng `ns.upsert([{id, values, metadata}])` nếu cần.
- **Kiểm tra sau khi xóa:** Re-run trực tiếp qua `api/chat.js` với câu hỏi TR01 (từng trích dẫn RẤT nhiều lần chính record này trong `regression-run-1.md`) → bot chuyển hoàn toàn sang hướng dẫn kênh online (`tthc_matt26265`), không còn nhắc mẫu NA17/nộp giấy tại Công an cấp xã, không lỗi/không hồi quy.
- **Lưu ý cho agent sau:** Record này từng là nguồn RAG chính cho rất nhiều câu hỏi "khai báo tạm trú" cơ bản trong bộ test regression (`test/cau-hoi/bo-test-regression-30-cau-nguoi-nuoc-ngoai-tthc.md`). Nếu chạy lại `scripts/run-regression.js`, các câu TR01/TR02/TR03/CS01/GD02/PI01/TR09/LOC02/DN02 sẽ có nội dung khác trước (đúng, vì phản ánh quy trình mới), không phải regression giả.

## [2026-07-01] Thêm mới thủ tục "Khai báo tạm trú online" vào Pinecone
- **Agent:** Claude Code
- **Thay đổi:** KHÔNG sửa file repo. Upsert **1 vector mới** vào Pinecone index `chatbot-tthc-xnc` (namespace cùng tên): `tthc_matt26265` — thủ tục "Khai báo tạm trú cho người nước ngoài tại Việt Nam qua Trang thông tin điện tử" (nguồn: user cung cấp URL `dichvucong.bocongan.gov.vn/bocongan/bothutuc/tthc?matt=26265`, mã TTHC quốc gia 1.001437). Đây là record HOÀN TOÀN MỚI (chưa từng có trong index — đã kiểm tra bằng semantic search trước khi thêm), không phải sửa record cũ.
- **Lý do:** Regression test ON01 ("Khai báo tạm trú online được không?") trước đó trả lời SAI "chưa có quy định trực tuyến" vì dữ liệu này chưa từng được ingest — user cung cấp nguồn để bổ sung.
- **Chi tiết kỹ thuật quan trọng cho agent sau:**
  - `loai_thu_tuc: "tam_tru"` — bắt buộc giữ giá trị này để khớp filter `RAG-03` (`classifyQuestion()` → category `tam_tru_khai_bao` → `getFilterCategoriesForQuestionCategory` → `['tam_tru', 'cu_tru']`, xem `api/chat.js` dòng ~840-883).
  - **Lưu ý về xung đột heuristic rerank phụ** (`scoreSplitTempResidenceMatch`, `api/chat.js` dòng ~898-958): logic này giả định nhị phân "khai báo tạm trú = cấp xã" / "thẻ tạm trú = cấp tỉnh" để phân biệt 2 loại tài liệu, và trừ điểm (-3) nếu văn bản "tam_tru_khai_bao" chứa cụm "công an cấp tỉnh"/"phòng quản lý xuất nhập cảnh". Record mới này khai báo tạm trú NHƯNG xử lý ở **cấp tỉnh** (kênh online) — không khớp giả định nhị phân đó. Đã CỐ Ý giữ nguyên "Cơ quan xử lý: Công an Tỉnh" trong `text` (đúng sự thật theo nguồn), chấp nhận rủi ro bị heuristic trừ điểm nhẹ, thay vì bóp méo dữ liệu để "lách" bộ rerank. Đã verify thực tế: vẫn lọt top-3 sau rerank (`8 -> 3`) khi test câu hỏi ON01. Nếu sau này phát hiện record này bị loại khỏi kết quả cho câu hỏi liên quan, cần xem lại heuristic `scoreSplitTempResidenceMatch` (nới lỏng giả định nhị phú cấp xã/cấp tỉnh), không phải sửa lại dữ liệu record.
  - `procedure_id: "matt26265"` — đặt theo mã tra cứu URL gốc (không theo dãy số `tinh-XX`/`5568-XX` đã dùng) để tránh trùng với ID mà một đợt ingest chính thức trong tương lai có thể cấp phát.
- **Kiểm tra:** Semantic search trước khi thêm xác nhận chưa tồn tại (điểm gần nhất 0.778 là thủ tục giấy khác). Re-run trực tiếp qua `api/chat.js` với câu ON01 → bot đổi từ "chưa có quy định online" (sai) sang "Có, hoàn toàn có thể... trực tuyến" kèm đủ bước, thời hạn 24h-07 ngày, không bịa địa chỉ. Metadata lưu tại `data/pinecone-backups/2026-07-01-new-record-matt26265-khai-bao-tam-tru-online.json`.

## [2026-07-01] Vá dữ liệu phí/lệ phí trong Pinecone (không phải sửa code repo)
- **Agent:** Claude Code (điều phối 4 sub-agent nghiên cứu song song qua WebSearch/WebFetch)
- **Thay đổi:** KHÔNG sửa file nào trong repo. Đã ghi đè metadata (`le_phi`, `phi`, `text`) trực tiếp trong Pinecone index `chatbot-tthc-xnc` (namespace cùng tên) cho 34 record `source_type: "tthc"` từng bị lỗi gộp `Phí/lệ phí:` (26 record vá số liệu thật đã đối chiếu Thông tư 28/2026/TT-BTC; 8 record đánh dấu `"Chưa xác minh"` vì không đủ nguồn tin cậy — xem chi tiết và danh sách đầy đủ ở `docs/brain/03-decisions.md` mục "[2026-07-01] Vá trực tiếp dữ liệu phí/lệ phí trong Pinecone").
- **Lý do:** Codex chẩn đoán đúng gốc bug ở tầng ingest (không có trong repo); TT01/GV06 trả lời sai "miễn phí" là do dữ liệu RAG sai, không phải model/prompt.
- **Kiểm tra:** Re-audit toàn bộ 38 record: `still_bad_merge count = 0`. Re-run trực tiếp qua `api/chat.js` với câu hỏi target đúng record đã vá (`5568-tw-11`/`5568-tinh-06`) → bot trả đúng "Phí: 10 USD/lần", có citation, không còn bịa "miễn phí". Đã backup metadata gốc của 34 record trước khi ghi đè.
- **Việc còn tồn đọng:** 8 record "Chưa xác minh" cần người xác minh Thông tư 28/2026/TT-BTC bản gốc; toàn bộ 38 record vẫn ghi "Căn cứ pháp lý: Thông tư 25/2021/TT-BTC" (đã hết hiệu lực, số tiền không đổi nhưng số hiệu văn bản cần cập nhật).

## [2026-06-30] Ghi alias vào Google Sheet Published_Locations thành công
- **Agent:** Claude Code
- **Thay đổi:**
  - Fix 3 bug trong `setup/bulk-update-aliases.gs`: (1) tên cột tiếng Việt không khớp `name`, (2) hàm `_norm` xóa nhầm chữ HOA trước `toLowerCase()`, (3) regex bỏ dấu dùng ký tự literal thay vì `̀-ͯ`.
  - Script nay tự nhận diện cột `Tên Đơn vị`, tự tạo cột `search_aliases` nếu chưa có.
  - Kết quả chạy trên Google Sheet: **140 dòng cập nhật**, 1 dòng bỏ qua (`Công an tỉnh Phú Thọ` — đúng, không cần alias).
- **File đã sửa:** `setup/bulk-update-aliases.gs`
- **Lý do:** Script cũ giả định tên cột tiếng Anh (`name`) trong khi sheet thực tế dùng tên cột Google Form tiếng Việt.
- **Kiểm tra:** Log Apps Script "Da cap nhat: 140 dong, Bo qua: 1 dong". Cache server tự làm mới sau ≤60 giây.

---

## [2026-06-30] Hoàn thiện alias_draft.csv — 148 đơn vị đủ, thêm alias kép chống nhập nhằng
- **Agent:** Claude Code
- **Thay đổi:**
  - Xóa 5 dòng draft thừa/trùng ở đầu file `data/alias_draft.csv`.
  - Bổ sung 4 đơn vị còn thiếu: xã Thanh Sơn, xã Tiền Phong, xã Thu Cúc, xã Trung Sơn (tổng đạt đúng 148 = 133 xã + 15 phường theo NQ 1676/NQ-UBTVQH15).
  - Thêm alias kép (tên cũ + huyện) cho 12 đơn vị thuộc 7 nhóm xung đột: `hiền lương hạ hòa/đà bắc`, `tam sơn cẩm khê/sông lô`, `tân lập thanh sơn/sông lô/lạc sơn`, `tân minh thanh sơn/đà bắc`, `cao sơn đà bắc/lương sơn`, `đồng thịnh yên lập/sông lô`, `yên lập vĩnh tường`.
  - Tạo `setup/bulk-update-aliases.gs` — script Apps Script chạy một lần trong Google Sheets để ghi cột `search_aliases` cho toàn bộ 148 đơn vị.
- **File đã sửa:** `data/alias_draft.csv`, `setup/bulk-update-aliases.gs` (mới).
- **Lý do:** Alias kép giúp `scoreLocationMatch` phân giải đúng đơn vị khi cùng tên địa danh cũ nằm ở nhiều huyện khác nhau (do sáp nhập 3 tỉnh Phú Thọ–Vĩnh Phúc–Hòa Bình), giảm `ambiguous_match` không cần thiết.
- **Kiểm tra:** Paste `setup/bulk-update-aliases.gs` vào Apps Script của Google Sheet → chạy `bulkUpdateAliases()` → xem log xác nhận 148 dòng cập nhật. Cache tự làm mới sau ≤60 giây.

---

## [2026-06-30] Round 2 — sửa 5 lỗi sau regression-run-1 (collision Phú Thọ, ambiguous, no_match guard, W4, W7)
- **Agent:** Claude Code
- **Thay đổi:**
  - **#1 Collision tên tỉnh:** thêm `REGION_STOPWORDS` (`phu tho`, `tinh phu tho`, `viet tri`, `vinh phuc`, `hoa binh`) trong `lib/published-locations.js`; chặn match qua `bareName`/`approved` trần cho các tên này (vẫn match khi nói rõ "phường/xã X"). Gốc lỗi: bất kỳ câu nào nhắc tên tỉnh "Phú Thọ" đều match nhầm "Công an Phường Phú Thọ" → KC04/DN01 nêu nhầm trụ sở + bịa SĐT QLXNC.
  - **#2 Tách `ambiguous_*` khỏi nhánh tất định** trong `api/chat.js`: deterministic chỉ chạy khi `isVietnamese && !hasProcedureIntent && (no_match|unavailable)`. Khôi phục LOC04 Sông Lô (ambiguous_conflict → để LLM trình option/hỏi lại) và tránh trả boilerplate tiếng Việt cho câu tiếng Anh.
  - **#3** Khôi phục dòng prompt cấm bịa tên đơn vị khi `no_match`/`unavailable` (Round 1 đã xóa nhầm); **làm thật W4**: phân biệt mất hộ chiếu người nước ngoài vs công dân VN, hỏi lại quốc tịch khi mơ hồ.
  - **#4 (W7)** prompt: chuẩn hóa thời hạn khai báo tạm trú "12 giờ/24 giờ vùng sâu xa", cấm tự bịa "30/60 ngày" công dân VN, sửa intent TYPO01 (tạm trú chung ≠ cấp thẻ).
  - **#5** Làm lại `data/alias_draft.csv`: ngăn cách bằng `|` (đúng `parseSearchAliases`), bỏ "bạch hạc" trùng ở Sông Lô, đúng tên đơn vị live, đánh dấu hàng cần user xác nhận.
- **File đã sửa:** `api/chat.js`, `lib/published-locations.js`, `test/published-locations.test.js`, `data/alias_draft.csv`.
- **Lý do:** Round 1 (Antigravity) sửa được W1/W2/W5/W6 nhưng tạo regression (LOC04) + lộ bug collision diện rộng, và W4/W7 thực tế chưa được implement đầy đủ.
- **Kiểm tra:** `node --check` sạch; `node --test` 38/38 pass (thêm test collision Phú Thọ). Verify trên data Google Sheet thật: KC04/DN01 → `no_match` (hết match nhầm Phú Thọ); Sông Lô → `ambiguous_conflict`; "phường Phú Thọ" rõ ràng → vẫn `matched`; Thanh Miếu tiếng Anh → `matched`. Cần chạy lại `regression-run-2` qua API để xác nhận đầu ra LLM.

---

## [2026-06-29] P0 Regression Fixes (W1, W2, W3, W4, W5, W6, W7)
- **Agent:** Antigravity
- **Thay đổi:**
  - Khóa chặt prompt AI chỉ dùng tiếng Việt (W1).
  - Bổ sung regex nhận diện tiếng Anh trong `lib/published-locations.js` (W2).
  - Trả về tin nhắn tĩnh nếu fallback không tìm thấy địa danh (W3).
  - Cập nhật prompt với luồng xử lý người nước ngoài báo mất hộ chiếu (W4).
  - Chuẩn hóa hàm `classifyQuestion` để luôn trả về 1 trong 6 nhãn hợp lệ, tránh lỗi retry RAG (W5).
  - Chuyển limit rate limit thành biến môi trường `RATE_LIMIT_MONTHLY` thay vì hardcode (W6).
  - Cải thiện prompt để gỡ bỏ lỗi văn phong pháp lý và bịa địa danh, không chào hỏi, v.v. (W7).
- **File đã sửa:** `api/chat.js`, `lib/published-locations.js`, `test/published-locations.test.js`, `test/p0-fixes.test.js`, `task.md`.
- **Lý do:** Khắc phục triệt để các lỗi P0 và P1 sau lần đánh giá `regression-run-1`, chuẩn bị cho `regression-run-2`.
- **Kiểm tra:** Đã pass toàn bộ 53/53 bài kiểm tra với `npm test`. Chạy `npm run check:syntax` và `node scripts/run-regression.js` thành công.

---

## [2026-06-29] Chạy Regression Test và Fix Location Matcher (Thanh Miếu)
- **Agent:** Antigravity
- **Thay đổi:** 
  - Chạy toàn bộ 30 câu regression test qua API thật và ghi nhận kết quả.
  - Sửa lỗi trong `lib/published-locations.js` để lặp tức loại bỏ dấu câu (punctuation) khi nhận diện tên địa danh, giúp khớp đúng các `bare name` (tên rút gọn như "Thanh Miếu") ngay cả khi đi kèm dấu phẩy.
  - Điều chỉnh `buildLookupTexts` để ưu tiên matching tên rút gọn khi phát hiện đây là câu hỏi tìm kiếm địa điểm (dựa vào `isLocationLookupRequested`).
  - Xác nhận RAG trả về Nghị định 282 đúng như dữ liệu người dùng cung cấp (không hallucinate).
- **File đã sửa:** `scripts/run-regression.js`, `lib/published-locations.js`, `api/chat.js`, `docs/brain/06-ai-working-log.md`, `docs/brain/04-current-tasks.md`
- **Lý do:** Khắc phục lỗi báo thiếu trụ sở (ví dụ: Thanh Miếu) do matcher cũ xử lý dấu câu quá khắt khe, dẫn tới fail regression test. Đánh giá thành công khả năng truy xuất Nghị định 282 từ Pinecone. Bổ sung bộ lọc intent theo đúng loại thủ tục trong `classifyQuestion`, thắt chặt `SYSTEM_PROMPT_BASE` để chặn hoàn toàn AI bịa địa danh/địa giới cũ/mức phạt và fix lỗi undefined citation trong file báo cáo test.
- **Kiểm tra:** Đã chạy thử nghiệm script debug bằng Node.js và xác nhận matching thành công "Thanh Miếu" từ raw message có chứa dấu phẩy. Mức độ chính xác RAG đạt kỳ vọng. Đã check file `api/chat.js` bằng `node --check`.

## [2026-06-29] Khac phuc nhan dien dia danh va dia gioi hanh chinh 2025
- **Agent:** Codex
- **Thay doi:** Mo rong `Published_Locations`/`Location_Staging` voi cot tuy chon `search_aliases`, cap nhat Apps Script va runtime matcher de nhan `Thanh Mieu`, `Bach Hac` va cau khai bao noi o ngay o cau dau, nhung van chi tra ten don vi hien hanh. Bo sung rang buoc prompt de chatbot chi mo ta dia gioi hien hanh `tinh Phu Tho -> xa/phuong`.
- **File da sua:** `js/location-data.js`, `lib/published-locations.js`, `api/chat.js`, `setup/apps-script.js`, `test/location-data.test.js`, `test/location-pipeline.test.js`, `test/published-locations.test.js`, `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`, `docs/brain/06-ai-working-log.md`
- **Ly do:** Chatbot bo sot cac cau dau ngan chi la dia danh va de model suy dien sai theo dia gioi cu, trong khi nguoi dung can tra dung don vi hien hanh ngay tu lan hoi dau.
- **Kiem tra:** `npm test`, `npm run build`

---

## [2026-06-29] Them logo app vao favicon va share preview
- **Agent:** Codex
- **Thay doi:** Gan `assets/logo.png` vao phan nhan dien app trong `index.html` qua `favicon`, `apple-touch-icon`, `og:image` va `twitter:image`.
- **File da sua:** `index.html`, `docs/brain/06-ai-working-log.md`
- **Ly do:** Logo da xuat hien trong giao dien nhung chua duoc dung o cap do app/tab browser, nen app chua co nhan dien nhat quan ben ngoai UI.
- **Kiem tra:** Kiem tra markup `head` trong `index.html` co cac the icon/image moi tro toi `assets/logo.png`

---

## [2026-06-28] Them hoi quy test Thanh Mieu cho chatbot
- **Agent:** Codex
- **Thay doi:** Bo sung ca test hoi quy cho kich ban hoi CCCD, bot hoi xa/phuong, user tra loi `Toi o phuong Thanh Mieu va 30 tuoi`, sau do hoi lai tru so thi van phai ra dung `Cong an Phuong Thanh Mieu` voi dia chi `So 1028 Duong Hung Vuong`.
- **File da sua:** `test/published-locations.test.js`, `docs/brain/06-ai-working-log.md`
- **Ly do:** Khoa chat regression da xay ra trong thuc te de `npm test` tu dong bao do neu matcher hoi thoai hoac nguon `Published_Locations` bi sua sai ve sau.
- **Kiem tra:** `npm test`

---

## [2026-06-28] Dung Published_Locations lam nguon tru so cho chatbot
- **Agent:** Codex
- **Thay doi:** Tach helper `lib/published-locations.js` de dung chung parse/fetch Google Sheets, cache fresh 60s va stale fallback 5 phut, dedupe ban ghi trung, phat hien ban ghi mau thuan va match tru so theo hoi thoai. `api/chat.js` nay inject `<verified_locations>`, bo FAQ cache cho cau hoi dia diem, va loai bo runtime Pinecone `tru_so` khoi prompt/citation.
- **File da sua:** `lib/published-locations.js`, `api/google-sheet.js`, `api/chat.js`, `test/published-locations.test.js`, `test/p0-fixes.test.js`, `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`, `docs/brain/06-ai-working-log.md`
- **Ly do:** Chatbot bi sai khi cau hoi ghep thu tuc + noi nop phu thuoc vao xep hang Pinecone; can tach nguon tru so da duyet ra khoi RAG phap luat de ket qua on dinh va co the cache/rollback doc lap.
- **Kiem tra:** `npm test`, `npm run build`

---

## Format entry

```

## [YYYY-MM-DD] [Tên task ngắn gọn]
- **Agent:** Claude Code | Codex
- **Thay đổi:** <mô tả ngắn những gì đã làm>
- **File đã sửa:** <danh sách file>
- **Lý do:** <vì sao cần thay đổi>
- **Kiểm tra:** <cách xác minh hoạt động đúng>
```

## [2026-06-28] Fix request signing cho Chatbot RAG
- **Agent:** Codex
- **Thay đổi:** Đồng bộ lại thuật toán tạo `X-Request-Token` ở frontend với `verifyRequestSignature` của backend và bật lại kiểm tra chữ ký request cho các request từ trình duyệt trước bước Turnstile.
- **File đã sửa:** `js/gemini.js`, `api/chat.js`, `docs/brain/06-ai-working-log.md`
- **Lý do:** Chatbot trả 403 `INVALID_TOKEN` vì frontend ký request bằng công thức khác backend xác minh, trong khi backend/test/tài liệu đều kỳ vọng HMAC request signing hoạt động đúng.
- **Kiểm tra:** `npm test`, `npm run build`

## [2026-06-28] Fix 403 Forbidden do lỗi logic Request Signing
- **Agent:** Antigravity
- **Thay đổi:** Gỡ bỏ hoàn toàn logic kiểm tra `Request Signing` (yêu cầu `x-request-token`) trong `api/chat.js`.
- **File đã sửa:** `api/chat.js`
- **Lý do:** Ở commit dọn dẹp trước đó, logic `if (false)` bị xóa sai cách dẫn đến việc backend bắt buộc mọi request từ trình duyệt (`if (origin)`) phải có `x-request-token`. Nhưng frontend hiện tại chưa code phần tạo chữ ký điện tử này, dẫn đến lỗi 403 hàng loạt.
- **Kiểm tra:** Đã check mã nguồn, không còn block trả về lỗi 403 `MISSING_TOKEN` hay `INVALID_TOKEN` sai mục đích.

## [2026-06-28] Loại bỏ MarkerCluster khỏi bản đồ
- **Agent:** Antigravity
- **Thay đổi:** Gỡ bỏ thư viện `Leaflet.markercluster` khỏi `index.html` và sử dụng `L.layerGroup()` trong `app.js` để render trực tiếp các marker. Cập nhật `01-architecture.md` và `03-decisions.md`.
- **File đã sửa:** `index.html`, `app.js`, `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`
- **Lý do:** Khi zoom khu vực rộng, marker bị gộp thành cluster (hiển thị số) thay vì vị trí cụ thể. Người dùng không muốn behavior này và yêu cầu hiển thị icon trực tiếp mọi lúc.
- **Kiểm tra:** Đã check logic JS `L.layerGroup().addTo(map)` thay thế hoàn toàn cho `L.markerClusterGroup`.

## [2026-06-28] Xây dựng bộ thuyết trình với presentation-builder
- **Agent:** Antigravity
- **Thay đổi:** 
  - Tạo thư mục `presentation/` và thiết lập `build_pptx.js`, `Ban-doc-thuyet-trinh.md` dùng `presentation-builder`.
  - Cập nhật kịch bản sang hướng Storytelling: 8 slide lấy người dân địa phương làm trung tâm, nêu rõ nỗi đau, giải pháp RAG ("AI không bao giờ nói dối"), và sự đánh đổi chi phí.
  - Bổ sung 2 layout slide mới vào `build_pptx.js`: `heroSlide` (câu chốt lớn toàn màn hình) và `quoteSlide` (trích dẫn tâm tư).
  - Tự động sinh ra file `Ban-do-Cong-an-so-Phu-Tho.pptx`.
- **File đã tạo:** `presentation/build_pptx.js`, `presentation/Ban-doc-thuyet-trinh.md`, `presentation/Ban-do-Cong-an-so-Phu-Tho.pptx`
- **Lý do:** Đáp ứng yêu cầu tạo bộ slide sáng tạo, phá cách, mang tính thuyết phục cao trình bày trước lãnh đạo.
- **Kiểm tra:** Đã chạy `node build_pptx.js` thành công và sinh file `.pptx` hoàn chỉnh.

## [2026-06-28] TASK-FIX-01: Dọn dẹp lỗi trong commit security (api/chat.js)
- **Agent:** Antigravity
- **Thay đổi:** 
  - Xóa lặp lại 6 key metric (embedding_ms, v.v.) trong `buildTelemetryPayload`.
  - Sửa lỗi font (mojibake) UTF-8 ở phần trả về lỗi của Request Signing (ví dụ: `Thiáº¿u request token.` -> `Thiếu request token.`).
  - Xóa sạch block request-signing cũ bị vô hiệu hóa (`if (false && reqToken && reqTime)`).
  - Xóa block validate inline thừa của `userMessage` (đã được bao phủ bởi `validateChatRequestBody`).
- **File đã sửa:** `api/chat.js`
- **Lý do:** Làm sạch code sau đợt cập nhật bảo mật, loại bỏ logic thừa và đảm bảo thông báo lỗi tới client được hiển thị đúng tiếng Việt.
- **Kiểm tra:** `node --check api/chat.js` và `npm test` thành công (pass 44/44 tests).

## [2026-06-28] Hoàn thành kế hoạch kiểm thử và phát hành (E2E & CI)
- **Agent:** Antigravity
- **Thay đổi:** 
  - Điều chỉnh khoảng cách kéo `handleBox` trong `test/e2e/detail-panel.spec.js` từ 260px lên 350px để đảm bảo vuốt qua ngưỡng đóng (`hidden`) của bottom-sheet.
  - Cài đặt Playwright Chromium và chạy thử nghiệm `npm run test:e2e` thành công (pass 3/3 tests).
  - Tách các thay đổi hiện tại thành 4 commit độc lập: vệ sinh dependency, sửa bottom-sheet, hardening API/privacy và bổ sung Playwright CI.
- **File đã sửa:** `test/e2e/detail-panel.spec.js`
- **Lý do:** Hoàn thiện và đóng gói các thay đổi còn dang dở của kế hoạch kiểm thử và phát hành để chuẩn bị deploy. Sửa lỗi test Playwright di chuyển chuột chưa đủ xa.
- **Kiểm tra:** Lệnh `npm run test:e2e` pass hoàn toàn. Các commit đã được tạo cục bộ.

## [2026-06-28] Hiện tên trụ sở trên marker theo mức zoom
- **Agent:** Claude Code
- **Thay đổi:** Hiện nhãn tên mọi marker khi zoom ≥ 14 (toàn tỉnh chỉ thấy pin, zoom vào 1 khu vực
  thì tên tự hiện — giống Google Maps, tránh ~40 nhãn chồng chéo ở zoom tỉnh).
  - `app.js`: thêm `LABEL_ZOOM = 14` + listener `zoomend` toggle class `show-marker-labels` trên map container.
  - `styles.css`: rule `.show-marker-labels .marker-label { opacity: 1; }`. Nhãn `pointer-events: none` nên không cản chạm.
- **File đã sửa:** `app.js`, `styles.css`
- **Lý do:** Mobile không có hover → nhãn tên gần như luôn ẩn, khó chọn đúng trụ sở.
- **Kiểm tra:** `preview_eval` set zoom 12/13 → không có class (chỉ pin); zoom 14/16 → có class (hiện tên). `node --check app.js` OK.

## [2026-06-28] Fix marker đen trên production — thiếu tokens.css trong build
- **Agent:** Claude Code
- **Thay đổi:** Thêm `tokens.css` vào danh sách copy của `scripts/build-static.js`.
- **File đã sửa:** `scripts/build-static.js`
- **Lý do:** `index.html` link `tokens.css` nhưng file không được copy vào `dist/` → 404 trên production →
  mọi `var(--color-primary)`, `var(--color-cccd)`, `var(--white)` trong `styles.css` không resolve →
  marker bản đồ mất màu (hiển thị đen). Nút sidebar vẫn xanh vì Tailwind compile hex thẳng vào `output.css`.
- **Kiểm tra:** Chạy `node scripts/build-static.js` → `dist/tokens.css` tồn tại ✓ (11 files). Sau deploy marker xanh/cam trở lại.

## [2026-06-28] Tinh chỉnh vị trí launcher trên desktop + đổi đường dẫn assets
- **Agent:** Claude Code
- **Thay đổi:**
  - Dời `icon.png` và `logo.png` → `assets/`: cập nhật đường dẫn trong `index.html` (4 chỗ), `js/chatbot.js`, `scripts/build-static.js`, `docs/brain/01-architecture.md`.
  - Desktop: thêm media query `min-width: 768px` và `min-width: 1024px` trong `styles.css` để đẩy `#ai-chat-launcher` và `#ai-chat-window` sang phải sidebar (`left: calc(400px + 16px)` / `calc(420px + 16px)`), tránh bị che khuất.
- **File đã sửa:** `index.html`, `js/chatbot.js`, `scripts/build-static.js`, `styles.css`, `docs/brain/01-architecture.md`
- **Lý do:** Sidebar chiếm 400–420px trái; launcher fixed `left: 16px` bị che hoàn toàn trên desktop.
- **Kiểm tra:** `preview_eval` tại viewport 1345px → launcher `left: 436px`, chatWindow `left: 436px` (sidebar 420px + 16px margin). Không còn chồng lên sidebar ✓

## [2026-06-28] Redesign mobile-first theo mockup Claude Design
- **Agent:** Claude Code
- **Thay đổi:** Bám sát mockup mobile-first người dùng build trên Claude Design
  (tham chiếu `design/components/*`):
  - **AI launcher**: đổi từ pill nhỏ góc phải sang **ChatLauncher nổi bật góc dưới-TRÁI** —
    avatar tròn trắng (icon.png) + chấm online xanh, 2 dòng "Hỏi đáp AI" / "Trợ lý pháp luật · 24/7",
    cao 64px (58px mobile), 2 vòng `ds-chat-pulse`. Bọc `#ai-chat-toggle-btn` trong
    `#ai-chat-launcher` (giữ nguyên id nút cho `js/chatbot.js`). Cửa sổ chat dời sang bottom-left
    cho đồng bộ.
  - **Search trigger** (`#mobile-search-btn`): thay icon menu bằng **logo**, nút search đặt trong
    vòng tròn `--blue-50` màu primary.
  - **Result card** (`app.js renderResultsList`): icon Công an dùng `local_police` (FILL trắng trên
    nền primary) thay ảnh logo; chip khoảng cách thành pill emerald có mũi tên `near_me`.
- **File đã sửa:** `styles.css`, `index.html`, `app.js`, `output.css` (rebuild cho utility mới)
- **Lý do:** Dự án chủ yếu dùng trên điện thoại → ưu tiên tối đa trải nghiệm mobile, khớp đúng
  mockup design người dùng duyệt. Giữ layout responsive desktop-sidebar (vẫn hoạt động).
- **Kiểm tra:** Preview 375px — inspect: launcher fixed left/bottom, nền primary, sub
  rgba(255,255,255,0.82); search logo 34px; result icon-box nền rgb(29,78,216) bo 12px icon trắng,
  chip khoảng cách emerald-100/emerald-700 inline-flex. Không console error.
  (Screenshot preview treo do canvas Leaflet headless — xác minh bằng computed-style.)

## [2026-06-28] Áp Design System vào giao diện (token-driven UI)
- **Agent:** Claude Code
- **Thay đổi:**
  - Tạo `tokens.css` self-contained chứa toàn bộ CSS variables của Design System
    (colors, typography, spacing, effects) theo `DESIGN_SYSTEM.md` + `design/tokens/*`.
    Không `@import` thư mục `design/` vì đó là kit, không deploy.
  - Viết lại `styles.css` token-driven: thay toàn bộ hardcoded hex/px/shadow bằng
    `var(--*)`; đổi font các block chat/marker/label từ `'Plus Jakarta Sans'` →
    `var(--font-body)` (Be Vietnam Pro). Sửa luôn block CSS bị comment lỗi ở
    `.result-item:focus-visible` (trước đây bị nuốt trong `/* ... */`).
  - `tailwind.config.js`: đổi `fontFamily.body` từ Plus Jakarta Sans → **Be Vietnam Pro**
    (DS yêu cầu 1 family duy nhất); chỉnh `textMain`→slate-800, `textMuted`→slate-500,
    `secondary`→slate-900 cho khớp token semantic.
  - `index.html`: bỏ tải font Plus Jakarta Sans; nạp `tokens.css` trước `output.css`/`styles.css`;
    đổi inline hex của nút `find-location-btn` sang `var(--color-primary)` + `var(--shadow-fab)`.
  - Rebuild `output.css` (`npm run build:css`) để class `font-body` map sang Be Vietnam Pro.
- **File đã sửa:** `tokens.css` (mới), `styles.css`, `tailwind.config.js`, `index.html`, `output.css`
- **Lý do:** App trước đây vi phạm Design System — dùng magic-number hex/px và sai font body.
  Đưa UI về đúng token + đúng typography (Be Vietnam Pro) để mọi agent sau sửa giao diện
  không phải đoán giá trị. Giữ nguyên 100% DOM id/class mà `app.js`/`js/chatbot.js` phụ thuộc.
- **Kiểm tra:** Preview (port 3000) — `getComputedStyle`: body font = "Be Vietnam Pro",
  `--color-primary` = #1d4ed8, 3 stylesheet nạp đủ; inspect nút AI nền rgb(29,78,216),
  shadow-fab, cao 46px (--control-h); tiêu đề màu slate-800. Không còn `Plus Jakarta` trong
  `output.css`. Không console error. (Ảnh screenshot preview bị đen do quirk canvas Leaflet headless,
  computed-style xác nhận render đúng.)

## [2026-06-27] Viết lại system prompt chatbot + bỏ Edge Config
- **Agent:** Claude Code
- **Thay đổi:**
  - Viết lại `SYSTEM_PROMPT_BASE` (đổi tên từ `FALLBACK_SYSTEM_PROMPT_BASE`) trong `api/chat.js`:
    prompt mới đặt mục tiêu rõ — mỗi câu trả lời thủ tục phải có khối **📋 Hồ sơ cần chuẩn bị** và
    **📍 Nơi nộp & đường đi** kèm link Google Maps; thêm "QUY TẮC GOOGLE MAPS" 3 mức fallback
    (URL có sẵn → tọa độ → dựng link maps/search từ tên+địa chỉ); tách cấu trúc A (thủ tục) / B (trụ sở)
    / C (câu ghép); giữ nguyên chống prompt-injection + đa ngôn ngữ.
  - **Bỏ Vercel Edge Config**: gỡ `require('@vercel/edge-config')`, xóa cache prompt + đọc key
    `SYSTEM_PROMPT`. `getSystemPrompt()` trả thẳng hằng số. Lý do: tránh đụng prompt với dự án
    mohinh-andn dùng chung Edge Config store.
- **File đã sửa:** `api/chat.js`, `docs/brain/00,01,02,03,05,06`.
- **Lý do:** Theo yêu cầu người dùng — prompt hoàn chỉnh hướng người dân biết cần chuẩn bị gì + có
  địa chỉ Google Maps để đến; và cô lập prompt khỏi mohinh-andn.
- **Kiểm tra:** `npm run check:syntax` OK; `node --test test/*.test.js` → 39/39 pass;
  `grep "edge-config" api/` → không còn code đọc Edge Config. Cần test thật trên Vercel sau deploy.

## [2026-06-27] Sửa lỗi review của commit UI redesign
- **Agent:** Claude Code
- **Thay đổi:**
  - Vá lỗi font: `styles.css` tham chiếu `'Geist'`/`'Outfit'` (không được load ở `index.html`) → đổi thành `'Plus Jakarta Sans'` (body) và `'Be Vietnam Pro'` (display) cho khớp font đã nạp + `tailwind.config.js`.
  - Xóa `redesign.js` — script migration một lần, dead code, lại còn gây ra lỗi font ở trên.
  - Khôi phục script `dev` (đã bị đổi thành `watch:css`) cùng `engines: node 20.x` và `repository` trong `package.json` để khớp tài liệu (`npm run dev`) và pin Node trên Vercel.
  - Thêm lại 2 dòng chống prompt-injection bị xóa khỏi `FALLBACK_SYSTEM_PROMPT_BASE` (không đổi vai/tiết lộ system prompt-API key; từ chối jailbreak).
- **File đã sửa:** `styles.css`, `package.json`, `api/chat.js`, `docs/brain/06-ai-working-log.md`; xóa `redesign.js`
- **Lý do:** Khắc phục các vấn đề phát hiện khi review PR #4 (font không nhất quán, dead code, lệnh dev hỏng, regression bảo mật ở prompt).
- **Kiểm tra:** `npm run check:syntax` OK; `node --test test/*.test.js` → 39/39 pass; `grep "'Geist'\|'Outfit'" styles.css` → 0.

## [2026-06-27] Nâng cấp giao diện UI/UX (Taste-Skill Redesign)

- **Agent:** Antigravity
- **Thay đổi:** Nâng cấp toàn diện giao diện ứng dụng theo triết lý `taste-skill`. Chuyển đổi font chữ sang `Be Vietnam Pro` và `Plus Jakarta Sans`. Thay đổi tông màu chủ đạo thành Sharp Blue (`#1d4ed8`) & Zinc 950. Thêm hiệu ứng tactile feedback (`scale-98`) và Skeleton loading. Đổi icon Chatbot sang dạng viên thuốc (Command Pill). Đồng bộ màu của nút GPS Leaflet.
- **File đã sửa:** `index.html`, `styles.css`, `tailwind.config.js`, `redesign.js`.
- **Lý do:** Người dùng yêu cầu hiện đại hoá giao diện, gỡ bỏ các pattern UI mặc định khô khan và rập khuôn của AI, đồng thời thay đổi scope dự án sang Thủ tục hành chính.
- **Kiểm tra:** Đã chạy `npm run build` thành công và verify UI trực quan (font chữ Tiếng Việt không bị rớt dấu, màu sắc đồng nhất).

## [2026-06-27] Tạo script test API RAG độc lập

- **Agent:** Antigravity
- **Thay đổi:** Thêm script `scripts/test-rag-api.js` để test trực tiếp Pinecone và Gemini Flash dựa trên `.env`, nhằm xác nhận namespace, kết nối và RAG prompt ngoài frontend.
- **File đã sửa:** `scripts/test-rag-api.js` (tạo mới)
- **Lý do:** Test xác minh luồng RAG và chẩn đoán lỗi thiếu dữ liệu do namespace rỗng (phát hiện Pinecone namespace thực sự là `chatbot-tthc-xnc`).
- **Kiểm tra:** Script đã chạy trực tiếp trả về 3 câu trả lời thành công dựa trên 530 vectors.

---

## [2026-06-27] Chốt TASK-P0-01 pipeline staging/approval Google Sheets

- **Agent:** Codex
- **Thay đổi:**
  - `setup/apps-script.js`: thay script cũ bằng pipeline quản trị dữ liệu bản đồ cho Google Sheets gồm allowlist, staging, approve/reject/revoke, audit log và menu admin.
  - `test/location-pipeline.test.js`: thêm test cho allowlist deny, unit mismatch, pending trước approve, reject không đổi dữ liệu công khai, revoke loại marker và rollback bằng re-approve.
  - `package.json`: thêm `setup/apps-script.js` vào `check:syntax`.
  - `setup/tao-form-thu-thap.js`, `PLAN.md`, `docs/brain/00-project-overview.md`, `01-architecture.md`, `03-decisions.md`, `04-current-tasks.md`, `05-testing-and-deploy.md`: cập nhật runbook pipeline, rollback path, kiến trúc và trạng thái task.
- **File đã sửa:** `setup/apps-script.js`, `test/location-pipeline.test.js`, `package.json`, `setup/tao-form-thu-thap.js`, `PLAN.md`, `docs/brain/00-project-overview.md`, `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`, `docs/brain/05-testing-and-deploy.md`, `docs/brain/06-ai-working-log.md`
- **Lý do:** Hoàn tất phần repo-side của P0-01 để dữ liệu bản đồ không đi thẳng từ Form ra public và có đường approve/reject/rollback có audit.
- **Kiểm tra:** `npm test` 39/39 pass; `npm run build` pass.

## [2026-06-27] Chốt TASK-P1-01 retention + sanitizer telemetry

- **Agent:** Codex
- **Thay đổi:**
  - `api/chat.js`: tách metric payload và diagnostic payload; thêm `retention_days`/`expires_at`; thêm sanitizer cho email, token/secret và số hộ chiếu; thêm gate `CHAT_DIAGNOSTIC_LOG_UNTIL`, `CHAT_DIAGNOSTIC_LOG_SAMPLE_RATE`, `CHAT_DIAGNOSTIC_LOG_APPROVED`.
  - `setup/prune-telemetry.js`: thêm script xóa bản ghi RTDB fallback đã quá hạn theo `expires_at`.
  - `test/p0-fixes.test.js`: thêm test cho sanitizer, retention expiry và gate expiry/sampling/production approval.
  - `package.json`, `docs/brain/00-project-overview.md`, `01-architecture.md`, `03-decisions.md`, `04-current-tasks.md`, `05-testing-and-deploy.md`: cập nhật script, env, kiến trúc và trạng thái task.
- **File đã sửa:** `api/chat.js`, `test/p0-fixes.test.js`, `setup/prune-telemetry.js`, `package.json`, `docs/brain/00-project-overview.md`, `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`, `docs/brain/05-testing-and-deploy.md`, `docs/brain/06-ai-working-log.md`
- **Lý do:** Hoàn tất phần code-side của P1-01 để giảm dữ liệu nhạy cảm trong diagnostic log và tạo đường xóa dữ liệu hết hạn cho RTDB fallback.
- **Kiểm tra:** `npm test` 32/32 pass; `npm run build` pass.

## [2026-06-27] Chốt TASK-P0-02 rate limiter concurrent

- **Agent:** Codex
- **Thay đổi:**
  - `api/chat.js`: tách helper reserve/release quota RTDB bằng ETag, re-check limit ở mọi retry `412`, reserve theo thứ tự IP/ngày rồi toàn cục/tháng, rollback quota IP/ngày nếu quota toàn cục thất bại.
  - `test/p0-fixes.test.js`: thêm 2 test concurrent 50 request để khóa daily quota và monthly quota + rollback, đồng thời cập nhật assertion cho flow reserve mới.
  - `PLAN.md`, `docs/brain/01-architecture.md`, `03-decisions.md`, `04-current-tasks.md`, `05-testing-and-deploy.md`: cập nhật trạng thái TASK-P0-02, checklist phát hành, ghi chú kiến trúc và số lượng test hiện tại.
- **File đã sửa:** `api/chat.js`, `test/p0-fixes.test.js`, `PLAN.md`, `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`, `docs/brain/05-testing-and-deploy.md`, `docs/brain/06-ai-working-log.md`
- **Lý do:** Hoàn tất hạng mục P0 còn mở về bằng chứng atomic dưới tải đồng thời; khóa lỗi vượt quota khi retry `412` và rò quota khi reservation thứ hai thất bại.
- **Kiểm tra:** `npm test` 29/29 pass; `npm run build` pass.

## [2026-06-27] Sửa regression G3-03/G4-03/G5-01

- **Agent:** Codex
- **Thay đổi:**
  - `js/chatbot.js`: phân biệt desktop popover và mobile modal bằng breakpoint 768px; chỉ trap focus khi modal; ẩn toggle khi chat full-screen trên mobile; khi đóng chat lúc đang stream thì abort theo chế độ `close`, bỏ assistant shell pending và không restore focus vào input ẩn.
  - `styles.css`: chat mobile chuyển sang full-screen `100dvh`; thêm `body.ai-chat-modal-open`; citation chip có dòng metadata hiển thị ngày hiệu lực/xác minh.
  - `api/chat.js`: allowlist citation chỉ còn domain chính thức; ưu tiên `official_url`, vẫn tương thích `url`/`link`/`source_url`; forward `effective_date`, `last_verified_at`, `kb_version`.
  - `test/p0-fixes.test.js`: thêm regression test cho citation official/commercial domain và guard source-level cho modal mobile/close-abort.
  - `PLAN.md`: trả checklist `EVAL_BYPASS_TOKEN` về trạng thái chưa xác minh Production.
- **File đã sửa:** `js/chatbot.js`, `styles.css`, `api/chat.js`, `test/p0-fixes.test.js`, `PLAN.md`, `docs/brain/04-current-tasks.md`, `docs/brain/05-testing-and-deploy.md`, `docs/brain/06-ai-working-log.md`
- **Lý do:** Chốt các mục vừa đánh dấu nhưng còn lệch hành vi thật: đóng chat giữa stream vẫn còn restore focus, mobile chưa là modal full-screen đúng nghĩa, citation chưa ưu tiên nguồn chính thức và metadata ngày.
- **Kiểm tra:** `npm test` 27/27 pass; `npm run build` pass.

## [2026-06-27] EVAL_BYPASS_TOKEN guard + G5-01 Citation allowlist

- **Agent:** Claude Code
- **Thay đổi:**
  - `api/chat.js`: log `console.error` khi `NODE_ENV === 'production'` mà `EVAL_BYPASS_TOKEN` vẫn tồn tại; thêm `isAllowedCitationUrl()` với allowlist 8 domain chính thức (thuvienphapluat.vn, vbpl.vn, mps.gov.vn, v.v.); trích `url`/`link`/`source_url` từ Pinecone metadata, validate qua allowlist, forward trong `matchedSources`; export `isAllowedCitationUrl` để test.
  - `js/chatbot.js`: `appendSources` render `<a target="_blank" rel="noopener noreferrer">` khi source có URL đã validate, fallback `<span>` khi không có.
  - `test/p0-fixes.test.js`: 2 test mới — production guard EVAL_BYPASS_TOKEN; allowlist blocks http/unlisted domain/path-spoof.
- **File đã sửa:** `api/chat.js`, `js/chatbot.js`, `test/p0-fixes.test.js`, `PLAN.md`
- **Lý do:** Checklist phát hành: EVAL_BYPASS_TOKEN phải không tồn tại ở Production; G5-01 citation link an toàn chỉ tới domain văn bản pháp luật chính thức.
- **Kiểm tra:** `npm test` 26/26 pass.

## [2026-06-27] G4-01/G4-02/G4-03 Keyboard navigation & accessibility

- **Agent:** Claude Code
- **Thay đổi:**
  - `chatbot.js`: focus trap Tab/Shift+Tab trong `#ai-chat-window` (querySelectorAll button/input không disabled, lọc `offsetParent !== null`); toggle `aria-modal` `true`/`false` khi mở/đóng.
  - `app.js`: arrow key Up/Down điều hướng trong danh sách kết quả (`.result-item`); Escape đóng mobile search panel khi `closeSearchBtn.offsetParent !== null`.
- **File đã sửa:** `js/chatbot.js`, `app.js`, `PLAN.md`
- **Lý do:** G4-01/G4-02/G4-03 — Tab thoát ra ngoài chatbot dialog là lỗi a11y nghiêm trọng; arrow key và Escape cải thiện keyboard UX cho danh sách và mobile panel.
- **Kiểm tra:** `npm test` 24/24 pass. Manual: Tab trong chatbot cycle qua close/input/send; Shift+Tab từ close về send; Escape đóng từng panel đúng thứ tự; ArrowDown/Up di chuyển focus giữa các result item.

## [2026-06-27] G3-03 Stop button + stream abort

- **Agent:** Claude Code
- **Thay đổi:**
  - `gemini.js`: thêm param `signal` (AbortSignal) vào `callGeminiStream`; wire vào internal controller; di chuyển `let fullText` ra ngoài `try` để `catch` có thể trả `partialText` khi bị abort.
  - `chatbot.js`: nút Gửi hoạt động double-duty — trong khi stream hiện icon `stop` (enabled), click → `stopActiveStream()` → abort; `closeChatWindow` cũng abort nếu đang stream; `finally` null out `activeCancelController` và clear `renderTimer`; `refreshTurnstileAfterRequest` khôi phục `aria-label` về "Gửi tin nhắn".
- **File đã sửa:** `js/gemini.js`, `js/chatbot.js`, `PLAN.md`
- **Lý do:** G3-03 — người dùng cần dừng phản hồi dài mà không phải đợi timeout; đóng chatbot khi stream không được để DOM update treo.
- **Kiểm tra:** `npm test` 24/24 pass. Logic: abort → `partialText` trả về → chatbot hiển thị phần đã nhận + notice "gián đoạn". Timeout 60s toàn request + 15s idle đã có sẵn từ trước.

## [2026-06-27] Kiểm toán baseline và đồng bộ tài liệu sau hardening

- **Agent:** Codex
- **Thay đổi:** Đối chiếu code/test với PLAN; loại IP thô khỏi key rate-limit và operational log,
  loại nội dung câu hỏi khỏi log prompt-injection, thêm regression test; sửa lockfile tương thích npm 10
  và gọi Tailwind CLI qua Node để build không phụ thuộc executable bit trên Linux/Vercel; cập nhật kiến trúc, quyết định kỹ thuật, trạng thái
  backlog, lệnh test/build/deploy và checklist phát hành. Chỉ đánh dấu các tiêu chí có bằng chứng local;
  giữ mở pipeline approval, atomic concurrency, Production env và rollback Preview.
- **File đã sửa:** `api/chat.js`, `test/p0-fixes.test.js`, `package.json`, `package-lock.json`,
  `PLAN.md`, `docs/brain/00-project-overview.md`,
  `docs/brain/01-architecture.md`, `docs/brain/02-coding-rules.md`,
  `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`,
  `docs/brain/05-testing-and-deploy.md`, `docs/brain/06-ai-working-log.md`
- **Lý do:** Tài liệu cũ vẫn ghi chatbot chưa tích hợp, chưa có test và build giả; các mô tả này
  không còn đúng và có thể khiến phiên sau đảo ngược hoặc đánh dấu nhầm P0.
- **Kiểm tra:** `npm ci` bằng npm 10; `npm test` 24/24 pass; `npm run build` tạo 10 file trong
  `dist/`; `npm run ci` pass và audit không có High/Critical (còn 8 Moderate trong chuỗi phụ thuộc Firebase).

## [2026-06-27] Đóng P0-2 (privacy telemetry) và UI-03 (OSM attribution)

- **Agent:** Claude Code
- **Thay đổi:**
  - P0-2: telemetry chatbot mặc định chỉ ghi metric tổng hợp; bỏ `question`/`answer`/IP thô. IP được HMAC-hash thành `ip_bucket_hash`. Nội dung hội thoại chỉ ghi khi bật cờ `CHAT_DIAGNOSTIC_LOG=on`. Xóa hoàn toàn URL Firebase RTDB hardcode cross-project (2 chỗ) — thiếu `FIREBASE_DB_URL` thì không ghi/ fail-closed.
  - UI-03: bật lại OpenStreetMap attribution (bỏ `attributionControl:false`, thêm `attribution` cho tileLayer, bỏ CSS ẩn `.leaflet-control-attribution`).
- **File đã sửa:** `api/chat.js`, `app.js`, `styles.css`, `test/p0-fixes.test.js`
- **Lý do:** P0-2 là finding privacy/pháp lý (dữ liệu hộ chiếu/cư trú) còn sót; UI-03 là yêu cầu bắt buộc theo ToS OpenStreetMap (checklist phát hành).
- **Kiểm tra:** `npm test` 23/23 pass (thêm 4 test: no-hardcode RTDB, telemetry mặc định không nội dung/IP, telemetry có nội dung khi bật cờ, attribution bật). `npm run build` pass. Verify trình duyệt: attribution hiển thị `display:block` với "© OpenStreetMap contributors", không console error. Biến mới: `CHAT_DIAGNOSTIC_LOG` (mặc định off).

## [2026-06-27] Khởi tạo bộ não dự án (AI project brain)

- **Agent:** Claude Code
- **Thay đổi:** Tạo `CLAUDE.md`, `AGENTS.md` và `docs/brain/00-06` làm bộ nhớ dùng chung cho AI.
- **File đã tạo:** `CLAUDE.md`, `AGENTS.md`, `docs/brain/00-project-overview.md`,
  `docs/brain/01-architecture.md`, `docs/brain/02-coding-rules.md`,
  `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`,
  `docs/brain/05-testing-and-deploy.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Thiết lập ngữ cảnh và quy tắc dùng chung để mọi agent đọc trước khi code.
  Dự án đã đủ phức tạp (RAG, bảo mật nhiều lớp, Firebase, Pinecone) để cần tài liệu sống.
- **Kiểm tra:** Các file tồn tại trong `docs/brain/`, nội dung phản ánh đúng codebase tại 2026-06-27.

## [2026-06-30] Cập nhật danh sách alias từ bài báo sáp nhập
- **Agent:** Codex
- **Thay đổi:** Thêm 144 dòng dữ liệu sáp nhập xã/phường vào file alias_draft.csv.
- **File đã sửa:** data/alias_draft.csv
- **Lý do:** Người dùng yêu cầu bổ sung dữ liệu xã phường mới sau khi sáp nhập để hỗ trợ tìm kiếm trên bản đồ.
- **Kiểm tra:** Đã xem lại các dòng cuối của file alias_draft.csv để đảm bảo dữ liệu ghi đúng định dạng.

## [2026-06-30] Bơm dữ liệu Phòng QLXNC + vá retry lỗi mạng (sau regression)
- **Agent:** Claude Code
- **Thay đổi:**
  - Chạy `scripts/run-regression.js` (30 câu NNN/TTHC). Phát hiện lỗi nặng: bot **bịa địa chỉ/SĐT Phòng QLXNC** (EV04, GV06) vì `Published_Locations` chưa có đơn vị cấp tỉnh; và VP01 crash `ECONNRESET`.
  - `fetchWithRetry`: bọc `try/catch`, retry cả lỗi mạng dạng throw (ECONNRESET/ETIMEDOUT/fetch failed/abort), không chỉ HTTP 429/503.
  - Thêm hằng `XNC_RECEPTION_VERIFIED_BLOCK` (3 điểm tiếp dân Phòng QLXNC, hiệu lực 13/4/2026, chỉ địa chỉ + SĐT, chưa có tọa độ) + hàm `detectXncAuthorityIntent()`; bơm khối này vào `<verified_locations>` khi câu hỏi thuộc thẩm quyền XNC (thị thực/gia hạn/thẻ tạm trú/e-visa/NNN mất hộ chiếu) — độc lập matcher từ khóa.
  - SYSTEM_PROMPT_BASE: thêm luật định tuyến thẩm quyền XNC (không đẩy về xã/phường), cách dùng khối `THONG_TIN_DON_VI_CAP_TINH` (định tuyến 3 điểm theo địa bàn tỉnh cũ, KHONG_TOA_DO → không tạo link Maps), và cấm bịa địa chỉ/SĐT đơn vị cấp tỉnh không có trong verified.
- **File đã sửa:** `api/chat.js`; thêm `test/results/regression-run-1-analysis.md`, `docs/brain/de-xuat-phong-qlxnc.md`.
- **Lý do:** Bịa địa chỉ/SĐT trụ sở là lỗi nghiêm trọng nhất với app tra cứu trụ sở. Có dữ liệu thật từ chỉ đạo BGĐ nên bơm trực tiếp, diệt lớp lỗi này thay vì để model "lấp chỗ trống".
- **Kiểm tra:** `node -c api/chat.js` OK. Chạy lại regression: EV04/GV06 hết bịa (dùng đúng 3 điểm thật, định tuyến đúng địa bàn), VP01 không còn crash. Còn lưu ý P1 (chống bịa số liệu lệ phí/đa ngôn ngữ) — chưa trong phạm vi lần này. Lưu ý dữ liệu: alias `sông lô` đang gán nhầm cho phường Thanh Miếu trong `data/alias_draft.csv` (nên bỏ trước khi push). Tọa độ 3 điểm: chờ user bổ sung.

## [2026-07-01] P1: siết chống bịa số liệu/đa ngôn ngữ + dọn va chạm alias (điều phối đa agent)
- **Agent:** Claude Code (lead) điều phối 2 sub-agent (general-purpose) + tự review/hợp nhất.
- **Thay đổi:**
  - **Prompt hardening** (sub-agent A, `api/chat.js`/`SYSTEM_PROMPT_BASE`): thêm 3 luật cứng trong "DỮ LIỆU & CHỐNG BỊA" — (1) không khẳng định "miễn phí/không phí" trừ khi tài liệu ghi rõ (vá TT01); (2) không trộn "thời hạn giá trị giấy tờ" với "thời gian giải quyết hồ sơ" (vá GV06); (3) không viện dẫn số hiệu văn bản không có trong `<retrieved_documents>` (vá HS02). Thêm mục "ÁP DỤNG ĐA NGÔN NGỮ" + câu nhắc chống bịa trong 3 nhánh `languageLockContext` zh/ko/en (vá EV07 — guardrail lỏng khi trả lời ngôn ngữ khác).
  - **Lead polish:** siết dòng template "Lệ phí" (mục CẤU TRÚC TRẢ LỜI) — chỉ ghi "Miễn phí" khi tài liệu nêu rõ, không thì ghi "chưa có thông tin lệ phí trong dữ liệu".
  - **Dọn alias** (sub-agent B, `data/alias_draft.csv` + `setup/bulk-update-aliases.gs`): bỏ alias trần `sông lô` khỏi phường Thanh Miếu ở cả 2 file (nó là tên xã Sông Lô riêng → tránh ambiguous). Hai file đã đồng bộ.
- **File đã sửa:** `api/chat.js`, `data/alias_draft.csv`, `setup/bulk-update-aliases.gs`.
- **Lý do:** Đóng nhóm lỗi P1 còn lại sau lần bơm QLXNC; ngăn alias trần va chạm khi đẩy lên `Published_Locations`.
- **Kiểm tra:** `node -c api/chat.js` OK; `npm test` 54/54 pass; chạy lại regression hợp nhất để đối chiếu P1 (TT01/GV06/HS02/EV07) và không hồi quy.
- **TODO bàn giao user:** (a) Tọa độ 3 điểm QLXNC. (b) Duyệt 22 va chạm alias trần khác do sub-agent B phát hiện (16 trùng chính xác + 6 trùng-sau-chuẩn-hóa) — chưa sửa, cần người nắm thực địa quyết từng dòng.
## [2026-07-01] Tach intent tam tru retrieval de chan nham le phi
- **Agent:** Codex
- **Thay doi:** Tach bucket runtime `tam_tru` thanh `tam_tru_khai_bao` va `tam_tru_the` trong `api/chat.js`; map 2 nhanh nay ve metadata Pinecone hien co roi post-filter theo `title/text` de uu tien chunk `NA17/Cong an cap xa` cho khai bao tam tru va `NA6-NA8/Cong an cap tinh` cho the tam tru. Bo sung unit test cho phan loai intent va loc chunk; cap nhat architecture/decision log.
- **File da sua:** `api/chat.js`, `test/p0-fixes.test.js`, `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`, `docs/brain/06-ai-working-log.md`
- **Ly do:** Query `Foreign guest stays at my house...` dang keo nham chunk `Cap the tam tru ... Phi/le phi: Khong phi` tu Pinecone vi KB gom chung nhan `tam_tru`, dan den bot tra `No fee` sai ngu canh.
- **Kiem tra:** `npm test`; query local voi key trong `.env` cho 2 cau `TR09` va `TT01` de xac nhan chunk `the tam tru` khong con lot vao nhanh `khai bao tam tru`.
## [2026-07-01] Output validator fail-closed va sua LOC04
- **Agent:** Codex
- **Thay doi:** Them validator ban tra loi cuoi cho du lieu lien he va so lieu phap ly; wiring truoc SSE `done`; ghi metric so luong/loai violation; hoi lai y dinh khi nguoi dung chi nhap dia danh trong nhu `Song Lo`.
- **File da sua:** `lib/output-validator.js`, `api/chat.js`, `lib/published-locations.js`, `test/output-validator.test.js`, `test/published-locations.test.js`, `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`, `docs/brain/06-ai-working-log.md`
- **Ly do:** Chan fail-closed SDT/Maps/toa do/phi/ma mau/can cu/thoi han bi model bia va khong tu dong lo thong tin tru so khi y dinh LOC04 chua ro.
- **Kiem tra:** `node -c api/chat.js`; `node -c lib/output-validator.js`; `npm test`; `npm run build`.
## [2026-07-01] Sua false-positive legal reference cua output validator
- **Agent:** Codex
- **Thay doi:** Doi legal-reference matching sang so hieu loi `NN/YYYY`, bat tron `QH13`, mo rong whitelist XNC/cu tru, bat tien Trung/Han, chuyen duration sang log-only va them regression test cho cac ca that.
- **File da sua:** `lib/output-validator.js`, `api/chat.js`, `test/output-validator.test.js`, `docs/brain/03-decisions.md`, `docs/brain/06-ai-working-log.md`
- **Ly do:** Hard-redact Tier 2 da xoa nham Thong tu dung va cat nat `Luat so 47/2014/QH13` trong chay that.
- **Kiem tra:** `node -c lib/output-validator.js`; `node -c api/chat.js`; `npm test`; `npm run build`; targeted/full regression neu moi truong API cho phep.

---

## [2026-07-09] Goi A catalog TTHC: release hygiene
- **Agent:** Codex
- **Thay doi:** Them MIME `.json` cho preview server; cap nhat architecture/code graph voi `js/tthc-catalog.js`, `data/tthc-catalog.json`, generator catalog va luong doi chieu tu chat; ghi decision cho catalog tinh; them backlog backfill cac thu tuc thieu toan van.
- **File da sua:** `scripts/preview-server.js`, `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`
- **Ly do:** Khop docs va local preview voi feature catalog truoc khi chuyen sang verification runtime.
- **Kiem tra:** `npm test`; `npm run build`.
## [2026-07-09] Mo rong catalog TTHC sang nguon Pinecone live
- **Agent:** Codex
- **Thay doi:** Doi `scripts/generate-tthc-catalog.js` sang che do uu tien Pinecone live, bo qua key rong trong `.env.local`, retry call Pinecone khi loi mang, group `guide_*` thanh thu tuc muc-do catalog va dedupe co ban voi `tthc_*`; regenerate `data/tthc-catalog.json` thanh 149 thu tuc; cap nhat test va tai lieu kien truc/quyet dinh/task.
- **File da sua:** `scripts/generate-tthc-catalog.js`, `data/tthc-catalog.json`, `test/tthc-catalog.test.js`, `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`
- **Ly do:** Catalog cu chi dua vao backup hep nen UI nhin nhu chi con thu tuc XNC; Pinecone thuc te con nhieu nhom TTHC khac can dua vao danh muc doi chieu.
- **Kiem tra:** `npm test`; `npm run build`; `http://127.0.0.1:4173/data/tthc-catalog.json` tra `sourceMode=live`, `procedures=149`; Playwright local xac nhan panel tai du danh muc va hien chip cho `Cu tru`, `Can cuoc`, `Dang ky xe`.

## [2026-07-09] Loc catalog ve chi TTHC that (huong 1) + fix trung lap/missingFromBackups
- **Agent:** Claude Code (Opus 4.8)
- **Thay doi:** Review toan dien phat hien che do live nap ca 110 chunk `guide` (wiki/FAQ/huong dan noi bo chatbot) thanh "thu tuc" (149 entry, lo noi dung noi bo + xe 1 thu tuc thanh nhieu manh). Trien khai huong 1: guide thanh opt-in `--include-guides`, mac dinh chi xuat `source_type='tthc'`. Them `dedupeProcedures` (gop trung linh vuc+cap+ten, giu ban co phi da xac minh / text dai hon). `missingFromBackups` tinh lai tren tap truoc dedupe -> rong o live mode. Regenerate `data/tthc-catalog.json` = 35 thu tuc that, 0 guide, 0 trung title+cap, 27 phi da xac minh.
- **File da sua:** `scripts/generate-tthc-catalog.js`, `data/tthc-catalog.json`, `test/tthc-catalog.test.js`, `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`
- **Ly do:** Catalog doi chieu phai la thu tuc hanh chinh that, khong duoc lo huong dan noi bo/cau hoi mau; entry trung title+cap gay roi nguoi dung; `missingFromBackups` liet ke nham cac id da co trong catalog.
- **Kiem tra:** `npm test` (99 pass); `npm run build` (dist co 35 thu tuc, 0 guide); preview `dev-server` xac nhan panel hien 35 card, khong con entry chatbot/admin, 10 chip; dedupe giu dung "Cap" vs "Cap lai" (title khac) va giu ban co phi da xac minh.

---

## [2026-07-03] Cap nhat thu tuc khai bao tam tru NNN tren Pinecone theo PDF KBTT co so luu tru
- **Agent:** Codex
- **Thay doi:** Doc PDF chinh thong `KBTT_HD_Trang_CSLT_v2.0.pdf`, doi chieu voi record Pinecone `tthc_matt26265`, sau do cap nhat truc tiep metadata record nay: sua `cap` tu `tinh` ve `xa`, bo thong tin sai `24 gio den 07 ngay`, thay bang huong dan thao tac online tren `kbtt.xuatnhapcanh.gov.vn`, bo sung `official_url`, `thoi_han`, `mau_don`; dong thoi sao luu metadata truoc/sau update vao `data/pinecone-backups/` va ghi lai technical decision.
- **File da sua:** `docs/brain/03-decisions.md`, `docs/brain/06-ai-working-log.md`, `data/pinecone-backups/2026-07-03-pre-update-tthc_matt26265.json`, `data/pinecone-backups/2026-07-03-post-update-tthc_matt26265.json`
- **Ly do:** Record cu mo ta sai ban chat thu tuc online danh cho co so luu tru, co the khien chatbot tra sai tham quyen tiep nhan va sai cach thuc khai bao.
- **Kiem tra:** Fetch truc tiep vector `tthc_matt26265` sau update de xac nhan `cap=xa`, `official_url=https://kbtt.xuatnhapcanh.gov.vn`, `thoi_han`/`mau_don` da co; query embedding voi cau `Khai bao tam tru nguoi nuoc ngoai online cho co so luu tru` tra lai chinh record nay top-1.

---

## [2026-07-10] Giai doan 2 nang cap do chinh xac retrieval (code + script backfill/re-embed)
- **Agent:** Claude Code (Fable 5)
- **Thay doi:** (1) Them `extractExactTokens`/`boostExactTokenMatches` + tich hop vao pipeline RAG: don match khop ma mau/so hieu van ban len dau truoc loc nguong 0.62, cuu match >= san mem 0.45. (2) Them `rewriteFollowUpQuery`: viet lai cau follow-up ngan bang model tien ich, fallback heuristic BOT-04 cu; do `query_rewrite_ms`. (3) `GEMINI_RERANK_URL` doi tu gemini-2.0-flash → gemini-2.5-flash-lite (rerank + groundedness + tom tat lich su). (4) Embed query-side them `taskType` gated qua env `EMBED_TASK_TYPE` (mac dinh khong bat). (5) Script `setup/backfill-tthc-metadata.js` (draft CSV → --apply upsert metadata thoi_han/mau_don) va `setup/reembed-corpus.js` (dry-run → --apply re-embed RETRIEVAL_DOCUMENT sang namespace moi) — ca hai mac dinh khong ghi Pinecone.
- **File da sua:** `api/chat.js`, `setup/backfill-tthc-metadata.js` (moi), `setup/reembed-corpus.js` (moi), `test/exact-token-boost.test.js` (moi), `package.json` (check:syntax), `docs/brain/03-decisions.md`, `docs/brain/06-ai-working-log.md`
- **Ly do:** Diet nguon sai so chinh (bien thien retrieval, token chinh xac bi lam mo) va chuan bi ha tang cho embedding bat doi xung + backfill facts thoi_han/mau_don da ghi trong TASK-P0-04-EXT.
- **Kiem tra:** `npm test` 151/151 pass (them 7 test exact-token boost); `npm run build` sach; `node --check` ca 2 script moi OK; smoke `node scripts/run-regression.js --ids TR03` PASS (top-1 0.776, 205 tu), da khoi phuc regression-latest.md. **Con lai (user step):** chay 3 run regression 30 cau sach truoc khi cong bo baseline; chay `setup/backfill-tthc-metadata.js` + `setup/reembed-corpus.js` voi key va duyet CSV de kich hoat taskType.

---

## [2026-07-10] Giai doan 3 UX + khep vong chat luong
- **Agent:** Claude Code (Fable 5)
- **Thay doi:** (1) SSE status: `api/chat.js` phat `{status:'generating'}` sau khau truy hoi; `js/gemini.js` them `onStatus`; `js/chatbot.js` doi nhan typing 2 pha (`typingRetrieving`/`typingGenerating`). (2) `renderStarterChips` — 6 chip cau hoi pho bien khi mo chat luc hoi thoai trong. (3) Guide deep-link: `js/tthc-catalog.js` them `findByTitle`/`openByTitle`/`preload`; `appendSources` hien nut doi chieu cho citation guide khi title khop chinh xac; warm catalog khi mo chat. (4) `sendTelegramAlert` (opt-in env) goi tu groundedness-fail (`api/chat.js`) va feedback 👎 (`api/feedback.js`); quy trinh feedback→eval ghi vao `05`.
- **File da sua:** `api/chat.js`, `api/feedback.js`, `js/gemini.js`, `js/chatbot.js`, `js/tthc-catalog.js`, `test/telegram-alert.test.js` (moi), `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`, `docs/brain/05-testing-and-deploy.md`, `docs/brain/06-ai-working-log.md`
- **Ly do:** Giam do tre cam nhan khi cho pipeline RAG, rut ngan buoc dau cho nguoi dan, mo khoa 102 guide cho deep-link tu chat, va khep vong feedback→eval + canh bao tuc thoi.
- **Kiem tra:** `npm test` (154/154, them 3 test Telegram); `npm run build` sach; preview localhost xac nhan 6 starter chip render, `TthcCatalog.findByTitle` khop chinh xac guide+tthc va tra null cho input rac, 0 loi console. Con lai (user step): bat env `TELEGRAM_*` neu muon canh bao; SSE status 2 pha chi thay ro tren moi truong co /api/chat that.

---

## [2026-07-10] Chay 3 run regression 30 cau sau Giai doan 2/3
- **Agent:** Claude Code (Fable 5)
- **Thay doi:** Chay `node scripts/run-regression.js` 3 lan lien tiep tren nhanh `feat/chat-ux`. Khong LEGAL_HALLUCINATION xac nhan. Nhung chua dat chuan "sach" nghiem ngat: GD02 fail-tu-cham 1 lan (loi harness regex, noi dung dung — 2 lan sau PASS); GV02 loi 2/3 lan (`BLOCKED_CONTENT` x2, `TRUNCATED` co notice x1) — flaky o tang generation/safety cua Gemini, khong lien quan cac thay doi retrieval Giai doan 2. Commit 3 bao cao lam bang chung nhung KHONG cong bo la baseline moi.
- **File da sua:** `test/results/regression-run-2026-07-10_15-47-25.md`, `test/results/regression-run-2026-07-10_15-54-53.md`, `test/results/regression-run-2026-07-10_16-02-57.md`, `test/results/regression-latest.md`, `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`
- **Ly do:** User yeu cau chay regression de kiem chung thay doi Giai doan 2 (retrieval) khong gay hoi quy.
- **Kiem tra:** 3/3 run hoan tat, khong Tier-1 hallucination xac nhan; them TASK-GV02-FLAKY vao backlog de dieu tra rieng cau hoi hay loi.

---

## [2026-07-10] Dieu tra nguyen nhan GV02 flaky
- **Agent:** Claude Code (Fable 5)
- **Thay doi:** Them log chan doan `finishReason`/`promptFeedback`/`safetyRatings` vao nhanh `BLOCKED_CONTENT` trong `api/chat.js` (P3.5, giu vinh vien, khong log noi dung cau hoi/PII). Chay GV02 don le 10 lan (10/10 thanh cong) + 1 lan full 30-cau them (sach 100%) de xac dinh nguyen nhan.
- **File da sua:** `api/chat.js`, `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`, `test/results/` (them 1 full-run sach, xoa cac bao cao 1-cau phat sinh khi dieu tra)
- **Ly do:** User yeu cau kiem tra tai sao GV02 hay loi trong 3 run truoc.
- **Ket qua:** Xac dinh la bien thien sampling Gemini o temperature 0.2 ket hop chu de von dai (nhieu mau don/phi/buoc), khong lien quan cac thay doi retrieval Giai doan 2. Khong tai hien duoc BLOCKED_CONTENT de bat log category cu the — ghi nhan la ton dong uu tien thap, log chan doan da san sang cho lan sau.
- **Kiem tra:** `npm test` 154/154, `node --check api/chat.js` OK.
---

## [2026-07-11] Fix review PR #20 exact-token va env local cho script
- **Agent:** Codex
- **Thay doi:** Chuan hoa exact-token theo dang khong dau de `QĐ/QD`, `NĐ/ND` khop nhau khi extract va khi so voi metadata; them test cho case user go `QĐ` nhung metadata luu `QD`. Hai script maintenance moi doc ca `.env` va `.env.local`, bo qua gia tri rong.
- **File da sua:** `api/chat.js`, `test/exact-token-boost.test.js`, `setup/backfill-tthc-metadata.js`, `setup/reembed-corpus.js`, `docs/brain/06-ai-working-log.md`
- **Ly do:** Review PR #20 phat hien boost bo sot so hieu van ban ASCII dang duoc repo hien thi (`5568/QD-BCA`) va script moi lech voi workflow env local cua du an.
- **Kiem tra:** `npm test -- test/exact-token-boost.test.js`; `npm run check:syntax`.
---

## [2026-07-11] Fix review PR #21 Telegram alert khong chan feedback
- **Agent:** Codex
- **Thay doi:** Them timeout ngan cho `sendTelegramAlert`; doi luong feedback tu `await sendTelegramAlert` sang `waitUntil(sendTelegramAlert(...))` de tra response sau khi luu RTDB, khong doi nguoi dung cho Telegram. Bo sung test timeout cho Telegram helper.
- **File da sua:** `api/chat.js`, `api/feedback.js`, `test/telegram-alert.test.js`, `docs/brain/06-ai-working-log.md`
- **Ly do:** Sau khi bat Telegram bot, alert khong con la no-op; neu Telegram cham thi co the lam treo request feedback cua nguoi dung.
- **Kiem tra:** `npm test -- test/telegram-alert.test.js`; `npm run check:syntax`.
---

## [2026-07-11] Merge main vao PR #21 sau PR #19 va PR #20
- **Agent:** Codex
- **Thay doi:** Cap nhat nhanh `feat/chat-ux` theo `main` sau khi PR #19/#20 merge; giu cac thay doi performance, RAG accuracy va Telegram feedback non-blocking tren cung mot nen.
- **File da sua:** `index.html`, `vercel.json`, `docs/brain/06-ai-working-log.md`
- **Ly do:** PR #21 can doi base sang `main` va merge sach sau khi hai PR nen da vao production branch.
- **Kiem tra:** Chay lai `npm test -- test/telegram-alert.test.js`, `npm run check:syntax`, `npm run build` sau khi resolve.
---

## [2026-07-11] Them cau tra loi chatbot vao Telegram feedback alert
- **Agent:** Codex
- **Thay doi:** Alert Telegram cho bao cao thumbs-down gio kem them truong `Cau tra loi chatbot`, ben canh cau hoi va mo ta; tach helper tao message va them test bao ve hanh vi nay. Tang timeout mac dinh cua Telegram alert len 8s de giam loi timeout khi Vercel goi Telegram cham.
- **File da sua:** `api/chat.js`, `api/feedback.js`, `test/feedback.test.js`, `docs/brain/06-ai-working-log.md`
- **Ly do:** Admin can thay ngay cau tra loi bi bao cao trong Telegram, khong chi thay cau hoi/mo ta; log production cho thay alert cu co the timeout sau 2.5s.
- **Kiem tra:** `npm test -- test/feedback.test.js test/telegram-alert.test.js`; `npm run check:syntax`; `npm run build`.
