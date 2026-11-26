import { describe, expect, it } from 'vitest';
import { parseXml, decodeEntities, child } from '../../src/engine/xlsx/xml.ts';
import { expandRange, formulaRefs, parseSheetRef, translateFormula } from '../../src/engine/xlsx/refs.ts';
import { isDateFormat, loadWorkbook, serialToISODate, WorkbookError } from '../../src/engine/xlsx/workbook.ts';
import { parseLooseDate, toNumber } from '../../src/engine/values.ts';
import { buildXlsx } from '../helpers/build_xlsx.ts';

describe('XML 파서', () => {
  it('엔티티·숫자 참조를 푼다', () => {
    expect(decodeEntities('a &lt;b&gt; &amp; &#44032;&#xAC00; &unknown;')).toBe('a <b> & 가가 &unknown;');
  });
  it('접두사·속성 안의 > 와 CDATA·주석을 처리한다', () => {
    const root = parseXml('<?xml version="1.0"?><!-- c --><x:a k="1>2" r:id="r5"><x:b><![CDATA[<raw>]]></x:b><c/></x:a>');
    const a = child(root, 'a')!;
    expect(a.attrs['k']).toBe('1>2');
    expect(a.attrs['id']).toBe('r5');
    expect(child(a, 'b')!.text).toBe('<raw>');
    expect(child(a, 'c')).toBeDefined();
  });
  it('줄 끝 CRLF·CR을 LF로 정규화하고 &#13;은 유지', () => {
    const root = parseXml('<a>x\r\ny\rz&#13;</a>');
    expect(child(root, 'a')!.text).toBe('x\ny\nz\r');
  });
  it('짝이 맞지 않으면 오류', () => {
    expect(() => parseXml('<a><b></a>')).toThrow();
  });
  it('DOCTYPE의 엔티티 정의를 해석하지 않는다(XXE 없음)', () => {
    const root = parseXml('<!DOCTYPE a [<!ENTITY x SYSTEM "file:///etc/passwd">]><a>&x;</a>');
    expect(child(root, 'a')!.text).toBe('&x;');
  });
});

describe('셀 참조', () => {
  it('범위 펼치기와 시트 참조', () => {
    expect(expandRange('B6:D6')).toEqual(['B6', 'C6', 'D6']);
    expect(parseSheetRef("'a 고실'!$G$1")).toEqual({ sheet: 'a 고실', ref: 'G1' });
    expect(parseSheetRef('전체!BS6')).toEqual({ sheet: '전체', ref: 'BS6' });
  });
  it('공유 수식 이동: 상대 참조만 옮기고 $와 문자열은 유지', () => {
    expect(translateFormula('IF(B7="예",1,0)', 'B6', 'C6')).toBe('IF(C7="예",1,0)');
    expect(translateFormula('$A$1+A1+SUM(B4:B8)', 'C3', 'D5')).toBe('$A$1+B3+SUM(C6:C10)');
    expect(translateFormula("'A-3-2'!B9+\"B9\"", 'Q6', 'Q7')).toBe("'A-3-2'!B10+\"B9\"");
  });
  it('수식이 참조하는 셀 목록(문자열·함수명 제외)', () => {
    const refs = formulaRefs('IF(FK6=0,"A1",IF(FK6<2*Q6,3,LOG10(2)))+\'a 고실\'!G1');
    const flat = refs.map((r) => `${r.sheet ?? ''}!${r.range.start.col},${r.range.start.row}`);
    expect(flat).toContain('!167,6'); // FK6
    expect(flat).toContain('!17,6'); // Q6
    expect(flat).toContain('a 고실!7,1');
    expect(flat.some((f) => f.endsWith('1,1'))).toBe(false); // 문자열 "A1" 무시
  });
});

describe('날짜 시리얼', () => {
  it('1900 체계(윤년 버그 포함)와 1904 체계', () => {
    expect(serialToISODate(1)).toBe('1900-01-01');
    expect(serialToISODate(59)).toBe('1900-02-28');
    expect(serialToISODate(60)).toBe('1900-02-29');
    expect(serialToISODate(61)).toBe('1900-03-01');
    expect(serialToISODate(45658)).toBe('2025-01-01');
    expect(serialToISODate(0, true)).toBe('1904-01-01');
  });
  it('날짜 표시 형식 판별', () => {
    expect(isDateFormat('yyyy\\-mm\\-dd')).toBe(true);
    expect(isDateFormat('[$-F800]dddd\\,\\ mmmm\\ dd\\,\\ yyyy')).toBe(true);
    expect(isDateFormat('0_);[Red]\\(0\\)')).toBe(false);
    expect(isDateFormat('"월"0')).toBe(false);
    expect(isDateFormat('@')).toBe(false);
  });
});

