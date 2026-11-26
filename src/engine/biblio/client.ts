/**
 * 논문 한 편 조회: DOI가 있으면 DOI를 먼저, 없으면 제목 검색.
 * 국내지는 Crossref를 먼저 조회하고 확신 있게 맞으면 PubMed는 건너뛴다. 해외지는 둘 다 조회한다.
 * 결과는 DOI·제목 기준으로 캐시한다(공개 서지 정보만).
 */
import { BiblioCache } from './cache.ts';
import { crossrefDoiUrl, crossrefTitleUrl, parseCrossrefSearch, parseCrossrefWork } from './crossref.ts';
import { doiTerm, efetchUrl, esearchUrl, parseEfetch, parseEsearch, titleTerm } from './pubmed.ts';
import { journalMatch, norm, normDoi, recordYears, titleSimilarity, validDoi } from './match.ts';
import { errorCode, Scheduler, type FetchLike, type SchedulerOptions } from './throttle.ts';
import type { BiblioRecord, BiblioSettings, SourceResult } from './types.ts';

/** 외부 조회를 허용하는 호스트(index.html CSP connect-src와 같게 유지) */
export const ALLOWED_HOSTS = ['api.crossref.org', 'eutils.ncbi.nlm.nih.gov'];

export interface PaperQuery {
  title: string;
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
    readonly paperYear: number,
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

  private async cached(source: 'crossref' | 'pubmed', key: string, load: () => Promise<BiblioRecord[] | null>): Promise<BiblioRecord[]> {
    const hit = await this.cache.get<BiblioRecord[]>(key);
    if (hit) {
      this.stats[source].cacheHits++;
      return hit;
    }
    const v = (await load()) ?? [];
    await this.cache.set(key, v); // 빈 결과(없음)도 저장. 오류는 예외라 저장되지 않는다
    return v;
  }

  async crossref(q: PaperQuery, signal?: AbortSignal): Promise<SourceResult> {
    try {
      // 연락처는 요청 URL에만 쓰고 캐시 키·결과에는 넣지 않는다
      const mail = this.contact;
      const records = validDoi(q.doi)
        ? await this.cached('crossref', `crossref:doi:${normDoi(q.doi)}`, async () => {
            const body = await this.schedulers.crossref.get('crossref', crossrefDoiUrl(q.doi, mail), signal);
            return body === null ? [] : parseCrossrefWork(body);
          })
        : await this.cached('crossref', `crossref:title:${norm(q.title)}`, async () => {
            const body = await this.schedulers.crossref.get('crossref', crossrefTitleUrl(q.title, mail), signal);
            return body === null ? [] : parseCrossrefSearch(body);
          });
      return this.count({ source: 'crossref', status: records.length ? 'ok' : 'not_found', records });
    } catch (e) {
      return this.count({ source: 'crossref', status: 'error', records: [], error: errorCode(e) });
    }
  }

  async pubmed(q: PaperQuery, signal?: AbortSignal): Promise<SourceResult> {
    try {
      // E-utilities에는 tool=resiscreen과 학회 연락처(설정값)를 고정으로 보낸다
      const mail = this.settings.pubmed_email ?? this.settings.mailto;
      const key = validDoi(q.doi) ? `pubmed:doi:${normDoi(q.doi)}` : `pubmed:title:${norm(q.title)}`;
      const records = await this.cached('pubmed', key, async () => {
        const term = validDoi(q.doi) ? doiTerm(q.doi) : titleTerm(q.title);
        const body = await this.schedulers.pubmed.get('pubmed', esearchUrl(term, mail), signal);
        const ids = body === null ? [] : parseEsearch(body);
        if (!ids.length) return [];
        const xml = await this.schedulers.pubmed.get('pubmed', efetchUrl(ids, mail), signal);
        return xml === null ? [] : parseEfetch(xml);
      });
      return this.count({ source: 'pubmed', status: records.length ? 'ok' : 'not_found', records });
    } catch (e) {
      return this.count({ source: 'pubmed', status: 'error', records: [], error: errorCode(e) });
    }
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
    const years = new Set([this.paperYear, ...(q.claimedYear ? [q.claimedYear] : [])]);
    const yearOk = recordYears(r).some((y) => years.has(y));
    const journalOk = journalMatch(q.journal, r);
    const byDoi = validDoi(q.doi) && normDoi(q.doi) === r.doi;
    const matched = byDoi
      ? similarity >= tm.min_similarity
      : similarity >= tm.min_similarity && (yearOk || !tm.require_year_match) && (journalOk || !tm.require_journal_match);
    return { record: r, similarity, yearOk, journalOk, matched };
  }

  async lookup(q: PaperQuery, signal?: AbortSignal): Promise<LookupResult> {
    const enabled = this.settings.sources;
    const order: ('crossref' | 'pubmed')[] = q.domestic
      ? [this.settings.domestic_prefer, this.settings.domestic_prefer === 'crossref' ? 'pubmed' : 'crossref']
      : ['crossref', 'pubmed'];
    const sources: SourceResult[] = [];
    let scored: ScoredCandidate[] = [];
    const run = (src: 'crossref' | 'pubmed') => (src === 'crossref' ? this.crossref(q, signal) : this.pubmed(q, signal));
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
    const best = [...scored].sort((a, b) => b.similarity - a.similarity)[0];
    const doiTitleMismatch = validDoi(q.doi) && scored.some((s) => s.record.doi === normDoi(q.doi) && !s.matched);
    if (matched.length) return { status: 'matched', sources, matched, best: matched[0], doiTitleMismatch };
    if (sources.length && sources.every((s) => s.status === 'error')) return { status: 'failed', sources, matched };
    if (best && best.similarity >= 0.5) return { status: 'uncertain', sources, matched, best, doiTitleMismatch };
    if (sources.some((s) => s.status === 'error')) return { status: 'failed', sources, matched };
    return { status: 'not_found', sources, matched, doiTitleMismatch };
  }
}
