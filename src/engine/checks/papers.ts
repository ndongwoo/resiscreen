/**
 * 논문(B-4-2) 검사.
 *  - 시트 안에서만 하는 검사(동기): 저널종류, 필수 칸, 저자 수, 기재 출판연도
 *  - 외부 서지 조회 검사(비동기, runPaperStage): 정식 출판·연도·형식·등재·공동 제1저자·부실 의심
 * 판정하지 않는다: 문구는 '확인 필요', '불인정될 수 있음'.
 */
import type { Context, Rule } from '../rules.ts';
import { makeFinding } from '../rules.ts';
import type { BiblioStats, Finding, PaperResult } from '../report.ts';
import { asText, isBlank, parseLooseDate, toNumber } from '../values.ts';
import { colToIndex, indexToCol } from '../xlsx/refs.ts';
import { formalDate, hasFormalEvidence, norm, normDoi, pageCount, validDoi } from '../biblio/match.ts';
import type { BiblioClient, LookupResult } from '../biblio/client.ts';
import type { BiblioRecord } from '../biblio/types.ts';
import { JournalIndex, type JournalLists } from '../journals.ts';

export interface PapersConfig {
  sheet: string;
  header_row: number;
  first_row: number;
  last_row?: number;
  columns: Record<string, string>;
  doi_header?: string;
  claim_options: string[];
  claims: Record<string, string[]>;
  letter_types?: string[];
  non_original_types?: string[];
  predatory?: { journals: string[]; title_keywords: string[]; max_pages: number };
  journal_lists?: Record<string, string>;
}

export interface PaperRow {
  row: number;
  title: string;
  journal: string;
  claim: string;
  doi: string;
  doiRef?: string;
  claimedYear: number | null;
  firstAuthorTotal: number | null;
}

const LOCAL = new Set(['claim_type', 'required_cols', 'author_counts', 'claimed_year']);

function cfg(ctx: Context): PapersConfig | undefined {
  return ctx.rules.papers;
}

export function paperRows(ctx: Context): PaperRow[] {
  const c = cfg(ctx);
  const sheet = c && ctx.wb.sheetByName.get(c.sheet);
  if (!c || !sheet) return [];
  const col = c.columns;
  let doiCol: string | undefined;
  if (c.doi_header) {
    const re = new RegExp(c.doi_header, 'i');
    for (const cell of sheet.cells.values()) if (cell.row === c.header_row && re.test(asText(cell).trim())) doiCol = indexToCol(cell.col);
  }
  const out: PaperRow[] = [];
  const titleCol = colToIndex(col['title']!);
  for (const cell of sheet.cells.values()) {
    if (cell.col !== titleCol || cell.row < c.first_row || cell.row > (c.last_row ?? 1e9) || isBlank(cell)) continue;
    const r = cell.row;
    const get = (k: string) => sheet.cells.get(`${col[k]}${r}`);
    const d = parseLooseDate(get('published'), ctx.wb.date1904);
    out.push({
      row: r,
      title: asText(cell).trim(),
      journal: asText(get('journal')).trim(),
      claim: asText(get('claim_type')).trim(),
      doi: doiCol ? asText(sheet.cells.get(`${doiCol}${r}`)).trim() : '',
      doiRef: doiCol ? `${doiCol}${r}` : undefined,
      claimedYear: d.invalid || d.year === undefined ? null : d.year,
      firstAuthorTotal: toNumber(get('first_author_total')),
    });
  }
  return out.sort((a, b) => a.row - b.row);
}

