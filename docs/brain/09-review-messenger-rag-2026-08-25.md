# Review kiến trúc: Tích hợp Facebook Messenger với RAG (2026-08-25)

**Người review:** Claude Code · **Tài liệu nguồn:** MESSENGER_RAG_CLAUDE_REVIEW_BRIEF.md
**Baseline đã kiểm chứng:** `origin/main` = `c6e9fa5d972280e32e0564371a4a14b45ac9dd9a` — **đúng như brief nêu**, không có commit mới, không có PR đang mở chưa merge trên nhánh chính.

---

# VERDICT

```
APPROVE_WITH_CHANGES
```

Hướng kiến trúc đúng và nên giữ. Nhưng có **5 vấn đề chặn (blocking)** phải sửa trong tài liệu *trước khi* giao AGENTS viết code. Nếu giao nguyên trạng, implementation sẽ hỏng ở đúng những chỗ tài liệu tự tin nhất.

---

# EXECUTIVE ASSESSMENT

Ba nhận định chính:

**1. Rủi ro lớn nhất của dự án này không nằm ở Messenger — nó nằm ở Phase M1.**
Tài liệu coi M1 ("Shared RAG extraction") là bước dọn đường ít rủi ro trước phần việc thật. Thực tế ngược lại: M2–M4 là code mới, có thể test, hỏng thì tắt cờ. M1 đụng vào tài sản duy nhất không được phép hỏng — chatbot website đang chạy. Và như mục C1 dưới đây chỉ ra, M1 theo cách đặc tả hiện tại **không phải là "vẽ boundary", nó là viết lại đường trả lời**.

**2. Ba giả định kỹ thuật trong tài liệu sai theo hướng nguy hiểm — "trông như đã chạy" nhưng hỏng ở production.**
`waitUntil` không cho ngân sách thời gian như tài liệu ngầm định (C2). Xác thực chữ ký Meta sẽ pass mọi unit test rồi chết ở tin nhắn tiếng Việt thật đầu tiên (C3). Và `message_echoes` — thứ tài liệu xếp vào "sự kiện cần bỏ qua" — lại chính là cơ chế duy nhất phát hiện cán bộ đã trả lời tay (C5).

**3. Nguyên tắc fail-closed được tuyên bố nhưng chưa được thiết kế để cưỡng chế.**
Mục §7 nói đúng ("không đủ chắc chắn thì chuyển human"), nhưng danh sách class ở §7 lại xếp `PUBLIC_*` ngang hàng `SENSITIVE_*` như đầu ra của một bộ phân loại chọn-một. Một denylist fail *open* trước cách diễn đạt chưa lường trước. Với inbox của một Trang Công an, đó là hướng sai (C4).

Một điểm bối cảnh tài liệu chưa nêu và nó làm mọi thứ trên đây quan trọng hơn: **phân phối đầu vào của Messenger khác hẳn website.** Trên website, người dùng bấm vào một widget chat trên trang tra cứu thủ tục — họ đã tự lọc. Trong inbox Facebook của Trang Công an, người dân gửi bất cứ thứ gì: tố giác, ảnh CCCD, khiếu nại cá nhân. Cùng một backend, nhưng đầu vào rủi ro hơn nhiều bậc. Đây chính là lý do allowlist-first (C4) không phải là chuyện cầu toàn.

---

# WHAT IS CORRECT

Những phần nên giữ nguyên, không cần bàn thêm:

- **Không nhân đôi RAG/Pinecone (§4.1, §32.3–4).** Đúng tuyệt đối. Đây là quyết định đắt giá nhất trong tài liệu và nó đúng.
- **Tách channel adapter khỏi RAG core (§4.2).** Đúng, kể cả nhận xét tinh tế rằng Turnstile/CORS/IP-rate-limit không được bê nguyên sang webhook. Nhận xét này cho thấy người viết đã thực sự đọc `api/chat.js`.
- **Trình tự phase M0→M9 và việc để Meta configuration ở M6, sau Preview.** Không nối Page thật vào pipeline chưa qua gate — đúng.
- **Feature flag mặc định OFF + kill switch không cần rollback code (§18, §26).** Đúng và bắt buộc.
- **Không dùng raw PSID làm khóa log dài hạn (§9).** Đúng, và repo đã có sẵn primitive để làm việc này (xem mục G).
- **Yêu cầu assertion "external model function was NOT called" cho ca sensitive (§22.4).** Đây là ý hay nhất trong toàn bộ test plan. Giữ và mở rộng.
- **§32.10 "Không giả lập rằng live rehearsal đã PASS khi chưa test thật"** và **§34 "Không dùng verdict cuối nếu còn runtime/manual gate"**. Hai ràng buộc này chống đúng thất bại hay gặp nhất của agent. Giữ nguyên.

---

# CRITICAL ISSUES

## C1 — `api/chat.js` không có `ask()` để "tách ra"; logic RAG hợp nhất với SSE

