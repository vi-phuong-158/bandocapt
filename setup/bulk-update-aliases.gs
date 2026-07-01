/**
 * bulk-update-aliases.gs -- TU DONG TAO tu data/alias_draft.csv
 *
 * CACH DUNG:
 *   1. Mo Apps Script cua Google Sheet (Extensions > Apps Script).
 *   2. Paste toan bo file nay vao mot tab script moi.
 *   3. Chon ham bulkUpdateAliases va nhan Run.
 *   4. Xem log (View > Logs) de xac nhan.
 *   5. Xoa file nay khoi Apps Script sau khi chay xong.
 *
 * Tu nhan dien ten cot tieng Viet hoac tieng Anh.
 * Tu tao cot search_aliases neu chua co.
 */

// == DU LIEU ALIAS (148 don vi) ================================
var ALIAS_MAP = {
  "cong an xa hy cuong": "thanh đình|chu hóa|hy cương",
  "cong an xa lam thao": "hùng sơn|lâm thao|thạch sơn",
  "cong an xa xuan lung": "tiên kiên|xuân huy|xuân lũng",
  "cong an xa phung nguyen": "tứ xã|sơn vi|phùng nguyên",
  "cong an xa ban nguyen": "cao xá|vĩnh lại|bản nguyên",
  "cong an xa phu ninh": "phong châu|phú nham|phú lộc|phù ninh",
  "cong an xa dan chu": "bảo thanh|trị quận|hạ giáp|gia thanh",
  "cong an xa phu my": "liên hoa|lệ mỹ|phú mỹ",
  "cong an xa tram than": "tiên phú|trung giáp|trạm thản",
  "cong an xa binh phu": "tiên du|an đạo|bình phú",
  "cong an xa thanh ba": "thanh ba|đồng xuân|hanh cù|vân lĩnh",
  "cong an xa quang yen": "đại an|đông lĩnh|quảng yên",
  "cong an xa hoang cuong": "ninh dân|mạn lạn|hoàng cương",
  "cong an xa dong thanh": "khải xuân|võ lao|đông thành",
  "cong an xa chi tien": "sơn cương|thanh hà|chí tiên",
  "cong an xa lien minh": "đỗ sơn|đỗ xuyên|lương lỗ",
  "cong an xa doan hung": "đoan hùng|hợp nhất|ngọc quan",
  "cong an xa tay coc": "phú lâm|ca đình|tây cốc",
  "cong an xa chan mong": "hùng long|yên kiện|chân mộng",
  "cong an xa chi dam": "hùng xuyên|chí đám",
  "cong an xa bang luan": "bằng doãn|phúc lai|bằng luân",
  "cong an xa ha hoa": "hạ hòa|minh hạc|ấm hạ|gia điền",
  "cong an xa dan thuong": "tứ hiệp|đại phạm|hà lương|đan thượng",
  "cong an xa yen ky": "hương xạ|phương viên|yên kỳ",
  "cong an xa vinh chan": "lang sơn|yên luật|vĩnh chân",
  "cong an xa van lang": "vô tranh|bằng giã|minh côi|văn lang",
  "cong an xa hien luong": "hiền lương|xuân áng|hiền lương hạ hòa",
  "cong an xa cam khe": "cẩm khê|minh tân|phong thịnh",
  "cong an xa phu khe": "hương lung|phú khê",
  "cong an xa hung viet": "nhật tiến|hùng việt",
  "cong an xa dong luong": "điêu lương|yên dưỡng|đồng lương",
  "cong an xa tien luong": "phượng vĩ|minh thắng|tiên lương",
  "cong an xa van ban": "tùng khê|tam sơn|văn bán|tam sơn cẩm khê",
  "cong an xa tam nong": "hưng hóa|dân quyền|hương nộn",
  "cong an xa tho van": "dị nậu|tề lễ|thọ văn",
  "cong an xa van xuan": "quang húc|lam sơn|vạn xuân",
  "cong an xa hien quan": "thanh uyên|bắc sơn|hiền quan",
  "cong an xa thanh thuy": "sơn thủy|đoan hạ|bảo yên|thanh thủy",
  "cong an xa dao xa": "xuân lộc|thạch đồng|tân phương|đào xá",
  "cong an xa tu vu": "đồng trung|hoàng xá|tu vũ",
  "cong an xa thanh son": "thanh sơn|sơn hùng|giáp lai|thạch khoán|thục luyện",
  "cong an xa vo mieu": "địch quả|cự thắng|võ miếu",
  "cong an xa van mieu": "tân lập|tân minh|văn miếu|tân lập thanh sơn|tân minh thanh sơn",
  "cong an xa cu dong": "tất thắng|thắng sơn|cự đồng",
  "cong an xa huong can": "yên lương|yên lãng|hương cần",
  "cong an xa yen son": "tinh nhuệ|lương nha|yên sơn",
  "cong an xa kha cuu": "đông cửu|thượng cửu|khả cửu",
  "cong an xa tan son": "tân phú|thu ngạc|thạch kiệt",
  "cong an xa minh dai": "mỹ thuận|văn luông|minh đài",
  "cong an xa lai dong": "kiệt sơn|tân sơn|đồng sơn|lai đồng",
  "cong an xa xuan dai": "kim thượng|xuân sơn|xuân đài",
  "cong an xa long coc": "tam thanh|vinh tiền|long cốc",
  "cong an xa thu cuc": "",
  "cong an xa trung son": "",
  "cong an xa yen lap": "yên lập|đồng thịnh|hưng long|đồng lạc|đồng thịnh yên lập",
  "cong an xa thuong long": "phúc khánh|nga hoàng|thượng long",
  "cong an xa son luong": "mỹ lương|mỹ lung|lương sơn",
  "cong an xa xuan vien": "xuân thủy|xuân an|xuân viên",
  "cong an xa minh hoa": "ngọc lập|ngọc đồng|minh hòa",
  "cong an xa tam son": "tân lập|đồng quế|tam sơn|tân lập sông lô|tam sơn sông lô",
  "cong an xa song lo": "đồng thịnh|tứ yên|đức bác|yên thạch|đồng thịnh sông lô",
  "cong an xa hai luu": "nhân đạo|đôn nhân|phương khoan|hải lựu",
  "cong an xa yen lang": "quang yên|lãng công",
  "cong an xa lap thach": "lập thạch|xuân hòa|tử du|vân trục",
  "cong an xa tien lu": "xuân lôi|văn quán|đồng ích|tiên lữ",
  "cong an xa thai hoa": "bắc bình|liễn sơn|thái hòa",
  "cong an xa lien hoa": "hoa sơn|bàn giản|liên hòa",
  "cong an xa hop ly": "ngọc mỹ|quang sơn|hợp lý",
  "cong an xa son dong": "tây sơn|cao phong|sơn đông",
  "cong an xa tam dao": "hợp châu|tam đảo|hồ sơn|minh quang",
  "cong an xa dai dinh": "đại đình|bồ lý",
  "cong an xa dao tru": "yên dương|đạo trù",
  "cong an xa tam duong": "hợp hòa|kim long|hướng đạo|đạo tú",
  "cong an xa hoi thinh": "duy phiên|thanh vân|hội thịnh",
  "cong an xa hoang an": "hoàng đan|hoàng lâu|an hòa",
  "cong an xa tam duong bac": "đồng tĩnh|hoàng hoa|tam quan",
  "cong an xa vinh tuong": "vĩnh tường|tứ trưng|lương điền|vũ di",
  "cong an xa tho tang": "thổ tang|thượng trưng|tuân chính",
  "cong an xa vinh hung": "nghĩa hưng|yên lập|đại đồng|yên lập vĩnh tường",
  "cong an xa vinh an": "kim xá|yên bình|chấn hưng",
  "cong an xa vinh phu": "an nhân|vĩnh thịnh|ngũ kiên|vĩnh phú",
  "cong an xa vinh thanh": "sao đại việt|lũng hòa|tân phú",
  "cong an xa yen lac": "yên lạc|bình định|đồng cương",
  "cong an xa te lo": "đồng văn|trung nguyên|tề lỗ",
  "cong an xa lien chau": "đại tự|hồng châu|liên châu",
  "cong an xa tam hong": "tam hồng|yên phương|yên đồng",
  "cong an xa nguyet duc": "văn tiến|trung kiên|trung hà|nguyệt đức",
  "cong an xa binh nguyen": "hương canh|tam hợp|quất lưu|sơn lôi",
  "cong an xa xuan lang": "thanh lãng|đạo đức|tân phong|phú xuân",
  "cong an xa binh xuyen": "gia khánh|hương sơn|thiện kế",
  "cong an xa binh tuyen": "bá hiến|trung mỹ",
  "cong an xa thinh minh": "hợp thành|quang tiến|thịnh minh",
  "cong an xa cao phong": "cao phong|hợp phong|thu phong",
  "cong an xa muong thang": "dũng phong|nam phong|tây phong|thạch yên",
  "cong an xa thung nai": "bắc phong|bình thanh|thung nai",
  "cong an xa da bac": "đà bắc|hiền lương|toàn sơn|tú lý|hiền lương đà bắc",
  "cong an xa cao son": "tân minh|cao sơn|cao sơn đà bắc|tân minh đà bắc",
  "cong an xa duc nhan": "mường chiềng|nánh nghê",
  "cong an xa quy duc": "đoàn kết|đồng ruộng|trung thành|yên hoà",
  "cong an xa tan pheo": "đồng chum|giáp đắt|tân pheo",
  "cong an xa tien phong": "tiền phong|vầy nưa",
  "cong an xa kim boi": "bo|vĩnh đồng|kim bôi",
  "cong an xa muong dong": "đông bắc|hợp tiến|tú sơn|vĩnh tiến",
  "cong an xa dung tien": "cuối hạ|mỵ hòa|nuông dăm",
  "cong an xa hop kim": "kim lập|nam thượng|sào báy",
  "cong an xa nat son": "xuân thủy|bình sơn|đú sáng|hùng sơn",
  "cong an xa lac son": "vụ bản|hương nhượng|vũ bình",
  "cong an xa muong vang": "tân lập|quý hòa|tuân đạo|tân lập lạc sơn",
  "cong an xa dai dong": "ân nghĩa|tân mỹ|yên nghiệp",
  "cong an xa ngoc son": "ngọc lâu|tự do|ngọc sơn",
  "cong an xa nhan nghia": "mỹ thành|văn nghĩa|nhân nghĩa",
  "cong an xa quyet thang": "chí đạo|định cư|quyết thắng",
  "cong an xa thuong coc": "miền đồi|văn sơn|thượng cốc",
  "cong an xa yen phu": "bình hẻm|xuất hóa|yên phú",
  "cong an xa lac thuy": "chi nê|đồng tâm|khoan dụ|yên bồng",
  "cong an xa an binh": "hưng thi|thống nhất|an bình",
  "cong an xa an nghia": "ba hàng đồi|phú nghĩa|phú thành",
  "cong an xa luong son": "lương sơn|hòa sơn|lâm sơn|nhuận trạch|tân vinh|cao sơn|cao sơn lương sơn",
  "cong an xa cao duong": "thanh cao|thanh sơn|cao dương",
  "cong an xa lien son": "cư yên|liên sơn|cao sơn|cao sơn lương sơn",
  "cong an xa mai chau": "mai châu|nà phòn|thành sơn|tòng đậu|đồng tân",
  "cong an xa bao la": "mai hịch|xăm khòe|bao la",
  "cong an xa mai ha": "chiềng châu|vạn mai|mai hạ",
  "cong an xa pa co": "cun pheo|hang kia|pà cò|đồng tân",
  "cong an xa tan mai": "sơn thủy|tân thành",
  "cong an xa tan lac": "mãn đức|ngọc mỹ|đông lai|thanh hối|tử nê",
  "cong an xa muong bi": "mỹ hòa|phong phú|phú cường",
  "cong an xa muong hoa": "phú vinh|suối hoa",
  "cong an xa toan thang": "gia mô|lỗ sơn|nhân mỹ",
  "cong an xa van son": "ngổ luông|quyết chiến|vân sơn",
  "cong an xa yen thuy": "hàng trạm|lạc thịnh|phú lai",
  "cong an xa lac luong": "bảo hiệu|đa phúc|lạc sỹ|lạc lương",
  "cong an xa yen tri": "đoàn kết|hữu lợi|ngọc lương|yên trị",
  "cong an phuong viet tri": "tân dân|gia cẩm|minh nông|dữu lâu|trưng vương",
  "cong an phuong nong trang": "minh phương|nông trang|thụy vân",
  "cong an phuong thanh mieu": "thọ sơn|tiên cát|bạch hạc|thanh miếu",
  "cong an phuong van phu": "vân phú|phượng lâu|hùng lô|kim đức",
  "cong an phuong phu tho": "hùng vương|văn lung|hà lộc",
  "cong an phuong phong chau": "phong châu|phú hộ|hà thạch",
  "cong an phuong au co": "thanh vinh|âu cơ|thanh minh",
  "cong an phuong vinh phuc": "định trung|liên bảo|khai quang|ngô quyền|đống đa",
  "cong an phuong vinh yen": "tích sơn|hội hợp|đồng tâm|thanh trù",
  "cong an phuong phuc yen": "hùng vương|hai bà trưng|phúc thắng|tiền châu|nam viêm",
  "cong an phuong xuan hoa": "đồng xuân|xuân hòa|cao minh|ngọc thanh",
  "cong an phuong hoa binh": "đồng tiến|hữu nghị|phương lâm|quỳnh lâm|tân thịnh|thịnh lang|trung minh",
  "cong an phuong ky son": "kỳ sơn|độc lập|mông hóa",
  "cong an phuong tan hoa": "tân hòa|hòa bình|yên mông",
  "cong an phuong thong nhat": "dân chủ|thái bình|thống nhất|vầy nưa"
};

