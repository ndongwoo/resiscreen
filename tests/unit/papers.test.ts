/** 논문 검사(시트 안 검사 + 가짜 서지 응답). 실제 네트워크를 쓰지 않는다. */
import { describe, expect, it } from 'vitest';
import { checkWorkbook } from '../../src/engine/index.ts';
import { BiblioClient } from '../../src/engine/biblio/client.ts';
import { BiblioCache, MemoryCache } from '../../src/engine/biblio/cache.ts';
import type { FetchLike } from '../../src/engine/biblio/throttle.ts';
import type { JournalLists } from '../../src/engine/journals.ts';
import type { Finding } from '../../src/engine/report.ts';
import { buildXlsx, type CellSpec } from '../helpers/build_xlsx.ts';
import { syntheticForm } from '../helpers/synthetic_form.ts';
import { loadFormulas, loadRules } from '../helpers/load.ts';
import { SETTINGS, crossrefItem, crossrefSearch, fakeFetch, pubmedEmpty } from '../helpers/biblio_fake.ts';

const rules = loadRules();
const formulas = loadFormulas();
const by = (fs: Finding[], id: string) => fs.filter((f) => f.ruleId === id);

const KCI: JournalLists = {
  kci: { source: 'test', as_of: '2025-08-25', journals: [{ issn: '2222-2222', eissn: '', name_ko: '대한합성학회지', name_en: 'Korean Journal of Synthesis', status: '등재' }] },
  related: { source: 'test', as_of: '2026-11-26', journals: [{ issn: '', eissn: '', name_ko: '대한비과학회지', aliases: ['Journal of Rhinology'] }] },
};

async function run(paperPatch: Record<string, CellSpec | undefined>, fetchFn: FetchLike | null, journals: JournalLists = KCI, extra: { signal?: AbortSignal } = {}) {
  const bytes = await buildXlsx(syntheticForm(rules, formulas, { papers: 1, patch: { 논문: paperPatch } }));
  const biblio = fetchFn ? new BiblioClient(fetchFn, SETTINGS, new BiblioCache(new MemoryCache(), 30), 2025) : null;
  return checkWorkbook({ bytes, fileName: 'x.xlsx', rules, formulas, biblio, journals, signal: extra.signal });
}

const onlyCrossref = (item: Record<string, unknown>) => fakeFetch({ crossref: () => crossrefSearch([crossrefItem(item)]), pubmed: pubmedEmpty }).f;

describe('시트 안 검사', () => {
  it('저널종류가 선택지가 아니면 ERROR', async () => {
    expect(by((await run({ D4: 'SCI' }, null)).findings, 'P-REQ-01').map((f) => f.cell)).toEqual(['D4']);
  });
  it('저자 수: 해당 병원 수가 총수보다 크면 WARNING', async () => {
    expect(by((await run({ J4: 2 }, null)).findings, 'P-COUNT-01').map((f) => f.cell)).toEqual(['J4']);
  });
  it('기재 출판연도가 기준 연도가 아니면 WARNING', async () => {
    expect(by((await run({ Q4: '2024.12.30' }, null)).findings, 'P-QYEAR-01')).toHaveLength(1);
  });
  it('조회를 끄면 INFO 1건', async () => {
    const r = await run({}, null);
    expect(by(r.findings, 'P-BIB-OFF')).toHaveLength(1);
    expect(r.biblio.skipped).toBe(true);
  });
});

describe('외부 조회 실패(네트워크 끊김)', () => {
  it('검사는 끝까지 돌고 논문에만 "확인 불가" WARNING', async () => {
    const { f } = fakeFetch({});
    const r = await run({}, f);
    expect(r.supported).toBe(true);
    expect(by(r.findings, 'P-BIB-FAIL').map((x) => x.cell)).toEqual(['B4']);
    expect(r.findings.filter((x) => x.level === 'ERROR')).toEqual([]);
    expect(r.biblio).toMatchObject({ attempted: 1, failed: 1, skipped: false });
  });
  it('취소하면 남은 논문은 확인 불가로 표시하고 끝난다', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const r = await run({}, onlyCrossref({}), KCI, { signal: ctrl.signal });
    expect(r.biblio.cancelled).toBe(true);
    expect(by(r.findings, 'P-BIB-FAIL')[0]!.detail).toMatchObject({ cancelled: true });
  });
});

