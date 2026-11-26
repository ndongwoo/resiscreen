/** 엔진 진입점. 브라우저(Web Worker)·Node CLI·테스트가 같은 함수를 쓴다. DOM 의존 없음. */
import { loadWorkbook, WorkbookError, type LoadOptions } from './xlsx/workbook.ts';
import { buildReferenceIndex, checkSignature, rulesFingerprint, runRules, withResolvedReference, type Context, type FormFormulas, type RuleSet } from './rules.ts';
import { buildItemIndex, resolveDeep, type ItemColumn } from './columns.ts';
import { sortFindings, summarize, type Finding, type Report } from './report.ts';
import { runPaperStage } from './checks/papers.ts';
import type { BiblioClient } from './biblio/client.ts';
import type { JournalLists } from './journals.ts';

export const ENGINE_VERSION = '0.2.0';

export interface CheckInput {
  bytes: Uint8Array;
  fileName: string;
  /** 규칙 하나 또는 여러 연도의 규칙. 여러 개면 엑셀의 signature로 양식 연도를 골라 쓴다 */
  rules: RuleSet | RuleSet[];
  /** 자동계산 칸 위치. 연도별 묶음({2026: …})이나 하나 */
  formulas?: FormFormulas | Record<number, FormFormulas>;
  /** 외부 서지 조회 클라이언트. null이면 조회하지 않는다(오프라인·사용 안 함) */
  biblio?: BiblioClient | null;
  journals?: JournalLists;
  /** 논문 조회 취소 */
  signal?: AbortSignal;
  onProgress?: (stage: 'read' | 'structure' | 'papers' | 'done', detail?: string, done?: number, total?: number) => void;
  now?: () => number;
  /** 앱 버전(git 커밋 등). 결과에 그대로 적는다 */
  appVersion?: string;
}

/** 확장자 확인: .xlsx만 받는다 */
export function checkExtension(fileName: string): string | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.xlsx')) return null;
  if (/\.(xlsm|xltm|xlam|xlsb)$/.test(lower)) return '매크로가 포함될 수 있는 파일 형식은 받지 않습니다. .xlsx로 저장해 주세요.';
  if (lower.endsWith('.xls')) return '예전 엑셀 형식(.xls)은 받지 않습니다. 엑셀에서 .xlsx로 다시 저장해 주세요.';
  return '.xlsx 파일만 점검할 수 있습니다.';
}

/** 다시 조회 등에 쓰는 점검 상태(Worker·CLI 메모리 안에만 둔다) */
export interface CheckSession {
  ctx: Context;
  report: Report;
  sheetOrder: string[];
}

function toolInfo(input: CheckInput, rules: RuleSet): Report['tool'] {
  return {
    name: 'resiscreen',
    version: ENGINE_VERSION,
    app: input.appVersion ?? 'unknown',
    rulesStatus: rules.status ?? '',
    rulesVersion: `${rules.rules_version ?? '-'} · ${rulesFingerprint(rules)}`,
    kciAsOf: input.journals?.kci?.as_of ?? '-',
  };
}

function formulasFor(input: CheckInput, year: number): FormFormulas | undefined {
  const f = input.formulas;
  if (!f) return undefined;
  if ('sheets' in f && 'year' in f) return f as FormFormulas;
  return (f as Record<number, FormFormulas>)[year];
}

export async function checkWorkbook(input: CheckInput): Promise<Report> {
  return (await checkWorkbookSession(input)).report;
}

