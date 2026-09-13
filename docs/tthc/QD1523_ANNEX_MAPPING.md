# QĐ1523 — phụ lục đối chiếu TTHC

Nguồn chính thức: **1523/QĐ-BCA-C06**, ký ngày 26/03/2026 và có hiệu lực từ ngày ký. Bản PDF phụ lục được lưu trong manifest nguồn với SHA-256 `2EA06491E4700EA3C851E9022F94EA0BAFBB72B3522546FC840982988D3D9946`.

## Kết quả đọc phụ lục

| Loại | Số theo metadata nhiệm vụ | Số hàng quan sát trực tiếp trong PDF |
| --- | ---: | ---: |
| NEW | 5 | 5 |
| AMENDED/SUPPLEMENTED/REPLACED | 36 unique procedures | 39 authority-level rows |
| ABOLISHED | 7 | 7 |

PDF là bản scan 134 trang, không có text layer. Các hàng trong bảng được kiểm tra trực quan ở trang PDF 3–17; locator và tên/mã từng hàng nằm trong [qd1523-procedure-map.json](../../data/qd1523-procedure-map.json). Cổng DVC Quốc gia xác nhận hai tên cư trú 1.013313 và 1.013314, thay cho phiên chép sai từ scan.

`36` và `39` không mâu thuẫn: 36 là số TTHC sửa đổi theo mã thủ tục duy nhất; 39 là số dòng áp dụng theo cấp thực hiện. Ba mã `1.009714`, `1.012564` và `1.014056` đều có một dòng `tinh` và một dòng `xa`, tạo thêm ba dòng authority applicability. Validator khóa chính xác quan hệ này.

## Đối chiếu và thứ tự ưu tiên

- Mỗi hàng giữ đủ mã (nếu phụ lục có), tên chính thức, lĩnh vực, cấp thực hiện, loại thay đổi, ngày hiệu lực và locator.
- Hàng có cùng mã/tên ở nhiều cấp được giữ thành các bản ghi riêng (`trung-uong`, `tinh`, `xa`).
- QĐ5230 là nguồn mới hơn và được ưu tiên cho các thủ tục căn cước trùng phạm vi; QĐ1523 không được dùng để hồi sinh các mã đã bị QĐ5230 bãi bỏ.
- Reconciliation deterministic đã xét lại toàn bộ 76 hồ sơ ban đầu: 11 `AMENDED` theo exact name + authority, 7 `UNCHANGED` do vắng mặt trong danh mục QĐ1523 đầy đủ, 19 `OUT_OF_SCOPE`, và 39 `NEEDS_LEGAL_REVIEW` có reason riêng khi thiếu exact identity.

## Reconciliation

Validator `npm run validate:qd1523-mapping` kiểm tra hash nguồn, ngày hiệu lực, locator PDF và `5 NEW unique`, `39 AMENDED authority rows`, `36 AMENDED unique procedure codes`, `3 duplicated across authority levels`, `7 ABOLISHED unique`. Duplicate chỉ hợp lệ cho ba mã nêu trên, với đúng cặp `tinh` + `xa`, cùng tên và change type. Đây là đối chiếu pháp lý độc lập; không có thao tác ghi Pinecone, Vercel hay dữ liệu production (`NO_PRODUCTION_MUTATION`).
