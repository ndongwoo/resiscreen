/** 학술활동(B-2-3 외부 학술대회) 검사: 인정 대상이 아닐 수 있는 행사, 같은 행사를 나눠 적은 의심 */
import type { Context, Rule } from '../rules.ts';
import { makeFinding } from '../rules.ts';
import type { Finding } from '../report.ts';
import { asText, dataRows, dateToISO, parseLooseDate, toNumber } from '../values.ts';

interface EventRow {
  row: number;
  name: string;
  core: string;
  venue: string;
  date: string | null;
}

function rowsOf(ctx: Context, rule: Rule): EventRow[] {
  const t = rule.target;
  const sheet = ctx.wb.sheetByName.get(t.sheet);
  if (!sheet) return [];
  return dataRows(sheet, t.count_col, t.first_row, t.last_row)
    .filter((r) => (toNumber(sheet.cells.get(`${t.count_col}${r}`)) ?? 0) > 0)
    .map((r) => {
      const name = asText(sheet.cells.get(`${t.name_col}${r}`)).trim();
      return {
        row: r,
        name,
        // 끝의 I/II/1일차/(1) 같은 구분 표시와 공백·기호를 지운 핵심 이름
        core: name
          .replace(/\s*(\(?\s*(?:[IVX]+|\d+\s*일차|\d+)\s*\)?)\s*$/i, '')
          .replace(/[\s\-_.,·()[\]]/g, '')
          .toLowerCase(),
        venue: asText(sheet.cells.get(`${t.venue_col}${r}`)).replace(/[\s()]/g, ''),
        date: dateToISO(parseLooseDate(sheet.cells.get(`${t.date_col}${r}`), ctx.wb.date1904)),
      };
    });
}

/** 행사 이름에 키워드가 있는 행(정기학술대회가 아닐 수 있는 행사, 국제학술대회 등) */
export function eventKind(ctx: Context, rule: Rule): Finding[] {
  const t = rule.target;
  // 띄어쓰기 차이를 무시한다('증례 학술대회' = '증례학술대회')
  const words = (t.keywords as string[]).map((w) => w.replace(/\s+/g, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(words.join('|'), 'i');
  const squash = (s: string) => s.replace(/\s+/g, '');
  return rowsOf(ctx, rule)
    .filter((e) => re.test(squash(e.name)))
    .map((e) => makeFinding(rule, { sheet: t.sheet, cell: `${t.name_col}${e.row}`, row: e.row, detail: { linked: t.linked_summary, matched: re.exec(squash(e.name))?.[0] } }));
}

/** 같은 장소·가까운 날짜·같은 핵심 이름의 행이 둘 이상이면 나눠 적은 의심 */
export function eventDuplicate(ctx: Context, rule: Rule): Finding[] {
  const t = rule.target;
  const rows = rowsOf(ctx, rule);
  const out: Finding[] = [];
  const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;
  for (let i = 0; i < rows.length; i++) {
    for (let j = 0; j < i; j++) {
      const a = rows[j]!;
      const b = rows[i]!;
      if (!a.core || a.core !== b.core) continue;
      const near = a.date && b.date ? days(a.date, b.date) <= t.max_days_apart : a.venue !== '' && a.venue === b.venue;
      if (!near) continue;
      out.push(makeFinding(rule, { sheet: t.sheet, cell: `${t.count_col}${b.row}`, row: b.row, detail: { same_as_row: a.row, linked: t.linked_summary } }));
      break;
    }
  }
  return out;
}
