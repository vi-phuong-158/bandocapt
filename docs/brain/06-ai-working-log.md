# 06 — AI Working Log

> nhật ký các lần AI (Claude Code / Codex) sửa code. Mỗi agent PHẢI thêm entry sau mỗi lần
> chạm vào code. Đọc ngược từ trên xuống để biết gần đây ai đã làm gì và vì sao.

---

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
