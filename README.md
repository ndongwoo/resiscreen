# ResiScreen — 수련실태조사서 사전 점검 도구

대한이비인후과학회 전공의 수련실태조사서(엑셀)를 각 수련병원 담당자가 학회에 내기 전에 자기 PC의 브라우저에서 점검하는 정적 웹앱입니다. 학회 내부 일괄 처리용 Node CLI도 함께 있습니다.

- 엑셀 파일은 브라우저 밖으로 나가지 않습니다. 서버가 없습니다.
- 이 도구는 판정하지 않습니다. 빈칸, 형식 위반, 기간 의심, 서지 불일치 같은 '확인할 점'만 알려 줍니다. 최종 판정은 사무국과 수련위원이 합니다.
- 판단 규칙은 코드가 아니라 `rules/<연도>.json`에 있습니다.
- **배포 주소: https://nam.md/resiscreen/** (저장소 `ndongwoo/resiscreen`의 GitHub Pages. 계정의 사용자 사이트에 사용자 지정 도메인 `nam.md`가 설정되어 있어, `https://ndongwoo.github.io/resiscreen/`는 이 주소로 연결됩니다)

> GitHub 웹 화면에서 규칙을 고치고 자동 배포를 확인하는 자세한 절차와 비개발자용 규칙 설명(RULES.md)은 마일스톤 6에서 채웁니다.

## 외부로 나가는 정보

- 논문 확인을 위해 DOI 또는 논문 제목만 Crossref·PubMed(NCBI)에 조회합니다(마일스톤 4).
- **연락처 이메일**
  - **웹 화면:** '외부 서지 조회 사용'이 켜져 있으면 연락처 이메일을 꼭 입력해야 '점검 시작'이 눌립니다. 형식을 검사하고, example·test 같은 예시용 도메인은 받지 않습니다. 입력한 이메일은 Crossref 요청의 `mailto`로만 쓰고, 결과 화면·결과 엑셀·인쇄용 HTML·서지 캐시에는 넣지 않습니다. 저장하지 않는 것이 기본이며, '이 브라우저에 기억'을 켠 경우에만 IndexedDB에 저장합니다(삭제 버튼 있음). 서지 조회를 끄면 이메일 없이 점검할 수 있습니다.
  - **PubMed(E-utilities):** `tool=resiscreen`과 학회 연락처(`rules/<연도>.json`의 `biblio.pubmed_email`)를 고정으로 보냅니다.
  - **CLI:** `--mailto`를 주지 않으면 `biblio.mailto`(학회 연락처)를 씁니다.
  - `biblio.mailto`·`biblio.pubmed_email`은 공개 저장소와 웹 번들에 그대로 들어가므로 학회 공용 주소만 넣으세요.
- NCBI API 키는 브라우저에 노출되므로 쓰지 않습니다.

## 필요한 환경

- **Node.js 20 이상**(개발·확인은 Node 22.22), npm 9 이상. 웹 화면은 최신 Chrome·Edge에서 동작합니다(마일스톤 5).
- 일부 Node 배포판은 TypeScript를 직접 실행하지 못합니다. 그래서 CLI와 도구는 `tsc`로 `dist-node/`에 컴파일한 뒤 실행합니다. 아래 `npm run` 명령들이 컴파일을 자동으로 합니다. `dist-node/`는 커밋하지 않습니다.

## 웹 화면(병원 담당자용)

- 빌드: `npm run build:web` → `dist/` (정적 파일만. GitHub Pages에 그대로 올린다)
- 로컬 미리보기: `npm run preview` → http://127.0.0.1:4173/
- 파일은 브라우저의 Web Worker 안에서만 처리합니다. 서지 조회 캐시와 SCIE 목록만 IndexedDB(`resiscreen`)에 저장하며, 화면의 버튼으로 지울 수 있습니다.
- 외부 요청은 Crossref·PubMed 두 곳뿐입니다. 페이지 CSP(`index.html`)와 엔진의 허용 호스트 목록(`src/engine/biblio/client.ts`의 `ALLOWED_HOSTS`)이 함께 막습니다. 두 목록은 테스트로 일치를 확인합니다.

## CLI로 점검하기(학회 내부 일괄 처리)

```bash
npm ci
```

```bash
npm run check -- 병원1.xlsx 병원2.xlsx --out 결과폴더
```

