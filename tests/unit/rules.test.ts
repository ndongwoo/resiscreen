/** 규칙 타입별 단위 테스트(합성 통합문서). 실제 병원 파일을 쓰지 않는다. */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fillMessages, messageVars } from '../../src/engine/rules.ts';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkWorkbook } from '../../src/engine/index.ts';
import { validateRuleSet } from '../../src/engine/schema.ts';
import type { Finding } from '../../src/engine/report.ts';
import { buildXlsx, type CellSpec } from '../helpers/build_xlsx.ts';
import { syntheticForm, type SyntheticOptions } from '../helpers/synthetic_form.ts';
import { loadFormulas, loadRules, loadSchema } from '../helpers/load.ts';

const rules = loadRules();
const formulas = loadFormulas();

async function run(opts: SyntheticOptions = {}, fileName = 'synthetic.xlsx') {
  const bytes = await buildXlsx(syntheticForm(rules, formulas, opts));
  return checkWorkbook({ bytes, fileName, rules, formulas });
}

const by = (fs: Finding[], id: string) => fs.filter((f) => f.ruleId === id);
const patch = (sheet: string, cells: Record<string, CellSpec | undefined>): SyntheticOptions => ({ patch: { [sheet]: cells } });

describe('규칙 파일', () => {
  it('rules/2026.json이 스키마를 통과한다', () => {
    expect(validateRuleSet(rules, loadSchema())).toEqual([]);
  });
  it('오타·잘못된 단계는 스키마에서 걸린다', () => {
    const bad = structuredClone(rules) as unknown as { rules: Record<string, unknown>[] };
    bad.rules[0]!['level'] = 'ERORR';
    bad.rules[1]!['massage'] = 'x';
    const errs = validateRuleSet(bad, loadSchema());
    expect(errs.some((e) => e.includes('level'))).toBe(true);
    expect(errs.some((e) => e.includes('massage'))).toBe(true);
  });
  it('A병원 완성본용 예외에는 근거 또는 근거 없음 표시가 있다', () => {
    for (const r of rules.rules) for (const e of r.exceptions ?? []) expect(['guideline', 'form_wording', 'faq', 'none']).toContain(e.basis_kind);
  });
});

describe('합성 완성본', () => {
  it('ERROR·WARNING 0건, 한계 안내 INFO만', async () => {
    const r = await run();
    expect(r.supported).toBe(true);
    expect(r.findings.filter((f) => f.level !== 'INFO')).toEqual([]);
    expect(new Set(r.findings.map((f) => f.ruleId))).toEqual(new Set(['A-6-DATE-LIMIT', 'A-6-DUP-01', 'P-PERIOD-LIMIT', 'P-BIB-OFF', 'P-JOUR-SCIE-SKIP']));
  });
});

describe('파일 형식', () => {
  it('.xlsm·.xls 확장자 거부', async () => {
    const r = await run({}, 'x.xlsm');
    expect(r.findings[0]!.ruleId).toBe('S-FILE-01');
    expect((await run({}, 'x.xls')).supported).toBe(false);
  });
  it('모르는 양식이면 ERROR 1건으로 중단', async () => {
    const r = await run(patch('전체', { B3: 'X-1-1' }));
    expect(r.supported).toBe(false);
    expect(r.findings.map((f) => f.ruleId)).toEqual(['S-FORM-01']);
  });
});

