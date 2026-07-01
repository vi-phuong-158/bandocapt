/**
 * export-pinecone-dashboard.gs -- Xuat toan bo du lieu Pinecone ra Google Sheet de theo doi
 *
 * CACH DUNG:
 *   1. Tao 1 Google Sheet moi (hoac mo sheet trong da co).
 *   2. Extensions > Apps Script, xoa code mac dinh, paste toan bo file nay vao.
 *   3. Vao Project Settings (bieu tuong banh rang o menu trai) > Script Properties > Add script property:
 *        PINECONE_API_KEY = <gia tri PINECONE_API_KEY trong file .env cua du an>
 *      (Cac gia tri khac - PINECONE_INDEX_NAME, PINECONE_NAMESPACE, PINECONE_INDEX_HOST - co gia tri
 *       mac dinh khop voi cau hinh hien tai cua du an; script se tu resolve host neu chua co, KHONG
 *       can dien them tru khi du an doi sang index/namespace khac.)
 *   4. Quay lai Script Editor, chon ham "exportPineconeDashboard" tren thanh cong cu, nhan Run.
 *   5. Lan dau chay se hien hop thoai xin quyen - chon tai khoan Google, bam "Advanced" > "Go to
 *      export-pinecone-dashboard (unsafe)" > Allow. Day la canh bao mac dinh cua Google cho script
 *      tu viet, khong phai loi. Script chi goi API Pinecone qua HTTPS, khong doc du lieu Google khac.
 *   6. Xem ket qua: sheet se co 5 tab - "Tong_quan", "TTHC", "Guide", "Law", "Truso_Legacy".
 *   7. Muon refresh du lieu moi nhat: chay lai ham exportPineconeDashboard bat ky luc nao (script se
 *      xoa va ghi lai toan bo, khong bi trung lap).
 *   8. (Tuy chon) Muon tu dong refresh moi ngay: chay ham "setupDailyTrigger" mot lan duy nhat.
 *      Muon tat: chay ham "removeDailyTrigger".
 *
 * LUU Y BAO MAT: PINECONE_API_KEY luu trong Script Properties chi nguoi co quyen Edit script moi xem
 * duoc (nguoi chi xem Sheet KHONG thay duoc key nay). Khong paste API key truc tiep vao code, khong
 * chia se quyen Edit Apps Script cho nguoi ngoai.
 */

// ============================================================
// CAU HINH & GOI API PINECONE
// ============================================================

function getPineconeConfig_() {
  const props = PropertiesService.getScriptProperties();
  const apiKey = props.getProperty('PINECONE_API_KEY');
  if (!apiKey) {
    throw new Error('Thieu PINECONE_API_KEY trong Script Properties. Vao Project Settings (banh rang) > Script Properties de them.');
  }
  const namespace = props.getProperty('PINECONE_NAMESPACE') || 'chatbot-tthc-xnc';
  const indexName = props.getProperty('PINECONE_INDEX_NAME') || 'chatbot-tthc-xnc';
  let host = props.getProperty('PINECONE_INDEX_HOST');
  if (!host) {
    host = resolveIndexHost_(apiKey, indexName);
    props.setProperty('PINECONE_INDEX_HOST', host);
  }
  return { apiKey: apiKey, host: host, namespace: namespace };
}

function resolveIndexHost_(apiKey, indexName) {
  const url = 'https://api.pinecone.io/indexes/' + encodeURIComponent(indexName);
  const res = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { 'Api-Key': apiKey, 'X-Pinecone-API-Version': '2024-07' },
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('Khong resolve duoc host cho index "' + indexName + '": ' + res.getContentText().slice(0, 300));
  }
  const data = JSON.parse(res.getContentText());
  return data.host;
}

function pineconeFetch_(path) {
  const cfg = getPineconeConfig_();
  const url = 'https://' + cfg.host + path;
  const res = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { 'Api-Key': cfg.apiKey, 'X-Pinecone-API-Version': '2024-07' },
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('Pinecone API loi ' + code + ': ' + res.getContentText().slice(0, 300));
  }
  return JSON.parse(res.getContentText());
}

function listAllIds_() {
  const cfg = getPineconeConfig_();
  const ids = [];
  let paginationToken = null;
  do {
    let path = '/vectors/list?namespace=' + encodeURIComponent(cfg.namespace) + '&limit=100';
    if (paginationToken) path += '&paginationToken=' + encodeURIComponent(paginationToken);
    const data = pineconeFetch_(path);
    (data.vectors || []).forEach(function (v) { ids.push(v.id); });
    paginationToken = data.pagination && data.pagination.next;
  } while (paginationToken);
  return ids;
}

function fetchMetadataBatch_(ids) {
  const cfg = getPineconeConfig_();
  const records = {};
  const chunkSize = 90; // Pinecone gioi han so ids/lan fetch qua query string, giu du du an toan
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const qs = chunk.map(function (id) { return 'ids=' + encodeURIComponent(id); }).join('&');
    const path = '/vectors/fetch?' + qs + '&namespace=' + encodeURIComponent(cfg.namespace);
    const data = pineconeFetch_(path);
    Object.keys(data.vectors || {}).forEach(function (id) {
      records[id] = data.vectors[id];
    });
  }
  return records;
}

// ============================================================
// TIEN ICH
// ============================================================

function truncate_(text, len) {
  const s = String(text || '');
  return s.length > len ? s.slice(0, len) + '...' : s;
}

