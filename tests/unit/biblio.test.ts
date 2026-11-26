/** 서지 조회·대조 단위 테스트. 실제 네트워크를 쓰지 않는다(가짜 fetch). */
import { describe, expect, it } from 'vitest';
import { formalDate, hasFormalEvidence, journalMatch, norm, pageCount, ratio, titleSimilarity, validDoi } from '../../src/engine/biblio/match.ts';
import { crossrefRecord, parseCrossrefSearch } from '../../src/engine/biblio/crossref.ts';
import { parseEfetch, pubDate } from '../../src/engine/biblio/pubmed.ts';
import { Scheduler, type FetchLike } from '../../src/engine/biblio/throttle.ts';
import { BiblioClient } from '../../src/engine/biblio/client.ts';
import { BiblioCache, MemoryCache } from '../../src/engine/biblio/cache.ts';
import { emptyRecord } from '../../src/engine/biblio/types.ts';
import { parseXml, child } from '../../src/engine/xlsx/xml.ts';
import { applyAliases, isAbbreviation, JournalIndex, parseJournalListFile } from '../../src/engine/journals.ts';
import { buildXlsx } from '../helpers/build_xlsx.ts';
import { SETTINGS, crossrefItem, crossrefSearch, fakeFetch, pubmedEmpty } from '../helpers/biblio_fake.ts';

describe('제목 대조', () => {
  it('difflib SequenceMatcher.ratio와 같은 값(autojunk 포함)', () => {
    expect(ratio('synthetic analysis of the sample cohort test', 'synthetic analysis of sample cohort test')).toBeCloseTo(0.9523809523809523, 12);
    expect(ratio('abc', 'xyz')).toBe(0);
    expect(ratio('placeholder method with device 2', 'placeholder method with device2 in subjects')).toBeCloseTo(0.8266666666666667, 12);
    expect(ratio('a'.repeat(10) + 'b'.repeat(250), 'a'.repeat(12) + 'b'.repeat(240) + 'c')).toBeCloseTo(0.03898635477582846, 12);
    expect(ratio('가상의 연구 대상자의 특성', '가상의 연구 대상자 특성 및 결과')).toBeCloseTo(0.8125, 12);
  });
  it('정규화는 마크업·기호·대소문자를 지운다', () => {
    expect(norm('Sample with Device<sup>®</sup>2: <i>A</i> Study')).toBe('sample with device 2 a study');
    expect(titleSimilarity('Device<sup>®</sup>2 Failure', 'Device®2 failure')).toBe(1);
  });
  it('DOI 형식', () => {
    expect(validDoi('https://doi.org/10.3342/ceo.2025.001')).toBe(true);
    expect(validDoi('doi:10.1/x')).toBe(false);
  });
  it('저널: ISSN·약어·부제', () => {
    const rec = { journal: 'Clinical and Experimental Otorhinolaryngology', journalAliases: ['Clin Exp Otorhinolaryngol'], issn: ['1976-8710'] };
    expect(journalMatch('Clin Exp Otorhinolaryngol', rec)).toBe(true);
    expect(journalMatch('clinical and experimental otorhinolaryngology (CEO)', rec)).toBe(true);
    expect(journalMatch('Laryngoscope', rec)).toBe(false);
    expect(journalMatch('아무 이름', rec, ['19768710'])).toBe(true);
    expect(isAbbreviation('Korean J Otorhinolaryngol-Head Neck Surg', 'Korean Journal of Otorhinolaryngology-Head and Neck Surgery')).toBe(true);
  });
  it('쪽 수', () => {
    expect(pageCount('123-124')).toBe(2);
    expect(pageCount('1234-36')).toBe(3);
    expect(pageCount('e0123')).toBeNull();
  });
});

