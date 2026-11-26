/**
 * 2026 양식 구조를 흉내 낸 합성 통합문서(개인정보 없음).
 * 셀 주소는 rules/2026.json에서 읽어 채운다. 실제 병원 파일의 값은 하나도 쓰지 않는다.
 */
import type { BookSpec, CellSpec, SheetSpec } from './build_xlsx.ts';
import type { FormFormulas, RuleSet } from '../../src/engine/rules.ts';
import { expandAll, parseCoord, parseSheetRef } from '../../src/engine/xlsx/refs.ts';
import { buildItemIndex, resolveDeep } from '../../src/engine/columns.ts';
import type { Cell, Sheet } from '../../src/engine/xlsx/workbook.ts';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 2026 양식 '전체' 1~5행 머리글(양식 원문) */
export function layout2026(): Record<string, string> {
  // 소스(tests/helpers)와 컴파일 결과(dist-node/tests/helpers) 어디서든 저장소 루트의 파일을 찾는다
  const here = dirname(fileURLToPath(import.meta.url));
  const p = [join(here, '../../data/forms/2026_layout.json'), join(here, '../../../data/forms/2026_layout.json')].find((x) => existsSync(x))!;
  return (JSON.parse(readFileSync(p, 'utf8')) as { cells: Record<string, string> }).cells;
}

/** 합성 양식 '전체' 머리글의 항목 색인 */
export function layoutIndex(cells: Record<string, string> = layout2026()) {
  const sheet: Sheet = { name: '전체', index: 0, state: 'visible', cells: new Map(), merged: [], hyperlinks: [], embedded: [], drawingObjects: 0 };
  for (const [ref, v] of Object.entries(cells)) {
    const { row, col } = parseCoord(ref);
    sheet.cells.set(ref, { ref, row, col, value: v, type: 's', numFmt: 'General', isDate: false } as Cell);
  }
  return buildItemIndex(sheet);
}

/** 합성 양식 기준으로 규칙의 {항목 키}를 열 문자로 바꾼다 */
export function resolveForLayout<T>(value: T, cells: Record<string, string> = layout2026()): T {
  const missing = new Set<string>();
  const out = resolveDeep(layoutIndex(cells), value, missing);
  if (missing.size) throw new Error(`합성 양식에서 찾지 못한 항목: ${[...missing].join(', ')}`);
  return out;
}

export interface SyntheticOptions {
  /** 시트별 셀 덮어쓰기(null이면 삭제) */
  patch?: Record<string, Record<string, CellSpec | undefined>>;
  surgeryRows?: number;
  papers?: number;
}

const FAKE_NAMES = ['가*나', '다*라', '마*바', '사*아', '자*차', '카*타', '파*하'];

