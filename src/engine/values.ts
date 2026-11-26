/** 셀 값 해석 도구(엔진 공통). DOM 의존 없음. */
import type { Cell, Sheet, Workbook } from './xlsx/workbook.ts';
import { serialToISODate } from './xlsx/workbook.ts';
import { colToIndex, indexToCol, parseSheetRef } from './xlsx/refs.ts';

export function getCell(wb: Workbook, sheet: string, ref: string): Cell | undefined {
  return wb.sheetByName.get(sheet)?.cells.get(ref.replace(/\$/g, ''));
}

/** "전체!BS6" 또는 "'a 고실'!G1" → [시트, 셀] */
export function splitRef(qualified: string, defaultSheet?: string): [string, string] {
  const r = parseSheetRef(qualified);
  const sheet = r.sheet ?? defaultSheet;
  if (!sheet) throw new Error(`시트 이름이 없는 셀 주소입니다: ${qualified}`);
  return [sheet, r.ref];
}

export function getQualified(wb: Workbook, qualified: string, defaultSheet?: string): Cell | undefined {
  const [s, c] = splitRef(qualified, defaultSheet);
  return getCell(wb, s, c);
}

export function isBlank(cell: Cell | undefined): boolean {
  if (!cell) return true;
  if (cell.value === null) return true;
  return typeof cell.value === 'string' && cell.value.trim() === '';
}

/** 숫자 또는 숫자 모양 문자열('1,234', ' 12 ')이면 숫자, 아니면 null */
export function toNumber(cell: Cell | undefined): number | null {
  if (!cell || cell.value === null || typeof cell.value === 'boolean') return null;
  if (typeof cell.value === 'number') return Number.isFinite(cell.value) ? cell.value : null;
  if (cell.type === 'e') return null;
  const s = cell.value.trim().replace(/,/g, '');
  if (!/^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/.test(s)) return null;
  return Number(s);
}

export function asText(cell: Cell | undefined): string {
  if (!cell || cell.value === null) return '';
  return String(cell.value);
}

export interface LooseDate {
  year?: number;
  month?: number;
  day?: number;
  /** 연도가 없는 'O월 O일' 형식 */
  noYear: boolean;
  /** 해석 불가 */
  invalid: boolean;
}

/**
 * 날짜 칸 해석. 엑셀 날짜 시리얼, 'YYYY-MM-DD', 'YYYY.M.D', 'YYYY년 M월 D일', 'M월 D일'(연도 없음).
 * 연도는 4자리만 인정하고 추정하지 않는다.
 */
export function parseLooseDate(cell: Cell | undefined, date1904 = false): LooseDate {
  const none: LooseDate = { noYear: false, invalid: true };
  if (!cell || cell.value === null) return none;
  if (typeof cell.value === 'number') {
    if (cell.isDate && (date1904 ? cell.value >= 0 : cell.value > 0)) {
      const iso = serialToISODate(cell.value, date1904);
      if (!iso) return none;
      const [y, m, d] = iso.split('-').map(Number);
      return { year: y, month: m, day: d, noYear: false, invalid: false };
    }
    return none;
  }
  const s = String(cell.value).trim();
  let m = /^((?:19|20)\d{2})\s*(?:[-./]|년)\s*(\d{1,2})(?:\s*(?:[-./]|월)\s*(\d{1,2}))?\s*(?:일|\.)?/.exec(s);
  if (m) {
    const month = Number(m[2]);
    const day = m[3] ? Number(m[3]) : undefined;
    const ok = month >= 1 && month <= 12 && (day === undefined || (day >= 1 && day <= 31));
    return { year: Number(m[1]), month, day, noYear: false, invalid: !ok };
  }
  m = /^(\d{1,2})\s*월\s*(\d{1,2})\s*일?/.exec(s) ?? /^(\d{1,2})\s*[./]\s*(\d{1,2})\.?$/.exec(s);
  if (m) {
    const month = Number(m[1]);
    const day = Number(m[2]);
    return { month, day, noYear: true, invalid: !(month >= 1 && month <= 12 && day >= 1 && day <= 31) };
  }
  return none;
}

export function dateToISO(d: LooseDate): string | null {
  if (d.invalid || d.year === undefined || d.month === undefined) return null;
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day ?? 1).padStart(2, '0')}`;
}

/** 시트에서 first_row 이후 key 열이 채워진 행 번호 목록 */
export function dataRows(sheet: Sheet, keyCol: string, firstRow: number, lastRow = Number.MAX_SAFE_INTEGER): number[] {
  const rows: number[] = [];
  const ci = colToIndex(keyCol);
  for (const c of sheet.cells.values()) {
    if (c.col === ci && c.row >= firstRow && c.row <= lastRow && !isBlank(c)) rows.push(c.row);
  }
  return rows.sort((a, b) => a - b);
}

/** '전체' 시트 항목 코드: codeRow에서 같은 열 또는 왼쪽으로 가장 가까운 값 */
export function itemCodeFor(sheet: Sheet | undefined, col: number, codeRow = 3): string | undefined {
  if (!sheet) return undefined;
  for (let c = col; c >= 1; c--) {
    const v = sheet.cells.get(`${indexToCol(c)}${codeRow}`);
    if (v && !isBlank(v)) return String(v.value).trim();
  }
  return undefined;
}