describe('정식 출판일', () => {
  const rec = (o: Partial<ReturnType<typeof emptyRecord>>, src: 'crossref' | 'pubmed' = 'crossref') => ({ ...emptyRecord(src), ...o });
  it('인쇄일 → 권호 발행일 → 온라인 전용(권+쪽/논문번호)', () => {
    expect(formalDate(rec({ printDate: '2025-03' }))).toEqual({ date: '2025-03', kind: '인쇄일' });
    expect(formalDate(rec({ issueDate: '2025-04', publicationStatus: 'aheadofprint' })).kind).toBe('미확인');
    expect(formalDate(rec({ volume: '12', articleNumber: '345', publishedDate: '2025-06-01' })).kind).toBe('온라인 전용 권·쪽 발행일');
    expect(formalDate(rec({ onlineDate: '2025-01-02', publishedDate: '2025-01-02' })).kind).toBe('미확인');
  });
  it('선출판 판별', () => {
    expect(hasFormalEvidence(rec({ onlineDate: '2025-01-02' }))).toBe(false);
    expect(hasFormalEvidence(rec({ publicationStatus: 'epublish' }, 'pubmed'))).toBe(true);
  });
});

describe('응답 해석', () => {
  it('Crossref 레코드', () => {
    const r = crossrefRecord({
      DOI: '10.1/ABC',
      title: ['T'],
      'container-title': ['J'],
      ISSN: ['1234-5678'],
      type: 'journal-article',
      subtype: 'aheadofprint',
      'published-online': { 'date-parts': [[2025, 1, 5]] },
      author: [{}, {}],
    });
    expect(r).toMatchObject({ doi: '10.1/abc', title: 'T', onlineDate: '2025-01-05', publicationStatus: 'aheadofprint', authorCount: 2 });
    expect(parseCrossrefSearch('{"message":{"items":[{"title":["A"]},{"title":["B"]}]}}')).toHaveLength(2);
  });
  it('PubMed efetch XML: 날짜·유형·EqualContrib', () => {
    const xml = `<PubmedArticleSet><PubmedArticle><MedlineCitation><PMID>123</PMID><Article><Journal><ISSN>1234-5678</ISSN><JournalIssue CitedMedium="Print"><Volume>10</Volume><Issue>2</Issue><PubDate><Year>2025</Year><Month>Mar</Month></PubDate></JournalIssue><Title>Some Journal</Title><ISOAbbreviation>Some J</ISOAbbreviation></Journal><ArticleTitle>A <i>title</i>.</ArticleTitle><Pagination><MedlinePgn>1-9</MedlinePgn></Pagination><AuthorList><Author EqualContrib="Y"/><Author EqualContrib="Y"/><Author/></AuthorList><PublicationTypeList><PublicationType>Letter</PublicationType></PublicationTypeList><ArticleDate DateType="Electronic"><Year>2024</Year><Month>12</Month><Day>1</Day></ArticleDate></Article></MedlineCitation><PubmedData><PublicationStatus>ppublish</PublicationStatus><ArticleIdList><ArticleId IdType="doi">10.9/XYZ</ArticleId></ArticleIdList></PubmedData></PubmedArticle></PubmedArticleSet>`;
    const [r] = parseEfetch(xml);
    expect(r).toMatchObject({ pmid: '123', doi: '10.9/xyz', issueDate: '2025-03', printDate: '2025-03', onlineDate: '2024-12-01', types: ['Letter'], equalContribCount: 2, authorCount: 3, pages: '1-9' });
    expect(pubDate(child(parseXml('<d><MedlineDate>2025 Jan-Feb</MedlineDate></d>'), 'd'))).toBe('2025');
  });
});

function fakeClock() {
  let t = 0;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    },
    sleeps,
  };
}

const resp = (status: number, body = '') => ({ status, ok: status >= 200 && status < 300, text: async () => body });

