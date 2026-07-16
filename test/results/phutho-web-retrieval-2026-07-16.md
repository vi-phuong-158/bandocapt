# Kiểm thử truy vấn namespace TTHC Phú Thọ — 2026-07-16

Namespace: `chatbot-tthc-xnc-web-rd-20260715`  
Embedding: Gemini Embedding 001, `RETRIEVAL_QUERY`, 768 chiều  
Top-k: 3, truy vấn trực tiếp Pinecone, không thay production.

## Kết quả

| Nhóm câu hỏi | Kết quả chính | Đánh giá |
|---|---|---|
| Cấp/cấp lại thẻ thường trú người nước ngoài | Trả các thủ tục XNC cấp tỉnh; truy vấn có mã biểu mẫu trả `NA13` (cấp đổi) và `NA12` (cấp thẻ) ở top 1–2 | Đạt; cần dùng exact-token khi người dùng nêu NA12/NA13 |
| Khai báo tạm trú người nước ngoài tại cơ sở lưu trú | Top 1 là “Khai báo tạm trú… qua Trang thông tin điện tử”, cấp tỉnh, approved | Đạt |
| Cấp hộ chiếu phổ thông | Top 1 đúng thủ tục cấp hộ chiếu, biểu mẫu `TK01`, `TK01A` | Đạt |
| Căn cước tại Công an cấp xã (câu hỏi rộng) | Top 3 bị kéo về nhóm tuyển chọn/tuyển lao động cấp tỉnh | Chưa đạt; cần lọc `cap=Cấp Xã`/nhận diện lĩnh vực trước query |
| Đăng ký xe tại Công an cấp xã (câu hỏi rộng) | Top 3 là các thủ tục đăng ký xe cấp tỉnh | Chưa đạt ở câu hỏi này; cần bộ lọc cấp thực hiện |

## Kết luận

Namespace mới đã truy vấn được dữ liệu và metadata đều có `review_status=approved`. Hai lỗi còn lại là lỗi định tuyến theo cấp thực hiện khi câu hỏi không nêu rõ tên thủ tục; đưa vào T3.6/T3.7 để bổ sung filter/rerank, chưa chuyển namespace mới lên production.
