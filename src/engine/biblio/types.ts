/** 공개 서지 정보만 담는다(저자 이름·소속은 저장하지 않고 수만 센다). */
export interface BiblioRecord {
  source: 'crossref' | 'pubmed';
  doi: string;
  pmid: string;
  title: string;
  journal: string;
  journalAliases: string[];
  issn: string[];
  types: string[];
  publicationStatus: string;
  volume: string;
  issue: string;
  pages: string;
  articleNumber: string;
  onlineDate: string;
  printDate: string;
  issueDate: string;
  publishedDate: string;
  authorCount: number;
  /** PubMed EqualContrib="Y" 저자 수(공동 기여 표시) */
  equalContribCount: number;
}

export type LookupStatus = 'ok' | 'not_found' | 'error';

export interface SourceResult {
  source: 'crossref' | 'pubmed';
  status: LookupStatus;
  records: BiblioRecord[];
  /** 실패 사유(네트워크, 시간 초과, HTTP 코드). URL·응답 본문은 담지 않는다 */
  error?: string;
  /** 캐시에서 읽었는지(hit) 새로 조회했는지(fresh) */
  cache?: 'hit' | 'fresh';
  /** 캐시에서 읽은 경우 원래 조회한 날짜(YYYY-MM-DD) */
  fetchedAt?: string;
  /** 캐시 키(내부용, 결과에는 넣지 않음) */
  cacheKey?: string;
}

export interface BiblioSettings {
  /** Crossref mailto 기본값(CLI). 웹은 사용자가 입력한 연락처를 쓴다 */
  mailto: string;
  /** PubMed E-utilities email(고정) */
  pubmed_email?: string;
  sources: ('crossref' | 'pubmed')[];
  domestic_prefer: 'crossref' | 'pubmed';
  max_requests_per_second: number;
  /** 출처별 초당 요청 수(없으면 max_requests_per_second) */
  source_rps?: Partial<Record<'crossref' | 'pubmed', number>>;
  crossref_max_concurrent: number;
  retries: number;
  backoff_ms: number[];
  timeout_ms: number;
  /** 기본 유효 기간(일). 0이면 캐시를 쓰지 않는다 */
  cache_ttl_days: number;
  /** 결과 종류별 유효 기간(일): 정식 출판, Epub·선출판, 찾지 못함 */
  cache_ttl?: Partial<Record<'formal' | 'epub' | 'not_found', number>>;
  /** 캐시 항목 수 상한(넘으면 오래된 것부터 지움) */
  cache_max_entries?: number;
  /** 동시에 조회할 논문 수 */
  paper_concurrency?: number;
  title_match: { min_similarity: number; require_year_match: boolean; require_journal_match: boolean; below_threshold?: string };
}

export function emptyRecord(source: BiblioRecord['source']): BiblioRecord {
  return {
    source,
    doi: '',
    pmid: '',
    title: '',
    journal: '',
    journalAliases: [],
    issn: [],
    types: [],
    publicationStatus: '',
    volume: '',
    issue: '',
    pages: '',
    articleNumber: '',
    onlineDate: '',
    printDate: '',
    issueDate: '',
    publishedDate: '',
    authorCount: 0,
    equalContribCount: 0,
  };
}
