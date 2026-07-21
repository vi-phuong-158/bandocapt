// ============================================================================
// NOI DUNG VI DU — KHONG PHAI TU VAN CHINH THUC.
//
// Cau hoi/cau tra loi/ten tai lieu duoi day chi dung de MINH HOA luong xu ly RAG
// (truy hoi -> chon tai lieu -> tra loi kem trich dan). Chung KHONG duoc doi chieu
// voi van ban phap luat hien hanh va KHONG duoc dung lam noi dung huong dan cho
// nguoi dan. Video da gan nhan "MINH HOA" co dinh o moi frame (xem RagSlideAnimation)
// va slide nhung video cung co dong chu thich tuong ung.
//
// Neu sau nay muon dung noi dung THAT, phai lay tu corpus da duoc don vi nghiep vu
// tham dinh va bo nhan minh hoa mot cach co chu dich.
// ============================================================================

// Doi tu "cap lai the tam tru" (qua nieng, chi lien quan nguoi nuoc ngoai) sang cau hoi
// pho thong hon ma cong dan Viet Nam cung hay hoi — van thuoc dung tham quyen Phong QLXNC
// nen khop voi VERIFIED_LOCATION that ben duoi. Noi dung du lieu doi chieu tu
// data/tthc-phutho-source.json (thu tuc "Cap ho chieu pho thong o trong nuoc").
export const QUESTION_TEXT = 'Làm hộ chiếu cần những giấy tờ gì?';

export const ANSWER_TEXT =
  'Cần: tờ khai theo mẫu, ảnh thẻ nền trắng, hộ chiếu cũ (nếu có); nộp tại Phòng Quản lý xuất nhập cảnh hoặc nộp trực tuyến.';

export type DocItem = { id: string; label: string; highlighted: boolean };

export const DOCUMENTS: DocItem[] = [
  { id: 'doc-luat-xnc', label: 'Luật XNC 2019', highlighted: false },
  { id: 'doc-tt31-mauho', label: 'TT 31/2023/TT-BCA', highlighted: true },
  { id: 'doc-tt110-vantay', label: 'TT 110/2020/TT-BCA', highlighted: false },
  { id: 'doc-hd-qlxnc', label: 'Hướng dẫn hồ sơ QLXNC', highlighted: true },
  { id: 'doc-tt64-phi', label: 'TT 64/2025/TT-BTC', highlighted: false },
  { id: 'doc-qd5568', label: 'QĐ 5568/QĐ-BCA', highlighted: false },
];

// Chi so 2 tai lieu duoc chon (khop DOCUMENTS[].highlighted) — dung de dinh vi
// diem xuat phat/dich cua beam va goi du lieu trong RagSlideAnimation.
export const HIGHLIGHTED_DOC_INDEXES = DOCUMENTS.reduce<number[]>((acc, doc, i) => {
  if (doc.highlighted) acc.push(i);
  return acc;
}, []);

export const CITATIONS: { id: string; label: string; docIndex: number }[] = [
  { id: 'cite-1', label: 'TT 31/2023/TT-BCA', docIndex: HIGHLIGHTED_DOC_INDEXES[0] },
  { id: 'cite-2', label: 'Hướng dẫn hồ sơ QLXNC', docIndex: HIGHLIGHTED_DOC_INDEXES[1] },
];

// Tru so da xac minh — DIA CHI THAT (khong con la vi du minh hoa), khop nguyen van voi
// hang XNC_RECEPTION_POINTS trong api/chat.js (diem "Phu Tho cu" — tru so chinh, hieu luc
// 13/4/2026, da duoc BGD Cong an tinh phe duyet). Ban ghi nay CHUA CO toa do chinh thuc
// (KHONG_TOA_DO=true trong api/chat.js) nen he thong that KHONG tao link "Chi duong" cho
// no — chi hien ten + dia chi (xem js/chatbot.js appendVerifiedLocations, nhanh hasMapsUrl
// false). VerifiedLocation.tsx phai giu dung hanh vi nay, KHONG ve nut chi duong gia.
export const VERIFIED_LOCATION = {
  name: 'Phòng Quản lý xuất nhập cảnh - Công an tỉnh Phú Thọ',
  address: 'Khu E, Công an tỉnh Phú Thọ, khu 7, phường Việt Trì, tỉnh Phú Thọ',
};
