/** Crossref REST API (https://api.crossref.org). DOI 또는 제목만 보낸다. */
import { emptyRecord, type BiblioRecord } from './types.ts';
import { normDoi } from './match.ts';

export const CROSSREF_HOST = 'https://api.crossref.org';

/* eslint-disable @typescript-eslint/no-explicit-any */
function dateParts(raw: any): string {
  const p = raw?.['date-parts']?.[0];
  if (!Array.isArray(p) || !p.length || !p.every((v: unknown) => Number.isInteger(v))) return '';
  return p
    .slice(0, 3)
    .map((v: number, i: number) => (i === 0 ? String(v) : String(v).padStart(2, '0')))
    .join('-');
}

const first = (v: any): string => String((Array.isArray(v) ? v[0] : v) ?? '');

export function crossrefRecord(m: any): BiblioRecord {
  const r = emptyRecord('crossref');
  r.doi = normDoi(m.DOI);
  r.title = first(m.title);
  r.journal = first(m['container-title']);
  r.journalAliases = (m['short-container-title'] ?? []).map(String);
  r.issn = (m.ISSN ?? []).map(String);
  r.types = [String(m.type ?? '')].filter(Boolean);
  r.publicationStatus = String(m.subtype ?? '');
  r.volume = String(m.volume ?? '');
  r.issue = String(m.issue ?? '');
  r.pages = String(m.page ?? '');
  r.articleNumber = String(m['article-number'] ?? '');
  r.onlineDate = dateParts(m['published-online']);
  r.printDate = dateParts(m['published-print']);
  r.issueDate = dateParts(m['journal-issue']?.['published-print']);
  r.publishedDate = dateParts(m.published ?? m.issued);
  r.authorCount = Array.isArray(m.author) ? m.author.length : 0;
  return r;
}

// 검색 경로에서 쓸 수 있는 select 필드만(subtype·journal-issue는 DOI 경로에서만 옴)
const SELECT = 'DOI,title,container-title,short-container-title,ISSN,type,volume,issue,page,article-number,published-online,published-print,published,issued,author';

export function crossrefDoiUrl(doi: string, mailto: string): string {
  return `${CROSSREF_HOST}/works/${encodeURIComponent(normDoi(doi))}${mailto ? `?mailto=${encodeURIComponent(mailto)}` : ''}`;
}

export function crossrefTitleUrl(title: string, mailto: string, rows = 5): string {
  const q = new URLSearchParams({ 'query.bibliographic': title, rows: String(rows), select: SELECT });
  if (mailto) q.set('mailto', mailto);
  return `${CROSSREF_HOST}/works?${q.toString()}`;
}

export function parseCrossrefWork(body: string): BiblioRecord[] {
  const msg = JSON.parse(body)?.message;
  return msg ? [crossrefRecord(msg)] : [];
}

export function parseCrossrefSearch(body: string): BiblioRecord[] {
  const items = JSON.parse(body)?.message?.items;
  return Array.isArray(items) ? items.map(crossrefRecord) : [];
}