function deriveStatus_(md) {
  if (md.le_phi === 'Chưa xác minh' || md.phi === 'Chưa xác minh') return 'CẦN XÁC MINH';
  if (/Phí\/lệ phí:/.test(md.text || '')) return 'LỖI CŨ (chưa vá)';
  return 'OK';
}

function writeSheet_(ss, tabName, headers, rows) {
  let sheet = ss.getSheetByName(tabName);
  if (sheet) sheet.clear();
  else sheet = ss.insertSheet(tabName);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
  sheet.setFrozenRows(1);
  try { sheet.autoResizeColumns(1, headers.length); } catch (e) { /* bo qua neu sheet qua rong */ }
  return sheet;
}

// ============================================================
// HAM CHINH
// ============================================================

function exportPineconeDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const allIds = listAllIds_();
  Logger.log('Tong so vector: ' + allIds.length);
  const records = fetchMetadataBatch_(allIds);

  const tthcRows = [];
  const guideRows = [];
  const lawRows = [];
  const trusoRows = [];
  let otherCount = 0;

  Object.keys(records).forEach(function (id) {
    const rec = records[id];
    const md = rec.metadata || {};
    const textLen = (md.text || '').length;

    if (md.source_type === 'tthc') {
      tthcRows.push([
        id,
        md.procedure_id || '',
        md.title || '',
        md.cap || '',
        md.loai_thu_tuc || '',
        md.le_phi || '',
        md.phi || '',
        deriveStatus_(md),
        md.source_decision || '',
        md.content_hash || '',
        textLen,
        truncate_(md.text, 200),
      ]);
    } else if (md.source_type === 'guide') {
      guideRows.push([
        id,
        md.procedure_title || md.article || md.title || '',
        md.section || '',
        md.cap_label || md.cap || '',
        md.source_file || md.van_ban || '',
        textLen,
        truncate_(md.text, 200),
      ]);
    } else if (id.indexOf('law_') === 0) {
      lawRows.push([
        id,
        md.title || md.van_ban || '',
        md.dieu || md.article || '',
        textLen,
        truncate_(md.text, 200),
      ]);
    } else if (id.indexOf('truso-') === 0) {
      trusoRows.push([
        id,
        md.name || md.title || '',
        'KHÔNG DÙNG — đã loại khỏi runtime chatbot (xem docs/brain/01-architecture.md)',
        textLen,
      ]);
    } else {
      otherCount++;
    }
  });

  writeSheet_(
    ss, 'TTHC',
    ['ID', 'Procedure ID', 'Tên thủ tục', 'Cấp', 'Loại thủ tục', 'Lệ phí', 'Phí', 'Trạng thái', 'Căn cứ/QĐ', 'Content Hash', 'Độ dài text', 'Xem trước'],
    tthcRows
  );
  writeSheet_(
    ss, 'Guide',
    ['ID', 'Tiêu đề/Thủ tục', 'Mục wiki', 'Cấp', 'Nguồn file', 'Độ dài text', 'Xem trước'],
    guideRows
  );
  writeSheet_(
    ss, 'Law',
    ['ID', 'Văn bản', 'Điều', 'Độ dài text', 'Xem trước'],
    lawRows
  );
  writeSheet_(
    ss, 'Truso_Legacy',
    ['ID', 'Tên', 'Ghi chú', 'Độ dài text'],
    trusoRows
  );

  let summarySheet = ss.getSheetByName('Tong_quan');
  if (summarySheet) summarySheet.clear();
  else summarySheet = ss.insertSheet('Tong_quan', 0);
  summarySheet.getRange(1, 1, 7, 2).setValues([
    ['Tổng số vector', allIds.length],
    ['TTHC (thủ tục hành chính — có lệ phí/phí)', tthcRows.length],
    ['Guide (wiki/hướng dẫn)', guideRows.length],
    ['Law (điều luật)', lawRows.length],
    ['Truso (legacy, KHÔNG dùng cho runtime)', trusoRows.length],
    ['Khác/chưa phân loại', otherCount],
    ['Cập nhật lúc', new Date().toString()],
  ]);
  summarySheet.getRange(1, 1, 7, 1).setFontWeight('bold');
  summarySheet.autoResizeColumns(1, 2);

  const tthcNeedVerify = tthcRows.filter(function (r) { return r[7] === 'CẦN XÁC MINH'; }).length;
  const tthcOldBug = tthcRows.filter(function (r) { return r[7] === 'LỖI CŨ (chưa vá)'; }).length;
  SpreadsheetApp.getUi().alert(
    'Xong! Đã đọc ' + allIds.length + ' vector.\n' +
    'TTHC: ' + tthcRows.length + ' record — trong đó ' + tthcNeedVerify + ' "CẦN XÁC MINH", ' + tthcOldBug + ' còn lỗi cũ.\n' +
    'Xem chi tiết ở các tab TTHC / Guide / Law / Truso_Legacy.'
  );
}

// ============================================================
// (TUY CHON) TU DONG REFRESH MOI NGAY
// ============================================================

function setupDailyTrigger() {
  removeDailyTrigger();
  ScriptApp.newTrigger('exportPineconeDashboard')
    .timeBased()
    .everyDays(1)
    .atHour(7)
    .create();
  SpreadsheetApp.getUi().alert('Đã bật tự động refresh dashboard mỗi ngày lúc ~7h sáng.');
}

function removeDailyTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function (t) {
    if (t.getHandlerFunction() === 'exportPineconeDashboard') {
      ScriptApp.deleteTrigger(t);
    }
  });
}