```
Issue      RAG core không tồn tại dưới dạng một hàm có thể lift ra. Nó là tác dụng phụ
           của một handler 1.295 dòng ghi thẳng vào res.

Impact     §10 đề xuất ask() trả về { answer, sources, confidence, ... }. Không có gì
           trong source hiện tại tạo ra object đó. Câu trả lời chỉ tồn tại như biến
           tích luỹ `fullText` trong vòng lặp stream. Giao đặc tả này cho AGENTS =
           giao một "big-bang refactor" đúng thứ mà §10 dặn phải tránh — và đụng vào
           đúng thứ không được hỏng.

Evidence   api/chat.js:1850   module.exports = async function handler(req, res)
                              → 1.295 dòng, kết thúc ở 3145.
           12 điểm thoát ghi response nằm RẢI RÁC trong pipeline, không tập trung:
             2063, 2133, 2484, 2511, 2549, 2582, 2644, 3018, 3060, 3140
           api/chat.js:2857-2870  emitValidatedSegments() — validator grounding chạy
                              TĂNG DẦN theo từng câu và res.write() NGAY BÊN TRONG
                              vòng kiểm. Bảo đảm "câu trả lời có căn cứ" được sinh ra
                              *trong lúc* stream, không phải sau.
           api/chat.js:2841-2855  validateStreamSegment đóng bao (closure) trên
                              allowedPhones / allowedMapsUrls / allowedCoords /
                              legalCorpus — trạng thái dựng từ khâu retrieval phía trên.

Fix        ĐẢO NGƯỢC hướng refactor. Đừng bóc ask() ra. Thay vào đó chèn một lớp sink:

             res.write(`data: ${JSON.stringify({text})}\n\n`)   →   sink.text(text)
             res.end()                                          →   sink.done(payload)
             res.status(n).json(...)                            →   sink.fail(n, payload)

           - Website truyền SseSink → output giống hệt từng byte → regression an toàn,
             kiểm được bằng mắt trên diff.
           - Messenger truyền BufferSink → tích luỹ rồi trả { answer, sources, ... }.
           - ask() trở thành wrapper mỏng: chạy core với BufferSink.

           Đây là thay đổi cơ học ~20 call-site, review được từng dòng, KHÔNG phải
           tái kiến trúc. Và nó giữ nguyên tính chất quan trọng nhất: validator vẫn
           chạy tăng dần, Messenger được hưởng đúng bảo đảm grounding như website
           chứ không phải một bản sao lỏng hơn.

Blocking?  YES — phải sửa §10 và §11 trước khi AGENTS bắt đầu.
```

**Ghi chú bổ sung:** phần *thuần tuý* của RAG thì **đã** tách sẵn rồi — `api/chat.js:3145-3161` đang export `classifyQuestion`, `filterMatchesByQuestionCategory`, `buildCitationSource`, `reserveRateLimitQuota`, … và `lib/retrieval-governance.js`, `lib/output-validator.js`, `lib/published-locations.js` đều đã là module độc lập. Thứ *chưa* tách được chính xác là phần điều phối, và lý do duy nhất là nó dính `res`. Sink inversion nhắm đúng vào nguyên nhân đó.

---

## C2 — `waitUntil` KHÔNG cho ngân sách thời gian mà §20 ngầm giả định → mất tin nhắn im lặng

```
Issue      §20 đề xuất: ACK 200 → waitUntil(RAG → Send API). Tài liệu ngầm hiểu
           waitUntil "giải phóng" webhook khỏi giới hạn thời gian. Nó không.

Impact     waitUntil hoãn công việc so với RESPONSE, không so với INVOCATION. Toàn bộ
           thời gian vẫn tính vào maxDuration. Với cấu hình hiện tại, pipeline RAG có
           deadline nội bộ 55s trong khi function trần 60s. Kịch bản hỏng:

             RAG chạy tới deadline 55s → Send API còn ~4s → function bị giết giữa chừng
             → Meta ĐÃ nhận 200 nên KHÔNG retry
             → không có bản ghi bền
             → người dân không nhận được gì, hệ thống không biết là đã mất.

           Đây là fail-OPEN theo hướng "câu trả lời không bao giờ đến" và không ai
           phát hiện. Với một Trang Công an, im lặng còn tệ hơn báo lỗi.

Evidence   vercel.json               "api/chat.js": { "maxDuration": 60 }
           api/chat.js:1852          CHAT_REQUEST_DEADLINE_MS mặc định 55000
           api/chat.js:2744          getRemainingDeadlineMs(deadlineAt, 50000)
           api/chat.js:2284, 2880    stage budget retrieval 10s, mỗi lần đọc stream 15s
           Vercel docs               công việc waitUntil vẫn tính vào max duration và
                                     vào Active CPU billing (đã kiểm chứng, xem Nguồn).

Fix        1. Deadline RIÊNG cho Messenger, KHÔNG dùng lại 55s của web:
                MESSENGER_RAG_DEADLINE_MS = 20000..25000
              Đặt maxDuration cho api/messenger/webhook.js = 60 trong vercel.json.
              Bất biến bắt buộc: ack_ms + rag_deadline + send_budget < maxDuration,
              với send_budget >= 10s. Viết bất biến này thành một test.

           2. Outbox tối thiểu khoá theo `mid`: ghi bản ghi PENDING TRƯỚC khi gọi RAG,
              đánh dấu SENT sau khi Send API 200. Không cần queue — chỉ cần làm cho
              việc mất tin nhắn TRỞ NÊN PHÁT HIỆN ĐƯỢC và replay được sau này.

           3. Metric send_failure + rag_deadline_exceeded phải là gate của Pilot, không
              phải thứ xem cho biết.

Blocking?  YES — sửa §20. Và câu B5 tự trả lời: waitUntil ĐỦ cho MVP, nhưng CHỈ KHI
           ngân sách được cưỡng chế và tồn tại outbox. Không phải "waitUntil là đủ".
```

---

## C3 — Xác thực chữ ký sẽ pass mọi unit test rồi chết ở tin nhắn tiếng Việt thật đầu tiên

