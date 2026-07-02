# 03 — Technical Decisions

> Ghi lại quyết định kỹ thuật quan trọng để agent sau không "phát minh lại" hoặc đảo ngược
> mà không biết lý do. Mỗi entry: quyết định gì, vì sao, đánh đổi gì.

---

## [2026-07-02] Answer-first + ngân sách độ dài + lưới chống ngắt giữa câu

- **Quyết định:** (1) `SYSTEM_PROMPT_BASE` chuyển sang answer-first: câu đầu tiên phải là đáp án trực tiếp; tách 2 chế độ trả lời — câu hỏi HẸP (1 chi tiết, mục tiêu < 120 từ, không dump hồ sơ/trình tự) và câu hỏi TRỌN THỦ TỤC (cấu trúc A, mục tiêu < 250 từ); cấm chào hỏi/xã giao, tối đa 1 câu hỏi follow-up, không lặp thông tin 2 chỗ, mỗi điểm tiếp dân 1 dòng. Chỉ sửa phần mục tiêu/cấu trúc/văn phong — khối "DỮ LIỆU & CHỐNG BỊA" giữ nguyên 100%. (2) Khi chạm trần token (Gemini `MAX_TOKENS` hoặc DeepSeek `length`): `trimToSentenceBoundary()` trong `lib/output-validator.js` cắt lùi về ranh giới câu hoàn chỉnh và nối câu chốt theo ngôn ngữ (`getTruncationNotice`), chạy TRƯỚC `validateAnswer` — người dân không bao giờ thấy văn bản đứt giữa câu. Giữ `maxOutputTokens: 3072`. (3) `scripts/run-regression.js` đo số từ mỗi câu, gắn soft-fail `VERBOSITY` (câu hẹp > 250 từ, câu đầy đủ > 400 từ) và `TRUNCATED`, thêm bảng tổng hợp đầu báo cáo.
- **Lý do:** Đo trên `regression-latest.md` (2026-07-02): trung bình 306 từ/câu, median 334, 6/30 câu > 500 từ (~8-10 màn hình cuộn mobile); câu hỏi có/không như HS02 bị trả 507 từ. Nguyên nhân gốc là prompt cũ ép "sau MỖI câu trả lời phải đủ giấy tờ + nơi nộp" và áp cấu trúc A cho mọi câu. Câu dài cũng là nguyên nhân chạm `MAX_TOKENS` gây đứt giữa câu (VP01/EV01). User yêu cầu rõ: không được để AI ngắt giữa câu.
- **Đánh đổi:** Sửa prompt bắt buộc chạy lại 3 lần regression 30 câu sạch (0 Tier-1, 0 LEGAL_HALLUCINATION, 0 TRUNCATED) trước khi coi là baseline mới — chưa chạy được trong môi trường thiếu API key, phải chạy ở môi trường có key. Rủi ro rút gọn làm mất câu tự khai "chưa có dữ liệu xác minh" được giám sát bằng chính 3 lần chạy đó; lớp bảo vệ chính (output-validator code-level) không phụ thuộc prompt nên không bị ảnh hưởng. VERBOSITY là soft-fail (cảnh báo trong báo cáo), không chặn cứng.
- **Người quyết định:** user / Claude Code

---

## [2026-07-01] Output validator fail-closed tren ban tra loi cuoi

- **Quyet dinh:** Giu streaming thô de bao toan UX, nhung truoc event `done` phai chay `lib/output-validator.js` va redact tai cho SDT, link Maps, toa do, muc phi, ma mau, so hieu van ban va thoi han khong ton tai trong `verified_locations`, tai lieu RAG hoac danh sach hang so prompt da duyet.
- **Ly do:** Prompt khong chan duoc hoan toan hallucination; regression TR02 va EV07 van lo SDT, ma mau va so lieu khong co nguon.
- **Danh doi:** Text thô co the thoang hien trong luc stream, sau do client render lai ban canonical da lam sach. Regex fail-closed can duoc duy tri bang unit test de tranh false-positive.
- **Nguoi quyet dinh:** user / Codex

---

## [2026-07-01] So khop can cu theo so hieu loi, duration log-only

- **Quyet dinh:** Legal reference duoc doi chieu bang so hieu loi `NN/YYYY` thay vi ca chuoi de khong nhay cam voi chu `so`; regex bat tron hau to co chu so nhu `QH13`. Duration tam thoi chi ghi violation, khong redact.
- **Ly do:** Regression that cho thay cac can cu dung bi xoa khi corpus va answer khac dinh dang, dong thoi `QH13` bi cat con `13`. Duration co rui ro false-positive cao khi dinh dang so khac nhau.
- **Danh doi:** Whitelist van can duoc duy tri khi khung phap ly thay doi; duration chua duoc hard-block cho toi khi co matcher tot hon.
- **Nguoi quyet dinh:** user / Codex

---

## [2026-07-02] Tieu chi "dat chuan dua vao thuc te" cho chatbot RAG

