# Migration Published_Locations

Script migration làm việc với file JSON export, không ghi trực tiếp vào Google Sheet production.

## Dual-workbook foundation — dry-run only

`npm run migrate:locations:dual:dry-run -- --source <source-export.json> --target <target-export.json>`
never contacts Google or writes a workbook. It inventories sheets and row counts, checks the semantic
`Published_Locations` schema plus coordinate validity, classifies public/private sheets, compares public
`record_id` values and reports missing, unexpected and duplicate records. Add `--report <file>` only to
write a local JSON evidence report. `--apply` and `--write` are deliberately rejected.

Expected target export shape is `{ "public": { "sheets": { ... } }, "private": { "sheets": { ... } } }`.
Use TEST exports for smoke exercises. No Production workbook or Production environment must be changed by
this command. Before any later alias promotion, run `npm run verify:published-locations` against the
candidate deployment and require valid semantic columns and coordinates.

```powershell
# Xem báo cáo, không thay đổi nguồn
npm run migrate:locations -- --input .\published-export.json

# Ghi kết quả sang file khác; nếu file đích đã có sẽ tạo .bak trước
npm run migrate:locations -- --input .\published-export.json --apply --output .\published-migrated.json
```

Migration giữ `record_id` đã có hoặc tạo mã cho bản ghi thiếu, chuyển `police_station` thành `POLICE_OFFICE` và `id_center` thành `CITIZEN_ID`. Các bản ghi cùng `unit_code` luôn còn riêng biệt. Báo cáo gồm tổng số bản ghi, hợp lệ, thiếu `record_id`, nghi trùng, thiếu tọa độ và ngoài phạm vi.

## Quy trình rollback

Kiểm tra kết quả dry-run trước. Lưu bản export gốc tại nơi kiểm soát truy cập. Khi đã `--apply`, khôi phục từ file nguồn hoặc từ tệp `.bak` script tạo khi ghi đè output. Chỉ import lại kết quả đã được người duyệt xác nhận vào Sheet; không chạy thử trên production.
