/**
 * faq_data.js — Dữ liệu câu hỏi thường gặp
 *
 * Cấu trúc phẳng (flat), không lồng nhau.
 * Mỗi câu hỏi có: id, category, q (câu hỏi), a (câu trả lời HTML), tags (từ khóa tìm kiếm).
 *
 * Tại sao dùng id số nguyên?  Để so sánh nhanh với ===, không cần .trim().
 * Tại sao tags là mảng string không dấu? Tránh việc normalize lại mỗi lần search.
 */

window.FAQ_CATEGORIES = [
    { id: 'cccd',       label: 'Làm CCCD / Căn cước',    icon: 'badge' },
    { id: 'dia_diem',   label: 'Địa điểm & Giờ làm việc', icon: 'location_on' },
    { id: 'thu_tuc',    label: 'Thủ tục & Hồ sơ',         icon: 'description' },
    { id: 'lien_he',    label: 'Liên hệ & Hỗ trợ',        icon: 'phone' },
];

window.FAQ_ITEMS = [
    // ── CCCD ──────────────────────────────────────────────────────────────
    {
        id: 1, category: 'cccd',
        q: 'Làm CCCD lần đầu cần những giấy tờ gì?',
        a: 'Bạn cần mang theo:<br>1. <b>Giấy khai sinh</b> (bản gốc hoặc bản sao có chứng thực).<br>2. <b>Sổ hộ khẩu</b> hoặc thông tin đăng ký thường trú.<br>3. Nếu dưới 14 tuổi: phải có cha/mẹ/người giám hộ đi kèm.',
        tags: ['lam cccd', 'lan dau', 'giay to', 'ho so', 'khai sinh', 'can cuoc'],
    },
    {
        id: 2, category: 'cccd',
        q: 'CCCD bị mất, làm lại mất bao lâu và tốn bao nhiêu tiền?',
        a: '<b>Thời gian:</b> Tối đa 07 ngày làm việc.<br><b>Lệ phí:</b> 70.000 đồng.<br>Mang theo: Tờ khai (nhận tại nơi làm) + ảnh 4×6 (nếu được yêu cầu). Bạn không cần ảnh vì cán bộ sẽ chụp tại chỗ.',
        tags: ['mat cccd', 'lam lai', 'phi', 'le phi', 'bao lau', 'thoi gian'],
    },
    {
        id: 3, category: 'cccd',
        q: 'Trẻ em dưới 14 tuổi có bắt buộc làm CCCD không?',
        a: '<b>Không bắt buộc</b>, nhưng được quyền làm.<br>Nếu muốn làm: cha/mẹ đưa trẻ đến trực tiếp điểm cấp CCCD để cán bộ thu nhận ảnh và vân tay. <br>Trẻ dưới 6 tuổi: làm online hoàn toàn qua VNeID, không cần đưa trẻ đến.',
        tags: ['tre em', 'duoi 14 tuoi', 'con nho', 'bat buoc', 'cccd'],
    },
    {
        id: 4, category: 'cccd',
        q: 'Đổi CCCD khi nào? Các mốc tuổi bắt buộc đổi?',
        a: 'Bắt buộc đổi khi đủ các mốc tuổi: <b>14, 25, 40, 60</b>.<br>Ngoài ra đổi khi: thẻ hỏng, thay đổi thông tin cá nhân, hoặc thông tin trên thẻ không còn chính xác.',
        tags: ['doi the', 'het han', '14 tuoi', '25 tuoi', '40 tuoi', '60 tuoi'],
    },
    {
        id: 5, category: 'cccd',
        q: 'Kích hoạt VNeID mức 2 tại điểm cấp CCCD được không?',
        a: '<b>Được.</b> Mang theo thẻ CCCD gắn chíp và điện thoại chính chủ.<br>Cán bộ sẽ thu nhận vân tay và ảnh chân dung để xác thực, sau đó hướng dẫn bạn kích hoạt tài khoản VNeID Mức 2 ngay tại chỗ.',
        tags: ['vneid', 'kich hoat', 'muc 2', 'dien thoai', 'cccd chip'],
    },

    // ── ĐỊA ĐIỂM ──────────────────────────────────────────────────────────
    {
        id: 6, category: 'dia_diem',
        q: 'Giờ làm việc của các điểm cấp CCCD là mấy giờ?',
        a: '<b>Sáng:</b> 07:30 – 11:30<br><b>Chiều:</b> 13:00 – 16:30<br><b>Thứ 7:</b> Sáng 07:30 – 11:30 (một số điểm)<br><b>Chủ nhật và lễ tết:</b> Nghỉ.<br>💡 Bạn có thể kiểm tra trạng thái mở/đóng cửa trực tiếp trên ứng dụng này.',
        tags: ['gio lam viec', 'may gio', 'thu 7', 'nghi', 'mo cua', 'dong cua'],
    },
    {
        id: 7, category: 'dia_diem',
        q: 'Làm sao tìm điểm cấp CCCD gần tôi nhất?',
        a: 'Nhấn nút <b>"Gần tôi"</b> ở thanh lọc phía trên, ứng dụng sẽ tự định vị và hiển thị 5 điểm cấp CCCD gần bạn nhất, kèm khoảng cách.<br>Hoặc nhấn nút <b>vị trí xanh</b> ở góc dưới phải bản đồ.',
        tags: ['gan toi', 'tim kiem', 'vi tri', 'gan nhat', 'diem cap'],
    },
    {
        id: 8, category: 'dia_diem',
        q: 'Tìm điểm cấp CCCD ở quận/huyện cụ thể như thế nào?',
        a: 'Nhập tên quận, huyện hoặc phường xã vào ô <b>tìm kiếm</b> ở đầu trang.<br>Ví dụ: gõ "Việt Trì" hoặc "Phù Ninh" để lọc các điểm trong khu vực đó.',
        tags: ['tim theo quan', 'huyen', 'xa', 'tim kiem', 'loc'],
    },
    {
        id: 9, category: 'dia_diem',
        q: 'Ứng dụng này có thể chỉ đường đến điểm cấp CCCD không?',
        a: '<b>Có.</b> Nhấn vào bất kỳ điểm nào trên bản đồ hoặc trong danh sách.<br>Trong trang chi tiết, nhấn nút <b>"Chỉ đường"</b> — ứng dụng sẽ mở Google Maps với chỉ đường đến điểm đó.',
        tags: ['chi duong', 'duong di', 'google maps', 'ban do'],
    },

    // ── THỦ TỤC ────────────────────────────────────────────────────────────
    {
        id: 10, category: 'thu_tuc',
        q: 'Đăng ký tạm trú cần chuẩn bị những gì?',
        a: '<b>Hồ sơ gồm:</b><br>1. Tờ khai thay đổi thông tin cư trú (Mẫu CT01).<br>2. Hợp đồng thuê nhà hoặc giấy tờ chứng minh chỗ ở hợp pháp.<br>3. CCCD của người đăng ký.<br><b>Lệ phí:</b> 15.000đ (trực tiếp) / 7.000đ (online).<br><b>Thời gian:</b> 03 ngày làm việc.',
        tags: ['tam tru', 'dang ky', 'ho so', 'giay to', 'thue nha', 'ct01'],
    },
    {
        id: 11, category: 'thu_tuc',
        q: 'Sang tên xe máy hoặc ô tô cần làm gì?',
        a: '<b>Chủ cũ:</b> Làm thủ tục thu hồi biển số (trong 30 ngày từ ngày bán).<br><b>Chủ mới:</b> Làm thủ tục sang tên, cần chứng nhận thu hồi của chủ cũ.<br>Thực hiện tại Công an tỉnh/thành phố (phòng quản lý xe).<br>⚠️ Quá 30 ngày sẽ bị phạt vi phạm hành chính.',
        tags: ['sang ten', 'xe may', 'o to', 'mua ban', 'bien so', 'thu hoi'],
    },
    {
        id: 12, category: 'thu_tuc',
        q: 'Đăng ký cư trú online được không? Làm ở đâu?',
        a: '<b>Được.</b> Truy cập: <a href="https://dichvucong.gov.vn" target="_blank" rel="noopener" class="faq-link">dichvucong.gov.vn</a> hoặc ứng dụng <b>VNeID</b>.<br>Cần tài khoản định danh điện tử Mức 2 để thực hiện.<br>Giấy tờ: Chụp ảnh bản gốc, không cần công chứng.',
        tags: ['online', 'cu tru', 'dich vu cong', 'vneid', 'qua mang'],
    },

    // ── LIÊN HỆ ────────────────────────────────────────────────────────────
    {
        id: 13, category: 'lien_he',
        q: 'Số điện thoại khẩn cấp Công an là bao nhiêu?',
        a: '<b>🚨 Công an:</b> <a href="tel:113" class="faq-link font-bold text-lg">113</a><br><b>🚑 Cấp cứu:</b> <a href="tel:115" class="faq-link font-bold text-lg">115</a><br><b>🔥 Cứu hỏa:</b> <a href="tel:114" class="faq-link font-bold text-lg">114</a>',
        tags: ['khan cap', 'so dien thoai', '113', 'cong an', 'goi dien'],
    },
    {
        id: 14, category: 'lien_he',
        q: 'Cần phản ánh vấn đề an ninh trật tự thì liên hệ đâu?',
        a: 'Bạn có thể:<br>1. Gọi <b>113</b> để báo khẩn cấp.<br>2. Đến trực tiếp Công an phường/xã/thị trấn nơi xảy ra sự việc.<br>3. Phản ánh qua ứng dụng <b>VNeID</b> (mục "Phản ánh, kiến nghị").',
        tags: ['phan anh', 'an ninh', 'trat tu', 'lien he', 'bao cao'],
    },
];
