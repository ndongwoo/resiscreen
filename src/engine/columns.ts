/**
 * '전체' 시트의 열을 열 문자 대신 항목 코드(3행)와 세부 머리글(4·5행)로 찾는다.
 * 규칙 파일에는 `{A-2-1|② 정원책정 지도전문의 수}6`처럼 적는다(뒤의 숫자는 행).
 *  - `{코드}`: 그 코드의 첫 열(열이 하나인 항목은 코드만 적는다)
 *  - `{코드|머리글}`: 같은 코드 안에서 머리글이 맞는 열. 공백·기호·원문자(①)를 지운 뒤 정확히 같은 열을 먼저 찾고,
 *    없으면 비슷한 머리글(유사도 0.8 이상, 2등 후보보다 0.1 이상 높음)을 인정한다(matchItem).
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

/** 비슷한 머리글이 둘 이상이라 열을 하나로 정할 수 없음 */
export class ColumnAmbiguous extends Error {
  constructor(
    readonly key: string,
    /** 후보: 열·양식 머리글·유사도 */
    readonly candidates: { col: string; label: string; score: number }[],
  ) {
    super(`양식에서 항목 ${key}의 열을 하나로 정할 수 없습니다`);
  }
}

/** 유사 매칭을 인정하는 최소 유사도와 2등 후보와의 최소 차이 */
export const FUZZY_MIN = 0.8;
export const FUZZY_MARGIN = 0.1;

export interface ItemMatch {
  col: string;
  /** 유사 매칭으로 찾았으면 규칙 문구·양식 문구·유사도 */
  fuzzy?: { ruleLabel: string; formLabel: string; score: number };
}

const headerOf = (c: ItemColumn) => c.r5 || c.r4;

/**
 * 항목 키를 열로 찾는다.
 *  1. 정확 일치: 공백·기호·원문자를 지운 뒤 4행 또는 5행 머리글과 같은 열(같은 코드 안에서 하나여야 함)
 *  2. 없으면 유사 매칭: 1등 유사도가 0.8 이상이고 2등 후보(다른 열)보다 0.1 이상 높을 때만 인정
 *  둘 다 아니면 ColumnNotFound(비슷한 것도 없음) 또는 ColumnAmbiguous(후보가 여럿)
 */
export function matchItem(index: ItemColumn[], key: string): ItemMatch {
  const [rawCode, ...rest] = key.split('|');
  const code = normCode(rawCode ?? '');
  const label = rest.join('|').trim();
  const cands = index.filter((c) => c.code === code);
  if (!cands.length) throw new ColumnNotFound(key);
  const L = normLabel(label);
  // 코드만 적은 키는 그 코드의 첫 열
  if (!L) return { col: cands[0]!.col };
  const exact = cands.filter((c) => [c.r5, c.r4].some((h) => h && normLabel(h) === L));
  if (exact.length === 1) return { col: exact[0]!.col };
  if (exact.length > 1) throw new ColumnAmbiguous(key, exact.map((c) => ({ col: c.col, label: headerOf(c), score: 1 })));
  const scored = cands
    .map((c) => {
      let score = 0;
      let formLabel = headerOf(c);
      for (const h of [c.r5, c.r4]) {
        const H = normLabel(h);
        if (!H) continue;
        const r = ratio(L, H);
        if (r > score) {
          score = r;
          formLabel = h;
        }
      }
      return { col: c.col, label: formLabel, score };
    })
    .sort((a, b) => b.score - a.score);
  const [first, second] = scored;
  if (!first || first.score < FUZZY_MIN) throw new ColumnNotFound(key);
  if (second && first.score - second.score < FUZZY_MARGIN)
    throw new ColumnAmbiguous(
      key,
      scored.filter((x) => x.score >= FUZZY_MIN || x === second),
    );
  return { col: first.col, fuzzy: { ruleLabel: label, formLabel: first.label, score: first.score } };
}

/** 항목 키(코드 또는 코드|머리글)를 열 문자로 */
export function resolveItem(index: ItemColumn[], key: string): string {
  return matchItem(index, key).col;
}

/** 키를 풀면서 모은 기록: 못 찾은 키, 후보가 여럿인 키, 유사 매칭으로 찾은 키 */
export interface ResolveLog {
  ambiguous: Map<string, ColumnAmbiguous['candidates']>;
  fuzzy: Map<string, NonNullable<ItemMatch['fuzzy']> & { col: string }>;
}

export const newResolveLog = (): ResolveLog => ({ ambiguous: new Map(), fuzzy: new Map() });

const PLACEHOLDER = /\{([^{}]+)\}/g;
const SKIP_FIELDS = new Set(['message', 'message_referenced', 'basis', 'todo', 'note', '_note', 'label', 'signature_note', 'reason']);

export interface ResolveResult<T> {
  value: T;
  missing: string[];
}

/** 문자열 안의 {키}를 열 문자로 바꾼다. 못 찾은 키는 missing에 모으고 그 자리는 그대로 둔다 */
/** 후보가 여럿인 키도 missing에 넣는다(그 키를 쓰는 점검은 건너뜀). 자세한 내용은 log에 */
export function resolveString(index: ItemColumn[], s: string, missing: Set<string>, log?: ResolveLog): string {
  return s.replace(PLACEHOLDER, (m, key: string) => {
    try {
      const r = matchItem(index, key);
      if (r.fuzzy) log?.fuzzy.set(key, { ...r.fuzzy, col: r.col });
      return r.col;
    } catch (e) {
      missing.add(key);
      if (e instanceof ColumnAmbiguous) log?.ambiguous.set(key, e.candidates);
      return m;
    }
  });
}

/** 객체 전체(규칙·서명·수식 위치)의 {키}를 바꾼다. 설명 문구 필드는 건드리지 않는다 */
export function resolveDeep<T>(index: ItemColumn[], value: T, missing: Set<string>, log?: ResolveLog): T {
  const walk = (v: unknown, field?: string): unknown => {
    if (typeof v === 'string') return field && SKIP_FIELDS.has(field) ? v : resolveString(index, v, missing, log);
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

/** 같은 항목 코드 안에서 머리글이 서로 비슷한(유사도 min 이상) 열 쌍. 혼동 주의 머리글 문서와 테스트에 쓴다 */
export function confusablePairs(index: ItemColumn[], min = FUZZY_MIN): { code: string; a: string; b: string; aLabel: string; bLabel: string; score: number }[] {
  const out: { code: string; a: string; b: string; aLabel: string; bLabel: string; score: number }[] = [];
  for (let i = 0; i < index.length; i++)
    for (let j = i + 1; j < index.length; j++) {
      const a = index[i]!;
      const b = index[j]!;
      if (a.code !== b.code) continue;
      let score = 0;
      for (const x of [a.r5, a.r4]) for (const y of [b.r5, b.r4]) if (normLabel(x) && normLabel(y)) score = Math.max(score, ratio(normLabel(x), normLabel(y)));
      if (score >= min) out.push({ code: a.code, a: a.col, b: b.col, aLabel: headerOf(a), bLabel: headerOf(b), score });
    }
  return out;
}
