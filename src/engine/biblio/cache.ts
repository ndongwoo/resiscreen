/**
 * 서지 조회 캐시(공개 서지 정보만). 저장소 어댑터를 분리한다.
 *  - MemoryCache: 테스트·캐시 끔
 *  - IdbCache: 브라우저(IndexedDB, Web Worker에서도 동작)
 *  - Node 파일 캐시는 src/cli/filecache.ts
 *
 * 항목마다 유효 기간(ttlDays)을 따로 둔다(결과 종류별 TTL은 client.ts가 정한다).
 * 저장 항목 수가 상한을 넘으면 오래된 것부터 지운다(prune).
 * 연락처 이메일·엑셀 파일 내용은 저장하지 않는다(키는 출처·DOI·정규화한 제목, 값은 공개 서지 레코드).
 */
export interface CacheEntry {
  /** 저장 시각(ms) */
  t: number;
  v: unknown;
  /** 이 항목의 유효 기간(일). 없으면 BiblioCache 기본값 */
  ttl?: number;
}

export interface CacheStore {
  get(key: string): Promise<CacheEntry | undefined>;
  set(key: string, entry: CacheEntry): Promise<void>;
  clear(): Promise<void>;
  /** 모든 항목의 키·저장 시각·유효 기간 */
  list(): Promise<{ key: string; t: number; ttl?: number }[]>;
  delete(keys: string[]): Promise<void>;
}

export class BiblioCache {
  hits = 0;
  misses = 0;
  constructor(
    private readonly store: CacheStore,
    /** 기본 유효 기간(일). 0이면 캐시를 쓰지 않는다 */
    private readonly ttlDays: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get enabled(): boolean {
    return this.ttlDays > 0;
  }

  private fresh(e: { t: number; ttl?: number }): boolean {
    const ttl = e.ttl ?? this.ttlDays;
    return ttl > 0 && this.now() - e.t < ttl * 86400000;
  }

  /** 유효한 항목(값과 저장 시각) */
  async getEntry<T>(key: string): Promise<{ v: T; t: number } | undefined> {
    if (!this.enabled) return undefined;
    try {
      const e = await this.store.get(key);
      if (e && this.fresh(e)) {
        this.hits++;
        return { v: e.v as T, t: e.t };
      }
    } catch {
      /* 캐시 실패는 무시하고 조회한다 */
    }
    this.misses++;
    return undefined;
  }

  async get<T>(key: string): Promise<T | undefined> {
    return (await this.getEntry<T>(key))?.v;
  }

  async set(key: string, v: unknown, ttlDays?: number): Promise<void> {
    if (!this.enabled || (ttlDays !== undefined && ttlDays <= 0)) return;
    try {
      await this.store.set(key, { t: this.now(), v, ttl: ttlDays });
    } catch {
      /* 저장 실패는 무시 */
    }
  }

  /** 기한이 지난 항목을 지우고, 그래도 max개를 넘으면 오래된 것부터 지운다. 지운 수를 돌려준다 */
  async prune(max: number): Promise<number> {
    try {
      const all = await this.store.list();
      const expired = all.filter((e) => !this.fresh(e)).map((e) => e.key);
      const alive = all.filter((e) => this.fresh(e)).sort((a, b) => a.t - b.t);
      const over = Math.max(0, alive.length - max);
      const drop = [...expired, ...alive.slice(0, over).map((e) => e.key)];
      if (drop.length) await this.store.delete(drop);
      return drop.length;
    } catch {
      return 0;
    }
  }

  clear(): Promise<void> {
    return this.store.clear();
  }
}

export class MemoryCache implements CacheStore {
  readonly m = new Map<string, CacheEntry>();
  async get(key: string) {
    return this.m.get(key);
  }
  async set(key: string, e: CacheEntry) {
    this.m.set(key, e);
  }
  async clear() {
    this.m.clear();
  }
  async list() {
    return [...this.m.entries()].map(([key, e]) => ({ key, t: e.t, ttl: e.ttl }));
  }
  async delete(keys: string[]) {
    for (const k of keys) this.m.delete(k);
  }
}

/** IndexedDB 저장소. DB 'resiscreen': biblio(서지 캐시), journals(SCIE 목록), settings(기억을 켠 연락처만) */
export class IdbCache implements CacheStore {
  private db: Promise<IDBDatabase>;
  constructor(
    private readonly dbName = 'resiscreen',
    private readonly storeName = 'biblio',
  ) {
    this.db = new Promise((resolve, reject) => {
      // 버전 2: settings 저장소(사용자가 '기억'을 켠 연락처 이메일만) 추가
      const req = indexedDB.open(this.dbName, 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of ['biblio', 'journals', 'settings']) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  private async tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.db;
    return new Promise((resolve, reject) => {
      const r = fn(db.transaction(this.storeName, mode).objectStore(this.storeName));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  get(key: string) {
    return this.tx('readonly', (s) => s.get(key) as IDBRequest<CacheEntry | undefined>);
  }
  async set(key: string, e: CacheEntry) {
    await this.tx('readwrite', (s) => s.put(e, key));
  }
  async clear() {
    await this.tx('readwrite', (s) => s.clear());
  }
  async list() {
    const db = await this.db;
    return new Promise<{ key: string; t: number; ttl?: number }[]>((resolve, reject) => {
      const out: { key: string; t: number; ttl?: number }[] = [];
      const req = db.transaction(this.storeName, 'readonly').objectStore(this.storeName).openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return resolve(out);
        const e = c.value as CacheEntry;
        out.push({ key: String(c.key), t: e?.t ?? 0, ttl: e?.ttl });
        c.continue();
      };
      req.onerror = () => reject(req.error);
    });
  }
  async delete(keys: string[]) {
    const db = await this.db;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const s = tx.objectStore(this.storeName);
      for (const k of keys) s.delete(k);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
