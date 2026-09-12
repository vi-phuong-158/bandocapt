# QĐ1523 — phụ lục đối chiếu TTHC

Nguồn chính thức: **1523/QĐ-BCA-C06**, ký ngày 26/03/2026 và có hiệu lực từ ngày ký. Bản PDF phụ lục được lưu trong manifest nguồn với SHA-256 `2EA06491E4700EA3C851E9022F94EA0BAFBB72B3522546FC840982988D3D9946`.

## Kết quả đọc phụ lục

| Loại | Số theo metadata nhiệm vụ | Số hàng quan sát trực tiếp trong PDF |
| --- | ---: | ---: |
| NEW | 5 | 5 |
| AMENDED/SUPPLEMENTED/REPLACED | 36 | 39 |
| ABOLISHED | 7 | 7 |

PDF là bản scan 134 trang, không có text layer. Các hàng trong bảng được kiểm tra trực quan ở trang PDF 3–17; locator và tên/mã từng hàng nằm trong [qd1523-procedure-map.json](../../data/qd1523-procedure-map.json). Do môi trường không có Tesseract/OCR backend, không suy đoán các trường không đọc được; chênh lệch 36/39 được giữ nguyên để cơ quan nghiệp vụ xác nhận.

## Đối chiếu và thứ tự ưu tiên

- Mỗi hàng giữ đủ mã (nếu phụ lục có), tên chính thức, lĩnh vực, cấp thực hiện, loại thay đổi, ngày hiệu lực và locator.
- Hàng có cùng mã/tên ở nhiều cấp được giữ thành các bản ghi riêng (`trung-uong`, `tinh`, `xa`).
- QĐ5230 là nguồn mới hơn và được ưu tiên cho các thủ tục căn cước trùng phạm vi; QĐ1523 không được dùng để hồi sinh các mã đã bị QĐ5230 bãi bỏ.
- Chưa tự động gán các hàng scan vào slug nội bộ khi không có mã chính thức tương ứng; các hồ sơ đó tiếp tục ở trạng thái `NEEDS_LEGAL_REVIEW` cho đến khi có bằng chứng mã/tên/cấp/lĩnh vực đủ mạnh.

## Reconciliation

Validator `npm run validate:qd1523-mapping` kiểm tra 51 hàng quan sát được (5 NEW, 39 AMENDED, 7 ABOLISHED), hash nguồn, ngày hiệu lực và locator PDF. Đây là đối chiếu pháp lý độc lập; không có thao tác ghi Pinecone, Vercel hay dữ liệu production (`NO_PRODUCTION_MUTATION`).
