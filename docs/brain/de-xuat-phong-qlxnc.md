# Đề xuất: Bổ sung dữ liệu Phòng Quản lý xuất nhập cảnh (QLXNC) — 3 điểm tiếp dân

> Bối cảnh: Từ 13/4/2026, Phòng QLXNC chuyển trụ sở + tiếp dân tại 3 địa điểm (theo địa bàn 3 tỉnh cũ đã sáp nhập vào Phú Thọ).
> Mục tiêu: chatbot trả ĐÚNG địa chỉ/SĐT điểm tiếp dân thay vì bịa (lỗi EV04, GV06 trong regression-run-1).
> Hôm nay 30/6/2026 → thông tin đã có hiệu lực, không cần future-gating.

---

## 1. Dữ liệu gốc (verbatim từ chỉ đạo BGĐ)

**Trụ sở làm việc (HQ, KHÔNG tiếp dân TTHC):**
- 1A đường Tôn Đức Thắng, phường Vĩnh Phúc, tỉnh Phú Thọ — ĐT công tác: 0692.645.126

**3 địa điểm tiếp dân / giải quyết TTHC cho NNN:**
| # | Địa bàn phục vụ (tỉnh cũ) | Địa chỉ | SĐT |
|---|---|---|---|
| 01 | **Vĩnh Phúc cũ** | Thôn Vị Trù, phường Vĩnh Yên, tỉnh Phú Thọ (QLXNC Vĩnh Phúc cũ) | 0211.3.558.668 |
| 02 | **Phú Thọ cũ** | Khu E - Công an tỉnh Phú Thọ, khu 7, phường Việt Trì, tỉnh Phú Thọ (QLXNC Phú Thọ cũ) | 069.2.645.166 |
| 03 | **Hòa Bình cũ** | Đại lộ Thịnh Lang, phường Hòa Bình, tỉnh Phú Thọ (QLXNC Hòa Bình cũ) | 0218.3.855.311 |

---

## 2. Vấn đề cốt lõi cần giải

Matcher trụ sở (`lib/published-locations.js`) là **so khớp từ khóa theo tên/alias**, KHÔNG hiểu thẩm quyền. Hệ quả:
- Câu "gia hạn visa ở đâu" không chứa tên đơn vị → trước nay no_match → model **bịa** địa chỉ Phòng QLXNC (EV04, GV06).
- Câu "Tôi ở Thanh Miếu, gia hạn visa..." → matcher khớp **Công an phường Thanh Miếu** (sai thẩm quyền), không phải QLXNC.

→ Cần kết hợp **2 lớp**: (A) đưa 3 điểm vào dữ liệu để có thể match & hiển thị trên bản đồ; (B) sửa prompt để định tuyến thẩm quyền + cấm bịa đơn vị cấp tỉnh.

---

## 3. Cách mô hình hóa (khuyến nghị)

**Tạo 3 bản ghi tên RIÊNG** (không phải 1 bản ghi 3 địa chỉ — vì cùng tên + khác địa chỉ sẽ bị coi là `ambiguous_conflict`/conflict, không tối ưu). 3 tên riêng + **chung bộ alias thủ tục** → khi hỏi visa/XNC chung, matcher trả `ambiguous_match` liệt kê cả 3 điểm và bot hỏi "bạn ở khu vực nào (Phú Thọ/Vĩnh Phúc/Hòa Bình cũ)". Đây đúng là hành vi an toàn mong muốn.

**HQ (Tôn Đức Thắng):** KHÔNG đưa vào nhóm match thủ tục để tránh chỉ dân đến nơi không tiếp dân. Chỉ ghi như thông tin liên hệ (cột ghi chú, hoặc 1 dòng riêng có alias hẹp "tru so phong xuat nhap canh").

### Dòng dữ liệu sẵn dán vào `Published_Locations`

> ⚠️ Cột `coordinates` đang để trống — **CẦN BẠN CUNG CẤP tọa độ thật** (chuột phải điểm trên Google Maps → copy lat,lng) cho từng địa chỉ. Thiếu tọa độ → bản ghi bị loại.