export async function checkWorkbookSession(input: CheckInput): Promise<{ report: Report; session: CheckSession | null }> {
  const now = input.now ?? (() => Date.now());
  const t0 = now();
  const candidates = (Array.isArray(input.rules) ? input.rules : [input.rules]).slice().sort((a, b) => b.form.year - a.form.year);
  if (!candidates.length) throw new Error('규칙 파일이 없습니다');
  const base: Omit<Report, 'findings' | 'summary' | 'supported' | 'formYear'> = {
    tool: toolInfo(input, candidates[0]!),
    file: { name: input.fileName, size: input.bytes.length },
    biblio: { attempted: 0, succeeded: 0, failed: 0, skipped: true },
    timingsMs: {},
  };
  const fail = (message: string): { report: Report; session: null } => {
    const findings: Finding[] = [{ level: 'ERROR', ruleId: 'S-FILE-01', sheet: '(파일)', message, basis: '보안·형식 요건(.xlsx만 받음)' }];
    return { report: { ...base, formYear: null, supported: false, findings, summary: summarize(findings) }, session: null };
  };
  const extErr = checkExtension(input.fileName);
  if (extErr) return fail(extErr);

  input.onProgress?.('read');
  let wb;
  try {
    const opts: LoadOptions = { onSheet: (name) => input.onProgress?.('read', name) };
    wb = await loadWorkbook(input.bytes, opts);
  } catch (e) {
    if (e instanceof WorkbookError) return fail(e.message);
    return fail(`파일을 읽지 못했습니다: ${(e as Error).message}`);
  }
  const t1 = now();
  input.onProgress?.('structure');
  // '전체' 시트의 열을 항목 코드·머리글로 찾기 위한 색인(규칙의 {코드|머리글} 자리를 열 문자로 바꾼다)
  const whole = wb.sheetByName.get('전체');
  const itemIndex: ItemColumn[] = whole ? buildItemIndex(whole) : [];
  const withSignature = (r: RuleSet): RuleSet => ({ ...r, form: { ...r.form, signature: resolveDeep(itemIndex, r.form.signature, new Set()) } });
  const resolvedCandidates = candidates.map(withSignature);
  // 양식 연도 식별: signature가 맞는 규칙을 쓴다. 맞는 것이 없으면 가장 최근 규칙으로 '지원하지 않는 양식' ERROR.
  // 두 연도 이상이 동시에 맞으면 어느 쪽도 고르지 않고 멈춘다(서명에 연도 구분 칸이 빠진 규칙 파일 방지)
  const matchingIdx = resolvedCandidates.map((r, i) => (checkSignature(wb, r).length === 0 ? i : -1)).filter((i) => i >= 0);
  const matching = matchingIdx.map((i) => candidates[i]!);
  if (matching.length > 1) {
    const years = matching.map((r) => r.form.year).sort();
    const findings: Finding[] = [
      {
        level: 'ERROR',
        ruleId: 'S-FORM-02',
        sheet: '(파일)',
        message: `양식 연도를 판별할 수 없습니다. 이 파일이 ${years.join('·')}년 양식 서명에 모두 맞습니다. 학회 담당자에게 알려 주세요.`,
        basis: '규칙 파일의 form.signature에 연도를 구분하는 칸이 있어야 함(README 새 연도 양식 추가 절차)',
        detail: { years },
      },
    ];
    return { report: { ...base, formYear: null, supported: false, findings, summary: summarize(findings) }, session: null };
  }
  const chosenRaw = matching[0] ?? candidates[0]!;
  // 규칙 전체의 항목 키를 이 파일의 열로 바꾼다. 못 찾은 항목은 ERROR로 알리고 그 항목을 쓰는 규칙만 건너뛴다
  const missing = new Set<string>();
  const resolved = resolveDeep(itemIndex, chosenRaw, missing);
  const unresolved = (v: unknown) => [...missing].some((k) => JSON.stringify(v).includes(`{${k}}`));
  const chosen: RuleSet =
    matching.length && missing.size
      ? {
          ...resolved,
          rules: resolved.rules.filter((r) => !unresolved(r.target) && !unresolved(r.exceptions ?? [])),
          surgery_sheets: resolved.surgery_sheets.map((s) => (unresolved(s.summary) ? { ...s, summary: '' } : s)),
        }
      : matching.length
        ? resolved
        : withSignature(chosenRaw);
  const rules = withResolvedReference(chosen);
  base.tool = toolInfo(input, chosenRaw);
  const rawFormulas = formulasFor(input, chosenRaw.form.year);
  const formulas = rawFormulas ? resolveDeep(itemIndex, rawFormulas, missing) : undefined;
  if (formulas?.sheets['전체']?.cells) formulas.sheets['전체'].cells = formulas.sheets['전체'].cells.filter((c) => /^[A-Z]{1,3}\d+$/.test(c));
  const ctx: Context = { wb, rules, formulas, referenced: buildReferenceIndex(wb) };
  const res = runRules(ctx);
  if (res.supported && missing.size) {
    for (const key of [...missing].sort())
      res.findings.push({
        level: 'ERROR',
        ruleId: 'S-COL-01',
        sheet: '전체',
        message: `양식에서 항목 ${key}를 찾을 수 없습니다. 열을 지우거나 머리글(3~5행)을 고치지 않았는지 확인하세요. 이 항목을 쓰는 점검은 건너뛰었습니다.`,
        basis: '규칙은 열 문자 대신 항목 코드(3행)와 머리글(4·5행)로 열을 찾는다(src/engine/columns.ts)',
        detail: { key },
      });
  }
  const t2 = now();
  let all = res.findings;
  let biblio = base.biblio;
  let papers: Report['papers'] = [];
  if (res.supported) {
    input.onProgress?.('papers', undefined, 0, 0);
    const stage = await runPaperStage(ctx, {
      client: input.biblio ?? null,
      journals: input.journals ?? {},
      signal: input.signal,
      onProgress: (done, total) => input.onProgress?.('papers', undefined, done, total),
    });
    all = all.concat(stage.findings);
    biblio = { attempted: stage.attempted, succeeded: stage.succeeded, failed: stage.failed, skipped: !input.biblio, cancelled: stage.cancelled, bySource: stage.bySource };
    papers = stage.papers;
  }
  const t3 = now();
  const sheetOrder = wb.sheets.map((s) => s.name);
  const findings = sortFindings(all, sheetOrder);
  input.onProgress?.('done');
  const ref = rules.reference;
  const report: Report = {
    ...base,
    biblio,
    papers,
    formYear: res.supported ? chosenRaw.form.year : null,
    form: res.supported
      ? {
          year: chosenRaw.form.year,
          label: chosenRaw.form.label,
          period_default: ref.period_default,
          period_mar_feb: ref.period_mar_feb,
          staff_count_date: ref.staff_count_date,
          paper_year: ref.paper_year,
          eval_may1: ref.eval_may1,
          prev_oct1: ref.prev_oct1,
          feb_end: ref.feb_end,
        }
      : undefined,
    supported: res.supported,
    findings,
    summary: summarize(findings),
    timingsMs: { read: t1 - t0, rules: t2 - t1, papers: t3 - t2 },
  };
  return { report, session: res.supported ? { ctx, report, sheetOrder } : null };
}

