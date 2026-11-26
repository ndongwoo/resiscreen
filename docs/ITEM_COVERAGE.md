# 2026 심사 대상 190개 항목별 점검 범위

> 기준: 2026 심사 대상 항목 확인표(학회 수련위원 확인, 190개 모두 '맞음'). 셀 위치는 2026 양식 기준이며, 규칙은 열 문자 대신 항목 코드·머리글로 열을 찾는다. 병원 입력값은 담지 않았다. 규칙 2026.8.3. `npm run gen:docs`로 다시 만든다(tools/item_coverage.ts).

## 요약

| 분류 | 항목 수 | 뜻 |
|---|---|---|
| 빈칸·형식 | 128 | 입력 빈칸과 형식(수식 훼손 등)을 검사 |
| 형식·재계산·대조 | 24 | 자동계산 칸: 수식 훼손과 재계산·증빙 합계 대조 |
| 예외 | 17 | 서류 단계 검사 제외(실사·평가위원 칸 등, 근거는 규칙 exceptions) |
| 예외·형식 | 8 | 제외 칸이지만 수식 훼손은 검사 |
| 빈칸·형식·재계산·대조 | 3 | 빈칸·형식에 재계산까지 |
| 형식 | 3 | 형식(수식 훼손·머리글 기준일)만 |
| 검사 없음 | 2 | 자동 점검 없음(세부 시트 내용은 사람 확인) |
| 기타 | 2 | 세부 시트 쪽 안내(INFO)만 |
| 예외·빈칸·형식 | 2 | 일부 조건에서 빈칸 검사 |
| 예외·빈칸 | 1 | 조건부 빈칸 검사 |

## 입력 방식이 선택·직접 입력인데 빈칸 검사가 없는 항목

| 열 | 항목 | 세부 | 이유 |
|---|---|---|---|
| EF | B-6-1 | 1 전공의 인적사항 | B-6 e-Portfolio: 양식상 심사 항목이나 2026 가이드라인상 해당 없음(가이드라인 4.6). 2026 규칙에서 B-6-EPORTFOLIO를 꺼 두어 검사하지 않음(빈칸이어도 결과 없음) |
| EG | B-6-1 | 2 수련기록(수련기간, 기관 등) | B-6 e-Portfolio: 양식상 심사 항목이나 2026 가이드라인상 해당 없음(가이드라인 4.6). 2026 규칙에서 B-6-EPORTFOLIO를 꺼 두어 검사하지 않음(빈칸이어도 결과 없음) |
| EH | B-6-1 | 3 취급 환자 기록 | B-6 e-Portfolio: 양식상 심사 항목이나 2026 가이드라인상 해당 없음(가이드라인 4.6). 2026 규칙에서 B-6-EPORTFOLIO를 꺼 두어 검사하지 않음(빈칸이어도 결과 없음) |
| EI | B-6-1 | 4 원외 학술회의 참석기록(참석기록부, 대회명, 일시, 장소) | B-6 e-Portfolio: 양식상 심사 항목이나 2026 가이드라인상 해당 없음(가이드라인 4.6). 2026 규칙에서 B-6-EPORTFOLIO를 꺼 두어 검사하지 않음(빈칸이어도 결과 없음) |
| EJ | B-6-1 | 5 발표논문기록(저자, 제목, 발표잡지, 과장 확인) | B-6 e-Portfolio: 양식상 심사 항목이나 2026 가이드라인상 해당 없음(가이드라인 4.6). 2026 규칙에서 B-6-EPORTFOLIO를 꺼 두어 검사하지 않음(빈칸이어도 결과 없음) |
| EK | B-6-1 | 6 타과 파견 근무 기록 | B-6 e-Portfolio: 양식상 심사 항목이나 2026 가이드라인상 해당 없음(가이드라인 4.6). 2026 규칙에서 B-6-EPORTFOLIO를 꺼 두어 검사하지 않음(빈칸이어도 결과 없음) |
| EL | B-6-2 |  | B-6 e-Portfolio: 양식상 심사 항목이나 2026 가이드라인상 해당 없음(가이드라인 4.6). 2026 규칙에서 B-6-EPORTFOLIO를 꺼 두어 검사하지 않음(빈칸이어도 결과 없음) |
| EM | B-6-3 |  | B-6 e-Portfolio: 양식상 심사 항목이나 2026 가이드라인상 해당 없음(가이드라인 4.6). 2026 규칙에서 B-6-EPORTFOLIO를 꺼 두어 검사하지 않음(빈칸이어도 결과 없음) |

## 세부 시트 입력 항목 중 자동 점검이 없는 것

- A-11-1(CU, 전공의 휴가현황)과 B-4-1(DY, 전공의 개인별 논문 지상발표 실적): 세부 시트 내용은 사람이 확인한다(자동 점검 없음).
- A-3-3(R)·A-10-3 d(CT): 날짜 칸이 없어 3~2월 기간 검사를 못 한다는 INFO만 낸다.

## 항목별 표

