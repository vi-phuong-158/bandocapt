# 03 — Technical Decisions

> Ghi lại quyết định kỹ thuật quan trọng để agent sau không "phát minh lại" hoặc đảo ngược
> mà không biết lý do. Mỗi entry: quyết định gì, vì sao, đánh đổi gì.

---

## [2026-07-11] Bộ chấm: `grounding_patterns` tách pattern dò tài-liệu khỏi pattern dò câu-trả-lời; forbidden phải negation-aware (T1.8)

- **Bối cảnh:** Baseline T1.7 đỏ 12–16/30 hard fail, nhưng soi từng ca cho thấy ~9/11 ca fail lặp
  lại là **false-positive của bộ chấm**, không phải lỗi bot: (1) forbidden regex bắt cả câu phủ định
  đúng ("**Không** nộp tại Công an phường" vẫn khớp `nộp tại Công an phường`); (2) grounding check
  tái dùng pattern của câu trả lời để dò tài liệu — vỡ khi câu trả lời là en/zh (EV07: pattern chữ Hán
  dò trong docs tiếng Việt = luôn fail) hoặc diễn đạt khác từ ngữ docs (ON01/GD02: R@4 100% vẫn bị
  "ungrounded"); (3) required pattern quá hẹp, trượt diễn đạt tương đương ("không **miễn** nghĩa vụ"
  ≠ "không **thay thế**").
- **Quyết định:**
  - **Schema expectations mở rộng:** fact có thể khai thêm `grounding_patterns` (match **any**) —
    bộ pattern RIÊNG (tiếng Việt) để dò trong `matchedDocs`; không khai thì fallback dùng `patterns`
    như cũ. Grader (`gradeGrounding`) ưu tiên `grounding_patterns` khi có.
  - **Forbidden facts phải negation-aware:** viết pattern với lookbehind
    `(?<!không[^.!?\n]{0,N})` + giới hạn trong cùng câu `[^.!?\n]{0,M}` thay vì `.*` xuyên câu.
    Đã áp cho GV01/GV06; pattern forbidden MỚI phải theo chuẩn này.
  - **TL01 mã hóa lại theo đúng ý định T1.1:** bỏ required fact "phải có cụm phân biệt hạn khai báo
    vs thời gian xử lý" (bắt oan câu trả lời đúng, gọn); thay bằng **forbidden**
    `deadline_confused_with_processing` — chỉ fail khi bot thực sự trình bày 12/24 giờ như thời gian
    xử lý/giải quyết.
- **Đánh đổi:** `grounding_patterns` lỏng hơn (chỉ cần bằng chứng chủ đề trong docs, không cần đúng
  nguyên văn khẳng định) → giảm độ nhạy bắt hallucination tinh vi; bù lại hết false-positive hệ thống
  (đã có test 2 chiều: docs không có bằng chứng → vẫn ungrounded). Xác minh live: 10/11 ca từng fail
  lặp lại chuyển PASS, KC04 còn fail là **gap bot thật** (không đưa hướng dẫn police/embassy).
- **Người quyết định:** user ("Mở T1.8 sửa grader") / Claude Code (Fable 5). Chi tiết: `07-parallel-task-plan.md` (T1.8).

---

## [2026-07-11] Eval-mode output: gate 3-điều-kiện, tái dùng EVAL_BYPASS_TOKEN (T1.3)

- **Quyết định:** Event SSE `done` đính thêm trường `eval` (trace retrieval: standaloneQuery, category,
  toàn bộ match trước/sau lọc, lý do loại từng match, toàn văn 4 docs cuối) để bộ chấm grounding (T1.5)
  kiểm được Recall@4/fact-in-source mà không phải gọi Pinecone lần hai. Cổng bật là hàm thuần
  `shouldAttachEvalDebug` — true CHỈ khi `NODE_ENV !== 'production'` **AND** `captchaToken` khớp
  `EVAL_BYPASS_TOKEN` **AND** body `evalDebug === true`.
- **Vì sao tái dùng `EVAL_BYPASS_TOKEN`** (thay vì token eval riêng): token này đã là bí mật chỉ bộ
  regression biết (đang dùng để bỏ Turnstile + rate limit), non-production-only, và có sẵn cảnh báo
  khởi động nếu lỡ đặt trên production (`api/chat.js` dòng ~22). Thêm token thứ hai chỉ tăng bề mặt
  cấu hình mà không tăng an toàn. Cờ `evalDebug` tách riêng để eval-run bình thường (đo latency) không
  kéo theo payload trace nặng trừ khi chủ động xin.
