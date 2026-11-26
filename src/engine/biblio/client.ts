/**
 * 논문 한 편 조회: DOI가 있으면 DOI를 먼저, 없으면 제목 검색.
 * 국내지는 Crossref를 먼저 조회하고 확신 있게 맞으면 PubMed는 건너뛴다. 해외지는 둘 다 조회한다.
 * 결과는 DOI·제목 기준으로 캐시한다(공개 서지 정보만).
 */
import { BiblioCache } from './cache.ts';
import { crossrefDoiUrl, crossrefTitleUrl, parseCrossrefSearch, parseCrossrefWork } from './crossref.ts';
import { doiTerm, efetchUrl, esearchUrl, parseEfetch, parseEsearch, titleTerm } from './pubmed.ts';
import { hasFormalEvidence, journalMatch, norm, normDoi, recordYears, titleSimilarity, validDoi } from './match.ts';
import { errorCode, Scheduler, type FetchLike, type SchedulerOptions } from './throttle.ts';
import type { BiblioRecord, BiblioSettings, SourceResult } from './types.ts';

/** 외부 조회를 허용하는 호스트(index.html CSP connect-src와 같게 유지) */
export const ALLOWED_HOSTS = ['api.crossref.org', 'eutils.ncbi.nlm.nih.gov'];

/**
 * 캐시 형식 버전. 매칭·판정 로직이나 저장 형식이 바뀌면 올린다(옛 캐시 항목은 키가 달라 쓰이지 않고,
 * 기한이 지나거나 항목 수 상한을 넘으면 prune으로 지워진다).
 */
export const CACHE_FORMAT_VERSION = 2;

export function cacheKey(source: 'crossref' | 'pubmed', kind: 'doi' | 'title', value: string): string {
  return `v${CACHE_FORMAT_VERSION}:${source}:${kind}:${value}`;
}

/** 캐시 결과 종류: 정식 출판(권·호·쪽 등) / Epub·온라인 선출판 / 찾지 못함 */
export type CacheKind = 'formal' | 'epub' | 'not_found';

interface CachedValue {
  kind: CacheKind;
  records: BiblioRecord[];
}

export interface LookupOptions {
  /** 캐시를 무시하고 다시 조회(결과는 새로 저장) */
  bypassCache?: boolean;
}

export interface PaperQuery {
  title: string;
  /** 논문 실적 연도(양식 연도에서 계산). 없으면 클라이언트 기본값 */
  paperYear?: number;
  journal: string;
  doi: string;
  claimedYear: number | null;
  domestic: boolean;
}

export interface ScoredCandidate {
  record: BiblioRecord;
  similarity: number;
  yearOk: boolean;
  journalOk: boolean;
  matched: boolean;
}

export interface LookupResult {
  status: 'matched' | 'uncertain' | 'not_found' | 'failed' | 'cancelled';
  sources: SourceResult[];
  matched: ScoredCandidate[];
  best?: ScoredCandidate;
  /** DOI로 찾은 서지의 제목이 엑셀과 다름 */
  doiTitleMismatch?: boolean;
}

export interface SourceStats {
  /** 조회 결과: 찾음 / 없음 / 실패(재시도 후) */
  ok: number;
  notFound: number;
  error: number;
  /** 실제로 보낸 HTTP 요청 수와 그중 재시도 수, 캐시 적중 수 */
  requests: number;
  retries: number;
  cacheHits: number;
  /** 재시도 사유별 수(http_429, http_503, timeout, network) */
  retryReasons?: Record<string, number>;
}

export function emptySourceStats(): SourceStats {
  return { ok: 0, notFound: 0, error: 0, requests: 0, retries: 0, cacheHits: 0 };
}

export class BiblioClient {
  /** 출처별 요청 간격 제어(Crossref·PubMed는 요청 한도가 따로다) */
  readonly schedulers: Record<'crossref' | 'pubmed', Scheduler>;
  readonly stats: Record<'crossref' | 'pubmed', SourceStats> = { crossref: emptySourceStats(), pubmed: emptySourceStats() };
  constructor(
    fetchFn: FetchLike,
    readonly settings: BiblioSettings,
    readonly cache: BiblioCache,
    /** 기본 논문 실적 연도(질의에 paperYear가 없을 때만 씀) */
    readonly paperYear: number = 0,
    /** 이번 실행에서 Crossref mailto로 쓸 연락처(웹: 사용자가 입력한 값). 없으면 settings.mailto */
    private readonly contact: string = settings.mailto,
    /** 테스트용 시계 */
    hooks: Pick<SchedulerOptions, 'sleep' | 'now'> = {},
  ) {
    const make = (concurrent: number, rps: number) =>
      new Scheduler(fetchFn, {
        ...hooks,
        maxRequestsPerSecond: Math.min(rps, settings.max_requests_per_second),
        maxConcurrent: { crossref: concurrent, pubmed: concurrent },
        retries: settings.retries,
        backoffMs: settings.backoff_ms,
        timeoutMs: settings.timeout_ms,
        allowedHosts: ALLOWED_HOSTS,
      });
    const rps = (k: 'crossref' | 'pubmed') => settings.source_rps?.[k] ?? settings.max_requests_per_second;
    this.schedulers = { crossref: make(settings.crossref_max_concurrent, rps('crossref')), pubmed: make(1, rps('pubmed')) };
  }

