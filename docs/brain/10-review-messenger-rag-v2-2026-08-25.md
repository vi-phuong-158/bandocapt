# Review vòng 2: Kế hoạch thực thi V2 — Messenger × RAG (2026-08-25)

**Người review:** Claude Code · **Tài liệu nguồn:** `MESSENGER_RAG_EXECUTION_PLAN_V2_FOR_CLAUDE_REVIEW.md`
**Review vòng 1:** `docs/brain/09-review-messenger-rag-2026-08-25.md`
**Baseline:** đã fetch lại — `origin/main` vẫn là `c6e9fa5d972280e32e0564371a4a14b45ac9dd9a`, **không đổi** so với vòng 1. Golden SSE của PR-1 có thể sinh trên đúng SHA này.

---

# VERDICT

```
MESSENGER_EXECUTION_PLAN_V2_APPROVED_WITH_CHANGES
```

**PR-1 được phép bắt đầu ngay.** Không còn blocker nào chặn sink inversion.

Các blocker còn lại nằm ở PR-3 và PR-4. Chúng không cản PR-1, nên không có lý do gì phải dừng toàn bộ dự án để sửa tài liệu trước.

---

# C1–C5 CLOSURE CHECK

| Issue | Trạng thái | Evidence | Thay đổi bắt buộc |
|---|---|---|---|
| **C1** RAG core dính SSE | **CLOSED** | V2 §2/C1 + §PR-1 chấp nhận sink inversion, cấm bóc `ask()`, giữ incremental grounding, golden byte-identical. Đúng nguyên nhân gốc. | 3 điểm kỹ thuật bổ sung vào DoD PR-1 (xem N5 + PR-1 SINK REVIEW) |
| **C2** `waitUntil` / mất tin im lặng | **PARTIAL** | V2 thêm ngân sách thời gian + outbox `PENDING/SENT/FAILED`. Nhưng ACK-first ⇒ **không gì redeliver**, và §2/C2 + câu 9 vẫn để ngỏ sweeper/queue. Outbox làm mất tin *phát hiện được*, không *khôi phục được*. | **N1** — phải chốt cơ chế khôi phục trước PR-4 |
| **C3** Raw body / chữ ký | **CLOSED** | V2 §2/C3 đúng thứ tự `raw → verify → timingSafeEqual → parse`, cấm re-serialize, fixture tiếng Việt bắt buộc. | Thêm 1 test âm (N6b) |
| **C4** Router allowlist-first | **PARTIAL** | Nguyên tắc `default = HUMAN` đúng và §3 cấm đúng kiến trúc classifier-LLM. Nhưng primitive được chỉ định tái dùng **sai cả hai chiều** (N2), và đầu ra nhị phân quá thô (N3). | **N2**, **N3**, **N4** trước PR-3 |
| **C5** `message_echoes` | **CLOSED (điều kiện)** | V2 §2/C5 + §12 đúng, và đã đặt điều kiện "nếu contract Meta xác nhận" — đúng thái độ. | Gate D3 phải chặn **Page thật**, không chỉ chặn Pilot (xem N7) |

# H1–H3 CLOSURE CHECK

| Issue | Trạng thái | Ghi chú |
|---|---|---|
| **H1** Provider hiện tại | **CLOSED** | §2/H1 + §10 xử lý tốt hơn mong đợi: tách thành Decision P1 với 3 lựa chọn A/B/C và cấm AGENTS tự chọn. Phương án C (Messenger chỉ retrieval/template, không generation) là bổ sung của V2, không có trong review vòng 1 — và là lựa chọn hợp lý nhất nếu owner không chấp nhận external generation. |
| **H2** Nguồn Meta API | **CLOSED** | §11 checklist 14 mục + trạng thái `META_CONTRACT_VERIFIED` / `_BLOCKED` + cấm code từ assumption. Chặt hơn đề xuất vòng 1. |
| **H3** Regression gate định lượng | **CLOSED** | §7 đúng, và bổ sung điều vòng 1 chưa nói: nếu baseline đổi thì **regenerate golden**, không dùng golden cũ. |

---

# ISSUES MỚI — VÒNG 2

## N1 — ACK-first + không có gì redeliver + không sweeper = mất tin vĩnh viễn, không ai biết

```
ID              N1
Severity        CRITICAL
Blocks PR-1?    NO
Blocks PR-2?    NO
Blocks PR-4?    YES
Blocks Pilot?   YES
```

**Issue.** V2 đóng C2 bằng ngân sách thời gian + outbox. Nhưng hai quyết định còn lại triệt tiêu nhau:

- §2/C2: *"Queue bền vững không nằm trong MVP trừ khi metric chứng minh cần"*
- Câu 9 (*"Có cần sweeper/reconciliation cho outbox PENDING ngay Pilot?"*) — để ngỏ

Khi đã `ACK 200`, **Meta không retry nữa**. Đó là toàn bộ ý nghĩa của việc ACK. Nên nếu invocation chết sau ACK, bản ghi nằm lại ở `PENDING` và **không có bất kỳ tác nhân nào trên đời sẽ đọc lại nó**. Outbox lúc này là một nhật ký mất mát, không phải cơ chế khôi phục.

**Impact.** §16 liệt kê `outbox_pending` là metric và Pilot fail nếu *"outbox PENDING bị bỏ quên không có quy trình kiểm tra"* — nhưng chính V2 lại chưa định nghĩa quy trình đó. Người dân nhắn tin, không nhận được gì, và hệ thống chỉ tăng một con số mà chưa ai được giao đọc.

**Evidence.**
```
vercel.json                   "api/chat.js": { "maxDuration": 60 }
Vercel docs (đã kiểm chứng)   waitUntil tính vào maxDuration
V2 §2/C2                      "Không coi waitUntil là queue hoặc durable workflow"  ← đúng
V2 §2/C2                      "Queue bền vững không nằm trong MVP"                  ← nhưng
V2 §26 câu 9                  sweeper để ngỏ                                        ← và
⇒ không có đường khôi phục nào tồn tại.
```

**Required fix — chọn một trong hai, không được để ngỏ:**

