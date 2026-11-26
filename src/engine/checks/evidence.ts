/** 증빙 첨부 확인: 임베디드 객체(PDF 등)·외부 하이퍼링크가 있는지만 본다. 첨부 내용은 읽지 않는다. */
import type { Context, Rule } from '../rules.ts';
import { makeFinding } from '../rules.ts';
import type { Finding } from '../report.ts';
import { dataRows } from '../values.ts';
import { colToIndex } from '../xlsx/refs.ts';

export function sheetAttachments(ctx: Context, rule: Rule): Finding[] {
  const t = rule.target;
  const sheet = ctx.wb.sheetByName.get(t.sheet);
  if (!sheet) return [];
  const kinds: string[] = t.kinds ?? ['embedded'];
  const embedded = kinds.includes('embedded') ? sheet.embedded.length : 0;
  const links = kinds.includes('hyperlink_external') ? sheet.hyperlinks.filter((h) => h.target && !h.location).length : 0;
  if (embedded + links > 0) return [];
  return [makeFinding(rule, { sheet: t.sheet })];
}

/**
 * 행별 첨부(논문 표지 PDF). 앵커가 한 행 위아래로 어긋나는 경우가 있어(실측)
 * 같은 행 → ±1행 순서로 첨부 하나를 행 하나에 짝짓고, 짝이 없는 행만 표시한다.
 */
export function rowAttachments(ctx: Context, rule: Rule): Finding[] {
  const t = rule.target;
  const sheet = ctx.wb.sheetByName.get(t.sheet);
  if (!sheet) return [];
  const rows = dataRows(sheet, t.row_key_col, t.first_row);
  if (rows.length === 0) return [];
  const attachCol = colToIndex(t.attachment_col);
  const free = sheet.embedded
    .filter((e) => e.row !== undefined && Math.abs((e.col ?? attachCol) - attachCol) <= 2)
    .map((e) => e.row!);
  const unmatched = new Set(rows);
  for (const dist of [0, 1]) {
    for (const r of rows) {
      if (!unmatched.has(r)) continue;
      const i = free.findIndex((a) => Math.abs(a - r) === dist);
      if (i >= 0) {
        free.splice(i, 1);
        unmatched.delete(r);
      }
    }
  }
  return [...unmatched].map((r) =>
    makeFinding(rule, { sheet: t.sheet, cell: `${t.attachment_col}${r}`, row: r, detail: { attachments_in_sheet: sheet.embedded.length, rows: rows.length } }),
  );
}
