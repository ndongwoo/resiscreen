/** 구조 검사: 필수 시트·필수 칸, 숫자 형식, 잘못된 행 입력, 수식 훼손, 엑셀 오류값, 합계 대조 */
import type { Context, Rule } from '../rules.ts';
import { isReferenced, makeFinding } from '../rules.ts';
import type { Finding } from '../report.ts';
import { asText, dataRows, getCell, getQualified, isBlank, itemCodeFor, splitRef, toNumber } from '../values.ts';
import { colToIndex, expandAll, inRange, parseCoord, parseRange } from '../xlsx/refs.ts';

export function requiredSheets(ctx: Context, rule: Rule): Finding[] {
  return ctx.rules.form.required_sheets
    .filter((s) => !ctx.wb.sheetByName.has(s))
    .map((s) => makeFinding(rule, { sheet: s, message: `${rule.message} (없는 시트: ${s})` }));
}

function exceptionCells(rule: Rule): Set<string> {
  return new Set(expandAll((rule.exceptions ?? []).flatMap((e) => e.cells)));
}

function cellsOf(rule: Rule): string[] {
  const t = rule.target;
  return [...expandAll(t.ranges ?? []), ...(t.cells ?? [])];
}

function conditionMet(ctx: Context, sheet: string, when: { cell: string; op: string; value: number } | undefined): boolean {
  if (!when) return true;
  const n = toNumber(getQualified(ctx.wb, when.cell, sheet));
  if (n === null) return false; // 조건 칸이 비면 그 칸의 빈칸 규칙이 따로 잡는다
  switch (when.op) {
    case '>':
      return n > when.value;
    case '>=':
      return n >= when.value;
    case '<':
      return n < when.value;
    case '<=':
      return n <= when.value;
    case '==':
      return n === when.value;
    case '!=':
      return n !== when.value;
    default:
      return true;
  }
}

/** '전체' 시트처럼 고정된 칸 목록의 빈칸 */
export function requiredCells(ctx: Context, rule: Rule): Finding[] {
  const t = rule.target;
  const sheetName: string = t.sheet;
  const sheet = ctx.wb.sheetByName.get(sheetName);
  if (!sheet) return [];
  if (!conditionMet(ctx, sheetName, t.when)) return [];
  const skip = exceptionCells(rule);
  const out: Finding[] = [];
  for (const ref of cellsOf(rule)) {
    if (skip.has(ref)) continue;
    if (isBlank(sheet.cells.get(ref))) {
      out.push(makeFinding(rule, { sheet: sheetName, cell: ref, itemCode: t.item_code_row ? itemCodeFor(sheet, parseCoord(ref).col, t.item_code_row) : itemCodeFor(sheet, parseCoord(ref).col) }));
    }
  }
  return out;
}

/** 증빙 시트의 행 단위 필수 칸(행 기준 열이 채워진 행만) */
export function requiredRows(ctx: Context, rule: Rule): Finding[] {
  const t = rule.target;
  const sheet = ctx.wb.sheetByName.get(t.sheet);
  if (!sheet) return [];
  const out: Finding[] = [];
  const vague = t.vague_pattern ? new RegExp(t.vague_pattern, 'i') : null;
  for (const row of dataRows(sheet, t.row_key_col, t.first_row, t.last_row)) {
    if (t.row_key_nonzero) {
      const n = toNumber(sheet.cells.get(`${t.row_key_col}${row}`));
      if (n === null || n === 0) continue;
    }
    if (t.cols) {
      const blanks = (t.cols as string[]).filter((c) => isBlank(sheet.cells.get(`${c}${row}`)));
      let vagueHit = false;
      if (vague && blanks.length === 0) {
        const pathBlank = !t.pathology_col || isBlank(sheet.cells.get(`${t.pathology_col}${row}`));
        // 진단명 열이 지정되면 진단명이 막연할 때만(수술명만 'Mass excision'이면 진단명으로 병리를 알 수 있음)
        const vagueCols: string[] = t.diagnosis_col ? [t.diagnosis_col] : t.cols;
        vagueHit = pathBlank && vagueCols.some((c) => vague.test(asText(sheet.cells.get(`${c}${row}`))));
      }
      if (blanks.length > 0 || vagueHit) {
        out.push(
          makeFinding(rule, {
            sheet: t.sheet,
            cell: blanks.length > 0 ? `${blanks[0]}${row}` : `${t.cols[0]}${row}`,
            row,
            detail: blanks.length > 0 ? { blank_columns: blanks } : { vague_name: true },
          }),
        );
      }
    }
    if (t.any_of) {
      const allBlank = (t.any_of as string[]).every((c) => isBlank(sheet.cells.get(`${c}${row}`)));
      if (allBlank) out.push(makeFinding(rule, { sheet: t.sheet, cell: `${t.any_of[0]}${row}`, row }));
    }
  }
  return out;
}

function targetCellsFrom(ctx: Context, rule: Rule): string[] {
  const t = rule.target;
  if (t.ranges_from_rule) {
    const src = ctx.rules.rules.find((r) => r.id === t.ranges_from_rule);
    if (!src) throw new Error(`참조 규칙이 없습니다: ${t.ranges_from_rule}`);
    const skip = exceptionCells(src);
    return cellsOf(src).filter((c) => !skip.has(c));
  }
  return cellsOf(rule);
}

