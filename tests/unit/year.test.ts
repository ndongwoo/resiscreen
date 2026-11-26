/** 평가연도에서 기간 계산, 규칙 선택 */
import { describe, expect, it } from 'vitest';
import { lastDayOfFeb, resolveReference, type RuleSet } from '../../src/engine/rules.ts';
import { checkWorkbook } from '../../src/engine/index.ts';
import { buildXlsx } from '../helpers/build_xlsx.ts';
import { syntheticForm } from '../helpers/synthetic_form.ts';
import { loadFormulas, loadRules } from '../helpers/load.ts';

const rules = loadRules();
const formulas = loadFormulas();

describe('form.year에서 기준값 계산', () => {
  it('2026: 이전 고정값과 같다', () => {
    expect(resolveReference(rules)).toEqual({
      period_default: { start: '2025-01-01', end: '2025-12-31' },
      period_mar_feb: { start: '2025-03-01', end: '2026-02-28' },
      staff_count_date: '2025-09-30',
      paper_year: 2025,
      large_file_mb: 150,
    });
  });
  it('윤년: 2028년 양식의 3~2월 기간은 2028-02-29까지', () => {
    expect(lastDayOfFeb(2028)).toBe(29);
    expect(resolveReference({ form: { ...rules.form, year: 2028 } }).period_mar_feb).toEqual({ start: '2027-03-01', end: '2028-02-29' });
    expect(resolveReference({ form: { ...rules.form, year: 2027 } }).period_mar_feb.end).toBe('2027-02-28');
  });
  it('reference에 직접 적은 값이 우선한다', () => {
    const r = resolveReference({ form: rules.form, reference: { paper_year: 2024, staff_count_date: '2025-10-01' } });
    expect(r.paper_year).toBe(2024);
    expect(r.staff_count_date).toBe('2025-10-01');
    expect(r.period_default).toEqual({ start: '2025-01-01', end: '2025-12-31' });
  });
});

describe('양식 연도로 규칙 선택', () => {
  const other: RuleSet = { ...structuredClone(rules), form: { ...rules.form, year: 2027, label: '2027년도', signature: [{ sheet: '표지', cell: 'B4', contains: '2027년도 수련실태조사' }] } };
  it('여러 연도 규칙 중 signature가 맞는 2026 규칙을 쓰고, 계산된 기간을 결과에 담는다', async () => {
    const bytes = await buildXlsx(syntheticForm(rules, formulas));
    const r = await checkWorkbook({ bytes, fileName: 'x.xlsx', rules: [other, rules], formulas: { 2026: formulas }, journals: {} });
    expect(r.supported).toBe(true);
    expect(r.form).toMatchObject({ year: 2026, paper_year: 2025, period_mar_feb: { end: '2026-02-28' }, staff_count_date: '2025-09-30' });
    expect(r.findings.filter((f) => f.level !== 'INFO')).toEqual([]);
  });
  it('2026 서명에는 연도를 구분하는 칸이 둘 있다(표지 B4, 전체 H4)', () => {
    const yearCells = rules.form.signature.filter((s) => /20\d\d/.test(s.contains ?? s.equals ?? ''));
    expect(yearCells.map((s) => `${s.sheet}!${s.cell}`)).toEqual(['표지!B4', '전체!H4']);
  });
  it('서명이 같은 두 연도 규칙이 동시에 맞으면 고르지 않고 ERROR로 멈춘다', async () => {
    const fake2027: RuleSet = { ...structuredClone(rules), form: { ...structuredClone(rules.form), year: 2027, label: '가짜 2027' } }; // 서명은 2026과 똑같음
    const bytes = await buildXlsx(syntheticForm(rules, formulas));
    const r = await checkWorkbook({ bytes, fileName: 'x.xlsx', rules: [rules, fake2027], formulas: { 2026: formulas } });
    expect(r.supported).toBe(false);
    expect(r.formYear).toBeNull();
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ level: 'ERROR', ruleId: 'S-FORM-02', detail: { years: [2026, 2027] } });
    expect(r.findings[0]!.message).toContain('양식 연도를 판별할 수 없습니다');
  });
  it('맞는 규칙이 없으면 지원하지 않는 양식 ERROR', async () => {
    const bytes = await buildXlsx(syntheticForm(rules, formulas, { patch: { 표지: { B4: '2031년도 수련실태조사' } } }));
    const r = await checkWorkbook({ bytes, fileName: 'x.xlsx', rules: [other, rules], formulas: { 2026: formulas } });
    expect(r.supported).toBe(false);
    expect(r.findings.map((f) => f.ruleId)).toEqual(['S-FORM-01']);
  });
});