/** 동기 규칙 진입점(시트 안 검사). 외부 조회 규칙은 여기서 아무것도 내지 않는다 */
export function paperRule(ctx: Context, rule: Rule): Finding[] {
  const check = rule.target.check as string;
  if (!LOCAL.has(check)) return [];
  const c = cfg(ctx);
  const sheet = c && ctx.wb.sheetByName.get(c.sheet);
  if (!c || !sheet) return [];
  const col = c.columns;
  const out: Finding[] = [];
  for (const p of paperRows(ctx)) {
    const at = (k: string) => `${col[k]}${p.row}`;
    const cell = (k: string) => sheet.cells.get(at(k));
    if (check === 'claim_type' && !c.claim_options.includes(p.claim)) {
      out.push(makeFinding(rule, { sheet: c.sheet, cell: at('claim_type'), row: p.row, detail: { options: c.claim_options } }));
    } else if (check === 'required_cols') {
      const blanks = ['journal', 'published'].filter((k) => isBlank(cell(k)));
      if (blanks.length) out.push(makeFinding(rule, { sheet: c.sheet, cell: at(blanks[0]!), row: p.row, detail: { blank: blanks.map(at) } }));
    } else if (check === 'author_counts') {
      const n = (k: string) => toNumber(cell(k));
      const isInt = (v: number | null, min: number) => v !== null && Number.isInteger(v) && v >= min;
      const [I, J, N, O] = [n('first_author_total'), n('first_author_local'), n('corr_total'), n('corr_local')];
      const issues: string[] = [];
      if (!isInt(I, 1)) issues.push(at('first_author_total'));
      if (!isInt(N, 1)) issues.push(at('corr_total'));
      if (!isInt(J, 0) || (I !== null && J !== null && J > I)) issues.push(at('first_author_local'));
      if (!isInt(O, 0) || (N !== null && O !== null && O > N)) issues.push(at('corr_local'));
      if (issues.length) out.push(makeFinding(rule, { sheet: c.sheet, cell: issues[0], row: p.row, detail: { cells: issues } }));
    } else if (check === 'claimed_year' && p.claimedYear !== null && p.claimedYear !== ctx.rules.reference.paper_year) {
      out.push(makeFinding(rule, { sheet: c.sheet, cell: at('published'), row: p.row, detail: { claimed_year: p.claimedYear, paper_year: ctx.rules.reference.paper_year } }));
    }
  }
  return out;
}

export interface PaperStageOptions {
  client: BiblioClient | null;
  journals: JournalLists;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

export interface PaperStageResult {
  findings: Finding[];
  attempted: number;
  succeeded: number;
  failed: number;
  cancelled: boolean;
  papers: PaperResult[];
  bySource?: BiblioStats['bySource'];
}

const HANGUL = /[가-힣]/;

function hasType(records: BiblioRecord[], words: string[]): string[] {
  const found = new Set<string>();
  for (const r of records) for (const t of r.types) if (words.some((w) => norm(t).includes(norm(w)))) found.add(t);
  return [...found];
}

function summarize(r: BiblioRecord): Record<string, unknown> {
  return {
    source: r.source,
    title: r.title,
    journal: r.journal,
    doi: r.doi,
    pmid: r.pmid,
    volume: r.volume,
    issue: r.issue,
    pages: r.pages || r.articleNumber,
    formal_date: formalDate(r).date,
    online_date: r.onlineDate,
    types: r.types,
  };
}

/** 작업 n개를 동시에 최대 limit개까지 */
async function pool<T>(items: T[], limit: number, fn: (item: T, i: number) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i]!, i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
}

