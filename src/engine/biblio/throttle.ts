/**
 * 요청 간격 제어와 재시도. Scheduler 인스턴스 하나가 출처 하나를 맡는다(BiblioClient가 Crossref·PubMed용을 따로 만든다).
 * - 인스턴스마다 요청 시작 간격을 1/maxRequestsPerSecond초 이상으로 둔다.
 *   현재 설정(rules/2026.json biblio.source_rps): Crossref 초당 1.5건·동시 1개, PubMed 초당 2건·동시 1개.
 *   두 출처의 간격은 서로 영향을 주지 않는다(출처별 요청 한도가 따로이므로).
 * - 네트워크 오류는 429일 수 있다고 본다(Crossref 429 응답에는 CORS 헤더가 없어 브라우저에서 상태코드를 못 읽음).
 *   네트워크 오류·시간 초과·429·5xx는 backoff_ms 간격으로 retries회까지 다시 시도한다.
 * - 취소 신호를 받으면 간격 대기·동시 요청 대기·재시도 대기 중 어디서든 바로 CancelledError로 끝난다.
 */

export type FetchLike = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{ status: number; ok: boolean; text(): Promise<string> }>;

export class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

export class BlockedHostError extends Error {
  constructor(host: string) {
    super(`허용하지 않은 주소입니다: ${host}`);
  }
}

export class CancelledError extends Error {
  constructor() {
    super('취소됨');
  }
}

export interface SchedulerOptions {
  maxRequestsPerSecond: number;
  maxConcurrent: Record<string, number>;
  retries: number;
  backoffMs: number[];
  timeoutMs: number;
  /**
   * 요청을 보낼 수 있는 호스트(https만). Web Worker에는 페이지의 <meta> CSP가 적용되지 않으므로
   * (Worker의 CSP는 응답 헤더로만 정해지고 GitHub Pages는 헤더를 못 바꾼다) 여기서 한 번 더 막는다.
   */
  allowedHosts?: string[];
  /** 테스트용 */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new CancelledError());
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new CancelledError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export class Scheduler {
  private nextStart = 0;
  private active = new Map<string, number>();
  private waiters = new Map<string, (() => void)[]>();
  private readonly sleepFn: NonNullable<SchedulerOptions['sleep']>;
  private readonly now: () => number;
  /** 이 인스턴스의 초당 요청 수와 동시 요청 수(확인용) */
  readonly rate: number;
  readonly concurrency: Record<string, number>;
  /** 통계: 실제로 보낸 요청 수, 재시도 수 */
  readonly stats = { requests: 0, retries: 0, retryReasons: {} as Record<string, number> };

  constructor(
    private readonly fetchFn: FetchLike,
    private readonly opts: SchedulerOptions,
  ) {
    this.rate = opts.maxRequestsPerSecond;
    this.concurrency = { ...opts.maxConcurrent };
    this.sleepFn = opts.sleep ?? sleep;
    this.now = opts.now ?? (() => Date.now());
  }

  private async acquire(key: string, signal?: AbortSignal): Promise<void> {
    const limit = this.opts.maxConcurrent[key] ?? 1;
    while ((this.active.get(key) ?? 0) >= limit) {
      if (signal?.aborted) throw new CancelledError();
      // 자리가 나거나(release) 취소되면(abort) 깨어난다
      await new Promise<void>((resolve, reject) => {
        const list = this.waiters.get(key) ?? [];
        const wake = () => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        };
        const onAbort = () => {
          const i = list.indexOf(wake);
          if (i >= 0) list.splice(i, 1);
          reject(new CancelledError());
        };
        list.push(wake);
        this.waiters.set(key, list);
        signal?.addEventListener('abort', onAbort, { once: true });
      });
    }
    this.active.set(key, (this.active.get(key) ?? 0) + 1);
  }

  private release(key: string): void {
    this.active.set(key, (this.active.get(key) ?? 1) - 1);
    this.waiters.get(key)?.shift()?.();
  }

  /** 전역 간격: 다음 시작 가능 시각을 예약하고 그때까지 기다린다 */
  private async pace(signal?: AbortSignal): Promise<void> {
    const gap = 1000 / Math.max(0.1, this.opts.maxRequestsPerSecond);
    const now = this.now();
    const at = Math.max(now, this.nextStart);
    this.nextStart = at + gap;
    if (at > now) await this.sleepFn(at - now, signal);
  }

  /** GET 요청. 404는 null(없음). 나머지 실패는 재시도 후 예외 */
  async get(key: string, url: string, signal?: AbortSignal): Promise<string | null> {
    if (this.opts.allowedHosts) {
      let u: URL;
      try {
        u = new URL(url);
      } catch {
        throw new BlockedHostError(url);
      }
      if (u.protocol !== 'https:' || !this.opts.allowedHosts.includes(u.hostname) || u.username || u.password || (u.port && u.port !== '443'))
        throw new BlockedHostError(u.hostname);
    }
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.opts.retries; attempt++) {
      if (signal?.aborted) throw new CancelledError();
      if (attempt > 0) {
        this.stats.retries++;
        const why = errorCode(lastErr);
        this.stats.retryReasons[why] = (this.stats.retryReasons[why] ?? 0) + 1;
        await this.sleepFn(this.opts.backoffMs[Math.min(attempt - 1, this.opts.backoffMs.length - 1)] ?? 1000, signal);
      }
      await this.acquire(key, signal);
      try {
        await this.pace(signal);
        this.stats.requests++;
        const ctrl = new AbortController();
        const onAbort = () => ctrl.abort();
        signal?.addEventListener('abort', onAbort, { once: true });
        const timer = setTimeout(() => ctrl.abort(), this.opts.timeoutMs);
        try {
          const res = await this.fetchFn(url, { signal: ctrl.signal, headers: { Accept: 'application/json, text/xml' } });
          if (res.status === 404) return null;
          if (res.ok) return await res.text();
          lastErr = new HttpError(res.status);
          if (res.status !== 429 && res.status < 500) throw lastErr; // 400 등은 재시도해도 같다
        } finally {
          clearTimeout(timer);
          signal?.removeEventListener('abort', onAbort);
        }
      } catch (e) {
        if (signal?.aborted) throw new CancelledError();
        if (e instanceof HttpError && e.status !== 429 && e.status < 500) throw e;
        lastErr = e; // 네트워크 오류(CORS 차단된 429 포함)·시간 초과
      } finally {
        this.release(key);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('요청 실패');
  }
}

export function errorCode(e: unknown): string {
  if (e instanceof CancelledError) return 'cancelled';
  if (e instanceof BlockedHostError) return 'blocked_host';
  if (e instanceof HttpError) return `http_${e.status}`;
  if (e instanceof Error && e.name === 'AbortError') return 'timeout';
  return 'network';
}
