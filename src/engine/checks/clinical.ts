/** 진료실적(A-6) 검사: 행 수·총 건수, 과락, 같은 환자 중복 가능성, 이름 가림 */
import type { Context, Rule } from '../rules.ts';
import { makeFinding } from '../rules.ts';
import type { Finding } from '../report.ts';
import { asText, dataRows, getQualified, isBlank, splitRef, toNumber } from '../values.ts';
import { colToIndex } from '../xlsx/refs.ts';

export function rowsVsTotal(ctx: Context, rule: Rule): Finding[] {
  const t = rule.target;
  const out: Finding[] = [];
  for (const s of ctx.rules.surgery_sheets) {
    const sheet = ctx.wb.sheetByName.get(s.sheet);
    if (!sheet) continue;
    const totalCell = sheet.cells.get(s.total);
    const total = toNumber(totalCell);
    const rows = dataRows(sheet, t.count_col, t.first_row).length;
    if (total === null) {
      if (rows > 0 || !isBlank(totalCell))
        out.push(makeFinding(rule, { sheet: s.sheet, cell: s.total, message: '총 건수 칸이 비었거나 숫자가 아닙니다. 숫자만 입력하세요.', level: 'ERROR', detail: { rows } }));
      continue;
    }
    if (s.side_sum_col) continue; // ESS는 쪽수 기준이라 sideSum 규칙에서 본다
    if (rows !== total) out.push(makeFinding(rule, { sheet: s.sheet, cell: s.total, detail: { rows, total } }));
  }
  return out;
}

/** ESS: 소계(R+L) 열 합 = 총 건수 */
export function sideSum(ctx: Context, rule: Rule): Finding[] {
  const t = rule.target;
  const sheet = ctx.wb.sheetByName.get(t.sheet);
  if (!sheet) return [];
  const total = toNumber(sheet.cells.get(t.total));
  if (total === null) return [];
  const ci = colToIndex(t.sum_col);
  let sum = 0;
  for (const c of sheet.cells.values()) {
    if (c.col === ci && c.row >= t.first_row) sum += toNumber(c) ?? 0;
  }
  if (Math.abs(sum - total) > 1e-6) return [makeFinding(rule, { sheet: t.sheet, cell: t.total, detail: { side_sum: sum, total } })];
  return [];
}

export function threshold(ctx: Context, rule: Rule): Finding[] {
  const out: Finding[] = [];
  for (const chk of rule.target.checks as { cell: string; label: string; min: number }[]) {
    const [sheet, ref] = splitRef(chk.cell);
    const n = toNumber(getQualified(ctx.wb, chk.cell));
    if (n === null) continue;
    if (n < chk.min) {
      out.push(makeFinding(rule, { sheet, cell: ref, message: `${chk.label} ${n}건(기준 ${chk.min}건): ${rule.message}`, detail: { value: n, min: chk.min } }));
    }
  }
  return out;
}

/** 같은 환자 중복: 환자 식별 열이 있을 때만 비교, 없으면 INFO 1건 */
export function samePatientPairs(ctx: Context, rule: Rule): Finding[] {
  const t = rule.target;
  const re = new RegExp(t.patient_id_header);
  const out: Finding[] = [];
  for (const [a, b] of t.pairs as [string, string][]) {
    const sa = ctx.wb.sheetByName.get(a);
    const sb = ctx.wb.sheetByName.get(b);
    if (!sa || !sb) continue;
    const idCol = (s: typeof sa) => [...s.cells.values()].find((c) => c.row === t.header_row && re.test(asText(c).replace(/\s/g, '')))?.col;
    const ca = idCol(sa);
    const cb = idCol(sb);
    if (ca === undefined || cb === undefined) {
      out.push(makeFinding(rule, { sheet: a, message: `${rule.message} ('${a}' ↔ '${b}')` }));
      continue;
    }
    const ids = new Map<string, number>();
    for (const c of sa.cells.values()) if (c.col === ca && c.row > t.header_row && !isBlank(c)) ids.set(asText(c).trim(), c.row);
    for (const c of sb.cells.values()) {
      if (c.col !== cb || c.row <= t.header_row || isBlank(c)) continue;
      const hit = ids.get(asText(c).trim());
      if (hit !== undefined)
        out.push(
          makeFinding(rule, {
            sheet: b,
            cell: c.ref,
            row: c.row,
            level: 'WARNING',
            message: `같은 환자 식별값이 '${a}' ${hit}행에도 있습니다. 한 환자당 한쪽만 인정되니 확인하세요.`,
          }),
        );
    }
  }
  return out;
}

const MASK = /[*＊○●◯]/;

/** 환자 이름 가림 처리: 가운데가 가려지지 않은 이름이 있는 시트마다 1건(이름 자체는 결과에 넣지 않음) */
export function nameMasked(ctx: Context, rule: Rule): Finding[] {
  const t = rule.target;
  const out: Finding[] = [];
  for (const s of ctx.rules.surgery_sheets) {
    const sheet = ctx.wb.sheetByName.get(s.sheet);
    if (!sheet) continue;
    const rows: number[] = [];
    for (const row of dataRows(sheet, t.name_col, t.first_row)) {
      const v = asText(sheet.cells.get(`${t.name_col}${row}`)).trim();
      if (v.length >= 2 && !MASK.test(v)) rows.push(row);
    }
    if (rows.length > 0) {
      out.push(
        makeFinding(rule, {
          sheet: s.sheet,
          cell: `${t.name_col}${rows[0]}`,
          row: rows[0],
          message: `${rule.message} (${rows.length}행)`,
          detail: { rows: rows.slice(0, 50), count: rows.length },
        }),
      );
    }
  }
  return out;
}