  /** 요청·재시도 수를 스케줄러에서 모아 돌려준다 */
  snapshot(): Record<'crossref' | 'pubmed', SourceStats> {
    for (const k of ['crossref', 'pubmed'] as const) {
      this.stats[k].requests = this.schedulers[k].stats.requests;
      this.stats[k].retries = this.schedulers[k].stats.retries;
      this.stats[k].retryReasons = { ...this.schedulers[k].stats.retryReasons };
    }
    return structuredClone(this.stats);
  }

  /** 캐시에서 읽기(무시 옵션이면 건너뜀). 저장은 lookup()이 매칭 뒤 결과 종류별 TTL로 한다 */
  private async fromCache(source: 'crossref' | 'pubmed', key: string, bypass: boolean): Promise<SourceResult | null> {
    if (bypass) return null;
    const hit = await this.cache.getEntry<CachedValue>(key);
    if (!hit || !Array.isArray(hit.v?.records)) return null;
    this.stats[source].cacheHits++;
    const records = hit.v.records;
    return { source, status: records.length ? 'ok' : 'not_found', records, cache: 'hit', fetchedAt: new Date(hit.t).toISOString().slice(0, 10), cacheKey: key };
  }

  async crossref(q: PaperQuery, signal?: AbortSignal, opts: LookupOptions = {}): Promise<SourceResult> {
    // 연락처는 요청 URL에만 쓰고 캐시 키·결과에는 넣지 않는다
    const key = validDoi(q.doi) ? cacheKey('crossref', 'doi', normDoi(q.doi)) : cacheKey('crossref', 'title', norm(q.title));
    const hit = await this.fromCache('crossref', key, Boolean(opts.bypassCache));
    if (hit) return this.count(hit);
    try {
      const mail = this.contact;
      let records: BiblioRecord[];
      if (validDoi(q.doi)) {
        const body = await this.schedulers.crossref.get('crossref', crossrefDoiUrl(q.doi, mail), signal);
        records = body === null ? [] : parseCrossrefWork(body);
      } else {
        const body = await this.schedulers.crossref.get('crossref', crossrefTitleUrl(q.title, mail), signal);
        records = body === null ? [] : parseCrossrefSearch(body);
      }
      return this.count({ source: 'crossref', status: records.length ? 'ok' : 'not_found', records, cache: 'fresh', cacheKey: key });
    } catch (e) {
      return this.count({ source: 'crossref', status: 'error', records: [], error: errorCode(e), cache: 'fresh' });
    }
  }

  async pubmed(q: PaperQuery, signal?: AbortSignal, opts: LookupOptions = {}): Promise<SourceResult> {
    const key = validDoi(q.doi) ? cacheKey('pubmed', 'doi', normDoi(q.doi)) : cacheKey('pubmed', 'title', norm(q.title));
    const hit = await this.fromCache('pubmed', key, Boolean(opts.bypassCache));
    if (hit) return this.count(hit);
    try {
      // E-utilities에는 tool=resiscreen과 학회 연락처(설정값)를 고정으로 보낸다
      const mail = this.settings.pubmed_email ?? this.settings.mailto;
      const term = validDoi(q.doi) ? doiTerm(q.doi) : titleTerm(q.title);
      const body = await this.schedulers.pubmed.get('pubmed', esearchUrl(term, mail), signal);
      const ids = body === null ? [] : parseEsearch(body);
      let records: BiblioRecord[] = [];
      if (ids.length) {
        const xml = await this.schedulers.pubmed.get('pubmed', efetchUrl(ids, mail), signal);
        records = xml === null ? [] : parseEfetch(xml);
      }
      return this.count({ source: 'pubmed', status: records.length ? 'ok' : 'not_found', records, cache: 'fresh', cacheKey: key });
    } catch (e) {
      return this.count({ source: 'pubmed', status: 'error', records: [], error: errorCode(e), cache: 'fresh' });
    }
  }