```
Issue      Meta ký trên RAW BYTES của body. Repo hiện tại không có bất kỳ pattern
           raw-body nào — mọi route đều dùng req.body đã parse sẵn.

Impact     Cách viết hiển nhiên nhất —
             crypto.createHmac('sha256', secret).update(JSON.stringify(req.body))
           — sinh ra chuỗi byte KHÁC với thứ Meta đã ký, mỗi khi payload chứa ký tự
           ngoài ASCII. Meta escape non-ASCII dạng \uXXXX; JSON.stringify của Node
           xuất ký tự nguyên bản. Tin nhắn ở đây là TIẾNG VIỆT — đây không phải ca
           biên, đây là ca mặc định.

           Hệ quả: fail-closed đúng như thiết kế → từ chối 100% traffic thật. Và nó sẽ
           qua sạch mọi test dùng fixture ASCII ("hello", "test message"). Đây là ứng
           viên số một cho "xanh ở local, chết ở Gate D".

Evidence   api/chat.js:1909          validateChatRequestBody(req.body)
           api/feedback.js:222       validateFeedbackBody(req.body)
           grep raw-body toàn repo   → không có kết quả trong api/ và lib/
           lib/staff-gateway-client.js:62  rawBody = JSON.stringify(...) — hợp lệ vì
                                     đây là chiều GỬI ĐI, ta kiểm soát cả hai đầu.
                                     KHÔNG được suy ra pattern này cho chiều NHẬN VÀO.

Fix        1. Đọc raw bytes từ stream request, tắt body parsing cho riêng route webhook.
              Verify HMAC trên Buffer, rồi mới JSON.parse.
           2. So sánh bằng crypto.timingSafeEqual, không dùng ===.
           3. Fixture test BẮT BUỘC phải có payload tiếng Việt với chuỗi \u escape,
              giống hệt từng byte một bản ghi Meta thật. Một test "tampered body" chỉ
              đổi ký tự ASCII KHÔNG bắt được lỗi này.

Blocking?  YES — thêm vào §12 như một yêu cầu tường minh, không để dạng câu hỏi mở
           "cách lấy raw body trên Vercel runtime hiện tại".
```

---

## C4 — Router theo denylist fail OPEN; và classifier bằng LLM tự mâu thuẫn với chính §8.2

```
Issue      Hai vấn đề gắn nhau trong §7 và câu D12–D14.

           (a) §7 liệt kê PUBLIC_* và SENSITIVE_* ngang hàng như đầu ra chọn-một của
               một bộ phân loại. Cấu trúc đó fail OPEN: một cách diễn đạt tố giác chưa
               lường trước sẽ không khớp luật sensitive nào, rơi vào nhánh mặc định,
               và đi thẳng vào RAG.

           (b) Câu D13 hỏi classifier LLM có vi phạm mục tiêu không. CÓ — vi phạm
               tuyệt đối. Phân loại xảy ra TRƯỚC khi biết nội dung có nhạy cảm hay
               không, nên classifier LLM gửi 100% tin nhắn, gồm cả tố giác và ảnh CCCD,
               ra DeepSeek/Gemini. Nó vô hiệu hoá toàn bộ §8.2.

Impact     Nội dung tố giác cụ thể hoặc PII của người dân rời khỏi hạ tầng và tới một
           LLM bên thứ ba — đúng điều §32.7 cấm.

Evidence   Brief §7 (danh sách class), §8.2 (ranh giới dữ liệu), câu D13.
           Repo ĐÃ có sẵn các primitive tất định dùng được ngay:
             api/chat.js:689   hasObviousPii()      — email, dãy 9-13 số, mẫu hộ chiếu,
                                                      SĐT VN, "số cccd/cmnd/hộ chiếu"
             api/chat.js:1537  detectPromptInjection() — có chuẩn hoá NFKD + bóc dấu
                                                      + xoá zero-width
             api/chat.js:1646  isClearlyOutOfScope()   — đã đa ngôn ngữ vi/en/zh/ko
             api/chat.js:1161  classifyQuestion()
             data/tthc-index.json                      — chỉ mục thủ tục đã duyệt
             lib/published-locations.js                — danh mục trụ sở đã xác minh

Fix        HAI CỔNG, phải qua CẢ HAI mới được vào RAG:

             Cổng 1 (denylist, chặn trước):  hasObviousPii OR detectPromptInjection
                                             OR có attachment OR mẫu tố giác  → HUMAN
             Cổng 2 (allowlist, cho phép):   CHỈ đi tiếp khi khớp DƯƠNG TÍNH với
                                             intent đã duyệt — từ khoá thủ tục trong
                                             tthc-index, tên trụ sở trong
                                             published-locations, hoặc FAQ allowlist.
             Mặc định (không khớp cổng 2):   → HUMAN

           Toàn bộ tất định, chạy cục bộ, không gọi model. Ngôn ngữ của §7 phải đổi từ
           "phân loại vào một trong các class" sang "chỉ RAG khi khớp allowlist; mọi
           thứ khác là human". Khác biệt này là toàn bộ ý nghĩa của fail-closed.

Blocking?  YES — viết lại §7 và trả lời dứt điểm D13 là KHÔNG.
```

---

## C5 — `message_echoes` bị xếp nhầm vào "sự kiện cần bỏ qua"; nó là cơ chế duy nhất chống bot tranh trả lời với cán bộ

```
Issue      §22.3 liệt kê "Echo" trong nhóm sự kiện cần bỏ qua. §16 và câu E17 lại hỏi
           làm sao biết cán bộ đã takeover và làm sao tránh bot với cán bộ cùng trả
           lời — mà không nối được hai chỗ này với nhau.

Impact     Không có echo, trạng thái AUTO / PAUSED_FOR_HUMAN ở §16 không có nguồn tín
           hiệu nào. Cán bộ trả lời trong Meta Business Suite là hành động NGOÀI
           webhook message thường. Bot sẽ không biết, và sẽ trả lời chồng lên câu của
           cán bộ. Trên một Trang Công an, việc bot cắt ngang giữa lúc cán bộ đang xử
           lý một trường hợp nhạy cảm là rủi ro thật, không phải rủi ro lý thuyết.

Evidence   Brief §22.3 (echo = ignore) đối lập §16 + câu E16-E19 (bài toán collision).

Fix        Subscribe message_echoes và dùng nó làm primitive phát hiện takeover:
             echo có app_id = app của ta      → do bot gửi, bỏ qua
             echo KHÔNG có app_id / khác app  → NGƯỜI gửi từ Business Suite
                                              → đặt PAUSED_FOR_HUMAN ngay
           Trả lời E19: yêu cầu cán bộ resume TƯỜNG MINH, không dùng timeout. Timeout
           sẽ tự bật lại bot vào giữa một cuộc trao đổi người-với-người đang dở.
           Trả lời E16: KHÔNG cần Handover Protocol native cho MVP — echo + cờ nội bộ
           là đủ, và ít bề mặt hơn nhiều.

Blocking?  YES — sửa §22.3, và bổ sung message_echoes vào §5.3 (webhook fields).
```