- **Đánh đổi:** `eval` chứa toàn văn tài liệu nội bộ → tuyệt đối không được rò production; guard bằng
  `NODE_ENV` (điều kiện đầu tiên, không có đường vòng) + unit test 2 ca bảo mật. Trace chỉ dựng khi
  evalMode (`evalTrace = null` mặc định) nên hot-path production không tốn thêm gì. KHÔNG đụng 4 điểm
  `done` khác (cache-hit, deterministic bare-place…) vì chúng không có dữ liệu retrieval.
- **Người quyết định:** user (kế hoạch) / Claude Code (Opus 4.8). Chi tiết: `07-parallel-task-plan.md` (T1.3).

---

## [2026-07-11] Nội dung: mốc khai báo 12/24 giờ VẪN áp dụng — chỉ luồng phiếu giấy/NA17 là lỗi thời (T1.1)

- **Bối cảnh:** Review 2026-07-11 phát hiện nguy cơ mâu thuẫn trong bộ chấm regression: nếu vừa
  cấm F01 hướng dẫn phiếu giấy vừa không phân biệt rõ, bộ chấm có thể vô tình cấm luôn mốc "12 giờ /
  24 giờ" — trong khi TL01 lại BẮT BUỘC nêu đúng mốc này, và `allowedConstants` trong
  `api/chat.js` whitelist "12 giờ"/"24 giờ" làm hằng số pháp lý lõi. Ba chỗ này phải nhất quán
  trước khi codify vào `test/regression-expectations.json` (T1.2).
- **Quyết định (nội dung, do người dùng chốt):**
  - **LỖI THỜI (phải chặn):** luồng khai báo bằng **phiếu giấy**, mẫu **NA17**, khai báo qua
    **fax/điện thoại**, và hướng dẫn **nộp phiếu trực tiếp** tại trụ sở như con đường chính.
  - **CÒN HIỆU LỰC (giữ nguyên):** **hạn khai báo tạm trú 12 giờ** (hoặc **24 giờ** tại vùng
    sâu/vùng xa) — mốc thời hạn này ÁP DỤNG cho khai báo **trực tuyến qua KBTT**
    (`https://kbtt.xuatnhapcanh.gov.vn`). Lỗi thời là *phương thức* (giấy), KHÔNG phải *thời hạn*.
- **Đồng bộ 3 chỗ (điều kiện hoàn thành T1.1):**
  1. **F01** (`test/cau-hoi/bo-test-regression-30-cau-nguoi-nuoc-ngoai-tthc.md`): kỳ vọng bổ sung
     "cấm phiếu giấy / NA17 / fax / nộp trực tiếp; KHÔNG cấm mốc 12–24 giờ". F01 mang trạng thái
     `DEFERRED_SOURCE_GOVERNANCE` — được phép fail đến hết Giai đoạn 2, chỉ Giai đoạn 3 mới đóng
     (khi metadata supersession lọc được nguồn giấy lỗi thời khỏi retrieval). CẤM sửa nhanh bằng
     prompt/regex chặn từ khóa.
  2. **TL01**: giữ nguyên yêu cầu trả đúng mốc 12 giờ / 24 giờ khi RAG có căn cứ; phân biệt "hạn
     khai báo" với "thời gian xử lý".
  3. **`allowedConstants`** (`api/chat.js`, quanh dòng 2298): **GIỮ NGUYÊN** "12 giờ"/"24 giờ" +
     các bản dịch đã duyệt. T1.1 KHÔNG sửa `api/chat.js` (thuộc LANE-CORE) — chỉ xác minh còn nguyên.
- **Đánh đổi:** F01 baseline sẽ đỏ (deferred) cho tới Giai đoạn 3 — chấp nhận có chủ đích để
  không che lỗi nguồn lỗi thời bằng thủ thuật prompt. Runner phải tự gắn nhãn deferred (không tính
  hard fail) để báo cáo baseline không nhiễu.
- **Người quyết định:** user (chốt nội dung 12/24h) / Claude Code (Opus 4.8). Chi tiết task:
  `docs/brain/07-parallel-task-plan.md` (T1.1).

---

## [2026-07-10] 3 run regression sau Giai doan 2/3 — CHUA dat chuan "sach", phat hien GV02 flaky

