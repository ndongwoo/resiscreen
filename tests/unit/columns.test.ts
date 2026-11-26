/** 열을 항목 코드·머리글로 찾기: 2027처럼 열이 끼어들어도 같은 결과, 못 찾으면 ERROR */
import { describe, expect, it } from 'vitest';
import { checkWorkbook } from '../../src/engine/index.ts';
import type { Finding } from '../../src/engine/report.ts';
import { buildXlsx, type CellSpec } from '../helpers/build_xlsx.ts';
import { insertColumns, layout2026, resolveForLayout, syntheticForm } from '../helpers/synthetic_form.ts';
import { loadFormulas, loadRules } from '../helpers/load.ts';
import { colToIndex, indexToCol } from '../../src/engine/xlsx/refs.ts';

const rules = loadRules();
const formulas = loadFormulas();

// 2027 신규 열 두 개: CD(A-6-4 l) 뒤 '기관절개술 건수', GC(E-2 b) 뒤 'EPA/핵심역량평가 이수율'
const INSERTS = [
  { after: 'CD', headers: { 5: 'm. 기관절개술 건수' } as Record<number, string> },
  { after: 'GC', headers: { 4: 'EPA/핵심역량평가 이수율' } as Record<number, string> },
];
/** 원래 열 → 끼워 넣은 뒤 열 */
const moved = (col: string) => {
  const i = colToIndex(col);
  return indexToCol(i + (i > colToIndex('CD') ? 1 : 0) + (i > colToIndex('GC') ? 1 : 0));
};
const shiftCell = (f: Finding) => (f.sheet === '전체' && f.cell ? f.cell.replace(/^([A-Z]+)(\d+)$/, (_m, c: string, r: string) => `${moved(c)}${r}`) : f.cell);
const key = (f: Finding, cell = f.cell) => `${f.level}|${f.ruleId}|${f.sheet}|${cell ?? ''}|${f.row ?? ''}|${f.itemCode ?? ''}`;

async function both(patch: Record<string, CellSpec | undefined>) {
  const spec = syntheticForm(rules, formulas, { patch: { 전체: patch } });
  const a = await checkWorkbook({ bytes: await buildXlsx(spec), fileName: 'a.xlsx', rules, formulas });
  const b = await checkWorkbook({ bytes: await buildXlsx(insertColumns(spec, INSERTS)), fileName: 'b.xlsx', rules, formulas });
  return { a, b };
}

describe('열이 끼어든 양식(2027 모양)', () => {
  it('합성 완성본: 결과가 같다', async () => {
    const { a, b } = await both({});
    expect(b.supported).toBe(true);
    expect(b.findings.map((f) => key(f))).toEqual(a.findings.map((f) => key(f, shiftCell(f))));
  });
  it('오류가 있는 합성본: 같은 오류가 옮겨진 열에서 나온다', async () => {
    // 선택 빈칸(K, CE 뒤쪽), 직접입력 빈칸, 숫자 글자, 7행 숫자, 합계 불일치, 수식 덮어쓰기, B-5 계산, A-2-2
    const p = { K7: undefined, CF7: undefined, DS6: 5, FK6: '9년 3개월', H6: undefined, H7: 6, EA6: 0.5, I6: 3, FY6: undefined, GH6: undefined };
    const { a, b } = await both(p);
    expect(a.summary.ERROR).toBeGreaterThan(3);
    expect(b.findings.map((f) => key(f))).toEqual(a.findings.map((f) => key(f, shiftCell(f))));
    // 옮겨진 열에서 실제로 잡혔는지(CF → CG, FY → GA? 아님: FY는 GC 앞이라 한 칸만)
    expect(b.findings.some((f) => f.ruleId === 'S-REQ-SEL' && f.cell === 'CG7')).toBe(true);
    expect(b.findings.some((f) => f.ruleId === 'S-REQ-DIRECT' && f.cell === 'FZ6')).toBe(true);
  });
});

describe('열을 찾지 못하면', () => {
  it("항목 머리글이 없어지면 '양식에서 항목 X를 찾을 수 없습니다' ERROR, 다른 점검은 계속", async () => {
    const cells = layout2026();
    const target = resolveForLayout('{B-5-4}');
    const spec = syntheticForm(rules, formulas);
    const whole = spec.sheets.find((s) => s.name === '전체')!;
    // B-5-4 코드 칸을 지운다(열 자체는 남음)
    delete whole.cells[`${target}3`];
    void cells;
    const r = await checkWorkbook({ bytes: await buildXlsx(spec), fileName: 'x.xlsx', rules, formulas });
    const f = r.findings.filter((x) => x.ruleId === 'S-COL-01');
    expect(f.map((x) => x.detail?.['key'])).toContain('B-5-4');
    expect(f[0]!.message).toContain('양식에서 항목 B-5-4를 찾을 수 없습니다');
    expect(r.supported).toBe(true);
  });
});

describe('머리글 비교는 공백·오타에 너그럽다', () => {
  it("원본 오타 '둥록자수'를 규칙의 '등록자수'로 찾는다", () => {
    expect(JSON.stringify(rules)).toContain('E-2 a|전공의 등록자수');
    expect(layout2026()['GA5']).toContain('둥록자수');
    expect(resolveForLayout('{E-2 a|전공의 등록자수/평가년도 2월말일 기준 전공의 현원}')).toBe('GA');
  });
  it('공백이 달라도 같은 열', () => {
    expect(resolveForLayout('{A-2-1|②정원책정지도전문의수}')).toBe('I');
    expect(resolveForLayout('{A-6-4|k.수면무호흡  처치 및 수술}')).toBe('CC');
  });
});

describe('양식 서명이 맞지 않으면', () => {
  it('어느 칸이 어떻게 다른지와 원본 양식 안내를 보여 준다', async () => {
    const spec = syntheticForm(rules, formulas, { patch: { 표지: { B4: '2025년도 수련실태조사 (임의 수정)' } } });
    const r = await checkWorkbook({ bytes: await buildXlsx(spec), fileName: 'x.xlsx', rules, formulas });
    expect(r.supported).toBe(false);
    const f = r.findings[0]!;
    expect(f.ruleId).toBe('S-FORM-01');
    expect(f.message).toContain('표지 B4');
    expect(f.message).toContain("'2026년도 수련실태조사' 포함");
    expect(f.message).toContain('2025년도 수련실태조사');
    expect(f.message).toContain('학회에서 배포한 양식 원본을 사용하세요');
  });
});