describe('요청 간격·재시도', () => {
  it('초당 2건: 요청 시작 간격 500ms', async () => {
    const clock = fakeClock();
    const starts: number[] = [];
    const f: FetchLike = async () => {
      starts.push(clock.now());
      return resp(200, 'x');
    };
    const s = new Scheduler(f, { maxRequestsPerSecond: 2, maxConcurrent: { a: 2 }, retries: 3, backoffMs: [1000, 2000, 4000], timeoutMs: 1000, sleep: clock.sleep, now: clock.now });
    for (let i = 0; i < 4; i++) await s.get('a', 'u');
    expect(starts).toEqual([0, 500, 1000, 1500]);
  });
  it('네트워크 오류(429일 수 있음)는 지수 백오프로 3회 재시도 후 실패', async () => {
    const clock = fakeClock();
    let n = 0;
    const f: FetchLike = async () => {
      n++;
      throw new TypeError('Failed to fetch');
    };
    const s = new Scheduler(f, { maxRequestsPerSecond: 100, maxConcurrent: {}, retries: 3, backoffMs: [1000, 2000, 4000], timeoutMs: 1000, sleep: clock.sleep, now: clock.now });
    await expect(s.get('a', 'u')).rejects.toThrow();
    expect(n).toBe(4);
    expect(clock.sleeps.filter((x) => x >= 1000)).toEqual([1000, 2000, 4000]);
  });
  it('429 다음 성공, 404는 없음(null), 400은 재시도 안 함', async () => {
    const clock = fakeClock();
    const seq = [resp(429), resp(200, 'ok')];
    const s = new Scheduler(async () => seq.shift()!, { maxRequestsPerSecond: 100, maxConcurrent: {}, retries: 3, backoffMs: [1], timeoutMs: 1000, sleep: clock.sleep, now: clock.now });
    expect(await s.get('a', 'u')).toBe('ok');
    const s404 = new Scheduler(async () => resp(404), { maxRequestsPerSecond: 100, maxConcurrent: {}, retries: 3, backoffMs: [1], timeoutMs: 1000, sleep: clock.sleep, now: clock.now });
    expect(await s404.get('a', 'u')).toBeNull();
    let n = 0;
    const s400 = new Scheduler(async () => (n++, resp(400)), { maxRequestsPerSecond: 100, maxConcurrent: {}, retries: 3, backoffMs: [1], timeoutMs: 1000, sleep: clock.sleep, now: clock.now });
    await expect(s400.get('a', 'u')).rejects.toThrow('HTTP 400');
    expect(n).toBe(1);
  });
  it('허용 호스트 밖으로는 요청하지 않는다(Worker에는 페이지 CSP가 적용되지 않으므로)', async () => {
    let n = 0;
    const s = new Scheduler(async () => (n++, resp(200, 'x')), { maxRequestsPerSecond: 100, maxConcurrent: {}, retries: 3, backoffMs: [1], timeoutMs: 1000, allowedHosts: ['api.crossref.org'] });
    await expect(s.get('a', 'https://example.com/x')).rejects.toThrow('허용하지 않은');
    await expect(s.get('a', 'http://api.crossref.org/x')).rejects.toThrow('허용하지 않은');
    await expect(s.get('a', 'https://api.crossref.org:8443/x')).rejects.toThrow('허용하지 않은');
    expect(await s.get('a', 'https://api.crossref.org/works')).toBe('x');
    expect(n).toBe(1);
  });
  it('동시 요청 자리를 기다리는 중에 취소하면 바로 CancelledError', async () => {
    const ctrl = new AbortController();
    // 첫 요청은 끝나지 않는다(신호도 무시) → 두 번째는 acquire에서 기다린다
    const s = new Scheduler(() => new Promise(() => undefined), { maxRequestsPerSecond: 1000, maxConcurrent: { a: 1 }, retries: 0, backoffMs: [1], timeoutMs: 60000 });
    void s.get('a', 'u1').catch(() => undefined);
    const second = s.get('a', 'u2', ctrl.signal);
    await new Promise((r) => setTimeout(r, 20));
    const t0 = Date.now();
    ctrl.abort();
    await expect(second).rejects.toThrow('취소');
    expect(Date.now() - t0).toBeLessThan(50);
  });
  it('취소하면 바로 멈춘다', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const s = new Scheduler(async () => resp(200, 'x'), { maxRequestsPerSecond: 2, maxConcurrent: {}, retries: 3, backoffMs: [1], timeoutMs: 1000 });
    await expect(s.get('a', 'u', ctrl.signal)).rejects.toThrow('취소');
  });
});

