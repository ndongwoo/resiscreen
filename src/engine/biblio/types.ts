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
  cache_ttl_days: number;
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
