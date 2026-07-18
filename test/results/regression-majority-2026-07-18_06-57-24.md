# Báo cáo Gate ĐA SỐ (majority 2/3)

- Số run đầy đủ: **3** — ngưỡng đa số: **2/3** (một ca là HARD FAIL THẬT khi rớt ≥ 2 run)
- **Gate ĐA SỐ (kèm provider error): ❌ KHÔNG ĐẠT** — deferred (F01) không chặn tới Giai đoạn 3
- Hard fail ĐA SỐ (chặn gate): TT04 (2/3), VP01 (2/3)
- Provider error ĐA SỐ (chặn gate): _không có_
- 🟠 Flaky (rớt 1..1/3 run — advisory, KHÔNG chặn): TR03 (1/3)
- 🟠 Provider error lẻ tẻ (advisory): TYPO01 (1/3), CS01 (1/3), H16 (1/3)

## Ma trận verdict theo run

Ký hiệu: `.` PASS · `F` HARD_FAIL · `d` DEFERRED_FAIL · `E` provider error

| ID | R1 | R2 | R3 | Fail/N | Phân loại |
|---|---|---|---|---:|---|
| F01 | . | . | . | 0/3 | ✅ ổn định |
| TR01 | . | . | . | 0/3 | ✅ ổn định |
| TR02 | . | . | . | 0/3 | ✅ ổn định |
| TR03 | F | . | . | 1/3 | 🟠 flaky |
| TR05 | . | . | . | 0/3 | ✅ ổn định |
| GV01 | . | . | . | 0/3 | ✅ ổn định |
| GV02 | . | . | . | 0/3 | ✅ ổn định |
| GV06 | . | . | . | 0/3 | ✅ ổn định |
| TT01 | . | . | . | 0/3 | ✅ ổn định |
| TT04 | F | F | . | 2/3 | ❌ HARD FAIL (đa số) |
| EV01 | . | . | . | 0/3 | ✅ ổn định |
| EV04 | . | . | . | 0/3 | ✅ ổn định |
| VP01 | F | . | F | 2/3 | ❌ HARD FAIL (đa số) |
| VP06 | . | . | . | 0/3 | ✅ ổn định |
| DN01 | . | . | . | 0/3 | ✅ ổn định |
| DN02 | . | . | . | 0/3 | ✅ ổn định |
| LOC02 | . | . | . | 0/3 | ✅ ổn định |
| LOC04 | . | . | . | 0/3 | ✅ ổn định |
| TYPO01 | . | E | . | 0/3 | 🟠 provider lẻ |
| TYPO02 | . | . | . | 0/3 | ✅ ổn định |
| ON01 | . | . | . | 0/3 | ✅ ổn định |
| HS02 | . | . | . | 0/3 | ✅ ổn định |
| TL01 | . | . | . | 0/3 | ✅ ổn định |
| CS01 | . | . | E | 0/3 | 🟠 provider lẻ |
| GD02 | . | . | . | 0/3 | ✅ ổn định |
| KC04 | . | . | . | 0/3 | ✅ ổn định |
| TR09 | . | . | . | 0/3 | ✅ ổn định |
| EV07 | . | . | . | 0/3 | ✅ ổn định |
| LOC07 | . | . | . | 0/3 | ✅ ổn định |
| PI01 | . | . | . | 0/3 | ✅ ổn định |
| H16 (HT) | . | E | . | 0/3 | 🟠 provider lẻ |
| H17 (HT) | . | . | . | 0/3 | ✅ ổn định |

## Chi tiết failure theo run

- **TR03** — run1: forbidden_fact:invented_url
- **TT04** — run1: missing_required_fact:qualified_guidance · run2: missing_required_fact:qualified_guidance
- **VP01** — run1: missing_required_fact:fine_requires_basis · run3: missing_required_fact:fine_requires_basis