**Phương án 1 (khuyến nghị) — Để Meta làm queue.** Không ACK trước. Xử lý đồng bộ trong ngân sách ACK của Meta, ACK sau khi Send API xong. Thất bại/timeout → trả non-2xx → **Meta tự retry** với backoff trong 24–36h. Không cần sweeper, không cần queue, không có đường mất tin im lặng. Điều kiện: `ack_deadline` của Meta ≥ `rag_deadline + send_budget`. **Con số này chưa xác minh được** — nó là mục quan trọng nhất trong checklist §11.

Phương án này yêu cầu dedup phải là **lease**, không phải cờ (xem STORAGE / RACE ANALYSIS): một bản ghi `IN_FLIGHT` đã hết hạn phải cho phép retry của Meta xử lý lại, nếu không retry sẽ bị chính dedup nuốt mất — và ta quay lại đúng chỗ mất tin.

**Phương án 2 — Giữ ACK-first, thì sweeper là bắt buộc ở Pilot, không phải tuỳ chọn.** Một cron quét `messenger/outbox` tìm `PENDING` quá hạn, gửi alert vận hành (có thể dùng `sendTelegramAlert` sẵn có trong `lib/request-security.js`). Trả lời câu 9 dứt khoát là **CÓ**, và sửa §2/C2 để nó không còn mâu thuẫn với §16.

Quyết định phụ thuộc ACK deadline thật của Meta ⇒ **N1 phải được chốt sau §11, trước khi viết PR-4.**

---

## N2 — `hasObviousPii` sai cả hai chiều; không dùng được làm block gate nếu chỉ "tái dùng"

```
ID              N2
Severity        CRITICAL
Blocks PR-1?    NO
Blocks PR-2?    NO
Blocks PR-3?    YES
Blocks Pilot?   YES
```

**Issue.** §PR-3 Stage 1 ghi *"Tái dùng hoặc mở rộng primitive hiện có: PII detection"*, và câu 14 hỏi `hasObviousPii` có đủ mạnh không. Tôi đã chạy thử trực tiếp trên source. Kết quả: **sai cả hai chiều**, và kiểu sai rất đặc trưng cho Messenger.

**Evidence.** Chạy nguyên văn `hasObviousPii` + `normalizeFaqQuestion` (`api/chat.js:681-698`):

```
hasObviousPii  Kỳ vọng               Câu
─────────────  ────────────────────  ─────────────────────────────────────────
false          PUBLIC (có dấu)       Cho tôi xin địa chỉ Công an phường Vân Phú
TRUE  ✗        PUBLIC (không dấu)    cho toi xin dia chi cong an phuong Van Phu
false          PUBLIC (có dấu)       Địa chỉ Công an xã Hy Cương ở đâu?
TRUE  ✗        PUBLIC (không dấu)    dia chi cong an xa Hy Cuong o dau
false          PUBLIC (có dấu)       Cho xin số điện thoại Công an phường
TRUE  ✗        PUBLIC (không dấu)    cho xin so dien thoai cong an phuong
true           SENSITIVE             Số CCCD của tôi là 001199012345
FALSE ✗        SENSITIVE             Tôi muốn tố giác ông A đã lừa đảo tôi
FALSE ✗        SENSITIVE             Toi muon to giac ong A da lua dao
```

**Nguyên nhân.** `normalizeFaqQuestion` (`:681`) chỉ `NFKC` + `toLowerCase` — **không bóc dấu**. Trong khi rule cuối là `/(email|sdt|so dien thoai|dia chi|address)/i` viết **không dấu**. Nên:

- Người gõ có dấu → không khớp → qua.
- Người gõ không dấu → khớp → **chặn**.

Cùng một câu hỏi, hai kết quả, khác nhau chỉ vì kiểu gõ. Trên Messenger di động, gõ không dấu là chuyện thường ngày.

**Impact — hai lớp:**

1. **False positive giết Pilot.** Hỏi địa chỉ trụ sở là ca dùng phổ biến nhất của `PUBLIC_LOCATION` — chính là một trong ba intent duy nhất được auto-reply ở Pilot (§13). Chặn nó về HUMAN nghĩa là Pilot đo được rất ít, và §16 sẽ ghi nhận `human_required` cao bất thường mà không rõ vì sao. Đây là câu trả lời trực tiếp cho câu 16.

2. **False negative nguy hiểm hơn.** `hasObviousPii` **không bắt tố giác** — vì tố giác không chứa pattern PII nào. Nghĩa là Gate 1 hoàn toàn không phòng thủ được nhóm nội dung nhạy cảm quan trọng nhất.

**Nguyên nhân sâu xa:** `hasObviousPii` được viết cho `shouldSkipFaqCache` (`:700`) — quyết định *có cache câu trả lời không*. Ở đó false positive tốn 0 đồng (chỉ là bỏ cache). Đem nguyên hàm đó sang làm cổng an toàn là **nhập khẩu một tỉ lệ false-positive được hiệu chỉnh cho một hàm chi phí hoàn toàn khác**.

**Required fix.**

1. **Không tái dùng `hasObviousPii` nguyên trạng.** Viết `messengerBlockGate()` riêng, có test riêng, giữ `hasObviousPii` nguyên vẹn cho FAQ cache (đừng sửa nó — nó đang đúng với mục đích của nó).
2. **Chuẩn hoá thống nhất.** Dùng `normalizeInjectionText` (`:1528`, có NFKD + bóc dấu + xoá zero-width) cho *toàn bộ* rule của cả hai cổng. Hiện `detectPromptInjection` bóc dấu còn `hasObviousPii` thì không — hai bộ dò cùng một cổng với hai cách chuẩn hoá khác nhau là lỗ hổng có thể đoán trước.
3. **Bỏ rule từ khoá chủ đề khỏi block gate.** `dia chi` / `so dien thoai` / `address` là *chủ đề công khai*, không phải PII. Chỉ giữ rule bắt **giá trị**: email, dãy số CCCD/hộ chiếu, SĐT cụ thể.
4. **Thêm bộ rule tố giác/khiếu nại riêng** (`tố giác`, `trình báo`, `tố cáo`, `lừa đảo tôi`, `bị mất trộm`, `khiếu nại`…, cả có dấu lẫn không dấu sau chuẩn hoá).
5. **Test T15 mới:** bộ fixture công khai gõ **không dấu** phải qua Gate 1; bộ fixture tố giác phải bị Gate 1 chặn. Cả hai chiều.