- **Quyet dinh:** Chatbot chi duoc coi la san sang production khi dat ca 4 dieu kien: (1) 3 lan chay lien tiep bo regression 30 cau khong co loi Tier-1 (SDT/dia chi/Maps bia) va khong co LEGAL_HALLUCINATION; (2) telemetry co canh bao khi ty le `output_validator_violation` vuot nguong; (3) disclaimer AI hien thi cho nguoi dung (da co); (4) quy trinh cap nhat van ban phap luat moi vao Pinecone co nguoi duyet (tuong tu pipeline staging da co cho tru so).
- **Ly do:** Bao cao review 2026-07-02 xac nhan baseline 27/30 (1 hallucination that EV07, 1 soft-fail TR02) chua du de nhan danh co quan Cong an tra loi tu dong; can tieu chi do luong ro rang thay vi danh gia cam tinh.
- **Danh doi:** Se ton them thoi gian/API quota de chay regression nhieu lan truoc moi lan coi la "baseline moi"; doi lai giam manh rui ro dua thong tin sai ra cong khai.
- **Nguoi quyet dinh:** user / Claude Code (Sonnet 5)

---

## [2026-07-02] P0: Bo fallback duoi nguong, redact duration, allowedConstants chi con hang so loi, structured facts tu metadata

- **Quyet dinh:**
  1. **Bo fallback lay top-3 khi khong co match vuot nguong 0.62** (`api/chat.js`, RAG-03 block) — truoc day khi khong co match nao du diem, code van lay 3 match yeu nhat lam `matchedDocs`, tao nguyen lieu cho model "lap cho trong". Gio khi duoi nguong, `matchedDocs` de rong, di vao nhanh "khong tim thay tai lieu phu hop" da co san trong prompt.
  2. **DURATION_PATTERN chuyen tu `log_only` sang `redact`** (`lib/output-validator.js`) — dung chung co che `redact()` nhu MONEY/FORM, doi chieu voi `legalCorpus` + `allowedConstants`.
  3. **`allowedConstants` trong validator chi con hang so phap ly loi bat bien** (`'12 gio', '24 gio', 'Dieu 33'`) — cac so hieu van ban cu the (47/2014, 51/2019...) bi xoa khoi hardcode vi da nam trong `legalCorpus` (matchedDocs) khi tai lieu tuong ung thuc su duoc Pinecone tra ve; neu van ban khong duoc truy xuat ma model van neu so hieu thi DUNG y do la phai bi redact (fail-closed), tranh no bao tri khi them van ban moi ma quen sua code.
  4. **Structured facts tu metadata Pinecone** — them `buildVerifiedFactsLine()` doc field `le_phi`/`phi` (va `thoi_han`/`mau_don` khi co du lieu trong tuong lai) tu metadata, bom thanh dong `[FACTS DA XAC MINH]` ngay duoi tung tai lieu trong `matchedDocs`. System prompt duoc them 1 dong chi dao uu tien dong FACTS thay vi tu dien giai tu van ban thuong.
- **Ly do:** Diet goc 3 nguon hallucination chinh ma bao cao review chi ra: tai lieu yeu duoc dua vao prompt, duration khong duoc chan (chi log), whitelist so hieu van ban la nguon that su xa roi Pinecone that.
- **Phat hien khi khao sat du lieu (quan trong cho TASK-P0-04-EXT):** Kiem tra truc tiep `data/pinecone-backups/2026-07-01-*.json` cho thay metadata Pinecone GOC (38 record) KHONG co field `thoi_han` hay `mau_don` nao ca — chi co `le_phi`/`phi` duoc chuan hoa cho 34/38 record trong dot va phi ngay 2026-07-01. Code `buildVerifiedFactsLine` da viet san de doc ca 3 field nhung 2 field con lai se khong bao gio kich hoat cho toi khi du lieu Pinecone duoc backfill (xem TASK-P0-04-EXT trong `04-current-tasks.md`).
- **Danh doi:** Cau tra loi co the tro nen "it thong tin hon" o mot so cau ma truoc day dua vao tai lieu yeu de tra loi (dung y do thiet ke, khong phai loi); can chay lai regression de do tac dong thuc te.
- **Nguoi quyet dinh:** user / Claude Code (Sonnet 5)

---

## [2026-07-02] P0.5: Baseline production da dat, 3 lo hong validator vs them vao qua thuc nghiem