- **Ket qua:** Chay 3 lan lien tiep `node scripts/run-regression.js` tren nhanh `feat/chat-ux` (gom code Giai doan 1-3). Khong co `LEGAL_HALLUCINATION` xac nhan o ca 3 lan. Nhung KHONG dat tieu chi "sach" nghiem ngat: Run 1 co 1 FAIL tu cham (GD02 — regex harness doi "tre em" nhung bot viet "tre", noi dung THUC TE dung/khong mien tru, Run 2+3 cung cau PASS → la loi harness, khong phai loi bot) va 1 ERROR `BLOCKED_CONTENT` (GV02); Run 2 co 2 ERROR `BLOCKED_CONTENT` (GV02 + EV01); Run 3 co 1 TRUNCATED (GV02, nhung xu ly dung thiet ke — lui ve ranh gioi cau + notice, khong dut giua cau).
- **Phat hien:** Ca 3 lan deu vuong o **GV02** ("Toi la nguoi Trung Quoc visa DN sap het han, can chuan bi gi?") — luc bi Gemini tu chan (safety filter, khong doi trong Giai doan 2/3), luc cham tran token (maxOutputTokens khong doi). Khong lien quan retrieval/exact-token-boost (cau nay khong co ma mau/so hieu van ban nen khong kich hoat boost). Nghi la Gemini safety classifier khong on dinh voi cum "nguoi Trung Quoc" + "visa" trong ngu canh nay, hoac cau tra loi qua chi tiet (nhieu doc match) de cham tran o mot so lan.
- **Quyet dinh:** VAN commit 3 bao cao vao `test/results/` lam bang chung (dung convention repo), nhung KHONG cong bo day la baseline "san xuat dat chuan" moi — GV02 can dieu tra rieng (xem TASK moi trong `04-current-tasks.md`) truoc khi coi Giai doan 2/3 la an toan tuyet doi cho retrieval. Cac thay doi retrieval (exact-token boost, query rewrite, model tien ich) KHONG gay hallucination moi qua 3 lan — rui ro chinh con lai la flakiness cua GV02, thuoc tang generation/safety chu khong phai RAG.
- **Nguoi quyet dinh:** user (yeu cau chay regression) / Claude Code (Fable 5)

---

## [2026-07-10] Dieu tra GV02 flaky — ket luan: sampling variance o tang generation, khong phai RAG

- **Phuong phap:** (1) Them log chan doan tam thoi (`finishReason`/`promptFeedback`/`safetyRatings` cua Gemini) vao nhanh `BLOCKED_CONTENT` trong `api/chat.js`. (2) Chay GV02 don le 10 lan lien tiep — **10/10 THANH CONG**, dai 137-350 tu (khong bi chan, khong cham tran). (3) Chay full 30-cau them 2 lan nua — 1 lan sach hoan toan (0 FAIL/TRUNCATED/ERROR), 1 lan GV02 tiep tuc TRUNCATED. Tong cong da chay 4 lan full 30-cau: 2 lan co loi GV02, 1 lan GV02 truncated, 1 lan sach 100%. Khong lan nao trong toan bo dieu tra bat duoc dong log `BLOCKED_CONTENT` moi (khong xay ra them trong cac lan sau khi bat log).
- **Ket luan:** GV02 ("Toi la nguoi Trung Quoc visa DN sap het han, can chuan bi gi?") da duoc xep dung ngan sach FULL (250 tu, KHONG phai loi phan loai NARROW/FULL) nhung chu de nay von can tra loi dai (nhieu mau don NA6/NA8, nhieu muc phi, nhieu buoc) — sinh ra 137-350 tu tuy lan, thinh thoang vuot ca 250 va cham tran cung 3072 token. Day la **bien thien sampling tu nhien cua Gemini o `temperature: 0.2`** (khong doi trong Giai doan 2/3) ket hop voi chu de von dai, KHONG phai do exact-token-boost/query-rewrite/doi model tien ich (GV02 khong co ma mau/so hieu van ban nen exact-token-boost khong kich hoat; khong co history nen query-rewrite khong chay; model tien ich chi dung cho rerank/groundedness/summary, khong dung cho generation chinh). `BLOCKED_CONTENT` (Gemini tu chan, tra candidate rong) la hien tuong xac suat thap, co the lien quan classifier an toan nhay cam voi cum "nguoi Trung Quoc" + tinh trang cu tru/visa, nhung KHONG tai hien duoc de bat log chan doan xac nhan category cu the.
- **Quyet dinh:** Giu log chan doan (`api/chat.js`, doi tu "TEMP DEBUG" thanh comment vinh vien P3.5) de lan sau xay ra that trong production co the doc duoc finishReason/safetyRatings tu Vercel logs. KHONG doi threshold safety hay them retry-on-block ngay (can quyet dinh rieng, anh huong toan bo generation). TRUNCATED da duoc xu ly dung thiet ke (lui ranh gioi cau + notice) — chap nhan duoc, khong phai rui ro du lieu. Xoa cac bao cao regression 1-cau phat sinh trong luc dieu tra (khong phai bang chung chinh thuc), giu lai 1 full-run sach moi lam bang chung bo sung.
- **Nguoi quyet dinh:** user (yeu cau dieu tra) / Claude Code (Fable 5)

---

