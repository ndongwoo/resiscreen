/**
 * 서지 대조 로직(ResiReview engine/bibliography*.py를 TypeScript로 다시 작성). 입출력 없음.
 * - 제목 정규화(NFKC → 소문자 → 영숫자 외 공백), difflib SequenceMatcher.ratio 이식
 * - 저널 일치(ISSN, 괄호·부제 제거 핵심명, 단어별 약어)
 * - 정식 출판일 판정(인쇄일 → 권호 발행일(선출판 제외) → 온라인 전용 권·쪽/논문번호)
 */
import type { BiblioRecord } from './types.ts';

/** Crossref·PubMed 제목의 마크업(<i>, <sup>, <scp>, MathML 등)과 엔티티 제거 */
export function stripMarkup(s: string): string {
  return s
    .replace(/<[^>]{1,200}>/g, ' ')
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, ' ')
    .replace(/[®™©]/g, ' ');
}

export function norm(s: string | undefined | null): string {
  return stripMarkup(s ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

export function normDoi(s: string | undefined | null): string {
  return (s ?? '')
    .trim()
    .replace(/^(?:doi:\s*|https?:\/\/(?:dx\.)?doi\.org\/)/i, '')
    .replace(/[.,;]+$/, '')
    .toLowerCase();
}

export function validDoi(s: string | undefined | null): boolean {
  return /^10\.\d{4,9}\/[^\s<>"\\]+$/.test(normDoi(s));
}

/** Python difflib.SequenceMatcher(None, a, b).ratio() 이식(autojunk 포함) */
export function ratio(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  const b2j = new Map<string, number[]>();
  for (let i = 0; i < b.length; i++) {
    const ch = b[i]!;
    const arr = b2j.get(ch);
    if (arr) arr.push(i);
    else b2j.set(ch, [i]);
  }
  if (b.length >= 200) {
    const ntest = Math.floor(b.length / 100) + 1;
    for (const [ch, idx] of [...b2j.entries()]) if (idx.length > ntest) b2j.delete(ch);
  }
  const longest = (alo: number, ahi: number, blo: number, bhi: number): [number, number, number] => {
    let besti = alo;
    let bestj = blo;
    let bestsize = 0;
    let j2len = new Map<number, number>();
    for (let i = alo; i < ahi; i++) {
      const next = new Map<number, number>();
      for (const j of b2j.get(a[i]!) ?? []) {
        if (j < blo) continue;
        if (j >= bhi) break;
        const k = (j2len.get(j - 1) ?? 0) + 1;
        next.set(j, k);
        if (k > bestsize) {
          besti = i - k + 1;
          bestj = j - k + 1;
          bestsize = k;
        }
      }
      j2len = next;
    }
    // difflib과 같이 양쪽으로 늘린다(autojunk로 b2j에서 빠진 '흔한 글자'도 여기서 맞춘다)
    while (besti > alo && bestj > blo && a[besti - 1] === b[bestj - 1]) {
      besti--;
      bestj--;
      bestsize++;
    }
    while (besti + bestsize < ahi && bestj + bestsize < bhi && a[besti + bestsize] === b[bestj + bestsize]) bestsize++;
    return [besti, bestj, bestsize];
  };
  let matches = 0;
  const queue: [number, number, number, number][] = [[0, a.length, 0, b.length]];
  while (queue.length) {
    const [alo, ahi, blo, bhi] = queue.pop()!;
    const [i, j, k] = longest(alo, ahi, blo, bhi);
    if (k) {
      matches += k;
      if (alo < i && blo < j) queue.push([alo, i, blo, j]);
      if (i + k < ahi && j + k < bhi) queue.push([i + k, ahi, j + k, bhi]);
    }
  }
  return (2 * matches) / (a.length + b.length);
}

export function titleSimilarity(a: string | undefined, b: string | undefined): number {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  return x === y ? 1 : ratio(x, y);
}

export function similar(a: string | undefined, b: string | undefined, min = 0.9): boolean {
  return titleSimilarity(a, b) >= min;
}

const STOP = new Set(['the', 'of', 'and', 'for']);

/** 저널 이름(또는 ISSN)이 같은 학술지를 가리키는지 */
export function journalMatch(submitted: string | undefined, rec: Pick<BiblioRecord, 'journal' | 'journalAliases' | 'issn'>, submittedIssns: string[] = []): boolean {
  const issn = (x: string) => x.replace(/[^0-9X]/gi, '').toUpperCase();
  const mine = new Set(submittedIssns.map(issn).filter(Boolean));
  if (rec.issn.some((i) => mine.has(issn(i)))) return true;
  const core = (s: string | undefined) => norm((s ?? '').replace(/\([^)]*\)/g, '').split(/[:：]/)[0]);
  const abbreviation = (x: string | undefined, y: string | undefined) => {
    const aa = norm(x).split(' ').filter((w) => w && !STOP.has(w));
    const bb = norm(y).split(' ').filter((w) => w && !STOP.has(w));
    return aa.length === bb.length && aa.length > 1 && aa.every((w, i) => w === bb[i] || bb[i]!.startsWith(w));
  };
  for (const name of [rec.journal, ...rec.journalAliases]) {
    if (!name) continue;
    const a = core(submitted);
    const b = core(name);
    if (similar(submitted, name)) return true;
    if (a && b && (a === b || new RegExp(`(?:^| )${escapeRe(a)}(?: |$)`).test(b) || new RegExp(`(?:^| )${escapeRe(b)}(?: |$)`).test(a))) return true;
    if (abbreviation(submitted, name) || abbreviation(name, submitted)) return true;
  }
  return false;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 'YYYY', 'YYYY-MM', 'YYYY-MM-DD' → [시작, 끝] 날짜 문자열 */
export function dateInterval(raw: string | undefined): [string, string] | null {
  const m = /^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/.exec(raw ?? '');
  if (!m) return null;
  const y = Number(m[1]);
  if (!m[2]) return [`${y}-01-01`, `${y}-12-31`];
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  const mm = String(mo).padStart(2, '0');
  if (!m[3]) {
    const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    return [`${y}-${mm}-01`, `${y}-${mm}-${last}`];
  }
  const d = Number(m[3]);
  const dd = String(d).padStart(2, '0');
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1) return null;
  return [`${y}-${mm}-${dd}`, `${y}-${mm}-${dd}`];
}

export interface FormalDate {
  date: string;
  kind: '인쇄일' | '권호 발행일' | '온라인 전용 권·쪽 발행일' | '미확인';
}

/** 정식 출판일. Crossref의 일반 published 날짜만으로는 정식 출판으로 보지 않는다(ResiReview v3.5). */
export function formalDate(r: BiblioRecord): FormalDate {
  if (dateInterval(r.printDate)) return { date: r.printDate, kind: '인쇄일' };
  if (r.publicationStatus !== 'aheadofprint' && dateInterval(r.issueDate)) return { date: r.issueDate, kind: '권호 발행일' };
  const issued = Boolean(r.volume && (r.pages || r.articleNumber));
  if (issued && r.publicationStatus !== 'aheadofprint') {
    const d = r.source === 'crossref' ? r.publishedDate : r.publicationStatus === 'epublish' ? r.onlineDate : '';
    if (dateInterval(d)) return { date: d, kind: '온라인 전용 권·쪽 발행일' };
  }
  return { date: '', kind: '미확인' };
}

/** 정식 출판 근거(권·호·쪽·논문번호·인쇄일, 또는 PubMed ppublish/epublish) */
export function hasFormalEvidence(r: BiblioRecord): boolean {
  return Boolean(r.volume || r.issue || r.pages || r.articleNumber || r.printDate) || (r.source === 'pubmed' && ['ppublish', 'epublish'].includes(r.publicationStatus));
}

export function recordYears(r: BiblioRecord): number[] {
  return [r.printDate, r.issueDate, r.onlineDate, r.publishedDate]
    .map((d) => Number((d ?? '').slice(0, 4)))
    .filter((y) => y > 1900);
}

/** 쪽 수(예: '123-124' → 2, 'e123' → null) */
export function pageCount(pages: string): number | null {
  const m = /^(\d+)\s*[-–]\s*(\d+)$/.exec(pages.trim());
  if (!m) return /^\d+$/.test(pages.trim()) ? 1 : null;
  const a = Number(m[1]);
  let b = Number(m[2]);
  // '1234-36' 처럼 줄여 쓴 끝쪽
  if (b < a && m[2]!.length < m[1]!.length) b = Number(m[1]!.slice(0, m[1]!.length - m[2]!.length) + m[2]);
  return b >= a ? b - a + 1 : null;
}
