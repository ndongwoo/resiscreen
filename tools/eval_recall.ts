/**
 * 재현율 평가: 평가 전 파일의 점검 결과가 평가 후 파일에서 실제로 수정된 셀을 얼마나 덮는지.
 *   node dist-node/tools/eval_recall.js [--md 출력.md]
 * tests/fixtures/private/ 의 B~E 쌍만 쓴다. F 쌍은 평가 전·후 관계를 확인하지 못해 제외(M1 보고서 5절).
 *
 * 분모(입력 셀 수정)에서 빼는 것:
 *  - 심사자 기록 칸: '전체' GP·GQ열(9행 이후), '논문' W열(심사위원 심사의견)
 *  - 연쇄 변화: 전·후 모두 수식인 셀의 값만 바뀐 경우(다른 칸 수정의 결과)
 *  - 빈 행 수식 재입력: '논문'에서 제목(B열)이 없는 행의 수식 복원
 * 결과에는 셀 값(이름 등)을 넣지 않는다. 셀 주소와 분류만 쓴다.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadWorkbook, type Cell, type Workbook } from '../src/engine/xlsx/workbook.ts';
import { checkWorkbook, type Finding } from '../src/engine/index.ts';
import type { FormFormulas, RuleSet } from '../src/engine/rules.ts';
import { expandAll, parseCoord } from '../src/engine/xlsx/refs.ts';
import { BiblioClient } from '../src/engine/biblio/client.ts';
import { BiblioCache } from '../src/engine/biblio/cache.ts';
import type { BiblioSettings } from '../src/engine/biblio/types.ts';
import type { FetchLike } from '../src/engine/biblio/throttle.ts';
import { applyAliases, type JournalLists } from '../src/engine/journals.ts';
import { FileCache } from '../src/cli/filecache.ts';

const root = process.cwd();
const dir = join(root, 'tests/fixtures/private');
const rules = JSON.parse(readFileSync(join(root, 'rules/2026.json'), 'utf8')) as RuleSet;
const formulas = JSON.parse(readFileSync(join(root, 'data/forms/2026_formulas.json'), 'utf8')) as FormFormulas;
// --cache <파일>을 주면 외부 서지 조회(캐시 우선)까지 포함해 평가한다
const cacheIdx = process.argv.indexOf('--cache');
const fileCache = cacheIdx > 0 && process.argv[cacheIdx + 1] ? new FileCache(process.argv[cacheIdx + 1]!) : null;
const settings = rules.biblio as unknown as BiblioSettings;
const biblio = fileCache ? new BiblioClient(fetch as unknown as FetchLike, settings, new BiblioCache(fileCache, settings.cache_ttl_days), rules.reference.paper_year) : null;
const journals: JournalLists = {
  kci: applyAliases(JSON.parse(readFileSync(join(root, 'data/journals/kci.json'), 'utf8')), JSON.parse(readFileSync(join(root, 'data/journals/kci_aliases.json'), 'utf8')).aliases),
  related: JSON.parse(readFileSync(join(root, 'data/journals/kci_related.json'), 'utf8')),
};
const PAIRS = ['B', 'C', 'D', 'E'].map((h) => ({
  hospital: h,
  before: join(dir, `${h}병원_2026_수련실태조사_익명화_평가전.xlsx`),
  after: join(dir, `${h}병원_2026_수련실태조사_익명화.xlsx`),
}));

type Kind = 'correction' | 'reviewer_note' | 'cascade' | 'empty_row_formula';

interface Change {
  sheet: string;
  cell: string;
  kind: Kind;
  change: string;
}

const same = (a?: Cell, b?: Cell) => (a?.value ?? null) === (b?.value ?? null) && (a?.formula ?? null) === (b?.formula ?? null);

function classify(sheet: string, ref: string, a: Cell | undefined, b: Cell | undefined, after: Workbook): Kind {
  const { col, row } = parseCoord(ref);
  if (sheet === '전체' && row >= 9 && (col === 198 || col === 199)) return 'reviewer_note'; // GP, GQ
  if (sheet === '논문' && col === 23) return 'reviewer_note'; // W
  if (sheet === '논문' && row >= 4) {
    const title = after.sheetByName.get('논문')?.cells.get(`B${row}`);
    if (!title || title.value === null || String(title.value).trim() === '') return 'empty_row_formula';
  }
  if (a?.formula !== undefined && b?.formula !== undefined && a.formula === b.formula) return 'cascade';
  return 'correction';
}

function describe(a: Cell | undefined, b: Cell | undefined): string {
  const has = (c?: Cell) => c && c.value !== null && String(c.value).trim() !== '';
  const fa = a?.formula !== undefined;
  const fb = b?.formula !== undefined;
  if (!fa && fb) return '수식 복원';
  if (fa && !fb) return '수식→값';
  if (!has(a) && has(b)) return '빈칸→입력';
  if (has(a) && !has(b)) return '입력→삭제';
  return '값 변경';
}

function diff(before: Workbook, after: Workbook): Change[] {
  const out: Change[] = [];
  for (const s of after.sheets) {
    const bs = before.sheetByName.get(s.name);
    const refs = new Set([...s.cells.keys(), ...(bs?.cells.keys() ?? [])]);
    for (const ref of refs) {
      const a = bs?.cells.get(ref);
      const b = s.cells.get(ref);
      if (same(a, b)) continue;
      out.push({ sheet: s.name, cell: ref, kind: classify(s.name, ref, a, b, after), change: describe(a, b) });
    }
  }
  return out;
}

function exceptionCells(): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of rules.rules)
    for (const e of r.exceptions ?? []) for (const c of expandAll(e.cells)) m.set(`전체!${c}`, `${r.id} 예외(${e.basis_kind})`);
  for (const r of rules.rules) if (!r.enabled && r.target['sheet'] === '전체') for (const c of [...expandAll(r.target['ranges'] ?? []), ...(r.target['cells'] ?? [])]) m.set(`전체!${c}`, `${r.id} 비활성`);
  return m;
}

/** 수정 셀을 덮는 결과: 같은 셀(직접), 결과 detail이 가리키는 셀(연결), 같은 시트·같은 행(행) */
function coverage(ch: Change, findings: Finding[]): { how: string; rules: string[] } {
  const direct = findings.filter((f) => f.sheet === ch.sheet && f.cell === ch.cell);
  if (direct.length) return { how: '직접', rules: [...new Set(direct.map((f) => f.ruleId))] };
  const linked = findings.filter((f) => {
    const d = f.detail ?? {};
    return (
      (d['sheet'] === ch.sheet && d['sheet_cell'] === ch.cell) ||
      (d['expected_cell'] === ch.cell && f.sheet === ch.sheet) ||
      d['linked'] === `${ch.sheet}!${ch.cell}`
    );
  });
  if (linked.length) return { how: '연결', rules: [...new Set(linked.map((f) => f.ruleId))] };
  const row = parseCoord(ch.cell).row;
  const sameRow = findings.filter((f) => f.sheet === ch.sheet && (f.row === row || (f.cell && parseCoord(f.cell.split(':')[0]!).row === row && ch.sheet !== '전체')));
  if (sameRow.length) return { how: '같은 행', rules: [...new Set(sameRow.map((f) => f.ruleId))] };
  return { how: '못 덮음', rules: [] };
}