describe('출처별 요청 간격', () => {
  it('현재 설정: Crossref 초당 1.5건·동시 1개, PubMed 초당 2건·동시 1개(인스턴스가 따로)', async () => {
    const { loadRules } = await import('../helpers/load.ts');
    const settings = loadRules().biblio as unknown as typeof SETTINGS;
    const c = new BiblioClient(async () => resp(200, '{}'), settings, new BiblioCache(new MemoryCache(), 0), 2025);
    expect(c.schedulers.crossref).not.toBe(c.schedulers.pubmed);
    expect([c.schedulers.crossref.rate, c.schedulers.crossref.concurrency['crossref']]).toEqual([1.5, 1]);
    expect([c.schedulers.pubmed.rate, c.schedulers.pubmed.concurrency['pubmed']]).toEqual([2, 1]);
  });
  it('한 출처의 간격 대기가 다른 출처를 막지 않는다', async () => {
    const starts: { crossref: number[]; pubmed: number[] } = { crossref: [], pubmed: [] };
    const t0 = Date.now();
    const f: FetchLike = async (url) => {
      starts[url.includes('crossref') ? 'crossref' : 'pubmed'].push(Date.now() - t0);
      return url.includes('crossref') ? crossrefSearch([]) : pubmedEmpty();
    };
    const settings = { ...SETTINGS, max_requests_per_second: 10, source_rps: { crossref: 10, pubmed: 10 }, crossref_max_concurrent: 1 };
    const c = new BiblioClient(f, settings, new BiblioCache(new MemoryCache(), 0), 2025);
    const qs = [1, 2, 3].map((i) => ({ title: `title ${i}`, journal: 'J', doi: '', claimedYear: 2025, domestic: false }));
    await Promise.all(qs.flatMap((q) => [c.crossref(q), c.pubmed(q)]));
    for (const k of ['crossref', 'pubmed'] as const) {
      expect(starts[k]).toHaveLength(3);
      // 같은 출처 안에서는 100ms 간격
      expect(starts[k]![1]! - starts[k]![0]!).toBeGreaterThanOrEqual(90);
      expect(starts[k]![2]! - starts[k]![1]!).toBeGreaterThanOrEqual(90);
    }
    // 두 출처는 동시에 시작한다(공유 간격이면 PubMed 첫 요청이 100ms 이상 늦어짐)
    expect(Math.abs(starts.crossref[0]! - starts.pubmed[0]!)).toBeLessThan(50);
    expect(Math.max(...starts.crossref, ...starts.pubmed)).toBeLessThan(400);
  });
});

