# Shadow retrieval T3.7 — 2026-07-17T08-14-42

- Namespace CŨ (production): `chatbot-tthc-xnc`
- Namespace MỚI (ứng viên): `chatbot-tthc-xnc-web-rd-20260715`
- Số câu chạy: 1/91  ·  Embedding `RETRIEVAL_QUERY`, topK 8, ngưỡng 0.62
- Kết quả namespace MỚI: **PASS 1 · WARN 0 · FAIL 0**

> PASS = truy đúng domain/cap/topic. WARN = có trả lời nhưng lệch 1 tiêu chí (soi tay). FAIL = abstain oàn hoặc bẫy không đạt.

| ID | Câu hỏi | Verdict | Ghi chú | MỚI top-3 (governance) | CŨ top-3 (production) |
|---|---|---|---|---|---|
| XE03 | Thu hồi chứng nhận đăng ký xe, biển số x | PASS | domain=ok topic=ok | 0.820 · cap=tinh · Thu hồi chứng nhận đăng ký xe, biển số xe thực hiện bằn<br>0.820 · cap=tinh · Thu hồi giấy chứng nhận đăng ký, biển số xe thực hiện b<br>0.764 · cap=tinh · Cấp lại chứng nhận đăng ký xe, biển số xe thực hiện bằn | 0.800 · cap=? · guide_cap_xa_2025_e_11_ang_ky_xe_thu_hoi_giay_chung_nha<br>0.792 · cap=? · guide_cap_xa_2025_e_10_ang_ky_xe_thu_hoi_chung_nhan_ang<br>0.750 · cap=? · guide_cap_xa_2025_e_07_ang_ky_xe_cap_lai_chung_nhan_ang |

## Ghi chú
- Bộ câu do Claude Code soạn (2026-07-17), cần người dùng rà kỳ vọng nghiệp vụ.
- Câu `TRAP-*` kiểm governance: superseded/paper-flow/out-of-scope phải KHÔNG trả nội dung cấm; `wrong_cap_data`/`citizen_scope` kỳ vọng CÓ trả lời (không abstain oàn).
- Shadow = chỉ so truy hồi, chưa chấm generation. Bước 30 câu lõi × 3 dùng `scripts/run-regression.js --majority --runs 3` trỏ namespace mới.