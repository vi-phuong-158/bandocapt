# Hướng dẫn duyệt `corpus-governance-draft.csv` (T3.3)

> Sinh bởi `scripts/generate-governance-draft.js` (T3.2). Đây là **draft** — cột `final_*`
> là nơi bạn (người duyệt) chốt. Điền `N/A` cho trường không áp dụng. Sau khi duyệt xong,
> T3.4 sẽ đọc file này để backfill Pinecone (`--apply`, có backup từng record).

## Phạm vi

385 dòng: **39 tthc** (`review_tier=HIGH` — soi từng dòng, rủi ro cao nhất) + **346 law/guide**
(`review_tier=BULK` — duyệt hàng loạt, spot-check). 145 record `tru_so` đã LOẠI (có pipeline
duyệt Published_Locations riêng).

## Cột nào cần bạn quyết định (`final_*`)

| Cột | Ý nghĩa | Gợi ý đã prefill |
|---|---|---|
| `final_review_status` | `approved` / `pending` / `superseded` | tthc = `pending` (bạn xác nhận → `approved`); law/guide = `approved` |
| `final_source_priority` | `current_procedure` / `legal_basis` / `supplemental` / `legacy` | Theo lớp (tthc/law/guide) |
| `final_valid_from` | Ngày nguồn bắt đầu hiệu lực | **TRỐNG** — bạn điền theo ngày ban hành văn bản nguồn |
| `final_valid_to` | Ngày hết hiệu lực (nếu có) | `N/A` cho procedure hiện hành; điền ngày nếu nguồn đã bị thay |
| `final_supersedes` | id record nguồn CŨ mà dòng này thay thế | Trống — điền khi có |
| `final_procedure_version` | Phiên bản thủ tục | Trống |
| `final_last_verified_at` | Ngày bạn xác minh | **Để trống** — T3.4 tự đóng dấu ngày apply |
| `final_phi_le_phi` | Phí/lệ phí | Prefill từ metadata hiện có (tthc); `N/A` cho law/guide |
| `final_thoi_han` | Thời gian giải quyết | Xem cảnh báo dưới |
| `final_mau_don` | Mã mẫu đơn | Prefill từ mã dò được trong text (VD `NA5`); **kiểm lại**, regex có thể bắt nhầm |
| `final_authority` | Cơ quan thẩm quyền | Suy từ `cap` (tthc); `N/A` cho law/guide |

Cột tham chiếu (không sửa): `existing_phi_le_phi`, `candidate_thoi_han`, `candidate_mau_don`,
`suggested_authority`, `source_decision`, `cap`, `title`.

## ⚠️ Cảnh báo dữ liệu quan trọng

- **36/39 tthc KHÔNG có thời hạn cụ thể trong corpus** (text nguồn 5568 ghi "Xem chi tiết").
  `candidate_thoi_han` các dòng này để TRỐNG — bạn phải lấy `final_thoi_han` từ nguồn thật
  (chi tiết Quyết định 5568/QĐ-BCA hoặc cổng dịch vụ công). Chỉ 3 dòng có sẵn:
  `tthc_matt26265`, `tthc_xa-03`, `tthc_xa-04`.
- **`paper_flag`** đánh dấu record nhắc nộp giấy/NA17: `strict` (3 dòng — cân nhắc `superseded`
  nếu là luồng cũ) / `broad` (85 dòng — phần lớn là kênh nộp HỢP LỆ, chỉ đặt `superseded` khi
  chắc chắn hết hiệu lực). KHÔNG mặc định coi `broad` là hết hiệu lực.
- **`final_mau_don`** prefill từ regex mã đơn (`NA/TK/TT/M/XC/HC` + số) — dễ bắt nhầm chuỗi
  trong text; đối chiếu lại với văn bản gốc trước khi chốt.

## Sau khi duyệt

Lưu lại file (giữ đúng tên cột), báo lại để chạy **T3.4** backfill có backup. Nhóm rủi ro cao
(39 tthc) nên duyệt trước; law/guide có thể xác nhận nhanh theo prefill.

## Nguồn đối chiếu Công an tỉnh Phú Thọ (2026-07-15)

Đã có thêm hai artifact **chỉ để hỗ trợ duyệt**, không tự thay đổi cột `final_*`:

- `data/tthc-phutho-source.json`: snapshot 18 lĩnh vực / 157 thủ tục từ trang TTHC Công an tỉnh
  Phú Thọ, có URL nguồn, thời hạn, phí, cơ quan, căn cứ, hồ sơ, trình tự, biểu mẫu và `content_hash`.
- `data/tthc-phutho-high-review.csv`: đối chiếu riêng 39 dòng `HIGH`. Chỉ 14 dòng khớp chính xác
  cùng cấp, 3 dòng là gợi ý theo tiêu đề cùng cấp cần kiểm tay, 22 dòng không ghép vì thiếu nguồn
  tương thích (phần lớn là thủ tục trung ương/giấy thông hành không có trên cổng tỉnh).

**Cảnh báo:** cổng tỉnh vẫn đồng thời đăng mục KBTT trực tuyến và mục mang tên “bằng Phiếu khai báo
tạm trú”. Vì dự án đã xác định luồng phiếu/NA17 là lỗi thời, không được đổi record đó thành `approved`
chỉ vì trang còn hiển thị. Dòng có `risk_flags=paper_flow_candidate` phải được người duyệt xử lý riêng.

## Quyết định duyệt nguồn (2026-07-15)

Người duyệt đã chốt các quyết định nguồn tại `data/tthc-phutho-review-decisions.json`:

- Chấp nhận facts từ 17 dòng được ghép với nguồn tỉnh (gồm 14 khớp chính xác và 3 gợi ý đã được
  duyệt); T3.4 mới là bước merge có backup.
- Không nhập luồng khai báo tạm trú bằng Phiếu/NA17; coi là `superseded`.
- Với cấp thị thực, nhận mức phí từ nguồn tỉnh nhưng giữ mẫu `NA5`, vì tệp `NA15` gắn trên web không
  thuộc thủ tục này.
- Với cấp lại thẻ thường trú, giữ `NA13`; `NA12` là đơn xin thường trú, không thay thế mẫu này.
- Giữ record KBTT trực tuyến `tthc_matt26265` hiện tại và cờ xung đột nguồn; không lấy nhãn cấp/cơ
  quan hoặc 24 giờ/07 ngày từ trang tỉnh để ghi đè.