파일마다 `<이름>.점검결과.xlsx`(요약·결과 목록)와 `<이름>.result.json`이 만들어집니다.

- `--no-biblio`: 외부 서지 조회를 하지 않습니다(오프라인). 논문 서지 검사는 건너뛰고 나머지 검사는 모두 합니다.
- `--scie <파일>`: 학회에서 받은 SCIE 목록(엑셀 또는 CSV)으로 SCI/SCIE 기재 논문의 등재 여부를 확인합니다. 이 파일은 저장소에 넣지 마세요(Clarivate 라이선스).
- `--cache <파일>`: 서지 조회 캐시 위치(기본 `~/.cache/resiscreen/biblio.json`, 30일). 공개 서지 정보만 저장합니다.
- `--mailto <이메일>`: Crossref에 보낼 연락처. 없으면 `biblio.mailto`를 씁니다.
- 외부 조회는 초당 2건 이하로 보냅니다. 논문 20편이면 첫 실행에 30초 남짓 걸리고, 다시 실행하면 캐시로 바로 끝납니다. 한 파일이라도 ERROR가 있으면 종료 코드는 1입니다. 컴파일된 뒤에는 `node dist-node/src/cli/index.js check <파일들> --out <폴더>`로 바로 실행해도 됩니다.

## 개발자용 명령

```bash
npm test
```

```bash
npm run validate:rules
```

```bash
npm run check -- tests/fixtures/synthetic/합성_2026_오류포함.xlsx --out out
```

- `npm run typecheck`: 타입 검사
- `npm run check:fixtures`: 공개하면 안 되는 엑셀 파일이 추적되는지 검사
- `npm run gen:docs`: 규칙을 바꾼 뒤 `docs/ITEM_COVERAGE.md`(항목별 점검 범위)와 `docs/RULES.md`(규칙 ID 목록, 이전 ID → 새 ID 매핑)를 다시 만든다. 테스트가 두 문서가 규칙과 맞는지 확인한다
- `npm run eval:recall`: 평가 전·후 파일로 재현율 계산(비공개 파일이 있을 때만)
- `npm run bench:read -- <direct|exceljs> <파일>`: 엑셀 읽기 성능 비교

## 배포 절차

GitHub에 올리기(push) 전에 **반드시** 아래 순서를 지킵니다. 공개 저장소는 커밋 이력까지 모두 공개됩니다.

1. 테스트와 규칙 검사:

   ```bash
   npm test && npm run validate:rules
   ```

2. **공개 전 검사(필수)**: 작업 트리와 커밋 이력 전체에서 병원 파일의 원문(이름·논문 제목·병원명·셀 값), 허용 목록 밖의 이메일, 주민등록번호·휴대전화 모양, 공개 위치 밖의 엑셀 파일을 찾습니다. 결과가 **0건**이어야 push합니다.

   ```bash
   npm run scan:private
   ```

   - 이 PC에 비공개 fixture(`tests/fixtures/private/*.xlsx`)가 있으면 그 파일의 문자열로 검사합니다. 없으면 기본 패턴만 검사합니다(CI도 기본 패턴만).
   - 찾은 문자열은 앞 두 글자만 보이게 가려서 출력합니다.
   - 일반 용어라 빼야 하는 항목은 `tools/prepublish_allowlist.json`에 이유와 함께 적습니다. 사람·병원을 식별할 수 있는 말은 넣지 않습니다.
   - 0건이 아니면 해당 파일을 고칩니다. 이미 커밋된 경우에는 이력 정리가 필요하니 담당자와 상의합니다.
3. push하면 GitHub Actions가 동작합니다.
   - `ci`: 타입 검사, 테스트, 규칙 검사, 공개 전 검사(기본 패턴), 빌드
   - `pages`: main 브랜치만 해당. 깨끗한 checkout에서 빌드하고 GitHub Pages에 배포합니다. 앱 버전은 빌드한 커밋이며, `-dirty`가 붙으면 배포를 멈춥니다.
4. 배포가 끝나면 아래 '배포 후 확인'을 진행합니다.

## 버전 표시

결과 화면 요약, '점검결과' 엑셀 요약 시트, 인쇄용 HTML 세 곳에 다음을 적습니다.
- 앱 버전: 빌드한 git 커밋 8자리. 커밋하지 않은 변경이 있으면 `-dirty`가 붙습니다.
- 규칙 파일 버전: `rules_version`과 내용 지문 8자리
- KCI 목록 기준일