export { RECHECKABLE_RULES } from './report.ts';

/**
 * 논문 몇 편만 캐시를 무시하고 다시 조회해 그 논문의 결과만 바꾼다(파일 전체를 다시 검사하지 않음).
 * 시트 안 검사(저널종류·저자 수 등)와 다른 시트 결과는 그대로 둔다.
 */
export async function recheckPapers(
  session: CheckSession,
  rows: number[],
  opts: { client: BiblioClient; journals?: JournalLists; signal?: AbortSignal },
): Promise<Report> {
  const { ctx } = session;
  const sheet = ctx.rules.papers?.sheet;
  if (!sheet) return session.report;
  const stage = await runPaperStage(ctx, { client: opts.client, journals: opts.journals ?? {}, signal: opts.signal, onlyRows: rows, bypassCache: true });
  // 외부 조회 단계에서 나오는 규칙(시트 안 검사 규칙 제외)
  const stageRules = new Set(
    ctx.rules.rules.filter((r) => r.type === 'paper' && !['claim_type', 'required_cols', 'author_counts', 'claimed_year'].includes(r.target.check)).map((r) => r.id),
  );
  const rowSet = new Set(rows);
  const kept = session.report.findings.filter((f) => !(f.sheet === sheet && f.row !== undefined && rowSet.has(f.row) && stageRules.has(f.ruleId)));
  const findings = sortFindings(kept.concat(stage.findings), session.sheetOrder);
  const papers = (session.report.papers ?? []).map((p) => stage.papers.find((n) => n.row === p.row) ?? p);
  const counted = papers.filter((p) => p.status !== 'skipped');
  const report: Report = {
    ...session.report,
    findings,
    papers,
    summary: summarize(findings),
    biblio: {
      ...session.report.biblio,
      attempted: counted.length,
      failed: counted.filter((p) => p.status === 'failed' || p.status === 'cancelled').length,
      succeeded: counted.filter((p) => p.status !== 'failed' && p.status !== 'cancelled').length,
      cancelled: counted.some((p) => p.status === 'cancelled'),
      bySource: stage.bySource ?? session.report.biblio.bySource,
    },
  };
  session.report = report;
  return report;
}

export type { Report, Finding } from './report.ts';
export type { RuleSet, FormFormulas } from './rules.ts';