> Ghi chú tích cực: sự cố này chứng minh thiết kế allowlist-first của V2 là đúng. "Tôi muốn tố giác ông A" lọt Gate 1, nhưng **Gate 2 chặn nó** vì không khớp thủ tục/trụ sở/FAQ nào. Nếu V2 vẫn theo denylist như bản brief đầu, câu tố giác đó đã đi thẳng vào DeepSeek. Gate 2 mới là chỗ gánh trách nhiệm an toàn thật.

---

## N3 — Đầu ra nhị phân `RAG_ALLOWED | HUMAN_REQUIRED` quá thô; ép chọn giữa hai điều đều tệ

```
ID              N3
Severity        HIGH
Blocks PR-3?    YES
Blocks Pilot?   YES
```

**Issue.** §PR-3 Stage 3 chỉ có hai kết quả. Nhưng "trượt allowlist" và "nội dung nhạy cảm" là hai việc khác hẳn nhau, và §PR-3 lại liệt kê `policy uncertainty` vào danh sách chuyển `AUTO → PAUSED_FOR_HUMAN`.

Ghép hai điều đó lại thì: **một câu hỏi lạc đề bất kỳ sẽ khoá vĩnh viễn hội thoại.** Vì §PR-3 cũng quy định không auto-resume bằng TTL, và resume cần thao tác vận hành tường minh.

**Impact.** Người dân nhắn "Chào shop" hoặc hỏi một thủ tục ngoài phạm vi → conversation vào `PAUSED_FOR_HUMAN` → mọi câu hỏi công khai hợp lệ sau đó đều không được trả lời, cho tới khi có người can thiệp thủ công. Pilot sẽ tích luỹ hội thoại chết. Nếu chọn hướng ngược lại (không pause) thì câu lạc đề đó vẫn nằm trong lịch sử và rò ra ngoài theo N4.

**Required fix.** Ba kết quả, không phải hai:

```
RAG_ALLOWED       → RAG
HUMAN_REQUIRED    → PAUSED_FOR_HUMAN   (nhạy cảm / attachment / xin gặp người / human echo)
OUT_OF_SCOPE      → trả lời tất định đã duyệt, GIỮ NGUYÊN trạng thái AUTO,
                    và KHÔNG ghi lượt này vào ctx
```

`OUT_OF_SCOPE` không phải nhánh fail-open: nó vẫn không gọi RAG, không gọi model. Nó chỉ tách "tôi không hỗ trợ nội dung này" khỏi "việc này cần con người". Repo đã có sẵn câu trả lời tất định cho đúng tình huống này: `getOutOfScopeReply()` (`api/chat.js:1658`), đã đa ngôn ngữ.

---

## N4 — Đường rò external LLM là `ctx`/history, không phải tin nhắn hiện tại — và trên Messenger nó là ca thường trực

```
ID              N4
Severity        HIGH
Blocks PR-3?    YES
Blocks PR-4?    YES
```

**Issue.** Câu 23–25 hỏi rất đúng chỗ: safety gate có phải nằm trước *mọi* external call không? Tôi đã trace thứ tự thật trong handler.

**Evidence — các external call chạy TRƯỚC generation, theo đúng thứ tự source:**

```
api/chat.js:2110   summarizeHistory(safeHistory, …)          ← gửi TOÀN BỘ history
                   khởi động như promise NGAY, trước cả FAQ cache và mọi retrieval
api/chat.js:2152   rewriteFollowUpQuery(searchQuery, prevUserText, …)  ← gửi tin nhắn TRƯỚC ĐÓ
api/chat.js:2174   translateQueryForRetrieval(searchQuery, …)
api/chat.js:631    gemini-embedding-001:embedContent          ← embedding
api/chat.js:2283   activeIndex.query(options)                 ← Pinecone
api/chat.js:2379   rerankWithProvider(standaloneQuery, …)
                   … rồi mới tới generation
```

Vậy là **4 lời gọi LLM ngoài + 1 embedding chạy trước generation**, và hai trong số đó nhận *lịch sử hội thoại*, không phải câu hỏi hiện tại.

**Impact.** Kiến trúc §3 của V2 đặt gate trước khi vào core — **đúng, và điều đó đóng được đường rò của tin nhắn hiện tại**. Nhưng nó không đóng được `ctx`. Lượt N khớp allowlist và được vào core; core lập tức gửi `ctx` cho `summarizeHistory` và `prevUserText` cho `rewriteFollowUpQuery`. Nếu một lượt nhạy cảm từng lọt vào `ctx`, nó rời hệ thống ở lượt N, dù lượt N hoàn toàn vô hại.

Điều làm nó nghiêm trọng trên Messenger: `rewriteFollowUpQuery` chỉ chạy khi câu hỏi **dưới 8 từ** (`:2145`). Trên Messenger, câu dưới 8 từ (*"Tôi bị mất"*, *"ở đâu ạ"*, *"bao nhiêu tiền"*) là **kiểu nhắn tin mặc định**, khác hẳn website nơi người dùng gõ câu dài hơn. Nên bất biến "không ghi tin nhạy cảm vào ctx" không phải điều khoản dự phòng — nó chịu tải ở gần như mọi lượt.

**Required fix.**