describe('required', () => {
  it('선택형 빈칸 → ERROR, 항목 코드 표시', async () => {
    const r = await run(patch('전체', { K7: undefined, B3: 'A-1-1', K3: 'A-2-3' }));
    const f = by(r.findings, 'S-REQ-SEL');
    expect(f.map((x) => x.cell)).toEqual(['K7']);
    expect(f[0]!.itemCode).toBe('A-2-3');
  });
  it('B-6 칸은 빈칸이어도 결과 없음, GH6(수료자 수) 빈칸은 WARNING', async () => {
    const r = await run(patch('전체', { EF7: undefined, EM7: undefined, GH6: undefined }));
    expect(r.findings.filter((f) => f.level !== 'INFO').map((f) => `${f.level}|${f.ruleId}|${f.cell}`)).toEqual(['WARNING|S-GH6|GH6']);
    expect(r.findings.find((f) => f.ruleId === 'S-GH6')!.message).toContain('당해년도 수료자 수 입력 확인');
  });
  it('조건부: CV6=0이면 CW7 빈칸 허용, CV6>0이면 ERROR', async () => {
    expect(by((await run(patch('전체', { CV6: 0, CW7: undefined }))).findings, 'S-REQ-SEL-COND')).toHaveLength(0);
    expect(by((await run(patch('전체', { CV6: 2, CW7: undefined }))).findings, 'S-REQ-SEL-COND')).toHaveLength(1);
  });
  it('직접입력 빈칸 → ERROR', async () => {
    expect(by((await run(patch('전체', { DS6: undefined }))).findings, 'S-REQ-DIRECT').map((f) => f.cell)).toEqual(['DS6']);
  });
  it('필수 시트 누락 → ERROR', async () => {
    const opts = syntheticForm(rules, formulas);
    opts.sheets = opts.sheets.filter((s) => s.name !== 'A-6');
    const r = await checkWorkbook({ bytes: await buildXlsx(opts), fileName: 'x.xlsx', rules, formulas });
    expect(by(r.findings, 'S-SHEET-01').map((f) => f.sheet)).toEqual(['A-6']);
  });
  it('행 단위: 수면무호흡 PSG 빈칸, 양압기·수술 둘 다 빈칸', async () => {
    const r = await run(patch('k 수면무호흡', { C5: undefined, E6: undefined, F6: undefined }));
    expect(by(r.findings, 'A-6-OSA-01').map((f) => f.cell)).toEqual(['C5']);
    expect(by(r.findings, 'A-6-OSA-02').map((f) => f.cell)).toEqual(['E6']);
  });
  it('두경부 양성: 병리 없이 Neck mass만', async () => {
    const r = await run(patch('i 두경부양성', { E5: 'Neck mass' }));
    expect(by(r.findings, 'A-6-PATH-01')).toHaveLength(1);
    const r2 = await run(patch('i 두경부양성', { E5: 'Neck mass', G5: 'Pleomorphic adenoma' }));
    expect(by(r2.findings, 'A-6-PATH-01')).toHaveLength(0);
    const r3 = await run(patch('i 두경부양성', { E5: 'Lipoma', F5: 'Mass excision' }));
    expect(by(r3.findings, 'A-6-PATH-01')).toHaveLength(0);
  });
  it('행 결과가 10건을 넘으면 시트당 1건으로 묶는다', async () => {
    const cells: Record<string, CellSpec | undefined> = {};
    for (let r = 5; r < 25; r++) cells[`C${r}`] = undefined;
    const f = by((await run(patch('k 수면무호흡', cells))).findings, 'A-6-OSA-01');
    expect(f).toHaveLength(1);
    expect(f[0]!.detail?.['count']).toBe(20);
  });
});

describe('dtype', () => {
  it('7행 안내 자리에 숫자 → ERROR', async () => {
    const f = by((await run(patch('전체', { H6: undefined, H7: 6 }))).findings, 'S-WRONGROW-01');
    expect(f.map((x) => x.cell)).toEqual(['H7']);
  });
  it('수식이 참조하는 칸의 글자 → ERROR, 참조하지 않는 칸 → WARNING', async () => {
    const r = await run(patch('전체', { FK6: '9년 3개월', DP6: '3회' }));
    const f = by(r.findings, 'S-DTYPE-NUM');
    expect(f.find((x) => x.cell === 'FK6')!.level).toBe('ERROR');
    expect(f.find((x) => x.cell === 'DP6')!.level).toBe('WARNING');
  });
  it('자동계산 수식이 값으로 바뀜 → WARNING, 논문은 제목 있는 행만', async () => {
    const r = await run({ patch: { 전체: { EA6: 0.5 }, 논문: { S5: 0.5, S30: 1 } } });
    expect(by(r.findings, 'S-FORMULA-01').map((f) => `${f.sheet}!${f.cell}`).sort()).toEqual(['논문!S5', '전체!EA6']);
  });
  it('엑셀 오류값 → WARNING', async () => {
    expect(by((await run(patch('전체', { EA6: { f: 'DZ6/Q6', v: '#DIV/0!', t: 'e' } }))).findings, 'S-EXCEL-ERR')).toHaveLength(1);
  });
});

describe('sum_match', () => {
  it('전체 값과 수술 시트 총 건수가 다르면 ERROR', async () => {
    const r = await run(patch('전체', { BS6: 79 }));
    expect(by(r.findings, 'S-SUM-01').map((f) => f.cell)).toEqual(['BS6']);
  });
  it('DS6(직접입력)과 B-2-3 합계', async () => {
    expect(by((await run(patch('전체', { DS6: 5 }))).findings, 'S-SUM-01').map((f) => f.cell)).toEqual(['DS6']);
  });
});