  /** 결과 종류별 유효 기간(일). 네트워크 오류·시간 초과·취소는 저장하지 않는다(null) */
  ttlFor(kind: CacheKind | null): number | null {
    if (!kind) return null;
    const t = this.settings.cache_ttl ?? {};
    const d = { formal: 30, epub: 3, not_found: 1 };
    return t[kind] ?? d[kind];
  }

  /** 새로 조회한 출처 결과를 매칭 결과에 따라 저장한다 */
  private async store(res: SourceResult, matched: ScoredCandidate[]): Promise<void> {
    if (res.cache !== 'fresh' || res.status === 'error' || !res.cacheKey) return;
    const mine = matched.filter((m) => m.record.source === res.source).map((m) => m.record);
    const kind: CacheKind = mine.length === 0 ? 'not_found' : mine.some(hasFormalEvidence) ? 'formal' : 'epub';
    const ttl = this.ttlFor(kind);
    if (ttl === null) return;
    const value: CachedValue = { kind, records: res.records };
    await this.cache.set(res.cacheKey, value, ttl);
  }

  private count(r: SourceResult): SourceResult {
    if (r.error === 'cancelled') return r;
    const s = this.stats[r.source];
    if (r.status === 'ok') s.ok++;
    else if (r.status === 'not_found') s.notFound++;
    else s.error++;
    return r;
  }

  score(q: PaperQuery, r: BiblioRecord): ScoredCandidate {
    const tm = this.settings.title_match;
    const similarity = titleSimilarity(q.title, r.title);
    const years = new Set([q.paperYear ?? this.paperYear, ...(q.claimedYear ? [q.claimedYear] : [])]);
    const yearOk = recordYears(r).some((y) => years.has(y));
    const journalOk = journalMatch(q.journal, r);
    const byDoi = validDoi(q.doi) && normDoi(q.doi) === r.doi;
    const matched = byDoi
      ? similarity >= tm.min_similarity
      : similarity >= tm.min_similarity && (yearOk || !tm.require_year_match) && (journalOk || !tm.require_journal_match);
    return { record: r, similarity, yearOk, journalOk, matched };
  }

  async lookup(q: PaperQuery, signal?: AbortSignal, opts: LookupOptions = {}): Promise<LookupResult> {
    const enabled = this.settings.sources;
    const order: ('crossref' | 'pubmed')[] = q.domestic
      ? [this.settings.domestic_prefer, this.settings.domestic_prefer === 'crossref' ? 'pubmed' : 'crossref']
      : ['crossref', 'pubmed'];
    const sources: SourceResult[] = [];
    let scored: ScoredCandidate[] = [];
    const run = (src: 'crossref' | 'pubmed') => (src === 'crossref' ? this.crossref(q, signal, opts) : this.pubmed(q, signal, opts));
    const active = order.filter((s) => enabled.includes(s));
    if (q.domestic) {
      // 국내지: 우선 출처에서 확신 있게 맞으면 다른 출처를 조회하지 않는다
      for (const src of active) {
        if (signal?.aborted) break;
        const res = await run(src);
        sources.push(res);
        scored = scored.concat(res.records.map((r) => this.score(q, r)));
        if (scored.some((s) => s.matched)) break;
      }
    } else {
      // 해외지: 출처별 요청 한도가 따로라 동시에 조회한다
      const results = await Promise.all(active.map(run));
      for (const res of results) {
        sources.push(res);
        scored = scored.concat(res.records.map((r) => this.score(q, r)));
      }
    }
    if (sources.some((s) => s.error === 'cancelled')) return { status: 'cancelled', sources, matched: [] };
    if (signal?.aborted) return { status: 'cancelled', sources, matched: [] };
    const matched = scored.filter((s) => s.matched);
    for (const res of sources) await this.store(res, matched);
    const best = [...scored].sort((a, b) => b.similarity - a.similarity)[0];
    const doiTitleMismatch = validDoi(q.doi) && scored.some((s) => s.record.doi === normDoi(q.doi) && !s.matched);
    if (matched.length) return { status: 'matched', sources, matched, best: matched[0], doiTitleMismatch };
    if (sources.length && sources.every((s) => s.status === 'error')) return { status: 'failed', sources, matched };
    if (best && best.similarity >= 0.5) return { status: 'uncertain', sources, matched, best, doiTitleMismatch };
    if (sources.some((s) => s.status === 'error')) return { status: 'failed', sources, matched };
    return { status: 'not_found', sources, matched, doiTitleMismatch };
  }
}