---

# HIGH (không chặn khởi động, nhưng phải xử lý trước Pilot)

**H1 — §36 mô tả sai provider hiện tại, và điều đó có hệ quả quản trị.**
Tài liệu ghi *"`api/chat.js`: Gemini API + RAG/Pinecone"*. Không còn đúng. Theo `docs/brain/04-current-tasks.md` (mục DONE 2026-07-23) và Code Graph: **generation và toàn bộ tác vụ utility đã chuyển sang `deepseek-v4-flash`**; Gemini chỉ còn giữ Gemini Embedding 001, và chỉ fallback khi bật `LLM_FALLBACK=gemini` cho HTTP 429/5xx (`api/chat.js:632, 652, 945-954`). Nghĩa là: LLM bên ngoài đang nhận toàn bộ nội dung câu hỏi là **DeepSeek**. Với một Trang Công an, câu hỏi lưu trú/pháp lý dữ liệu cho DeepSeek khác về bản chất so với Gemini, và Messenger *mở rộng* phơi nhiễm đó sang một phân phối đầu vào rủi ro hơn hẳn. Tài liệu không nêu điểm này ở đâu cả. Đây là quyết định của chủ dự án, không phải của AGENTS — nhưng phải được nêu ra để quyết định một cách có ý thức, và ghi vào `03-decisions.md`.

**H2 — §36 lấy Postman collection làm nguồn cho Meta API.** Postman collection của Meta trễ so với `developers.facebook.com/docs`. Với contract chữ ký, retry và messaging window thì phiên bản chính là quan trọng. Đổi nguồn kiểm chứng sang docs chính thức.

**H3 — §22.9 nói "so sánh before/after" nhưng không định nghĩa cách so.** Repo có bộ chấm regression 2 lớp (`lib/regression-grader.js`) với verdict PASS/HARD_FAIL/DEFERRED_FAIL và ngưỡng Recall@4/MRR. Gate M1 phải nêu đích danh: `npm run ci` xanh **và** regression grader không phát sinh HARD_FAIL mới so với baseline `c6e9fa5`. "So sánh" chung chung sẽ bị diễn giải lỏng.

---

# SECURITY / PRIVACY

**Tái dùng được ngay — không cần xây mới:**

| Nhu cầu Messenger | Primitive đã có | Vị trí |
|---|---|---|
| Băm PSID | `hashForLog()` — HMAC-SHA256 + salt, cắt 32 hex | `api/chat.js:89` |
| Fail-closed khi thiếu salt | `isChatLogSaltConfigured()` + `isProtectedDeployment()` → 503 | `api/chat.js:78-87`, dùng ở `1901-1907` |
| TTL / retention telemetry | `buildTelemetryRetention()`, `isTelemetryExpired()` | `api/chat.js:125-140` |
| Rate limit an toàn đa instance | `reserveRateLimitCounter()` — ETag CAS, retry 412 | `api/chat.js:362-389` |
| Chặn PII đầu vào | `hasObviousPii()` | `api/chat.js:689` |
| Chống prompt injection | `detectPromptInjection()` + `sanitizeRetrievedDocumentText()` | `api/chat.js:1537-1549` |

**Trả lời câu G26/G29:** thiết kế băm PSID là đủ, và nên **tái dùng đúng primitive `hashForLog`** thay vì viết lại. Về `MESSENGER_HASH_SALT` riêng (§19): chấp nhận được và có lý do khoang hoá, nhưng nếu tách salt thì **phải nhân bản cả guard fail-closed** — thiếu salt ở preview/production phải trả 503 y như `CHAT_LOG_HASH_SALT`. Nếu không muốn nhân bản guard, dùng một salt với tách miền: `hmac(salt, 'messenger:psid:' + psid)`.

**Trả lời câu G30 — tuyệt đối không persist:** nội dung tố giác; mọi attachment URL (kể cả đã hết hạn — chúng là CDN có chữ ký và rò rỉ metadata); PSID thô ngoài phạm vi TTL vận hành; số CCCD/hộ chiếu/SĐT trích từ tin nhắn; và toàn văn tin nhắn trong nhánh sensitive kể cả ở diagnostic log. Lưu ý `isDiagnosticContentLogging()` (`api/chat.js:211`) hiện có lấy mẫu nội dung theo cửa sổ — **nhánh Messenger sensitive phải bỏ qua đường này hoàn toàn**, không phụ thuộc tỉ lệ lấy mẫu.

**Một rủi ro tài liệu chưa nêu:** attachment. §7 xếp `ATTACHMENT` → human, đúng. Nhưng payload webhook chứa URL attachment, và URL đó sẽ nằm trong object event mà code xử lý. Cần một bước **strip tường minh**: cắt bỏ mảng `attachments` khỏi mọi thứ đi vào log, telemetry, và tất nhiên vào RAG. Fail-closed ở tầng phân loại chưa đủ nếu payload thô vẫn chảy vào observability.

---

# META API REVIEW

**Giới hạn của review này, nói thẳng:** `developers.facebook.com` bị chặn bởi egress proxy của môi trường, nên tôi **không** xác minh được contract Meta từ nguồn gốc. Những gì dưới đây dựa trên nguồn thứ cấp và phải được kiểm lại tại thời điểm implement. Tôi không xác nhận F20–F25.