describe('서지 대조', () => {
  it('완전 일치 → 논문 경고 없음', async () => {
    const r = await run({}, onlyCrossref({}));
    expect(r.findings.filter((f) => f.ruleId.startsWith('P-') && f.level !== 'INFO')).toEqual([]);
  });
  it('확신 미달 → 자동 확인 불가 WARNING과 후보 표시(불일치로 단정하지 않음)', async () => {
    const r = await run({}, onlyCrossref({ title: ['Synthetic study number one about another thing'] }));
    const f = by(r.findings, 'P-BIB-UNSURE');
    expect(f).toHaveLength(1);
    expect(f[0]!.message).toContain('후보');
    expect(f[0]!.message).not.toContain('불인정');
  });
  it('국내지(유관학회지 기재)를 찾지 못하면 INFO, 해외지는 WARNING', async () => {
    const none = fakeFetch({ crossref: () => crossrefSearch([]), pubmed: pubmedEmpty }).f;
    const dom = by((await run({ D4: '유관학회지', C4: 'Journal of Rhinology' }, none)).findings, 'P-BIB-UNSURE');
    expect(dom.map((f) => f.level)).toEqual(['INFO']);
    const foreign = by((await run({}, none)).findings, 'P-BIB-UNSURE');
    expect(foreign.map((f) => f.level)).toEqual(['WARNING']);
  });
  it('출처별 찾음·없음·실패·재시도 수와 논문별 결과를 낸다', async () => {
    let cr = 0;
    const f = fakeFetch({
      crossref: () => (++cr === 1 ? { status: 503, ok: false, text: async () => '' } : crossrefSearch([crossrefItem()])),
    }).f; // PubMed는 네트워크 오류
    const r = await run({}, f);
    expect(r.biblio.bySource?.crossref).toMatchObject({ ok: 1, error: 0, retries: 1 });
    expect(r.biblio.bySource?.pubmed).toMatchObject({ ok: 0, error: 1, retries: 3 });
    expect(r.papers).toEqual([
      expect.objectContaining({ row: 4, status: 'matched', domestic: false, sources: { crossref: { status: 'ok', cache: 'fresh' }, pubmed: { status: 'error', error: 'network', cache: 'fresh' } } }),
    ]);
  });
  it('Epub(권·호·쪽 없음) → 정식 출판 전 WARNING', async () => {
    const r = await run({}, onlyCrossref({ volume: undefined, issue: undefined, page: undefined, 'published-print': undefined, 'published-online': { 'date-parts': [[2025, 2, 1]] }, published: { 'date-parts': [[2025, 2, 1]] } }));
    expect(by(r.findings, 'P-EPUB-01')).toHaveLength(1);
  });
  it('정식 출판연도가 기준 연도가 아니면 WARNING(기재 날짜가 Epub 날짜인 경우)', async () => {
    const r = await run({ Q4: '2025.12.01' }, onlyCrossref({ 'published-print': { 'date-parts': [[2026, 2]] }, 'published-online': { 'date-parts': [[2025, 12, 1]] } }));
    const f = by(r.findings, 'P-YEAR-01');
    expect(f).toHaveLength(1);
    expect(f[0]!.message).toContain('2026-02');
  });
  it('Letter → 불인정 형식 WARNING, 원저 기재인데 종설 → WARNING', async () => {
    const pm = (type: string) =>
      fakeFetch({
        crossref: () => crossrefSearch([]),
        pubmed: (u) =>
          u.includes('esearch')
            ? { status: 200, ok: true, text: async () => JSON.stringify({ esearchresult: { idlist: ['1'] } }) }
            : {
                status: 200,
                ok: true,
                text: async () =>
                  `<PubmedArticleSet><PubmedArticle><MedlineCitation><PMID>1</PMID><Article><Journal><ISSN>1111-1111</ISSN><JournalIssue CitedMedium="Print"><Volume>1</Volume><PubDate><Year>2025</Year></PubDate></JournalIssue><Title>Journal of Synthetic Testing</Title></Journal><ArticleTitle>Synthetic study number 1</ArticleTitle><Pagination><MedlinePgn>1-5</MedlinePgn></Pagination><PublicationTypeList><PublicationType>${type}</PublicationType></PublicationTypeList></Article></MedlineCitation><PubmedData><PublicationStatus>ppublish</PublicationStatus></PubmedData></PubmedArticle></PubmedArticleSet>`,
              },
      }).f;
    expect(by((await run({}, pm('Letter'))).findings, 'P-TYPE-01')).toHaveLength(1);
    expect(by((await run({ D4: '한이인지(원저)', C4: 'Korean Journal of Synthesis' }, pm('Review'))).findings, 'P-TYPE-02')).toHaveLength(0); // 저널 불일치라 매칭 안 됨
    expect(by((await run({ D4: '한이인지(원저)' }, pm('Review'))).findings, 'P-TYPE-02')).toHaveLength(1);
  });
  it('공동 제1저자 표시 의심', async () => {
    const f = fakeFetch({
      crossref: () => crossrefSearch([]),
      pubmed: (u) =>
        u.includes('esearch')
          ? { status: 200, ok: true, text: async () => JSON.stringify({ esearchresult: { idlist: ['1'] } }) }
          : {
              status: 200,
              ok: true,
              text: async () =>
                `<PubmedArticleSet><PubmedArticle><MedlineCitation><PMID>1</PMID><Article><Journal><JournalIssue CitedMedium="Print"><Volume>1</Volume><PubDate><Year>2025</Year></PubDate></JournalIssue><Title>Journal of Synthetic Testing</Title></Journal><ArticleTitle>Synthetic study number 1</ArticleTitle><AuthorList><Author EqualContrib="Y"/><Author EqualContrib="Y"/></AuthorList></Article></MedlineCitation><PubmedData><PublicationStatus>ppublish</PublicationStatus></PubmedData></PubmedArticle></PubmedArticleSet>`,
            },
    }).f;
    expect(by((await run({}, f)).findings, 'P-AUTH-01').map((x) => x.cell)).toEqual(['I4']);
  });
  it('부실 의심(ENT Journal 1~2쪽) → INFO', async () => {
    const r = await run({ C4: 'Ear, Nose & Throat Journal' }, onlyCrossref({ 'container-title': ['Ear, Nose & Throat Journal'], page: '5-6' }));
    expect(by(r.findings, 'P-PRED-01').map((f) => f.level)).toEqual(['INFO']);
  });
});

