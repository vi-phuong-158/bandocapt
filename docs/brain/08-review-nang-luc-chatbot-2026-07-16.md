# 08 — Review tiến độ kế hoạch đánh giá năng lực Chatbot (2026-07-16)

> Bản review độc lập do Claude Code thực hiện 2026-07-16, dựa trên `07-parallel-task-plan.md`,
> `04-current-tasks.md`, `06-ai-working-log.md`, các báo cáo trong `test/results/` và cờ tính năng
> trong `api/chat.js`. Dùng làm căn cứ cho phiên duyệt tập trung mở khóa T3.7/T3.8.

---

## Kết luận nhanh

**Kế hoạch 4 giai đoạn đang đi đúng lộ trình, đã qua ~70% chặng đường.** Giai đoạn 1 (thước đo
30 câu) và Giai đoạn 2 (runtime safety) đã **đóng với gate ĐẠT**: baseline chính thức gần nhất
(`test/results/regression-majority-2026-07-13_09-19-09.md`) có **0 hard fail đa số trên 32 ca**
(30 câu đơn + 2 hội thoại H16/H17), chỉ còn 4 ca flaky 1/3 run (TR05, TT04, DN01, LOC07).
Dự án hiện **giữa Giai đoạn 3** — giai đoạn quyết định độ chính xác dài hạn — đang dừng ở T3.6,
chờ 3 việc: backfill governance có key thật, shadow retrieval T3.7, và quyết định chuyển
namespace T3.8 của chủ dự án.

## Tiến độ chi tiết theo giai đoạn

### Giai đoạn 1 — Thước đo 30 câu: HOÀN THÀNH (2026-07-12)

Toàn bộ T1.1–T1.11 xong. Hạ tầng đánh giá hoàn chỉnh: expectations JSON đủ 30 ID, eval-mode có
test chứng minh không lộ ra production, lớp chấm deterministic + grounding + Recall@4/MRR,
thước đo hội thoại nhiều lượt (H16/H17), gate đa số 2/3 thay strict per-run. Điểm đáng ghi nhận:
đội đã sửa false-positive của chính bộ chấm (T1.8 — 9/11 ca fail lặp là lỗi thước đo, không phải
lỗi bot) trước khi lấy mốc, nên baseline hiện tại đáng tin.

### Giai đoạn 2 — Runtime safety: HOÀN THÀNH trừ 1 mục deferred

T2A (fail-closed abstention + `standaloneQuery` thống nhất), T2B-1 (buffered validation theo
câu), T2C (deadline 55s, failover, tách `lib/request-security.js`), T2D-1..4 (tối ưu frontend)
đều xong với majority gate đạt. **T2B-2 (per-claim citation, cờ `CLAIM_CITATIONS`) vẫn
DEFERRED** vì soft-warning/latency gate chưa đạt — quyết định đúng, không phải nợ xấu.

### Giai đoạn 3 — Quản trị nguồn: ĐANG LÀM (điểm nghẽn hiện tại)

- **Xong:** T3.1–T3.5. Inventory phát hiện điều quan trọng nhất: **0/530 record production có
  `review_status`**, facts vận hành gần trống (36/39 thủ tục thiếu `thoi_han` thật). Người dùng
  đã duyệt 42 thủ tục cấp xã + 17 dòng nguồn tỉnh; hai namespace ứng viên dựng xong và verify
  (`chatbot-tthc-xnc-xa-rd-20260715` 42/42, `chatbot-tthc-xnc-web-rd-20260715` 156/156 vector).
- **Đang dở:** T3.6 — governance filter fail-closed theo vai trò nguồn (PR #34 đã merge kèm fix
  gate theo cờ `RAG_GOVERNANCE_FILTER`). Script `backfill-law-guide-governance.js` **chưa chạy
  `--apply`** (thiếu `PINECONE_API_KEY`), và commit `7d95382` đã liệt kê **50 guide "Toàn văn
  thủ tục" cần người duyệt review** trước backfill — gán nhãn `supplemental` bừa cho guide chứa
  toàn văn thủ tục cũ sẽ khiến governance hợp thức hóa nguồn lỗi thời.
- **Chưa làm:** T3.7 (shadow retrieval 60 câu cân bằng + 30 câu lõi × 3) và T3.8 (chuyển
  production — cần người dùng duyệt).

### Giai đoạn 4 — UX

T4B (mobile Civic Modern) xong sớm theo yêu cầu người dùng; T4A-1..4 và T4C còn TODO — không
ảnh hưởng độ chính xác.

## Đề xuất hướng cải thiện độ chính xác (xếp theo tác động/effort)

1. **Ưu tiên số một: đi nốt T3.6 → T3.7 → T3.8.** Đòn bẩy độ chính xác lớn nhất không nằm ở
   model hay prompt mà ở việc chuyển sang namespace đã duyệt 156 thủ tục hiện hành (loại
   Phiếu/NA17). Nó đóng luôn F01 (ca deferred duy nhất) và thay corpus 0/530 governed bằng corpus
   100% `approved`. Việc cần làm ngay: người duyệt xử lý 50 guide "Toàn văn thủ tục" (commit
   `7d95382`), chạy `npm run backfill:law-guide-governance -- --apply` với key thật (backup/
   rollback sẵn), seed law/guide đã duyệt sang namespace ứng viên, chạy shadow T3.7.

