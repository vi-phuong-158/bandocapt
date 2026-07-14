# T3.1 — Báo cáo inventory corpus (metadata hiệu lực / xung đột nguồn)

> Nguồn dữ liệu: **live:chatbot-tthc-xnc** · Tổng record: **530** · Tạo lúc: 2026-07-14T01:38:23.006Z
> Chỉ đọc, không ghi Pinecone. Sinh bởi `scripts/inventory-corpus.js` (T3.1).

## Tóm tắt

- Record có `review_status` (đã đưa vào quản trị hiệu lực): **0/530**
- Record cờ luồng giấy/NA17 chưa superseded (F01 độ tin cậy cao): **3**
- Record nhắc nộp giấy/trực tiếp (rộng — người duyệt lọc): **86**
- Record content_hash lệch text hiện tại: **232**
- procedure_id trùng trên nhiều record: **0**

### Phân lớp corpus (theo tiền tố id) + source_priority gợi ý

| Lớp | Số record | source_priority gợi ý | content_hash drift |
|---|---|---|---|
| `guide` | 194 | supplemental | 194/194 |
| `law` | 152 | legal_basis | 0/152 |
| `tru_so` | 145 | N/A (ngoài phạm vi hiệu lực — Published_Locations) | 0/145 |
| `tthc` | 39 | current_procedure | 38/39 |

### Độ phủ trường metadata (đã điền / tổng — thiếu)

| Trường | Đã điền | Thiếu |
|---|---|---|
| `review_status` | 0/530 | 530 |
| `source_priority` | 0/530 | 530 |
| `valid_from` | 0/530 | 530 |
| `valid_to` | 0/530 | 530 |
| `supersedes` | 0/530 | 530 |
| `procedure_version` | 0/530 | 530 |
| `last_verified_at` | 0/530 | 530 |
| `content_hash` | 233/530 | 297 |
| `phi/le_phi` | 39/530 | 491 |
| `thoi_han` | 1/530 | 529 |
| `mau_don` | 1/530 | 529 |
| `authority` | 0/530 | 530 |

## Xung đột nguồn cần xử lý (F01)

| id | procedure_id | luồng chính là giấy? | title |
|---|---|---|---|
| `guide_cap_xa_2025_a_03_quan_ly_xuat_nhap_canh_trinh_bao_mat_the_abtc_thuc_hien_tai_cap_xa_01_01` | - | nhắc như dự phòng |  |
| `guide_cap_xa_2025_g_08_can_cuoc_cap_xac_nhan_so_chung_minh_nhan_dan_09_so_so_inh_danh_ca_nhan_01_01` | - | nhắc như dự phòng |  |
| `guide_passport_online_13_8_co_can_nop_ho_chieu_cu_khong_25` | - | nhắc như dự phòng |  |

### Ứng viên rộng — nhắc nộp giấy/trực tiếp (người duyệt T3.3 lọc)

Tổng **86** record nhắc "phiếu/trực tiếp/bản giấy/fax" nhưng phần lớn là
kênh nộp HỢP LỆ (đăng ký xe, cư trú…), KHÔNG tự động coi là hết hiệu lực. Phân bố theo lớp:

- `guide`: 81 record
- `law`: 4 record
- `tru_so`: 1 record

_Danh sách id đầy đủ trong `data/corpus-inventory.json` (trường `paperCandidates`)._

## content_hash lệch sha256(text)

### tthc (38) — staleness thật (đổi metadata phí không tính lại hash)