describe('연락처는 결과에 남지 않는다', () => {
  it('보고서·결과 엑셀에 연락처 이메일이 없다', async () => {
    const { reportToXlsx } = await import('../../src/engine/export.ts');
    const { loadWorkbook } = await import('../../src/engine/xlsx/workbook.ts');
    const bytes = await buildXlsx(syntheticForm(rules, formulas, { papers: 1 }));
    const biblio = new BiblioClient(onlyCrossref({}), SETTINGS, new BiblioCache(new MemoryCache(), 30), 2025, 'person@hospital.example');
    const r = await checkWorkbook({ bytes, fileName: 'x.xlsx', rules, formulas, biblio, journals: KCI });
    expect(JSON.stringify(r)).not.toContain('person@hospital.example');
    const wb = await loadWorkbook(await reportToXlsx(r));
    const all = wb.sheets.flatMap((s) => [...s.cells.values()].map((c) => String(c.value))).join(' ');
    expect(all).not.toContain('person@hospital.example');
    expect(all).toContain('KCI 목록 기준일');
  });
});

describe('저널 등재 목록', () => {
  it('국내지 기재인데 KCI·유관학회지 목록에 없음 → WARNING, 유관학회지 별칭은 인정', async () => {
    expect(by((await run({ D4: '연구재단등재(후보)지', C4: '없는 학회지' }, null)).findings, 'P-JOUR-KCI')).toHaveLength(1);
    expect(by((await run({ D4: '연구재단등재(후보)지', C4: 'Korean Journal of Synthesis' }, null)).findings, 'P-JOUR-KCI')).toHaveLength(0);
    expect(by((await run({ D4: '유관학회지', C4: 'Journal of Rhinology' }, null)).findings, 'P-JOUR-KCI')).toHaveLength(0);
  });
  it('SCIE 목록이 없으면 INFO, 있으면 ISSN으로 대조하고 ESCI 단독은 WARNING', async () => {
    expect(by((await run({}, null)).findings, 'P-JOUR-SCIE-SKIP')).toHaveLength(1);
    const scie = (status: string): JournalLists => ({ ...KCI, scie: { source: 'scie.csv', as_of: '', journals: [{ issn: '11111111', eissn: '', name_en: 'Journal of Synthetic Testing', status }] } });
    expect(by((await run({}, onlyCrossref({}), scie('SCIE'))).findings, 'P-JOUR-SCIE')).toHaveLength(0);
    expect(by((await run({}, onlyCrossref({}), scie('ESCI'))).findings, 'P-JOUR-SCIE')[0]!.detail).toMatchObject({ esci_only: true });
    const other: JournalLists = { ...KCI, scie: { source: 'scie.csv', as_of: '', journals: [{ issn: '99999999', eissn: '', name_en: 'Other' }] } };
    expect(by((await run({}, onlyCrossref({}), other)).findings, 'P-JOUR-SCIE')).toHaveLength(1);
  });
});