export function syntheticForm(rawRules: RuleSet, rawFormulas: FormFormulas, opts: SyntheticOptions = {}): BookSpec {
  const layout = layout2026();
  const rules = resolveForLayout(rawRules, layout);
  const formulas = resolveForLayout(rawFormulas, layout);
  const sheets = new Map<string, Record<string, CellSpec>>();
  const sh = (name: string) => {
    if (!sheets.has(name)) sheets.set(name, {});
    return sheets.get(name)!;
  };
  const oles = new Map<string, { row: number; col: number }[]>();
  const rule = (id: string) => rules.rules.find((r) => r.id === id)!;

  // 표지·서명
  sh('표지')['B4'] = '2026년도 수련실태조사 (2025년 1/1일~12/31일 실적)';
  for (const sig of rules.form.signature) {
    if (sig.equals) sh(sig.sheet)[sig.cell] = sig.equals;
    else if (sig.contains && !sh(sig.sheet)[sig.cell]) sh(sig.sheet)[sig.cell] = `(합성) ${sig.contains}`;
  }
  for (const name of rules.form.required_sheets) sh(name);
  sh('A-3-3')['A1'] = 'A-3-3';
  sh('A-10-3-d')['A1'] = 'A-10-3-d';

  const whole = sh('전체');
  // 양식 머리글(1~5행)
  for (const [ref, v] of Object.entries(layout)) whole[ref] = v;
  // 자동계산 칸: 우선 모두 수식 1로
  for (const c of formulas.sheets['전체']?.cells ?? []) whole[c] = { f: '1', v: 1 };
  // 선택형(7행)·직접입력(6행)
  for (const c of expandAll(rule('S-REQ-SEL').target.ranges)) whole[c] = '예';
  for (const c of rule('S-REQ-SEL-COND').target.cells) whole[c] = '예';
  for (const c of rule('S-REQ-SEL-COND2').target.cells) whole[c] = '100%';
  for (const c of expandAll(rule('S-REQ-DIRECT').target.ranges)) whole[c] = 1;
  for (const c of rule('S-GH6').target.cells) whole[c] = 1; // E-3-5 수료자 수

  // 인원: 정원 연차별 1,1,1,1 + 군파견 0 → 합 4, 지도전문의 N=8 → 최댓값(1)·합계(4) 모두 ≤ N-3(5)
  const a32 = sh('A-3-2');
  ['B4', 'B5', 'B6', 'B7'].forEach((c) => (a32[c] = 1));
  a32['B8'] = 0;
  a32['B9'] = { f: 'SUM(B4:B8)', v: 4 };
  ['C4', 'C5', 'C6', 'C7'].forEach((c) => (a32[c] = 1));
  a32['C9'] = { f: 'SUM(C4:C8)', v: 4 };
  whole['H6'] = 9;
  whole['I6'] = 8;
  whole['J7'] = 'N-3 충족';
  whole['Q6'] = { f: "'A-3-2'!B9", v: 4 };
  whole['DT6'] = { f: "'A-3-2'!C9", v: 4 };

  // 외래·퇴원
  const a6 = sh('A-6');
  a6['N4'] = { f: 'SUM(B4:M4)', v: 12000 };
  a6['N10'] = { f: 'SUM(B10:M10)', v: 800 };
  oles.set('A-6', [{ row: 14, col: 3 }]);
  whole['BQ6'] = { f: "'A-6'!N4", v: 12000 };
  whole['BR6'] = { f: "'A-6'!N10", v: 800 };

  // 수술 시트
  const n = opts.surgeryRows ?? 80;
  const totals: Record<string, number> = {};
  for (const s of rules.surgery_sheets) {
    const ws = sh(s.sheet);
    ws['C4'] = s.date_col ? 'PSG 시행일 (O월 O일)' : '수술날짜  (O월 O일)';
    ws['D4'] = '이름 (홍*동)';
    let total = 0;
    for (let i = 0; i < n; i++) {
      const r = 5 + i;
      ws[`C${r}`] = `${(i % 12) + 1}월 ${(i % 27) + 1}일`;
      ws[`D${r}`] = FAKE_NAMES[i % FAKE_NAMES.length]!;
      ws[`E${r}`] = s.sheet.startsWith('k') ? `${(i % 12) + 1}월 28일` : '진단명';
      ws[`F${r}`] = '수술명';
      if (s.side_sum_col) {
        ws[`${s.side_sum_col}${r}`] = 2; // 양측
        total += 2;
      } else total += 1;
    }
    ws[s.total] = String(total); // 실제 양식처럼 문자열 숫자
    totals[s.sheet] = total;
    const [, ref] = [null, parseSheetRef(s.summary).ref];
    whole[ref] = { f: `'${s.sheet}'!${s.total}`, v: total };
  }

  // B-5 비율
  const q = 4;
  whole['EB6'] = { f: 'BR6/Q6', v: 800 / q };
  whole['EC6'] = { f: 'BQ6/Q6', v: 12000 / q };
  const major = ['a 고실', 'b ESS', 'c 두경부악성', 'h 갑상선'].reduce((a, k) => a + (totals[k] ?? 0), 0);
  whole['ED6'] = { f: '(BS6+BT6+BU6+BZ6)/Q6', v: major / q };

  // B-2-3
  const b23 = sh('B-2-3');
  b23['B3'] = '추계학술대회';
  b23['C3'] = '2025.11.08';
  b23['E3'] = '가*나, 다*라';
  b23['F3'] = 2;
  b23['F13'] = { f: 'SUM(F3:F12)', v: 2 };
  whole['DS6'] = 2;

  // 논문
  const p = sh('논문');
  p['B3'] = '논문제목';
  const papers = opts.papers ?? 2;
  let score = 0;
  for (let i = 0; i < papers; i++) {
    const r = 4 + i;
    p[`B${r}`] = `Synthetic study number ${i + 1}`;
    p[`C${r}`] = 'Journal of Synthetic Testing';
    p[`D${r}`] = 'SCI/SCIE';
    for (const k of ['I', 'J', 'N', 'O']) p[`${k}${r}`] = 1;
    p[`Q${r}`] = '2025.03';
    p[`E${r}`] = { f: `IF(D${r}="","",1)`, v: 1 };
    p[`S${r}`] = { f: `IFERROR((J${r}/I${r})*0.5*E${r}+(O${r}/N${r})*0.5*E${r},"")`, v: 1 };
    score += 1;
  }
  oles.set(
    '논문',
    Array.from({ length: papers }, (_, i) => ({ row: 4 + i, col: 20 })),
  );
  p['R2'] = { f: 'SUM(S4:S63)', v: score };
  whole['DZ6'] = { f: '논문!R2', v: score };
  whole['EA6'] = { f: 'DZ6/Q6', v: score / q };
  whole['FO6'] = { f: 'DZ6/H6', v: score / 9 };
  whole['FL6'] = { f: 'IF(FK6=0,"",IF(FK6<2*Q6,3,1))', v: 1 };
  whole['FV6'] = { f: "'A-3-2'!D9", v: 4 };
  whole['CV6'] = 1;

  // 덮어쓰기
  for (const [name, cells] of Object.entries(opts.patch ?? {})) {
    const ws = sh(name);
    for (const [ref, v] of Object.entries(cells)) {
      if (v === undefined) delete ws[ref];
      else ws[ref] = v;
    }
  }

  const specs: SheetSpec[] = [...sheets.entries()].map(([name, cells]) => ({ name, cells, oles: oles.get(name) }));
  return { sheets: specs };
}

