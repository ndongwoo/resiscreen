/** 엔진 진입점. 브라우저(Web Worker)·Node CLI·테스트가 같은 함수를 쓴다. DOM 의존 없음. */
import { loadWorkbook, WorkbookError, type LoadOptions } from './xlsx/workbook.ts';
import { buildReferenceIndex, rulesFingerprint, runRules, type FormFormulas, type RuleSet } from './rules.ts';
import { sortFindings, summarize, type Finding, type Report } from './report.ts';
import { runPaperStage } from './checks/papers.ts';
import type { BiblioClient } from './biblio/client.ts';
import type { JournalLists } from './journals.ts';

export const ENGINE_VERSION = '0.2.0';

export interface CheckInput {
  bytes: Uint8Array;
  fileName: string;
  rules: RuleSet;
  formulas?: FormFormulas;
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

export async function checkWorkbook(input: CheckInput): Promise<Report> {
  const now = input.now ?? (() => Date.now());
  const t0 = now();
  const base: Omit<Report, 'findings' | 'summary' | 'supported' | 'formYear'> = {
    tool: {
      name: 'resiscreen',
      version: ENGINE_VERSION,
      app: input.appVersion ?? 'unknown',
      rulesStatus: input.rules.status ?? '',
      rulesVersion: `${input.rules.rules_version ?? '-'} · ${rulesFingerprint(input.rules)}`,
      kciAsOf: input.journals?.kci?.as_of ?? '-',
    },
    file: { name: input.fileName, size: input.bytes.length },
    biblio: { attempted: 0, succeeded: 0, failed: 0, skipped: true },
    timingsMs: {},
  };
  const fail = (message: string): Report => {
    const findings: Finding[] = [{ level: 'ERROR', ruleId: 'S-FILE-01', sheet: '(파일)', message, basis: '보안·형식 요건(.xlsx만 받음)' }];
    return { ...base, formYear: null, supported: false, findings, summary: summarize(findings) };
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
  const ctx = { wb, rules: input.rules, formulas: input.formulas, referenced: buildReferenceIndex(wb) };
  const res = runRules(ctx);
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
  const findings = sortFindings(all, wb.sheets.map((s) => s.name));
  input.onProgress?.('done');
  return {
    ...base,
    biblio,
    papers,
    formYear: res.supported ? input.rules.form.year : null,
    supported: res.supported,
    findings,
    summary: summarize(findings),
    timingsMs: { read: t1 - t0, rules: t2 - t1, papers: t3 - t2 },
  };
}

export type { Report, Finding } from './report.ts';
export type { RuleSet, FormFormulas } from './rules.ts';
