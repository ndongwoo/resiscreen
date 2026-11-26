/**
 * docs/ITEM_COVERAGE.md 생성: 2026 심사 대상 190개 항목마다 어떤 점검이 걸려 있는지.
 *   npm run gen:docs
 * 입력: rules/2026.json, data/forms/2026_formulas.json, data/forms/2026_items.json(항목 목록), 2026_layout.json(머리글)
 * 같은 열에 같은 점검이 여러 행(예: 6행·8행 수식)으로 걸리면 한 번만 적고 행을 묶는다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FormFormulas, Rule, RuleSet } from '../src/engine/rules.ts';
import { expandAll, parseCoord } from '../src/engine/xlsx/refs.ts';
import { confusablePairs } from '../src/engine/columns.ts';
import { layoutIndex, resolveForLayout } from '../tests/helpers/synthetic_form.ts';

const root = process.cwd();
const raw = JSON.parse(readFileSync(join(root, 'rules/2026.json'), 'utf8')) as RuleSet;
const rules = resolveForLayout(raw);
const formulas = resolveForLayout(JSON.parse(readFileSync(join(root, 'data/forms/2026_formulas.json'), 'utf8')) as FormFormulas);
const { items } = JSON.parse(readFileSync(join(root, 'data/forms/2026_items.json'), 'utf8')) as {
  items: { no: string; col: string; code: string; sub: string; kind: string }[];
};

/** 열 → (점검 문구 → 행 집합). 같은 점검이 여러 행에 걸려도 한 줄로 */
const cov = new Map<string, Map<string, Set<number>>>();
function add(cell: string, text: string): void {
  const { col, row } = parseCoord(cell);
  const letters = cell.replace(/\d+$/, '');
  void col;
  const m = cov.get(letters) ?? new Map<string, Set<number>>();
  const rows = m.get(text) ?? new Set<number>();
  rows.add(row);
  m.set(text, rows);
  cov.set(letters, m);
}
const local = (q: string) => q.replace(/^전체!/, '');
const byId = new Map(rules.rules.map((r) => [r.id, r]));
const rule = (id: string): Rule => {
  const r = byId.get(id);
  if (!r) throw new Error(`규칙 없음: ${id}`);
  return r;
};
/* eslint-disable @typescript-eslint/no-explicit-any */
for (const x of rules.rules) {
  const t = x.target as any;
  // 꺼 둔 규칙은 실행하지 않으므로 결과가 없다(빈칸이어도 INFO조차 내지 않음)
  const tag = (s: string) => (x.enabled ? s : '검사 안 함(규칙 비활성, 결과 없음)');
  if (t.sheet === '전체' && x.type === 'required') {
    for (const c of expandAll(t.ranges ?? [])) add(c, `${tag(`빈칸 ${x.level}${t.when ? ' (조건부)' : ''}`)} [${x.id}]`);
    for (const c of t.cells ?? [])
      add(c, `${tag(`빈칸 ${x.level}${t.when ? ` (조건부: ${t.when.cell} ${t.when.op} ${t.when.value})` : ''}`)} [${x.id}]`);
  }
  for (const e of (x as any).exceptions ?? []) for (const c of expandAll(e.cells)) add(c, `예외(${e.basis_kind})${e.moved_to ? ` → ${e.moved_to}` : ''} [${x.id}]`);
}
const direct = rule('S-REQ-DIRECT') as any;
const exc = new Set(expandAll((direct.exceptions ?? []).flatMap((e: any) => e.cells)));
for (const c of expandAll(direct.target.ranges)) {
  if (exc.has(c)) continue;
  add(c, '형식: 숫자 ERROR/WARNING(수식 참조 여부에 따라) [S-DTYPE-NUM]');
  add(c, '7행에 숫자 입력 여부 ERROR [S-WRONGROW-01]');
}
for (const c of formulas.sheets['전체']?.cells ?? []) add(c, '자동계산 수식 훼손 WARNING [S-FORMULA-01]');
const sum = rule('S-SUM-01') as any;
for (const p of sum.target.pairs) if (p.summary.startsWith('전체!')) add(local(p.summary), `증빙 합계 대조 ${sum.level}(${p.sheet_total}) [S-SUM-01]`);
for (const s of rules.surgery_sheets) {
  if (!s.summary) continue;
  add(local(s.summary), `증빙 합계 대조 ${sum.level}('${s.sheet}'!${s.total}) [S-SUM-01]`);
  add(local(s.summary), '행 수 대조 WARNING [A-6-ROWS-01]');
}
for (const c of (rule('A-6-MIN-01').target as any).checks) add(local(c.cell), `과락 기준 ${c.min}건 WARNING [A-6-MIN-01]`);
const a22 = rule('A-2-2-RECALC') as any;
add(local(a22.target.selection), `재계산: n ≤ N-3 ${a22.level} [A-2-2-RECALC]`);
add(local(a22.target.supervisors), `A-2-2 재계산의 N [A-2-2-RECALC]`);
/** 비율 재계산 규칙: 결과 칸, 분자·분모 설명 */
const RATIO_TEXT: Record<string, string> = {
  'B-5-RECALC': '정원 기준 비율',
  'C-4-RECALC': '논문 점수 ÷ 전문의 수',
  'B-4-3-RECALC': '논문 점수 ÷ 전공의 총 정원',
  'B-2-3-RECALC': '참석 횟수 ÷ 10/1 근무 전공의 수',
};
for (const [id, text] of Object.entries(RATIO_TEXT)) {
  const r = rule(id) as any;
  for (const c of r.target.checks) add(local(c.cell), `재계산: ${text} ${r.level} [${id}]`);
}
const b5 = rule('B-5-RECALC') as any;
add(local(b5.target.checks[0].den), `B-5 분모 = A-3-2 정원 합계 ${b5.level} [B-5-RECALC]`);
for (const c of (rule('S-DATE-HDR').target as any).checks) add(c.cell, `머리글 기준일(${c.ref}) WARNING [S-DATE-HDR]`);
// 세부 시트 쪽 점검(전체 시트 칸에는 걸리지 않음)
const EXTRA: Record<string, string> = {
  P: 'B-5 분모·A-2-2 n(A-3-2 시트) 재계산에 사용',
  R: '기간 검사 불가 INFO [P-PERIOD-LIMIT] (A-3-3 시트)',
  CT: '기간 검사 불가 INFO [P-PERIOD-LIMIT] (A-10-3-d 시트)',
  DS: 'B-2-3 시트 행사 점검 WARNING [B-2-3-KIND, B-2-3-DUP, B-2-3-ROWS, P-PERIOD-MARFEB]',
  DZ: '논문 시트 검사(P-*) 전체',
  BQ: 'A-6 시트 확인서 첨부 WARNING [A-6-EVID-01]',
  BR: 'A-6 시트 확인서 첨부 WARNING [A-6-EVID-01]',
};
for (const [c, t] of Object.entries(EXTRA)) add(`${c}6`, t);