1. Bất biến: **chỉ lượt có kết quả `RAG_ALLOWED` mới được ghi vào `ctx`.** Lượt `HUMAN_REQUIRED` và `OUT_OF_SCOPE` không bao giờ được ghi.
2. `history` truyền vào core **phải dựng từ `ctx` đã lọc**, tuyệt đối không dựng lại từ luồng hội thoại thô của Meta.
3. **Chuyển conversation state từ PR-4 sang PR-3** (trả lời câu 31). Đây là bất biến an toàn, và test của nó phải nằm cùng bộ fail-closed của PR-3. Để ở PR-4 thì bộ test an toàn của PR-3 không thể phủ đường rò ctx — mà đó là đường rò tinh vi nhất trong toàn bộ thiết kế. Lưu trữ và sử dụng ctx có thể ở PR-4; **chính sách ghi ctx thuộc PR-3.**
4. **Test T16 mới:** lượt 1 nhạy cảm (bị chặn) → lượt 2 công khai hợp lệ → assert số lời gọi `fetch` ra provider chứa văn bản lượt 1 = **0**. Đây là biến thể của T9 nhưng qua ranh giới lượt — T9 hiện tại chỉ kiểm một lượt đơn nên **không bắt được ca này**.

---

## N5 — Ba chi tiết transport phải nằm trong thiết kế PR-1, nếu không sẽ phải sửa lại sink ở PR-4

```
ID              N5
Severity        MEDIUM
Blocks PR-1?    NO (nhưng phải nằm trong thiết kế PR-1)
```

**(a) Heartbeat phải thuộc hẳn về `SseSink`.** `startSseHeartbeat(res)` (`:1824`) phụ thuộc `res.writableEnded`, `res.destroyed`, `res.once('close')`, `res.once('finish')` — vòng đời stream của Node. `BufferSink` không có gì trong số đó. Nếu core còn giữ `startHeartbeat`/`stopHeartbeat`, sink interface buộc phải mô phỏng vòng đời stream và abstraction hỏng ngay. Heartbeat là thuần transport: core chỉ báo "bắt đầu/kết thúc generation", `SseSink` tự quyết định có phát nhịp hay không.

**(b) Nhánh lỗi rẽ theo `res.headersSent`.** `api/chat.js:3136` chọn giữa `res.status(500).json(...)` và `res.write({error:'STREAM_ERROR'})` tuỳ đã gửi header hay chưa. Đây là trạng thái transport đang điều khiển logic xử lý lỗi. Sink phải sở hữu quyết định này (`sink.fail()` tự biết mình đã start hay chưa), không phải hỏi `res`.

**(c) `BufferSink` tuyệt đối không được đưa `err.message` ra người dùng.** Cả hai nhánh lỗi hiện tại đều trả `detail: err.message` cho client. Trên website, JS phía client không hiển thị nó. Trên Messenger, formatter mà render thẳng payload lỗi thì **một exception nội bộ sẽ được gửi tới người dân qua Trang Công an**. `BufferSink` phải map mọi lỗi về một câu tất định đã duyệt.

> Trả lời câu 51: **CÓ, cần golden cho error path.** Chính vì `sink.fail()` thay `res.status().json()` nên các nhánh 403/405/429/503 và nhánh 500/`STREAM_ERROR` là những chỗ dễ bị đổi âm thầm nhất. Golden PR-1 phải phủ: header SSE của `writeHead`, các JSON error body trước stream, nhịp heartbeat, hình dạng event `done`, và cả hai nhánh của `headersSent`.

---

## N6 — Dedup không được dùng lại ngữ nghĩa lỗi của rate limit

```
ID              N6
Severity        MEDIUM
Blocks PR-2?    YES
```

**(a)** Câu 33 hỏi CAS primitive có tái dùng được cho namespace Messenger tuỳ ý không. **Pattern thì có, hàm thì không.** `reserveRateLimitCounter` (`:362`) là một *bộ đếm có ngưỡng*, không phải máy trạng thái. `readRateLimitSnapshot`/`putRateLimitSnapshot` (`:339-361`) mới là primitive cần tái dùng — ETag CAS với `if-match`, và CAS trên etag của giá trị `null` cho phép *create-if-absent*, đúng thứ dedup cần.

**(b) Ngữ nghĩa thất bại phải khác.** `reserveRateLimitQuota` (`:391`) bắt mọi lỗi và trả `{ok:false, reason:'store_error'}` → rate limit **từ chối** (fail-closed). Đúng cho rate limit. **Sai cho dedup:** lỗi store khi claim mà coi như "đã xử lý rồi" thì tin nhắn biến mất. Lỗi store trên dedup phải → **trả non-2xx để Meta gửi lại**, không bao giờ được im lặng bỏ qua.

**(c)** Thêm test âm cho C3 (bổ sung T1/T2): dựng chữ ký từ `JSON.stringify(parsed)` của một payload tiếng Việt và assert verification **THẤT BẠI**. T1/T2 hiện chỉ chứng minh đường đúng chạy được; test âm mới chứng minh đường sai bị chặn — đó mới là thứ giữ cho bug reserialization không lặng lẽ quay lại.

---

## N7 — Gate D3 phải chặn Page thật, không chỉ chặn Pilot

```
ID              N7
Severity        MEDIUM
Blocks Pilot?   YES
```

Câu 19–21 hỏi rất đúng: có trường hợp cán bộ trả lời mà **không** sinh echo không? Có trường hợp bot echo **không** có `app_id` không? **Tôi không xác minh được** (xem mục Meta bên dưới), và V2 đã đúng khi đặt điều kiện.

Nhưng hệ quả vận hành thì phải nêu rõ: chống collision là **giả định chưa được kiểm chứng cho tới khi Gate D3 chạy trên hạ tầng Meta thật**. Vậy nên D3 không được nằm chung danh sách với các gate khác — nó phải là điều kiện chặn để **nối Trang thật có cán bộ đang trực**. Trước D3, chỉ dùng Trang thử nghiệm không có ai trả lời tay, khi đó collision không thể xảy ra về mặt vật lý.

**Trả lời câu 21 (fallback nếu echo không đáng tin):** không đi tìm cơ chế phát hiện thay thế — thu hẹp phơi nhiễm. Pilot chỉ trên Trang thử nghiệm cho tới khi echo được chứng minh trên hạ tầng thật.

---

# ARCHITECTURE REVIEW

Sơ đồ §3 đúng ở điểm quan trọng nhất: safety gate nằm **trước** khi vào core, nên toàn bộ 5 external call ở N4 đều nằm sau nó. Đây là điều duy nhất thực sự phải đúng, và nó đúng.