- **Quyet dinh:** Baseline chinh thuc la 3 file `regression-run-2026-07-02_06-13-26.md`, `_06-24-57.md`, `_06-39-56.md` — ca 3 chay lien tiep khong loi Tier-1, khong LEGAL_HALLUCINATION xac nhan. Dieu kien "dat chuan production" (entry truoc) coi la DA DAT cho vong P0.
- **3 lo hong vaidator vs them trong qua trinh chay (khong phat hien duoc qua doc code tinh, chi lo ra khi chay that nhieu lan):**
  1. `MEASUREMENT_PATTERN` moi — bat thong so vat ly (cm/mm/px/MB/KB/GB, ca don vi chu Han 厘米/毫米/公分) — vd EV07 bia "4×6cm/JPEG/≤2MB" khong pattern nao cu phu toi.
  2. Sua bien `(?<!\w)`/`(?!\w)` trong MONEY_PATTERN chi ap dung rieng cho token `đ` bare (khong doi bien chung — da thu doi bien chung `\w` -> `\p{L}\p{N}` mot lan va lam mu hoan toan phat hien tien te tieng Trung do so dinh lien chu Han khong dau cach; revert va chi sua hep pham vi token `đ`).
  3. `allowedConstants` trong `api/chat.js` them ban dich EN/ZH/KO cua dung 2 hang so "12 gio"/"24 gio" (`12 hours/24 hours/12小时/24小时/12시간/24시간`) — hoi quy do P0.2 (duration tu log-only sang redact that) lam hong cau tra loi da ngon ngu: dich "12 gio" sang "12 hours" khong con khop legalCorpus tieng Viet nen bi xoa oan.
  4. `MONEY_RANGE_PATTERN` moi — cum "X den Y dong" chi co don vi o cuoi, MONEY_PATTERN don le chi bao ve duoc so Y.
- **Phat hien quan trong (khong phai quyet dinh, nhung anh huong cach doc ket qua sau nay):** Da query truc tiep Pinecone de xac minh — cac con so "nghi van hallucination" trong EV07/GV06/HS02/TT01/VP01 (25/50 USD e-visa, 145/155/165 USD the tam tru, 10 USD/lan gia han, 4x6cm/JPEG/≤2MB, 3 ngay lam viec) **DEU la du lieu that trong Pinecone** (record `tthc_5568-tw-06/07/08` etc.), khong phai model bia. Sai lech giua cac lan chay la do retrieval tra ve chunk khac nhau (bien thien tu nhien cua embedding search), khong phai loi validator hay loi model — validator dang hoat dong dung thiet ke (redact khi khong co chunk lien quan, giu khi co).
- **Danh doi:** Sua o pham vi hep (chi token `đ`, chi 2 hang so thoi han) de tranh pha vo cac phat hien dung khac (tieng Trung, cac gia tri khac). Con lai 2 gap da biet nhung chap nhan duoc: duration tieng Trung dung luong tu "个" (vd "3个工作日") khong khop pattern; duration dung "ngay" tran (khong phai "ngay lam viec") khong duoc phu de tranh false-positive qua rong.
- **Nguoi quyet dinh:** user / Claude Code (Sonnet 5)

---

## [2026-07-01] Tach intent `tam_tru` thanh 2 nhanh retrieval

- **Quyet dinh:** Tach bucket intent runtime thanh `tam_tru_khai_bao` (NA17, Cong an cap xa, co so luu tru) va `tam_tru_the` (NA6/NA7/NA8, Cong an cap tinh, giay phep lao dong). Luc query van map ve metadata Pinecone hien co (`tam_tru`, `cu_tru`), sau do post-filter theo `title`/`text` de loai chunk khac nhanh.
- **Ly do:** Pinecone hien dang dung chung nhan `tam_tru` cho ca khai bao tam tru va the tam tru. Vi vay cau hoi khai bao tam tru co the keo nham chunk `Cap the tam tru ... Phí/lệ phí: Không phí`, dan den bot tra `No fee` sai ngu canh.
- **Danh doi:** Tang them mot lop heuristics trong runtime va bo test unit canh goc retrieval. Khong giai quyet triệt để neu KB metadata sau nay tiep tuc gom nhieu thu tuc khac nhau vao cung mot nhan, nhung du de chan hoi quy TR09/TT01 trong hien trang.
- **Nguoi quyet dinh:** user / Codex

---

## [2026-06-29] Đưa giới hạn Rate Limit vào biến môi trường

- **Quyết định:** Chuyển các giới hạn `monthlyLimit` và `dailyIpLimit` từ hardcode sang cấu hình thông qua biến môi trường `CHAT_MONTHLY_LIMIT` và `CHAT_DAILY_IP_LIMIT` (mặc định tương ứng 10.000 và 50).
- **Lý do:** Đáp ứng tính linh hoạt trong quá trình demo và vận hành thực tế, tránh sửa code mỗi lần muốn đổi giới hạn quota.
- **Đánh đổi:** Cần cấu hình thêm 2 biến môi trường trên Vercel.
- **Người quyết định:** user / Antigravity

## [2026-06-29] Alias dia danh cho Published_Locations, nhung chi tra don vi hien hanh

- **Quyet dinh:** Bo sung cot tuy chon `search_aliases` cho `Location_Staging` va `Published_Locations` de luu dia danh cu/viet tat phan cach bang `|`. Runtime chatbot chi hien thi `name` la ten don vi Cong an hien hanh, con alias chi dung de match.
- **Ly do:** Sau thay doi dia gioi hanh chinh 2025, nguoi dan co the nhap dia danh cu nhu `Bach Hac`, `Tien Cat`, `Tho Son`, `Song Lo` hoac cau dau ngan chi la `Thanh Mieu`. Can map ve don vi hien hanh mot cach xac dinh ma khong de model suy dien tu tai lieu cu.
- **Danh doi:** Pipeline Google Sheets va Apps Script phai mang theo them mot truong schema; matcher phai exact-normalized theo ranh gioi tu, khong fuzzy, va khi alias trung nhieu don vi thi chatbot bat buoc hoi lai thay vi tu chon.
- **Nguoi quyet dinh:** user / Codex

