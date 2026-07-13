# Báo cáo Gate ĐA SỐ (majority 2/3)

- Số run đầy đủ: **3** — ngưỡng đa số: **2/3** (một ca là HARD FAIL THẬT khi rớt ≥ 2 run)
- **Gate ĐA SỐ: ❌ KHÔNG ĐẠT** — deferred (F01) không chặn tới Giai đoạn 3
- Hard fail ĐA SỐ (chặn gate): VP01 (2/3)
- 🟠 Flaky (rớt 1..1/3 run — advisory, KHÔNG chặn): TT04 (1/3), EV01 (1/3), EV04 (1/3), DN01 (1/3), TYPO02 (1/3)

## Ma trận verdict theo run

Ký hiệu: `.` PASS · `F` HARD_FAIL · `d` DEFERRED_FAIL · `E` provider error

| ID | R1 | R2 | R3 | Fail/N | Phân loại |
|---|---|---|---|---:|---|
| F01 | . | . | . | 0/3 | ✅ ổn định |
| TR01 | . | . | . | 0/3 | ✅ ổn định |
| TR02 | . | . | . | 0/3 | ✅ ổn định |
| TR03 | . | . | . | 0/3 | ✅ ổn định |
| TR05 | . | . | . | 0/3 | ✅ ổn định |
| GV01 | . | . | . | 0/3 | ✅ ổn định |
| GV02 | . | . | . | 0/3 | ✅ ổn định |
| GV06 | . | . | . | 0/3 | ✅ ổn định |
| TT01 | . | . | . | 0/3 | ✅ ổn định |
| TT04 | . | . | F | 1/3 | 🟠 flaky |
| EV01 | . | F | . | 1/3 | 🟠 flaky |
| EV04 | . | . | F | 1/3 | 🟠 flaky |
| VP01 | . | F | F | 2/3 | ❌ HARD FAIL (đa số) |
| VP06 | . | . | . | 0/3 | ✅ ổn định |
| DN01 | F | . | . | 1/3 | 🟠 flaky |
| DN02 | . | . | . | 0/3 | ✅ ổn định |
| LOC02 | . | . | . | 0/3 | ✅ ổn định |
| LOC04 | . | . | . | 0/3 | ✅ ổn định |
| TYPO01 | . | . | . | 0/3 | ✅ ổn định |
| TYPO02 | F | . | . | 1/3 | 🟠 flaky |
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

- **TT04** — run3: missing_required_fact:qualified_guidance
- **EV01** — run2: missing_required_fact:evisa_online
- **EV04** — run3: ungrounded_fact:report_and_embassy
- **VP01** — run2: missing_required_fact:fine_requires_basis · run3: ungrounded_fact:fine_requires_basis
- **DN01** — run1: global_forbidden:does not cite thong bao luu tru
- **TYPO02** — run1: missing_required_fact:understand_tq
