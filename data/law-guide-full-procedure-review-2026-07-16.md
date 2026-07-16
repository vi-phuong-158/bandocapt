# Guide "Toàn văn thủ tục" cần review riêng trước khi backfill --apply

> Sinh ra từ dry-run `node scripts/backfill-law-guide-governance.js --namespace=chatbot-tthc-xnc`
> chạy trực tiếp trên namespace **production** (`chatbot-tthc-xnc`), 2026-07-16.
> Chỉ đọc — không ghi gì vào Pinecone.

## Tóm tắt

- Namespace: `chatbot-tthc-xnc` (production)
- Tổng record law/guide quét được: **346** (152 `law` + 194 `guide`)
- Cần cập nhật (`toUpdate`): 346/346 — chưa record nào có `source_type`/`source_priority`
- Guide `Toàn văn thủ tục` (`fullProcedureGuideCount`): **50/194**

**Lưu ý chênh lệch:** PR #34 ghi nhận 42/194 guide thuộc diện này (theo `data/corpus-inventory.json`
snapshot 2026-07-14). Dry-run lúc 2026-07-16 báo **50** — cao hơn 8 record. Cần xác minh nguyên nhân
(corpus có record mới/sửa `section` giữa hai lần quét, hay khác cách đếm) trước khi dùng danh sách nào
làm cơ sở duyệt chính thức.

## Vì sao cần review riêng

