/** 서지 캐시: 결과 종류별 TTL, 오류·취소 미저장, 형식 버전, 항목 수 상한 */
import { describe, expect, it } from 'vitest';
import { BiblioCache, MemoryCache } from '../../src/engine/biblio/cache.ts';
import { BiblioClient, CACHE_FORMAT_VERSION, cacheKey } from '../../src/engine/biblio/client.ts';
import { SETTINGS, crossrefItem, crossrefSearch, fakeFetch, pubmedEmpty } from '../helpers/biblio_fake.ts';
import { loadRules } from '../helpers/load.ts';

const q = { title: 'Synthetic study number 1', journal: 'Journal of Synthetic Testing', doi: '', claimedYear: 2025, domestic: false, paperYear: 2025 };
const DAY = 86400000;

function setup(handlers: Parameters<typeof fakeFetch>[0], now = () => Date.now()) {
  const store = new MemoryCache();
  const { f, calls } = fakeFetch(handlers);
  const client = new BiblioClient(f, { ...SETTINGS, retries: 0, cache_ttl: { formal: 30, epub: 3, not_found: 1 } }, new BiblioCache(store, 30, now), 2025);
  return { store, client, calls };
}

describe('결과 종류별 TTL', () => {
  it('rules JSON 기본값: 정식 30일, Epub 3일, 찾지 못함 1일, 상한 2,000', () => {
    const b = loadRules().biblio as Record<string, unknown>;
    expect(b['cache_ttl']).toEqual({ formal: 30, epub: 3, not_found: 1 });
    expect(b['cache_max_entries']).toBe(2000);
  });
  it('정식 출판(권·호·쪽) → 30일', async () => {
    const { store, client } = setup({ crossref: () => crossrefSearch([crossrefItem()]), pubmed: pubmedEmpty });
    await client.lookup(q);
    const e = store.m.get(cacheKey('crossref', 'title', 'synthetic study number 1'))!;
    expect(e.ttl).toBe(30);
    expect((e.v as { kind: string }).kind).toBe('formal');
    // PubMed는 일치 없음 → 1일
    expect(store.m.get(cacheKey('pubmed', 'title', 'synthetic study number 1'))!.ttl).toBe(1);
  });
  it('Epub(권·호·쪽 없음) → 3일', async () => {
    const epub = crossrefItem({ volume: undefined, issue: undefined, page: undefined, 'published-print': undefined, 'published-online': { 'date-parts': [[2025, 2, 1]] } });
    const { store, client } = setup({ crossref: () => crossrefSearch([epub]), pubmed: pubmedEmpty });
    await client.lookup(q);
    expect(store.m.get(cacheKey('crossref', 'title', 'synthetic study number 1'))!.ttl).toBe(3);
  });
  it('후보는 있지만 일치하지 않음 → 찾지 못함(1일)', async () => {
    const { store, client } = setup({ crossref: () => crossrefSearch([crossrefItem({ title: ['Completely different paper'] })]), pubmed: pubmedEmpty });
    await client.lookup(q);
    expect(store.m.get(cacheKey('crossref', 'title', 'synthetic study number 1'))!.ttl).toBe(1);
  });
  it('기한이 지나면 다시 조회한다', async () => {
    let now = Date.now();
    const { client, calls } = setup({ crossref: () => crossrefSearch([]), pubmed: pubmedEmpty }, () => now);
    await client.lookup(q);
    const n = calls.length;
    await client.lookup(q);
    expect(calls.length).toBe(n); // 1일 안: 캐시
    now += 1 * DAY + 1;
    await client.lookup(q);
    expect(calls.length).toBeGreaterThan(n); // 1일 지남: 다시 조회
  });
  it('네트워크 오류·시간 초과·취소는 저장하지 않는다', async () => {
    const { store, client } = setup({});
    await client.lookup(q);
    expect(store.m.size).toBe(0);
    const ctrl = new AbortController();
    ctrl.abort();
    const ok = setup({ crossref: () => crossrefSearch([crossrefItem()]), pubmed: pubmedEmpty });
    expect((await ok.client.lookup(q, ctrl.signal)).status).toBe('cancelled');
    expect(ok.store.m.size).toBe(0);
  });
});

describe('형식 버전·다시 조회·상한', () => {
  it('캐시 키에 형식 버전이 있고, 옛 형식 키는 쓰지 않는다', async () => {
    const { store, client, calls } = setup({ crossref: () => crossrefSearch([crossrefItem()]), pubmed: pubmedEmpty });
    store.m.set('crossref:title:synthetic study number 1', { t: Date.now(), v: [] }); // 버전 없는 옛 항목
    await client.lookup(q);
    expect(calls.some((u) => u.includes('crossref'))).toBe(true);
    expect([...store.m.keys()].filter((k) => k.startsWith(`v${CACHE_FORMAT_VERSION}:`))).toHaveLength(2);
  });
  it('bypassCache면 캐시를 무시하고 다시 조회해 새로 저장한다', async () => {
    const { client, calls } = setup({ crossref: () => crossrefSearch([crossrefItem()]), pubmed: pubmedEmpty });
    await client.lookup(q);
    const n = calls.length;
    const r = await client.lookup(q, undefined, { bypassCache: true });
    expect(calls.length).toBeGreaterThan(n);
    expect(r.sources.every((s) => s.cache === 'fresh')).toBe(true);
  });
  it('항목 수 상한을 넘으면 오래된 것부터 지우고, 기한 지난 것도 지운다', async () => {
    let now = 1_000_000;
    const store = new MemoryCache();
    const cache = new BiblioCache(store, 30, () => now);
    for (let i = 0; i < 5; i++) {
      now += 1000;
      await cache.set(`k${i}`, [], 30);
    }
    await cache.set('short', [], 1);
    now += 2 * DAY; // short는 기한 지남
    const dropped = await cache.prune(3);
    expect(dropped).toBe(3);
    expect([...store.m.keys()].sort()).toEqual(['k2', 'k3', 'k4']);
  });
});