Đã xác nhận được từ nguồn thứ cấp:
- Ký bằng HMAC-SHA256 trên **raw body**, so sánh **constant-time**; nguyên nhân lỗi phổ biến nhất là dùng JSON đã parse thay vì raw body (đúng C3).
- Meta kỳ vọng phản hồi trong vài giây; quá thì đánh dấu fail và retry với exponential backoff, thử lại trong khoảng 24–36 giờ.

**Còn phải tự xác minh trước khi code (F20–F25):** tên header chữ ký hiện hành và tiền tố của nó; Graph API version nên pin; deadline ACK chính xác; ngữ nghĩa retry; permission chính xác cho Page Messenger; yêu cầu App Review / Business Verification; messaging window 24h và các ngoại lệ.

**Bổ sung vào §5.3:** webhook field phải gồm `messages` **và `message_echoes`** (theo C5). Đây là thay đổi cấu hình chủ dự án thực hiện ở Phase M6, nên phải có trong tài liệu hướng dẫn từ bây giờ, không phát hiện muộn.

---

# VERCEL / ASYNC REVIEW

Đã xác minh: **công việc trong `waitUntil` vẫn tính vào `maxDuration`** — nó hoãn so với response, không hoãn so với invocation, và vẫn tính Active CPU billing.

Trả lời trực tiếp nhóm câu B:

- **B5 — waitUntil có đủ không?** Đủ cho MVP, **có điều kiện**: deadline RAG riêng 20–25s, `maxDuration` 60 cho route webhook, và bất biến `ack + rag + send < maxDuration` được kiểm bằng test. Không đủ nếu bê nguyên ngân sách 55s của web.
- **B6 — retry Send API đặt ở đâu?** Trong cùng invocation, backoff giới hạn, tổng ngân sách ≤ 10s. Không retry xuyên invocation ở MVP.
- **B7 — chống double-send?** Bản ghi outbox khoá theo `mid` chuyển trạng thái `PENDING → SENT`, dùng cùng ETag CAS như rate limit. Chuyển sang SENT **trước** khi trả kết quả cho lần retry kế tiếp của Meta.
- **B8 — cần transactional outbox ngay MVP?** Cần **outbox**, không cần **transactional**. Một bản ghi trạng thái khoá theo `mid` cho ta phát hiện mất tin và chống double-send. Queue bền vững là scope của Phase sau, và chỉ nếu metric `rag_deadline_exceeded` chứng minh là cần.

---

# RAG REFACTOR REVIEW

Trả lời nhóm câu A:

- **A1 — refactor ngay thành `rag-engine.js` hay bóc từng primitive?** Cả hai đều sai hướng. Các primitive **đã** bóc rồi (`api/chat.js:3145-3161`, `lib/retrieval-governance.js`, `lib/output-validator.js`). Cái kẹt là phần điều phối dính `res`. Làm **sink inversion** (C1) — đó là thao tác nhỏ nhất mở khoá được mọi thứ.
- **A2 — boundary tối ưu giữa HTTP adapter và domain?** Chính là ranh giới sink. Adapter sở hữu: xác thực, transport, định dạng đầu ra. Core sở hữu: classify → retrieve → govern → generate → validate, và phát ra sự kiện chứ không phát ra byte.
- **A3 — một `ask()` hay nhiều service nhỏ?** Một `ask()`, nhưng là *kết quả* của sink inversion chứ không phải mục tiêu tự thân. `ask() = core + BufferSink`.
- **A4 — abstraction `channel` sâu tới đâu?** Gần như bằng không trong RAG core. Core không cần biết mình đang phục vụ kênh nào. Kênh chỉ quyết định (a) sink nào, (b) formatter nào ở đầu ra. Một tham số `channel` truyền vào core để "core tự xử lý khác đi" chính là overengineering mà A4 lo — và tệ hơn, nó là con đường để logic Messenger rò vào domain, đúng thứ §11 cấm.

**Bất biến bắt buộc cho M1:** output SSE của website phải **giống hệt từng byte** trước và sau refactor. Thêm một test chụp lại chuỗi sự kiện SSE cho vài câu hỏi cố định, chạy trên `c6e9fa5`, lưu làm golden, và bắt buộc khớp sau refactor. Không có test này thì M1 không có gate thật.

---

# HUMAN HANDOFF REVIEW

- **E16 — cần Handover Protocol native cho MVP?** Không. `message_echoes` + cờ nội bộ đủ, ít bề mặt hơn, không cần thêm permission.
- **E17 — tránh bot và cán bộ cùng trả lời?** Qua echo (C5). Đây là câu trả lời duy nhất đáng tin; mọi phương án khác đều là suy đoán.
- **E18/E19 — resume theo điều kiện nào?** Yêu cầu cán bộ **resume tường minh**. Không timeout. Rủi ro của timeout không đối xứng: bot tự bật lại giữa cuộc trao đổi nhạy cảm tệ hơn nhiều so với việc một hội thoại nằm ở PAUSED lâu hơn cần thiết.

**Khoảng trống §16 chưa nêu:** khi chuyển `AUTO → PAUSED_FOR_HUMAN`, ai báo cho cán bộ biết có việc đang chờ? Nếu không có, tin nhắn nhạy cảm rơi vào im lặng — tệ hơn cả không có bot, vì người dân đã nhận acknowledgment tự động và tưởng đã được tiếp nhận. MVP cần tối thiểu: hội thoại PAUSED phải hiển thị được trong Business Suite như tin chưa đọc, và acknowledgment tất định phải nói rõ *"cán bộ sẽ phản hồi trong giờ làm việc"* chứ không được ngụ ý đã tiếp nhận xong. Repo đã có `sendTelegramAlert` trong `lib/request-security.js` — dùng được làm kênh cảnh báo vận hành cho nhánh sensitive.

---