2. **Sửa lỗi định tuyến theo cấp thực hiện trước khi chuyển namespace.** Báo cáo
   `test/results/phutho-web-retrieval-2026-07-16.md`: 2/5 nhóm câu hỏi thất bại cùng kiểu — câu
   hỏi rộng về căn cước/đăng ký xe "tại Công an cấp xã" bị kéo về thủ tục cấp tỉnh. Metadata
   `cap_normalized` đã có sẵn trong namespace mới — thêm nhận diện lĩnh vực + filter `cap`
   server-side trước query (hoặc boost trong rerank) trong phạm vi T3.6, và đưa 2 ca này vào bộ
   60 câu T3.7 để nghiệm thu.

   > **[Cập nhật 2026-07-17]** Đo live qua governance (không phải query thô như báo cáo gốc):
   > căn cước cấp xã ĐÃ route đúng sẵn (filter khớp `cap_quan_ly_can_cuoc`). Lỗi thật là đăng ký
   > xe cấp xã: filter cap CỨNG loại sạch → bot từ chối oàn (0 match) vì namespace web gắn đăng ký
   > xe = Cấp Tỉnh. Đã sửa cap → ưu tiên MỀM (nhánh `feat/t36-soft-cap-preference`, chưa push).
   > Còn 1 việc DỮ LIỆU cho phiên duyệt: seed đăng ký xe **cấp xã** vào namespace ứng viên
   > (người dùng xác nhận đăng ký xe thực tế nộp ở Công an cấp xã). 2 ca này đã ghi để đưa vào bộ
   > 60 câu T3.7.

3. **Backfill facts `thoi_han`/`mau_don`** (TASK-P0-04-EXT, đã nhập vào T3.2–T3.4). Cơ chế
   `[FACTS ĐÃ XÁC MINH]` trong `buildVerifiedFactsLine` sẵn sàng đọc 2 field này nhưng dữ liệu
   gần trống (1/530). Đây là nguồn hallucination đã ghi nhận (TYPO01, GV01, HS02). Namespace web
   mới scrape từ nguồn tỉnh có sẵn biểu mẫu (NA12/NA13/TK01 đã thấy trong retrieval test) — tận
   dụng snapshot đó thay vì nhập tay.

4. **Bật `EMBED_TASK_TYPE=RETRIEVAL_QUERY` cùng lúc chuyển namespace.** Namespace mới đã embed
   bằng `RETRIEVAL_DOCUMENT`; retrieval test 2026-07-16 chạy query bằng `RETRIEVAL_QUERY` cho
   kết quả tốt — cải thiện retrieval "miễn phí" nhưng bắt buộc flip đồng bộ với namespace
   (đã chú thích trong `api/chat.js` quanh dòng 1955).

5. **Xử lý 4 ca flaky thay vì chỉ ghi advisory.** LOC07 (`wrong_language:expected_en_got_vi`)
   là lỗi tất định sửa được ở tầng detect/prompt ngôn ngữ, không phải nhiễu sampling.
   TR05/TT04/DN01 rớt kiểu `missing_required_fact` 1/3 run — nghi biến thiên retrieval/
   generation; shadow T3.7 với namespace mới sẽ cho biết retrieval có phải thủ phạm không trước
   khi đụng prompt. GV02 (provider error lẻ tẻ + nghi `BLOCKED_CONTENT`) đã có phương án
   retry-on-block ghi ở `04-current-tasks.md` — đáng làm khi rảnh tay.

6. **Mở rộng bộ thước đo theo corpus mới.** Bộ 30 câu hiện tại thiết kế cho corpus XNC cũ;
   corpus sắp tăng lên 156 thủ tục (thêm căn cước, đăng ký xe, ngành nghề ANTT, cấp xã). Bộ 60
   câu cân bằng của T3.7 nên trở thành bộ regression thường trực sau T3.8, kèm vài câu bẫy
   "nguồn superseded" để kiểm chứng governance filter. LLM judge advisory cho 5–8 ca khó (đã dự
   kiến trong kế hoạch) nên mở sau T3.8.

7. **Ổn định provider.** Hai run cuối baseline 07-13 có p95 tăng 17s → ~28s do Gemini free-tier
   429 ép failover sang DeepSeek — nhiễu này làm mờ số đo chất lượng. Cân nhắc quota trả phí cho
   Gemini (import embedding 42 record đã phải delay 10s/lần vì lý do này).

## Quan sát quy trình

Kỷ luật đánh giá của dự án rất tốt (gate 0 hard fail, mọi thay đổi hành vi chặn sau thước đo,
backup/rollback đầy đủ). Điểm yếu duy nhất: các bước phụ thuộc người dùng (duyệt CSV, chạy
`--apply`, quyết định T3.8) đang là nút cổ chai — nên gom thành **một phiên duyệt tập trung**
(50 guide Toàn văn + quyết định T3.8) để mở khóa T3.7/T3.8 trong một lần.