const lines: string[] = [];
const log = (s = '') => {
  lines.push(s);
  console.log(s);
};

const exc = exceptionCells();
log('# 재현율 평가 (B~E 평가 전·후 쌍)');
log('');
log(biblio ? '외부 서지 조회 포함(캐시 우선). SCIE 목록은 불러오지 않음.' : '외부 서지 조회 없이 평가(KCI·유관학회지 목록은 사용).');
log('');
log('F 쌍은 평가전 파일이 실제 제출본으로 확인되지 않아 제외(M1 보고서 5절).');
log('');
log('> **주의: 표본 내 평가입니다.** B-2-3-KIND·B-2-3-DUP 규칙은 이 표의 B·C병원 수정 사례를 보고 만든 규칙이라, 아래 재현율은 그 사례를 다시 맞힌 것에 가깝고 일반화 성능을 뜻하지 않습니다. 일반화 성능은 추가 병원 자료(약 20개 병원)를 받아 규칙을 고정한 상태로 다시 재겠습니다.');
log('');
let total = 0;
let covered = 0;
const rows: string[] = [];
const kindCount: Record<string, Record<Kind, number>> = {};
for (const p of PAIRS) {
  if (!existsSync(p.before) || !existsSync(p.after)) {
    log(`- ${p.hospital}: 파일 없음, 건너뜀`);
    continue;
  }
  const bBytes = new Uint8Array(readFileSync(p.before));
  const [before, after] = await Promise.all([loadWorkbook(bBytes), loadWorkbook(new Uint8Array(readFileSync(p.after)))]);
  const report = await checkWorkbook({ bytes: bBytes, fileName: 'before.xlsx', rules, formulas, biblio, journals });
  fileCache?.flush();
  const changes = diff(before, after);
  kindCount[p.hospital] = { correction: 0, reviewer_note: 0, cascade: 0, empty_row_formula: 0 };
  for (const ch of changes) kindCount[p.hospital]![ch.kind]++;
  for (const ch of changes.filter((c) => c.kind === 'correction')) {
    total++;
    const cov = coverage(ch, report.findings);
    if (cov.how !== '못 덮음') covered++;
    const ex = exc.get(`${ch.sheet}!${ch.cell}`) ?? '';
    rows.push(`| ${p.hospital} | ${ch.sheet} | ${ch.cell} | ${ch.change} | ${cov.how} | ${cov.rules.join(', ') || '-'} | ${ex || '-'} |`);
  }
}
log('## 바뀐 셀 분류');
log('');
log('| 병원 | 입력 셀 수정(분모) | 심사자 기록 | 연쇄 변화 | 빈 행 수식 재입력 |');
log('|---|---|---|---|---|');
for (const [h, k] of Object.entries(kindCount)) log(`| ${h} | ${k.correction} | ${k.reviewer_note} | ${k.cascade} | ${k.empty_row_formula} |`);
log('');
log('## 수정 셀별 결과');
log('');
log('| 병원 | 시트 | 셀 | 수정 종류 | 덮음 | 규칙 | 예외 때문에 놓침 |');
log('|---|---|---|---|---|---|---|');
rows.forEach((r) => log(r));
log('');
log(`재현율(직접·연결·같은 행 포함): ${covered}/${total}${total ? ` = ${((covered / total) * 100).toFixed(0)}%` : ''}`);

const mdIdx = process.argv.indexOf('--md');
if (mdIdx > 0 && process.argv[mdIdx + 1]) writeFileSync(process.argv[mdIdx + 1]!, lines.join('\n') + '\n');