- `tthc_5568-tinh-01` — Cấp hộ chiếu phổ thông ở trong nước
- `tthc_5568-tinh-02` — Khôi phục giá trị sử dụng hộ chiếu phổ thông
- `tthc_5568-tinh-03` — Trình báo mất hộ chiếu phổ thông
- `tthc_5568-tinh-04` — Cấp thị thực cho người nước ngoài tại Việt Nam
- `tthc_5568-tinh-05` — Cấp thẻ tạm trú cho người nước ngoài tại Việt Nam tại Công an cấp tỉnh
- `tthc_5568-tinh-06` — Gia hạn tạm trú cho người đã được cấp giấy miễn thị thực
- `tthc_5568-tinh-07` — Gia hạn tạm trú cho người nước ngoài tại Việt Nam
- `tthc_5568-tinh-08` — Cấp thẻ thường trú cho người nước ngoài tại Việt Nam
- `tthc_5568-tinh-09` — Cấp đổi thẻ thường trú cho người nước ngoài tại Việt Nam tại Công an c
- `tthc_5568-tinh-10` — Cấp lại thẻ thường trú cho người nước ngoài tại Việt Nam tại Công an c
- `tthc_5568-tinh-11` — Cấp giấy phép vào khu vực cấm, khu vực biên giới cho người nước ngoài 
- `tthc_5568-tinh-12` — Cấp giấy phép xuất nhập cảnh cho người không quốc tịch cư trú tại Việt
- `tthc_5568-tinh-13` — Cấp lại giấy phép xuất nhập cảnh cho người không quốc tịch cư trú tại 
- `tthc_5568-tw-01` — Cấp hộ chiếu phổ thông ở trong nước
- `tthc_5568-tw-02` — Khôi phục giá trị sử dụng hộ chiếu phổ thông
- `tthc_5568-tw-03` — Trình báo mất hộ chiếu phổ thông
- `tthc_5568-tw-04` — Cấp Giấy xác nhận nhân sự của công dân Việt Nam ở nước ngoài
- `tthc_5568-tw-05` — Đăng ký tài khoản điện tử
- `tthc_5568-tw-06` — Cấp thị thực điện tử theo đề nghị của người nước ngoài
- `tthc_5568-tw-07` — Cấp thị thực điện tử theo đề nghị của cơ quan, tổ chức
- `tthc_5568-tw-08` — Cấp thị thực cho người nước ngoài tại Việt Nam
- `tthc_5568-tw-09` — Kiểm tra, xét duyệt nhân sự, cấp phép nhập cảnh cho người nước ngoài, 
- `tthc_5568-tw-10` — Cấp thẻ tạm trú cho người nước ngoài tại Cục Quản lý xuất nhập cảnh, B
- `tthc_5568-tw-11` — Gia hạn tạm trú cho người đã được cấp giấy miễn thị thực
- `tthc_5568-tw-12` — Gia hạn tạm trú cho người nước ngoài tại Việt Nam
- `tthc_5568-tw-13` — Cấp giấy phép xuất nhập cảnh cho người không quốc tịch cư trú tại Việt
- `tthc_5568-tw-14` — Cấp lại giấy phép xuất nhập cảnh cho người không quốc tịch cư trú tại 
- `tthc_tinh-01` — Xác nhận, cung cấp thông tin liên quan đến xuất nhập cảnh của công dân
- `tthc_tinh-02` — Cấp giấy thông hành biên giới Việt Nam - Lào cho công dân Việt Nam thư
- `tthc_tinh-03` — Cấp giấy phép xuất nhập cảnh cho người không quốc tịch cư trú tại Việt
- `tthc_tinh-04` — Cấp lại giấy phép xuất nhập cảnh cho người không quốc tịch cư trú tại 
- `tthc_tw-01` — Xác nhận, cung cấp thông tin liên quan đến xuất nhập cảnh của công dân
- `tthc_tw-02` — Cấp giấy phép xuất nhập cảnh cho người không quốc tịch cư trú tại Việt
- `tthc_tw-03` — Cấp lại giấy phép xuất nhập cảnh cho người không quốc tịch cư trú tại 
- `tthc_xa-01` — Xác nhận, cung cấp thông tin liên quan đến xuất nhập cảnh của công dân
- `tthc_xa-02` — Cấp giấy thông hành biên giới Việt Nam - Lào cho công dân Việt Nam thư
- `tthc_xa-03` — Cấp giấy thông hành xuất, nhập cảnh vùng biên giới Việt Nam - Trung Qu
- `tthc_xa-04` — Cấp giấy thông hành xuất, nhập cảnh vùng biên giới Việt Nam - Trung Qu

### Lớp khác — nghi khác cơ sở hash (không phải staleness từng record)

- `guide`: 194 record

_Chuẩn hóa lại content_hash đồng bộ khi re-embed ở T3.5._

## Bước tiếp (T3.2)

Toàn bộ record hiện **thiếu** schema hiệu lực (`review_status`, `source_priority`,
`valid_from/valid_to/supersedes`, `procedure_version`, `last_verified_at`) và phần lớn
structured facts (`thoi_han`/`mau_don`/`authority`). T3.2 mở rộng CSV draft để người duyệt
(T3.3) điền các trường này; T3.4 backfill + đánh dấu superseded cho các record cờ luồng giấy.

Chi tiết máy-đọc: `data/corpus-inventory.json`.