---

## [2026-06-28] Chatbot lay tru so chi tu Published_Locations

- **Quyet dinh:** Runtime chatbot van dung Pinecone cho thu tuc/phap luat, nhung ten don vi, dia chi, so dien thoai, toa do va Google Maps chi duoc lay tu Google Sheet `Published_Locations` qua helper `lib/published-locations.js`. Vector Pinecone `tru_so` duoc giu lai de rollback nhung khong dua vao prompt/citation.
- **Ly do:** Pinecone rerank co the day chunk `tru_so` ra khoi top ket qua khi cau hoi ghep thu tuc + noi nop, dan den luc dau chatbot bao "chua co du lieu" nhung hoi lai thi tim thay. `Published_Locations` la nguon duoc duyet va co cau truc on dinh hon cho dia chi tru so.
- **Danh doi:** Backend phai them cache Google Sheets 60 giay va stale fallback 5 phut, them logic match exact-normalized khong fuzzy, va xu ly rieng ban ghi mau thuan thay vi de model tu suy dien.
- **Nguoi quyet dinh:** user / Codex

---

## [2025] Static site — không dùng framework frontend

- **Quyết định:** Frontend là HTML + TailwindCSS + Vanilla JS thuần, không React/Vue/Svelte.
- **Lý do:** Deploy nhanh trên Vercel (không cần build step), bundle size nhỏ, không dependency JS
  framework, dễ debug. Dự án chủ yếu là bản đồ + chatbot — không cần reactivity phức tạp.
- **Đánh đổi:** Không có component reuse tốt; state management thủ công.
- **Người quyết định:** user

---

## [2025] TailwindCSS pre-built — không build trên Vercel

- **Quyết định:** `output.css` được build local và commit vào repo. Vercel build command là `echo`.
- **Lý do:** Đơn giản hóa CI, tránh lỗi build trên Vercel. Dự án tĩnh không cần build pipeline.
- **Đánh đổi:** Phải nhớ rebuild `output.css` local (`npm run dev`) mỗi khi thêm Tailwind class mới
  và commit cả `output.css`.
- **Người quyết định:** user

---

## [2026-06-27] System Prompt hardcode trong code, BỎ Vercel Edge Config

- **Quyết định:** System prompt chatbot là hằng số `SYSTEM_PROMPT_BASE` trong `api/chat.js`
  (nguồn duy nhất). `getSystemPrompt()` trả thẳng hằng số này, KHÔNG đọc Edge Config nữa.
- **Lý do:** bandocapt và `mohinh-andn` dùng chung Edge Config store → cùng đọc key `SYSTEM_PROMPT`
  sẽ đè prompt của nhau. Hai dự án cần prompt khác nhau. Hardcode loại bỏ rủi ro đụng độ và làm
  prompt minh bạch trong source.
- **Đánh đổi:** Đổi system prompt phải sửa code + redeploy (không còn cập nhật nóng qua dashboard).
  Chấp nhận được vì prompt ít đổi và tính đúng đắn quan trọng hơn tốc độ cập nhật.
- **Hệ quả:** Gỡ `require('@vercel/edge-config')` trong `api/chat.js`; biến env `EDGE_CONFIG`,
  `EDGE_CONFIG_ID` trở thành không dùng (vô hại nếu vẫn còn trên Vercel).
- **Thay thế quyết định cũ** "[2025] System Prompt lưu trên Vercel Edge Config".
- **Người quyết định:** user

---

## [2025] RAG với Pinecone + Gemini Embedding

- **Quyết định:** Dùng Pinecone làm vector DB, Gemini Embedding 001 để tạo vector, re-rank bằng
  Gemini 2.0 Flash trước khi trả kết quả cho LLM.
- **Lý do:** Gemini Embedding 001 hỗ trợ đa ngôn ngữ tốt (vi/en/zh/ko) — không cần dịch query.
  Pinecone có managed hosting, SDK Node.js ổn định.
- **Đánh đổi:** Chi phí Pinecone + Gemini API; latency tăng do pipeline embed → query → rerank.
- **Người quyết định:** user

---

## [2025] Rate limiting bằng Firebase (không Redis)

- **Quyết định:** Dùng Firebase Realtime DB để đếm lượt dùng (tháng: 3500, ngày/IP: 20). Dùng
  ETag + Optimistic Locking để tránh race condition.
- **Lý do:** Firebase có free tier, không cần setup Redis riêng. Vercel KV tốn phí hơn.
- **Đánh đổi:** Firebase Realtime DB có latency cao hơn Redis; cần retry/rollback nhiều hơn để giữ
  quota đúng dưới tải đồng thời. Harness local 50 concurrent request đã khóa hành vi không vượt quota,
  nhưng độ ổn định vẫn phụ thuộc semantics ETag của RTDB.
