/**
 * 서지 조회 캐시(공개 서지 정보만, 기본 TTL 30일). 저장소 어댑터를 분리한다.
 *  - MemoryCache: 테스트·캐시 끔
 *  - IdbCache: 브라우저(IndexedDB, Web Worker에서도 동작)
 *  - Node 파일 캐시는 src/cli/filecache.ts
 */
export interface CacheStore {
  get(key: string): Promise<{ t: number; v: unknown } | undefined>;
  set(key: string, entry: { t: number; v: unknown }): Promise<void>;
  clear(): Promise<void>;
}

export class BiblioCache {
  hits = 0;
  misses = 0;
  constructor(
    private readonly store: CacheStore,
    private readonly ttlDays: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async get<T>(key: string): Promise<T | undefined> {
    if (this.ttlDays <= 0) return undefined;
    try {
      const e = await this.store.get(key);
      if (e && this.now() - e.t < this.ttlDays * 86400000) {
        this.hits++;
        return e.v as T;
      }
    } catch {
      /* 캐시 실패는 무시하고 조회한다 */
    }
    this.misses++;
    return undefined;
  }

  async set(key: string, v: unknown): Promise<void> {
    if (this.ttlDays <= 0) return;
    try {
      await this.store.set(key, { t: this.now(), v });
    } catch {
      /* 저장 실패는 무시 */
    }
  }

  clear(): Promise<void> {
    return this.store.clear();
  }
}

export class MemoryCache implements CacheStore {
  private m = new Map<string, { t: number; v: unknown }>();
  async get(key: string) {
    return this.m.get(key);
  }
  async set(key: string, e: { t: number; v: unknown }) {
    this.m.set(key, e);
  }
  async clear() {
    this.m.clear();
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
    return this.tx('readonly', (s) => s.get(key) as IDBRequest<{ t: number; v: unknown } | undefined>);
  }
  async set(key: string, e: { t: number; v: unknown }) {
    await this.tx('readwrite', (s) => s.put(e, key));
  }
  async clear() {
    await this.tx('readwrite', (s) => s.clear());
  }
}
