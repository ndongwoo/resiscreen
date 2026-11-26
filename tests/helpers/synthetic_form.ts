/**
 * 2026 양식 구조를 흉내 낸 합성 통합문서(개인정보 없음).
 * 셀 주소는 rules/2026.json에서 읽어 채운다. 실제 병원 파일의 값은 하나도 쓰지 않는다.
 */
import type { BookSpec, CellSpec, SheetSpec } from './build_xlsx.ts';
import type { FormFormulas, RuleSet } from '../../src/engine/rules.ts';
import { expandAll, parseSheetRef } from '../../src/engine/xlsx/refs.ts';

export interface SyntheticOptions {
  /** 시트별 셀 덮어쓰기(null이면 삭제) */
  patch?: Record<string, Record<string, CellSpec | undefined>>;
  surgeryRows?: number;
  papers?: number;
}

const FAKE_NAMES = ['가*나', '다*라', '마*바', '사*아', '자*차', '카*타', '파*하'];

export function syntheticForm(rules: RuleSet, formulas: FormFormulas, opts: SyntheticOptions = {}): BookSpec {
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
  // 자동계산 칸: 우선 모두 수식 1로
  for (const c of formulas.sheets['전체']?.cells ?? []) whole[c] = { f: '1', v: 1 };
  // 선택형(7행)·직접입력(6행)
  for (const c of expandAll(rule('S-REQ-SEL').target.ranges)) whole[c] = '예';
  for (const c of rule('S-REQ-SEL-COND').target.cells) whole[c] = '예';
  for (const c of rule('S-REQ-SEL-COND2').target.cells) whole[c] = '100%';
  for (const c of expandAll(rule('S-REQ-DIRECT').target.ranges)) whole[c] = 1;

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