- **Người quyết định:** user

---

## [2025] Bảo mật nhiều lớp (CORS + HMAC + Turnstile + Injection Detection)

- **Quyết định:** Kết hợp 4 lớp bảo vệ: CORS whitelist, HMAC request signing, Cloudflare Turnstile
  CAPTCHA, và prompt injection pattern matching.
- **Lý do:** Chatbot dùng API tốn phí (Gemini/Pinecone) — phải chống bot và abuse. Mỗi lớp bắt
  một loại tấn công khác nhau.
- **Đánh đổi:** Code phức tạp hơn; developer cần biết tất cả lớp bảo vệ khi debug.
- **Người quyết định:** user

---

## [2025] Google Sheets làm nguồn dữ liệu trụ sở (với fallback tĩnh)

- **Quyết định:** Dữ liệu trụ sở Công an được lưu trên Google Sheets, lấy qua `api/google-sheet.js`
  proxy. `data.js` là fallback tĩnh khi Sheets lỗi.
- **Lý do:** Cho phép cán bộ cập nhật dữ liệu không cần deploy code. Sheet ID được ẩn qua proxy.
- **Đánh đổi:** Phụ thuộc vào Google Sheets availability; data.js phải được cập nhật thủ công khi
  có thay đổi lớn.
- **Người quyết định:** user

---

## [2025] DeepSeek là LLM dự phòng (override Gemini)

- **Quyết định:** Nếu `DEEPSEEK_API_KEY` tồn tại trong env, toàn bộ chat dùng DeepSeek thay Gemini.
- **Lý do:** Dự phòng khi Gemini rate limit hoặc giá tăng.
- **Đánh đổi:** Phải convert payload từ Gemini format sang OpenAI format; cần test riêng với DeepSeek.
- **Người quyết định:** user

---

## [2025] Xóa no-referrer meta tag để fix OpenStreetMap 403

- **Quyết định:** Bỏ `<meta name="referrer" content="no-referrer">` khỏi index.html.
- **Lý do:** OpenStreetMap tile server từ chối request không có Referer header (trả 403).
- **Đánh đổi:** Trình duyệt sẽ gửi Referer khi tải tile — chấp nhận được vì đây là URL public.
- **Người quyết định:** user (commit 91718ec)

---

## [2026-06-27] Runtime chỉ đọc Published_Locations và loại tọa độ không hợp lệ

- **Quyết định:** API Google Sheet chỉ allowlist `Published_Locations`; frontend normalize dữ liệu qua
  `js/location-data.js` và không tạo marker nếu tọa độ sai hoặc ngoài vùng phục vụ.
- **Lý do:** Ngăn submission thô hoặc tọa độ rác xuất hiện như một trụ sở hợp lệ trên bản đồ công khai.
- **Đánh đổi:** Pipeline quản trị phải duy trì sheet đã phê duyệt và xử lý báo cáo bản ghi bị loại.
- **Người quyết định:** user / Claude Code

---

## [2026-06-27] Pipeline dữ liệu bản đồ qua allowlist → staging → published

- **Quyết định:** Dữ liệu Google Form không đi thẳng ra public; Apps Script quản trị ghi vào
  `Location_Staging`, chỉ admin mới approve/reject/revoke để cập nhật `Published_Locations`, và mọi
  hành động append vào `Approval_Audit_Log`.
- **Lý do:** Chặn bản ghi giả hoặc sai đơn vị trước khi xuất hiện trên bản đồ công khai, đồng thời giữ
  truy vết submitter + reviewer cho từng marker.
- **Đánh đổi:** Cần triển khai trigger/menu trong Google Workspace thật và vận hành allowlist/audit.
- **Người quyết định:** user / Codex

---

## [2026-06-27] Telemetry tối thiểu, diagnostic content là opt-in

- **Quyết định:** Log mặc định chỉ chứa metric tổng hợp và HMAC bucket của IP; question/answer chỉ
  được ghi khi `CHAT_DIAGNOSTIC_LOG=on|true`, còn nằm trong cửa sổ `CHAT_DIAGNOSTIC_LOG_UNTIL`, qua
  sample rate cấu hình và có `CHAT_DIAGNOSTIC_LOG_APPROVED` nếu chạy ở production. RTDB fallback bắt buộc
  dùng `FIREBASE_DB_URL` từ env.
- **Lý do:** Giảm thu thập dữ liệu cá nhân trong hội thoại pháp luật và loại fallback cross-project.
- **Đánh đổi:** Điều tra lỗi nội dung cần phê duyệt privacy và bật cờ vận hành có kiểm soát.
- **Người quyết định:** user / Claude Code

---

## [2026-06-27] Tách metric và diagnostic telemetry, TTL theo `expires_at`

- **Quyết định:** Metric log và diagnostic log được ghi vào collection/path riêng; cả hai đều có
  `retention_days` và `expires_at`. Diagnostic content bị sanitize email/token/số hộ chiếu trước khi lưu.
- **Lý do:** Giảm blast radius của dữ liệu nhạy cảm, cho phép TTL policy riêng cho metric và diagnostic,
  và giữ RTDB fallback có thể prune tự động bằng script.
