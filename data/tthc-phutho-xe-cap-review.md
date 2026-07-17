# Đối chiếu cấp thực hiện — 10 thủ tục Đăng ký xe (T3.3, chờ người dùng duyệt)

> Lập 2026-07-17. Chỉ đọc (read-only) — CHƯA ghi gì vào Pinecone.
> Nguồn dữ liệu: `data/tthc-phutho-source.json` (snapshot website 2026-07-15) +
> namespace production `chatbot-tthc-xnc` (guide `guide_cap_xa_2025_e_*`) +
> namespace ứng viên `chatbot-tthc-xnc-web-rd-20260715` (10 record xe hiện tại).

## 1. Vấn đề

Namespace ứng viên đang có **10 thủ tục đăng ký xe gắn `cap_normalized=tinh`**
(authority = *Phòng Cảnh sát giao thông, Công an tỉnh Phú Thọ*), vì web importer lấy
`cap` từ `level` của website (đều xếp **Cấp Tỉnh**). Nhưng nghiệp vụ (CBCS xác nhận) và
bộ **guide cấp xã 2025** đều nói cùng các thủ tục này **thực hiện tại Công an cấp xã**.

## 2. Hai nguồn mâu thuẫn (đều là nguồn 2025, đều "hiện hành")

| | Nguồn A — Website TTHC tỉnh | Nguồn B — Wiki cấp xã 2025 |
|---|---|---|
| Định danh | `congan.phutho.gov.vn/TTHC.aspx` (fetch 2026-07-15) | `guide_cap_xa_2025_e_*` (đã embed trong production) |
| Cấp thực hiện | **Cấp Tỉnh** (10/10) | **Cấp xã** ("thẩm quyền giải quyết của Công an cấp xã") |
| Cơ quan | Phòng CSGT Công an tỉnh Phú Thọ | Công an cấp xã |
| Nội dung thủ tục | Đầy đủ: trình tự, hồ sơ, **thời hạn**, **lệ phí** (TT 60/2023 + 71/2025), URL online | Toàn văn thủ tục (trình tự/hồ sơ), ít facts phí/thời hạn có cấu trúc |
| Loại xe | "đăng ký xe" chung (không tách ô tô/xe máy) | "đăng ký xe" chung (không tách ô tô/xe máy) |

**Đây KHÔNG phải lỗi scrape:** website nội bộ nhất quán — toàn bộ lĩnh vực "Đăng ký, quản lý
phương tiện GTCG đường bộ" (10 thủ tục) đều xếp Cấp Tỉnh; 43 mục cấp xã của website **không có**
đăng ký xe. Hai cơ sở dữ liệu của tỉnh thực sự bất đồng về cấp thực hiện.

## 3. Bảng đối chiếu 1:1 (khớp chính xác theo tiêu đề, chỉ khác đuôi cấp)

| # | Guide cấp xã | site_id tỉnh | Tên thủ tục (rút gọn) | Kênh | Lệ phí |
|---|---|---|---|---|---|
| 1 | `e_01` | `2389-14` | Đăng ký lần đầu toàn trình — xe SX, lắp ráp trong nước | Toàn trình | TT 60/2023 + 71/2025 |
| 2 | `e_02` | `2390-14` | Đăng ký xe lần đầu toàn trình — xe nhập khẩu | Toàn trình | TT 60/2023 + 71/2025 |
| 3 | `e_03` | **(không có)** | Đăng ký, cấp biển số xe lần đầu — DVC một phần/trực tiếp | Một phần | — |
| 4 | `e_04` | `2394-14` | Cấp CN ĐK xe, BS xe khi thay đổi chủ xe (sang tên) | Một phần | TT 60/2023 + 71/2025 |
| 5 | `e_05` | `2395-14` | Đổi chứng nhận đăng ký xe, biển số xe | Một phần | TT 60/2023 + 71/2025 |
| 6 | `e_06` | `2404-14` | Cấp lại CN ĐK xe, BS xe — DVC toàn trình | Một phần | TT 60/2023 + 71/2025 |
| 7 | `e_07` | `2405-14` | Cấp lại CN ĐK xe, BS xe — DVC một phần/trực tiếp | Một phần | TT 60/2023 + 71/2025 |
| 8 | `e_08` | `2406-14` | Đăng ký xe tạm thời — DVC toàn trình | Toàn trình | TT 60/2023 + 71/2025 |
| 9 | `e_09` | `2407-14` | Đăng ký xe tạm thời — DVC một phần/trực tiếp | Một phần | TT 60/2023 + 71/2025 |
| 10 | `e_10` | `2408-14` | Thu hồi CN ĐK xe, BS xe — DVC toàn trình | Toàn trình | Không thu lệ phí |
| 11 | `e_11` | `2422-14` | Thu hồi GCN ĐK, BS xe — DVC một phần/trực tiếp | Một phần | Không thu lệ phí |

