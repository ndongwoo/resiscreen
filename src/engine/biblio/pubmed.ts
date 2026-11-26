/** NCBI E-utilities(PubMed). API 키는 쓰지 않는다(브라우저에 노출되므로). */
import { emptyRecord, type BiblioRecord } from './types.ts';
import { child, children, descendants, parseXml, textContent, type XmlElement } from '../xlsx/xml.ts';
import { normDoi } from './match.ts';

export const EUTILS_HOST = 'https://eutils.ncbi.nlm.nih.gov';

function base(email: string): Record<string, string> {
  const p: Record<string, string> = { tool: 'resiscreen' };
  if (email) p['email'] = email;
  return p;
}

export function esearchUrl(term: string, email: string, retmax = 5): string {
  const q = new URLSearchParams({ db: 'pubmed', term, retmode: 'json', retmax: String(retmax), ...base(email) });
  return `${EUTILS_HOST}/entrez/eutils/esearch.fcgi?${q.toString()}`;
}

export function efetchUrl(ids: string[], email: string): string {
  const q = new URLSearchParams({ db: 'pubmed', id: ids.join(','), retmode: 'xml', ...base(email) });
  return `${EUTILS_HOST}/entrez/eutils/efetch.fcgi?${q.toString()}`;
}

/** 제목 검색어: PubMed 구문 기호를 지우고 [Title] 필드로 */
export function titleTerm(title: string): string {
  return `${title.replace(/["[\]()]/g, ' ').replace(/\s+/g, ' ').trim()}[Title]`;
}

export function doiTerm(doi: string): string {
  return `"${normDoi(doi).replace(/"/g, '')}"[DOI]`;
}

export function parseEsearch(body: string): string[] {
  const ids = JSON.parse(body)?.esearchresult?.idlist;
  if (!Array.isArray(ids)) throw new Error('PubMed 검색 응답 형식이 아닙니다');
  return ids.map(String).filter((i) => /^\d+$/.test(i)).slice(0, 5);
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const txt = (el: XmlElement | undefined) => (el ? textContent(el).replace(/\s+/g, ' ').trim() : '');

export function pubDate(el: XmlElement | undefined): string {
  if (!el) return '';
  const y = txt(child(el, 'Year'));
  if (!/^\d{4}$/.test(y)) {
    const m = /\b(19|20)\d\d\b/.exec(txt(child(el, 'MedlineDate')));
    return m ? m[0] : '';
  }
  const mo = txt(child(el, 'Month'));
  const month = /^\d+$/.test(mo) && Number(mo) >= 1 && Number(mo) <= 12 ? Number(mo) : MONTHS[mo.slice(0, 3).toLowerCase()];
  const d = txt(child(el, 'Day'));
  return y + (month ? `-${String(month).padStart(2, '0')}` : '') + (month && /^\d+$/.test(d) ? `-${String(Number(d)).padStart(2, '0')}` : '');
}

export function parseEfetch(body: string): BiblioRecord[] {
  const root = parseXml(body);
  const out: BiblioRecord[] = [];
  for (const art of descendants(root, 'PubmedArticle')) {
    const mc = child(art, 'MedlineCitation');
    const a = child(mc, 'Article');
    if (!a) continue;
    const r = emptyRecord('pubmed');
    const ids = children(child(child(art, 'PubmedData'), 'ArticleIdList'), 'ArticleId');
    r.doi = normDoi(txt(ids.find((x) => x.attrs['IdType'] === 'doi')));
    r.pmid = txt(child(mc, 'PMID'));
    r.title = txt(child(a, 'ArticleTitle'));
    const journal = child(a, 'Journal');
    r.journal = txt(child(journal, 'Title'));
    r.journalAliases = [txt(child(journal, 'ISOAbbreviation')), txt(child(child(mc, 'MedlineJournalInfo'), 'MedlineTA'))].filter(Boolean);
    r.issn = [...children(journal, 'ISSN').map(txt), txt(child(child(mc, 'MedlineJournalInfo'), 'ISSNLinking'))].filter(Boolean);
    r.types = children(child(a, 'PublicationTypeList'), 'PublicationType').map(txt);
    r.publicationStatus = txt(child(child(art, 'PubmedData'), 'PublicationStatus'));
    const ji = child(journal, 'JournalIssue');
    r.volume = txt(child(ji, 'Volume'));
    r.issue = txt(child(ji, 'Issue'));
    r.pages = txt(child(child(a, 'Pagination'), 'MedlinePgn'));
    r.onlineDate = pubDate(children(a, 'ArticleDate').find((d) => (d.attrs['DateType'] ?? 'Electronic') === 'Electronic'));
    r.issueDate = pubDate(child(ji, 'PubDate'));
    r.printDate = ji?.attrs['CitedMedium'] === 'Print' ? r.issueDate : '';
    const authors = children(child(a, 'AuthorList'), 'Author');
    r.authorCount = authors.length;
    r.equalContribCount = authors.filter((x) => x.attrs['EqualContrib'] === 'Y').length;
    out.push(r);
  }
  return out;
}