Ranh giới trách nhiệm ở §4 tốt. Danh sách "RAG core không được biết" (PSID, Page token, App Secret, signature, CORS, Turnstile, `MESSENGER_MODE`, `PAUSED_FOR_HUMAN`) là cách diễn đạt sắc hơn so với "channel abstraction gần bằng không" ở vòng 1 — nó phát biểu bất biến dưới dạng kiểm được, không phải dưới dạng lời khuyên.

Một điều chỉnh: sơ đồ §3 vẽ `BufferSink` nằm **sau** safety gate như một khối tuần tự. Thực tế `BufferSink` là *tham số truyền vào* core, không phải chặng trong đường ống. Nhỏ, nhưng vẽ sai dễ khiến người đọc sau tưởng có hai điểm nối. Trả lời câu 2: **`SseSink` + `BufferSink` là boundary đúng nhất** — nó cắt đúng chỗ duy nhất mà website và Messenger thực sự khác nhau (transport), và không cắt qua chỗ nào chúng phải giống nhau (grounding/validator).

---

# PR-1 SINK REVIEW

**Trả lời câu 3 — còn chỗ nào khiến sink inversion thành big-bang không?** Sau khi rà lại: **không**, với ba điều kiện của N5. Ba điểm dính transport (heartbeat, `headersSent`, `err.message`) đều cục bộ và đã xác định được vị trí chính xác. Không có chỗ nào trong pipeline đọc `req` sâu — `req` chỉ được dùng ở đoạn xác thực đầu handler, trước khi orchestration bắt đầu. Đó là lý do sink inversion khả thi: ranh giới `req` đã sạch sẵn, chỉ còn `res` phải xử lý.

**Trả lời câu 4 — golden SSE byte-identical có đủ không?** Chưa. Xem N5 phần cuối: cần golden cho header, các error body trước stream, heartbeat, hình dạng `done`, và cả hai nhánh `headersSent`.

**Trả lời câu 50 — fixture golden nên ở tầng nào?** Ở tầng `handler(req, res)` với `res` giả lập ghi lại chuỗi byte, đúng như `test/p0-fixes.test.js:31 createResponse()` đang làm. Toàn bộ I/O ngoài (Pinecone, provider, Firebase) mock tất định. Không golden ở tầng HTTP thật — sẽ flaky. Repo đã có sẵn khuôn này, không cần dựng hạ tầng test mới.

**Trả lời câu 32 — có cần "để lắng vài ngày" sau PR-1 không?** Cách diễn đạt của tôi ở vòng 1 không chính xác — thời gian trên lịch không phải là cơ chế. Thứ thực sự cần là: CI + golden xanh, **một bản Preview deploy được người thật bấm thử trên giao diện chat website**, và owner ký. Đủ ba thứ đó thì merge, không cần chờ.

---

# ASYNC / OUTBOX STATE MACHINE

**Trả lời câu 6, 7, 35, 36, 37.**

`PENDING / SENT / FAILED` của V2 thiếu hai thứ: **lease** (nếu không, một `PENDING` do crash sẽ chặn vĩnh viễn mọi lần xử lý lại) và **`SENDING`** (nếu không, không phân biệt được "chưa gọi Send API" với "đã gọi, chưa biết kết quả").

**Câu 35 — dedup và outbox có nên là một record không? CÓ.** Gộp lại sẽ xoá hẳn một crash window (khoảng giữa "claim dedup" và "ghi outbox"). Một record, một CAS, một nguồn sự thật:

```
messenger/inbox/<mid>
{ state, lease_until, attempts, updated_at, last_error_class }

IN_FLIGHT  → đang xử lý, có hạn lease
SENDING    → đã gọi Send API, chưa xác nhận
SENT       → đã xác nhận 2xx (trạng thái cuối)
FAILED     → hết số lần thử (trạng thái cuối, có alert)
```

**Câu 36 — crash windows:**

| Crash tại | Bản ghi còn lại | Hệ quả | Xử lý |
|---|---|---|---|
| Sau claim, trước outbox | *không tồn tại* — đã gộp làm một | — | N/A sau khi gộp |
| Sau `IN_FLIGHT`, trước RAG xong | `IN_FLIGHT`, lease hết hạn | Chưa gửi gì | Meta retry (PA1) hoặc sweeper (PA2) đòi lại lease, `attempts++` |
| Sau Send API 2xx, trước ghi `SENT` | `SENDING`, lease hết hạn | **Nhập nhằng thật** — đã gửi hay chưa? | Xem dưới |
| Sau `SENT`, trước hết invocation | `SENT` | Đúng | Retry no-op |

**Câu 7 — đánh dấu `SENT` trước hay sau Meta 2xx? SAU.** Đánh dấu trước thì crash giữa chừng để lại bản ghi `SENT` cho một tin **chưa bao giờ được gửi** — mất tin vĩnh viễn, và không đối tượng nào phát hiện được vì bản ghi trông đã xong. Đánh dấu sau thì crash để lại `SENDING` — nhập nhằng, nhưng **phát hiện được**.

Giải quyết nhập nhằng bằng một quyết định chính sách tường minh: khi đòi lại một lease `SENDING`, **gửi lại**. Với nội dung công khai, một câu trả lời trùng gây phiền; một câu trả lời không bao giờ đến, trên Trang Công an, là hỏng dịch vụ. Chọn at-least-once, và ghi lý do vào decision log. Thu hẹp cửa sổ bằng cách ghi `SENT` ngay sau 2xx, không xen bất kỳ việc gì ở giữa.

**Câu 37 — máy trạng thái an toàn nhất cho MVP:**

```
nhận event
   │
   ├─ CAS claim messenger/inbox/<mid>
   │     SENT                        → ACK, no-op
   │     FAILED                      → ACK, no-op
   │     IN_FLIGHT/SENDING còn hạn   → ACK, no-op   (trùng đồng thời)
   │     IN_FLIGHT/SENDING hết hạn   → đòi lại, attempts++
   │     không tồn tại               → tạo IN_FLIGHT
   │     lỗi store                   → NON-2xx, để Meta gửi lại   ← N6b
   │
   ├─ safety gate → RAG → format
   ├─ CAS → SENDING
   ├─ Send API
   └─ CAS → SENT  (hoặc attempts >= N → FAILED + alert)
```

