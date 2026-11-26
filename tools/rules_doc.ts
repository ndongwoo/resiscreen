/**
 * docs/RULES.md 생성: 규칙 ID 목록과 '이전 ID → 새 ID' 매핑.
 *   npm run gen:docs (ITEM_COVERAGE.md와 함께)
 * 규칙 파일에 있는 규칙과, 코드가 직접 내는 결과 ID(양식·파일·열 찾기·서지)를 함께 싣는다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RuleSet } from '../src/engine/rules.ts';

const root = process.cwd();
const rules = JSON.parse(readFileSync(join(root, 'rules/2026.json'), 'utf8')) as RuleSet;

/** 이름을 바꾼 규칙 ID. 지운 ID는 다시 쓰지 않는다 */
export const RENAMED: { from: string; to: string; since: string; reason: string }[] = [
  {
    from: 'A-6-SUM-01',
    to: 'S-SUM-01',
    since: '2026.8.0',
    reason: "A-6 수술 시트뿐 아니라 A-3-2 정원·B-2-3 참석 횟수·논문 점수 합계까지 대조하는 '전체' 시트 공통 점검이라 S-(구조) 계열로 옮김",
  },
];

/** 규칙 파일 밖에서 코드가 직접 내는 결과(S-FORM-01은 규칙 파일에도 있다: 서명 불일치 문구) */
const BUILTIN: [string, string, string][] = [
  ['S-FILE-01', 'ERROR', '파일을 읽지 못함(손상·암호·형식 오류)'],
  ['S-FORM-02', 'ERROR', '두 연도 이상의 양식 서명에 모두 맞아 연도를 판별할 수 없음'],
  ['S-COL-01', 'ERROR', '양식에서 항목의 열을 찾을 수 없음(그 점검만 건너뜀)'],
  ['S-COL-02', 'ERROR', '비슷한 머리글이 여럿이라 항목의 열을 하나로 정할 수 없음(그 점검만 건너뜀)'],
  ['S-COL-03', 'INFO', '항목을 비슷한 머리글로 찾음(규칙 문구 / 양식 문구)'],
];

const esc = (s: string) => s.replace(/\|/g, '／').replace(/\n/g, ' ');
const L: string[] = [];
L.push('# 규칙 ID 목록', '');
L.push(`> ${rules.form.year} 규칙 ${rules.rules_version} 기준. \`npm run gen:docs\`로 다시 만든다(tools/rules_doc.ts). 결과 화면·결과 엑셀·CLI JSON의 '규칙' 칸에 이 ID가 나온다.`, '');
L.push('## 이전 ID → 새 ID', '');
L.push('이전 결과 파일(엑셀·JSON)과 비교할 때 이 표로 맞춰 본다. 바뀐 ID는 다시 쓰지 않는다.', '');
L.push('| 이전 ID | 새 ID | 바뀐 규칙 버전 | 이유 |', '|---|---|---|---|');
for (const r of RENAMED) L.push(`| ${r.from} | ${r.to} | ${r.since} | ${esc(r.reason)} |`);
L.push('', '## 규칙 파일(rules/' + rules.form.year + '.json)', '');
L.push('| ID | 종류 | 단계 | 사용 | 내용 |', '|---|---|---|---|---|');
for (const r of rules.rules) L.push(`| ${r.id} | ${r.type} | ${r.level} | ${r.enabled ? '켬' : '끔'} | ${esc(r.message)} |`);
L.push('', '## 재계산 규칙의 단계', '');
L.push('양식 수식대로 다시 계산했는데 값이 다르면(수식 훼손·값 덮어쓰기) ERROR, 해석 차이가 있을 수 있으면 WARNING.', '');
L.push('| ID | 단계 | 내용 |', '|---|---|---|');
for (const r of rules.rules.filter((x) => x.type === 'recalc')) L.push(`| ${r.id} | ${r.level} | ${esc(r.message)} |`);
L.push('', '## 코드가 직접 내는 결과', '', '| ID | 단계 | 내용 |', '|---|---|---|');
for (const [id, lv, t] of BUILTIN) L.push(`| ${id} | ${lv} | ${t} |`);
writeFileSync(join(root, 'docs/RULES.md'), L.join('\n') + '\n');
console.log(`RULES.md: 규칙 ${rules.rules.length}개, 코드 ${BUILTIN.length}개, 이름 바꿈 ${RENAMED.length}개`);