# STORAGE / IDEMPOTENCY REVIEW

Trả lời nhóm câu C — **không thêm store mới.** Repo đã có hai store và một trong hai đúng chính xác thứ cần:

- **C9 — lưu ở đâu?** Firebase RTDB, dùng lại pattern `reserveRateLimitCounter` (`api/chat.js:362-389`). Firestore đang dùng cho telemetry, giữ nguyên vai trò đó. Vercel storage sẽ là dependency thứ ba không có lý do.
- **C11 — có race trong serverless multi-instance không?** Có, và repo **đã giải quyết**: `readRateLimitSnapshot`/`putRateLimitSnapshot` (`api/chat.js:339-361`) dùng ETag compare-and-swap, retry khi 412. Đây là CAS thật, không phải read-then-write. Dedup, outbox và rate-limit theo user đều dùng chung được primitive này. Test đồng thời hiện có (theo `04-current-tasks.md`, 50 request cùng IP chỉ nhận đúng số slot) chứng minh nó chịu được tải song song.
- **C10 — TTL/data model tối thiểu:**

```
messenger/dedup/<mid>              { at }                        TTL 24h  (>= cửa sổ retry của Meta)
messenger/outbox/<mid>             { state, at }                 TTL 24h
messenger/state/<user_key>         { mode, ctx[], last_mid, exp } TTL 30 phút, ctx tối đa 6 lượt
messenger/rate/<date>/<user_key>   { count, last }               TTL cuối ngày
```

`user_key = hashForLog('messenger:psid:' + psid)`. Không có PSID thô ở bất kỳ khoá nào.

**TTL dedup 24h là điểm cần chú ý:** nguồn thứ cấp cho biết Meta retry tới 24–36 giờ. TTL dedup phải **≥ cửa sổ retry**, nếu không một retry muộn sẽ được xử lý lại như tin mới và người dân nhận câu trả lời lặp. Nếu xác minh được con số 36h thì đặt TTL 48h. Chi phí lưu là không đáng kể; chi phí gửi trùng cho người dân thì có.

---

# RECOMMENDED ARCHITECTURE

```
                    api/chat.js                api/messenger/webhook.js
                 (website adapter)               (messenger adapter)
                         │                                │
              CORS·Turnstile·HMAC·IP            raw body → HMAC Meta (timingSafeEqual)
                         │                      dedup(mid) → rate(user_key) → echo check
                         │                                │
                         │                        ┌───────▼────────┐
                         │                        │ POLICY ROUTER  │  tất định, cục bộ
                         │                        │ cổng 1 denylist│  KHÔNG gọi model
                         │                        │ cổng 2 allowlist│
                         │                        └───────┬────────┘
                         │                       qua cả 2 │      còn lại → HUMAN
                         │                                │
                    SseSink                          BufferSink
                         └──────────────┬─────────────────┘
                                        ▼
                              ┌──────────────────┐
                              │    RAG CORE      │  không biết mình phục vụ kênh nào
                              │ classify→retrieve│
                              │ →govern→generate │
                              │ →validate        │  validator vẫn chạy tăng dần
                              │  phát sự kiện,   │
                              │  không phát byte │
                              └──────────────────┘
```

Thay đổi thực chất so với §4.2: policy router nằm **trước** RAG core và **trong** adapter Messenger, không phải một tầng ngang hàng. Và ranh giới chia đôi là **sink**, không phải một `ask()` giả định.

---

# RECOMMENDED PHASES / PR STACK

Trả lời nhóm câu I — **có, PR đầu đang quá lớn (I35).** §24 gộp refactor RAG + webhook + router + state + handoff vào một Draft PR. Không review nổi, và trộn lẫn "rủi ro cho website" với "code mới an toàn". Chia làm 4:

| PR | Nội dung | Gate | Rủi ro với website |
|---|---|---|---|
| **PR-1** | Sink inversion. Không có Messenger. Không có file mới trong `api/`. | Golden SSE byte-identical + `npm run ci` + regression không HARD_FAIL mới | **Đây là PR rủi ro duy nhất** — review riêng, merge riêng, để lắng vài ngày |
| **PR-2** | Adapter Messenger: webhook, raw-body signature, dedup, rate limit, Send API client. Meta I/O mock toàn bộ. Chưa nối RAG. | `MESSENGER_ADAPTER_LOCAL_PASS` | Không |
| **PR-3** | Policy router 2 cổng + trạng thái human + xử lý echo. | `MESSENGER_SAFETY_FAIL_CLOSED_PASS` | Không |
| **PR-4** | Nối router → RAG core → formatter → Send API. Feature flag. | `MESSENGER_RAG_E2E_MOCK_PASS` | Không |

**I36:** cách chia này giữ end-to-end vì PR-2 và PR-3 tự đứng được với mock, và không để kiến trúc nửa vời — PR-1 hoàn chỉnh về mặt boundary kể cả khi PR-2 không bao giờ tới.

**I37 — có nên hoãn conversation state / native handoff sang PR sau?** Hoãn **native handoff**: có, không cần cho MVP (E16). Hoãn **conversation state**: không nên. Ví dụ ở §15 ("Tôi bị mất" → cần biết đang nói về đổi căn cước) chính là ca phổ biến nhất trên Messenger. Thiếu context, tỉ lệ low-confidence handoff sẽ cao tới mức pilot không đo được gì có ý nghĩa. Bounded state 6 lượt / TTL 30 phút là rẻ — giữ trong PR-4.

---

# TEST MATRIX

Giữ toàn bộ §22, bổ sung những ca thiếu — đây là các ca bắt được đúng những lỗi mà phần còn lại của bộ test sẽ bỏ sót:

