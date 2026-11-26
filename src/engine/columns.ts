/**
 * '전체' 시트의 열을 열 문자 대신 항목 코드(3행)와 세부 머리글(4·5행)로 찾는다.
 * 규칙 파일에는 `{A-2-1|② 정원책정 지도전문의 수}6`처럼 적는다(뒤의 숫자는 행).
 *  - `{코드}`: 그 코드의 첫 열(열이 하나인 항목은 코드만 적는다)
 *  - `{코드|머리글}`: 같은 코드 안에서 머리글이 맞는 열. 공백·기호·원문자(①)는 무시하고,
 *    앞부분 일치 → 포함 → 비슷함(유사도 0.8 이상) 순으로 찾는다(원본 오타 '둥록자수' 같은 경우).
 *  - 하위 항목 코드가 'a', 'b'처럼 적힌 칸(D-1, E-2)은 2행의 중분류 코드를 붙여 'E-2 a'로 쓴다.
 * 양식에 새 열이 끼어들어도(예: 2027 기관절개술 건수) 코드·머리글로 찾으므로 규칙을 고칠 필요가 없다.
 */
import type { Sheet } from './xlsx/workbook.ts';
import { colToIndex, indexToCol } from './xlsx/refs.ts';
import { ratio } from './biblio/match.ts';

export interface ItemColumn {
  col: string;
  code: string;
  r4: string;
  r5: string;
}

const text = (s: Sheet, col: string, row: number) => {
  const v = s.cells.get(`${col}${row}`)?.value;
  return v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim();
};

export function normLabel(t: string): string {
  return t
    .normalize('NFKC')
    .replace(/[①-⑳]/g, '')
    .replace(/[\s\p{P}\p{S}_]+/gu, '')
    .toLowerCase();
}

export function normCode(t: string): string {
  return t.replace(/\s+/g, ' ').trim().toUpperCase().replace(/ ([A-Z])$/, (_m, x: string) => ` ${x.toLowerCase()}`);
}

/** '전체' 시트의 열마다 항목 코드와 머리글 */
export function buildItemIndex(sheet: Sheet): ItemColumn[] {
  let maxCol = 0;
  for (const c of sheet.cells.values()) if (c.row <= 5) maxCol = Math.max(maxCol, c.col);
  const out: ItemColumn[] = [];
  let group = '';
  let code3 = '';
  for (let i = 2; i <= maxCol; i++) {
    const col = indexToCol(i);
    const r2 = text(sheet, col, 2);
    const r3 = text(sheet, col, 3);
    const m = /^([A-E]-\d+)/.exec(r2);
    if (m) {
      group = m[1]!;
      code3 = '';
    }
    if (r3) code3 = r3;
    if (!code3 && !group) continue;
    let code: string;
    if (/^[A-E]-\d+(-\d+)?$/.test(code3)) code = code3;
    else if (code3) code = `${group} ${/^[a-z]/.exec(code3)?.[0] ?? code3}`;
    else code = group;
    out.push({ col, code: normCode(code), r4: text(sheet, col, 4), r5: text(sheet, col, 5) });
  }
  return out;
}

export class ColumnNotFound extends Error {
  constructor(readonly key: string) {
    super(`양식에서 항목 ${key}를 찾을 수 없습니다`);
  }
}

/** 항목 키(코드 또는 코드|머리글)를 열 문자로 */
export function resolveItem(index: ItemColumn[], key: string): string {
  const [rawCode, ...rest] = key.split('|');
  const code = normCode(rawCode ?? '');
  const label = rest.join('|').trim();
  const cands = index.filter((c) => c.code === code);
  if (!cands.length) throw new ColumnNotFound(key);
  if (!label) return cands[0]!.col;
  const L = normLabel(label);
  if (!L) return cands[0]!.col;
  let best: { col: string; score: number } | null = null;
  for (const c of cands) {
    let score = 0;
    for (const h of [c.r5, c.r4]) {
      const H = normLabel(h);
      if (!H) continue;
      if (H.startsWith(L)) score = Math.max(score, 1);
      else if (H.includes(L)) score = Math.max(score, 0.99);
      else score = Math.max(score, ratio(L, H.slice(0, L.length)), ratio(L, H));
    }
    if (!best || score > best.score) best = { col: c.col, score };
  }
  if (!best || best.score < 0.8) throw new ColumnNotFound(key);
  return best.col;
}

const PLACEHOLDER = /\{([^{}]+)\}/g;
const SKIP_FIELDS = new Set(['message', 'message_referenced', 'basis', 'todo', 'note', '_note', 'label', 'signature_note', 'reason']);

export interface ResolveResult<T> {
  value: T;
  missing: string[];
}

/** 문자열 안의 {키}를 열 문자로 바꾼다. 못 찾은 키는 missing에 모으고 그 자리는 그대로 둔다 */
export function resolveString(index: ItemColumn[], s: string, missing: Set<string>): string {
  return s.replace(PLACEHOLDER, (m, key: string) => {
    try {
      return resolveItem(index, key);
    } catch {
      missing.add(key);
      return m;
    }
  });
}

/** 객체 전체(규칙·서명·수식 위치)의 {키}를 바꾼다. 설명 문구 필드는 건드리지 않는다 */
export function resolveDeep<T>(index: ItemColumn[], value: T, missing: Set<string>): T {
  const walk = (v: unknown, field?: string): unknown => {
    if (typeof v === 'string') return field && SKIP_FIELDS.has(field) ? v : resolveString(index, v, missing);
    if (Array.isArray(v)) return v.map((x) => walk(x, field));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
    return v;
  };
  return walk(value) as T;
}

export function hasPlaceholder(v: unknown): boolean {
  return JSON.stringify(v).includes('{') && PLACEHOLDER.test(JSON.stringify(v).replace(/"(message|basis|todo|note|_note)":"[^"]*"/g, ''));
}

export { colToIndex };