/** 한 열의 점검 문구(같은 문구는 한 번, 여러 행이면 행 표시) */
function checksOf(col: string): string[] {
  const m = cov.get(col);
  if (!m) return [];
  const rowsAll = [...m.values()].flatMap((s) => [...s]);
  const multi = new Set(rowsAll).size > 1;
  return [...m.entries()].map(([text, rows]) => {
    const rs = [...rows].sort((a, b) => a - b);
    // 열 안에 다른 행 점검도 있을 때만 행을 밝힌다
    return multi && rs.length > 1 ? `${text} (${rs.join('·')}행)` : text;
  });
}

function classify(cs: string[]): string {
  if (!cs.length) return '검사 없음';
  if (cs.every((x) => x.includes('비활성'))) return '검사 안 함(비활성)';
  const k: string[] = [];
  if (cs.some((x) => x.startsWith('예외'))) k.push('예외');
  if (cs.some((x) => x.includes('빈칸') && !x.includes('비활성'))) k.push('빈칸');
  if (cs.some((x) => x.startsWith('형식') || x.includes('7행') || x.includes('수식 훼손') || x.includes('기준일'))) k.push('형식');
  if (cs.some((x) => x.includes('재계산') || x.includes('대조') || x.includes('분모') || x.includes('과락'))) k.push('재계산·대조');
  return k.join('·') || '기타';
}

const esc = (s: string) => s.replace(/\|/g, '／').replace(/\n/g, ' ');
const rows = items.map((it) => {
  const checks = checksOf(it.col);
  return { ...it, checks, cls: classify(checks) };
});
const gaps = rows.filter(
  (r) => (r.kind.startsWith('선택') || r.kind.startsWith('직접')) && !r.checks.some((x) => (x.includes('빈칸') && !x.includes('비활성')) || x.includes('7행')),
);

const MEAN: Record<string, string> = {
  '빈칸·형식': '입력 빈칸과 형식(수식 훼손 등)을 검사',
  '형식·재계산·대조': '자동계산 칸: 수식 훼손과 재계산·증빙 합계 대조',
  예외: '서류 단계 검사 제외(실사·평가위원 칸 등, 근거는 규칙 exceptions)',
  '예외·형식': '제외 칸이지만 수식 훼손은 검사',
  형식: '형식(수식 훼손·머리글 기준일)만',
  '빈칸·형식·재계산·대조': '빈칸·형식에 재계산까지',
  기타: '세부 시트 쪽 안내(INFO)만',
  '검사 없음': '자동 점검 없음(세부 시트 내용은 사람 확인)',
  '예외·빈칸·형식': '일부 조건에서 빈칸 검사',
  '예외·빈칸': '조건부 빈칸 검사',
};
const count = new Map<string, number>();
for (const r of rows) count.set(r.cls, (count.get(r.cls) ?? 0) + 1);