/** 외부 조회·저널 목록 검사. 조회가 꺼져 있어도 저널 목록 검사(이름 기준)는 한다 */
export async function runPaperStage(ctx: Context, opts: PaperStageOptions): Promise<PaperStageResult> {
  const c = cfg(ctx);
  const res: PaperStageResult = { findings: [], attempted: 0, succeeded: 0, failed: 0, cancelled: false, papers: [] };
  if (!c || !ctx.wb.sheetByName.has(c.sheet)) return res;
  const rules = new Map(ctx.rules.rules.filter((r) => r.type === 'paper' && r.enabled).map((r) => [r.target.check as string, r]));
  const emit = (check: string, f: Omit<Finding, 'ruleId' | 'basis' | 'level' | 'message'> & Partial<Pick<Finding, 'level' | 'message' | 'basis'>>) => {
    const rule = rules.get(check);
    if (rule) res.findings.push(makeFinding(rule, f));
  };
  const papers = paperRows(ctx);
  if (!papers.length) return res;
  const at = (p: PaperRow) => `${c.columns['title']}${p.row}`;
  const claims = c.claims;
  const kci = opts.journals.kci ? new JournalIndex(opts.journals.kci) : null;
  const related = opts.journals.related ? new JournalIndex(opts.journals.related) : null;
  const scie = opts.journals.scie ? new JournalIndex(opts.journals.scie) : null;
  const isKciClaim = (p: PaperRow) => (claims['kci'] ?? []).includes(p.claim) || (claims['related'] ?? []).includes(p.claim);
  /** 국내지: KCI 등재(후보)지·유관학회지로 기재했거나 목록에서 저널명이 찾아지는 경우 */
  const isDomestic = (p: PaperRow) => isKciClaim(p) || Boolean(related?.find([], [p.journal]) ?? kci?.find([], [p.journal]));

  if (!opts.client) emit('lookup_off', { sheet: c.sheet });
  if (!scie && papers.some((p) => (claims['scie'] ?? []).includes(p.claim))) emit('scie_skip', { sheet: c.sheet });

  // 1단계: 외부 조회(출처별 요청 간격 안에서 여러 논문을 동시에)
  const looks: (LookupResult | null)[] = papers.map(() => null);
  const domesticListed = papers.map((p) => isDomestic(p)); // 저널 목록 대조는 논문마다 한 번만
  const domestic = papers.map((p, i) => domesticListed[i]! || HANGUL.test(p.title + p.journal));
  if (opts.client) {
    let done = 0;
    opts.onProgress?.(0, papers.length);
    await pool(papers, opts.client.settings.paper_concurrency ?? 3, async (p, i) => {
      res.attempted++;
      const look = await opts.client!.lookup({ title: p.title, journal: p.journal, doi: p.doi, claimedYear: p.claimedYear, domestic: domestic[i]! }, opts.signal);
      looks[i] = look;
      if (look.status === 'cancelled') res.cancelled = true;
      if (look.status === 'failed' || look.status === 'cancelled') res.failed++;
      else res.succeeded++;
      opts.onProgress?.(++done, papers.length);
    });
    res.bySource = opts.client.snapshot();
  }

  // 2단계: 논문별 판단(입력 순서대로)
  for (let i = 0; i < papers.length; i++) {
    const p = papers[i]!;
    const look = looks[i];
    const before = res.findings.length;
    if (p.doiRef && p.doi && !validDoi(p.doi)) emit('doi_format', { sheet: c.sheet, cell: p.doiRef, row: p.row });
    if (look) {
      const failedSources = look.sources.filter((s) => s.status === 'error').map((s) => `${s.source}:${s.error}`);
      if (look.status === 'failed' || look.status === 'cancelled') {
        emit('lookup_failed', { sheet: c.sheet, cell: at(p), row: p.row, detail: { errors: failedSources, cancelled: look.status === 'cancelled' } });
      } else if (look.status === 'uncertain' || look.status === 'not_found') {
        const cand = look.best;
        const rule = rules.get('lookup_uncertain');
        const dom = domesticListed[i]!;
        emit('lookup_uncertain', {
          sheet: c.sheet,
          cell: at(p),
          row: p.row,
          level: dom && rule?.target['domestic_level'] ? rule.target['domestic_level'] : undefined,
          message:
            (rule?.message ?? '') +
            (dom ? ' 국내지는 국문 제목 색인이 약해 찾지 못하는 경우가 많습니다.' : '') +
            (cand
              ? ` (후보: "${cand.record.title}", ${cand.record.journal}, ${cand.record.doi || cand.record.pmid}; 제목 유사도 ${cand.similarity.toFixed(2)}, 연도 ${cand.yearOk ? '일치' : '불일치'}, 저널 ${cand.journalOk ? '일치' : '불일치'})`
              : ' (후보 없음)'),
          detail: { candidate: cand ? summarize(cand.record) : null, similarity: cand?.similarity, partial_errors: failedSources, domestic: dom },
        });
        if (p.doiRef && validDoi(p.doi) && !look.sources.some((s) => s.source === 'crossref' && s.records.some((r) => r.doi === normDoi(p.doi))))
          emit('doi_format', { sheet: c.sheet, cell: p.doiRef, row: p.row });
      }
      if (look.doiTitleMismatch && p.doiRef) emit('doi_title', { sheet: c.sheet, cell: p.doiRef, row: p.row });
    }
    const matched = look?.matched.map((m) => m.record) ?? [];
    if (matched.length) {
      const detail = { records: matched.map(summarize) };
      if (!matched.some(hasFormalEvidence)) emit('epub', { sheet: c.sheet, cell: at(p), row: p.row, detail });
      const formals = matched.map((r) => formalDate(r).date).filter(Boolean);
      const py = ctx.rules.reference.paper_year;
      if (formals.length && !formals.some((d) => Number(d.slice(0, 4)) === py))
        emit('formal_year', { sheet: c.sheet, cell: `${c.columns['published']}${p.row}`, row: p.row, message: `${rules.get('formal_year')?.message ?? ''} (정식 출판일 ${formals.join(', ')}, 기준 ${py}년)`, detail });
      const letters = hasType(matched, c.letter_types ?? []);
      if (letters.length) emit('letter', { sheet: c.sheet, cell: at(p), row: p.row, detail: { types: letters } });
      const nonOrig = hasType(matched, c.non_original_types ?? []);
      if ((claims['original'] ?? []).includes(p.claim) && nonOrig.length)
        emit('claim_original', { sheet: c.sheet, cell: `${c.columns['claim_type']}${p.row}`, row: p.row, detail: { types: nonOrig } });
      const eq = Math.max(...matched.map((r) => r.equalContribCount));
      if (eq >= 2 && p.firstAuthorTotal === 1)
        emit('co_first', { sheet: c.sheet, cell: `${c.columns['first_author_total']}${p.row}`, row: p.row, detail: { equal_contrib_authors: eq } });
    }
    // 부실 의심(서지가 있으면 쪽수까지, 없으면 저널·제목만)
    if (c.predatory) {
      const pj = c.predatory.journals.map(norm);
      const journals = [p.journal, ...matched.flatMap((r) => [r.journal, ...r.journalAliases])].map(norm);
      if (journals.some((j) => pj.includes(j))) {
        const pages = matched.map((r) => pageCount(r.pages)).filter((n): n is number => n !== null);
        const shortPaper = pages.length > 0 && Math.min(...pages) <= c.predatory.max_pages;
        const kw = c.predatory.title_keywords.some((k) => norm(p.title).includes(norm(k)) || matched.some((r) => norm(r.title).includes(norm(k))));
        if (shortPaper || kw) emit('predatory', { sheet: c.sheet, cell: at(p), row: p.row, detail: { pages: pages[0] ?? null } });
      }
    }
    // 저널 등재 목록
    const issns = matched.flatMap((r) => r.issn);
    const names = [p.journal, ...matched.flatMap((r) => [r.journal, ...r.journalAliases])];
    if (isKciClaim(p) && (kci || related)) {
      const hit = related?.find(issns, names) ?? kci?.find(issns, names);
      if (!hit) emit('kci', { sheet: c.sheet, cell: `${c.columns['journal']}${p.row}`, row: p.row, detail: { kci_as_of: opts.journals.kci?.as_of, searched_by: issns.length ? 'issn+name' : 'name' } });
    }
    if (scie && (claims['scie'] ?? []).includes(p.claim)) {
      const hit = scie.find(issns, names);
      const tokens = (hit?.entry.status ?? '').toUpperCase().split(/[^A-Z]+/);
      const esciOnly = tokens.includes('ESCI') && !tokens.some((t) => t === 'SCIE' || t === 'SCI');
      if (!hit || esciOnly)
        emit('scie', {
          sheet: c.sheet,
          cell: `${c.columns['journal']}${p.row}`,
          row: p.row,
          detail: { esci_only: Boolean(esciOnly), searched_by: issns.length ? 'issn+name' : 'name', list: opts.journals.scie?.source },
        });
    }
    res.papers.push({
      row: p.row,
      journal: p.journal,
      claim: p.claim,
      domestic: domesticListed[i]!,
      status: look ? look.status : 'skipped',
      sources: Object.fromEntries((look?.sources ?? []).map((s) => [s.source, s.error ? `${s.status}:${s.error}` : s.status])),
      similarity: look?.best?.similarity,
      rules: [...new Set(res.findings.slice(before).map((f) => f.ruleId))],
    });
  }
  return res;
}