Các guide này chứa "Toàn văn thủ tục" — tức đủ trình tự, cách nộp, hồ sơ/mẫu, thời hạn, phí và cơ
quan tiếp nhận. Theo governance fail-closed (PR #34), guide chỉ được coi là nguồn hợp lệ khi
`review_status=approved` — backfill mặc định gán `pending`, KHÔNG tự động duyệt. 50 record dưới đây
cần người duyệt xem xét kỹ vì chúng có khả năng bị dùng như facts vận hành thay vì chỉ tài liệu bổ trợ.

## Danh sách 50 ID

| # | ID |
|---|---|
| 1 | `guide_cap_xa_2025_a_01_quan_ly_xuat_nhap_canh_trinh_bao_mat_ho_chieu_pho_thong_thuc_hien_tai_cap_xa_01_01` |
| 2 | `guide_cap_xa_2025_a_03_quan_ly_xuat_nhap_canh_trinh_bao_mat_the_abtc_thuc_hien_tai_cap_xa_01_01` |
| 3 | `guide_cap_xa_2025_a_04_quan_ly_xuat_nhap_canh_trinh_bao_mat_giay_thong_hanh_thuc_hien_tai_cong_an_cap_xa_01_01` |
| 4 | `guide_cap_xa_2025_b_02_ang_ky_quan_ly_cu_tru_xoa_ang_ky_thuong_tru_01_01` |
| 5 | `guide_cap_xa_2025_b_04_ang_ky_quan_ly_cu_tru_ieu_chinh_thong_tin_ve_cu_tru_trong_co_so_du_lieu_ve_cu_tru_01_01` |
| 6 | `guide_cap_xa_2025_b_05_ang_ky_quan_ly_cu_tru_viec_nop_ho_so_ang_ky_cu_tru_01_01` |
| 7 | `guide_cap_xa_2025_b_06_ang_ky_quan_ly_cu_tru_truong_hop_cong_dan_co_su_ieu_chinh_ve_ho_tich_ma_cac_thong_tin_nay_a_uoc_cap_nh_01_01` |
| 8 | `guide_cap_xa_2025_b_09_ang_ky_quan_ly_cu_tru_xoa_ang_ky_tam_tru_01_01` |
| 9 | `guide_cap_xa_2025_b_10_ang_ky_quan_ly_cu_tru_khai_bao_thong_tin_ve_cu_tru_oi_voi_nguoi_chua_u_ieu_kien_ang_ky_thuong_tru_ang__01_01` |
| 10 | `guide_cap_xa_2025_b_11_ang_ky_quan_ly_cu_tru_thong_bao_luu_tru_01_01` |
| 11 | `guide_cap_xa_2025_b_12_ang_ky_quan_ly_cu_tru_khai_bao_tam_vang_01_01` |
| 12 | `guide_cap_xa_2025_b_13_ang_ky_quan_ly_cu_tru_xac_nhan_thong_tin_ve_cu_tru_01_01` |
| 13 | `guide_cap_xa_2025_c_01_khieu_nai_to_cao_giai_quyet_khieu_nai_ve_quyet_inh_hanh_chinh_hanh_vi_hanh_chinh_cua_cong_dan_oi__01_01` |
| 14 | `guide_cap_xa_2025_d_01_quan_ly_vu_khi_vat_lieu_no_cong_cu_ho_tr_khai_bao_vu_khi_tho_so_la_hien_vat_trung_bay_trien_lam_lam_o_gia_bao_01_01` |
| 15 | `guide_cap_xa_2025_e_01_ang_ky_xe_ang_ky_xe_lan_au_truc_tuyen_toan_trinh_oi_voi_xe_san_xuat_lap_rap_trong_nuoc_thu_01_01` |
| 16 | `guide_cap_xa_2025_e_02_ang_ky_xe_ang_ky_xe_lan_au_truc_tuyen_toan_trinh_oi_voi_xe_nhap_khau_thuc_hien_tai_cong_an_01_01` |
| 17 | `guide_cap_xa_2025_e_03_ang_ky_xe_ang_ky_cap_bien_so_xe_lan_au_thuc_hien_bang_dich_vu_cong_mot_phan_hoac_truc_tiep_01_01` |
| 18 | `guide_cap_xa_2025_e_05_ang_ky_xe_oi_chung_nhan_ang_ky_xe_bien_so_xe_thuc_hien_tai_cong_an_cap_xa_01_01` |
| 19 | `guide_cap_xa_2025_e_06_ang_ky_xe_cap_lai_chung_nhan_ang_ky_xe_bien_so_xe_thuc_hien_bang_dich_vu_cong_truc_tuyen_t_01_01` |
| 20 | `guide_cap_xa_2025_e_07_ang_ky_xe_cap_lai_chung_nhan_ang_ky_xe_bien_so_xe_thuc_hien_bang_dich_vu_cong_truc_tuyen_m_01_01` |
| 21 | `guide_cap_xa_2025_e_08_ang_ky_xe_ang_ky_xe_tam_thoi_thuc_hien_bang_dich_vu_cong_truc_tuyen_toan_trinh_tai_cong_an_01_01` |
| 22 | `guide_cap_xa_2025_e_10_ang_ky_xe_thu_hoi_chung_nhan_ang_ky_xe_bien_so_xe_thuc_hien_bang_dich_vu_cong_toan_trinh_t_01_01` |
| 23 | `guide_cap_xa_2025_e_11_ang_ky_xe_thu_hoi_giay_chung_nhan_ang_ky_bien_so_xe_thuc_hien_bang_dich_vu_cong_truc_tuyen_01_01` |
| 24 | `guide_cap_xa_2025_file_2_02_quan_ly_nganh_nghe_au_tu_kinh_doanh_co_i_cap_oi_giay_chung_nhan_u_ieu_kien_ve_an_ninh_trat_tu_01_01` |
| 25 | `guide_cap_xa_2025_file_3_03_quan_ly_nganh_nghe_au_tu_kinh_doanh_co_i_cap_lai_giay_chung_nhan_u_ieu_kien_ve_an_ninh_trat_tu_01_01` |
| 26 | `guide_cap_xa_2025_g_01_can_cuoc_khai_thac_thong_tin_cong_dan_trong_co_so_du_lieu_quoc_gia_ve_dan_cu_01_01` |
| 27 | `guide_cap_xa_2025_g_02_can_cuoc_khai_thac_thong_tin_cua_cong_dan_trong_co_so_du_lieu_can_cuoc_01_01` |
| 28 | `guide_cap_xa_2025_g_03_can_cuoc_khai_thac_thong_tin_nguoi_goc_viet_nam_chua_xac_inh_uoc_quoc_tich_trong_co_so_du_01_01` |
| 29 | `guide_cap_xa_2025_g_04_can_cuoc_khai_thac_thong_tin_nguoi_goc_viet_nam_chua_xac_inh_uoc_quoc_tich_trong_co_so_du_01_01` |
| 30 | `guide_cap_xa_2025_g_05_can_cuoc_khai_thac_thong_tin_nguoi_goc_viet_nam_chua_xac_inh_uoc_quoc_tich_trong_co_so_du_01_01` |
| 31 | `guide_cap_xa_2025_g_06_can_cuoc_ieu_chinh_thong_tin_trong_co_so_du_lieu_quoc_gia_ve_dan_cu_theo_e_nghi_cua_cong__01_01` |
| 32 | `guide_cap_xa_2025_g_07_can_cuoc_huy_xac_lap_lai_so_inh_danh_ca_nhan_01_01` |
| 33 | `guide_cap_xa_2025_g_08_can_cuoc_cap_xac_nhan_so_chung_minh_nhan_dan_09_so_so_inh_danh_ca_nhan_01_01` |
| 34 | `guide_cap_xa_2025_g_09_can_cuoc_thu_thap_cap_nhat_thong_tin_sinh_trac_hoc_ve_adn_vao_co_so_du_lieu_ve_can_cuoc_01_01` |
| 35 | `guide_cap_xa_2025_g_10_can_cuoc_thu_thap_cap_nhat_thong_tin_sinh_trac_hoc_ve_giong_noi_vao_co_so_du_lieu_ve_can__01_01` |
| 36 | `guide_cap_xa_2025_g_11_can_cuoc_tich_hop_cap_nhat_ieu_chinh_thong_tin_tren_the_can_cuoc_01_01` |
| 37 | `guide_cap_xa_2025_g_12_can_cuoc_cap_the_can_cuoc_cho_nguoi_tu_u_14_tuoi_tro_len_01_01` |
| 38 | `guide_cap_xa_2025_g_13_can_cuoc_cap_the_can_cuoc_cho_nguoi_duoi_14_tuoi_01_01` |
| 39 | `guide_cap_xa_2025_g_14_can_cuoc_cap_oi_the_can_cuoc_01_01` |
| 40 | `guide_cap_xa_2025_g_15_can_cuoc_cap_lai_the_can_cuoc_01_01` |
| 41 | `guide_cap_xa_2025_g_16_can_cuoc_cap_oi_giay_chung_nhan_can_cuoc_01_01` |
| 42 | `guide_cap_xa_2025_g_17_can_cuoc_cap_lai_giay_chung_nhan_can_cuoc_01_01` |
| 43 | `guide_cap_xa_2025_g_18_can_cuoc_thu_thap_cap_nhat_thong_tin_cua_nguoi_goc_viet_nam_chua_xac_inh_uoc_quoc_tich_va_01_01` |
| 44 | `guide_cap_xa_2025_g_19_can_cuoc_ieu_chinh_thong_tin_trong_co_so_du_lieu_quoc_gia_ve_dan_cu_co_so_du_lieu_can_cuo_01_01` |
| 45 | `guide_cap_xa_2025_h_01_inh_danh_va_xac_thuc_ien_tu_cap_tai_khoan_inh_danh_ien_tu_muc_o_02_can_cuoc_ien_tu_cho_cong_dan_viet_nam_01_01` |
| 46 | `guide_cap_xa_2025_h_02_inh_danh_va_xac_thuc_ien_tu_khoa_tai_khoan_inh_danh_ien_tu_01_01` |
| 47 | `guide_cap_xa_2025_h_03_inh_danh_va_xac_thuc_ien_tu_mo_khoa_tai_khoan_inh_danh_ien_tu_01_01` |
| 48 | `guide_cap_xa_2025_h_04_inh_danh_va_xac_thuc_ien_tu_khoa_can_cuoc_ien_tu_01_01` |
| 49 | `guide_cap_xa_2025_h_05_inh_danh_va_xac_thuc_ien_tu_mo_khoa_can_cuoc_ien_tu_01_01` |
| 50 | `guide_cap_xa_2025_h_06_inh_danh_va_xac_thuc_ien_tu_cap_tai_khoan_inh_danh_ien_tu_cho_co_quan_to_chuc_01_01` |

## Bước tiếp theo

1. Đối chiếu 8 record chênh lệch giữa 42 (PR #34) và 50 (dry-run hôm nay) — nguyên nhân do corpus
   thay đổi hay khác cách đếm.
2. Người duyệt xem nội dung từng guide, quyết định `approved`/giữ `pending`/`superseded`.
3. Chỉ sau khi duyệt xong, seed các record `approved` sang namespace ứng viên rồi mới chạy
   `backfill-law-guide-governance.js --apply` có xác nhận namespace.