| # | Ca test | Bắt lỗi gì | Gate |
|---|---|---|---|
| T1 | Chữ ký hợp lệ trên payload **tiếng Việt có `\u` escape**, byte-identical bản ghi Meta thật | C3 — ca hỏng số một | PR-2 |
| T2 | Payload chỉ khác nhau ở **whitespace** nhưng chữ ký đúng → phải PASS (chứng minh dùng raw bytes, không re-serialize) | C3 | PR-2 |
| T3 | Golden SSE byte-identical trước/sau refactor, ≥ 5 câu hỏi cố định | C1 — regression website | PR-1 |
| T4 | Bất biến ngân sách: `ack + rag_deadline + send_budget < maxDuration` | C2 | PR-2 |
| T5 | Timeout RAG → outbox ở `PENDING`, metric `rag_deadline_exceeded` tăng, **không** gửi câu trả lời cụt | C2 | PR-4 |
| T6 | Echo có `app_id` của ta → bỏ qua; echo không có `app_id` → `PAUSED_FOR_HUMAN` | C5 | PR-3 |
| T7 | Trong `PAUSED_FOR_HUMAN`, tin nhắn **công khai vô hại** vẫn **không** được auto-reply | C5 — cấm bot giành lại quyền | PR-3 |
| T8 | Tin nhắn hợp lệ **không khớp allowlist** → HUMAN (không phải RAG) | C4 — chứng minh fail-closed, không phải fail-open | PR-3 |
| T9 | Với **mọi** ca sensitive: `fetch` tới DeepSeek/Gemini **không được gọi lần nào** — spy ở tầng `fetch`, không ở tầng hàm | §22.4, siết chặt hơn | PR-3 |
| T10 | Attachment URL không xuất hiện trong log, telemetry, prompt — kể cả khi `isDiagnosticContentLogging` trả true | Khoảng trống privacy | PR-3 |
| T11 | Retry dedup ở giờ thứ 25 → vẫn no-op (TTL ≥ cửa sổ retry Meta) | C10 — gửi trùng | PR-2 |
| T12 | Hai POST **đồng thời** cùng `mid` → đúng một lần gửi | Race CAS | PR-2 |
| T13 | Thiếu `MESSENGER_HASH_SALT` ở preview/production → 503, không dùng salt dự phòng | Song song `isChatLogSaltConfigured` | PR-2 |
| T14 | `MESSENGER_ENABLED` thiếu/sai định dạng → OFF (fail-closed, không fail-open) | §18 | PR-2 |

**Lưu ý về T9:** §22.4 yêu cầu assert "external model function was NOT called". Đặt spy ở tầng **`fetch`**, không ở tầng hàm wrapper — nếu không, một đường gọi mới nào đó lách qua wrapper sẽ không bị bắt. Đây là assertion quan trọng nhất trong toàn bộ dự án; đặt nó ở đúng tầng.

---

# MANUAL OWNER STEPS

Giữ nguyên §24 phần "Chủ dự án phải làm thủ công", bổ sung ba mục:

1. **Subscribe `message_echoes`** cùng với `messages` khi cấu hình webhook (C5). Nếu thiếu, chống collision không hoạt động — và sẽ không có lỗi nào báo ra, bot chỉ đơn giản là trả lời chồng lên cán bộ.
2. **Quyết định về DeepSeek (H1).** Xác nhận có ý thức rằng nội dung Messenger công khai đi qua DeepSeek, và ghi quyết định vào `docs/brain/03-decisions.md`. Đây là quyết định của chủ dự án, không phải mặc định kỹ thuật.
3. **Xác nhận quy trình trực inbox** cho hội thoại `PAUSED_FOR_HUMAN`: ai trực, trong giờ nào, và acknowledgment tất định nói gì. Không có phần này, nhánh sensitive chuyển "AI trả lời sai" thành "không ai trả lời" — với một Trang Công an, đó chưa chắc đã là cải thiện.

---

# GO / NO-GO GATES

Giữ Gate A–F của §23. Sửa và bổ sung:

- **Gate A** thêm: boundary được chốt là **sink inversion**, không phải `ask()` bóc tách. Golden SSE test tồn tại và xanh.
- **Gate B** thêm: T1–T14 xanh. Đặc biệt T9 phải spy ở tầng `fetch`.
- **Gate C** thêm: bất biến ngân sách thời gian (T4) được kiểm trên cấu hình Preview thật, không phải chỉ trong unit test.
- **Gate D** thêm: chữ ký xác minh thành công trên tin nhắn **tiếng Việt có dấu** thật — không phải "hello". Đây là điểm mà C3 sẽ lộ ra nếu chưa được sửa.
- **Gate E** thêm: cán bộ trả lời tay trong Business Suite → quan sát thấy bot dừng (T6/T7 trên hệ thống thật).
- **Gate F**: giữ nguyên, chỉ chủ dự án quyết định.

---

# TRẢ LỜI 37 CÂU HỎI Ở §29