## [2026-07-10] Giai doan 3 UX + khep vong chat luong (SSE status, starter chips, guide deep-link, Telegram alert)

- **Quyet dinh:**
  1. **SSE status 1 event** (`api/chat.js`): thay vi restructure toan bo SSE head de phat 2 pha `retrieving`/`generating` (se pha vo cac nhanh `res.status().json()` xu ly loi TRUOC stream), chi phat 1 event `{status:'generating'}` tai diem writeHead san co (ngay sau khau truy hoi). Client hien "Dang tra cuu…" tu luc gui, doi sang "Dang soan tra loi…" khi nhan event. Event khong co `text`/`done` nen client cu bo qua an toan. `js/gemini.js` them tham so `onStatus`.
  2. **Starter chips khi mo chat** (`js/chatbot.js` `renderStarterChips`): hoi thoai trong → 6 chip cau hoi pho bien, tai dung class `ai-chat-quick-replies` (bi `clearQuickReplies` don khi gui). Chip click dien input + `handleChatSend`.
  3. **Guide deep-link theo title khop chinh xac** (`js/tthc-catalog.js` `findByTitle`/`openByTitle`/`preload`): guide co `procedure_id=guide:*` la id TONG HOP tu catalog, KHONG ton tai trong metadata Pinecone runtime — nen citation guide khong the deep-link qua procedure_id. Giai phap: resolve theo title khop CHINH XAC (chuan hoa `normalizeVi`) trong catalog. `appendSources` chi hien nut doi chieu khi `findByTitle` tra ve id → KHONG bao gio mo nham. Warm catalog trong nen khi MO CHAT (`preload`) de nut resolve duoc, khong eager-load luc tai trang.
  4. **Telegram alert opt-in** (`sendTelegramAlert` trong `api/chat.js`, dung boi groundedness-fail va feedback 👎 trong `api/feedback.js`): no-op neu thieu `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`. Khep vong: `scripts/read-feedback.js --down` hang tuan → them ca sai that vao bo regression.
- **Danh doi:** SSE status don gian hoa (1 event thay 2 pha) danh doi do chi tiet lay an toan error-handling. Guide deep-link phu thuoc title khop chinh xac — neu title citation runtime lech title catalog (vd cat ngan) thi nut khong hien (fail-safe, khong sai). Telegram alert trong feedback `await` truoc khi tra 200 → them chut latency cho vote 👎 (chi khi bat env, feedback goi it).
- **Nguoi quyet dinh:** user / Claude Code (Fable 5)

---

## [2026-07-10] Giai doan 2 nang cap do chinh xac retrieval (exact-token boost, query rewrite, model tien ich, taskType gated)

- **Quyet dinh:**
  1. **Exact-token boost** (`api/chat.js` `extractExactTokens`/`boostExactTokenMatches`): cau hoi chua ma mau don (NA17, TT01) hoac so hieu van ban (5568/QD-BCA, 47/2014) thi don match co token khop NGUYEN VAN len dau TRUOC buoc loc nguong 0.62, va cuu match duoi nguong neu score >= san mem 0.45 (`EXACT_TOKEN_RESCUE_FLOOR`). Rerank sau do van la cong chat luong cuoi. Ly do: bao cao P0.5 ghi nhan bien thien retrieval giua cac lan chay lam bo sot dung van ban nguoi dung goi ten; vector search lam mo token chinh xac.
  2. **Query rewrite follow-up** (`rewriteFollowUpQuery`): cau follow-up ngan (<8 tu) duoc viet lai thanh cau doc lap bang model tien ich (temp 0, 64 token, timeout 2s) truoc khi embed; loi/timeout → fallback heuristic BOT-04 cu (noi keyword tho). Do qua `stageTimings.query_rewrite_ms`.
  3. **Model tien ich → gemini-2.5-flash-lite** (`GEMINI_RERANK_URL`, dung chung cho rerank + groundedness nen + tom tat lich su): the he moi hon 2.0-flash, re/nhanh, du cho tac vu xep hang/tom tat. Generation chinh GIU nguyen gemini-2.5-flash.
  4. **taskType embedding bat doi xung — GATED** (`EMBED_TASK_TYPE`): query-side chi them `taskType` khi env `EMBED_TASK_TYPE` duoc dat; mac dinh khong dat → giu hanh vi cu. Phai kich hoat DONG BO voi re-embed corpus (`RETRIEVAL_DOCUMENT`) sang namespace moi, neu khong query va corpus lech khong gian embedding lam GIAM chat luong. Script `setup/reembed-corpus.js` (mac dinh dry-run) va `setup/backfill-tthc-metadata.js` (mac dinh draft) chi ghi Pinecone khi truyen `--apply`.
