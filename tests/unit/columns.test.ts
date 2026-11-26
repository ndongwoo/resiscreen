/** 열을 항목 코드·머리글로 찾기: 2027처럼 열이 끼어들어도 같은 결과, 못 찾으면 ERROR */
import { describe, expect, it } from 'vitest';
import { checkWorkbook } from '../../src/engine/index.ts';
import type { Finding } from '../../src/engine/report.ts';
import { buildXlsx, type CellSpec } from '../helpers/build_xlsx.ts';
import { insertColumns, layout2026, layoutIndex, resolveForLayout, syntheticForm } from '../helpers/synthetic_form.ts';
import { ColumnAmbiguous, ColumnNotFound, confusablePairs, matchItem } from '../../src/engine/columns.ts';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFormulas, loadRules } from '../helpers/load.ts';
import { colToIndex, indexToCol } from '../../src/engine/xlsx/refs.ts';

const rules = loadRules();
const formulas = loadFormulas();

// 2027 신규 열 두 개: CD(A-6-4 l) 뒤 '기관절개술 건수', GC(E-2 b) 뒤 'EPA/핵심역량평가 이수율'
const INSERTS = [
  { after: 'CD', headers: { 5: 'm. 기관절개술 건수' } as Record<number, string> },
  { after: 'GC', headers: { 4: 'EPA/핵심역량평가 이수율' } as Record<number, string> },
];
/** 원래 열 → 끼워 넣은 뒤 열 */
const moved = (col: string) => {
  const i = colToIndex(col);
  return indexToCol(i + (i > colToIndex('CD') ? 1 : 0) + (i > colToIndex('GC') ? 1 : 0));
};
const shiftCell = (f: Finding) => (f.sheet === '전체' && f.cell ? f.cell.replace(/^([A-Z]+)(\d+)$/, (_m, c: string, r: string) => `${moved(c)}${r}`) : f.cell);
const key = (f: Finding, cell = f.cell) => `${f.level}|${f.ruleId}|${f.sheet}|${cell ?? ''}|${f.row ?? ''}|${f.itemCode ?? ''}`;

async function both(patch: Record<string, CellSpec | undefined>) {
  const spec = syntheticForm(rules, formulas, { patch: { 전체: patch } });
  const a = await checkWorkbook({ bytes: await buildXlsx(spec), fileName: 'a.xlsx', rules, formulas });
  const b = await checkWorkbook({ bytes: await buildXlsx(insertColumns(spec, INSERTS)), fileName: 'b.xlsx', rules, formulas });
  return { a, b };
}

describe('열이 끼어든 양식(2027 모양)', () => {
  it('합성 완성본: 결과가 같다', async () => {
    const { a, b } = await both({});
    expect(b.supported).toBe(true);
    expect(b.findings.map((f) => key(f))).toEqual(a.findings.map((f) => key(f, shiftCell(f))));
  });
  it('오류가 있는 합성본: 같은 오류가 옮겨진 열에서 나온다', async () => {
    // 선택 빈칸(K, CE 뒤쪽), 직접입력 빈칸, 숫자 글자, 7행 숫자, 합계 불일치, 수식 덮어쓰기, B-5 계산, A-2-2
    const p = { K7: undefined, CF7: undefined, DS6: 5, FK6: '9년 3개월', H6: undefined, H7: 6, EA6: 0.5, I6: 3, FY6: undefined, GH6: undefined };
    const { a, b } = await both(p);
    expect(a.summary.ERROR).toBeGreaterThan(3);
    expect(b.findings.map((f) => key(f))).toEqual(a.findings.map((f) => key(f, shiftCell(f))));
    // 옮겨진 열에서 실제로 잡혔는지(CF → CG, FY → GA? 아님: FY는 GC 앞이라 한 칸만)
    expect(b.findings.some((f) => f.ruleId === 'S-REQ-SEL' && f.cell === 'CG7')).toBe(true);
    expect(b.findings.some((f) => f.ruleId === 'S-REQ-DIRECT' && f.cell === 'FZ6')).toBe(true);
  });
});

