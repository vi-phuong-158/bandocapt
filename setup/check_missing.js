const fs = require('fs');

const masterPhuong = [
    "Phường Âu Cơ", "Phường Hòa Bình", "Phường Kỳ Sơn", "Phường Nông Trang",
    "Phường Phong Châu", "Phường Phú Thọ", "Phường Phúc Yên", "Phường Tân Hòa",
    "Phường Thanh Miếu", "Phường Thống Nhất", "Phường Vân Phú", "Phường Việt Trì",
    "Phường Vĩnh Phúc", "Phường Vĩnh Yên", "Phường Xuân Hòa"
];

const masterXa = [
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

const masterList = [...masterPhuong, ...masterXa].map(name => `Công an ${name}`);

const userListRaw = `
Công an tỉnh Phú Thọ
Công an Xã Trung Sơn
Công an Xã Nguyệt Đức
Công an Xã Hương Cần
Công an Xã Thanh Sơn
Công an Xã Vĩnh An
Công an Xã Sông Lô
Công an Xã Sông Lô
Công an Xã Yên Lập
Công an Xã Quảng Yên
Công an Xã Ngọc Sơn
Công an Xã Lai Đồng
Công an Phường Vân Phú
Công an Xã Yên Trị
Công an Xã Tây Cốc
Công an Xã Đan Thượng
Công an Phường Thống Nhất
Công an Xã Hiền Lương
Công an Xã Toàn Thắng
Công an Xã Xuân Lũng
Công an Xã Lạc Thủy
Công an Phường Vĩnh Yên
Công an Xã Tân Sơn
Công an Xã Minh Hòa
Công an Xã Tề Lỗ
Công an Xã Hải Lựu
Công an Xã Hy Cương
Công an Xã Dũng Tiến
Công an Phường Phú Thọ
Công an Xã An Bình
Công an Xã Sơn Lương
Công an Phường Việt Trì
Công an Xã Yên Thủy
Công an Xã Pà Cò
Công an Phường Xuân Hòa
Công an Xã Nật Sơ
Công an Xã Đồng Lương
Công an Xã Văn Lang
Công an Xã Thượng Long
Công an Xã Quy Đức
Công an Xã Lâm Thao
Công an Xã Thu Cúc
Công an Xã Đà Bắc
Công an Xã Trạm Thản
Công an xã Tiền Phong
Công an Xã Tam Đảo
Công an Xã Cao Sơn
Công an Phường Phúc Yên
Công an Xã Tân Lạc
Công an Phường Hòa Bình
Công an Xã Cao Phong
Công an Xã Vân Sơn
Công an Xã Tam Nông
Công an Xã Tam Hồng
Công an Xã Kim Bôi
Công an Xã Hoàng An
Công an Xã Đại Đồng
Công an Xã Tân Mai
Công an Xã Chân Mộng
Công an Xã Xuân Đài
Công an Xã Vĩnh Thành
Công an Xã Dân Chủ
Công an Xã Vĩnh Chân
Công an xã Đoan Hùng
Công an Xã Yên Lạc
Công an Xã Hiền Quan
Công an Xã Hoàng Cương
Công an Xã Đào Xá
Công an Xã Đồng Lương
Công an Xã Long Cốc
Công an Xã Đông Thành
Công an Xã Sơn Đông
Công an Xã Yên Kỳ
Công an Xã Vĩnh Hưng
Công an Xã Thung Nai
Công an Xã Tam Sơn
Công an Xã Thổ Tang
Công an Xã Bản Nguyên
Công an Xã Mường Bi
Công an Xã Liên Châu
Công an Xã Tam Dương
Công an Xã Đại Đình
Công an Xã Tiên Lương
Công an Xã Tam Dương Bắc
Công an Xã Cẩm Khê
Công an Xã Xuân Viên
Công an Xã Tân Pheo
Công an Xã Quyết Thắng
Công an Xã Lương Sơn
Công an Xã Võ Miếu
Công an Xã Minh Đài
Công an Xã Thái Hòa
Công an Xã Văn Miếu
Công an Xã Thanh Thủy
Công an Xã Liên Minh
Công an Xã Liên Sơn
Công an Xã Đức Nhàn
Công an Xã Hạ Hòa
Công an Xã Khả Cửu
Công an Phường Vĩnh Phúc
Công an Xã Mai Châu
Công an Xã Hiền Quan
Công an Xã Liên Hòa
Công an Xã Hội Thịnh
Công an Xã Phú Mỹ
Công an Xã Lạc Lương
Công an Xã Phùng Nguyên
Công an Phường Kỳ Sơn
Công an Xã Thọ Văn
Công an Xã Vạn Xuân
Công an Xã Thanh Ba
Công an Xã Mường Vang
Công an Xã Hợp Lý
Công an Xã Bình Nguyên
Công an Xã Phù Ninh
Công an Xã Yên Lãng
Công an Xã Đạo Trù
Công an Xã Xuân Lãng
Công an Xã Bình Phú
Công an Xã Mường Thàng
Công an Xã Vĩnh Tường
Công an Xã Hợp Kim
Công an Phường Thanh Miếu
Công an Xã Cự Đồng
Công an Phường Nông Trang
Công an Xã Bao La
Công an Xã Chí Tiên
Công an Xã Tu Vũ
Công an Xã Chí Đám
Công an Xã Vân Bán
Công an Xã Mai Hạ
Công an Xã Vân Bán
Công an Xã Yên Sơn
Công an Xã Bằng Luân
Công an Xã Lạc Sơn
Công an Phường Phong Châu
Công an Xã Lập Thạch
Công an Xã Bình Tuyền
Công an xã Hùng Việt
`;

const userList = userListRaw.split('\n')
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(s => s.replace(/xã/g, 'Xã').replace(/phường/g, 'Phường')); 

const missing = masterList.filter(item => !userList.includes(item));

console.log("Danh sách đơn vị CHƯA điền thông tin:");
missing.forEach(item => console.log(item));

console.log("\nTổng số đơn vị trong danh sách gốc: " + masterList.length);
console.log("Số đơn vị đã điền (theo danh sách của bạn): " + new Set(userList.filter(u => masterList.includes(u))).size);
console.log("Số đơn vị còn thiếu: " + missing.length);

const unknown = userList.filter(item => !masterList.includes(item));
if (unknown.length > 0) {
    console.log("\nCác đơn vị bạn liệt kê không có trong danh sách gốc (setup):");
    unknown.forEach(item => console.log(item));
}