- **Đánh đổi:** Cần thêm cấu hình vận hành cho TTL Firestore và chạy prune job cho RTDB fallback khi dùng.
- **Người quyết định:** user / Codex

---

## [2026-06-27] Build và CI kiểm tra artifact thật

- **Quyết định:** `npm run build` compile Tailwind, kiểm tra syntax và tạo `dist/`; CI chạy
  `npm test`, build và production dependency audit bằng Node.js 20.
- **Lý do:** Ngăn deploy code sai syntax, CSS/artifact thiếu hoặc regression ở các boundary P0.
- **Đánh đổi:** Build mất thêm thời gian và vẫn cần kiểm tra trình duyệt cho hành vi UI thực tế.
- **Người quyết định:** user / Claude Code

---

## [2026-06-28] Loại bỏ MarkerCluster khỏi bản đồ

- **Quyết định:** Gỡ bỏ thư viện `Leaflet.markercluster`, hiển thị tất cả các marker trực tiếp qua `L.layerGroup()`.
- **Lý do:** Khi zoom khu vực rộng, marker bị gộp lại thành các con số (cluster) khiến người dùng không thể nhìn thấy trực tiếp vị trí các trụ sở. Người dùng muốn xem tất cả vị trí mọi lúc.
- **Đánh đổi:** Nếu số lượng trụ sở tăng lên rất lớn (hàng nghìn), bản đồ có thể bị chậm do phải render quá nhiều DOM node cùng lúc trên Leaflet.
- **Người quyết định:** user / Antigravity

---

## [2026-06-30] Stopword tên tỉnh + giới hạn nhánh trả lời tất định (location matcher)

- **Quyết định:** (1) Tên cấp tỉnh/khu vực trùng `bareName` đơn vị (`phu tho`, `tinh phu tho`, `viet tri`, `vinh phuc`, `hoa binh`) bị cấm match qua bareName/approved trần — chỉ match khi người dùng nói rõ "phường/xã <tên>". (2) Nhánh trả lời tất định (bỏ qua LLM) chỉ áp dụng khi `isVietnamese && !hasProcedureIntent && status ∈ {no_match, unavailable}`; `ambiguous_*` luôn đi qua LLM để trình option/hỏi lại.
- **Lý do:** Người dùng nhắc tên tỉnh như ngữ cảnh vùng, không phải tên đơn vị → match trần gây sai trụ sở diện rộng (KC04/DN01). Câu mơ hồ nhiều đơn vị (ambiguous) cần hỏi lại chứ không phải "không có dữ liệu"; câu khác ngôn ngữ không được nhận boilerplate tiếng Việt.
- **Đánh đổi:** Người dùng muốn tra đúng phường Phú Thọ/Việt Trì phải gõ kèm "phường/xã"; nếu sau này có địa danh hợp lệ trùng stopword phải thêm alias rõ ràng trong sheet.
- **Người quyết định:** user / Claude Code

---

## [2026-06-30] Bơm tĩnh dữ liệu Phòng QLXNC theo intent + retry lỗi mạng

- **Quyết định:** (1) Dữ liệu trụ sở Phòng QLXNC (3 điểm tiếp dân, hiệu lực 13/4/2026) được nhúng **tĩnh trong `api/chat.js`** (`XNC_RECEPTION_VERIFIED_BLOCK`) và bơm vào `<verified_locations>` khi `detectXncAuthorityIntent()` đúng — KHÔNG đi qua sheet `Published_Locations` vì chưa có tọa độ chính thức (sheet bắt buộc tọa độ, thiếu thì bị loại). Chỉ nêu địa chỉ + SĐT, không tạo link Maps tới khi có tọa độ. (2) `fetchWithRetry` retry cả lỗi mạng dạng throw, không chỉ HTTP 429/503.
- **Lý do:** Matcher trụ sở là so khớp từ khóa, không hiểu thẩm quyền → câu visa/XNC không match được đơn vị cấp tỉnh nên model bịa địa chỉ/SĐT (EV04, GV06). Bơm theo intent đảm bảo model luôn có dữ liệu thật, độc lập matcher (kể cả khi matcher khớp nhầm một phường). Retry lỗi mạng để VP01-style ECONNRESET không làm rỗng câu trả lời.
- **Đánh đổi:** Dữ liệu QLXNC nằm trong code thay vì sheet → khi đổi địa chỉ phải sửa code + deploy (chấp nhận vì đơn vị cấp tỉnh ít, tĩnh). Khi có tọa độ chính thức nên cân nhắc chuyển sang `Published_Locations` để hiển thị trên bản đồ + tạo link Maps. Retry lỗi mạng có thể tăng độ trễ tối đa khi mạng chập chờn (vẫn trong ngân sách <10s/lần fetch).
- **Người quyết định:** user (chọn phương án B, chưa cấp tọa độ) / Claude Code

---

## [2026-07-01] Vá trực tiếp dữ liệu phí/lệ phí trong Pinecone (source_type=tthc) — không phải sửa code

