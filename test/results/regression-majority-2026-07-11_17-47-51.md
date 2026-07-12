# Báo cáo Gate ĐA SỐ (majority 2/3)

- Số run đầy đủ: **3** — ngưỡng đa số: **2/3** (một ca là HARD FAIL THẬT khi rớt ≥ 2 run)
- **Gate ĐA SỐ: ❌ KHÔNG ĐẠT** — deferred (F01) không chặn tới Giai đoạn 3
- Hard fail ĐA SỐ (chặn gate): VP06 (3/3)
- 🟠 Flaky (rớt 1..1/3 run — advisory, KHÔNG chặn): TR02 (1/3), TT04 (1/3), DN01 (1/3)
- 🟠 Provider error lẻ tẻ (advisory): EV01 (1/3)

## Ma trận verdict theo run

Ký hiệu: `.` PASS · `F` HARD_FAIL · `d` DEFERRED_FAIL · `E` provider error

| ID | R1 | R2 | R3 | Fail/N | Phân loại |
|---|---|---|---|---:|---|
| F01 | . | . | . | 0/3 | ✅ ổn định |
| TR01 | . | . | . | 0/3 | ✅ ổn định |
| TR02 | F | . | . | 1/3 | 🟠 flaky |
| TR03 | . | . | . | 0/3 | ✅ ổn định |
| TR05 | . | . | . | 0/3 | ✅ ổn định |
| GV01 | . | . | . | 0/3 | ✅ ổn định |
| GV02 | . | . | . | 0/3 | ✅ ổn định |
| GV06 | . | . | . | 0/3 | ✅ ổn định |
| TT01 | . | . | . | 0/3 | ✅ ổn định |
| TT04 | . | F | . | 1/3 | 🟠 flaky |
| EV01 | E | . | . | 0/3 | 🟠 provider lẻ |
| EV04 | . | . | . | 0/3 | ✅ ổn định |
| VP01 | . | . | . | 0/3 | ✅ ổn định |
| VP06 | F | F | F | 3/3 | ❌ HARD FAIL (đa số) |
| DN01 | . | F | . | 1/3 | 🟠 flaky |
| DN02 | . | . | . | 0/3 | ✅ ổn định |
| LOC02 | . | . | . | 0/3 | ✅ ổn định |
| LOC04 | . | . | . | 0/3 | ✅ ổn định |
| TYPO01 | . | . | . | 0/3 | ✅ ổn định |
| TYPO02 | . | . | . | 0/3 | ✅ ổn định |
| ON01 | . | . | . | 0/3 | ✅ ổn định |
| HS02 | . | . | . | 0/3 | ✅ ổn định |
| TL01 | . | . | . | 0/3 | ✅ ổn định |
| CS01 | . | . | . | 0/3 | ✅ ổn định |
| GD02 | . | . | . | 0/3 | ✅ ổn định |
| KC04 | . | . | . | 0/3 | ✅ ổn định |
| TR09 | . | . | . | 0/3 | ✅ ổn định |
| EV07 | . | . | . | 0/3 | ✅ ổn định |
| LOC07 | . | . | . | 0/3 | ✅ ổn định |
| PI01 | . | . | . | 0/3 | ✅ ổn định |
| H16 (HT) | . | . | . | 0/3 | ✅ ổn định |
| H17 (HT) | . | . | . | 0/3 | ✅ ổn định |

## Chi tiết failure theo run

- **TR02** — run1: missing_required_fact:current_station
- **TT04** — run2: missing_required_fact:qualified_guidance
- **VP06** — run1: missing_required_fact:refuse_backdating · run2: missing_required_fact:refuse_backdating · run3: missing_required_fact:refuse_backdating
- **DN01** — run2: global_forbidden:does not cite thong bao luu tru
