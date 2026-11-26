/**
 * 수용 기준(익명화 병원 파일). tests/fixtures/private/에 파일이 없으면 건너뛴다(CI는 합성 샘플만).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { checkWorkbook } from '../../src/engine/index.ts';
import { loadFormulas, loadRules, privateFile } from '../helpers/load.ts';
import { BiblioClient } from '../../src/engine/biblio/client.ts';
import { BiblioCache, MemoryCache } from '../../src/engine/biblio/cache.ts';
import { SETTINGS, fakeFetch } from '../helpers/biblio_fake.ts';

const rules = loadRules();
const formulas = loadFormulas();

async function check(path: string) {
  return checkWorkbook({ bytes: new Uint8Array(readFileSync(path)), fileName: basename(path), rules, formulas });
}

const A = privateFile('A병원_2026_수련실태조사_익명화.xlsx');
const F_AFTER = privateFile('F병원_2026_수련실태조사_익명화.xlsx');
const F_BEFORE = privateFile('F병원_2026_수련실태조사_평가전.xlsx');

describe.skipIf(!A)('A병원(완성본)', () => {
  it('ERROR 0건', async () => {
    const r = await check(A!);
    expect(r.supported).toBe(true);
    expect(r.findings.filter((f) => f.level === 'ERROR')).toEqual([]);
  });
});

describe.skipIf(!A)('네트워크가 끊긴 상태(A병원)', () => {
  it('전체 검사가 끝나고 논문에만 "외부 서지 확인 불가" WARNING', async () => {
    const { f } = fakeFetch({}); // 모든 요청이 네트워크 오류
    const biblio = new BiblioClient(f, SETTINGS, new BiblioCache(new MemoryCache(), 30), 2025);
    const r = await checkWorkbook({ bytes: new Uint8Array(readFileSync(A!)), fileName: 'A.xlsx', rules, formulas, biblio });
    const offline = await check(A!);
    const fails = r.findings.filter((x) => x.ruleId === 'P-BIB-FAIL');
    expect(fails.length).toBe(r.biblio.attempted);
    expect(r.biblio.failed).toBe(r.biblio.attempted);
    expect(r.biblio.attempted).toBeGreaterThan(0);
    // 논문 확인 불가 외의 결과는 조회를 끈 경우와 같다
    const strip = (fs: typeof r.findings) => fs.filter((x) => !['P-BIB-FAIL', 'P-BIB-OFF'].includes(x.ruleId));
    expect(strip(r.findings)).toEqual(strip(offline.findings));
    expect(r.summary.ERROR).toBe(0);
  });
});

describe.skipIf(!F_BEFORE || !F_AFTER)('F병원(거의 빈 파일) 두 개', () => {
  for (const [label, path] of [['평가전', F_BEFORE], ['익명화', F_AFTER]] as const) {
    it(`${label}: 멈추지 않고 다량 ERROR를 시트별로 낸다`, async () => {
      const r = await check(path!);
      expect(r.supported).toBe(true);
      expect(r.summary.ERROR).toBeGreaterThanOrEqual(10);
      expect(Object.keys(r.summary.bySheet).length).toBeGreaterThan(3);
      for (const f of r.findings) {
        expect(f.sheet).toBeTruthy();
        expect(f.message).toBeTruthy();
        expect(f.basis).toBeTruthy();
      }
    });
  }
});