- **Bối cảnh:** Codex phát hiện bug ở tầng ingest (không nằm trong repo này): khi dựng `metadata.text` cho các bản ghi `source_type: "tthc"`, hai trường `Lệ phí` và `Phí` bị gộp thành 1 dòng `Phí/lệ phí: <giá trị>`, khiến giá trị `Phí` (vd phí thẻ tạm trú 145/155/165 USD) bị `Lệ phí` (thường là "Không") nuốt mất. Đây chính là nguyên nhân TT01/GV06 trả lời sai "miễn phí" trong `regression-run-1.md`, KHÔNG phải lỗi model hay lỗi prompt.
- **Quyết định:** Vì không có script ingest nào trong repo để sửa tận gốc, đã **trực tiếp vá metadata trong Pinecone** (namespace `chatbot-tthc-xnc`, 38 record `tthc_*`) qua `ns.update()` (metadata-only, giữ nguyên vector):
  - 4 record đã được user tự sửa trước (`5568-tinh-05`, `5568-tw-10`, `5568-tw-08`, `5568-tinh-04`).
  - 26 record được Claude Code vá với số liệu **đã tra cứu và đối chiếu với Thông tư 28/2026/TT-BTC** (hiệu lực từ 01/4/2026, thay thế Thông tư 25/2021/TT-BTC) qua 4 sub-agent nghiên cứu song song + WebFetch trực tiếp.
  - 8 record KHÔNG có nguồn đủ tin cậy (mâu thuẫn giữa các nguồn, hoặc không tìm thấy số cụ thể) — chủ động ghi `le_phi`/`phi` = **"Chưa xác minh"** kèm ghi chú trong `text`, thay vì để nguyên giá trị bịa cũ hoặc tự đoán số mới. Danh sách: `5568-tinh-11` (giấy phép khu vực cấm), `5568-tw-01`/`5568-tinh-01` (hộ chiếu phổ thông — phí mâu thuẫn giữa các Thông tư theo từng giai đoạn), `5568-tinh-08` (thẻ thường trú cấp mới), `tinh-02`/`xa-02` (giấy thông hành VN-Lào — chưa rõ áp dụng TT nào), `5568-tinh-09` (cấp đổi thẻ thường trú), `5568-tw-09` (xét duyệt nhân sự cấp phép nhập cảnh).
  - Đã sao lưu toàn bộ metadata gốc của 34 record trước khi ghi đè, lưu tại `data/pinecone-backups/` (không track git, xem `.gitignore`/thêm nếu cần):
    - `2026-07-01-pre-update-backup-original-metadata.json` — metadata gốc của 34 record trước khi sửa (dùng để khôi phục nếu cần).
    - `2026-07-01-fee-corrections-map-applied.json` — mapping `le_phi`/`phi` đã áp dụng cho từng `procedure_id` (nhóm `write` vs `uncertain`).
    - `2026-07-01-apply-log.json` — log kết quả ghi từng record (UPDATED / UPDATED_AS_UNCERTAIN).
    - `2026-07-01-audit-after-fix.json` — snapshot toàn bộ 38 record sau khi vá (để so sánh khi audit lại sau này).
- **Lý do:** Không được lặp lại đúng lớp lỗi đang cố diệt (bịa số liệu pháp lý) khi "sửa" dữ liệu — nếu không chắc chắn, phải nói rõ "chưa xác minh" để prompt chống-bịa (đã thêm ở P1) xử lý đúng, thay vì tự tổng hợp số liệu từ suy luận.
- **Đánh đổi:** 8 record vẫn thiếu số liệu phí cụ thể — bot sẽ nói "chưa có thông tin/cần liên hệ trực tiếp" cho các thủ tục đó cho tới khi ai đó xác minh và cập nhật. Toàn bộ 38 record vẫn còn ghi "Căn cứ pháp lý: ... Thông tư số 25/2021/TT-BTC" (đã hết hiệu lực) trong phần cuối `text` — CHƯA cập nhật số hiệu thông tư mới vì phạm vi lần vá này chỉ nhắm vào dòng phí/lệ phí; cần dọn lại citation này ở lượt sau.
- **Việc còn tồn đọng cho agent sau:**
  1. Xác minh 8 record "Chưa xác minh" ở trên (tra Thông tư 28/2026/TT-BTC bản gốc hoặc gọi trực tiếp cơ quan) rồi vá tiếp bằng cùng cơ chế `ns.update()`.
  2. Cập nhật lại phần "Căn cứ pháp lý" trong `text` của toàn bộ 38 record từ "Thông tư 25/2021/TT-BTC" sang "Thông tư 28/2026/TT-BTC" (số tiền không đổi, chỉ đổi số hiệu văn bản).
  3. Ingest pipeline gốc (không có trong repo) vẫn còn bug gộp `Phí`/`Lệ phí` — nếu có đợt ingest mới/khác trong tương lai (thêm thủ tục mới, category khác `source_type`), rất có thể lặp lại đúng lỗi này; nên kiểm tra khi thấy `text` chứa chuỗi `"Phí/lệ phí:"`.