- **Danh doi:** (1) Boost co the keo 1 doc duoi nguong vao prompt khi nguoi dung goi dung so hieu — chap nhan vi do la doc lien quan nhat, va san mem 0.45 chan nhieu thuan; (2) Query rewrite them 1 call LLM trong hot path cho cau ngan (timeout 2s bao ve, fallback an toan); (3) Doi model rerank/tom tat co the doi thu tu doc → CAN chay lai 3 run regression truoc khi coi la baseline moi (chua chay het trong dot nay, moi smoke 1 cau TR03 PASS). taskType chua kich hoat cho toi khi corpus duoc re-embed.
- **Nguoi quyet dinh:** user / Claude Code (Fable 5)

---

## [2026-07-10] Tinh nang Bao cao Chatbot: endpoint feedback rieng, luu RTDB, turn_id phia client

- **Quyet dinh:** Them `api/feedback.js` rieng thay vi nhet vao `api/chat.js`. Endpoint tai dung nguyen 4 helper cua chat qua require cheo (`isAllowedOrigin`, `resolveClientIp`, `verifyRequestSignature`, `sanitizeDiagnosticText`) de HMAC khong bao gio lech pha giua client/server. (1) **Luu tru = RTDB** `chat_feedback/<date_key>` (khong dung firebase-admin/Firestore) — 1 fetch REST, cung ha tang telemetry fallback, `scripts/read-feedback.js` doc lai. (2) **`turn_id` sinh phia CLIENT** (`js/chatbot.js`) — de KHONG phai sua 5 diem phat event `done` trong `api/chat.js` (thay doi phau thuat). Bao cao dinh kem san cau hoi + cau tra loi + sources nen khong can doi soat voi telemetry server. (3) **Nut 👍/👎 co san** (truoc chi `lockFeedback` tai cho) duoc noi vao: 👍 gui vote ngay, 👎 mo form (5 loai van de + mo ta + lien he), "Bo qua" van ghi 1 phieu 👎. (4) **Rate limit best-effort** IP/ngay tren RTDB (khong atomic nhu quota chat ton phi LLM) — chi chan spam, fail-open khi loi doc.
- **Ngoai le privacy co kiem soat:** Khac quyet dinh telemetry [2026-06-27] (mac dinh KHONG luu Q/A), feedback CO luu cau hoi + cau tra loi cua luot bi bao cao. Ly do: nguoi dung CHU DONG bam gui (opt-in dong y), va thieu Q/A thi admin khong biet bot sai o dau. Van sanitize PII (email/token/so ho chieu) qua `sanitizeDiagnosticText`, IP HMAC-hash, va co TTL `expires_at` (`FEEDBACK_RETENTION_DAYS` mac dinh 90 ngay).
- **Danh doi:** `api/feedback.js` require `api/chat.js` → keo Pinecone client vao bundle feedback (cold-start nang hon) nhung doi lai HMAC parity tuyet doi; chap nhan vi feedback goi it. `turn_id` client kem tin cay hon server khi doi soat cross-log, nhung du dung vi record da tu chua Q/A. RTDB thay Firestore: option user chon la "Firestore + script" nhung RTDB la cung Firebase, don gian hon va read script van doc duoc — neu sau nay can query/dashboard manh hon thi chuyen sang Firestore collection `chat_feedback`.
- **Nguoi quyet dinh:** user (chon: Firebase + script doc · ca vote nhanh + form chi tiet · co luu Q/A) / Claude Code (Opus 4.8)

---

## [2026-07-10] Fix catalog guide rong va dong bo lenh sinh catalog day du

- **Quyet dinh:** `npm run gen:catalog` nay chay `scripts/generate-tthc-catalog.js --include-guides`; CLI mac dinh `includeGuides=true` va co `--exclude-guides` de audit rieng tap `source_type='tthc'`. Generator bo cac chunk guide khong co `Noi dung wiki`/`Nội dung wiki` that, khong con tao detail chi la `<title>:`; `extractGuideFee` chi tom tat phi tu body muc phi/le phi, khong suy phi tu tieu de. Snapshot `data/tthc-catalog.json` sau regenerate = 92 muc (35 tthc that + 57 guide co noi dung), van du 17 linh vuc.
- **Ly do:** Review commit `0f84233` phat hien 46/102 guide trong snapshot 137 muc gan nhu rong khi mo chi tiet, va `npm run gen:catalog` co the tai sinh sai mode neu khong truyen `--include-guides`. Hai loi nay lam danh muc kho dung trong UI va lam snapshot khong reproducible.
- **Danh doi:** So muc catalog giam tu 137 xuong 92 vi loai guide chi co tieu de/section rong; mot so FAQ/heading ho chieu khong con hien neu KB Pinecone chua co than noi dung. Chap nhan vi card cong khai phai co noi dung doi chieu that. Deep-link tu chatbot van chi cham 35 tthc that nhu truoc.
- **Nguoi quyet dinh:** user / Codex

