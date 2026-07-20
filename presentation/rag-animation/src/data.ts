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

export const QUESTION_TEXT = 'Thủ tục cấp lại thẻ tạm trú cần giấy tờ gì?';

export const ANSWER_TEXT =
  'Cần: đơn đề nghị cấp lại, hộ chiếu còn giá trị, ảnh thẻ và giấy tờ chứng minh chỗ ở hợp pháp.';

export type DocItem = { id: string; label: string; highlighted: boolean };

export const DOCUMENTS: DocItem[] = [
  { id: 'doc-luat-cutru', label: 'Luật Cư trú 2020', highlighted: false },
  { id: 'doc-tt-capthe', label: 'TT cấp lại thẻ tạm trú', highlighted: true },
  { id: 'doc-nd144', label: 'NĐ 144/2021', highlighted: false },
  { id: 'doc-hd-qlxnc', label: 'Hướng dẫn hồ sơ QLXNC', highlighted: true },
  { id: 'doc-tt-dangky', label: 'TT đăng ký tạm trú', highlighted: false },
  { id: 'doc-bieuphi', label: 'Biểu phí lệ phí XNC', highlighted: false },
];

// Chi so 2 tai lieu duoc chon (khop DOCUMENTS[].highlighted) — dung de dinh vi
// diem xuat phat/dich cua beam va goi du lieu trong RagSlideAnimation.
export const HIGHLIGHTED_DOC_INDEXES = DOCUMENTS.reduce<number[]>((acc, doc, i) => {
  if (doc.highlighted) acc.push(i);
  return acc;
}, []);

export const CITATIONS: { id: string; label: string; docIndex: number }[] = [
  { id: 'cite-1', label: 'TT cấp lại thẻ tạm trú', docIndex: HIGHLIGHTED_DOC_INDEXES[0] },
  { id: 'cite-2', label: 'Hướng dẫn hồ sơ QLXNC', docIndex: HIGHLIGHTED_DOC_INDEXES[1] },
];