describe('rows_vs_total', () => {
  it('행 수 ≠ 총 건수 → WARNING', async () => {
    const r = await run({ patch: { 'a 고실': { G1: '81' }, 전체: { BS6: { f: "'a 고실'!G1", v: 81 } } } });
    expect(by(r.findings, 'A-6-ROWS-01').map((f) => f.sheet)).toEqual(['a 고실']);
  });
  it('ESS 소계 합 ≠ 총 건수 → ERROR', async () => {
    const r = await run(patch('b ESS', { H5: 1 }));
    expect(by(r.findings, 'A-6-ESS-SIDES')).toHaveLength(1);
  });
  it('총 건수 칸이 글자 → ERROR', async () => {
    const r = await run(patch('c 두경부악성', { G1: '팔십' }));
    expect(by(r.findings, 'A-6-ROWS-01').find((f) => f.sheet === 'c 두경부악성')!.level).toBe('ERROR');
  });
});

describe('period', () => {
  it('연도 있는 수술 날짜가 기간 밖 → WARNING, 연도 없는 날짜만 있으면 INFO', async () => {
    const r = await run(patch('a 고실', { C5: { v: 45300, s: 2 } })); // 2024-01-10
    expect(by(r.findings, 'A-6-DATE-01').map((f) => f.cell)).toEqual(['C5']);
    expect(by(r.findings, 'A-6-DATE-LIMIT').length).toBeGreaterThan(0);
  });
  it('B-2-3 일시는 2025-03~2026-02', async () => {
    expect(by((await run(patch('B-2-3', { C3: '2026.02.20' }))).findings, 'P-PERIOD-MARFEB')).toHaveLength(0);
    expect(by((await run(patch('B-2-3', { C3: '2025.02.20' }))).findings, 'P-PERIOD-MARFEB')).toHaveLength(1);
  });
});

describe('threshold', () => {
  it('과락 미달 → WARNING(파견수련보고서 확인)', async () => {
    const r = await run(patch('전체', { BU6: { f: "'c 두경부악성'!G1", v: 3 } }));
    const f = by(r.findings, 'A-6-MIN-01');
    expect(f).toHaveLength(1);
    expect(f[0]!.message).toContain('파견수련보고서');
  });
});

describe('evidence', () => {
  it('가리지 않은 이름 → 시트당 WARNING 1건, 이름은 결과에 없음', async () => {
    const r = await run(patch('d T&A', { D5: '가나다', D9: '라마바' }));
    const f = by(r.findings, 'A-6-PRIV-01');
    expect(f).toHaveLength(1);
    expect(JSON.stringify(f)).not.toContain('가나다');
    expect(f[0]!.detail?.['count']).toBe(2);
  });
  it('환자 식별 칸이 있으면 같은 값을 찾아 WARNING', async () => {
    const r = await run({ patch: { 'b ESS': { K4: '등록번호', K5: 'X001' }, 'e 비중격': { K4: '등록번호', K7: 'X001' } } });
    const f = by(r.findings, 'A-6-DUP-01');
    expect(f.some((x) => x.level === 'WARNING' && x.sheet === 'e 비중격' && x.cell === 'K7')).toBe(true);
  });
  it('A-6 확인서 첨부 없음 → WARNING', async () => {
    const spec = syntheticForm(rules, formulas);
    spec.sheets.find((s) => s.name === 'A-6')!.oles = [];
    const r = await checkWorkbook({ bytes: await buildXlsx(spec), fileName: 'x.xlsx', rules, formulas });
    expect(by(r.findings, 'A-6-EVID-01')).toHaveLength(1);
  });
  it('논문 행에 짝지을 첨부가 없으면 그 행만 WARNING(±1행 허용)', async () => {
    const spec = syntheticForm(rules, formulas, { papers: 3 });
    spec.sheets.find((s) => s.name === '논문')!.oles = [{ row: 3, col: 20 }, { row: 5, col: 20 }];
    const r = await checkWorkbook({ bytes: await buildXlsx(spec), fileName: 'x.xlsx', rules, formulas });
    expect(by(r.findings, 'P-EVID-01').map((f) => f.cell)).toEqual(['T6']);
  });
});

