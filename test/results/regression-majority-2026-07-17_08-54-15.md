# Báo cáo Gate ĐA SỐ (majority 2/3)

- Số run đầy đủ: **3** — ngưỡng đa số: **2/3** (một ca là HARD FAIL THẬT khi rớt ≥ 2 run)
- **Gate ĐA SỐ (kèm provider error): ❌ KHÔNG ĐẠT** — deferred (F01) không chặn tới Giai đoạn 3
- Hard fail ĐA SỐ (chặn gate): _không có_
- Provider error ĐA SỐ (chặn gate): F01 (2/3), TR01 (2/3), TR02 (2/3), TR03 (2/3), TR05 (2/3), GV01 (3/3), GV02 (2/3), GV06 (2/3), TT01 (2/3), TT04 (2/3), EV01 (2/3), EV04 (2/3), VP01 (2/3), VP06 (2/3), DN01 (2/3), DN02 (2/3), LOC02 (2/3), TYPO01 (2/3), TYPO02 (2/3), ON01 (2/3), HS02 (2/3), TL01 (3/3), CS01 (3/3), GD02 (3/3), KC04 (3/3), TR09 (3/3), EV07 (3/3), PI01 (2/3), H16 (3/3), H17 (3/3)
- 🟠 Flaky (rớt 1..1/3 run — advisory, KHÔNG chặn): TR05 (1/3), EV01 (1/3), VP01 (1/3), DN01 (1/3), LOC02 (1/3), TYPO01 (1/3), TYPO02 (1/3)
- 🟠 Provider error lẻ tẻ (advisory): LOC07 (1/3)

## Ma trận verdict theo run

Ký hiệu: `.` PASS · `F` HARD_FAIL · `d` DEFERRED_FAIL · `E` provider error

| ID | R1 | R2 | R3 | Fail/N | Phân loại |
|---|---|---|---|---:|---|
| F01 | . | E | E | 0/3 | 🔌 provider (đa số) |
| TR01 | . | E | E | 0/3 | 🔌 provider (đa số) |
| TR02 | . | E | E | 0/3 | 🔌 provider (đa số) |
| TR03 | . | E | E | 0/3 | 🔌 provider (đa số) |
| TR05 | F | E | E | 1/3 | 🟠 flaky |
| GV01 | E | E | E | 0/3 | 🔌 provider (đa số) |
| GV02 | . | E | E | 0/3 | 🔌 provider (đa số) |
| GV06 | . | E | E | 0/3 | 🔌 provider (đa số) |
| TT01 | . | E | E | 0/3 | 🔌 provider (đa số) |
| TT04 | . | E | E | 0/3 | 🔌 provider (đa số) |
| EV01 | F | E | E | 1/3 | 🟠 flaky |
| EV04 | . | E | E | 0/3 | 🔌 provider (đa số) |
| VP01 | F | E | E | 1/3 | 🟠 flaky |
| VP06 | . | E | E | 0/3 | 🔌 provider (đa số) |
| DN01 | F | E | E | 1/3 | 🟠 flaky |
| DN02 | . | E | E | 0/3 | 🔌 provider (đa số) |
| LOC02 | F | E | E | 1/3 | 🟠 flaky |
| LOC04 | . | . | . | 0/3 | ✅ ổn định |
| TYPO01 | F | E | E | 1/3 | 🟠 flaky |
| TYPO02 | F | E | E | 1/3 | 🟠 flaky |
| ON01 | . | E | E | 0/3 | 🔌 provider (đa số) |
| HS02 | . | E | E | 0/3 | 🔌 provider (đa số) |
| TL01 | E | E | E | 0/3 | 🔌 provider (đa số) |
| CS01 | E | E | E | 0/3 | 🔌 provider (đa số) |
| GD02 | E | E | E | 0/3 | 🔌 provider (đa số) |
| KC04 | E | E | E | 0/3 | 🔌 provider (đa số) |
| TR09 | E | E | E | 0/3 | 🔌 provider (đa số) |
| EV07 | E | E | E | 0/3 | 🔌 provider (đa số) |
| LOC07 | . | E | . | 0/3 | 🟠 provider lẻ |
| PI01 | . | E | E | 0/3 | 🔌 provider (đa số) |
| H16 (HT) | E | E | E | 0/3 | 🔌 provider (đa số) |
| H17 (HT) | E | E | E | 0/3 | 🔌 provider (đa số) |

## Chi tiết failure theo run

- **TR05** — run1: missing_required_fact:no_unsupported_fine
- **EV01** — run1: ungrounded_fact:evisa_online
- **VP01** — run1: missing_required_fact:fine_requires_basis
- **DN01** — run1: missing_required_fact:declare_accommodation, missing_required_fact:sponsor_procedures, global_forbidden:does not mention 23-hour deadline, global_forbidden:does not mention 08-hour deadline, global_forbidden:does not cite thong bao luu tru
- **LOC02** — run1: global_forbidden:does not cite thong bao luu tru
- **TYPO01** — run1: missing_required_fact:understand_unaccented
- **TYPO02** — run1: ungrounded_fact:understand_tq
