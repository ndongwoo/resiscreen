#!/usr/bin/env node
/**
 * resiscreen CLI (학회 내부 일괄 처리용)
 *   resiscreen check <파일들...> --out <폴더> [--rules rules/YYYY.json(없으면 rules/의 모든 연도)] [--no-biblio]
 *                    [--scie <SCIE 목록.xlsx|csv>] [--cache <캐시 파일>]
 * 파일마다 <이름>.점검결과.xlsx 와 <이름>.result.json 을 만든다.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkWorkbook } from '../engine/index.ts';
import { reportToStableJson, reportToXlsx } from '../engine/export.ts';
import { resolveReference, type FormFormulas, type RuleSet } from '../engine/rules.ts';
import { validateRuleSet } from '../engine/schema.ts';
import { BiblioClient } from '../engine/biblio/client.ts';
import { BiblioCache } from '../engine/biblio/cache.ts';
import type { BiblioSettings } from '../engine/biblio/types.ts';
import { applyAliases, parseJournalListFile, type JournalLists } from '../engine/journals.ts';
import type { FetchLike } from '../engine/biblio/throttle.ts';
import { FileCache } from './filecache.ts';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';

function repoRoot(): string {
  // src/cli/index.ts 또는 dist-node/src/cli/index.js 어디서 실행해도 저장소 루트를 찾는다
  const here = dirname(fileURLToPath(import.meta.url));
  return here.includes('dist-node') ? resolve(here, '../../..') : resolve(here, '../..');
}

/** 앱 버전 = 저장소의 git 커밋(없으면 package.json 버전) */
function appVersion(): string {
  try {
    const opt = { cwd: repoRoot(), encoding: 'utf8' as const, stdio: ['ignore', 'pipe', 'ignore'] as ['ignore', 'pipe', 'ignore'] };
    const sha = execFileSync('git', ['rev-parse', '--short=8', 'HEAD'], opt).trim();
    const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], opt).trim();
    return dirty ? `${sha}-dirty` : sha;
  } catch {
    return 'unknown';
  }
}

function usage(): never {
  console.error('사용법: resiscreen check <파일.xlsx...> --out <폴더> [--rules <규칙.json>] [--no-biblio] [--scie <목록>] [--cache <파일>] [--mailto <연락처>]');
  process.exit(2);
}

export async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  if (cmd !== 'check') usage();
  const files: string[] = [];
  let out = 'out';
  let rulesPath = ''; // 비우면 rules/ 폴더의 모든 연도 파일
  let useBiblio = true;
  let sciePath = '';
  let cachePath = join(homedir(), '.cache/resiscreen/biblio.json');
  let mailto = '';
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === '--out') out = rest[++i] ?? usage();
    else if (a === '--rules') rulesPath = rest[++i] ?? usage();
    else if (a === '--no-biblio') useBiblio = false;
    else if (a === '--scie') sciePath = rest[++i] ?? usage();
    else if (a === '--cache') cachePath = rest[++i] ?? usage();
    else if (a === '--mailto') mailto = rest[++i] ?? usage();
    else files.push(a);
  }
  if (files.length === 0) usage();
  // 규칙: rules/의 모든 연도 파일(YYYY.json)을 읽어 엑셀 signature로 고른다. --rules면 그 파일 하나만
  const schema = JSON.parse(await readFile(join(repoRoot(), 'rules/schema.json'), 'utf8'));
  const rulePaths = rulesPath
    ? [rulesPath]
    : readdirSync(join(repoRoot(), 'rules'))
        .filter((f) => /^\d{4}\.json$/.test(f))
        .map((f) => join(repoRoot(), 'rules', f));
  const rulesets: RuleSet[] = [];
  const formulas: Record<number, FormFormulas> = {};
  for (const p of rulePaths) {
    const rs = JSON.parse(await readFile(p, 'utf8')) as RuleSet;
    const errs = validateRuleSet(rs, schema);
    if (errs.length) {
      console.error(`규칙 파일 오류(${p}):\n  ${errs.join('\n  ')}`);
      return 2;
    }
    rulesets.push(rs);
    const fp = join(repoRoot(), `data/forms/${rs.form.year}_formulas.json`);
    if (existsSync(fp)) formulas[rs.form.year] = JSON.parse(await readFile(fp, 'utf8')) as FormFormulas;
  }
  if (!rulesets.length) {
    console.error('규칙 파일이 없습니다(rules/YYYY.json).');
    return 2;
  }
  // 서지 설정·학술지 목록 경로는 가장 최근 연도 규칙을 따른다
  const rules = rulesets.slice().sort((a, b) => b.form.year - a.form.year)[0]!;
  const journals: JournalLists = {};
  for (const [k, rel] of Object.entries(rules.papers?.journal_lists ?? {})) {
    if (k === 'kci' || k === 'related') journals[k] = JSON.parse(await readFile(join(repoRoot(), rel), 'utf8'));
  }
  const aliasPath = rules.papers?.journal_lists?.['kci_aliases'];
  if (aliasPath && journals.kci) journals.kci = applyAliases(journals.kci, JSON.parse(await readFile(join(repoRoot(), aliasPath), 'utf8')).aliases);
  if (sciePath) journals.scie = await parseJournalListFile(new Uint8Array(await readFile(sciePath)), basename(sciePath));
  const fileCache = new FileCache(cachePath);
  const settings = rules.biblio as unknown as BiblioSettings | undefined;
  // 파일마다 새 클라이언트를 만들어 출처별 집계가 파일 사이에 섞이지 않게 한다(캐시는 공유)
  const makeClient = () =>
    useBiblio && settings ? new BiblioClient(fetch as unknown as FetchLike, settings, new BiblioCache(fileCache, settings.cache_ttl_days), resolveReference(rules).paper_year, mailto || settings.mailto) : null;
  const app = appVersion();
  await mkdir(out, { recursive: true });
  let worst = 0;
  for (const f of files) {
    const bytes = new Uint8Array(await readFile(f));
    const report = await checkWorkbook({ bytes, fileName: basename(f), rules: rulesets, formulas, biblio: makeClient(), journals, appVersion: app });
    fileCache.flush();
    const stem = basename(f).replace(/\.[^.]+$/, '');
    await writeFile(join(out, `${stem}.result.json`), reportToStableJson(report));
    await writeFile(join(out, `${stem}.점검결과.xlsx`), await reportToXlsx(report));
    const s = report.summary;
    const b = report.biblio;
    const src = (k: 'crossref' | 'pubmed', label: string) => {
      const x = b.bySource?.[k];
      return x ? `${label} 찾음 ${x.ok}·없음 ${x.notFound}·실패 ${x.error}·재시도 ${x.retries}${x.retries ? `(${Object.entries(x.retryReasons ?? {}).map(([k, v]) => `${k} ${v}`).join(', ')})` : ''}·캐시 ${x.cacheHits}` : '';
    };
    const bib = b.skipped ? '서지 조회 안 함' : `서지 ${b.succeeded}/${b.attempted} 조회, 실패 ${b.failed} [${src('crossref', 'Crossref')} | ${src('pubmed', 'PubMed')}]`;
    console.log(`${basename(f)}\tERROR ${s.ERROR}\tWARNING ${s.WARNING}\tINFO ${s.INFO}\t${bib}\t(${report.timingsMs.read ?? 0}+${report.timingsMs.rules ?? 0}+${report.timingsMs.papers ?? 0}ms)`);
    if (s.ERROR > 0) worst = 1;
  }
  return worst;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      console.error(e);
      process.exit(3);
    },
  );
}