describe('B-2-3 학술대회', () => {
  it('연수회·포럼 등 정기학술대회가 아닐 수 있는 행사 → WARNING', async () => {
    const r = await run(
      patch('B-2-3', {
        B4: '두경부 연구 포럼', C4: '2025.09.27', E4: '가*나', F4: 1,
        B5: '증례 학술대회', C5: '2025.10.01', E5: '가*나', F5: 1,
        B6: '봄 Symposium', C6: '2025.05.01', E6: '가*나', F6: 1,
        B7: 'International Workshop on Rhinology', C7: '2025.06.01', E7: '가*나', F7: 1,
        F13: { f: 'SUM(F3:F12)', v: 6 },
      }),
    );
    const f = by(r.findings, 'B-2-3-KIND');
    expect(f.map((x) => x.cell)).toEqual(['B4', 'B5', 'B6']);
    expect(f.every((x) => x.level === 'WARNING')).toBe(true);
    expect(by(r.findings, 'B-2-3-INTL').map((x) => `${x.cell}:${x.level}`)).toEqual(['B7:INFO']);
  });
  it('같은 학술대회 I·II를 나눠 적음 → WARNING', async () => {
    const r = await run({
      patch: {
        'B-2-3': { B3: '제9차 합성학회 추계대회 I', C3: { v: 45901, s: 2 }, D3: '가상회관', B4: '제9차 합성학회 추계대회 II', C4: { v: 45902, s: 2 }, D4: '가상회관', E4: '가*나', F4: 2, F13: { f: 'SUM(F3:F12)', v: 4 } },
        전체: { DS6: 4 },
      },
    });
    const f = by(r.findings, 'B-2-3-DUP');
    expect(f.map((x) => x.cell)).toEqual(['F4']);
    expect(f[0]!.detail).toMatchObject({ same_as_row: 3 });
  });
});

describe('recalc', () => {
  it('A-2-2: n(연차별 최댓값) ≤ N-3 계산과 선택값이 다르면 WARNING', async () => {
    const r = await run(patch('전체', { I6: 3 })); // n=1, N-3=0 → 미충족인데 '충족' 선택
    const f = by(r.findings, 'A-2-2-RECALC');
    expect(f.map((x) => x.level)).toEqual(['WARNING']);
    expect(f[0]!.detail).toMatchObject({ n: 1, N: 3, expected: 'N-3 미충족' });
  });
  it('A-2-2: 정원 합계가 커도 연차별 최댓값 기준으로 충족이면 결과 없음', async () => {
    expect(by((await run(patch('전체', { I6: 4 }))).findings, 'A-2-2-RECALC')).toHaveLength(0); // n=1 ≤ 1
  });
  it('FX7: FV6=0이고 빈칸이면 해당없음 선택 WARNING, FV6>0이면 ERROR', async () => {
    const a = await run(patch('전체', { FV6: { f: "'A-3-2'!D9", v: 0 }, FX7: undefined }));
    expect(by(a.findings, 'S-FX7-NA').map((f) => f.level)).toEqual(['WARNING']);
    expect(by(a.findings, 'S-REQ-SEL-COND2')).toHaveLength(0);
    const b = await run(patch('전체', { FX7: undefined }));
    expect(by(b.findings, 'S-REQ-SEL-COND2').map((f) => f.level)).toEqual(['ERROR']);
    expect(by(b.findings, 'S-FX7-NA')).toHaveLength(0);
  });
  it('B-5: 저장값이 계산과 다르면 ERROR', async () => {
    const r = await run(patch('전체', { EB6: { f: 'BR6/DT6', v: 800 / 3 } }));
    expect(by(r.findings, 'B-5-RECALC').map((x) => x.cell)).toEqual(['EB6']);
  });
  it('B-5: 분모(Q6)를 현원으로 바꾸면 Q6 ERROR', async () => {
    const r = await run(patch('전체', { Q6: { f: "'A-3-2'!C9", v: 3 }, EB6: { f: 'BR6/Q6', v: 800 / 3 } }));
    expect(by(r.findings, 'B-5-RECALC').map((x) => x.cell)).toContain('Q6');
  });
  it('B-4-3: 논문 점수 ÷ 전공의 총 정원(EA6 = DZ6/Q6)과 다르면 ERROR', async () => {
    const r = await run(patch('전체', { EA6: { f: 'DZ6/DT6', v: 99 } }));
    const f = by(r.findings, 'B-4-3-RECALC');
    expect(f.map((x) => [x.level, x.cell])).toEqual([['ERROR', 'EA6']]);
    expect(f[0]!.message).toContain('입력 99');
  });
  it('B-2-3 a/b: 참석 횟수 ÷ 10/1 근무 전공의 수(DU8 = DS6/DT6)와 다르면 ERROR', async () => {
    const r = await run(patch('전체', { DU8: 3 })); // 2/4 = 0.5인데 3을 덮어씀
    const f = by(r.findings, 'B-2-3-RECALC');
    expect(f.map((x) => [x.level, x.cell])).toEqual([['ERROR', 'DU8']]);
    expect(f[0]!.detail).toMatchObject({ expected: 0.5, observed: 3 });
    // 분모가 0이면 재계산하지 않는다(#DIV/0!은 다른 점검이 본다)
    expect(by((await run(patch('전체', { DT6: { f: "'A-3-2'!C9", v: 0 }, DU8: '#DIV/0!' }))).findings, 'B-2-3-RECALC')).toHaveLength(0);
  });
  it('C-4: 논문 점수 ÷ 전문의 수', async () => {
    expect(by((await run(patch('전체', { FO6: { f: 'DZ6/I6', v: 2 / 8 } }))).findings, 'C-4-RECALC').map((f) => f.level)).toEqual(['ERROR']);
  });
  it('재계산 단계 통일: 양식 수식대로 계산하는 규칙은 ERROR, 해석이 필요한 A-2-2만 WARNING', () => {
    const level = Object.fromEntries(rules.rules.filter((r) => r.type === 'recalc').map((r) => [r.id, r.level]));
    expect(level).toEqual({ 'A-2-2-RECALC': 'WARNING', 'B-5-RECALC': 'ERROR', 'C-4-RECALC': 'ERROR', 'B-4-3-RECALC': 'ERROR', 'B-2-3-RECALC': 'ERROR' });
  });
});

