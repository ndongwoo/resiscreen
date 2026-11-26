/** 가짜 서지 응답(테스트 전용). 실제 네트워크를 쓰지 않는다. */
import type { FetchLike } from '../../src/engine/biblio/throttle.ts';
import type { BiblioSettings } from '../../src/engine/biblio/types.ts';

export const resp = (status: number, body = '') => ({ status, ok: status >= 200 && status < 300, text: async () => body });

export const SETTINGS: BiblioSettings = {
  mailto: 'test@example.org',
  sources: ['crossref', 'pubmed'],
  domestic_prefer: 'crossref',
  max_requests_per_second: 1000,
  crossref_max_concurrent: 2,
  retries: 3,
  backoff_ms: [1, 1, 1],
  timeout_ms: 2000,
  cache_ttl_days: 30,
  title_match: { min_similarity: 0.9, require_year_match: true, require_journal_match: true },
};

export function crossrefItem(o: Record<string, unknown> = {}) {
  return { DOI: '10.1234/a', title: ['Synthetic study number 1'], 'container-title': ['Journal of Synthetic Testing'], ISSN: ['1111-1111'], type: 'journal-article', volume: '3', issue: '1', page: '10-20', 'published-print': { 'date-parts': [[2025, 3]] }, ...o };
}

/** URL 호스트별로 응답을 돌려주는 가짜 fetch. 호출 URL을 기록한다(전송 내용 확인용) */
export function fakeFetch(handlers: { crossref?: (url: string) => ReturnType<typeof resp>; pubmed?: (url: string) => ReturnType<typeof resp> }) {
  const calls: string[] = [];
  const f: FetchLike = async (url) => {
    calls.push(url);
    if (url.startsWith('https://api.crossref.org')) {
      if (!handlers.crossref) throw new TypeError('Failed to fetch');
      return handlers.crossref(url);
    }
    if (url.startsWith('https://eutils.ncbi.nlm.nih.gov')) {
      if (!handlers.pubmed) throw new TypeError('Failed to fetch');
      return handlers.pubmed(url);
    }
    throw new Error(`허용하지 않은 호스트: ${url}`);
  };
  return { f, calls };
}

export const crossrefSearch = (items: unknown[]) => resp(200, JSON.stringify({ message: { items } }));
export const pubmedEmpty = () => resp(200, JSON.stringify({ esearchresult: { idlist: [] } }));