| # | Trả lời ngắn |
|---|---|
| A1 | Không làm cả hai. Sink inversion — primitive đã bóc sẵn rồi, chỗ kẹt là `res`. |
| A2 | Ranh giới sink. Adapter giữ transport + xác thực + định dạng; core phát sự kiện. |
| A3 | Một `ask()`, nhưng là hệ quả của sink inversion, không phải mục tiêu. |
| A4 | Gần bằng không. Kênh chỉ chọn sink + formatter. Truyền `channel` vào core là overengineering và là đường rò logic. |
| B5 | Đủ cho MVP **có điều kiện**: deadline riêng 20–25s + bất biến ngân sách có test. |
| B6 | Cùng invocation, backoff giới hạn, ngân sách ≤ 10s. |
| B7 | Outbox khoá `mid`, `PENDING → SENT` qua ETag CAS. |
| B8 | Cần outbox, **không** cần transactional. Queue để sau, nếu metric chứng minh cần. |
| C9 | Firebase RTDB, tái dùng `reserveRateLimitCounter`. Không thêm store thứ ba. |
| C10 | 4 khoá, xem mục Storage. Dedup TTL ≥ cửa sổ retry Meta (24–48h). |
| C11 | Có race, nhưng repo **đã** giải quyết bằng ETag CAS + retry 412. |
| D12 | Deterministic + rule-based là **đủ** — nhưng phải là allowlist-first, không phải denylist. |
| D13 | **KHÔNG.** Classifier LLM chạy trước khi biết nội dung nhạy cảm → gửi 100% traffic ra ngoài → vô hiệu hoá §8.2. |
| D14 | Hai cổng: denylist chặn trước, allowlist cho phép, mặc định là HUMAN. Tái dùng `hasObviousPii` / `detectPromptInjection` / `tthc-index` / `published-locations`. |
| D15 | Một câu tất định đã duyệt, ưu tiên số khẩn cấp, chuyển human ngay. Không phân tích, không RAG, không phân loại mức độ. |
| E16 | Không cần Handover Protocol native cho MVP. |
| E17 | `message_echoes` — cơ chế duy nhất đáng tin. |
| E18 | Resume tường minh bởi cán bộ. |
| E19 | Có — timeout sai vì rủi ro không đối xứng. |
| F20–F25 | **Chưa xác minh được** trong môi trường này (egress chặn `developers.facebook.com`). Phải kiểm từ docs chính thức trước khi code. Đổi nguồn khỏi Postman (H2). |
| G26 | Đủ. Tái dùng `hashForLog` (`api/chat.js:89`). |
| G27 | State 30 phút; dedup/outbox ≥ cửa sổ retry Meta; metric 30 ngày, diagnostic 7 ngày (theo mặc định hiện có). |
| G28 | Không. Cùng RTDB, khác namespace khoá. |
| G29 | Có — `hashForLog`, `buildTelemetryRetention`, `isTelemetryExpired`, `reserveRateLimitCounter`, guard `isChatLogSaltConfigured`. |
| G30 | Xem mục Security/Privacy. Chú ý riêng attachment URL và `isDiagnosticContentLogging`. |
| H31 | Golden SSE byte-identical + `npm run ci` + regression grader không HARD_FAIL mới so với `c6e9fa5`. |
| H32 | **Có, bắt buộc** — và fixture phải là tiếng Việt có `\u` escape (T1). |
| H33 | Có nhưng nhẹ: 4xx/429/5xx/timeout là đủ cho MVP. Chaos đầy đủ là quá sức pilot. |
| H34 | Thiếu T3, T4, T5, T7, T8, T10, T11, T13, T14 — xem Test Matrix. |
| I35 | **Có, quá lớn.** Chia 4 PR. |
| I36 | PR-1 sink (rủi ro website, review riêng) → PR-2 adapter → PR-3 router → PR-4 tích hợp. |
| I37 | Hoãn native handoff: có. Hoãn conversation state: **không** — nó quyết định pilot có đo được gì không. |

---

# FINAL RECOMMENDATION

**Duyệt hướng đi, chặn việc bắt đầu code cho tới khi 5 mục blocking được sửa trong tài liệu.**

Cụ thể, trước khi giao AGENTS:

1. Viết lại **§10 + §11** theo sink inversion (C1).
2. Viết lại **§20** với ngân sách thời gian tường minh + yêu cầu outbox (C2).
3. Bổ sung **§12** yêu cầu raw-body và fixture tiếng Việt (C3).
4. Viết lại **§7** theo allowlist-first; trả lời D13 là KHÔNG (C4).
5. Sửa **§22.3 + §5.3**: `message_echoes` là primitive chống collision, không phải sự kiện cần bỏ qua (C5).
6. Sửa **§36**: provider hiện tại là DeepSeek, không phải Gemini (H1); đổi nguồn Meta khỏi Postman (H2).

Sau đó M0 → PR-1 và **dừng lại ở đó để chủ dự án review**. PR-1 là PR duy nhất có thể làm hỏng thứ đang chạy; nó xứng đáng được nhìn riêng, không lẫn vào 3.000 dòng code Messenger mới.

Một nhận xét cuối về mức độ kỹ lưỡng của tài liệu: các ràng buộc ở §32 và kỷ luật verdict ở §34 được viết rất tốt — chúng chống đúng những cách mà agent thường thất bại. Rủi ro thật của dự án này không phải AGENTS làm quá tay. Là ba giả định nền ở C1–C3: chúng nghe hợp lý, sẽ pass CI, và chỉ lộ ra ở Gate D với một Trang Công an thật đang nối vào.

---

## Nguồn

- Repo, đã kiểm chứng trực tiếp: `api/chat.js`, `lib/request-security.js`, `lib/retrieval-governance.js`, `lib/output-validator.js`, `vercel.json`, `package.json`, `.github/workflows/ci.yml`, `docs/brain/01-architecture.md`, `docs/brain/04-current-tasks.md`
- [Vercel Functions Limits](https://vercel.com/docs/functions/limitations) · [Configuring Maximum Duration](https://vercel.com/docs/functions/configuring-functions/duration) · [@vercel/functions API Reference](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package)
- [Background Jobs on Vercel in 2026: waitUntil, Queues, Workflow, Cron](https://dev.to/ahmed_mahmoud360/background-jobs-on-vercel-in-2026-field-notes-on-waituntil-queues-workflow-and-cron-1l6g)
- [Webhook signature verification: a practical HMAC-SHA256 guide](https://www.pontil.com/blog/webhook-signature-verification-a-practical-hmac-sha256-guide) · [Facebook Messenger Webhook: 2026 Dev Guide](https://messengerbot.app/facebook-messenger-webhook-setup-2026-developer-guide-for-receiving-and-responding-to-messages/)
- `developers.facebook.com` **không truy cập được** từ môi trường review này (egress proxy chặn) — F20–F25 chưa xác minh từ nguồn gốc.