**Câu 8 — còn nên dùng `waitUntil` không?** Phụ thuộc ACK deadline của Meta, và đó là lý do N1 chưa chốt được. Nếu deadline đủ rộng, **xử lý đồng bộ đơn giản hơn và bền hơn**: Meta trở thành hàng đợi bền vững miễn phí, không cần sweeper, không có đường mất tin im lặng. `waitUntil` chỉ nên chọn khi §11 chứng minh deadline không cho phép — và khi đó sweeper là bắt buộc.

**Câu 9 — cần sweeper ở Pilot không?** Nếu chọn phương án ACK-first: **CÓ, bắt buộc.** Nếu chọn xử lý đồng bộ: **không**, retry của Meta đã lo.

---

# RAW BODY / META SIGNATURE

C3 đóng đúng. Thứ tự ở §2/C3 chính xác và §23 DoD PR-2 nhắc lại được.

**Câu 10 — còn ràng buộc runtime nào trên Vercel chưa nêu?** Có một điều cần nói tường minh thay vì để dạng "xử lý riêng cho route này" (§2/C3): với Node runtime của Vercel, `req.body` được điền sẵn và **stream đã bị tiêu thụ**. Không thể vừa đọc `req.body` vừa đọc raw ở cùng một route. Phải tắt body parsing cho route webhook và tự đọc stream — nếu không, `req.on('data')` sẽ không nhận được gì và code sẽ âm thầm rơi về `JSON.stringify(req.body)`, tức là chính bug C3 quay lại qua cửa sau. Cần một dòng trong §23 DoD: *"raw body được đọc từ stream, đã xác nhận `req.body` là `undefined` trên route này"*.

**Câu 11 — T1/T2 đủ chưa?** Gần đủ — thiếu test âm, xem N6c.

**Câu 12 — có cần mô tả route config tường minh hơn không?** Có, theo câu 10.

---

# SAFETY GATE REVIEW

Xem N2, N3, N4. Nguyên tắc đúng, primitive được chỉ định thì không.

**Câu 13 — two-stage gate đã thực sự fail-closed chưa?** Về *cấu trúc*: có — `default = HUMAN` và Gate 2 dương tính là đúng hình dạng. Về *thực thi*: chưa, chừng nào Stage 1 còn tựa vào `hasObviousPii` nguyên trạng (N2) và ctx chưa có bất biến ghi (N4).

**Câu 15 — allowlist nên dựa vào gì?** Ba tầng, giảm dần độ chính xác, tất định cả ba:

1. Khớp chính xác `procedure_id`/title/alias trong `data/tthc-index.json` (repo đã có `resolveProcedureId`/`openByTitle` trong `js/tthc-catalog.js`).
2. Khớp tên/alias trụ sở trong `lib/published-locations.js` (module này đã có sẵn logic hợp nhất alias).
3. Danh sách FAQ do owner duyệt, đối chiếu sau khi chuẩn hoá bằng `normalizeInjectionText`.

**Câu 17 — tăng recall công khai mà không fail-open bằng cách nào?** Đừng đoán — **đo**. Đó chính là công dụng của SHADOW mode (§13) mà V2 chưa nói ra: chạy gate trên traffic thật, **chỉ ghi quyết định, không gửi gì**, rồi chỉnh allowlist theo phân phối câu hỏi quan sát được. Mở rộng allowlist dựa trên dữ liệu thật không phải fail-open; đoán mò allowlist mới là. Đề xuất bổ sung một gate: `MESSENGER_SHADOW_RECALL_MEASURED` trước khi vào Pilot, kèm một con số recall tối thiểu do owner chấp nhận.

---

# PROVIDER / DATA BOUNDARY

**Câu 23 — gate phải nằm trước mọi external embedding call, đúng không? ĐÚNG** — và rộng hơn thế. Xem N4: có **4 external LLM call + 1 embedding** trước generation, và hai trong số đó nhận history chứ không phải câu hỏi hiện tại.

**Câu 24 — có chỗ nào call xảy ra trước điểm dự kiến đặt gate không?** Không, *với điều kiện* gate nằm trước khi vào core như §3 vẽ. Trong core thì `summarizeHistory` (`:2110`) là call sớm nhất — khởi động như promise trước cả FAQ cache. Nghĩa là **không có chỗ nào bên trong core để cài gate**; nó bắt buộc phải nằm ngoài. §3 đúng.

**Câu 25 — external utility call nào dễ bị bỏ sót?** Cả bốn: `summarizeHistory`, `rewriteFollowUpQuery`, `translateQueryForRetrieval`, `rerankWithProvider`. Chúng đi qua `callUtilityText` (`:933`) chứ không qua đường generation, nên bất kỳ spy nào cắm ở tầng generation sẽ **bỏ lọt hết**. Đây chính là lý do §PR-3 yêu cầu spy ở tầng `fetch` — yêu cầu đó đúng, và đây là bằng chứng cụ thể vì sao nó đúng. Ngoài ra `checkGroundednessAsync` (`:1049`) chạy trong `waitUntil` **sau khi response đã kết thúc** — T9 phải chờ cả các promise hậu kiểm, nếu không sẽ đếm thiếu.

**Câu 26 — V2 mô tả đủ quyết định DeepSeek chưa?** Đủ, và tốt hơn vòng 1 nhờ có phương án C.

**Câu 27 — có cần security/privacy review riêng trước Pilot dù chỉ public allowlist không?** Có, nhưng gọn: một lần rà đúng ba thứ — bằng chứng T9/T16, danh sách trường được persist thật, và mẫu log/telemetry thật lấy từ Preview. Không cần quy trình nặng.

---

# MESSAGE ECHO / HUMAN HANDOFF

Xem N7. Thiết kế đúng, chưa xác minh được, và V2 đã đặt điều kiện đúng cách.