- **Người quyết định:** user (yêu cầu "khắc phục luôn") / Claude Code, dựa trên chẩn đoán gốc của Codex

---

## [2026-07-02] P1: Retrieval, giam sat, bao mat, hieu nang

- **Quyet dinh:**
  1. **Bo vong thu 4 namespace Pinecone** (`api/chat.js`) — pin dung 1 namespace tu `PINECONE_NAMESPACE`, chi giu lai 1 fallback bo metadata filter khi co category ma 0 match (van co san truoc do). Giam worst-case tu 4 query tuan tu xuong 1-2.
  2. **Rerank co dieu kien** — them `shouldSkipRerank(matches)`: bo qua `rerankWithGemini` khi top-1 > 0.75 diem VA cach top-2 >= 0.05 (ket qua da ro rang, khong map mo). Tiet kiem 1 LLM call + 0.5-2s cho da so cau hoi co match manh.
  3. **Query rewriting nhe** — chi ghep tu khoa cau truoc vao query embedding khi cau hien tai < 8 tu (follow-up ngan); cau du dai (>= 8 tu) da tu du nghia, dung doc lap giu embedding sach.
  4. **Groundedness check (canh bao, khong chan)** — them `checkGroundednessAsync()`, dang ky bang Vercel `waitUntil` SAU `res.end()` (khong tang latency nguoi dung thay, van bao dam invocation song toi khi task xong hoặc function timeout). Neu answer chua so lieu co don vi, goi Gemini Flash doi chieu voi legalCorpus, ghi ket qua vao Firebase `groundedness_checks/<date_key>`. Day la lop giam sat THEM, khong thay the `lib/output-validator.js` (van fail-closed nhu cu).
  5. **`scripts/check-violations.js`** — script doc tay/cron sau, tong hop ty le `output_validator_violation` theo ngay tu RTDB fallback `chat_logs_metrics`. Khong dung ha tang alert moi trong phase nay.
  6. **Bao mat:** bo `Access-Control-Allow-Credentials` (app khong dung cookie); `isAllowedOrigin` chi tin fallback `x-forwarded-host` khi `process.env.VERCEL` ton tai; IP rate-limit uu tien `x-vercel-forwarded-for` -> `x-real-ip` -> `x-forwarded-for`; CSP chuyen tu meta tag (`index.html`) sang header that (`vercel.json`, route `/(.*)`), them `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.
  7. **Hieu nang:** `reserveRateLimitQuota` doi tu tuan tu (IP/ngay roi thang) sang **song song** qua `Promise.allSettled` — ke ca khi mot request throw, ket qua ben con lai van duoc thu thap de rollback neu da reserve thanh cong. DeepSeek timeout 50s xac nhan hop le vi `vercel.json` co `maxDuration: 60` (chi them comment).
  8. **Vong doi background task:** Groundedness check sau SSE response phai dang ky bang `@vercel/functions` `waitUntil`; Promise fire-and-forget sau `res.end()` khong duoc Vercel bao dam hoan tat.
- **Phat hien quan trong khi lam P1.4.1 (anh huong toi RATE_LIMIT_MAX_RETRIES):** Chay song song 2 reservation + rollback tao ra toi da ~2N-1 (khong phai N) luot ghi CAS tuan tu can thanh cong tren CUNG 1 counter IP khi nhieu request tu CUNG 1 IP dong thoi bi chan o tang thang (rollback IP cho cac request that bai them 1 vong CAS nua canh tranh voi cac reservation IP con dang retry). Test harness 50-concurrent xac nhan `RATE_LIMIT_MAX_RETRIES=64` khong du trong kich ban nay (14/50 bi `store_error` sai); da nang len **150** va xac minh lai bang script doc lap (xem lich su chay trong phien nay) — khong con `store_error` sai o 50 concurrent.
- **Ly do:** Giam latency retrieval (namespace pin + rerank co dieu kien + query rewriting), them lop giam sat mem cho hallucination con lot qua validator regex-based, giam bang tan cong CORS/rate-limit khong can thiet, va giam round-trip Firebase cho rate limit ma khong pha vo bat bien "khong vuot quota duoi tai dong thoi" da chot tu truoc.
- **Danh doi:** `RATE_LIMIT_MAX_RETRIES=150` co the keo dai worst-case latency mot chut duoi tai cuc doan (hiem, chi khi rat nhieu request tu CUNG 1 IP dong thoi va gan cham quota thang); chap nhan duoc vi RTDB read/write re va bat bien dung quota quan trong hon vai chuc ms. Groundedness check them 1 Gemini Flash call moi khi answer co so lieu (chi phi API va thoi gian invocation qua `waitUntil`, khong chan response nguoi dung).
- **Nguoi quyet dinh:** user / Claude Code (Sonnet 5)

---

## Template cho entry mới

```
## [YYYY-MM-DD] Tiêu đề quyết định

- **Quyết định:** <mô tả>
- **Lý do:** <vì sao chọn hướng này>
- **Đánh đổi:** <cái gì bị đánh đổi>
- **Người quyết định:** <user / Claude / Codex>
```
