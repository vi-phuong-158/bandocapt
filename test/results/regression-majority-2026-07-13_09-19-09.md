# BÃ¡o cÃ¡o Gate ÄA Sá» (majority 2/3)

- Sá»‘ run Ä‘áº§y Ä‘á»§: **3** â€” ngÆ°á»¡ng Ä‘a sá»‘: **2/3** (má»™t ca lÃ  HARD FAIL THáº¬T khi rá»›t â‰¥ 2 run)
- **Gate ÄA Sá»: âœ… Äáº T** â€” deferred (F01) khÃ´ng cháº·n tá»›i Giai Ä‘oáº¡n 3
- Hard fail ÄA Sá» (cháº·n gate): _khÃ´ng cÃ³_
- ðŸŸ  Flaky (rá»›t 1..1/3 run â€” advisory, KHÃ”NG cháº·n): TR05 (1/3), TT04 (1/3), DN01 (1/3), LOC07 (1/3)
- ðŸŸ  Provider error láº» táº» (advisory): GV02 (1/3)

## Ma tráº­n verdict theo run

KÃ½ hiá»‡u: `.` PASS Â· `F` HARD_FAIL Â· `d` DEFERRED_FAIL Â· `E` provider error

| ID | R1 | R2 | R3 | Fail/N | PhÃ¢n loáº¡i |
|---|---|---|---|---:|---|
| F01 | . | . | d | 0/3 | ðŸŸ¡ deferred |
| TR01 | . | . | . | 0/3 | âœ… á»•n Ä‘á»‹nh |
| TR02 | . | . | . | 0/3 | âœ… á»•n Ä‘á»‹nh |
| TR03 | . | . | . | 0/3 | âœ… á»•n Ä‘á»‹nh |
| TR05 | . | F | . | 1/3 | ðŸŸ  flaky |
| GV01 | . | . | . | 0/3 | âœ… á»•n Ä‘á»‹nh |
| GV02 | . | . | E | 0/3 | ðŸŸ  provider láº» |
| GV06 | . | . | . | 0/3 | âœ… á»•n Ä‘á»‹nh |
| TT01 | . | . | . | 0/3 | âœ… á»•n Ä‘á»‹nh |
| TT04 | . | F | . | 1/3 | ðŸŸ  flaky |
| EV01 | . | . | . | 0/3 | âœ… á»•n Ä‘á»‹nh |
| EV04 | . | . | . | 0/3 | âœ… á»•n Ä‘á»‹nh |
| VP01 | . | . | . | 0/3 | âœ… á»•n Ä‘á»‹nh |
| VP06 | . | . | . | 0/3 | âœ… á»•n Ä‘á»‹nh |
| DN01 | . | F | . | 1/3 | ðŸŸ  flaky |
| DN02 | . | . | . | 0/3 | âœ… á»•n Ä‘á»‹nh |
| LOC02 | . | . | . | 0/3 | âœ… á»•n Ä‘á»‹nh |
| LOC04 | . | . | . | 0/3 | âœ… á»•n Ä‘á»‹nh |
| TYPO01 | . | . | . | 0/3 | âœ… á»•n Ä‘á»‹nh |
| TYPO02 | . | . | . | 0/3 | âœ… á»•n Ä‘á»‹nh |
| ON01 | . | . | . | 0/3 | âœ… á»•n Ä‘á»‹nh |
| HS02 | . | . | . | 0/3 | âœ… á»•n Ä‘á»‹nh |
| TL01 | . | . | . | 0/3 | âœ… á»•n Ä‘á»‹nh |
| CS01 | . | . | . | 0/3 | âœ… á»•n Ä‘á»‹nh |
| GD02 | . | . | . | 0/3 | âœ… á»•n Ä‘á»‹nh |
| KC04 | . | . | . | 0/3 | âœ… á»•n Ä‘á»‹nh |
| TR09 | . | . | . | 0/3 | âœ… á»•n Ä‘á»‹nh |
| EV07 | . | . | . | 0/3 | âœ… á»•n Ä‘á»‹nh |
| LOC07 | . | F | . | 1/3 | ðŸŸ  flaky |
| PI01 | . | . | . | 0/3 | âœ… á»•n Ä‘á»‹nh |
| H16 (HT) | . | . | . | 0/3 | âœ… á»•n Ä‘á»‹nh |
| H17 (HT) | . | . | . | 0/3 | âœ… á»•n Ä‘á»‹nh |

## Chi tiáº¿t failure theo run

- **F01** â€” run3: missing_required_fact:temporary_residence_declaration
- **TR05** â€” run2: missing_required_fact:no_unsupported_fine
- **TT04** â€” run2: missing_required_fact:qualified_guidance
- **DN01** â€” run2: missing_required_fact:sponsor_procedures
- **LOC07** â€” run2: wrong_language:expected_en_got_vi