---

## [2026-07-10] Dao huong 1: catalog gom ca guide, chi loc noi dung noi bo chatbot

- **Quyet dinh:** `data/tthc-catalog.json` da commit gio sinh bang `--include-guides` (137 thu tuc = 35 tthc that + 102 guide). Them `INTERNAL_GUIDE_TITLE_PATTERN` trong `scripts/generate-tthc-catalog.js` de LOAI cac muc guide thuc chat la noi dung noi bo chatbot (title khop `nguyên tắc trả lời | quản trị viên | chatbot | ^người dùng:`) — 8 muc bi loai. Test `data/tthc-catalog.json da commit` doi ky vong sang `includeGuides=true`, ~100–200 muc, phai co ca entry guide lan tthc, va assert 0 muc lo noi dung noi bo.
- **Ly do:** User yeu cau khoi phuc danh muc day du: ban chi-tthc (35) bo sot nhieu linh vuc nguoi dan can (cu tru 13, can cuoc 21, dang ky xe 11, dinh danh dien tu 3, nganh nghe ANTT 3, khieu nai to cao 2, xuat nhap canh 3). Cac linh vuc nay CHI ton tai duoi dang guide trong KB. Bo hoan toan guide (huong 1) la mat scope thuc te. Nhung noi lo lo noi dung noi bo cua huong 1 van dung — nen thay vi bo het guide, chi loc dung 8 muc noi bo.
- **Danh doi:** Danh muc rong hon (137 vs 35) nhung 102 guide co `procedure_id = guide:*` KHONG direct-link tu nut "Doi sanh thu tuc goc" trong chat (nut do chi match `procedure_id` cua tthc). Nghia la: panel duyet day du 17 linh vuc, nhung deep-link tu citation chatbot van chi cham 35 tthc that. Guide chi doc duoc qua duyet danh muc, khong qua nut doi sanh. 6 linh vuc chi-co-tthc (thuong tru, giay thong hanh, tai khoan dien tu, xac nhan thong tin, nguoi khong quoc tich, khu vuc cam) van giu nguyen 17 muc tthc.
- **Nguoi quyet dinh:** user / Claude Code (Opus 4.8) — dao quyet dinh [2026-07-09] "huong 1" ngay duoi.

---

## [2026-07-09] Catalog chi chua TTHC that; guide la opt-in (huong 1) — DA DAO NGAY 2026-07-10

- **Quyet dinh:** Mac dinh `scripts/generate-tthc-catalog.js` CHI xuat thu tuc hanh chinh that (`source_type='tthc'`). Kho `guide` (wiki/FAQ/huong dan noi bo chatbot) chi duoc gop vao khi bat `--include-guides`. Them dedupe theo (linh vuc + cap + ten chuan hoa), giu ban day du hon (uu tien phi da xac minh, roi text dai hon). `missingFromBackups` tinh lai tren tap TRUOC dedupe (audit id khong tai duoc tu Pinecone) — o live mode du du lieu thi rong. Regenerate `data/tthc-catalog.json` = 35 thu tuc that (39 fetch - 4 ban trung title+cap).
- **Ly do:** Che do live truoc do nap CA corpus Pinecone, bien moi chunk RAG thanh mot "thu tuc" (149 entry, 110 guide). Lam lo noi dung noi bo ("Nguyen tac tra loi cua chatbot", "Goi y cho quan tri vien"), cau hoi mau ('Nguoi dung: "..."'), va xe mot thu tuc thanh ~35 manh — phan tac dung voi muc dich "nguon de doi chieu". Chi tiet review: xem log [2026-07-09] duoi.
- **Danh doi:** Catalog hep hon (35 thay vi 149) nhung dung nghia thu tuc hanh chinh. Neu sau nay muon lam san pham "wiki huong dan" rieng thi bat `--include-guides` (code parse guide + test van con). Guide procedure_id la tong hop nen khong direct-link tu chat — khong con la van de vi guide da tach khoi catalog mac dinh.
- **Nguoi quyet dinh:** user / Claude Code (Opus 4.8)

---

## [2026-07-09] Catalog TTHC tinh de doi chieu cau tra loi AI

