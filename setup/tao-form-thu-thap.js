/**
 * SCRIPT TẠO FORM THU THẬP DỮ LIỆU ĐỊA ĐIỂM BẢN ĐỒ SỐ
 * 
 * Cách sử dụng:
 * 1. Mở trang: https://script.google.com/
 * 2. Chọn "Dự án mới" (New project)
 * 3. Xóa code cũ, dán toàn bộ đoạn code này vào
 * 4. Bấm "Chạy" (Run) nút Play bên trên
 * 5. Cấp quyền truy cập khi được hỏi
 * 6. Xem nhật ký (Log) để lấy Link Form vừa tạo
 */

function taoFormThuThapDuLieu() {
    // 1. Tạo Google Form mới
    const form = FormApp.create('Thông tin hiển thị Bản đồ số Công an Phú Thọ');

    // 2. Thiết lập cơ bản của Form
    form.setDescription('Cán bộ phụ trách vui lòng điền các thông tin để cập nhật lên Bản đồ số Phục vụ nhân dân. Tất cả các trường có dấu (*) là bắt buộc.')
        .setConfirmationMessage('Cảm ơn đồng chí! Thông tin đã được ghi nhận để cập nhật lên bản đồ.');

    // Thu thập email người gửi đầu vào
    form.setCollectEmail(true);

    // 3. THÊM CÁC CÂU HỎI

    const danhSachPhuong = [
        "Phường Âu Cơ", "Phường Hòa Bình", "Phường Kỳ Sơn", "Phường Nông Trang",
        "Phường Phong Châu", "Phường Phú Thọ", "Phường Phúc Yên", "Phường Tân Hòa",
        "Phường Thanh Miếu", "Phường Thống Nhất", "Phường Vân Phú", "Phường Việt Trì",
        "Phường Vĩnh Phúc", "Phường Vĩnh Yên", "Phường Xuân Hòa"
    ];

    const danhSachXa = [
        "Xã An Bình", "Xã An Nghĩa", "Xã Bản Nguyên", "Xã Bao La", "Xã Bằng Luân",
        "Xã Bình Nguyên", "Xã Bình Phú", "Xã Bình Tuyền", "Xã Bình Xuyên", "Xã Cao Dương",
        "Xã Cao Phong", "Xã Cao Sơn", "Xã Cẩm Khê", "Xã Chân Mộng", "Xã Chí Đám",
        "Xã Chí Tiên", "Xã Cự Đồng", "Xã Dân Chủ", "Xã Dũng Tiến", "Xã Đà Bắc",
        "Xã Đại Đình", "Xã Đại Đồng", "Xã Đan Thượng", "Xã Đào Xá", "Xã Đạo Trù",
        "Xã Đông Thành", "Xã Đồng Lương", "Xã Đức Nhàn", "Xã Hạ Hòa", "Xã Hải Lựu",
        "Xã Hiền Lương", "Xã Hiền Quan", "Xã Hoàng An", "Xã Hoàng Cương", "Xã Hội Thịnh",
        "Xã Hợp Kim", "Xã Hợp Lý", "Xã Hùng Việt", "Xã Hương Cần", "Xã Hy Cương",
        "Xã Khả Cửu", "Xã Kim Bôi", "Xã Lạc Lương", "Xã Lạc Sơn", "Xã Lạc Thủy",
        "Xã Lai Đồng", "Xã Lâm Thao", "Xã Lập Thạch", "Xã Liên Châu", "Xã Liên Hòa",
        "Xã Liên Minh", "Xã Liên Sơn", "Xã Long Cốc", "Xã Lương Sơn", "Xã Mai Châu",
        "Xã Mai Hạ", "Xã Minh Đài", "Xã Minh Hòa", "Xã Mường Bi", "Xã Mường Động",
        "Xã Mường Hoa", "Xã Mường Thàng", "Xã Mường Vang", "Xã Nật Sơ", "Xã Ngọc Sơn",
        "Xã Nguyệt Đức", "Xã Nhân Nghĩa", "Xã Pà Cò", "Xã Phú Khê", "Xã Phú Mỹ",
        "Xã Phù Ninh", "Xã Phùng Nguyên", "Xã Quảng Yên", "Xã Quy Đức", "Xã Quyết Thắng",
        "Xã Sơn Đông", "Xã Sơn Lương", "Xã Sông Lô", "Xã Tam Dương", "Xã Tam Dương Bắc",
        "Xã Tam Đảo", "Xã Tam Hồng", "Xã Tam Nông", "Xã Tam Sơn", "Xã Tân Lạc",
        "Xã Tân Mai", "Xã Tân Pheo", "Xã Tân Sơn", "Xã Tây Cốc", "Xã Tề Lỗ",
        "Xã Thái Hòa", "Xã Thanh Ba", "Xã Thanh Sơn", "Xã Thanh Thủy", "Xã Thịnh Minh",
        "Xã Thổ Tang", "Xã Thọ Văn", "Xã Thu Cúc", "Xã Thung Nai", "Xã Thượng Cốc",
        "Xã Thượng Long", "Xã Tiên Lương", "Xã Tiên Lữ", "Xã Toàn Thắng", "Xã Trạm Thản",
        "Xã Trung Sơn", "Xã Tu Vũ", "Xã Văn Lang", "Xã Văn Miếu", "Xã Vạn Xuân",
        "Xã Vân Bán", "Xã Vân Sơn", "Xã Vĩnh An", "Xã Vĩnh Chân", "Xã Vĩnh Hưng",
        "Xã Vĩnh Phú", "Xã Vĩnh Thành", "Xã Vĩnh Tường", "Xã Võ Miếu", "Xã Xuân Đài",
        "Xã Xuân Lãng", "Xã Xuân Lũng", "Xã Xuân Viên", "Xã Yên Kỳ", "Xã Yên Lạc",
        "Xã Yên Lãng", "Xã Yên Lập", "Xã Yên Phú", "Xã Yên Sơn", "Xã Yên Thủy",
        "Xã Yên Trị"
    ];

    const allLocations = [...danhSachPhuong, ...danhSachXa]
        .map(name => `Công an ${name}`)
        .sort((a, b) => a.localeCompare(b, 'vi'));

    // Câu 1: Tên đơn vị (Bắt buộc)
    form.addListItem()
        .setTitle('Tên Đơn vị')
        .setHelpText('Chọn tên đơn vị từ danh sách trải xuống. Nếu không có tên đơn vị của bạn, vui lòng liên hệ Admin.')
        .setChoiceValues(allLocations)
        .setRequired(true);

    // Câu 2: Loại đơn vị (Bắt buộc)
    form.addMultipleChoiceItem()
        .setTitle('Loại địa điểm')
        .setChoiceValues(['Trụ sở Công an', 'Điểm cấp Căn cước (CCCD)'])
        .setRequired(true);

    // Câu 3: Địa chỉ chi tiết (Bắt buộc)
    form.addTextItem()
        .setTitle('Địa chỉ chi tiết hiện tại')
        .setHelpText('VD: Khu 4, phường Thanh Miếu, Tỉnh Phú Thọ')
        .setRequired(true);

    // Câu 4: Số điện thoại (Bắt buộc)
    // Dùng Regex thay vì requireNumber() để giữ nguyên số 0 ở đầu
    const phoneValidation = FormApp.createTextValidation()
        .requireTextMatchesPattern('^[0-9]+$')
        .setHelpText('Chỉ được nhập các chữ số viết liền. VD: 02103846114')
        .build();

    form.addTextItem()
        .setTitle('Số điện thoại trực ban / liên hệ')
        .setHelpText('Nhập số điện thoại (có số 0 ở đầu).')
        .setRequired(true)
        .setValidation(phoneValidation);

    // Câu 6: Tọa độ Google Map
    form.addTextItem()
        .setTitle('Link vị trí trên Google Maps')
        .setHelpText('Mở điện thoại đứng trước cổng cơ quan, ghim vị trí và copy link chia sẻ dán vào đây.')
        .setRequired(true);

    // Câu 7: Link ảnh trụ sở (Google Drive)
    form.addTextItem()
        .setTitle('Hình ảnh đại diện Trụ sở / Nơi làm việc')
        .setHelpText('Tải 1 ảnh phong cảnh ngang rõ trụ sở lên Google Drive (mở quyền "Bất kỳ ai có liên kết") và dán link vào đây. Khuyến khích ảnh tỉ lệ 16:9.')
        .setRequired(false);

    // 4. In kết quả ra màn hình Log
    Logger.log('==============================================');
    Logger.log('🎉 ĐÃ TẠO FORM THÀNH CÔNG 🎉');
    Logger.log('Link để bạn chỉnh sửa (Admin):');
    Logger.log(form.getEditUrl());
    Logger.log('----------------------------------------------');
    Logger.log('Link để gửi cho công an xã (Người điền):');
    Logger.log(form.getPublishedUrl());
    Logger.log('==============================================');
}
