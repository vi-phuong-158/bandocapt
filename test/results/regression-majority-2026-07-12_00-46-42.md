# Báo cáo Gate ĐA SỐ (majority 2/3)

- Số run đầy đủ: **3** — ngưỡng đa số: **2/3** (một ca là HARD FAIL THẬT khi rớt ≥ 2 run)
- **Gate ĐA SỐ: ✅ ĐẠT** — deferred (F01) không chặn tới Giai đoạn 3
- Hard fail ĐA SỐ (chặn gate): _không có_
- 🟠 Flaky (rớt 1..1/3 run — advisory, KHÔNG chặn): TT04 (1/3), EV01 (1/3), VP01 (1/3), DN01 (1/3), DN02 (1/3), TYPO01 (1/3), ON01 (1/3), HS02 (1/3), GD02 (1/3), TR09 (1/3), EV07 (1/3)

## Ma trận verdict theo run

Ký hiệu: `.` PASS · `F` HARD_FAIL · `d` DEFERRED_FAIL · `E` provider error

| ID | R1 | R2 | R3 | Fail/N | Phân loại |
|---|---|---|---|---:|---|
| F01 | d | . | d | 0/3 | 🟡 deferred |
| TR01 | . | . | . | 0/3 | ✅ ổn định |
| TR02 | . | . | . | 0/3 | ✅ ổn định |
| TR03 | . | . | . | 0/3 | ✅ ổn định |
| TR05 | . | . | . | 0/3 | ✅ ổn định |
| GV01 | . | . | . | 0/3 | ✅ ổn định |
| GV02 | . | . | . | 0/3 | ✅ ổn định |
| GV06 | . | . | . | 0/3 | ✅ ổn định |
| TT01 | . | . | . | 0/3 | ✅ ổn định |
| TT04 | . | F | . | 1/3 | 🟠 flaky |
| EV01 | . | F | . | 1/3 | 🟠 flaky |
| EV04 | . | . | . | 0/3 | ✅ ổn định |
| VP01 | . | . | F | 1/3 | 🟠 flaky |
| VP06 | . | . | . | 0/3 | ✅ ổn định |
| DN01 | . | . | F | 1/3 | 🟠 flaky |
| DN02 | . | . | F | 1/3 | 🟠 flaky |
| LOC02 | . | . | . | 0/3 | ✅ ổn định |
| LOC04 | . | . | . | 0/3 | ✅ ổn định |
| TYPO01 | . | . | F | 1/3 | 🟠 flaky |
| TYPO02 | . | . | . | 0/3 | ✅ ổn định |
| ON01 | . | . | F | 1/3 | 🟠 flaky |
| HS02 | . | . | F | 1/3 | 🟠 flaky |
| TL01 | . | . | . | 0/3 | ✅ ổn định |
| CS01 | . | . | . | 0/3 | ✅ ổn định |
| GD02 | . | . | F | 1/3 | 🟠 flaky |
| KC04 | . | . | . | 0/3 | ✅ ổn định |
| TR09 | . | F | . | 1/3 | 🟠 flaky |
| EV07 | . | . | F | 1/3 | 🟠 flaky |
| LOC07 | . | . | . | 0/3 | ✅ ổn định |
| PI01 | . | . | . | 0/3 | ✅ ổn định |
| H16 (HT) | . | . | . | 0/3 | ✅ ổn định |
| H17 (HT) | . | . | . | 0/3 | ✅ ổn định |

## Chi tiết failure theo run

- **F01** — run1: forbidden_fact:obsolete_paper_flow, global_forbidden:does not cite dang ky tam tru citizen procedure · run3: global_forbidden:does not cite dang ky tam tru citizen procedure
- **TT04** — run2: missing_required_fact:qualified_guidance
- **EV01** — run2: missing_required_fact:evisa_online
- **VP01** — run3: ungrounded_fact:fine_requires_basis
- **DN01** — run3: missing_required_fact:declare_accommodation, missing_required_fact:sponsor_procedures
- **DN02** — run3: ungrounded_fact:work_permit_does_not_replace
- **TYPO01** — run3: ungrounded_fact:understand_unaccented
- **ON01** — run3: missing_required_fact:online_available
- **HS02** — run3: missing_required_fact:na5_form
- **GD02** — run3: ungrounded_fact:child_also_declared
- **TR09** — run2: wrong_language:expected_en_got_vi
- **EV07** — run3: ungrounded_fact:chinese_evisa