// Ten cot chap nhan duoc cho truong "ten don vi"
var NAME_HEADERS  = ['name', 'ten don vi', 'ten dia diem', 'ten tru so'];
// Ten cot chap nhan duoc cho truong "alias tim kiem"
var ALIAS_HEADERS = ['search_aliases', 'search aliases', 'alias tim kiem', 'aliases', 'alias'];

// == CHUAN HOA: bo dau, thuong, bo ky tu dac biet =======================

function _norm(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Tim index cot theo danh sach ten chap nhan duoc
function _findCol(headers, candidates) {
  for (var i = 0; i < headers.length; i++) {
    var h = _norm(headers[i]);
    for (var j = 0; j < candidates.length; j++) {
      if (h === candidates[j]) return i;
    }
  }
  return -1;
}

// == HAM CHINH ============================================================

function bulkUpdateAliases() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Thu tim sheet Published_Locations truoc, neu khong co thi dung sheet dang active
  var sheet = ss.getSheetByName('Published_Locations') || ss.getActiveSheet();
  Logger.log('Dang xu ly sheet: ' + sheet.getName());

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    Logger.log('Sheet trong hoac chi co header -- khong co gi de cap nhat.');
    return;
  }

  var rawHeaders = data[0];
  var headers = rawHeaders.map(function(h) { return String(h); });

  var nameCol  = _findCol(headers, NAME_HEADERS);
  var aliasCol = _findCol(headers, ALIAS_HEADERS);

  if (nameCol < 0) {
    Logger.log('ERROR: Khong tim thay cot ten don vi.');
    Logger.log('Headers hien tai: ' + headers.join(' | '));
    Logger.log('Script nhan dien duoc cac ten cot: ' + NAME_HEADERS.join(', '));
    return;
  }

  // Neu chua co cot alias --> tao moi o cuoi
  if (aliasCol < 0) {
    aliasCol = headers.length;
    sheet.getRange(1, aliasCol + 1).setValue('search_aliases');
    Logger.log('Da tao cot search_aliases o cot ' + (aliasCol + 1));
  }

  Logger.log('Cot ten don vi   : ' + headers[nameCol] + ' (cot ' + (nameCol + 1) + ')');
  Logger.log('Cot search_aliases: cot ' + (aliasCol + 1));

  var updated = 0, skipped = 0, notFound = [];

  for (var i = 1; i < data.length; i++) {
    var unitName = String(data[i][nameCol] || '').trim();
    if (!unitName) continue;

    var key = _norm(unitName);
    if (!(key in ALIAS_MAP)) {
      notFound.push(unitName);
      skipped++;
      continue;
    }

    sheet.getRange(i + 1, aliasCol + 1).setValue(ALIAS_MAP[key]);
    Logger.log('[OK] ' + unitName);
    updated++;
  }

  Logger.log('----------------------------------------------');
  Logger.log('Da cap nhat  : ' + updated + ' dong');
  Logger.log('Bo qua       : ' + skipped + ' dong (khong co trong ban do alias)');
  if (notFound.length > 0) {
    Logger.log('Ten khong khop (kiem tra lai chinh ta):');
    notFound.forEach(function(n) { Logger.log('  * ' + n); });
  }
  Logger.log('Xong. Cache server tu lam moi sau <=60 giay.');
}