- **Quyet dinh:** Giu frontend doc `data/tthc-catalog.json` tinh same-origin, nhung doi `scripts/generate-tthc-catalog.js` sang che do uu tien Pinecone live neu local co env hop le. Generator lay ca record `tthc_*` va group `guide_*` thanh mot thu tuc de catalog khong bi hep vao bo backup XNC cu; neu local khong co key hop le thi fallback ve backup trong repo. Chat van chi hien nut doi chieu khi source co `procedure_id`.
- **Ly do:** KB thuc te trong Pinecone rong hon bo backup dang track trong repo; neu tiep tuc sinh catalog tu backup cu thi UI se lech scope va bo sot nhieu TTHC nhu cu tru, can cuoc, dang ky xe. Van giu file tinh o frontend de khong mo Pinecone ra browser.
- **Danh doi:** Catalog van la snapshot, nen muon dong bo voi KB moi nhat phai chay lai `npm run gen:catalog`, commit JSON moi va build lai. Cac guide duoc tong hop theo heuristics (ten thu tuc + muc wiki), nen `procedure_id` direct-link hien chi co cho nhom `tthc_*`; 4 record thieu toan van trong backup cu van duoc ghi nhan o `missingFromBackups` de theo doi.
- **Nguoi quyet dinh:** user / Codex

---

## [2026-07-03] Progressive disclosure UI — quick-reply chips + accordion (chỉ client, không đổi API)

- **Quyết định:** (1) `js/chatbot.js` thêm `detectQuickReplies(fullText)` — hàm thuần nhận diện 3 loại follow-up có tập lựa chọn hữu hạn bằng regex khớp NGUYÊN VĂN phrasing cố định trong `SYSTEM_PROMPT_BASE`/`XNC_RECEPTION_VERIFIED_BLOCK` (api/chat.js): hỏi khu vực cũ (Phú Thọ/Vĩnh Phúc/Hòa Bình) → 3 chip; hỏi quốc tịch khi mất hộ chiếu chưa rõ đối tượng → 2 chip vi/en; câu mời "hướng dẫn đầy đủ hồ sơ" (chế độ HẸP) → 1 chip. Click chip = điền `input.value` rồi gọi lại `handleChatSend()` (tái dùng nguyên luồng gửi, kể cả guard Turnstile). Chip bị dọn (`clearQuickReplies`) mỗi khi gửi tin mới. (2) `applyProgressiveDisclosure(content)` — sau khi render markdown, gom 2 khối `📋 Hồ sơ`/`📝 Trình tự` (nếu CẢ HAI cùng xuất hiện — tức câu trả lời trọn thủ tục) vào `<details>` đóng mặc định; `📍 Nơi nộp`, `📚 Căn cứ` và đáp án mở đầu luôn hiển thị. Câu hỏi hẹp (chỉ 1 marker hoặc 0) giữ nguyên phẳng.
- **Lý do:** Tiếp nối answer-first (xem entry 2026-07-02 ngay dưới) — bot đã trả lời ngắn hơn và kết bằng đúng 1 câu hỏi follow-up, nhưng người dân vẫn phải đọc và gõ lại thủ công (dễ gõ mơ hồ, chậm trên mobile). Chip hóa các follow-up có tập lựa chọn hữu hạn giúp rút ngắn hội thoại mà không đổi nội dung câu trả lời.
- **Đánh đổi:** Chip phụ thuộc CHẶT vào phrasing đúng nguyên văn trong prompt — đã thêm comment cross-reference tại 3 vị trí trong `api/chat.js` (dòng cạnh câu hỏi mất hộ chiếu, câu mời hướng dẫn đầy đủ, và đầu `XNC_RECEPTION_VERIFIED_BLOCK`) nhắc agent sau phải sửa đồng bộ. Không có test nào tự động phát hiện lệch pha giữa prompt và regex — nếu đổi phrasing mà quên sửa `detectQuickReplies`, chip chỉ lặng lẽ ngừng hiện (không lỗi, không crash) — người dân vẫn dùng được bằng cách gõ tay như trước, chỉ mất phần tiện ích. Vì đây là thay đổi thuần client (không đụng `api/chat.js` logic/response, chỉ thêm 3 dòng comment), KHÔNG cần chạy lại 3× regression baseline.
- **Người quyết định:** user / Claude Code

---

## [2026-07-02] Answer-first + ngân sách độ dài + lưới chống ngắt giữa câu