describe('열을 찾지 못하면', () => {
  it("항목 머리글이 없어지면 '양식에서 항목 X를 찾을 수 없습니다' ERROR, 다른 점검은 계속", async () => {
    const cells = layout2026();
    const target = resolveForLayout('{B-5-4}');
    const spec = syntheticForm(rules, formulas);
    const whole = spec.sheets.find((s) => s.name === '전체')!;
    // B-5-4 코드 칸을 지운다(열 자체는 남음)
    delete whole.cells[`${target}3`];
    void cells;
    const r = await checkWorkbook({ bytes: await buildXlsx(spec), fileName: 'x.xlsx', rules, formulas });
    const f = r.findings.filter((x) => x.ruleId === 'S-COL-01');
    expect(f.map((x) => x.detail?.['key'])).toContain('B-5-4');
    expect(f[0]!.message).toContain('양식에서 항목 B-5-4를 찾을 수 없습니다');
    expect(r.supported).toBe(true);
  });
});

describe('머리글 찾기: 정확 일치 → 애매하지 않은 유사 일치', () => {
  const run = async (r: typeof rules, patch: Record<string, CellSpec | undefined> = {}) =>
    checkWorkbook({ bytes: await buildXlsx(syntheticForm(rules, formulas, { patch: { 전체: patch } })), fileName: 'x.xlsx', rules: r, formulas });
  const strip = (fs: Finding[]) => fs.filter((f) => !f.ruleId.startsWith('S-COL')).map((f) => key(f));

  it('공백·기호만 다르면 정확 일치(INFO 없음)', () => {
    expect(resolveForLayout('{A-2-1|②정원책정지도전문의수}')).toBe('I');
    expect(resolveForLayout('{A-6-4|k.수면무호흡  처치 및 수술}')).toBe('CC');
    expect(matchItem(layoutIndex(), 'A-2-1|②정원책정지도전문의수').fuzzy).toBeUndefined();
  });

  it("원본 오타 '둥록자수': 규칙을 '등록자수'로 적으면 유사 일치로 같은 열(GA)과 INFO", async () => {
    expect(layout2026()['GA5']).toContain('둥록자수');
    const fixed = JSON.parse(JSON.stringify(rules).replace(/둥록자수/g, '등록자수')) as typeof rules;
    const [a, b] = [await run(rules), await run(fixed)];
    expect(a.findings.some((f) => f.ruleId.startsWith('S-COL'))).toBe(false);
    const info = b.findings.filter((f) => f.ruleId === 'S-COL-03');
    expect(info).toHaveLength(1);
    expect(info[0]!.level).toBe('INFO');
    expect(info[0]!.cell).toBe('GA3');
    expect(info[0]!.message).toContain('항목 E-2 a를 비슷한 머리글로 찾았습니다');
    expect(info[0]!.message).toContain('등록자수');
    expect(info[0]!.message).toContain('둥록자수');
    expect(strip(b.findings)).toEqual(strip(a.findings));
  });

  it('2등 후보와 차이가 0.1 미만이면 고르지 않고 ERROR', () => {
    // ① 2년차(DJ)를 '년차'로 바꾸면 ① 2년차 규칙 문구는 DJ(0.93)·DK(0.88) 어느 쪽으로도 정하지 않는다
    const cells = { ...layout2026(), DJ5: '① 년차 미 준수 인원' };
    expect(() => matchItem(layoutIndex(cells), 'B-2-1|① 2년차 미 준수 인원')).toThrow(ColumnAmbiguous);
    // 아무 열도 기준에 못 미치면 '찾을 수 없음'
    expect(() => matchItem(layoutIndex(), 'B-2-1|전혀 다른 문구')).toThrow(ColumnNotFound);
  });
});