describe('DOI 열이 있는 양식', () => {
  it('DOI가 있으면 DOI로 먼저 조회하고, 형식이 틀리면 WARNING', async () => {
    const { f, calls } = fakeFetch({ crossref: () => ({ status: 200, ok: true, text: async () => JSON.stringify({ message: crossrefItem() }) }), pubmed: pubmedEmpty });
    await run({ X3: 'DOI', X4: '10.1234/a' }, f);
    expect(calls[0]).toContain('/works/10.1234%2Fa');
    expect(by((await run({ X3: 'DOI', X4: 'abc' }, null)).findings, 'P-DOI-01').map((x) => x.cell)).toEqual(['X4']);
  });
});

import { checkWorkbookSession, recheckPapers } from '../../src/engine/index.ts';

describe('다시 조회(논문 한 편만)', () => {
  it('캐시를 무시하고 그 논문만 다시 조회해 그 행의 결과만 바꾼다', async () => {
    const bytes = await buildXlsx(syntheticForm(rules, formulas, { papers: 2, patch: { 논문: { J4: 2 } } })); // 4행: 저자 수 WARNING(시트 안 검사)
    let mode: 'fail' | 'ok' = 'fail';
    const { f, calls } = fakeFetch({ crossref: () => (mode === 'fail' ? { status: 503, ok: false, text: async () => '' } : crossrefSearch([crossrefItem()])), pubmed: pubmedEmpty });
    const client = new BiblioClient(f, { ...SETTINGS, retries: 0 }, new BiblioCache(new MemoryCache(), 30), 2025);
    const { report, session } = await checkWorkbookSession({ bytes, fileName: 'x.xlsx', rules, formulas, biblio: client, journals: KCI });
    // 4·5행 모두 Crossref 실패 + PubMed 없음 → 외부 서지 확인 불가
    expect(by(report.findings, 'P-BIB-FAIL').map((x) => x.row)).toEqual([4, 5]);
    const before5 = report.findings.filter((x) => x.row === 5 && x.sheet === '논문');
    mode = 'ok';
    const n = calls.length;
    const after = await recheckPapers(session!, [4], { client, journals: KCI });
    expect(calls.length).toBeGreaterThan(n); // 실제로 다시 요청함
    expect(by(after.findings, 'P-BIB-FAIL').map((x) => x.row)).toEqual([5]); // 4행만 바뀜
    expect(after.findings.filter((x) => x.row === 5 && x.sheet === '논문')).toEqual(before5);
    expect(by(after.findings, 'P-COUNT-01').map((x) => x.row)).toEqual([4]); // 시트 안 검사 결과는 그대로
    expect(after.papers?.find((p) => p.row === 4)?.status).toBe('matched');
    expect(after.papers?.find((p) => p.row === 4)?.sources['crossref']).toMatchObject({ status: 'ok', cache: 'fresh' });
    expect(after.summary.WARNING).toBe(after.findings.filter((x) => x.level === 'WARNING').length);
  });
  it('논문별 결과에 캐시 적중과 조회일을 표시한다', async () => {
    const store = new MemoryCache();
    const f = onlyCrossref({});
    const mk = () => new BiblioClient(f, SETTINGS, new BiblioCache(store, 30), 2025);
    const bytes = await buildXlsx(syntheticForm(rules, formulas, { papers: 1 }));
    await checkWorkbook({ bytes, fileName: 'x.xlsx', rules, formulas, biblio: mk(), journals: KCI });
    const r2 = await checkWorkbook({ bytes, fileName: 'x.xlsx', rules, formulas, biblio: mk(), journals: KCI });
    expect(r2.papers?.[0]?.sources['crossref']).toMatchObject({ status: 'ok', cache: 'hit', fetchedAt: new Date().toISOString().slice(0, 10) });
  });
});
