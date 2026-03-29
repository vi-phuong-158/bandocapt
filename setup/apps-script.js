/**
 * GOOGLE APPS SCRIPT - Xác thực email khi gửi thông báo
 * 
 * Script này chạy trên Google Sheets (gắn với Google Form).
 * Mỗi khi có form gửi, nó kiểm tra địa chỉ email người gửi.
 * Nếu email khớp với đơn vị → ghi vào sheet "DaXacThuc" (web app sẽ đọc sheet này).
 * Nếu sai email → bỏ qua.
 * 
 * CÁCH CÀI ĐẶT:
 * 1. Mở Google Sheet chứa response của Form
 * 2. Vào menu: Extensions → Apps Script
 * 3. Xóa code mặc định, paste toàn bộ code này vào
 * 4. Bấm nút ▶ (Run) để test, cấp quyền khi được hỏi
 * 5. Vào Triggers (⏰) → Add Trigger:
 *    - Function: onFormSubmit
 *    - Event source: From spreadsheet
 *    - Event type: On form submit
 * 6. Save
 */

function onFormSubmit(e) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Sheet chứa bảng email xác thực (ẩn, bảo vệ)
    let authSheet = ss.getSheetByName('EmailXacThuc');
    if (!authSheet) {
        // Tự tạo sheet EmailXacThuc nếu chưa có
        authSheet = ss.insertSheet('EmailXacThuc');
        authSheet.appendRow(['Đơn vị', 'Email hợp lệ (có thể nhiều email cách nhau bằng dấu phẩy)']);
        authSheet.appendRow(['Công an phường Tiên Cát', 'congan.tiencat@gmail.com, canbotiencat@gmail.com']);
        authSheet.appendRow(['Công an xã Thụy Vân', 'congan.thuyvan@gmail.com']);
        // ⚠️ THÊM CÁC ĐƠN VỊ KHÁC VÀO ĐÂY

        // Bảo vệ sheet - chỉ admin mới sửa được
        const protection = authSheet.protect();
        protection.setDescription('Bảng email xác thực - Không được chỉnh sửa');
        protection.setWarningOnly(true);

        Logger.log('✅ Đã tạo sheet EmailXacThuc. Hãy cập nhật email cho từng đơn vị!');
        return; // Lần đầu chỉ tạo sheet, không xử lý
    }

    // Sheet chứa thông báo đã xác thực (web app đọc sheet này)
    let validSheet = ss.getSheetByName('DaXacThuc');
    if (!validSheet) {
        validSheet = ss.insertSheet('DaXacThuc');
        validSheet.appendRow(['Thời gian', 'Đơn vị', 'Tiêu đề', 'Nội dung', 'Hiệu lực đến', 'Người gửi']);
        // Định dạng header
        validSheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#e8eaed');
    }

    // Đọc dữ liệu từ form submit
    const responses = e.namedValues;

    // Lấy email người gửi (Form bắt buộc phải bật "Thu thập địa chỉ email")
    const emailRaw = responses['Email Address'] || responses['Địa chỉ email'] || responses['Địa chỉ Email'] || responses['Username'] || [''];
    const email = emailRaw[0].trim().toLowerCase();

    const unit = (responses['Đơn vị'] || responses['Don vi'] || [''])[0].trim();
    const title = (responses['Tiêu đề thông báo'] || responses['Tieu de thong bao'] || [''])[0].trim();
    const content = (responses['Nội dung chi tiết'] || responses['Noi dung chi tiet'] || [''])[0].trim();
    const expiresAt = (responses['Hiệu lực đến'] || responses['Hieu luc den'] || [''])[0].trim();

    if (!email || !unit || !title) {
        Logger.log('⚠️ Thiếu thông tin bắt buộc. Bạn đã bật "Thu thập địa chỉ email" trong cài đặt Form chưa?');
        return;
    }

    // Kiểm tra email xác thực
    const authData = authSheet.getDataRange().getValues();
    let isValid = false;

    for (let i = 1; i < authData.length; i++) {
        const sheetUnit = String(authData[i][0]).trim();
        const sheetEmail = String(authData[i][1]).trim().toLowerCase();

        // Hỗ trợ trường hợp 1 đơn vị có nhiều email được ủy quyền, cách nhau bằng dấu phẩy
        const allowedEmails = sheetEmail.split(',').map(e => e.trim());

        if (sheetUnit === unit && allowedEmails.includes(email)) {
            isValid = true;
            break;
        }
    }

    if (isValid) {
        // ✅ Email đúng → Ghi vào sheet DaXacThuc
        const timestamp = new Date();
        validSheet.appendRow([timestamp, unit, title, content, expiresAt, email]);
        Logger.log(`✅ Thông báo hợp lệ từ "${unit}" (Email: ${email}): ${title}`);
    } else {
        // ❌ Email sai → Ghi log và bỏ qua
        Logger.log(`❌ Email KHÔNG ĐƯỢC PHÉP cho đơn vị "${unit}". Email gửi: "${email}"`);
    }
}

/**
 * Hàm tiện ích: Xóa thông báo đã hết hiệu lực
 * Chạy thủ công hoặc đặt trigger hàng ngày
 */
function cleanupExpiredAnnouncements() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('DaXacThuc');
    if (!sheet) return;

    const data = sheet.getDataRange().getValues();
    const now = new Date();
    const rowsToDelete = [];

    for (let i = data.length - 1; i >= 1; i--) {
        const expiresAt = data[i][4]; // Cột E: Hiệu lực đến
        if (expiresAt && new Date(expiresAt) < now) {
            rowsToDelete.push(i + 1); // Sheet rows are 1-indexed
        }
    }

    // Xóa từ dưới lên để không bị lệch index
    rowsToDelete.forEach(row => sheet.deleteRow(row));

    Logger.log(`🧹 Đã xóa ${rowsToDelete.length} thông báo hết hiệu lực.`);
}
