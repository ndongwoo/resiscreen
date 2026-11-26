/**
 * (한 번 쓰는 변환 도구) 규칙 파일의 '전체' 시트 열 문자를 항목 키({코드|머리글})로 바꾼다.
 *   node dist-node/tools/convert_columns.js <기준 양식 xlsx> rules/2026.json data/forms/2026_formulas.json [검증용 xlsx...]
 * 기준 양식에서 열마다 가장 짧게 자기 자신으로 되돌아오는 키를 만들고, 변환 뒤 검증용 파일 모두에서
 * 다시 열 문자로 풀어 원래 규칙과 같은지 확인한다(다르면 쓰지 않음).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { loadWorkbook } from '../src/engine/xlsx/workbook.ts';
import { buildItemIndex, resolveDeep, resolveItem, type ItemColumn } from '../src/engine/columns.ts';
import { colToIndex } from '../src/engine/xlsx/refs.ts';

const [basePath, rulesPath, formulasPath, ...verify] = process.argv.slice(2);
if (!basePath || !rulesPath || !formulasPath) {
  console.error('사용법: convert_columns <기준 xlsx> <rules.json> <formulas.json> [검증 xlsx...]');
  process.exit(2);
}

async function indexOf(path: string): Promise<ItemColumn[]> {
  const wb = await loadWorkbook(new Uint8Array(readFileSync(path)));
  return buildItemIndex(wb.sheetByName.get('전체')!);
}

const base = await indexOf(basePath);
const keyOf = new Map<string, string>();
for (const c of base) {
  const same = base.filter((x) => x.code === c.code);
  let key = c.code;
  if (same.length > 1 || same[0]!.col !== c.col) {
    // 머리글 원문 전체를 쓴다(정확 일치로 찾도록. 원본 오타 '둥록자수'도 그대로)
    // 항목의 첫 열이 아니면서 4행에 그 열만의 제목이 있으면(예: E-1 참여율, A-3-2 총정원) 4행을 쓴다
    const first = same[0]!.col === c.col;
    const label = (!first && c.r4 ? c.r4 : c.r5 || c.r4).replace(/\s+/g, ' ').trim();
    key = `${c.code}|${label}`;
  }
  let ok = false;
  try {
    ok = resolveItem(base, key) === c.col;
  } catch {
    ok = false;
  }
  // 머리글이 없어 구분할 수 없는 열(예: 병합 서식 오류인 FR)은 키를 만들지 않는다. 규칙이 쓰면 아래에서 오류
  if (ok) keyOf.set(c.col, key);
}

const toKey = (col: string) => {
  const k = keyOf.get(col);
  if (!k) throw new Error(`기준 양식에 없는 열: ${col}`);
  return `{${k}}`;
};
const conv = (s: string) => s.replace(/\b([A-Z]{1,3})(\d+)\b/g, (_m, col: string, row: string) => `${toKey(col)}${row}`);
const convQualified = (s: string) => s.replace(/전체!([A-Z]{1,3})(\d+)/g, (_m, col: string, row: string) => `전체!${toKey(col)}${row}`);

/* eslint-disable @typescript-eslint/no-explicit-any */
const original = JSON.parse(readFileSync(rulesPath, 'utf8'));
const rules = structuredClone(original);
for (const sig of rules.form.signature) if (sig.sheet === '전체') sig.cell = conv(sig.cell);
for (const s of rules.surgery_sheets) s.summary = convQualified(s.summary);
for (const r of rules.rules as any[]) {
  const t = r.target;
  const onWhole = t.sheet === '전체';
  if (onWhole) {
    if (t.ranges) t.ranges = t.ranges.map(conv);
    if (t.cells) t.cells = t.cells.map(conv);
    if (t.when?.cell) t.when.cell = conv(t.when.cell);
  }
  for (const e of r.exceptions ?? []) e.cells = e.cells.map(conv);
  r.target = JSON.parse(convQualified(JSON.stringify(r.target)));
}
const formulasOriginal = JSON.parse(readFileSync(formulasPath, 'utf8'));
const formulas = structuredClone(formulasOriginal);
formulas.sheets['전체'].cells = formulas.sheets['전체'].cells.map(conv);

// 검증: 모든 파일에서 다시 풀면 원래와 같아야 한다
const stripText = (o: any) => JSON.parse(JSON.stringify(o));
for (const p of [basePath, ...verify]) {
  const ix = await indexOf(p);
  const missing = new Set<string>();
  const back = resolveDeep(ix, stripText(rules), missing);
  const fBack = resolveDeep(ix, stripText(formulas), missing);
  if (missing.size) throw new Error(`${p}: 찾지 못한 키 ${[...missing].join(', ')}`);
  if (JSON.stringify(back) !== JSON.stringify(original)) throw new Error(`${p}: 규칙이 원래와 다르게 풀림`);
  if (JSON.stringify(fBack) !== JSON.stringify(formulasOriginal)) throw new Error(`${p}: 수식 위치가 원래와 다르게 풀림`);
}
writeFileSync(rulesPath, JSON.stringify(rules, null, 2) + '\n');
writeFileSync(formulasPath, JSON.stringify(formulas, null, 1) + '\n');
const used = new Set((JSON.stringify(rules) + JSON.stringify(formulas)).match(/\{[^{}"]+\}/g) ?? []);
console.log(`변환 완료: 키 ${used.size}종, 검증 파일 ${verify.length + 1}개에서 원래 열과 일치`);
console.log([...keyOf.entries()].map(([c, k]) => `${c}=${k}`).filter((x) => /\|/.test(x)).slice(0, 5).join('\n'));
void colToIndex;