→ **10/10 thủ tục tỉnh đều có bản song sinh cấp xã** trong wiki 2025. Guide `e_03` là thủ tục
cấp xã thứ 11, **không có** bản tỉnh trong snapshot.

## 4. Nhận định & đề xuất

- Wiki cấp xã 2025 ghi rõ **thẩm quyền Công an cấp xã** cho đúng 11 thủ tục này; cộng với xác
  nhận nghiệp vụ CBCS (dân nộp đăng ký xe ô tô/xe máy tại Công an cấp xã) → **cấp xã là cấp
  thực hiện đúng**. Nhãn "Cấp Tỉnh" của website là điểm dữ liệu lỗi thời/không khớp thực tế.
- Cần người dùng (thẩm quyền nghiệp vụ) chốt trước khi ghi. Một sắc thái pháp lý cần xác nhận:
  văn bản gốc (TT 79/2024/TT-BCA + phân định thẩm quyền 2025) có thể phân **ô tô ↔ Phòng CSGT
  tỉnh**, **mô tô/xe gắn máy ↔ Công an cấp xã**. Cả hai nguồn ở đây đều để "đăng ký xe" chung,
  không tách theo loại xe. Nếu thực tế địa phương có phân tách, cần quyết định riêng cho ô tô.

## 5. Quyết định cần chốt (điền `final_*` rồi báo để chạy import có backup)

**Q1 — Cấp thực hiện của 10 thủ tục đăng ký xe:**
- `xa` (đề xuất) — gán `cap_normalized=xa` cho cả 10.
- `tinh` — giữ nguyên (không sửa).
- `split` — ô tô giữ tỉnh, mô tô/xe máy chuyển xã (cần bổ sung nguồn tách loại xe).

**Q2 — Nguồn text dùng cho record cấp xã:**
- `A` (đề xuất) — Giữ 10 record website (giàu facts: thời hạn/lệ phí/URL online), chỉ SỬA các
  trường cấp: `cap="Cấp Xã"`, `cap_normalized="xa"`, `authority="Công an cấp xã"`, và đổi đuôi
  tiêu đề "…tại Phòng CSGT Công an tỉnh" → "…tại Công an cấp xã" (đúng theo tiêu đề wiki). Vì
  text đổi → re-embed. Giữ `review_status=approved`, `source_priority=current_procedure`.
- `B` — Seed 11 record guide `guide_cap_xa_2025_e_*` (text cấp xã nguyên bản) vào namespace ứng
  viên làm nguồn hiện hành. Nhưng guide vốn `source_type=guide` (supplemental) → phải quyết định
  nâng thành `tthc/current_procedure`, và guide thiếu facts phí/thời hạn có cấu trúc.
- `Hybrid` — text website đã sửa nhãn (A) + bổ sung riêng `e_03` (không có bản tỉnh).

**Q3 — `e_03`** (đăng ký, cấp biển số xe lần đầu — một phần/trực tiếp, chỉ có ở cấp xã): có seed
bổ sung vào namespace ứng viên không? (đề xuất: có, để đủ bộ đăng ký xe cấp xã).

## 6. Quyết định của người dùng (2026-07-17) — CHỐT

**Giữ `cap=tinh`, KHÔNG ghi Pinecone.** Người dùng chọn không mutate 10 record đăng ký xe trong
namespace ứng viên; dựa vào lớp **soft-cap preference** ở tầng retrieval (nhánh
`feat/t36-soft-cap-preference` — cap là ưu tiên mềm, không hard-filter) để bot không từ chối oan
khi dân hỏi đăng ký xe ở cấp xã. Q2/Q3 (nguồn text, e_03) trở thành moot vì không đổi dữ liệu.

**Hệ quả / còn treo:**
- Metadata namespace ứng viên vẫn ghi `cap_normalized=tinh` + authority = Phòng CSGT tỉnh cho 10
  thủ tục xe. Câu trả lời/citation sẽ nêu Phòng CSGT tỉnh, **không** nêu Công an cấp xã — vẫn lệch
  nghiệp vụ CBCS, nhưng soft-cap đảm bảo không từ chối.
- Nếu về sau muốn khớp đúng cấp xã, đây là điểm quay lại: đổi Q1 sang `xa` rồi chạy import có backup.
- Báo cáo này giữ lại làm hồ sơ đối chiếu T3.3 cho lần duyệt sau (không ràng buộc T3.8).

CHƯA ghi Pinecone (đúng quyết định). Không chạy import.
