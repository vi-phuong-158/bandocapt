# Phân tích Regression — chạy lúc 2026-07-01T07:52:45Z

> Nguồn: `test/results/regression-run-2026-07-01_07-52-45.md` (= `regression-latest.md` tại thời điểm ghi file này).
> Đây là lần chấm SAU khi: (1) vá dữ liệu phí Pinecone (34 record + 1 record mới `matt26265`), (2) xóa thủ tục giấy lỗi thời, (3) sửa 2 hồi quy TL01/TT04 vừa phát hiện qua review độc lập, (4) sửa `run-regression.js` để không ghi đè mất lịch sử.
> File `regression-run-1.md` / `regression-run-1-analysis.md` cũ đã LỖI THỜI — xem ghi chú ở đầu 2 file đó.

## Tổng quan kết quả

| Mức | Số câu | ID |
|---|---|---|
| ✅ Đạt sạch | 27 | F01, TR01, TR03, TR05, GV01, GV02, GV06, TT01, TT04, EV01, EV04, VP01, VP06, DN01, DN02, LOC02, TYPO01, TYPO02, ON01, HS02, TL01, CS01, GD02, KC04, TR09, LOC07, PI01 |
| ⚠️ Soft-fail (cần lưu ý, không phải bịa nặng) | 2 | **TR02** (mới phát hiện), **LOC04** (đã biết từ trước) |
| ❌ Fail thật (hallucination) | 1 | **EV07** (đã biết từ trước, chưa sửa) |

**27/30 sạch hoàn toàn, chỉ 1 lỗi hallucination thật (EV07), so với 20/30 của lần chấm gốc.** Cả hai hồi quy do đợt sửa Pinecone gần nhất gây ra (TL01, TT04) đã được xác nhận vá thành công.

## Đã xác nhận vá thành công

### TL01 — Khai báo tạm trú trong bao lâu?
Trước: trộn "24 giờ đến 07 ngày" (thời gian hệ thống xử lý của record mới `matt26265`) với hạn khai báo → dữ liệu sai lệch.
Sau: trả lời sạch, chỉ nêu đúng **12 giờ / 24 giờ** theo Điều 33, không còn nhắc "24h-07 ngày" ở câu này.

### TT04 — Mất thẻ tạm trú thì làm lại ở đâu?
Trước: tự thừa nhận "chưa có quy định riêng" rồi vẫn đưa nguyên hồ sơ/bước của thủ tục **cấp mới** như thể là đáp án.
Sau: nói rõ "**dữ liệu hiện tại chỉ có thủ tục cấp mới... chưa có thủ tục riêng cho trường hợp cấp lại do mất**", không liệt kê hồ sơ cấp mới nữa, chỉ đưa 3 điểm liên hệ thật + đề nghị hỏi trực tiếp.

Toàn bộ các câu khác có liên quan đến khái niệm "thời hạn" (TR01, TR02, TR03, DN02, ON01, TR09, GD02, TYPO02) đều tách đúng 2 khái niệm **hạn khai báo (12h/24h)** và **thời gian xử lý hệ thống (24h-07 ngày)** — luật P1 mở rộng có tác dụng lan tỏa tốt, không chỉ vá đúng 1 câu.

## Lỗi hệ thống trong lần chạy (KHÔNG phải hồi quy code)

3 câu (LOC04, TYPO01, TYPO02) ban đầu trả `UNKNOWN_ERROR` rỗng do:
- `PineconeConnectionError` / `ECONNRESET` (LOC04)
- DNS không resolve được `api.deepseek.com` (TYPO01, TYPO02) — do `DEEPSEEK_API_KEY` được cấu hình nên runtime ưu tiên gọi DeepSeek, và tại đúng thời điểm chạy, mạng cục bộ trên máy không resolve được domain này.

Đây là gián đoạn mạng cục bộ tại thời điểm chạy, retry logic (`fetchWithRetry`) đã hoạt động đúng (thử lại 1/2 lần) nhưng mạng vẫn lỗi xuyên suốt cửa sổ retry. Đã retry riêng cả 3 câu ngay sau đó, không lỗi lại, xem `docs/brain/06-ai-working-log.md` để biết chi tiết. Kết quả retry được dùng để chấm ở bảng trên.

## ⚠️ TR02 — Phát hiện mới: đưa SĐT chưa xác minh kèm cảnh báo

Bot trả lời: *"Bạn vui lòng liên hệ số tổng đài của Công an tỉnh để được hướng dẫn địa chỉ cụ thể: **0210.384.3639** (số này không nằm trong danh sách xác minh của mình, vui lòng kiểm tra lại)."*

Đây là vi phạm nhẹ luật cứng "TUYỆT ĐỐI KHÔNG đưa số điện thoại Công an tỉnh/đơn vị nếu không có trong danh sách xác minh" — mặc dù có tự gắn cảnh báo "không nằm trong danh sách xác minh", **bản thân việc đưa ra con số cụ thể là sai**, cảnh báo đi kèm không đủ để bù trừ. Đây chính là loại lỗi mà báo cáo review độc lập đề xuất cần **output validator bằng code** để chặn tuyệt đối (quét mọi chuỗi dạng số điện thoại trong response, đối chiếu `verified_locations`), vì prompt/luật chữ không đủ chặn 100%.

## ⚠️ LOC04 — Tồn đọng đã biết

"Sông Lô" (chỉ 1 từ, mơ hồ) → bot tự chọn thẳng "Công an Xã Sông Lô" thay vì hỏi lại xem người dùng đang hỏi về địa danh nào. Đã ghi nhận từ lần chấm gốc, chưa xử lý trong đợt này (nằm ngoài phạm vi TL01/TT04).

## ❌ EV07 — Vẫn còn hallucination tiếng Trung (chưa sửa)

Bot vẫn bịa: mẫu "NA1a", thông số ảnh 4×6cm/JPEG/≤2MB, "3 công tác nhật" xử lý — không có trong `retrieved_documents`. Câu nhắc chống bịa đa ngôn ngữ thêm ở P1 (câu tiếng Trung trong `languageLockContext`) không đủ mạnh để chặn. Cần giải pháp code-level (validator hậu kiểm) thay vì tiếp tục vá bằng câu chữ prompt — đúng khuyến nghị của báo cáo review độc lập.

## Khuyến nghị tiếp theo (không nằm trong phạm vi lần sửa này)
1. **Output validator bằng code** (ưu tiên cao nhất — theo đúng đề xuất review độc lập): quét mọi SĐT/địa chỉ trong response đối chiếu `verified_locations`; quét mọi số phí/thời hạn/mẫu đơn đối chiếu `retrieved_documents`. Sẽ chặn được TR02 và có khả năng chặn EV07.
2. Xử lý LOC04 (yêu cầu hỏi lại khi câu hỏi chỉ là 1 địa danh trống, không có ngữ cảnh thủ tục).
3. Chạy lại 2-3 lần nữa để đo độ biến thiên của Gemini/DeepSeek (theo đề xuất review độc lập) trước khi coi baseline này là ổn định.