| name | address | phone | coordinates | search_aliases |
|---|---|---|---|---|
| Phòng Quản lý xuất nhập cảnh – Điểm tiếp dân khu vực Vĩnh Phúc | Thôn Vị Trù, phường Vĩnh Yên, tỉnh Phú Thọ | 0211.3.558.668 | ⟨lat,lng⟩ | `xuat nhap canh\|xnc\|thi thuc\|visa\|gia han visa\|gia han tam tru\|the tam tru\|cap thi thuc\|e-visa\|evisa\|quan ly xuat nhap canh\|khu vuc vinh phuc\|vinh phuc cu\|vinh yen` |
| Phòng Quản lý xuất nhập cảnh – Điểm tiếp dân khu vực Phú Thọ | Khu E, Công an tỉnh Phú Thọ, khu 7, phường Việt Trì, tỉnh Phú Thọ | 069.2.645.166 | ⟨lat,lng⟩ | `xuat nhap canh\|xnc\|thi thuc\|visa\|gia han visa\|gia han tam tru\|the tam tru\|cap thi thuc\|e-visa\|evisa\|quan ly xuat nhap canh\|khu vuc phu tho\|phu tho cu` |
| Phòng Quản lý xuất nhập cảnh – Điểm tiếp dân khu vực Hòa Bình | Đại lộ Thịnh Lang, phường Hòa Bình, tỉnh Phú Thọ | 0218.3.855.311 | ⟨lat,lng⟩ | `xuat nhap canh\|xnc\|thi thuc\|visa\|gia han visa\|gia han tam tru\|the tam tru\|cap thi thuc\|e-visa\|evisa\|quan ly xuat nhap canh\|khu vuc hoa binh\|hoa binh cu` |

**Lưu ý alias quan trọng (theo `REGION_STOPWORDS` trong code):** các từ trần `viet tri`, `vinh phuc`, `hoa binh`, `phu tho`, `tinh phu tho` BỊ CHẶN làm alias (chống match nhầm vùng). Vì vậy phải dùng dạng có hậu tố: `vinh phuc cu`, `phu tho cu`, `hoa binh cu`, `khu vuc ...`. Riêng `vinh yen` không nằm trong stopword nên dùng được.

---

## 4. Sửa prompt `api/chat.js` (SYSTEM_PROMPT_BASE)

Bổ sung vào khối "DỮ LIỆU & CHỐNG BỊA":

1. **Định tuyến thẩm quyền XNC:**
   > Thủ tục thị thực / gia hạn tạm trú / cấp–gia hạn thẻ tạm trú / e-visa / NNN mất hộ chiếu thuộc thẩm quyền **Phòng Quản lý xuất nhập cảnh (cấp tỉnh)**, KHÔNG hướng về Công an xã/phường, kể cả khi `<verified_locations>` khớp một xã/phường theo địa danh người dùng nhắc.

2. **Chốt chặn chống bịa đơn vị cấp tỉnh (P0 — vẫn cần dù đã có data):**
   > Với đơn vị cấp tỉnh/Phòng (QLXNC, PCCC, CSGT...): chỉ nêu địa chỉ/SĐT/tọa độ/Maps khi có ĐÚNG trong `<verified_locations>`. Nếu không có → chỉ nêu TÊN đơn vị + nói "liên hệ trực tiếp", TUYỆT ĐỐI không tự ghi địa chỉ/SĐT.

3. **Định tuyến 3 điểm theo địa bàn (khi `<verified_locations>` trả nhiều điểm QLXNC):**
   > Phú Thọ cũ → Điểm Việt Trì; Vĩnh Phúc cũ → Điểm Vĩnh Yên; Hòa Bình cũ → Điểm Hòa Bình. Nếu chưa rõ khu vực → liệt kê 3 điểm và hỏi người dùng thuộc khu vực nào.

---

## 5. (Tùy chọn nâng cao) Bơm tĩnh 3 điểm QLXNC theo intent

Vì matcher từ khóa có thể "thua" một phường (vd GV06 khớp Thanh Miếu), cân nhắc thêm **bộ phát hiện intent XNC** trong `api/chat.js`: khi câu hỏi thuộc thị thực/gia hạn/thẻ tạm trú/e-visa/NNN-mất-hộ-chiếu → luôn chèn 3 điểm QLXNC (đã xác minh) vào `<verified_locations>`, không phụ thuộc matcher. Bảo đảm model luôn có địa chỉ thật, diệt hẳn lớp lỗi bịa địa chỉ cấp tỉnh.

---

## 6. Pipeline đưa dữ liệu lên (theo `setup/apps-script.js`)

Dữ liệu trụ sở đi qua: `Unit_Allowlist` → `Location_Staging` → duyệt → `Published_Locations`. 3 tên đơn vị mới cần được thêm vào `Unit_Allowlist` trước. (Hoặc admin thêm trực tiếp `Published_Locations` nếu quy trình cho phép.) Alias có thể nhập kèm như cách `setup/bulk-update-aliases.gs` đang làm cho 148 đơn vị cấp xã.

---

## 7. Việc cần bạn quyết / cung cấp
1. **Tọa độ (lat,lng)** cho 3 điểm tiếp dân (+ HQ nếu muốn ghi). Bắt buộc.
2. Có ghi **HQ Tôn Đức Thắng** vào sheet không, hay chỉ để nội bộ?
3. Chọn mức triển khai: **(A) chỉ data + prompt** (nhẹ) hay **(B) thêm bơm-intent XNC** (chắc nhất, đụng code `api/chat.js`)?