describe('혼동 주의 머리글(같은 코드 안 유사도 0.8 이상)', () => {
  const pairs = confusablePairs(layoutIndex());
  it('docs/ITEM_COVERAGE.md의 목록과 같다', () => {
    const doc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../docs/ITEM_COVERAGE.md'), 'utf8');
    const section = doc.slice(doc.indexOf('## 혼동 주의 머리글'));
    const listed = [...section.matchAll(/^\| (\S[^|]*?) \| ([A-Z]+) \| [^|]+ \| ([A-Z]+) \|/gm)].map((m) => `${m[1]}:${m[2]}-${m[3]}`);
    expect(listed).toEqual(pairs.map((p) => `${p.code}:${p.a}-${p.b}`));
    expect(pairs.length).toBeGreaterThan(0);
  });
  it.each(pairs.flatMap((p) => [[p.code, p.a, p.b] as const, [p.code, p.b, p.a] as const]))(
    '%s %s 머리글을 조금 바꿔도 %s로 잘못 가지 않는다',
    async (code, changed, other) => {
      const cells = layout2026();
      const hdr = (cells[`${changed}5`] ?? '').replace(/\s+/g, ' ').trim();
      const ruleKey = `${code}|${hdr}`;
      // 두 가지 변형: 숫자를 지움 / 끝에 '(명)'을 붙임
      for (const altered of [hdr.replace(/\d/, ''), `${hdr}(명)`]) {
        const ix = layoutIndex({ ...cells, [`${changed}5`]: altered });
        let col: string | null = null;
        try {
          col = matchItem(ix, ruleKey).col;
        } catch (e) {
          expect(e).toBeInstanceOf(ColumnAmbiguous);
        }
        expect(col).not.toBe(other);
        if (col) expect(col).toBe(changed);
        // 짝이 되는 열의 규칙 문구는 여전히 정확히 자기 열
        const otherKey = `${code}|${(cells[`${other}5`] ?? '').replace(/\s+/g, ' ').trim()}`;
        expect(matchItem(ix, otherKey)).toEqual({ col: other });
      }
    },
  );
  it('통합 점검: B-2-1 ① 머리글을 바꾸면 S-COL-02 ERROR, 그 점검만 건너뛰고 DK로 가지 않는다', async () => {
    const spec = syntheticForm(rules, formulas, { patch: { 전체: { DJ5: '① 년차 미 준수 인원', DJ6: 'x' } } });
    const r = await checkWorkbook({ bytes: await buildXlsx(spec), fileName: 'x.xlsx', rules, formulas });
    expect(r.supported).toBe(true);
    const err = r.findings.filter((f) => f.ruleId === 'S-COL-02');
    expect(err).toHaveLength(1);
    expect(err[0]!.message).toContain('양식에서 항목 B-2-1|① 2년차 미 준수 인원의 열을 하나로 정할 수 없습니다(후보: DJ');
    expect(err[0]!.message).toContain('DK');
    // DJ6~DL6을 보는 점검은 건너뛴다(DJ6에 글자를 넣어도 그 점검 결과가 없음)
    expect(r.findings.some((f) => f.sheet === '전체' && /^D[JKL]6$/.test(f.cell ?? ''))).toBe(false);
  });
});

describe('양식 서명이 맞지 않으면', () => {
  it('어느 칸이 어떻게 다른지와 원본 양식 안내를 보여 준다', async () => {
    const spec = syntheticForm(rules, formulas, { patch: { 표지: { B4: '2025년도 수련실태조사 (임의 수정)' } } });
    const r = await checkWorkbook({ bytes: await buildXlsx(spec), fileName: 'x.xlsx', rules, formulas });
    expect(r.supported).toBe(false);
    const f = r.findings[0]!;
    expect(f.ruleId).toBe('S-FORM-01');
    expect(f.message).toContain('표지 B4');
    expect(f.message).toContain("'2026년도 수련실태조사' 포함");
    expect(f.message).toContain('2025년도 수련실태조사');
    expect(f.message).toContain('학회에서 배포한 양식 원본을 사용하세요');
  });
  it("서명 칸의 연도 문구는 정확히 비교한다: H4의 '2025년'을 '2026년'으로 바꾸면 2026 규칙과 맞지 않는다", async () => {
    const h4 = layout2026()['H4']!;
    expect(h4).toContain('2025년 9/30일 기준');
    const spec = syntheticForm(rules, formulas, { patch: { 전체: { H4: h4.replace('2025년', '2026년') } } });
    const r = await checkWorkbook({ bytes: await buildXlsx(spec), fileName: 'x.xlsx', rules, formulas });
    expect(r.supported).toBe(false);
    const f = r.findings[0]!;
    expect(f.ruleId).toBe('S-FORM-01');
    expect(f.message).toContain('전체 H4');
    expect(f.message).toContain("'2025년 9/30일 기준' 포함");
  });
});