| 번호 | 열 | 항목 | 세부 | 입력 방식 | 분류 | 점검 내용(규칙) |
|---|---|---|---|---|---|---|
| 1 | B | A-1-1 |  | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 2 | C | A-1-2 | 1 목적 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 3 | D | A-1-2 | 2 수련 교육 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 4 | E | A-1-2 | 3 수련 평가 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 5 | F | A-1-2 | 4 복무 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 6 | G | A-1-2 | 5 휴가 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 7 | H | A-2-1 | 1 총 전문의 수 (지도전문의 교육 및 여부 상관 없이 소속된 모든 전문 | 직접 입력(숫자 등) | 빈칸·형식 | 빈칸 ERROR [S-REQ-DIRECT]; 형식: 숫자 ERROR/WARNING(수식 참조 여부에 따라) [S-DTYPE-NUM]; 7행에 숫자 입력 여부 ERROR [S-WRONGROW-01]; 머리글 기준일(staff_count_date) WARNING [S-DATE-HDR] |
| 8 | I | A-2-1 | 2 정원책정 지도전문의 수 | 직접 입력(숫자 등) | 빈칸·형식·재계산·대조 | 빈칸 ERROR [S-REQ-DIRECT]; 형식: 숫자 ERROR/WARNING(수식 참조 여부에 따라) [S-DTYPE-NUM]; 7행에 숫자 입력 여부 ERROR [S-WRONGROW-01]; A-2-2 재계산의 N [A-2-2-RECALC] |
| 9 | J | A-2-2 |  | 선택(목록에서 고름) | 빈칸·형식·재계산·대조 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01]; 재계산: n ≤ N-3 WARNING [A-2-2-RECALC] |
| 10 | K | A-2-3 |  | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 11 | L | A-2-4 |  | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 12 | M | A-2-5 | 1 지도전문의 수 | 직접 입력(숫자 등) | 빈칸·형식 | 빈칸 ERROR [S-REQ-DIRECT]; 형식: 숫자 ERROR/WARNING(수식 참조 여부에 따라) [S-DTYPE-NUM]; 7행에 숫자 입력 여부 ERROR [S-WRONGROW-01]; 머리글 기준일(eval_may1) WARNING [S-DATE-HDR] |
| 13 | N | A-2-5 | 2 정원책정 지도전문의 수 | 직접 입력(숫자 등) | 빈칸·형식 | 빈칸 ERROR [S-REQ-DIRECT]; 형식: 숫자 ERROR/WARNING(수식 참조 여부에 따라) [S-DTYPE-NUM]; 7행에 숫자 입력 여부 ERROR [S-WRONGROW-01] |
| 14 | O | A-3-1 |  | 세부 시트에 입력 | 형식 | 머리글 기준일(eval_may1) WARNING [S-DATE-HDR] |
| 15 | P | A-3-2 |  | 세부 시트에 입력 | 형식·재계산·대조 | 머리글 기준일(prev_oct1) WARNING [S-DATE-HDR]; B-5 분모·A-2-2 n(A-3-2 시트) 재계산에 사용 |
| 16 | Q | A-3-2 | * 보건복지부 책정 정원 수 (1,2,3,4년차 정원 합)와 군파견 전공 | 자동 계산(수식) | 형식·재계산·대조 | 자동계산 수식 훼손 WARNING [S-FORMULA-01]; 증빙 합계 대조 ERROR('A-3-2'!B9) [S-SUM-01]; B-5 분모 = A-3-2 정원 합계 ERROR [B-5-RECALC] |
| 17 | R | A-3-3 | (2025년 3/1일 ~ 2026년 2월 말일) | 세부 시트에 입력 | 기타 | 기간 검사 불가 INFO [P-PERIOD-LIMIT] (A-3-3 시트) |
| 18 | S | A-4-1 | 1. 방음장치가 된 청력검사실 2. 청력계기 3. 외과용 수술현미경 4. | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 19 | T | A-4-2 | 방음장치가 된 청력검사실 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 20 | U | A-4-2 | Temporal bone dissection system | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 21 | V | A-4-2 | 과 전용 비서 또는 코디네이터 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 22 | W | A-4-2 | 전담 청각검사 요원 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 23 | X | A-4-2 | 이비인후과 소속 언어치료실 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 24 | Y | A-4-2 | 이비인후과 소속 병동 처치실 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 25 | Z | A-4-2 | 실험실 (공동인정) | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 26 | AA | A-4-3 | 외래 진료 UNIT 진찰의자 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 27 | AB | A-4-3 | 순음청력검사기 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 28 | AC | A-4-3 | 임피던스 청력검사기 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 29 | AD | A-4-3 | 뇌간유발반응 청력검사기 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 30 | AE | A-4-3 | 이음향 방사검사기 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 31 | AF | A-4-3 | 전정기능 검사기 I | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 32 | AG | A-4-3 | 전정기능 검사기 II (rotation chair 또는 posturogr | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 33 | AH | A-4-3 | 안면신경 모니터링 시스템 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 34 | AI | A-4-3 | ENoG | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 35 | AJ | A-4-3 | 수술현미경 (수술실용) | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 36 | AK | A-4-3 | 수술현미경 (외래용) | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 37 | AL | A-4-3 | ESS 수술 set | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 38 | AM | A-4-3 | Olfactometer | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 39 | AN | A-4-3 | Acoustic rhinometer 또는 rhinomanometer | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 40 | AO | A-4-3 | 알레르기 항원검사 set | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 41 | AP | A-4-3 | 수면다원검사 기기 (공동인정, portable 인정) | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 42 | AQ | A-4-3 | Laser 장비 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 43 | AR | A-4-3 | 후두미세수술기구 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 44 | AS | A-4-3 | Rigid endoscope set, 후두 telescope | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 45 | AT | A-4-3 | Flexible endoscope set | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 46 | AU | A-4-3 | Rigid esophago -scope | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 47 | AV | A-4-3 | Ventilating broncho -scope | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 48 | AW | A-4-3 | 음성검사기기 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 49 | AX | A-4-3 | 보청기 적합성 장비 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 50 | AY | A-4-3 | 수술 네비게이션 (공동인정) | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 51 | AZ | A-5-1 | 유무 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 52 | BA | A-5-1 | 의국 기능 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 53 | BB | A-5-2 | 유무 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 54 | BC | A-5-2 | 남녀 구분 여부 (여자전공의 없는 경우는 '예'에 해당됨) | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 55 | BD | A-5-3 |  | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 56 | BE | A-5-4 |  | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 57 | BF | A-5-5 | 1 책상 및 테이블 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 58 | BG | A-5-5 | 2 사무기기 (PC, 의자 등) | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 59 | BH | A-5-5 | 3 옷장 등 사물함 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 60 | BI | A-5-5 | 4 침대 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 61 | BJ | A-5-5 | 5 냉장고 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 62 | BK | A-5-5 | 6 식수시설 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 63 | BL | A-5-5 | 7 냉방시설 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 64 | BM | A-5-5 | 8 난방시설 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 65 | BN | A-5-5 | 9 환기시설 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 66 | BO | A-5-5 | 10 샤워시설 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 67 | BP | A-6-1 | * 이비인후과 수련병원 필수 기준 1. 평가전년도 외래환자 연인원 6,0 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 68 | BQ | A-6-2 |  | 자동 계산(수식) | 형식·재계산·대조 | 자동계산 수식 훼손 WARNING [S-FORMULA-01]; 증빙 합계 대조 ERROR('A-6'!N4) [S-SUM-01]; A-6 시트 확인서 첨부 WARNING [A-6-EVID-01] |
| 69 | BR | A-6-3 |  | 자동 계산(수식) | 형식·재계산·대조 | 자동계산 수식 훼손 WARNING [S-FORMULA-01]; 증빙 합계 대조 ERROR('A-6'!N10) [S-SUM-01]; A-6 시트 확인서 첨부 WARNING [A-6-EVID-01] |
| 70 | BS | A-6-4 | a. 고실성형술 혹은 유양동 삭개술, 이소골성형술 (myringoplas | 자동 계산(수식) | 형식·재계산·대조 | 자동계산 수식 훼손 WARNING [S-FORMULA-01]; 증빙 합계 대조 ERROR('a 고실'!G1) [S-SUM-01]; 행 수 대조 WARNING [A-6-ROWS-01]; 과락 기준 30건 WARNING [A-6-MIN-01] |
| 71 | BT | A-6-4 | b. 부비동 내시경수술 70건 미만 과락 | 자동 계산(수식) | 형식·재계산·대조 | 자동계산 수식 훼손 WARNING [S-FORMULA-01]; 증빙 합계 대조 ERROR('b ESS'!I1) [S-SUM-01]; 행 수 대조 WARNING [A-6-ROWS-01]; 과락 기준 70건 WARNING [A-6-MIN-01] |
| 72 | BU | A-6-4 | c. 두경부 악성종양 근치수술 5건 미만 과락 | 자동 계산(수식) | 형식·재계산·대조 | 자동계산 수식 훼손 WARNING [S-FORMULA-01]; 증빙 합계 대조 ERROR('c 두경부악성'!G1) [S-SUM-01]; 행 수 대조 WARNING [A-6-ROWS-01]; 과락 기준 5건 WARNING [A-6-MIN-01] |
| 73 | BV | A-6-4 | d. 편도 및 아데노이드 수술 | 자동 계산(수식) | 형식·재계산·대조 | 자동계산 수식 훼손 WARNING [S-FORMULA-01]; 증빙 합계 대조 ERROR('d T&A'!F1) [S-SUM-01]; 행 수 대조 WARNING [A-6-ROWS-01] |
| 74 | BW | A-6-4 | e. 비중격 성형술 | 자동 계산(수식) | 형식·재계산·대조 | 자동계산 수식 훼손 WARNING [S-FORMULA-01]; 증빙 합계 대조 ERROR('e 비중격'!F1) [S-SUM-01]; 행 수 대조 WARNING [A-6-ROWS-01] |
| 75 | BX | A-6-4 | f. 환기관 삽입술 | 자동 계산(수식) | 형식·재계산·대조 | 자동계산 수식 훼손 WARNING [S-FORMULA-01]; 증빙 합계 대조 ERROR('f 환기관'!F1) [S-SUM-01]; 행 수 대조 WARNING [A-6-ROWS-01] |
| 76 | BY | A-6-4 | g. 외비성형술 | 자동 계산(수식) | 형식·재계산·대조 | 자동계산 수식 훼손 WARNING [S-FORMULA-01]; 증빙 합계 대조 ERROR('g 외비성형술'!F1) [S-SUM-01]; 행 수 대조 WARNING [A-6-ROWS-01] |
| 77 | BZ | A-6-4 | h. 갑상선 적출술 5건 미만 과락 | 자동 계산(수식) | 형식·재계산·대조 | 자동계산 수식 훼손 WARNING [S-FORMULA-01]; 증빙 합계 대조 ERROR('h 갑상선'!G1) [S-SUM-01]; 행 수 대조 WARNING [A-6-ROWS-01]; 과락 기준 5건 WARNING [A-6-MIN-01] |
| 78 | CA | A-6-4 | i. 두경부 양성종물 수술 | 자동 계산(수식) | 형식·재계산·대조 | 자동계산 수식 훼손 WARNING [S-FORMULA-01]; 증빙 합계 대조 ERROR('i 두경부양성'!H1) [S-SUM-01]; 행 수 대조 WARNING [A-6-ROWS-01] |
| 79 | CB | A-6-4 | j. 청각 재활수술 | 자동 계산(수식) | 형식·재계산·대조 | 자동계산 수식 훼손 WARNING [S-FORMULA-01]; 증빙 합계 대조 ERROR('j 청각재활'!G1) [S-SUM-01]; 행 수 대조 WARNING [A-6-ROWS-01] |
| 80 | CC | A-6-4 | k. 수면무호흡 처치 및 수술 | 자동 계산(수식) | 형식·재계산·대조 | 자동계산 수식 훼손 WARNING [S-FORMULA-01]; 증빙 합계 대조 ERROR('k 수면무호흡'!G1) [S-SUM-01]; 행 수 대조 WARNING [A-6-ROWS-01] |
| 81 | CD | A-6-4 | l. 후두 미세 수술 | 자동 계산(수식) | 형식·재계산·대조 | 자동계산 수식 훼손 WARNING [S-FORMULA-01]; 증빙 합계 대조 ERROR('l LMS'!G1) [S-SUM-01]; 행 수 대조 WARNING [A-6-ROWS-01] |
| 82 | CE | A-7-1 | 1 CT | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 83 | CF | A-7-1 | 2 MRI | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 84 | CG | A-7-1 | 3 Angiography | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 85 | CH | A-7-1 | 4 Radiotherapy | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 86 | CI | A-7-1 | 5 PET-CT 또는 PET | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 87 | CJ | A-8-1 |  | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 88 | CK | A-8-2 |  | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 89 | CL | A-9-1 |  | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 90 | CM | A-9-2 |  | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 91 | CN | A-9-3 |  | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 92 | CO | A-10-1 |  | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 93 | CP | A-10-2 |  | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 94 | CQ | A-10-3 | a. 전공의 당직표를 작성 비치하고 있다. | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 95 | CR | A-10-3 | b. 전공의가 연속당직을 하고 있다. | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 96 | CS | A-10-3 | c. 상급년차(3,4년차) 당직참여 비율 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 97 | CT | A-10-3 | d. 전공의 월별 당직 현황 | 세부 시트에 입력 | 기타 | 기간 검사 불가 INFO [P-PERIOD-LIMIT] (A-10-3-d 시트) |
| 98 | CU | A-11-1 |  | 세부 시트에 입력 | 검사 없음 | - |
| 99 | CV | A-11-2 | a. 출산전후 휴가 사용 인원 | 직접 입력(숫자 등) | 빈칸·형식 | 빈칸 ERROR [S-REQ-DIRECT]; 형식: 숫자 ERROR/WARNING(수식 참조 여부에 따라) [S-DTYPE-NUM]; 7행에 숫자 입력 여부 ERROR [S-WRONGROW-01] |
| 100 | CW | A-11-2 | b. a 인원 모두 90일의 출산전후 휴가를 사용하였다. | 선택(목록에서 고름) | 예외·빈칸·형식 | 예외(form_wording) → S-REQ-SEL-COND [S-REQ-SEL]; 빈칸 ERROR (조건부: CV6 > 0) [S-REQ-SEL-COND]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 101 | CX | B-1-1 |  | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 102 | CY | B-1-2 |  | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 103 | CZ | B-1-3 | 1 수련목적 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 104 | DA | B-1-3 | 2 교육적, 관리적 책임지도전문의 임명 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 105 | DB | B-1-3 | 3 교육내용(연차별/분야별 전공의 수련 계획 및 환자 취급 범위 등) | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 106 | DC | B-1-3 | 4 근무 원칙 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 107 | DD | B-1-3 | 5 학술활동 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 108 | DE | B-1-3 | 6 논문 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 109 | DF | B-1-3 | 7 파견 수련 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 110 | DG | B-1-4 |  | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 111 | DH | B-1-5 |  | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 112 | DI | B-1-6 |  | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 113 | DJ | B-2-1 | 1 2년차 미 준수 인원 | 직접 입력(숫자 등) | 빈칸·형식 | 빈칸 ERROR [S-REQ-DIRECT]; 형식: 숫자 ERROR/WARNING(수식 참조 여부에 따라) [S-DTYPE-NUM]; 7행에 숫자 입력 여부 ERROR [S-WRONGROW-01] |
| 114 | DK | B-2-1 | 2 3년차 미 준수 인원 | 직접 입력(숫자 등) | 빈칸·형식 | 빈칸 ERROR [S-REQ-DIRECT]; 형식: 숫자 ERROR/WARNING(수식 참조 여부에 따라) [S-DTYPE-NUM]; 7행에 숫자 입력 여부 ERROR [S-WRONGROW-01] |
| 115 | DL | B-2-1 | 3 4년차 미 준수 인원 | 직접 입력(숫자 등) | 빈칸·형식 | 빈칸 ERROR [S-REQ-DIRECT]; 형식: 숫자 ERROR/WARNING(수식 참조 여부에 따라) [S-DTYPE-NUM]; 7행에 숫자 입력 여부 ERROR [S-WRONGROW-01] |
| 116 | DM | B-2-2 | a. 원내 학술활동 기록 보관 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 117 | DN | B-2-2 | b. 증례토론회 실시 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 118 | DO | B-2-2 | c. 학술잡지 초독회 실시 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 119 | DP | B-2-2 | d. 타과 합동 학술집담회 실시 횟수 (영상의학과, 병리과, 기타 회당  | 직접 입력(숫자 등) | 빈칸·형식 | 빈칸 ERROR [S-REQ-DIRECT]; 형식: 숫자 ERROR/WARNING(수식 참조 여부에 따라) [S-DTYPE-NUM]; 7행에 숫자 입력 여부 ERROR [S-WRONGROW-01] |
| 120 | DQ | B-2-2 | e. 교수 또는 staff 특강 실시 (외부연자 특강 포함) | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 121 | DR | B-2-2 | f. 해부실습 시행 여부 (Cadaver dissection) | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 122 | DS | B-2-3 | a. 2025년 외부 학술대회 총 참석 횟수 | 직접 입력(숫자 등) | 빈칸·형식·재계산·대조 | 빈칸 ERROR [S-REQ-DIRECT]; 형식: 숫자 ERROR/WARNING(수식 참조 여부에 따라) [S-DTYPE-NUM]; 7행에 숫자 입력 여부 ERROR [S-WRONGROW-01]; 증빙 합계 대조 ERROR('B-2-3'!F13) [S-SUM-01]; B-2-3 시트 행사 점검 WARNING [B-2-3-KIND, B-2-3-DUP, B-2-3-ROWS, P-PERIOD-MARFEB] |
| 123 | DT | B-2-3 | b. 2025년 10/ 1일 실제 근무 전공의 총 수 | 자동 계산(수식) | 형식·재계산·대조 | 자동계산 수식 훼손 WARNING [S-FORMULA-01]; 증빙 합계 대조 ERROR('A-3-2'!C9) [S-SUM-01]; 머리글 기준일(prev_oct1) WARNING [S-DATE-HDR] |
| 124 | DU | B-2-3 | a/b | 자동 계산(수식) | 형식·재계산·대조 | 자동계산 수식 훼손 WARNING [S-FORMULA-01] (6·8행); 재계산: 참석 횟수 ÷ 10/1 근무 전공의 수 ERROR [B-2-3-RECALC] |
| 125 | DV | B-3-1 | 1 2년차 미 준수 인원 | 직접 입력(숫자 등) | 빈칸·형식 | 빈칸 ERROR [S-REQ-DIRECT]; 형식: 숫자 ERROR/WARNING(수식 참조 여부에 따라) [S-DTYPE-NUM]; 7행에 숫자 입력 여부 ERROR [S-WRONGROW-01] |
| 126 | DW | B-3-1 | 2 3년차 미 준수 인원 | 직접 입력(숫자 등) | 빈칸·형식 | 빈칸 ERROR [S-REQ-DIRECT]; 형식: 숫자 ERROR/WARNING(수식 참조 여부에 따라) [S-DTYPE-NUM]; 7행에 숫자 입력 여부 ERROR [S-WRONGROW-01] |
| 127 | DX | B-3-1 | 3 4년차 미 준수 인원 | 직접 입력(숫자 등) | 빈칸·형식 | 빈칸 ERROR [S-REQ-DIRECT]; 형식: 숫자 ERROR/WARNING(수식 참조 여부에 따라) [S-DTYPE-NUM]; 7행에 숫자 입력 여부 ERROR [S-WRONGROW-01] |
| 128 | DY | B-4-1 |  | 세부 시트에 입력 | 검사 없음 | - |
| 129 | DZ | B-4-2 |  | 자동 계산(수식) | 형식·재계산·대조 | 자동계산 수식 훼손 WARNING [S-FORMULA-01]; 증빙 합계 대조 ERROR(논문!R2) [S-SUM-01]; 논문 시트 검사(P-*) 전체 |
| 130 | EA | B-4-3 | 평가전년도 발표 논문 총 수/평가전년도 전공의 총 정원수 | 자동 계산(수식) | 형식·재계산·대조 | 자동계산 수식 훼손 WARNING [S-FORMULA-01]; 재계산: 논문 점수 ÷ 전공의 총 정원 ERROR [B-4-3-RECALC] |
| 131 | EB | B-5-1 | 평가전년도 퇴원환자 실인원/평가전년도 전공의 총 정원수 | 자동 계산(수식) | 형식·재계산·대조 | 자동계산 수식 훼손 WARNING [S-FORMULA-01]; 재계산: 정원 기준 비율 ERROR [B-5-RECALC] |
| 132 | EC | B-5-2 | 평가전년도 외래환자 연인원/평가전년도 전공의 총 정원수 | 자동 계산(수식) | 형식·재계산·대조 | 자동계산 수식 훼손 WARNING [S-FORMULA-01]; 재계산: 정원 기준 비율 ERROR [B-5-RECALC] |
| 133 | ED | B-5-3 | 평가전년도 주요 수술 건수/평가전년도 전공의 총 정원수 | 자동 계산(수식) | 형식·재계산·대조 | 자동계산 수식 훼손 WARNING [S-FORMULA-01]; 재계산: 정원 기준 비율 ERROR [B-5-RECALC] |
| 134 | EE | B-5-4 |  | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 135 | EF | B-6-1 | 1 전공의 인적사항 | 선택(목록에서 고름) | 예외·형식 | 예외(guideline) → B-6-EPORTFOLIO [S-REQ-SEL]; 검사 안 함(규칙 비활성, 결과 없음) [B-6-EPORTFOLIO]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 136 | EG | B-6-1 | 2 수련기록(수련기간, 기관 등) | 선택(목록에서 고름) | 예외·형식 | 예외(guideline) → B-6-EPORTFOLIO [S-REQ-SEL]; 검사 안 함(규칙 비활성, 결과 없음) [B-6-EPORTFOLIO]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 137 | EH | B-6-1 | 3 취급 환자 기록 | 선택(목록에서 고름) | 예외·형식 | 예외(guideline) → B-6-EPORTFOLIO [S-REQ-SEL]; 검사 안 함(규칙 비활성, 결과 없음) [B-6-EPORTFOLIO]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 138 | EI | B-6-1 | 4 원외 학술회의 참석기록(참석기록부, 대회명, 일시, 장소) | 선택(목록에서 고름) | 예외·형식 | 예외(guideline) → B-6-EPORTFOLIO [S-REQ-SEL]; 검사 안 함(규칙 비활성, 결과 없음) [B-6-EPORTFOLIO]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 139 | EJ | B-6-1 | 5 발표논문기록(저자, 제목, 발표잡지, 과장 확인) | 선택(목록에서 고름) | 예외·형식 | 예외(guideline) → B-6-EPORTFOLIO [S-REQ-SEL]; 검사 안 함(규칙 비활성, 결과 없음) [B-6-EPORTFOLIO]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 140 | EK | B-6-1 | 6 타과 파견 근무 기록 | 선택(목록에서 고름) | 예외·형식 | 예외(guideline) → B-6-EPORTFOLIO [S-REQ-SEL]; 검사 안 함(규칙 비활성, 결과 없음) [B-6-EPORTFOLIO]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 141 | EL | B-6-2 |  | 선택(목록에서 고름) | 예외·형식 | 예외(guideline) → B-6-EPORTFOLIO [S-REQ-SEL]; 검사 안 함(규칙 비활성, 결과 없음) [B-6-EPORTFOLIO]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 142 | EM | B-6-3 |  | 선택(목록에서 고름) | 예외·형식 | 예외(guideline) → B-6-EPORTFOLIO [S-REQ-SEL]; 검사 안 함(규칙 비활성, 결과 없음) [B-6-EPORTFOLIO]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 143 | EN | B-7-1 |  | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 144 | EO | B-7-2 | 1 평가 시기(또는 주기) | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 145 | EP | B-7-2 | 2 평가자 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 146 | EQ | B-7-2 | 3 평가 방법 및 평가 요소 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 147 | ER | B-7-2 | 4 피드백 방법 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 148 | ES | B-7-2 | 5 개선활동 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 149 | ET | B-7-2 | 6 작성 보관 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 150 | EU | B-7-3 | 1 환자 진료 또는 이에 상응하는 의료 행위 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 151 | EV | B-7-3 | 2 의학적 지식 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 152 | EW | B-7-3 | 3 진료중심 학습과 개선 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 153 | EX | B-7-3 | 4 대인관계 및 의사소통 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 154 | EY | B-7-3 | 5 직업의식 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 155 | EZ | B-7-3 | 6 체계 중심 진료 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 156 | FA | B-7-3 | 7 수술 및 처치(술기) 수행능력 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 157 | FB | B-7-4 |  | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 158 | FC | B-8-1 |  | 현장 조사·서술 | 예외 | 예외(form_wording) [S-REQ-SEL] |
| 159 | FD | B-8-2 |  | 현장 조사·서술 | 예외 | 예외(form_wording) [S-REQ-SEL] |
| 160 | FE | B-9-1 |  | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 161 | FF | B-10-1 |  | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 162 | FG | B-10-2 | 1 전공의 공통 수행능력 평가 결과 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 163 | FH | B-10-2 | 2 교수 개발 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 164 | FI | B-10-2 | 3 교육수련 프로그램 수료자의 성적 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 165 | FJ | B-10-2 | 4 교육수련 프로그램의 질 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 166 | FK | C-1-1 | 수련병원 정원책정 지도전문의로서의 경력 합산년수 (2026년 5/1일 기 | 직접 입력(숫자 등) | 빈칸·형식 | 빈칸 ERROR [S-REQ-DIRECT]; 형식: 숫자 ERROR/WARNING(수식 참조 여부에 따라) [S-DTYPE-NUM]; 7행에 숫자 입력 여부 ERROR [S-WRONGROW-01]; 머리글 기준일(eval_may1) WARNING [S-DATE-HDR] |
| 167 | FL | C-1-1 | 1 총 전공의 수(A) × 5 이상 2 총 전공의 수(A) × (2 이상 | 자동 계산(수식) | 형식 | 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 168 | FO | C-4-1 | 2025년 발표 논문 총 수/2025년 9월 30일 기준 전체 전문의 총 | 자동 계산(수식) | 형식·재계산·대조 | 자동계산 수식 훼손 WARNING [S-FORMULA-01]; 재계산: 논문 점수 ÷ 전문의 수 ERROR [C-4-RECALC] |
| 169 | FQ | D-1 / a |  | 현장 조사·서술 | 예외 | 예외(form_wording) [S-REQ-SEL] |
| 170 | FS | D-1 / b |  | 현장 조사·서술 | 예외 | 예외(form_wording) [S-REQ-SEL] |
| 171 | FT | D-1 / c | 수술 전/후의 진단명, 수술 소견, 수술 수기, 지도전문의 cosign | 현장 조사·서술 | 예외 | 예외(form_wording) [S-REQ-SEL] |
| 172 | FU | D-1 / d | 병력/진단/처치/예후, 향후 추적계획, 지도전문의 cosign | 현장 조사·서술 | 예외 | 예외(form_wording) [S-REQ-SEL] |
| 173 | FV | E-1 |  | 자동 계산(수식) | 형식 | 자동계산 수식 훼손 WARNING [S-FORMULA-01]; 머리글 기준일(prev_oct1) WARNING [S-DATE-HDR] |
| 174 | FW | E-1 |  | 직접 입력(숫자 등) | 빈칸·형식 | 빈칸 ERROR [S-REQ-DIRECT]; 형식: 숫자 ERROR/WARNING(수식 참조 여부에 따라) [S-DTYPE-NUM]; 7행에 숫자 입력 여부 ERROR [S-WRONGROW-01] |
| 175 | FX | E-1 | 경조사, 병가, 분만휴가, 극제학회 참석 등은 증빙제출시 참여한 것으로  | 선택(목록에서 고름) | 예외·빈칸·형식 | 예외(none) → S-REQ-SEL-COND2, S-FX7-NA [S-REQ-SEL]; 빈칸 ERROR (조건부: FV6 > 0) [S-REQ-SEL-COND2]; 빈칸 WARNING (조건부: FV6 <= 0) [S-FX7-NA]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] |
| 176 | FY | E-2 / a | E-learning 등록자수 | 직접 입력(숫자 등) | 빈칸·형식 | 빈칸 ERROR [S-REQ-DIRECT]; 형식: 숫자 ERROR/WARNING(수식 참조 여부에 따라) [S-DTYPE-NUM]; 7행에 숫자 입력 여부 ERROR [S-WRONGROW-01] |
| 177 | FZ | E-2 / a | 평가년도 (2026년) 2월말일 기준 전공의 근무 현원 | 직접 입력(숫자 등) | 빈칸·형식 | 빈칸 ERROR [S-REQ-DIRECT]; 형식: 숫자 ERROR/WARNING(수식 참조 여부에 따라) [S-DTYPE-NUM]; 7행에 숫자 입력 여부 ERROR [S-WRONGROW-01]; 머리글 기준일(feb_end) WARNING [S-DATE-HDR] |
| 178 | GA | E-2 / a | 전공의 둥록자수/평가년도 2월말일 기준 전공의 현원 | 선택(목록에서 고름) | 빈칸·형식 | 빈칸 ERROR [S-REQ-SEL]; 자동계산 수식 훼손 WARNING [S-FORMULA-01] (6·8행) |
| 179 | GD | E-3-1 |  | 현장 조사·서술 | 예외 | 예외(form_wording) [S-REQ-SEL] |
| 180 | GE | E-3-2 |  | 현장 조사·서술 | 예외 | 예외(form_wording) [S-REQ-SEL] |
| 181 | GF | E-3-3 |  | 현장 조사·서술 | 예외 | 예외(form_wording) [S-REQ-SEL] |
| 182 | GG | E-3-4 |  | 현장 조사·서술 | 예외 | 예외(form_wording) [S-REQ-SEL] |
| 183 | GH | E-3-5 | 수료자 | 직접 입력(숫자 등) | 예외·빈칸 | 예외(guideline) → S-GH6 [S-REQ-DIRECT]; 빈칸 WARNING [S-GH6] |
| 184 | GI | E-3-5 | 취업현황 | 현장 조사·서술 | 예외 | 예외(form_wording) [S-REQ-SEL] |
| 185 | GJ | E-4-1 | 전공의 | 현장 조사·서술 | 예외 | 예외(form_wording) [S-REQ-SEL] |
| 186 | GK | E-4-1 | 전문의 | 현장 조사·서술 | 예외 | 예외(form_wording) [S-REQ-SEL] |
| 187 | GL | E-4-2 |  | 현장 조사·서술 | 예외 | 예외(form_wording) [S-REQ-SEL] |
| 188 | GM | E-4-3 |  | 현장 조사·서술 | 예외 | 예외(form_wording) [S-REQ-SEL] |
| 189 | GN | E-4-4 |  | 현장 조사·서술 | 예외 | 예외(form_wording) [S-REQ-SEL] |
| 190 | GO | E-4-5 |  | 현장 조사·서술 | 예외 | 예외(form_wording) [S-REQ-SEL] |

## 세부 시트 규칙

'전체' 시트가 아닌 세부 시트(수술 시트·A-6·B-2-3·논문 등)에서 도는 규칙이다. 규칙 파일에서 자동으로 만든다. 꺼 둔 규칙은 결과를 내지 않는다.

| 시트 | 규칙 | 단계 | 보는 칸 | 내용 |
|---|---|---|---|---|
| 수술 시트 공통(a~l 12개) | S-SUM-01 | ERROR | 시트 총계(G1 등) ↔ 전체 A-6-4 | '전체' 시트 값과 증빙 시트 합계가 다릅니다. |
| 수술 시트 공통(a~l 12개) | A-6-ROWS-01 | WARNING | D(행 수를 세는 칸) | 증빙 시트의 환자 행 수와 총 건수 칸 값이 다릅니다. 양측 수술(2건) 등 정당한 차이인지 확인하세요. |
| 수술 시트 공통(a~l 12개) | A-6-DATE-LIMIT | INFO | C(날짜) | 수술 날짜가 'O월 O일' 형식이라 연도가 없어 2025년 1~12월 기간 검사를 자동으로 할 수 없습니다(연도가 적힌 행만 검사). |
| 수술 시트 공통(a~l 12개) | A-6-DATE-01 | WARNING | C(날짜) | 수술(검사) 날짜가 2025년 1~12월 밖입니다. |
| 수술 시트 공통(a~l 12개) | A-6-PRIV-01 | WARNING | D(이름) | 개인정보 가림 처리 확인: 환자 이름 가운데가 '*'로 가려지지 않은 것으로 보입니다. |
| 수술 시트 공통(a~l 12개) | A-6-DUP-01 | INFO | - | 증빙 시트에 환자 식별 칸이 없어 같은 환자 중복(한쪽만 인정)을 자동으로 확인할 수 없습니다. |
| b ESS | A-6-ESS-SIDES | ERROR | H(건수 합), I1(총계) | 부비동내시경수술: 소계(R+L) 열의 합과 총 건수가 다릅니다. |
| i 두경부양성 | A-6-PATH-01 | WARNING | G(병리), E(진단), E·F(필수) | 두경부 양성종양: 진단명·수술명이 비었거나, 진단명이 병리 소견 없이 'Neck mass'처럼 적혀 있습니다. 불인정될 수 있습니다. |
| k 수면무호흡 | A-6-OSA-01 | WARNING | C(필수) | 수면무호흡: PSG 시행일이 비어 있습니다. |
| k 수면무호흡 | A-6-OSA-02 | WARNING | E·F 중 하나 | 수면무호흡: 양압기 처방일과 수술일이 모두 비어 있습니다. PSG 후 양압기 또는 UPPP 이상 수술이 있어야 인정됩니다. |
| A-6 | S-EXCEL-ERR | WARNING | - | 엑셀 오류값(#DIV/0!, #REF! 등)이 저장되어 있습니다. 입력 칸이 비었거나 수식이 깨졌을 수 있습니다. |
| A-6 | S-SUM-01 | ERROR | N4 ↔ BQ6, N10 ↔ BR6 | '전체' 시트 값과 증빙 시트 합계가 다릅니다. |
| A-6 | A-6-EVID-01 | WARNING | - | A-6-2·A-6-3: 의무기록실 또는 원무팀 확인서 첨부가 보이지 않습니다. 별도 파일로 제출했다면 무시하세요. |
| B-2-3 | S-SUM-01 | ERROR | F13 ↔ DS6 | '전체' 시트 값과 증빙 시트 합계가 다릅니다. |
| B-2-3 | P-PERIOD-MARFEB | WARNING | C(날짜) | B-2-3: 학술대회 일시가 2025년 3월~2026년 2월 밖입니다. |
| B-2-3 | B-2-3-ROWS | WARNING | B·C·E(필수) | 외부 학술대회: 참석 인원은 있는데 행사명·일시·참가자 이름이 비어 있습니다. |
| B-2-3 | B-2-3-KIND | WARNING | C(날짜), B(행사명), F(횟수), D(장소) | 외부 학술대회: 정기학술대회가 아닐 수 있는 행사(심포지엄·연수회·세미나·포럼·집담회 등)입니다. 참석 횟수에 들어가는지 확인하세요. |
| B-2-3 | B-2-3-INTL | INFO | C(날짜), B(행사명), F(횟수), D(장소) | 국제학술대회 인정 조건 확인: 국내 개최 국제학회는 대한의사협회 승인 국제학회만 인정되며, 명찰이나 등록영수증을 PDF로 B-2-3 시트에 첨부해야 합니다. |
| B-2-3 | B-2-3-DUP | WARNING | C(날짜), B(행사명), F(횟수), D(장소) | 외부 학술대회: 같은 학술대회를 날짜(일차)별로 나눠 적은 것으로 보입니다. 한 번만 세는지 확인하세요. |
| 논문 | S-FORMULA-01 | WARNING | - | 자동계산(회색) 칸의 수식이 값으로 바뀌었거나 지워졌습니다. 수기로 고친 것이라면 이유를 확인하세요. |
| 논문 | S-EXCEL-ERR | WARNING | - | 엑셀 오류값(#DIV/0!, #REF! 등)이 저장되어 있습니다. 입력 칸이 비었거나 수식이 깨졌을 수 있습니다. |
| 논문 | S-SUM-01 | ERROR | R2 ↔ DZ6 | '전체' 시트 값과 증빙 시트 합계가 다릅니다. |
| 논문 | P-REQ-01 | ERROR | - | 논문: 저널종류(D열)가 비었거나 양식의 선택지가 아닙니다. 점수 자동계산에 쓰이는 칸입니다. |
| 논문 | P-REQ-02 | WARNING | - | 논문: 저널명 또는 출판일이 비어 있습니다. |
| 논문 | P-COUNT-01 | WARNING | - | 논문: 저자 수(총 제1저자 수·해당 병원 제1저자 수·총 교신저자 수·해당 병원 교신저자 수)를 확인하세요. |
| 논문 | P-QYEAR-01 | WARNING | - | 논문: 기재한 출판일이 평가 대상 연도(reference.paper_year)가 아닙니다. 정식 출판일 기준으로 확인하세요. |
| 논문 | P-BIB-OFF | INFO | - | 외부 서지 조회를 사용하지 않아 논문 서지(정식 출판·연도·형식·등재)는 확인하지 않았습니다. |
| 논문 | P-BIB-FAIL | WARNING | - | 외부 서지 확인 불가: Crossref·PubMed 조회가 실패했습니다(네트워크 차단·시간 초과 등). 직접 확인하세요. |
| 논문 | P-BIB-UNSURE | WARNING | - | 자동 확인 불가: 서지 DB에서 확신할 만큼 일치하는 논문을 찾지 못했습니다. 아래 후보가 같은 논문인지 확인하세요. |
| 논문 | P-DOI-01 | WARNING | - | 논문: DOI 형식이 맞지 않거나 Crossref에서 찾을 수 없습니다. |
| 논문 | P-DOI-02 | WARNING | - | 논문: 기재한 DOI의 서지 제목이 엑셀의 제목과 다릅니다. |
| 논문 | P-EPUB-01 | WARNING | - | 정식 출판 전 논문은 불인정될 수 있음: 권·호·쪽(또는 논문번호)이 확인되지 않는 선출판(Epub/Online ahead of print)입니다. |
| 논문 | P-YEAR-01 | WARNING | - | 정식 출판일이 평가 대상 연도가 아닙니다. 실적 기간 밖일 수 있으니 확인하세요. |
| 논문 | P-TYPE-01 | WARNING | - | 불인정 형식: 서지 유형이 Letter·Editorial·Comment입니다. Letter to the editor는 인정되지 않을 수 있습니다. |
| 논문 | P-TYPE-02 | WARNING | - | 원저로 기재했으나 서지 유형이 종설·증례입니다. 한이인지 원저 가중치가 적용되지 않을 수 있습니다. |
| 논문 | P-JOUR-KCI | WARNING | - | 국내지로 기재했으나 KCI 등재(후보)지·유관학회지 목록에서 찾지 못했습니다. 인정 대상 학술지인지 확인하세요. |
| 논문 | P-JOUR-SCIE | WARNING | - | SCI/SCIE로 기재했으나 불러온 SCIE 목록에서 찾지 못했습니다(또는 ESCI 단독). 등재 여부를 확인하세요. |
| 논문 | P-JOUR-SCIE-SKIP | INFO | - | SCIE 목록 미등록으로 확인 생략: SCIE 저널 목록을 불러오면 SCI/SCIE 기재 논문의 등재 여부를 확인합니다. |
| 논문 | P-AUTH-01 | WARNING | - | 공동 제1저자(동등 기여) 표시가 서지에 있는데 총 제1저자 수가 1로 적혀 있습니다. 표시 누락인지 확인하세요. |
| 논문 | P-PRED-01 | INFO | - | 수련위원회 심의 대상이 될 수 있음: 적절한 논문 형식을 갖추지 못한 짧은 증례(예: ENT Journal Clinic 계열 1~2쪽)로 보입니다. |
| 논문 | P-EVID-01 | WARNING | T(첨부) | 이 논문 행에 표지 PDF 첨부가 보이지 않습니다. 칼라 인쇄물로 따로 제출했다면 무시하세요. |
| A-3-2 | S-EXCEL-ERR | WARNING | - | 엑셀 오류값(#DIV/0!, #REF! 등)이 저장되어 있습니다. 입력 칸이 비었거나 수식이 깨졌을 수 있습니다. |
| A-3-2 | S-SUM-01 | ERROR | B9 ↔ Q6, C9 ↔ DT6 | '전체' 시트 값과 증빙 시트 합계가 다릅니다. |
| A-3-3 | P-PERIOD-LIMIT | INFO | - | A-3-3(파견기간 '0개월')·A-10-3(월별 당직표)은 날짜 칸이 없어 2025년 3월~2026년 2월 기간 검사를 자동으로 할 수 없습니다. |
| A-10-3-d | P-PERIOD-LIMIT | INFO | - | A-3-3(파견기간 '0개월')·A-10-3(월별 당직표)은 날짜 칸이 없어 2025년 3월~2026년 2월 기간 검사를 자동으로 할 수 없습니다. |

- 수술 시트의 날짜 검사(A-6-DATE-01·LIMIT)는 각 시트의 C열 하나만 본다. 'k 수면무호흡'의 C열은 PSG 시행일이며, 양압기 처방일(E)·수술일(F)은 다음 해여도 인정이라 기간 검사를 하지 않는다(시트 A3 산정기준).
- 논문 시트 P-* 규칙의 보는 칸은 규칙 파일 `papers.columns`를 따른다.

## 혼동 주의 머리글

2026 양식 '전체' 시트에서 같은 항목 코드 안의 머리글끼리 유사도(공백·기호·원문자를 지운 뒤 비교)가 0.8 이상인 쌍이다. 연차 숫자 한 글자만 다르다.

| 코드 | 열 | 머리글 | 열 | 머리글 | 유사도 |
|---|---|---|---|---|---|
| B-2-1 | DJ | ① 2년차 미 준수 인원 | DK | ② 3년차 미 준수 인원 | 0.889 |
| B-2-1 | DK | ② 3년차 미 준수 인원 | DL | ③ 4년차 미 준수 인원 | 0.889 |
| B-3-1 | DV | ① 2년차 미 준수 인원 | DW | ② 3년차 미 준수 인원 | 0.889 |
| B-3-1 | DW | ② 3년차 미 준수 인원 | DX | ③ 4년차 미 준수 인원 | 0.889 |

- 규칙의 머리글은 양식 원문과 정확히 같게 적었으므로 원본 양식에서는 늘 정확 일치로 찾는다.
- 병원이 이 머리글을 고치면 유사 일치로 넘어가는데, 짝이 되는 열과 점수 차이가 0.1 미만이면 열을 고르지 않는다. 'ERROR: 양식에서 항목 X의 열을 하나로 정할 수 없습니다(후보: …)'(`S-COL-02`)를 내고 그 점검만 건너뛴다. 다른 열로 잘못 가지 않는다(`tests/unit/columns.test.ts`가 쌍마다 숫자를 지우거나 '(명)'을 붙여 확인).
- 이 목록은 테스트가 2026 양식 머리글에서 다시 계산해 대조한다. 새 연도 양식에서는 다시 뽑는다.

## 심사 대상에서 뺀 열(확인표 제외된_열)

| 열 | 내용 | 처리 |
|---|---|---|
| A | 행 이름 칸 | 제외 확정 |
| FM | C-2 이비인후과 관련문항 없음 | 제외 확정 |
| FN | C-3 이비인후과 관련문항 없음 | 제외 확정 |
| FP | C-5 이비인후과 관련문항 없음 | 제외 확정 |
| FR | D-1 a 병합 서식 오류(FQ와 같은 항목) | 제외 확정(서식 오류 의견) |
| GB·GC | E-2 b 이러닝 수료 규정 충족률 | 2026 제외 유지(규칙 E-2-B 비활성). 2027 적용 방식 미정 |
| GP·GQ | 심사위원 이름·의견 칸 | 제외 확정 |