describe('xlsx 읽기', () => {
  it('공유·인라인·서식 있는 문자열, 숫자, 날짜, 수식 캐시, 병합, 첨부 앵커', async () => {
    const bytes = await buildXlsx({
      sheets: [
        {
          name: '시험',
          cells: {
            A1: '공유 문자열',
            A2: { v: '인라인', inline: true },
            A3: { rich: ['굵은', ' 글씨'] },
            A4: { rich: ['인라인', '서식'], inline: true },
            B1: 12.5,
            B2: { v: 45658, s: 1 },
            B3: { v: 45717, s: 2 },
            B4: { v: 45658, s: 0 },
            C1: { f: 'B1*2', v: 25 },
            C2: { f: 'A1&"x"', v: '공유 문자열x' },
            C3: { f: '1/0', v: '#DIV/0!', t: 'e' },
            C4: { f: 'TRUE()', v: true },
            D1: { f: 'B1+1', v: 13.5, shared: { si: 0, ref: 'D1:D3' } },
            D2: { v: 1, shared: { si: 0 } },
            D3: { shared: { si: 0 } },
            E1: { v: '#N/A', t: 'e' },
            E2: '줄_x000A_바꿈_x005F_x',
          },
          merged: ['F1:G2'],
          oles: [{ row: 5, col: 20 }],
          hyperlinks: [{ ref: 'A1', location: '전체!A1' }, { ref: 'A2', url: 'https://example.org/x' }],
        },
      ],
    });
    const wb = await loadWorkbook(bytes);
    const s = wb.sheetByName.get('시험')!;
    const v = (r: string) => s.cells.get(r)?.value;
    expect(v('A1')).toBe('공유 문자열');
    expect(v('A2')).toBe('인라인');
    expect(v('A3')).toBe('굵은 글씨'); // 루비(rPh) 제외
    expect(v('A4')).toBe('인라인서식');
    expect(v('B1')).toBe(12.5);
    expect(s.cells.get('B2')!.isDate).toBe(true);
    expect(parseLooseDate(s.cells.get('B2'))).toMatchObject({ year: 2025, month: 1, day: 1 });
    expect(s.cells.get('B3')!.isDate).toBe(true);
    expect(s.cells.get('B4')!.isDate).toBe(false);
    expect(v('C1')).toBe(25);
    expect(s.cells.get('C1')!.formula).toBe('B1*2');
    expect(v('C2')).toBe('공유 문자열x');
    expect(s.cells.get('C3')!.type).toBe('e');
    expect(v('C4')).toBe(true);
    expect(s.cells.get('D2')!.formula).toBe('B2+1');
    expect(s.cells.get('D3')!.formula).toBe('B3+1');
    expect(s.cells.get('D3')!.value).toBeNull();
    expect(v('E1')).toBe('#N/A');
    expect(v('E2')).toBe('줄\n바꿈_x');
    expect(s.merged).toEqual(['F1:G2']);
    expect(s.embedded).toHaveLength(1); // Choice/Fallback 중복 제거
    expect(s.embedded[0]).toMatchObject({ row: 5, col: 20, progId: 'Acrobat Document' });
    expect(s.hyperlinks[1]!.target).toBe('https://example.org/x');
    expect(wb.embeddingParts).toHaveLength(1);
  });
  it('1904 날짜 체계', async () => {
    const wb = await loadWorkbook(await buildXlsx({ date1904: true, sheets: [{ name: 'a', cells: { A1: { v: 0, s: 1 } } }] }));
    expect(parseLooseDate(wb.sheets[0]!.cells.get('A1'), wb.date1904)).toMatchObject({ year: 1904, month: 1, day: 1 });
  });
  it('zip이 아니면·매크로가 있으면 거부', async () => {
    await expect(loadWorkbook(new TextEncoder().encode('hello'))).rejects.toBeInstanceOf(WorkbookError);
    const macro = await buildXlsx({ macro: true, sheets: [{ name: 'a', cells: { A1: 1 } }] });
    await expect(loadWorkbook(macro)).rejects.toMatchObject({ code: 'macro' });
  });
});

describe('값 해석', () => {
  const cell = (value: string | number) => ({ ref: 'A1', row: 1, col: 1, value, type: typeof value === 'number' ? 'n' : 's', numFmt: 'General', isDate: false }) as const;
  it('숫자 모양 문자열', () => {
    expect(toNumber(cell('1,234'))).toBe(1234);
    expect(toNumber(cell(' 12 '))).toBe(12);
    expect(toNumber(cell('9년 3개월'))).toBeNull();
  });
  it('연도 없는 날짜와 연도 있는 날짜', () => {
    expect(parseLooseDate(cell('1월 7일'))).toMatchObject({ month: 1, day: 7, noYear: true, invalid: false });
    expect(parseLooseDate(cell('2025.05'))).toMatchObject({ year: 2025, month: 5, noYear: false });
    expect(parseLooseDate(cell('2025년 3월 2일'))).toMatchObject({ year: 2025, month: 3, day: 2 });
    expect(parseLooseDate(cell('25.3.2')).invalid).toBe(true); // 두 자리 연도는 추정하지 않음
  });
});