describe('메시지 자리표시(연도·기준일)', () => {
  const ruleFiles = readdirSync(join(dirname(fileURLToPath(import.meta.url)), '../../rules')).filter((f) => /^\d{4}\.json$/.test(f));
  const raw = (f: string) => JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../rules', f), 'utf8')) as typeof rules;
  it.each(ruleFiles)('%s: 규칙 메시지·양식 이름에 4자리 연도를 직접 적지 않는다', (f) => {
    const r = raw(f);
    const texts = [['form.label', r.form.label], ...r.rules.flatMap((x) => [[x.id, x.message], [`${x.id}.message_referenced`, x.message_referenced ?? '']])];
    for (const [where, t] of texts) expect(t, where).not.toMatch(/(?<!\d)\d{4}(?!\d)/);
  });
  it.each(ruleFiles)('%s: 채운 뒤 모르는 자리표시가 남지 않는다', (f) => {
    const r = fillMessages(raw(f));
    for (const t of [r.form.label, ...r.rules.flatMap((x) => [x.message, x.message_referenced ?? ''])]) expect(t).not.toMatch(/\{[a-z_0-9]+\}/);
  });
  it('2026: 채운 문구가 바꾸기 전 문구와 같다', () => {
    const r = fillMessages(rules);
    const m = Object.fromEntries(r.rules.map((x) => [x.id, x.message]));
    expect(r.form.label).toBe('2026년도 수련실태조사 (2025년 1/1일~12/31일 실적)');
    expect(m['S-FORM-01']).toBe('지원하지 않는 양식입니다. 2026년도 수련실태조사 양식인지 확인하세요.');
    expect(m['A-6-DATE-LIMIT']).toBe("수술 날짜가 'O월 O일' 형식이라 연도가 없어 2025년 1~12월 기간 검사를 자동으로 할 수 없습니다(연도가 적힌 행만 검사).");
    expect(m['A-6-DATE-01']).toBe('수술(검사) 날짜가 2025년 1~12월 밖입니다.');
    expect(m['P-PERIOD-MARFEB']).toBe('B-2-3: 학술대회 일시가 2025년 3월~2026년 2월 밖입니다.');
    expect(m['P-PERIOD-LIMIT']).toBe("A-3-3(파견기간 '0개월')·A-10-3(월별 당직표)은 날짜 칸이 없어 2025년 3월~2026년 2월 기간 검사를 자동으로 할 수 없습니다.");
  });
  it('다른 해에는 그 해 기준일로 채운다(2028 윤년 포함)', () => {
    const v27 = messageVars({ ...rules, form: { ...rules.form, year: 2027 } });
    expect(v27).toMatchObject({ form_year: '2027', perf_period: '2026년 1~12월', marfeb_period: '2026년 3월~2027년 2월', staff_count_date: '2026년 9월 30일' });
    expect(messageVars({ ...rules, form: { ...rules.form, year: 2028 } }).feb_end).toBe('2028년 2월 29일');
    // reference에 직접 적은 기간이 있으면 그 값으로
    const custom = messageVars({ ...rules, reference: { ...rules.reference, period_default: { start: '2025-03-01', end: '2025-12-15' } } });
    expect(custom.perf_period).toBe('2025년 3월 1일~2025년 12월 15일');
  });
  it('재계산 메시지: 양식 수식대로 계산한 값과 다름 → 수식 훼손·값 덮어쓰기 확인', () => {
    for (const id of ['B-5-RECALC', 'C-4-RECALC', 'B-4-3-RECALC', 'B-2-3-RECALC']) {
      const msg = rules.rules.find((r) => r.id === id)!.message;
      expect(msg, id).toContain('양식 수식(');
      expect(msg, id).toContain('수식이 지워졌거나 값을 직접 고쳤는지 확인하세요.');
    }
    expect(rules.rules.find((r) => r.id === 'C-4-RECALC')!.message).toBe('C-4: 양식 수식(논문 점수 ÷ 전체 시트의 총 전문의 수)으로 계산한 값과 다릅니다. 수식이 지워졌거나 값을 직접 고쳤는지 확인하세요.');
  });
});