describe('논문 한 편 조회', () => {
  const q = { title: 'Synthetic study number 1', journal: 'Journal of Synthetic Testing', doi: '', claimedYear: 2025, domestic: false };
  const client = (f: FetchLike) => new BiblioClient(f, SETTINGS, new BiblioCache(new MemoryCache(), 30), 2025);
  it('제목·연도·저널이 맞으면 matched, 캐시로 두 번째는 요청 없음', async () => {
    const { f, calls } = fakeFetch({ crossref: () => crossrefSearch([crossrefItem()]), pubmed: pubmedEmpty });
    const c = client(f);
    expect((await c.lookup(q)).status).toBe('matched');
    const n = calls.length;
    await c.lookup(q);
    expect(calls.length).toBe(n);
  });
  it('연락처: Crossref에는 입력한 연락처, PubMed에는 tool=resiscreen·학회 연락처. 캐시 키에는 연락처가 없다', async () => {
    const { f, calls } = fakeFetch({ crossref: () => crossrefSearch([]), pubmed: pubmedEmpty });
    const store = new MemoryCache();
    const settings = { ...SETTINGS, mailto: 'entsoc@korl.or.kr', pubmed_email: 'entsoc@korl.or.kr' };
    const c = new BiblioClient(f, settings, new BiblioCache(store, 30), 2025, 'person@hospital.example');
    await c.lookup(q);
    const cr = calls.filter((u) => u.includes('crossref'));
    const pm = calls.filter((u) => u.includes('eutils'));
    expect(cr.every((u) => u.includes('mailto=person%40hospital.example'))).toBe(true);
    expect(pm.every((u) => u.includes('tool=resiscreen') && u.includes('email=entsoc%40korl.or.kr') && !u.includes('person'))).toBe(true);
    const keys = [...(store as unknown as { m: Map<string, unknown> }).m.keys()];
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.join(' ')).not.toMatch(/person|hospital\.example|entsoc/);
  });
  it('외부로 보내는 것은 제목·DOI·연락처뿐이고 허용 호스트만 쓴다', async () => {
    const { f, calls } = fakeFetch({ crossref: () => crossrefSearch([]), pubmed: pubmedEmpty });
    await client(f).lookup(q);
    for (const u of calls) expect(u).toMatch(/^https:\/\/(api\.crossref\.org|eutils\.ncbi\.nlm\.nih\.gov)\//);
    expect(calls.join(' ')).toContain(encodeURIComponent('Synthetic study number 1').replace(/%20/g, '+'));
  });
  it('연도가 다르면 확신 미달(uncertain)로 후보만 보여 준다', async () => {
    const { f } = fakeFetch({ crossref: () => crossrefSearch([crossrefItem({ 'published-print': { 'date-parts': [[2019]] }, published: { 'date-parts': [[2019]] } })]), pubmed: pubmedEmpty });
    const r = await client(f).lookup(q);
    expect(r.status).toBe('uncertain');
    expect(r.best?.yearOk).toBe(false);
  });
  it('모든 출처 실패 → failed', async () => {
    const { f } = fakeFetch({});
    expect((await client(f).lookup(q)).status).toBe('failed');
  });
  it('국내지는 Crossref를 먼저, 맞으면 PubMed를 부르지 않는다', async () => {
    const { f, calls } = fakeFetch({ crossref: () => crossrefSearch([crossrefItem()]), pubmed: pubmedEmpty });
    await client(f).lookup({ ...q, domestic: true });
    expect(calls.every((u) => u.includes('crossref'))).toBe(true);
  });
});

describe('저널 목록', () => {
  it('열 이름이 달라도 ISSN·eISSN·저널명을 찾는다(CSV)', async () => {
    const csv = '설명 줄\n"Journal title",ISSN,eISSN,Edition\n"Laryngoscope",0023-852X,1531-4995,SCIE\n"Some Emerging J",1234-5679,,ESCI\n';
    const list = await parseJournalListFile(new TextEncoder().encode(csv), 'scie.csv');
    expect(list.journals).toHaveLength(2);
    const idx = new JournalIndex(list);
    expect(idx.find(['1531-4995'], [])?.entry.name_en).toBe('Laryngoscope');
    expect(idx.find([], ['THE LARYNGOSCOPE'])?.entry.status).toBe('SCIE');
  });
  it('엑셀 목록도 읽는다', async () => {
    const bytes = await buildXlsx({ sheets: [{ name: 'list', cells: { A1: 'Full Journal Title', B1: 'Print ISSN', C1: 'E-ISSN', A2: 'Laryngoscope', B2: '0023-852X', C2: '1531-4995' } }] });
    const list = await parseJournalListFile(bytes, 'jcr.xlsx');
    expect(list.journals[0]).toMatchObject({ issn: '0023852X', eissn: '15314995' });
  });
  it('필수 열이 없으면 알기 쉬운 오류', async () => {
    await expect(parseJournalListFile(new TextEncoder().encode('a,b\n1,2\n'), 'x.csv')).rejects.toThrow('ISSN');
  });
  it('별칭 붙이기', () => {
    const l = applyAliases({ source: '', as_of: '', journals: [{ issn: '', eissn: '2092-6529', name_ko: '대한이비인후-두경부외과학회지' }] }, { '2092-6529': ['대한이비인후과학회지'] });
    expect(new JournalIndex(l).find([], ['대한이비인후과학회지'])).not.toBeNull();
  });
});