/**
 * '전체' 시트에 빈 열을 끼워 넣는다(2027 양식처럼). after 열 뒤에 새 열이 생기고 그 뒤 열은 오른쪽으로 한 칸씩 밀린다.
 * '전체' 안의 수식 참조도 같이 옮긴다. headers는 새 열의 머리글(행 번호 → 문구).
 */
export function insertColumns(spec: BookSpec, inserts: { after: string; headers: Record<number, string> }[]): BookSpec {
  const out = structuredClone(spec);
  const whole = out.sheets.find((s) => s.name === '전체')!;
  // 오른쪽 삽입부터 처리해야 앞쪽 위치가 흔들리지 않는다
  const sorted = [...inserts].sort((a, b) => colIdx(b.after) - colIdx(a.after));
  for (const ins of sorted) {
    const at = colIdx(ins.after);
    const shift = (ref: string) => ref.replace(/^(\$?)([A-Z]{1,3})(\$?)(\d+)$/, (_m, a: string, c: string, b: string, r: string) => `${a}${colIdx(c) > at ? colName(colIdx(c) + 1) : c}${b}${r}`);
    const moved: Record<string, (typeof whole.cells)[string]> = {};
    for (const [ref, v] of Object.entries(whole.cells)) {
      let val = v;
      if (val && typeof val === 'object' && 'f' in val && val.f) val = { ...val, f: val.f.replace(/(?<![A-Za-z!'])(\$?[A-Z]{1,3}\$?\d+)/g, (m) => shift(m)) };
      moved[shift(ref)] = val;
    }
    for (const [row, text] of Object.entries(ins.headers)) moved[`${colName(at + 1)}${row}`] = text;
    whole.cells = moved;
  }
  return out;
}

function colIdx(c: string): number {
  let n = 0;
  for (const ch of c) n = n * 26 + ch.charCodeAt(0) - 64;
  return n;
}
function colName(n: number): string {
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