- **Quyết định:** (1) `SYSTEM_PROMPT_BASE` chuyển sang answer-first: câu đầu tiên phải là đáp án trực tiếp; tách 2 chế độ trả lời — câu hỏi HẸP (1 chi tiết, mục tiêu < 120 từ, không dump hồ sơ/trình tự) và câu hỏi TRỌN THỦ TỤC (cấu trúc A, mục tiêu < 250 từ); cấm chào hỏi/xã giao, tối đa 1 câu hỏi follow-up, không lặp thông tin 2 chỗ, mỗi điểm tiếp dân 1 dòng. Chỉ sửa phần mục tiêu/cấu trúc/văn phong — khối "DỮ LIỆU & CHỐNG BỊA" giữ nguyên 100%. (2) Khi chạm trần token (Gemini `MAX_TOKENS` hoặc DeepSeek `length`): `trimToSentenceBoundary()` trong `lib/output-validator.js` cắt lùi về ranh giới câu hoàn chỉnh và nối câu chốt theo ngôn ngữ (`getTruncationNotice`), chạy TRƯỚC `validateAnswer` — người dân không bao giờ thấy văn bản đứt giữa câu. Nếu không có ranh giới an toàn thì bỏ fragment; response truncated không được lưu FAQ cache; notice canonical chỉ nằm trong `fullText`. Giữ `maxOutputTokens: 3072`. (3) `scripts/run-regression.js` đếm từ Unicode bằng `Intl.Segmenter`, gắn soft-fail `VERBOSITY` đúng ngân sách prompt (câu hẹp > 120 từ, câu đầy đủ > 250 từ) và `TRUNCATED`, thêm bảng tổng hợp đầu báo cáo.
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
## [2026-07-03] Va record `tthc_matt26265` theo tai lieu KBTT co so luu tru chinh thong

- **Quyet dinh:** Cap nhat truc tiep metadata Pinecone cua vector `tthc_matt26265` trong namespace `chatbot-tthc-xnc` theo tai lieu `KBTT_HD_Trang_CSLT_v2.0.pdf` cua Cuc Quan ly xuat nhap canh. Giu ten thu tuc cu de bao toan kha nang retrieval, nhung sua cac fact sai: bo mo ta `Cap Tinh`, bo `Thoi han: 24 gio den 07 ngay`, doi lai thanh luong khai bao online danh cho co so luu tru tai `https://kbtt.xuatnhapcanh.gov.vn`, gan tham quyen voi Cong an cap xa noi co so luu tru, va backfill metadata `thoi_han` + `mau_don`.
- **Ly do:** Record cu tron lan giua huong dan su dung he thong va TTHC chung, dan den chatbot co nguy co tra sai tham quyen tiep nhan va sai cach thuc khai bao. PDF chinh thong cho thay day la luong thao tac cua co so luu tru tren he thong KBTT, khong phai quy trinh `Cap Tinh` nhu metadata cu.
- **Danh doi:** Day la metadata-only update, giu nguyen vector embedding cu de tranh phu thuoc vao pipeline ingest moi; vi vay retrieval van dua tren embedding cua noi dung gan cu. Chap nhan duoc vi semantic chinh van la `khai bao tam tru nguoi nuoc ngoai online`, nhung neu sau nay co pipeline ingest chuan thi nen re-embed record nay tu noi dung da sua.
- **Nguoi quyet dinh:** user / Codex

---

## [2026-07-03] Fail-closed nhanh `tam_tru_khai_bao` va re-embed record KBTT

- **Quyet dinh:** Dong bo sua ca runtime va du lieu cho nhanh `tam_tru_khai_bao`: (1) `api/chat.js` chi chap nhan tai lieu co `retrieval_intent=tam_tru_khai_bao_nguoi_nuoc_ngoai` hoac tin hieu manh `NA17`/`KBTT`/nguoi nuoc ngoai/co so luu tru`; loai bo tai lieu cu tru cong dan Viet Nam co dau hieu `Thong bao luu tru`, `Dang ky tam tru`, `Luat Cu tru`, `VNeID`, moc 23h/08h; va khi khong con tai lieu hop le thi tra `[]` thay vi fail-open. (2) Record Pinecone `tthc_matt26265` khong sua metadata-only nua ma phai **re-embed** sau khi sua text UTF-8 sach, cap nhat `content_hash`, them `retrieval_intent` + `subject_scope`, backup truoc/sau va verify query mau `khai bao tam tru nguoi nuoc ngoai online cho co so luu tru` tra dung record nay top-1.
- **Ly do:** Dot va ngay 2026-07-03 truoc do da de lai 2 gap nghiem trong: metadata Pinecone bi `?` lam mat het tin hieu tieng Viet, va branch filter `tam_tru_khai_bao` van fail-open khi khong tim duoc positive match nen keo lai tai lieu cu tru cong dan Viet Nam.
- **Danh doi:** Runtime se it "co gang tra loi bang moi gia" hon cho nhanh nay; khi KB khong co can cu dung branch, chatbot phai noi thieu can cu thay vi tu mo rong sang thu tuc khac. Regression tich hop phai chay rieng bang API that (`npm run test:regression:tam-tru`, `node scripts/run-regression.js`) thay vi dua vao unit test mac dinh.
- **Nguoi quyet dinh:** user / Codex

---
