/**
 * 공개 전 검사(push 전 필수): 작업 트리와 커밋 이력 전체에서 공개하면 안 되는 문자열을 찾는다.
 *   npm run scan:private            (작업 트리 + 모든 커밋)
 *   node dist-node/tools/prepublish_scan.js --tree-only
 *
 * 1) 기본 패턴(항상): 허용 목록 밖의 이메일, 주민등록번호·휴대전화 모양, 추적되는 .xlsx가
 *    tests/fixtures/synthetic/ 밖에 있는지, docs/private·tests/fixtures/private가 추적되는지.
 * 2) 비공개 fixture(tests/fixtures/private/*.xlsx)가 있으면: 병원 파일에서만 나오는 셀 문자열
 *    (모든 파일에 공통인 양식 문구 제외, 한글 3자 이상·그 밖 8자 이상), 논문 제목 3단어 조각,
 *    문서 속성(작성자·수정자) 이름. 공개 학술지 목록(data/journals)과 허용 목록에 있는 말은 뺀다.
 * 찾은 문자열은 화면에 가려서(앞 2자 + ***) 보여 준다. 하나라도 있으면 종료 코드 1.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { loadWorkbook } from '../src/engine/xlsx/workbook.ts';

const root = process.cwd();
const treeOnly = process.argv.includes('--tree-only');
const git = (args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
const gitBuf = (args: string[]) => execFileSync('git', args, { cwd: root, maxBuffer: 1 << 28 });

interface Allow {
  emails: string[];
  email_domains?: string[];
  strings: { text: string; reason: string }[];
}
const allow = JSON.parse(readFileSync(join(root, 'tools/prepublish_allowlist.json'), 'utf8')) as Allow;
const allowStrings = new Set(allow.strings.map((s) => s.text));

const mask = (s: string) => `${[...s].slice(0, 2).join('')}***(${[...s].length}자)`;
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
const TEXT_EXT = /\.(md|json|ts|js|html|css|yml|yaml|txt|csv)$/i;

// ---------- 공개 참고 자료(학술지 목록) ----------
const publicText = ['data/journals/kci.json', 'data/journals/kci_related.json', 'data/journals/kci_aliases.json']
  .filter((p) => existsSync(join(root, p)))
  .map((p) => readFileSync(join(root, p), 'utf8').toLowerCase())
  .join('\n');
// 단어만 이어 붙인 형태(하이픈·기호 차이 무시). 제목 조각 비교에 쓴다
const publicWords = (publicText.match(/[0-9a-z가-힣]+/g) ?? []).join(' ');

// ---------- 비공개 fixture에서 후보 문자열 만들기 ----------
async function privateCandidates(): Promise<{ strings: Set<string>; windows: Set<string> }> {
  const dir = join(root, 'tests/fixtures/private');
  const strings = new Set<string>();
  const windows = new Set<string>();
  if (!existsSync(dir)) return { strings, windows };
  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.xlsx'));
  if (!files.length) return { strings, windows };
  const perFile: Set<string>[] = [];
  const titles = new Set<string>();
  for (const f of files) {
    const bytes = new Uint8Array(readFileSync(join(dir, f)));
    const wb = await loadWorkbook(bytes);
    const vals = new Set<string>();
    for (const s of wb.sheets)
      for (const c of s.cells.values()) {
        if (typeof c.value !== 'string') continue;
        const v = squash(c.value);
        if (!v) continue;
        vals.add(v);
        for (const part of v.split(/[\n,/·]+/)) if (part.trim()) vals.add(squash(part));
        if (s.name === '논문' && c.col === 2 && c.row >= 4 && v.length > 15) titles.add(v);
      }
    perFile.push(vals);
    // 문서 속성 이름
    const zip = await JSZip.loadAsync(bytes);
    const core = (await zip.file('docProps/core.xml')?.async('string')) ?? '';
    for (const m of core.matchAll(/<(?:dc:creator|cp:lastModifiedBy)>([^<]+)</g)) {
      const name = m[1]!.trim();
      if (name && name !== 'anonymous') {
        strings.add(name);
        strings.add(name.replace(/\(.*$/, '').trim());
      }
    }
  }
  const common = perFile.reduce((a, b) => new Set([...a].filter((x) => b.has(x))));
  const commonText = [...common].join('\n');
  for (const vals of perFile)
    for (const v of vals) {
      if (common.has(v) || allowStrings.has(v)) continue;
      if (/^[\d\s.\-:~()%년월일]+$/.test(v)) continue;
      const hangulOnly = /^[가-힣*]+$/.test(v);
      if (!((hangulOnly && [...v].length >= 3) || ([...v].length >= 8 && /[A-Za-z가-힣]/.test(v)))) continue;
      if (commonText.includes(v)) continue; // 양식 문구의 일부
      if (publicText.includes(v.toLowerCase())) continue; // 공개 학술지 목록에 있는 이름
      strings.add(v);
    }
  for (const t of titles) {
    const w = t.toLowerCase().match(/[0-9a-z가-힣]+/g) ?? [];
    for (let i = 0; i + 2 < w.length; i++) {
      const g = w.slice(i, i + 3).join(' ');
      if (g.length >= 12 && !publicWords.includes(g) && !allowStrings.has(g)) windows.add(g);
    }
  }
  return { strings, windows };
}

// ---------- 검사 ----------
interface Hit {
  where: string;
  rule: string;
  sample: string;
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const RRN = /\b\d{6}-[1-4]\d{6}\b/g;
const PHONE = /\b01[016789]-?\d{3,4}-?\d{4}\b/g;
const FAKE = new Set(['example', 'test', 'invalid', 'localhost', 'local']);
const emailAllowed = (e: string) => {
  const d = e.split('@')[1]!.toLowerCase();
  const labels = d.split('.');
  return (
    allow.emails.includes(e.toLowerCase()) ||
    (allow.email_domains ?? []).some((x) => d === x || d.endsWith(`.${x}`)) ||
    labels.some((l) => FAKE.has(l)) // web/contact.ts와 같은 '명백한 예시용 도메인'
  );
};

function scanText(text: string, where: string, cands: { strings: Set<string>; windows: Set<string> }, hits: Hit[]) {
  for (const m of text.matchAll(EMAIL)) if (!emailAllowed(m[0])) hits.push({ where, rule: '이메일', sample: mask(m[0]) });
  for (const m of text.matchAll(RRN)) hits.push({ where, rule: '주민등록번호 모양', sample: mask(m[0]) });
  for (const m of text.matchAll(PHONE)) hits.push({ where, rule: '휴대전화 모양', sample: mask(m[0]) });
  if (cands.strings.size) {
    const flat = squash(text);
    for (const c of cands.strings) if (flat.includes(c)) hits.push({ where, rule: '병원 파일 원문', sample: mask(c) });
  }
  if (cands.windows.size) {
    const low = (text.toLowerCase().match(/[0-9a-z가-힣]+/g) ?? []).join(' ');
    for (const g of cands.windows) if (low.includes(g)) hits.push({ where, rule: '논문 제목 조각', sample: mask(g) });
  }
}

async function xlsxText(bytes: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const parts = Object.keys(zip.files).filter((n) => /\.xml$/.test(n));
  const texts = await Promise.all(parts.map((n) => zip.file(n)!.async('string')));
  return texts.join('\n').replace(/<[^>]+>/g, ' ');
}

const cands = await privateCandidates();
const hits: Hit[] = [];

// 1) 추적 파일 위치 규칙
const tracked = git(['ls-files', '-z']).split('\0').filter(Boolean);
for (const p of tracked) {
  if (/\.(xlsx|xlsm|xls|xlsb)$/i.test(p) && !p.startsWith('tests/fixtures/synthetic/')) hits.push({ where: p, rule: '공개 위치 밖의 엑셀', sample: '-' });
  if (p.startsWith('tests/fixtures/private/') || p.startsWith('docs/private/')) hits.push({ where: p, rule: '비공개 폴더가 추적됨', sample: '-' });
}

// 2) 작업 트리(추적 파일)
for (const p of tracked) {
  const full = join(root, p);
  if (!existsSync(full)) continue;
  if (p === 'package-lock.json') continue;
  if (TEXT_EXT.test(p)) scanText(readFileSync(full, 'utf8'), `작업 트리:${p}`, cands, hits);
  else if (/\.xlsx$/i.test(p)) scanText(await xlsxText(readFileSync(full)), `작업 트리:${p}`, cands, hits);
}

// 3) 커밋 이력 전체(같은 내용 blob은 한 번만) + 커밋 작성자·커밋한 사람의 이메일(공개 저장소에서 보임)
let commits = 0;
if (!treeOnly) {
  for (const line of git(['log', '--all', '--format=%h %ae %ce']).split('\n').filter(Boolean)) {
    const [h, ...emails] = line.split(' ');
    for (const e of new Set(emails)) if (e && !emailAllowed(e) && !/@users\.noreply\.github\.com$/i.test(e)) hits.push({ where: `커밋 ${h} 작성자·커밋한 사람`, rule: '이메일', sample: mask(e) });
  }
  const revs = git(['rev-list', '--all']).split('\n').filter(Boolean);
  commits = revs.length;
  const seen = new Map<string, string[]>();
  for (const r of revs)
    for (const line of git(['ls-tree', '-r', r]).split('\n').filter(Boolean)) {
      const [meta, path] = line.split('\t') as [string, string];
      const sha = meta.split(' ')[2]!;
      const where = `${r.slice(0, 7)}:${path}`;
      seen.set(sha, [...(seen.get(sha) ?? []), where]);
      if (/\.(xlsx|xlsm|xls|xlsb)$/i.test(path) && !path.startsWith('tests/fixtures/synthetic/')) hits.push({ where, rule: '이력: 공개 위치 밖의 엑셀', sample: '-' });
    }
  for (const [sha, wheres] of seen) {
    const path = wheres[0]!.split(':').slice(1).join(':');
    if (path === 'package-lock.json') continue;
    const before = hits.length;
    if (TEXT_EXT.test(path)) scanText(gitBuf(['cat-file', '-p', sha]).toString('utf8'), `이력:${wheres[0]}`, cands, hits);
    else if (/\.xlsx$/i.test(path)) scanText(await xlsxText(gitBuf(['cat-file', '-p', sha])), `이력:${wheres[0]}`, cands, hits);
    for (const h of hits.slice(before)) if (wheres.length > 1) h.where += ` 외 ${wheres.length - 1}곳`;
  }
}

const uniq = new Map(hits.map((h) => [`${h.where}|${h.rule}|${h.sample}`, h]));
console.log(
  `공개 전 검사: 추적 파일 ${tracked.length}개${treeOnly ? '' : `, 커밋 ${commits}개`} · 비공개 fixture 기준 문자열 ${cands.strings.size}개, 제목 조각 ${cands.windows.size}개${cands.strings.size ? '' : ' (fixture 없음: 기본 패턴만 검사)'}`,
);
if (uniq.size === 0) {
  console.log('결과: 0건');
  process.exit(0);
}
console.log(`결과: ${uniq.size}건`);
for (const h of uniq.values()) console.log(`  [${h.rule}] ${h.where}  ${h.sample}`);
process.exit(1);
