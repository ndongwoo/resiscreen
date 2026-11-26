import { describe, expect, it } from 'vitest';
import { checkWorkbook } from '../../src/engine/index.ts';
import { reportToXlsx } from '../../src/engine/export.ts';
import { loadWorkbook } from '../../src/engine/xlsx/workbook.ts';
import { buildXlsx } from '../helpers/build_xlsx.ts';
import { syntheticForm } from '../helpers/synthetic_form.ts';
import { loadFormulas, loadRules } from '../helpers/load.ts';

describe('점검결과 엑셀', () => {
  it('요약·결과 시트만 담고, 결과 행에 원본 시트명·셀 주소가 있다', async () => {
    const rules = loadRules();
    const formulas = loadFormulas();
    const bytes = await buildXlsx(syntheticForm(rules, formulas, { patch: { 전체: { K7: undefined } } }));
    const report = await checkWorkbook({ bytes, fileName: 'x.xlsx', rules, formulas });
    const out = await loadWorkbook(await reportToXlsx(report));
    expect(out.sheets.map((s) => s.name)).toEqual(['요약', '점검결과']);
    const list = out.sheetByName.get('점검결과')!;
    const rows = [...list.cells.values()].filter((c) => c.col === 3 && c.value === 'K7');
    expect(rows).toHaveLength(1);
    expect(list.cells.get(`B${rows[0]!.row}`)!.value).toBe('전체');
    expect(list.cells.get(`A${rows[0]!.row}`)!.value).toBe('ERROR');
  });
});