/** 6행이 비었는데 같은 열 7행(안내 문구 자리)에 숫자가 있으면 잘못된 행 입력 */
export function numberInGuideRow(ctx: Context, rule: Rule): Finding[] {
  const t = rule.target;
  const sheet = ctx.wb.sheetByName.get(t.sheet);
  if (!sheet) return [];
  const out: Finding[] = [];
  for (const ref of targetCellsFrom(ctx, rule)) {
    const { col } = parseCoord(ref);
    const valueRow = parseCoord(ref).row;
    const guideRef = ref.replace(/\d+$/, String(t.guide_row));
    const guide = sheet.cells.get(guideRef);
    if (isBlank(sheet.cells.get(ref)) && toNumber(guide) !== null) {
      out.push(makeFinding(rule, { sheet: t.sheet, cell: guideRef, itemCode: itemCodeFor(sheet, col), detail: { expected_cell: ref, value_row: valueRow } }));
    }
  }
  return out;
}

/** 숫자 칸 형식. 다른 수식이 참조하는 칸이면 rule.level, 아니면 level_if_unreferenced */
export function dtypeCells(ctx: Context, rule: Rule): Finding[] {
  const t = rule.target;
  const sheet = ctx.wb.sheetByName.get(t.sheet);
  if (!sheet) return [];
  const out: Finding[] = [];
  for (const ref of targetCellsFrom(ctx, rule)) {
    const c = sheet.cells.get(ref);
    if (isBlank(c) || c!.formula) continue;
    const n = toNumber(c);
    const bad = n === null || (t.dtype === 'nonneg_number' && n < 0) || (!t.accept_numeric_text && typeof c!.value === 'string');
    if (!bad) continue;
    const referenced = isReferenced(ctx, t.sheet, ref);
    const level = referenced ? rule.level : (rule.level_if_unreferenced ?? rule.level);
    out.push(
      makeFinding(rule, {
        sheet: t.sheet,
        cell: ref,
        level,
        itemCode: itemCodeFor(sheet, parseCoord(ref).col),
        message: referenced && rule.message_referenced ? `${rule.message} ${rule.message_referenced}` : rule.message,
        detail: { referenced_by_formula: referenced },
      }),
    );
  }
  return out;
}

/** 기준 양식에서 수식이 있어야 하는 칸이 값으로 바뀌었거나 비었는지 */
export function formulaReplaced(ctx: Context, rule: Rule): Finding[] {
  const ref = ctx.formulas;
  if (!ref) return [];
  const out: Finding[] = [];
  for (const sheetName of rule.target.sheets as string[]) {
    const spec = ref.sheets[sheetName];
    const sheet = ctx.wb.sheetByName.get(sheetName);
    if (!spec || !sheet) continue;
    const targets: string[] = [...(spec.cells ?? []), ...(spec.extra_cells ?? [])];
    if (spec.cols && spec.first_row && spec.last_row) {
      const rows = spec.row_key_col ? dataRows(sheet, spec.row_key_col, spec.first_row, spec.last_row) : [];
      for (const r of rows) for (const c of spec.cols) targets.push(`${c}${r}`);
    }
    for (const cellRef of targets) {
      const c = sheet.cells.get(cellRef);
      if (c?.formula !== undefined) continue;
      out.push(
        makeFinding(rule, {
          sheet: sheetName,
          cell: cellRef,
          itemCode: sheetName === '전체' ? itemCodeFor(sheet, parseCoord(cellRef).col) : undefined,
          detail: { state: isBlank(c) ? 'blank' : 'value' },
        }),
      );
    }
  }
  return out;
}

export function excelErrors(ctx: Context, rule: Rule): Finding[] {
  const out: Finding[] = [];
  for (const name of rule.target.sheets as string[]) {
    const sheet = ctx.wb.sheetByName.get(name);
    if (!sheet) continue;
    for (const c of sheet.cells.values()) {
      if (c.type === 'e') out.push(makeFinding(rule, { sheet: name, cell: c.ref, detail: { error: c.value } }));
    }
  }
  return out;
}

const EPS = 1e-6;

/** '전체' 값과 증빙 시트 합계 대조 */
export function sumMatch(ctx: Context, rule: Rule): Finding[] {
  const t = rule.target;
  const pairs: { summary: string; sheet_total: string }[] = [...(t.pairs ?? [])];
  if (t.pairs_from_surgery_sheets) {
    for (const s of ctx.rules.surgery_sheets) if (s.summary) pairs.unshift({ summary: s.summary, sheet_total: `'${s.sheet}'!${s.total}` });
  }
  const out: Finding[] = [];
  for (const p of pairs) {
    const [ss, sc] = splitRef(p.summary);
    const [ts, tc] = splitRef(p.sheet_total);
    if (!ctx.wb.sheetByName.has(ss) || !ctx.wb.sheetByName.has(ts)) continue;
    const a = getCell(ctx.wb, ss, sc);
    const b = getCell(ctx.wb, ts, tc);
    const na = toNumber(a);
    const nb = toNumber(b);
    if (isBlank(a) || isBlank(b)) continue; // 빈칸은 required 규칙이 잡는다
    if (na === null || nb === null || Math.abs(na - nb) > EPS) {
      const sheet = ctx.wb.sheetByName.get(ss)!;
      out.push(
        makeFinding(rule, {
          sheet: ss,
          cell: sc,
          itemCode: ss === '전체' ? itemCodeFor(sheet, parseCoord(sc).col) : undefined,
          message: `${rule.message} ('${ts}' ${tc}와 비교)`,
          detail: { summary_value: na ?? asText(a), sheet: ts, sheet_cell: tc, sheet_value: nb ?? asText(b) },
        }),
      );
    }
  }
  return out;
}

/** 범위 문자열이 셀을 포함하는지(테스트 도우미) */
export function rangeHas(range: string, cell: string): boolean {
  return inRange(parseCoord(cell), parseRange(range));
}

export { colToIndex };
