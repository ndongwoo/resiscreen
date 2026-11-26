/** 실적 인정 기간 검사 */
import type { Context, Rule } from '../rules.ts';
import { makeFinding } from '../rules.ts';
import type { Finding } from '../report.ts';
import { dataRows, dateToISO, parseLooseDate } from '../values.ts';

interface Period {
  start: string;
  end: string;
}

function periodOf(ctx: Context, key: string): Period {
  const p = (ctx.rules.reference as unknown as Record<string, unknown>)[key] as Period | undefined;
  if (!p) throw new Error(`기준 기간이 없습니다: ${key}`);
  return p;
}

interface DateSheetSpec {
  sheet: string;
  dateCol: string;
  keyCol: string;
  firstRow: number;
  lastRow?: number;
}

function specs(ctx: Context, rule: Rule): DateSheetSpec[] {
  const t = rule.target;
  if (t.from_surgery_sheets)
    return ctx.rules.surgery_sheets.map((s) => ({ sheet: s.sheet, dateCol: s.date_col ?? t.date_col, keyCol: 'D', firstRow: t.first_row }));
  return [{ sheet: t.sheet, dateCol: t.date_col, keyCol: t.row_key_col ?? t.date_col, firstRow: t.first_row, lastRow: t.last_row }];
}

/** 날짜가 기간 밖이면 경고. only_with_year면 연도가 적힌 날짜만 비교한다. */
export function dateRange(ctx: Context, rule: Rule): Finding[] {
  const p = periodOf(ctx, rule.target.period);
  const out: Finding[] = [];
  for (const s of specs(ctx, rule)) {
    const sheet = ctx.wb.sheetByName.get(s.sheet);
    if (!sheet) continue;
    for (const row of dataRows(sheet, s.keyCol, s.firstRow, s.lastRow)) {
      const ref = `${s.dateCol}${row}`;
      const d = parseLooseDate(sheet.cells.get(ref), ctx.wb.date1904);
      if (d.invalid || d.noYear) continue;
      const iso = dateToISO(d)!;
      // 일(day)이 없으면 그 달 전체가 기간과 겹치는지로 본다
      const monthEnd = d.day ? iso : `${iso.slice(0, 8)}31`;
      if (monthEnd < p.start || iso > p.end) {
        out.push(makeFinding(rule, { sheet: s.sheet, cell: ref, row, detail: { date: iso, period: p } }));
      }
    }
  }
  return out;
}

/** 연도 없는 날짜 때문에 기간 검사를 못 하는 시트마다 INFO 1건 */
export function yearMissingLimit(ctx: Context, rule: Rule): Finding[] {
  const out: Finding[] = [];
  for (const s of specs(ctx, rule)) {
    const sheet = ctx.wb.sheetByName.get(s.sheet);
    if (!sheet) continue;
    let noYear = 0;
    let total = 0;
    for (const row of dataRows(sheet, s.keyCol, s.firstRow, s.lastRow)) {
      total++;
      if (parseLooseDate(sheet.cells.get(`${s.dateCol}${row}`), ctx.wb.date1904).noYear) noYear++;
    }
    if (noYear > 0) {
      out.push(makeFinding(rule, { sheet: s.sheet, cell: `${s.dateCol}${s.firstRow - 1}`, detail: { rows_without_year: noYear, rows: total } }));
    }
  }
  return out;
}

/** 날짜 칸이 없는 구조라 기간 검사를 못 하는 시트 안내 */
export function structureLimit(ctx: Context, rule: Rule): Finding[] {
  return (rule.target.sheets as string[])
    .filter((s) => ctx.wb.sheetByName.has(s))
    .map((s) => makeFinding(rule, { sheet: s }));
}

/** 머리글 문구에서 첫 날짜를 읽는다: 'YYYY년 M/D일', 'YYYY년 M월 D일', '(YYYY년) 2월말일' */
export function headerDate(text: string): string | null {
  const t = text.replace(/\s+/g, ' ');
  const pad = (n: number) => String(n).padStart(2, '0');
  let m = /(\d{4})\s*년\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*일/.exec(t);
  if (m) return `${m[1]}-${pad(+m[2]!)}-${pad(+m[3]!)}`;
  m = /(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/.exec(t);
  if (m) return `${m[1]}-${pad(+m[2]!)}-${pad(+m[3]!)}`;
  m = /(\d{4})\s*년\s*\)?\s*(\d{1,2})\s*월\s*말\s*일/.exec(t);
  if (m) {
    const y = +m[1]!;
    const mo = +m[2]!;
    return `${y}-${pad(mo)}-${pad(new Date(Date.UTC(y, mo, 0)).getUTCDate())}`;
  }
  return null;
}

/** 양식 머리글에 적힌 기준일이 조사 연도에서 계산한 기준일과 같은지 */
export function headerDates(ctx: Context, rule: Rule): Finding[] {
  const t = rule.target;
  const sheet = ctx.wb.sheetByName.get(t.sheet);
  if (!sheet) return [];
  const out: Finding[] = [];
  for (const chk of t.checks as { item: string; cell: string; ref: string }[]) {
    if (!/^[A-Z]{1,3}\d+$/.test(chk.cell)) continue; // 항목을 찾지 못함(S-COL-01이 따로 알림)
    const raw = sheet.cells.get(chk.cell)?.value;
    const found = headerDate(raw === null || raw === undefined ? '' : String(raw));
    const expected = (ctx.rules.reference as unknown as Record<string, string>)[chk.ref];
    if (!found || !expected || found === expected) continue;
    out.push(makeFinding(rule, { sheet: t.sheet, cell: chk.cell, itemCode: chk.item, message: `${rule.message} (${chk.item}: 양식 ${found}, 점검 기준 ${expected})`, detail: { found, expected, ref: chk.ref } }));
  }
  return out;
}
