/**
 * 저널 목록: KCI 등재(후보)지, 유관학회지 11종, 사용자가 불러온 SCIE 목록.
 * Clarivate SCIE 목록은 저장소에 넣지 않는다. 사용자가 고른 파일을 브라우저 안에서만 읽는다.
 */
import { loadWorkbook } from './xlsx/workbook.ts';

export interface JournalEntry {
  issn: string;
  eissn: string;
  name_ko?: string;
  name_en?: string;
  /** SCIE 목록의 경우 색인 구분(SCIE, ESCI 등) */
  status?: string;
  aliases?: string[];
}

export interface JournalList {
  source: string;
  as_of: string;
  journals: JournalEntry[];
}

export interface JournalLists {
  kci?: JournalList;
  related?: JournalList;
  scie?: JournalList;
}

export function normIssn(s: string | undefined): string {
  const v = (s ?? '').replace(/[^0-9Xx]/g, '').toUpperCase();
  return /^\d{7}[\dX]$/.test(v) ? v : '';
}

export function normJournalName(s: string | undefined): string {
  return (s ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/^the\s+/, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/** 별칭 파일(ISSN → 별칭 목록)을 목록 항목에 붙인다 */
export function applyAliases(list: JournalList, aliases: Record<string, string[]>): JournalList {
  const byIssn = new Map<string, string[]>();
  for (const [k, v] of Object.entries(aliases)) byIssn.set(normIssn(k), v);
  return {
    ...list,
    journals: list.journals.map((j) => {
      const extra = [...(byIssn.get(normIssn(j.issn)) ?? []), ...(byIssn.get(normIssn(j.eissn)) ?? [])];
      return extra.length ? { ...j, aliases: [...(j.aliases ?? []), ...extra] } : j;
    }),
  };
}

const STOP = new Set(['the', 'of', 'and', 'for', 'in', '&']);

function words(s: string | undefined): string[] {
  return (s ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !STOP.has(w));
}

/** ISO 약어 일치: 단어 수가 같고 각 단어가 접두어(예: 'otorhinolaryngol' ⊂ 'otorhinolaryngology') */
export function isAbbreviation(short: string | undefined, long: string | undefined): boolean {
  const a = words(short);
  const b = words(long);
  return a.length === b.length && a.length > 1 && a.every((w, i) => b[i]!.startsWith(w));
}

export class JournalIndex {
  private byIssn = new Map<string, JournalEntry>();
  private byName = new Map<string, JournalEntry>();
  constructor(readonly list: JournalList) {
    for (const j of list.journals) {
      for (const i of [j.issn, j.eissn]) if (normIssn(i)) this.byIssn.set(normIssn(i), j);
      for (const n of [j.name_ko, j.name_en, ...(j.aliases ?? [])]) {
        const k = normJournalName(n);
        if (k.length >= 3) this.byName.set(k, j);
      }
    }
  }
  get size(): number {
    return this.list.journals.length;
  }
  find(issns: string[], names: (string | undefined)[]): { entry: JournalEntry; by: 'issn' | 'name' } | null {
    for (const i of issns) {
      const e = this.byIssn.get(normIssn(i));
      if (e) return { entry: e, by: 'issn' };
    }
    for (const n of names) {
      const e = this.byName.get(normJournalName(n));
      if (e) return { entry: e, by: 'name' };
    }
    // 약어로 적은 경우(예: Korean J Otorhinolaryngol-Head Neck Surg)
    for (const n of names) {
      if (!n) continue;
      for (const j of this.list.journals)
        for (const full of [j.name_en, j.name_ko, ...(j.aliases ?? [])])
          if (isAbbreviation(n, full) || isAbbreviation(full, n)) return { entry: j, by: 'name' };
    }
    return null;
  }
}

/** RFC 4180 CSV(따옴표·줄바꿈 포함 칸) */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (q) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',' || ch === '\t') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const HEADER_PATTERNS: Record<'issn' | 'eissn' | 'name' | 'edition', RegExp> = {
  eissn: /^(e[-\s_]?issn|eissn|electronic\s*issn|온라인\s*issn|issn\s*\(?(전자|online|e)\)?)$/i,
  issn: /^(issn|p[-\s_]?issn|print\s*issn|issn\s*\(?(종이|print|p)\)?)$/i,
  name: /^(journal\s*(title|name)?|full\s*journal\s*title|title|source\s*title|저널\s*명?|학술지\s*명?|저널\s*이름|publication\s*name)$/i,
  edition: /^(edition|editions|index|database|category\s*index|색인|구분)$/i,
};

/**
 * 사용자가 고른 SCIE 목록 파일(엑셀·CSV)을 읽는다. 열 이름이 달라도 ISSN·eISSN·저널명 열을 찾는다.
 * 머리글은 앞 20행 안에서 찾는다.
 */
export async function parseJournalListFile(bytes: Uint8Array, fileName: string): Promise<JournalList> {
  let rows: string[][];
  if (/\.(xlsx)$/i.test(fileName)) {
    const wb = await loadWorkbook(bytes);
    const sheet = wb.sheets[0];
    if (!sheet) throw new Error('시트가 없습니다');
    const grid = new Map<number, string[]>();
    for (const c of sheet.cells.values()) {
      const r = grid.get(c.row) ?? [];
      r[c.col - 1] = c.value === null ? '' : String(c.value);
      grid.set(c.row, r);
    }
    rows = [...grid.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => Array.from(r, (v) => v ?? ''));
  } else if (/\.(csv|txt|tsv)$/i.test(fileName)) {
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      text = new TextDecoder('euc-kr').decode(bytes);
    }
    rows = parseCsv(text);
  } else throw new Error('엑셀(.xlsx) 또는 CSV 파일만 불러올 수 있습니다.');

  for (let h = 0; h < Math.min(20, rows.length); h++) {
    const header = rows[h]!.map((x) => x.trim());
    const find = (k: keyof typeof HEADER_PATTERNS) => header.findIndex((x) => HEADER_PATTERNS[k].test(x));
    const iI = find('issn');
    const iE = find('eissn');
    const iN = find('name');
    const iD = find('edition');
    if ((iI < 0 && iE < 0) || iN < 0) continue;
    const journals: JournalEntry[] = [];
    for (const r of rows.slice(h + 1)) {
      const e: JournalEntry = { issn: normIssn(r[iI] ?? ''), eissn: normIssn(r[iE] ?? ''), name_en: (r[iN] ?? '').trim() };
      if (iD >= 0) e.status = (r[iD] ?? '').trim();
      if (e.issn || e.eissn || e.name_en) journals.push(e);
    }
    if (journals.length === 0) break;
    return { source: fileName, as_of: '', journals };
  }
  throw new Error('ISSN(또는 eISSN)과 저널명 열을 찾지 못했습니다. 첫 줄에 열 이름이 있는지 확인하세요.');
}
