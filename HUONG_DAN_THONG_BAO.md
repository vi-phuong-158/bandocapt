# Hướng dẫn thiết lập Thông báo qua Google Form (Xác thực bằng Email)

Tính năng cho phép Công an xã/phường tự đăng thông báo (VD: "Tạm dừng tiếp công dân") lên bản đồ số thông qua Google Form. Hệ thống sẽ **tự động kiểm tra địa chỉ email** của người gửi, chỉ những email được cấp phép mới được đăng thông báo cho đơn vị tương ứng.

---

## Luồng hoạt động

```
Đơn vị CA → Đăng nhập tài khoản Google (Gmail)
    → Mở mặt form → Nhập nội dung thông báo
    → Google Sheets nhận response kèm email người gửi
    → Apps Script kiểm tra email
    → Nếu email có quyền hạn → Ghi vào sheet "DaXacThuc"
    → Web app tự động đọc sheet "DaXacThuc" mỗi 5 phút
    → Hiển thị thông báo trên bản đồ
```

---

## Bước 1: Tạo Google Form & Bật thu thập Email

1. Vào [Google Forms](https://forms.google.com) → Tạo biểu mẫu mới
2. Đặt tiêu đề: **"Thông báo từ đơn vị Công an"**
3. **Cực kỳ quan trọng**: Vào tab **Cài đặt (Settings)** (ở phía trên cùng)
   - Tìm mục **Phản hồi (Responses)**
   - Ở phần **Thu thập địa chỉ email (Collect email addresses)**: Chọn **Đã xác minh (Verified)** hoặc **Dữ liệu đầu vào của người trả lời (Responder input)**. Khuyến nghị chọn **Đã xác minh** để bắt buộc người dùng đăng nhập bằng Gmail, tránh giả mạo email.
4. Quay lại tab **Câu hỏi**, thêm **4 câu hỏi** sau (điền đúng thứ tự):

| # | Tên câu hỏi | Loại | Bắt buộc |
|---|---|---|---|
| 1 | **Đơn vị** | Danh sách thả xuống | ✅ Có |
| 2 | **Tiêu đề thông báo** | Trả lời ngắn | ✅ Có |
| 3 | **Nội dung chi tiết** | Đoạn văn | Không |
| 4 | **Hiệu lực đến** | Ngày và giờ | ✅ Có |

5. Trong câu hỏi **"Đơn vị"**, thêm các lựa chọn khớp **chính xác** với tên trong `data.js`:
   - Trụ sở Công an tỉnh Phú Thọ
   - Công an tỉnh Phú Thọ (Điểm cấp CCCD)
   - Công an phường Tiên Cát
   - Công an xã Thụy Vân
   - *(thêm các đơn vị khác nếu có)*

> ⚠️ **Tên đơn vị trong Form PHẢI GIỐNG CHÍNH XÁC với trường `name` trong `data.js`**

---

## Bước 2: Liên kết Google Sheets

1. Trong Google Form → tab **Câu trả lời** → bấm biểu tượng **Google Sheets** (📊)
2. Chọn **"Tạo bảng tính mới"** → Đặt tên VD: "Thông báo CA Phú Thọ"
3. Google Sheets sẽ tự mở → Ghi nhớ **Sheet ID** trong URL:
   ```
   https://docs.google.com/spreadsheets/d/[SHEET_ID_Ở_ĐÂY]/edit
   ```

---

## Bước 3: Cài đặt Apps Script (kiểm tra email)

1. Trong Google Sheets vừa tạo → menu **Tiện ích mở rộng (Extensions)** → **Apps Script**
2. Xóa toàn bộ code mặc định
3. Mở file `setup/apps-script.js` trong dự án → **Copy toàn bộ code** → Paste vào Apps Script
4. Bấm **💾 Save**
5. Bấm **▶ Run** (chọn hàm `onFormSubmit`) → Cấp quyền khi được hỏi
   - Chạy lần đầu có thể báo lỗi hoặc chỉ tạo sheet, mục đích là để script tự tạo ra 2 sheet mới:
     - **EmailXacThuc**: Bảng quy định email nào được đăng cho đơn vị nào (bạn sẽ sửa bảng này)
     - **DaXacThuc**: Nơi bảng ghi các thông báo hợp lệ (web app sẽ tự động đọc)

### Cài trigger tự động chạy khi có form gửi đến:
6. Trong Apps Script (ở thanh menu bên trái) → bấm biểu tượng đồng hồ **⏰ (Triggers)**
7. Bấm **+ Add Trigger** (góc dưới bên phải):
   - Choose which function to run: `onFormSubmit`
   - Select event source: `From spreadsheet`
   - Select event type: `On form submit`
8. Bấm **Save** (Lưu)

### (Tuỳ chọn) Cài trigger tự dọn dẹp hàng ngày:
- Thêm 1 trigger khác cho hàm `cleanupExpiredAnnouncements`
- Select event source: `Time-driven`
- Select type of time based trigger: `Day timer`
- Select time of day: `1am to 2am`

---

## Bước 4: Khai báo các Email được phép (Phân quyền)

1. Trong file Google Sheets → mở sheet **"EmailXacThuc"** (do script vừa tạo)
2. Điền email của cán bộ được uỷ quyền cho từng đơn vị tương ứng:

| Đơn vị | Email hợp lệ (có thể nhiều email cách nhau bằng dấu phẩy) |
|---|---|
| Công an phường Tiên Cát | congan.tiencat1@gmail.com, nguyenvanA@gmail.com |
| Công an xã Thụy Vân | conganthuyvan.phutho@gmail.com |
| Công an xã Chu Hóa | cachuhoa@gmail.com |

> 💡 **Chú ý**: Nếu 1 đơn vị có nhiều người được quyền đăng thông báo, hãy ngăn cách các email bằng **dấu phẩy**.

3. **Bảo vệ sheet EmailXacThuc**: Click chuột phải vào tên sheet ở dưới đáy → "Bảo vệ trang tính (Protect sheet)" → Chỉ cho admin xem/sửa, không để ai khác sửa đổi được sách email này.

---

## Bước 5: Công khai dữ liệu cho Web đọc

Để map có thể đọc được dữ liệu, bạn cần share sheet "DaXacThuc" dạng web:
1. Mở sheet **"DaXacThuc"**
2. Menu **Tệp (File)** → **Chia sẻ (Share)** → **Công bố lên web (Publish to web)**
3. Chọn công bố **chỉ sheet "DaXacThuc"** → Định dạng: **Web page**
4. Bấm **Publish (Công bố)**

> Trong tính năng "Chia sẻ" của Google Sheet (nút Share góc trên bên phải), hãy đảm bảo quyền là "Bất kỳ ai có liên kết đều có thể xem" (Anyone with the link can view).

---

## Bước 6: Khai báo Sheet ID vào Bản đồ

1. Mở file `app.js` trong thư mục code dự án Bản đồ.
2. Sửa dòng cấu hình `sheetId`:

```javascript
const CONFIG = {
    // ...
    sheetId: 'PASTE_SHEET_ID_CUA_BAN_VAO_DAY',  // ← SỬA Ở ĐÂY
    sheetName: 'DaXacThuc',
    // ...
};
```

3. Save file `app.js` lại. Mở `index.html` lên. 

---

## Cách kiểm tra

1. Mở link Google Form bằng 1 tài khoản Gmail ảo.
2. Gửi 1 thông báo lên cho **Công an phường Tiên Cát**.
3. Trường hợp 1: Nếu cái Gmail bạn dùng **không có** trong sheet `EmailXacThuc`. 
   → Ở sheet `DaXacThuc` sẽ không có gì hiện lên. Bạn có thể mở Apps Script lên xem Log (Nhật ký thực thi) sẽ thấy báo lỗi đỏ là email bị từ chối.
4. Trường hợp 2: Thêm Gmail ảo của bạn vào sheet `EmailXacThuc` ở hàng của Công an phường Tiên Cát. Gửi lại Form.
   → Sang Google Sheets, bạn sẽ thấy thông báo được ghi thành công vào sheet `DaXacThuc`.
5. Đợi vài phút hoặc load lại bản đồ, bản đồ sẽ báo "⚠️ Tiên Cát: Có thông báo...".