규칙을 고치면 `rules/<연도>.json`의 `rules_version`도 올려 주세요. 올리지 않아도 지문은 바뀝니다. 빌드 결과의 스크립트·CSS 파일 이름에는 내용 해시가 붙으므로(`assets/index-<해시>.js`, `assets/worker-<해시>.js`), 새로 배포하면 브라우저가 이전 파일을 쓰지 않습니다. `index.html`만 이름이 고정입니다.

## 배포 후 확인(수동 체크리스트)

GitHub Pages 주소에서 사람이 직접 확인합니다. 결과는 날짜와 함께 이슈나 문서에 남겨 주세요.

1. **Edge(최신판)와 Chrome**에서 각각 페이지가 열리는지, 안내 문구가 보이는지 확인합니다.
2. **큰 파일 처리 시간**: A·B·C·D병원 익명화 파일(8~50MB)을 하나씩 점검합니다.
   - 서지 조회를 끄고 잰 시간: 기준 10초 이내
   - 조회를 켜고 첫 실행: 기준 90초 이내
   - 같은 파일을 다시 점검(캐시 적중): 기준 15초 이내
   - 처리 중에 화면이 멈추지 않는지(스크롤·체크박스가 반응하는지)
3. **오프라인**: DevTools(F12) → Network 탭 → 'Offline'으로 바꾸고 점검합니다. 검사가 끝까지 돌고 논문에만 '외부 서지 확인 불가' WARNING이 붙는지 확인합니다. 재시도 때문에 논문당 십여 초가 걸릴 수 있습니다.
4. **조회 취소**: 서지 조회 캐시를 지운 뒤 논문이 많은 파일을 점검하다가 '논문 조회 취소'를 누릅니다. 곧 멈추고 남은 논문이 '확인 불가(취소)'로 표시되는지 확인합니다.
5. **인쇄**: 결과 화면에서 '인쇄(PDF로 저장)'를 눌러 인쇄 미리보기에 결과 표만 나오는지, 'PDF로 저장'이 되는지 확인합니다. '인쇄용 HTML 내려받기' 파일을 열어 같은 내용이 보이는지도 확인합니다.
6. **150MB 확인 창**: 150MB가 넘는 .xlsx(테스트용으로 큰 첨부를 넣은 사본)를 고르고 '점검 시작'을 누르면 확인 창이 뜨는지, '취소'를 누르면 시작하지 않는지 확인합니다.
7. **연락처 이메일**: 빈칸·`me@example.com`이면 '점검 시작'이 눌리지 않는지, 서지 조회를 끄면 눌리는지 확인합니다. '이 브라우저에 기억'을 켜고 새로고침하면 남아 있는지, 삭제 버튼으로 지워지는지 확인합니다.
8. **SCIE 목록**: 학회 목록 파일을 불러와 저장 표시가 보이는지, 새로고침 후에도 남는지, 삭제되는지 확인합니다.
9. **버전 표시**: 결과 요약의 앱 버전이 배포한 커밋과 같은지 확인합니다.
10. **저장소**: DevTools → Application → IndexedDB → `resiscreen`에 `biblio`·`journals`·`settings` 외의 저장소가 없는지, Local Storage가 비어 있는지 확인합니다.

## 저널 목록 갱신(연 1회)

