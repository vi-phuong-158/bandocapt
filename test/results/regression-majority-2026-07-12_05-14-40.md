# Báo cáo Gate ĐA SỐ (majority 2/3)

- Số run đầy đủ: **3** — ngưỡng đa số: **2/3** (một ca là HARD FAIL THẬT khi rớt ≥ 2 run)
- **Gate ĐA SỐ: ❌ KHÔNG ĐẠT** — deferred (F01) không chặn tới Giai đoạn 3
- Hard fail ĐA SỐ (chặn gate): F01 (3/3)
- 🟠 Flaky (rớt 1..1/3 run — advisory, KHÔNG chặn): _không có_

## Ma trận verdict theo run

Ký hiệu: `.` PASS · `F` HARD_FAIL · `d` DEFERRED_FAIL · `E` provider error

| ID | R1 | R2 | R3 | Fail/N | Phân loại |
|---|---|---|---|---:|---|
| F01 | F | F | F | 3/3 | ❌ HARD FAIL (đa số) |

## Chi tiết failure theo run

- **F01** — run1: ungrounded_fact:temporary_residence_declaration · run2: missing_required_fact:temporary_residence_declaration · run3: ungrounded_fact:temporary_residence_declaration
