/** 셀 주소·범위·수식 참조 도구. 엑셀 A1 표기만 다룬다. */

export function colToIndex(col: string): number {
  let n = 0;
  for (const ch of col.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export function indexToCol(index: number): string {
  let s = '';
  let n = index;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export interface Coord {
  col: number;
  row: number;
}

export function parseCoord(a1: string): Coord {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(a1.trim());
  if (!m) throw new Error(`셀 주소 형식이 아닙니다: ${a1}`);
  return { col: colToIndex(m[1]!), row: Number(m[2]) };
}

export function toA1(c: Coord): string {
  return `${indexToCol(c.col)}${c.row}`;
}

export interface Range {
  start: Coord;
  end: Coord;
}

export function parseRange(ref: string): Range {
  const [a, b] = ref.split(':');
  const start = parseCoord(a!);
  const end = b ? parseCoord(b) : start;
  return {
    start: { col: Math.min(start.col, end.col), row: Math.min(start.row, end.row) },
    end: { col: Math.max(start.col, end.col), row: Math.max(start.row, end.row) },
  };
}

export function inRange(c: Coord, r: Range): boolean {
  return c.col >= r.start.col && c.col <= r.end.col && c.row >= r.start.row && c.row <= r.end.row;
}

export function expandRange(ref: string): string[] {
  const r = parseRange(ref);
  const out: string[] = [];
  for (let row = r.start.row; row <= r.end.row; row++)
    for (let col = r.start.col; col <= r.end.col; col++) out.push(toA1({ col, row }));
  return out;
}

export interface SheetRef {
  sheet: string | null;
  ref: string;
}

/** "전체!BS6", "'a 고실'!G1", "BS6" → {sheet, ref} */
export function parseSheetRef(s: string): SheetRef {
  const m = /^(?:'((?:[^']|'')+)'|([^'!]+))!(.+)$/.exec(s.trim());
  if (!m) return { sheet: null, ref: s.trim() };
  return { sheet: (m[1] ?? m[2])!.replace(/''/g, "'"), ref: m[3]!.replace(/\$/g, '') };
}

/** 수식 안의 문자열 리터럴("...")을 같은 길이의 공백으로 지워 참조 탐색 오인을 막는다. */
function blankStrings(f: string): string {
  return f.replace(/"(?:[^"]|"")*"/g, (m) => ' '.repeat(m.length));
}

const REF_RE =
  /(?:(?:'((?:[^']|'')+)'|([A-Za-z_À-￿][\w.À-￿-]*))!)?(\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?)(?![\w(])/g;

export interface FormulaRef {
  sheet: string | null;
  range: Range;
}

/** 수식이 참조하는 셀·범위 목록(외부 통합문서 참조 [n]는 sheet 이름에 남는다). */
export function formulaRefs(formula: string): FormulaRef[] {
  const f = blankStrings(formula);
  const out: FormulaRef[] = [];
  REF_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = REF_RE.exec(f))) {
    const prev = m.index > 0 ? f[m.index - 1]! : '';
    if (/[A-Za-z0-9_.]/.test(prev)) continue; // 함수명·이름의 일부
    const sheet = (m[1] ?? m[2])?.replace(/''/g, "'") ?? null;
    try {
      out.push({ sheet, range: parseRange(m[3]!.replace(/\$/g, '')) });
    } catch {
      /* 범위가 아니면 무시 */
    }
  }
  return out;
}

/**
 * 공유 수식(shared formula) 전개: 기준 셀의 수식을 대상 셀 위치만큼 옮긴다.
 * $가 붙은 부분은 고정, 문자열 리터럴은 건드리지 않는다.
 */
export function translateFormula(formula: string, from: string, to: string): string {
  const a = parseCoord(from);
  const b = parseCoord(to);
  const dc = b.col - a.col;
  const dr = b.row - a.row;
  if (dc === 0 && dr === 0) return formula;
  const parts = formula.split(/("(?:[^"]|"")*")/);
  return parts
    .map((part, idx) => {
      if (idx % 2 === 1) return part; // 문자열 리터럴
      return part.replace(
        /((?:'(?:[^']|'')+'|[A-Za-z_À-￿][\w.À-￿-]*)!)?(\$?)([A-Z]{1,3})(\$?)(\d+)(?![\w(])/g,
        (m, sheet: string | undefined, cAbs: string, col: string, rAbs: string, row: string, offset: number, whole: string) => {
          const prev = offset > 0 ? whole[offset - 1]! : '';
          if (/[A-Za-z0-9_.]/.test(prev) && !sheet) return m;
          const nc = cAbs ? col : indexToCol(colToIndex(col) + dc);
          const nr = rAbs ? row : String(Number(row) + dr);
          return `${sheet ?? ''}${cAbs}${nc}${rAbs}${nr}`;
        },
      );
    })
    .join('');
}

/** "B7:G7" 등 범위 목록을 셀 주소 목록으로 */
export function expandAll(refs: string[]): string[] {
  return refs.flatMap((r) => expandRange(r));
}

export function colOf(a1: string): string {
  return /^[A-Z]+/.exec(a1)![0];
}

export function rowOf(a1: string): number {
  return Number(/\d+$/.exec(a1)![0]);
}