- **KCI 등재(후보)지**: `data/journals/kci.json`
  1. 공공데이터포털 '한국연구재단_KCI학술지정보'(https://www.data.go.kr/data/3049043/fileData.do)에서 CSV를 내려받습니다.
  2. 아래 명령을 실행합니다(날짜는 파일의 기준일).

     ```bash
     npm run build:node && node dist-node/tools/import_kci.js 내려받은파일.csv 2026-08-25
     ```
- **유관학회지 11종**: `data/journals/kci_related.json` (GitHub 웹 화면에서 직접 고칠 수 있습니다)
- **흔히 쓰는 저널 별칭**: `data/journals/kci_aliases.json` (ISSN → 별칭 목록)

## 새 연도 양식 추가 절차

평가연도마다 규칙 파일 하나(`rules/<연도>.json`)를 둡니다. 웹 화면과 CLI는 `rules/` 폴더의 모든 연도 파일을 읽고, 엑셀의 서명(`form.signature`)으로 양식 연도를 알아내 그 해 규칙을 씁니다. 맞는 규칙이 없으면 '지원하지 않는 양식' ERROR를 냅니다.

1. **규칙 파일 복사**: `rules/2026.json`을 `rules/2027.json`으로 복사합니다(GitHub 웹 화면: 파일 열기 → Raw 내용 복사 → Add file → Create new file).
2. **연도와 서명 수정**: `form.year`를 2027로 바꿉니다.
   - 실적 기간(Y-1년 1~12월), 3~2월 항목 기간(Y-1년 3월~Y년 2월 말일, 윤년 자동), 전문의 수 기준일(Y-1년 9/30), 논문 연도(Y-1)는 `form.year`에서 자동 계산됩니다. 다르게 정해야 할 때만 `reference`에 값을 직접 적습니다(적은 값이 우선).
   - `form.label`과 `form.signature`(표지·'전체' 시트의 고정 문구 셀)를 새 양식에 맞게 고칩니다. 연도를 구분하는 칸(2026: 표지 B4의 '2026년도 수련실태조사', 전체 A-2-1 머리글의 '2025년 9/30일 기준')의 연도를 반드시 바꿉니다. 두 연도의 서명이 한 파일에 함께 맞으면 'ERROR: 양식 연도를 판별할 수 없습니다'로 멈춥니다.
3. **바뀐 항목·셀 수정**: '전체' 시트의 칸은 열 문자 대신 **항목 키**로 적습니다(아래 '항목 키'). 그래서 새 열이 끼어들어도(예: 2027 기관절개술 건수) 기존 규칙은 고칠 필요가 없습니다. 새 항목을 점검하려면 그 항목의 키로 규칙을 추가합니다. 다른 시트(수술 시트·논문 시트 등)의 열이 바뀌었으면 `surgery_sheets`, `papers.columns`를 고칩니다. 올해 제외·부활 항목은 그 연도 규칙 파일의 `enabled`로 켜고 끕니다. 규칙은 연도별 파일에 있으므로 한 해만 켜거나 꺼도 다른 연도에는 영향이 없습니다. 예: B-6 e-Portfolio 8개 열(`B-6-EPORTFOLIO`)은 양식상 심사 항목이지만 2026 가이드라인상 해당 없음이라 `rules/2026.json`에서 `"enabled": false`입니다. 2027년부터 다시 적용하므로(학회 확인, 2026-11-27) `rules/2027.json`에서 `true`로 바꾸면 빈칸 검사가 켜집니다. E-2 b(`E-2-B`)도 같은 방식입니다. `rules_version`도 올립니다.
4. **자동계산 칸 위치**: 새 양식 완성본으로 `data/forms/<연도>_formulas.json`을 만듭니다(수식 위치만, 값·이름 없이). 개발자에게 요청합니다.
5. **합성 샘플 추가**: `tests/helpers/synthetic_form.ts`와 `tools/make_synthetic.ts`로 새 연도 합성 샘플을 만들어 `tests/fixtures/synthetic/`에 둡니다. 실제 병원 파일은 넣지 않습니다.
6. **KCI 목록 갱신**: 아래 '저널 목록 갱신' 절차로 `data/journals/kci.json`을 새 기준일로 바꿉니다.
7. **검사**: `npm test`, `npm run validate:rules`, 그리고 **`npm run scan:private`(0건 확인)**.
8. **push**: main에 push하면 CI와 Pages 배포가 자동으로 돕니다. 배포 후 '배포 후 확인' 체크리스트를 진행합니다.

**2027 양식 전에 할 일(개발)**: 문서 생성 도구가 아직 2026에 맞춰져 있습니다. 새 연도 규칙을 만들기 전에 정리합니다(`docs/OPEN_QUESTIONS.md` '2027 양식 준비'에도 같은 목록).

- [ ] `tools/item_coverage.ts`의 연도 고정 없애기: 입력 경로(`rules/2026.json`, `data/forms/2026_formulas.json`·`2026_items.json`·`2026_layout.json`), 문서 제목('2026 심사 대상 190개'), 설명 문구('2026 양식', '2026 가이드라인', '2026 제외 유지')를 연도 인자와 규칙 파일 값(`form.year`)에서 만든다.
- [ ] `EXTRA`(세부 시트 쪽 점검을 붙일 열)와 설명 문장의 열 문자(CU, DY, R, CT, 제외 열 표의 A·FM·FN·FP·FR·GB·GC·GP·GQ)를 항목 코드 기반(`{코드|머리글}` 키)으로 바꿔, 열이 끼어든 양식에서도 맞게 나오게 한다.
- [ ] `RATIO_TEXT`(재계산 규칙 설명: '정원 기준 비율', '논문 점수 ÷ 전문의 수' 등)를 코드에서 빼고 규칙 파일의 설명 필드(예: 규칙마다 `coverage_text`)로 옮긴다. 스키마(`rules/schema.json`)도 함께 고친다.
- [ ] `tests/helpers/synthetic_form.ts`의 `resolveForLayout`·`layoutIndex`(와 `layout2026`)를 `src/`나 `tools/lib/`로 옮긴다. 지금은 생성 도구(`tools/item_coverage.ts`)가 테스트 도우미를 가져다 쓴다.
- [ ] 정리 뒤 `npm run gen:docs`로 2026 문서를 다시 만들어 바뀐 내용이 없는지 확인한다.

## 항목 키('전체' 시트의 열 찾기)

규칙 파일에서 '전체' 시트의 칸은 `{항목코드|머리글}행번호`로 적습니다.

- `{A-2-1|② 정원책정 지도전문의 수}6` → A-2-1 항목 중 5행(또는 4행) 머리글이 '② 정원책정 지도전문의 수'인 열의 6행
- `{B-4-2}6` → 열이 하나뿐인 항목은 코드만 적습니다.
- `{A-1-1}7:{A-1-2|⑤ 휴가}7` → 범위(두 열 사이 모든 칸)
- 하위 항목 코드가 `a`, `b`처럼 적힌 칸(D-1, E-2)은 중분류를 붙여 `E-2 a`로 씁니다.
- 머리글은 이 순서로 찾습니다.
  1. **정확 일치**: 공백·기호·원문자(①)를 지운 뒤 4행 또는 5행 머리글과 똑같은 열. 규칙에는 양식 원문을 그대로 적습니다(원본 오타 '둥록자수'도 그대로).
  2. **유사 일치**: 정확 일치가 없을 때만. 가장 비슷한 열의 유사도가 0.8 이상이고 2등 후보보다 0.1 이상 높을 때만 그 열로 정하고, 'INFO: 항목 X를 비슷한 머리글로 찾았습니다(규칙 문구 / 양식 문구)'(`S-COL-03`)를 냅니다. 예: 다음 해 양식에서 머리글 연도가 바뀐 경우(2025년 → 2026년).
- 후보가 여럿이라 하나로 정할 수 없으면 'ERROR: 양식에서 항목 X의 열을 하나로 정할 수 없습니다(후보: …)'(`S-COL-02`)를 내고, 그 항목을 쓰는 점검만 건너뜁니다. 머리글이 서로 비슷해 헷갈리기 쉬운 열은 `docs/ITEM_COVERAGE.md`의 '혼동 주의 머리글'에 있습니다.
- 찾지 못하면 'ERROR: 양식에서 항목 X를 찾을 수 없습니다'(`S-COL-01`)를 내고, 그 항목을 쓰는 점검만 건너뜁니다.
- 양식 서명(`form.signature`)도 칸 위치는 항목 키로 찾지만, 칸에 적힌 값(연도 문구)은 `equals`·`contains`로 정확히 비교합니다. 머리글의 '2025년'을 '2026년'으로 고친 파일은 2026 규칙과 맞지 않습니다.
- 항목별로 어떤 점검을 하는지는 `docs/ITEM_COVERAGE.md`에 정리되어 있습니다.
- 양식 머리글에 적힌 기준일(5/1, 10/1, 9/30, 2월 말일)이 조사 연도에서 계산한 날짜와 다르면 WARNING(`S-DATE-HDR`)을 냅니다. 지난해 양식을 고쳐 쓴 파일을 알아채기 위한 점검입니다.

## 서지 조회 캐시

- 결과 종류별 유효 기간(`biblio.cache_ttl`): 정식 출판(권·호·쪽 등 근거 있음) 30일, Epub·온라인 선출판 3일, 찾지 못함 1일. 네트워크 오류·시간 초과·취소는 저장하지 않습니다.
- 항목 수 상한(`biblio.cache_max_entries`, 기본 2,000): 넘으면 오래된 것부터 지웁니다(기한이 지난 항목도 함께).
- 캐시 키에 형식 버전(`CACHE_FORMAT_VERSION`, `src/engine/biblio/client.ts`)이 들어 있습니다. 매칭·판정 로직을 바꾸면 이 값을 올려 옛 캐시를 쓰지 않게 합니다.
- 결과 화면의 '논문 조회 결과' 표와 결과 엑셀의 '논문 조회' 시트에 논문마다 출처별 결과와 '캐시(조회일)' 또는 '새로 조회'를 표시합니다.
- 확인 불가·확신 미달·Epub·DOI 불일치·연도 결과에는 '다시 조회' 버튼이 있습니다. 그 논문만 캐시를 무시하고 다시 조회해 그 논문의 결과만 바꿉니다. 전체 캐시는 '서지 조회 캐시 지우기'로 지웁니다.
- 캐시에는 공개 서지 정보만 저장합니다. 연락처 이메일과 엑셀 파일 내용은 들어가지 않습니다.

## 저장소 이전(학회 조직 계정으로)

처음에는 개인 계정(`ndongwoo/resiscreen`, 배포 주소 https://nam.md/resiscreen/)에 두고, 학회 조직 계정이 생기면 옮깁니다.

1. **이전(Transfer)**: 저장소 → Settings → General 맨 아래 'Danger Zone' → **Transfer** → 새 소유자(학회 조직)와 저장소 이름을 입력합니다. 옮기는 사람은 조직에서 저장소를 만들 수 있는 권한이 있어야 합니다.
   - 이슈·커밋 이력·Actions 워크플로는 함께 옮겨지고, 예전 `github.com/ndongwoo/resiscreen` 주소는 새 주소로 자동 연결됩니다(git clone·push 포함).
2. **Pages 주소는 자동으로 연결되지 않습니다.**
   - 이전 뒤 배포 주소는 `https://<조직>.github.io/resiscreen/`(조직에 사용자 지정 도메인이 있으면 그 도메인)로 바뀝니다. 예전 주소 `https://nam.md/resiscreen/`(= `ndongwoo.github.io/resiscreen/`)는 404가 됩니다.
   - 새 저장소에서 Settings → Pages → Source가 'GitHub Actions'인지 확인하고, Actions에서 `pages` 워크플로를 한 번 실행(Run workflow)해 다시 배포합니다.
3. **예전 주소에서 새 주소로 보내기(선택)**: 병원 담당자가 예전 주소를 북마크했을 수 있으므로, 개인 계정의 사용자 사이트 저장소 `ndongwoo/ndongwoo.github.io`(현재 `nam.md`를 서비스하는 저장소)에 아래 파일을 `resiscreen/index.html`로 둡니다. 그러면 `https://nam.md/resiscreen/`과 `https://ndongwoo.github.io/resiscreen/` 모두 새 주소로 넘어갑니다. 그 저장소의 Pages가 켜져 있어야 합니다.

   ```html
   <!doctype html>
   <html lang="ko"><head><meta charset="utf-8">
   <title>주소가 바뀌었습니다</title>
   <meta http-equiv="refresh" content="0; url=https://<조직>.github.io/resiscreen/">
   <link rel="canonical" href="https://<조직>.github.io/resiscreen/">
   </head><body>
   <p>수련실태조사서 사전 점검 도구 주소가 바뀌었습니다: <a href="https://<조직>.github.io/resiscreen/">https://&lt;조직&gt;.github.io/resiscreen/</a></p>
   </body></html>
   ```

   - 브라우저 저장소(IndexedDB)는 주소(출처)별로 따로이므로, 새 주소에서는 SCIE 목록·서지 캐시·기억한 연락처가 비어 있습니다. 병원 담당자에게 SCIE 목록을 다시 불러오라고 안내합니다.
4. README·안내 문서의 주소를 새 주소로 고칩니다. 학회 공용 연락처(`biblio.mailto`, `biblio.pubmed_email`)는 그대로 둡니다.

## 테스트 파일

- `tests/fixtures/synthetic/`: 개인정보가 없는 합성 샘플(공개). `npm run make:synthetic`으로 다시 만듭니다.
- `tests/fixtures/private/`: 익명화 병원 파일. **절대 커밋하지 않습니다**(`.gitignore`). 이 파일이 없으면 관련 테스트는 건너뜁니다.