**Câu 43 — `PAUSED_FOR_HUMAN` mà không có admin UI riêng có khả thi không?** Có, **nếu** N3 được xử lý. Không có N3, số hội thoại bị khoá sẽ tăng đến mức phải có UI. Có N3, chỉ hội thoại thật sự nhạy cảm mới pause — số lượng đủ nhỏ để xử lý thủ công trong MVP.

**Câu 44 — admin resume tường minh bằng cách nào trong MVP?** Không cần UI. Một script vận hành có kiểm soát, gỡ cờ theo `user_key`, chạy bởi người có quyền. Ghi vào tài liệu vận hành. Đây đúng là thứ §12 gọi là *"thao tác kỹ thuật có kiểm soát"* — nên chốt luôn chứ đừng để ngỏ.

**Câu 45 — dùng Telegram alert sẵn có hay tránh coupling?** Dùng. `sendTelegramAlert` đã có trong `lib/request-security.js`, đã được dùng cho cảnh báo vận hành, và coupling ở đây là **coupling vào một kênh cảnh báo**, không phải vào domain logic. Dựng kênh thông báo thứ hai cho MVP là chi phí không có lợi ích. Chỉ gửi `user_key` đã băm + reason code, không bao giờ gửi nội dung.

**Câu 46 — có nên gửi acknowledgment cho nhánh nhạy cảm không?** Có, nhưng phải làm thêm một việc mà V2 chưa nêu: **acknowledgment phải chủ động ngăn người dân gửi thêm PII.** Một người vừa nhắn "tôi muốn tố giác" mà nhận được "cán bộ sẽ liên hệ" thì phản xạ tự nhiên là gửi tiếp ảnh CCCD, ảnh giấy tờ, chi tiết vụ việc — tức là ta vừa *tạo ra* thêm dữ liệu nhạy cảm trong inbox. Câu acknowledgment cần: (a) nói tin nhắn đã chuyển tới cán bộ trực, (b) **không** khẳng định đã tiếp nhận chính thức, (c) **nói rõ đừng gửi thêm giấy tờ/thông tin cá nhân qua kênh này**, (d) chỉ tới kênh chính thức đúng quy trình. Owner duyệt câu chữ.

**Câu 47 — có cần giờ làm việc/escalation rule không?** Cho MVP: chỉ cần acknowledgment nêu đúng thực tế trực. Không cần escalation engine.

---

# META OFFICIAL CONTRACT VERIFICATION

```
META_CONTRACT_VERIFICATION_BLOCKED
```

`developers.facebook.com` vẫn bị egress proxy của môi trường review chặn. **Không xác minh được mục nào trong checklist 14 mục của §11.** Câu 38–42 tôi không trả lời được, và sẽ không suy đoán.

Ba mục trong checklist đó không chỉ là chi tiết implementation — chúng **quyết định kiến trúc**, nên phải xác minh trước, không phải trong lúc code:

| Mục §11 | Quyết định nó chi phối |
|---|---|
| `webhook ACK deadline` | N1 — ACK-first + sweeper, hay đồng bộ + để Meta retry |
| `retry policy/window` | TTL của `messenger/inbox`, và liệu retry có thay được sweeper |
| `message_echoes availability/semantics` | Toàn bộ cơ chế chống collision (C5/N7) |

Đề xuất: nâng ba mục này thành **gate riêng trước PR-2**, tách khỏi 11 mục còn lại. 11 mục kia là chi tiết implementation; ba mục này mà sai thì phải vẽ lại kiến trúc.

---

# STORAGE / RACE ANALYSIS

Xem N6 và ASYNC / OUTBOX STATE MACHINE.

**Câu 33 — CAS primitive tái dùng được không?** Pattern có, hàm không. Dùng lại `readRateLimitSnapshot`/`putRateLimitSnapshot` (`:339-361`), **không** dùng lại `reserveRateLimitCounter` (`:362`) — nó là bộ đếm có ngưỡng, không phải máy trạng thái.

**Câu 34 — có giới hạn nào cần wrapper mới?** Có, đúng một cái, và nó quan trọng: **ngữ nghĩa lỗi**. Fail-closed đúng cho rate limit, sai cho dedup. Cần wrapper riêng với chính sách lỗi riêng (N6b).

**Namespace §8 của V2 dùng được**, sau khi gộp dedup + outbox theo câu 35:

```
messenger/inbox/<mid>              gộp dedup + outbox        TTL ≥ retry window (chưa xác minh)
messenger/state/<user_key>         ctx công khai + mode      TTL 30 phút
messenger/rate/<date>/<user_key>   bộ đếm                    TTL cuối ngày
```

V2 §8 nói đúng khi không hardcode TTL từ nguồn thứ cấp. Giữ nguyên thái độ đó.

---

# TEST MATRIX GAPS

**Câu 48 — còn thiếu test Critical/High nào?** Ba, tất cả đều bắt lỗi mà T1–T14 hiện không bắt được:

| ID | Test | Bắt lỗi | PR |
|---|---|---|---|
| **T15** | Fixture công khai gõ **không dấu** ("dia chi cong an phuong X") phải qua Gate 1; fixture tố giác phải bị Gate 1 chặn | N2 — sai cả hai chiều | PR-3 |
| **T16** | Lượt 1 nhạy cảm (bị chặn) → lượt 2 công khai hợp lệ → assert không request nào ra provider chứa văn bản lượt 1 | N4 — rò qua ctx; T9 một lượt không bắt được | PR-3 |
| **T17** | Chữ ký dựng từ `JSON.stringify(parsed)` trên payload tiếng Việt phải **FAIL** verification | N6c — test âm cho C3 | PR-2 |

Ngoài ra sửa hai test đã có:
- **T3** mở rộng theo N5: header, error body trước stream, heartbeat, hình dạng `done`, cả hai nhánh `headersSent`.
- **T5** thêm nhánh: `SENDING` bị crash → đòi lại lease → **gửi lại**, và assert không bao giờ mất tin im lặng.

**Câu 49 — spy tầng `fetch` có chặn hết provider path không?** Có, với một điều kiện: phải **chờ cả các promise trong `waitUntil`** trước khi assert. `checkGroundednessAsync` (`:1049`) chạy sau khi response kết thúc; assert quá sớm sẽ đếm thiếu và test sẽ xanh giả.

