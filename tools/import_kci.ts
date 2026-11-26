/**
 * KCI 등재(후보) 학술지 목록 가져오기(연 1회 갱신용).
 *   1) 공공데이터포털 '한국연구재단_KCI학술지정보' CSV를 내려받는다
 *      https://www.data.go.kr/data/3049043/fileData.do  (이용허락범위: 제한 없음)
 *   2) node dist-node/tools/import_kci.js <내려받은.csv> <기준일 YYYY-MM-DD>
 *   → data/journals/kci.json 을 다시 만든다. 등재·등재후보·우수등재만 남긴다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from '../src/engine/journals.ts';

const [file, asOf] = process.argv.slice(2);
if (!file || !asOf || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
  console.error('사용법: import_kci <CSV 파일> <기준일 YYYY-MM-DD>');
  process.exit(2);
}
const raw = readFileSync(file);
// 공공데이터포털 CSV는 보통 CP949(EUC-KR). UTF-8 BOM이면 UTF-8로 읽는다
const text = raw[0] === 0xef && raw[1] === 0xbb ? raw.toString('utf8') : new TextDecoder('euc-kr').decode(raw);
const rows = parseCsv(text);
const header = rows[0]!.map((h) => h.trim());
const col = (name: string) => {
  const i = header.indexOf(name);
  if (i < 0) throw new Error(`열이 없습니다: ${name}`);
  return i;
};
const iE = col('국제표준연속 간행물번호(전자식)');
const iP = col('국제표준연속 간행물번호(종이식)');
const iKo = col('학술지명(국문)');
const iEn = col('학술지명(외국어)');
const iS = col('등재 구분');
const KEEP = new Set(['등재', '등재후보', '우수등재']);
const fmt = (s: string | undefined) => {
  const v = (s ?? '').replace(/[^0-9Xx]/g, '').toUpperCase();
  return /^\d{7}[\dX]$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4)}` : '';
};
const journals = rows
  .slice(1)
  .filter((r) => KEEP.has((r[iS] ?? '').trim()))
  .map((r) => ({ issn: fmt(r[iP]), eissn: fmt(r[iE]), name_ko: (r[iKo] ?? '').trim(), name_en: (r[iEn] ?? '').trim(), status: (r[iS] ?? '').trim() }))
  .sort((a, b) => a.name_ko.localeCompare(b.name_ko, 'ko'));
const out = {
  source: '공공데이터포털 한국연구재단_KCI학술지정보 (https://www.data.go.kr/data/3049043/fileData.do)',
  license: '공공데이터포털 이용허락범위 제한 없음',
  as_of: asOf,
  imported_at: new Date().toISOString().slice(0, 10),
  count: journals.length,
  journals,
};
writeFileSync(join(process.cwd(), 'data/journals/kci.json'), JSON.stringify(out, null, 0).replace(/},{/g, '},\n{') + '\n');
console.log(`KCI 목록 ${journals.length}종 저장(기준일 ${asOf})`);