const L: string[] = [];
L.push('# 2026 심사 대상 190개 항목별 점검 범위', '');
L.push(
  `> 기준: 2026 심사 대상 항목 확인표(학회 수련위원 확인, 190개 모두 '맞음'). 셀 위치는 2026 양식 기준이며, 규칙은 열 문자 대신 항목 코드·머리글로 열을 찾는다. 병원 입력값은 담지 않았다. 규칙 ${raw.rules_version}. \`npm run gen:docs\`로 다시 만든다(tools/item_coverage.ts).`,
  '',
);
L.push('## 요약', '', '| 분류 | 항목 수 | 뜻 |', '|---|---|---|');
for (const [k, n] of [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) L.push(`| ${k} | ${n} | ${MEAN[k] ?? ''} |`);
L.push('', '## 입력 방식이 선택·직접 입력인데 빈칸 검사가 없는 항목', '', '| 열 | 항목 | 세부 | 이유 |', '|---|---|---|---|');
for (const g of gaps) {
  const reason = g.checks.some((x) => x.includes('B-6-EPORTFOLIO'))
    ? 'B-6 e-Portfolio: 양식상 심사 항목이나 2026 가이드라인상 해당 없음(가이드라인 4.6). 2026 규칙에서 B-6-EPORTFOLIO를 꺼 두어 검사하지 않음(빈칸이어도 결과 없음)'
    : '확인 필요';
  L.push(`| ${g.col} | ${g.code} | ${esc(g.sub)} | ${reason} |`);
}
L.push('', '## 세부 시트 입력 항목 중 자동 점검이 없는 것', '');
L.push('- A-11-1(CU, 전공의 휴가현황)과 B-4-1(DY, 전공의 개인별 논문 지상발표 실적): 세부 시트 내용은 사람이 확인한다(자동 점검 없음).');
L.push('- A-3-3(R)·A-10-3 d(CT): 날짜 칸이 없어 3~2월 기간 검사를 못 한다는 INFO만 낸다.');
L.push('', '## 항목별 표', '', '| 번호 | 열 | 항목 | 세부 | 입력 방식 | 분류 | 점검 내용(규칙) |', '|---|---|---|---|---|---|---|');
for (const r of rows) L.push(`| ${r.no} | ${r.col} | ${r.code} | ${esc(r.sub.slice(0, 40))} | ${esc(r.kind)} | ${r.cls} | ${esc(r.checks.join('; ') || '-')} |`);

// 혼동 주의 머리글
const pairs = confusablePairs(layoutIndex());
const one = (s: string) => s.replace(/\s+/g, ' ').trim();
L.push('', '## 혼동 주의 머리글', '');
L.push("2026 양식 '전체' 시트에서 같은 항목 코드 안의 머리글끼리 유사도(공백·기호·원문자를 지운 뒤 비교)가 0.8 이상인 쌍이다. 연차 숫자 한 글자만 다르다.", '');
L.push('| 코드 | 열 | 머리글 | 열 | 머리글 | 유사도 |', '|---|---|---|---|---|---|');
for (const p of pairs) L.push(`| ${p.code} | ${p.a} | ${esc(one(p.aLabel))} | ${p.b} | ${esc(one(p.bLabel))} | ${p.score.toFixed(3)} |`);
L.push('');
L.push('- 규칙의 머리글은 양식 원문과 정확히 같게 적었으므로 원본 양식에서는 늘 정확 일치로 찾는다.');
L.push(
  "- 병원이 이 머리글을 고치면 유사 일치로 넘어가는데, 짝이 되는 열과 점수 차이가 0.1 미만이면 열을 고르지 않는다. 'ERROR: 양식에서 항목 X의 열을 하나로 정할 수 없습니다(후보: …)'(`S-COL-02`)를 내고 그 점검만 건너뛴다. 다른 열로 잘못 가지 않는다(`tests/unit/columns.test.ts`가 쌍마다 숫자를 지우거나 '(명)'을 붙여 확인).",
);
L.push('- 이 목록은 테스트가 2026 양식 머리글에서 다시 계산해 대조한다. 새 연도 양식에서는 다시 뽑는다.');

L.push('', '## 심사 대상에서 뺀 열(확인표 제외된_열)', '', '| 열 | 내용 | 처리 |', '|---|---|---|');
for (const [c, t, h] of [
  ['A', '행 이름 칸', '제외 확정'],
  ['FM', 'C-2 이비인후과 관련문항 없음', '제외 확정'],
  ['FN', 'C-3 이비인후과 관련문항 없음', '제외 확정'],
  ['FP', 'C-5 이비인후과 관련문항 없음', '제외 확정'],
  ['FR', 'D-1 a 병합 서식 오류(FQ와 같은 항목)', '제외 확정(서식 오류 의견)'],
  ['GB·GC', 'E-2 b 이러닝 수료 규정 충족률', '2026 제외 유지(규칙 E-2-B 비활성). 2027 적용 방식 미정'],
  ['GP·GQ', '심사위원 이름·의견 칸', '제외 확정'],
])
  L.push(`| ${c} | ${t} | ${h} |`);

writeFileSync(join(root, 'docs/ITEM_COVERAGE.md'), L.join('\n') + '\n');
console.log(`ITEM_COVERAGE.md: 항목 ${rows.length}개, 빈칸 검사 없는 선택·직접 입력 ${gaps.length}개, 혼동 주의 ${pairs.length}쌍`);