describe('생성 문서', () => {
  const doc = (name: string) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../docs', name), 'utf8');
  it('ITEM_COVERAGE.md: 한 항목에 같은 점검이 두 번 나오지 않는다(DU·GA 6·8행 수식)', () => {
    const rows = doc('ITEM_COVERAGE.md').split('\n').filter((l) => /^\| \d+ \| [A-Z]+ \|/.test(l));
    expect(rows).toHaveLength(190);
    for (const l of rows) {
      const checks = l.split(' | ').at(-1)!.replace(/ \|$/, '').split('; ');
      expect(new Set(checks).size, l).toBe(checks.length);
    }
    const du = rows.find((l) => l.includes('| DU |'))!;
    expect(du).toContain('자동계산 수식 훼손 WARNING [S-FORMULA-01] (6·8행)');
    expect(du).toContain('[B-2-3-RECALC]');
    expect(rows.find((l) => l.includes('| EA |'))).toContain('[B-4-3-RECALC]');
  });
  it('꺼 둔 B-6-EPORTFOLIO는 B-6 칸이 비어도 결과(INFO 포함)를 내지 않고, 문서도 그렇게 적는다', async () => {
    const r = await run(patch('전체', { EF7: undefined, EG7: undefined, EM7: undefined }));
    expect(r.findings.filter((f) => f.ruleId === 'B-6-EPORTFOLIO' || /^E[F-M]7$/.test(f.cell ?? ''))).toEqual([]);
    for (const name of ['RULES.md', 'ITEM_COVERAGE.md']) expect(doc(name)).not.toMatch(/빈칸 INFO\(비활성\)|INFO만\)/);
    expect(doc('RULES.md')).toContain('| B-6-EPORTFOLIO | required | INFO | 끔(결과 없음) |');
    expect(doc('RULES.md')).toContain('| S-DTYPE-NUM | dtype | ERROR/WARNING(수식 참조 여부에 따라) |');
  });
  it('RULES.md: 규칙 파일의 모든 ID와 이전 ID 매핑이 있고, 이전 ID는 규칙에 남아 있지 않다', () => {
    const d = doc('RULES.md');
    for (const r of rules.rules) expect(d).toContain(`| ${r.id} |`);
    expect(d).toContain('| A-6-SUM-01 | S-SUM-01 |');
    expect(rules.rules.some((r) => r.id === 'A-6-SUM-01')).toBe(false);
    expect(d).toContain(rules.rules_version);
  });
});

describe('결정성', () => {
  it('같은 입력이면 같은 결과', async () => {
    const a = await run(patch('전체', { K7: undefined, DS6: 9 }));
    const b = await run(patch('전체', { K7: undefined, DS6: 9 }));
    expect(a.findings).toEqual(b.findings);
  });
});