**Câu 52 — Pilot metric còn thiếu gì?** §16 tốt. Thêm ba, đều xuất phát từ các phát hiện trên:

```
gate1_blocked_reason{reason}     đo false positive của N2 khi đang chạy
gate2_allowlist_miss             đo recall công khai — dữ liệu để chỉnh allowlist (câu 17)
inbox_lease_reclaimed            đếm số lần crash thật sự xảy ra (N1)
```

---

# PR STACK RECOMMENDATION

**Câu 28 — 4 PR đã tối ưu chưa?** Gần. Đề xuất hai điều chỉnh.

**Câu 29 — PR-2 có ôm quá nhiều không?** Có. Tách đôi, cùng lý do đã tách PR-1: code bảo mật xứng đáng được review riêng, không lẫn với code trạng thái.

```
PR-2a  Webhook security     GET verify · raw body · signature · timingSafeEqual · event parser
                            Nhỏ, an ninh cao, review kỹ.        Gate: T1, T2, T17
PR-2b  Transport state      user key · inbox CAS · rate limit · Send API client · flags · budget
                            Gate: T4, T11, T12, T13, T14
```

**Câu 30 — tách outbox/reliability khỏi adapter?** Không tách thêm. Sau khi gộp dedup + outbox làm một record (câu 35), nó trở thành *một* máy trạng thái gắn chặt với vòng đời event — tách ra sẽ tạo một boundary không tương ứng với thứ gì có thật.

**Câu 31 — conversation state ở PR-3 hay PR-4?** **Chính sách ghi ctx thuộc PR-3** (N4). Lưu trữ/sử dụng có thể ở PR-4.

Thứ tự cuối:

```
PR-1   sink inversion            ← BẮT ĐẦU ĐƯỢC NGAY
PR-2a  webhook security
PR-2b  transport state
PR-3   safety gate + human state + echo + chính sách ghi ctx
PR-4   nối public RAG + formatter + ctx storage
```

---

# OWNER DECISIONS REQUIRED

| # | Quyết định | Chặn | Cần trước |
|---|---|---|---|
| 1 | **Decision P1** — provider generation: A giữ / B đổi / C chỉ retrieval-template (§10) | Pilot | PR-4 |
| 2 | **Khôi phục sau ACK** — Meta retry làm queue, hay ACK-first + sweeper (N1) | PR-4 | sau khi có ACK deadline từ §11 |
| 3 | **Chính sách gửi trùng** — chấp nhận at-least-once cho nội dung công khai khi lease `SENDING` nhập nhằng (câu 7) | PR-4 | PR-4 |
| 4 | **Câu chữ acknowledgment** nhánh nhạy cảm, gồm cả câu ngăn gửi thêm PII (câu 46) | Pilot | Pilot |
| 5 | **Ngưỡng recall công khai** chấp nhận được sau SHADOW (câu 17) | Pilot | Pilot |
| 6 | **Quy trình trực + resume** cho `PAUSED_FOR_HUMAN` (câu 43–44) | Pilot | Pilot |

Không có mục nào trong bảng này chặn PR-1.

---

# FINAL GO / NO-GO

```
PR-1   GO      Bắt đầu ngay. Không blocker. Gấp N5 vào thiết kế, mở rộng T3.
PR-2a  GO      Sau khi §11 xác minh signature contract. Thêm T17.
PR-2b  HOLD    Cần retry window từ §11 để chốt TTL của messenger/inbox.
PR-3   HOLD    Cần N2, N3, N4 được sửa trong tài liệu. Thêm T15, T16.
PR-4   HOLD    Cần Decision 1 + 2 + 3 của owner.
Pilot  HOLD    Cần toàn bộ bảng trên + Gate D3 trên hạ tầng Meta thật.
```

**Việc nên làm ngay, theo thứ tự:**

1. **Bắt đầu PR-1.** Nó độc lập với mọi thứ còn lại và là đường tới hạn dài nhất.
2. **Song song:** xác minh 3 mục kiến trúc trong §11 (ACK deadline · retry window · echo semantics). Ba mục này mở khoá N1, PR-2b và C5.
3. **Sửa tài liệu cho N2, N3, N4** — chỉ ảnh hưởng PR-3, làm được trong lúc PR-1 đang chạy.

---

# ĐÁNH GIÁ CHUNG

V2 là một bản sửa nghiêm túc, không phải sửa cho có. Nó đóng đúng C1, C3, H1, H2, H3, và ở vài chỗ còn chặt hơn đề xuất vòng 1 — phương án C của Decision P1, quy tắc regenerate golden khi baseline đổi, và §11 với trạng thái `_BLOCKED` tường minh đều là bổ sung của V2.

Các vấn đề còn lại có một điểm chung đáng chú ý: chúng đều là **giả định về tính tái dùng**. `hasObviousPii` trông như một bộ dò PII sẵn có (N2). Outbox trông như một cơ chế khôi phục (N1). Helper CAS trông như dùng được nguyên hàm (N6). Trong cả ba trường hợp, hình dạng thì đúng còn ngữ nghĩa thì thuộc về một bài toán khác. Đó là cùng một dạng lỗi với C1 ở vòng 1 — nơi các primitive RAG *trông như* đã tách sẵn, mà phần điều phối thì không.

Với repo này, "đã có sẵn rồi" là câu cần kiểm chứng, không phải câu kết luận.

---

## Nguồn

- Repo, đọc và **chạy thử** trực tiếp tại `c6e9fa5`: `api/chat.js` (hàm `hasObviousPii`/`normalizeFaqQuestion` được chạy trên bộ ca thật, kết quả ở N2), `lib/request-security.js`, `lib/output-validator.js`, `lib/retrieval-governance.js`, `vercel.json`, `test/p0-fixes.test.js`
- Vercel `waitUntil`/`maxDuration`: đã kiểm chứng ở review vòng 1, không đổi
- `developers.facebook.com`: **vẫn bị chặn** — §11 giữ trạng thái `META_CONTRACT_VERIFICATION_BLOCKED`
