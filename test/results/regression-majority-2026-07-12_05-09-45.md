# Báo cáo Gate ĐA SỐ (majority 2/3)

- Số run đầy đủ: **3** — ngưỡng đa số: **2/3** (một ca là HARD FAIL THẬT khi rớt ≥ 2 run)
- **Gate ĐA SỐ: ✅ ĐẠT** — deferred (F01) không chặn tới Giai đoạn 3
- Hard fail ĐA SỐ (chặn gate): _không có_
- 🟠 Flaky (rớt 1..1/3 run — advisory, KHÔNG chặn): _không có_

## Ma trận verdict theo run

Ký hiệu: `.` PASS · `F` HARD_FAIL · `d` DEFERRED_FAIL · `E` provider error

| ID | R1 | R2 | R3 | Fail/N | Phân loại |
|---|---|---|---|---:|---|
| F01 | d | . | d | 0/3 | 🟡 deferred |

## Chi tiết failure theo run

- **F01** — run1: missing_required_fact:temporary_residence_declaration, global_forbidden:does not cite dang ky tam tru citizen procedure · run3: missing_required_fact:temporary_residence_declaration, missing_required_fact:ask_location_or_accommodation, global_forbidden:does not cite dang ky tam tru citizen procedure
