/** 규칙 JSON 로딩·검증·실행. 셀 주소와 기준 수치는 모두 규칙 JSON(rules/<연도>.json)에서 온다. */
import type { Workbook } from './xlsx/workbook.ts';
import { formulaRefs, inRange, parseCoord, type Range } from './xlsx/refs.ts';
import type { Finding, Level } from './report.ts';
import { getCell, isBlank, asText } from './values.ts';
import * as structure from './checks/structure.ts';
import * as period from './checks/period.ts';
import * as clinical from './checks/clinical.ts';
import * as staffing from './checks/staffing.ts';
import * as evidence from './checks/evidence.ts';
import * as papers from './checks/papers.ts';
import type { PapersConfig } from './checks/papers.ts';
import * as activity from './checks/activity.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Target = Record<string, any>;

export interface Rule {
  id: string;
  type: 'required' | 'dtype' | 'sum_match' | 'period' | 'threshold' | 'recalc' | 'rows_vs_total' | 'evidence' | 'paper';
  level: Level;
  level_if_unreferenced?: Level;
  enabled: boolean;
  target: Target;
  message: string;
  message_referenced?: string;
  basis: string;
  todo?: string;
  exceptions?: { cells: string[]; basis: string | null; basis_kind: string; moved_to?: string; note?: string }[];
}

export interface SignatureItem {
  sheet: string;
  cell: string;
  contains?: string;
  equals?: string;
}

export interface SurgerySheet {
  sheet: string;
  label: string;
  summary: string;
  total: string;
  side_sum_col?: string;
  date_col?: string;
}

export { lastDayOfFeb, resolveReference, withResolvedReference, type EffectiveRuleSet, type Period, type ResolvedReference } from './reference.ts';
import type { EffectiveRuleSet, ResolvedReference } from './reference.ts';

export interface RuleSet {
  status?: string;
  rules_version?: string;
  form: { year: number; label: string; signature: SignatureItem[]; required_sheets: string[] };
  /** 비워 두면 form.year에서 계산한다(resolveReference). 값을 적으면 그 값이 우선 */
  reference?: Partial<ResolvedReference> & Record<string, unknown>;
  biblio?: Record<string, unknown>;
  surgery_sheets: SurgerySheet[];
  papers?: PapersConfig;
  rules: Rule[];
}

export interface FormFormulas {
  year: number;
  sheets: Record<string, { cells?: string[]; cols?: string[]; first_row?: number; last_row?: number; row_key_col?: string; extra_cells?: string[] }>;
}

export interface Context {
  wb: Workbook;
  rules: EffectiveRuleSet;
  formulas?: FormFormulas;
  /** 수식이 참조하는 범위(시트별) */
  referenced: Map<string, Range[]>;
}

export function buildReferenceIndex(wb: Workbook): Map<string, Range[]> {
  const idx = new Map<string, Range[]>();
  for (const s of wb.sheets) {
    for (const c of s.cells.values()) {
      if (!c.formula) continue;
      for (const r of formulaRefs(c.formula)) {
        const sheet = r.sheet ?? s.name;
        if (sheet.startsWith('[')) continue; // 외부 통합문서
        let list = idx.get(sheet);
        if (!list) idx.set(sheet, (list = []));
        list.push(r.range);
      }
    }
  }
  return idx;
}

export function isReferenced(ctx: Context, sheet: string, ref: string): boolean {
  const list = ctx.referenced.get(sheet);
  if (!list) return false;
  const c = parseCoord(ref);
  return list.some((r) => inRange(c, r));
}

/** 양식 서명 확인. 맞지 않는 항목 목록을 돌려준다(빈 배열이면 지원 양식). */
export function checkSignature(wb: Workbook, rs: RuleSet): string[] {
  const misses: string[] = [];
  for (const sig of rs.form.signature) {
    const v = asText(getCell(wb, sig.sheet, sig.cell)).replace(/\s+/g, ' ').trim();
    const ok =
      wb.sheetByName.has(sig.sheet) &&
      !isBlank(getCell(wb, sig.sheet, sig.cell)) &&
      (sig.equals === undefined || v === sig.equals) &&
      (sig.contains === undefined || v.includes(sig.contains));
    if (!ok) misses.push(`${sig.sheet}!${sig.cell}`);
  }
  return misses;
}

export function makeFinding(rule: Rule, f: Omit<Finding, 'ruleId' | 'basis' | 'level' | 'message'> & Partial<Pick<Finding, 'level' | 'message' | 'basis'>>): Finding {
  // f를 먼저 펼쳐 undefined 값이 규칙 기본값을 덮지 않게 한다
  return { ...f, level: f.level ?? rule.level, ruleId: rule.id, message: f.message ?? rule.message, basis: f.basis ?? rule.basis } as Finding;
}

type Handler = (ctx: Context, rule: Rule) => Finding[];

function handlerFor(rule: Rule): Handler | null {
  const t = rule.target;
  switch (rule.type) {
    case 'required':
      if (t.signature) return () => []; // 서명은 runRules 앞에서 따로 처리
      if (t.required_sheets) return structure.requiredSheets;
      if (t.first_row !== undefined) return structure.requiredRows;
      return structure.requiredCells;
    case 'dtype':
      if (t.check === 'number_in_guide_row') return structure.numberInGuideRow;
      if (t.check === 'formula_replaced') return structure.formulaReplaced;
      if (t.check === 'excel_error_value') return structure.excelErrors;
      return structure.dtypeCells;
    case 'sum_match':
      return structure.sumMatch;
    case 'rows_vs_total':
      return t.sum_col ? clinical.sideSum : clinical.rowsVsTotal;
    case 'period':
      if (t.check === 'year_missing_limit') return period.yearMissingLimit;
      if (t.check === 'structure_limit') return period.structureLimit;
      return period.dateRange;
    case 'threshold':
      return clinical.threshold;
    case 'evidence':
      if (t.check === 'name_masked') return clinical.nameMasked;
      if (t.check === 'event_kind') return activity.eventKind;
      if (t.check === 'event_duplicate') return activity.eventDuplicate;
      if (t.pairs) return clinical.samePatientPairs;
      if (t.attachment_col) return evidence.rowAttachments;
      return evidence.sheetAttachments;
    case 'recalc':
      if (t.selection) return staffing.a22;
      return staffing.ratios;
    case 'paper':
      return papers.paperRule;
    default:
      return null;
  }
}

/** 한 규칙이 한 시트에서 행 단위 결과를 이 수보다 많이 내면 1건으로 묶는다(결과 표가 묻히지 않게) */
export const COLLAPSE_ROWS_OVER = 10;

function collapseRows(list: Finding[]): Finding[] {
  const bySheet = new Map<string, Finding[]>();
  for (const f of list) {
    if (f.row === undefined) continue;
    const arr = bySheet.get(f.sheet) ?? [];
    arr.push(f);
    bySheet.set(f.sheet, arr);
  }
  const drop = new Set<Finding>();
  const add: Finding[] = [];
  for (const [, arr] of bySheet) {
    if (arr.length <= COLLAPSE_ROWS_OVER) continue;
    arr.forEach((f) => drop.add(f));
    const first = arr[0]!;
    const rows = arr.map((f) => f.row!).sort((a, b) => a - b);
    add.push({ ...first, message: `${first.message} (${rows.length}행: ${rows[0]}~${rows[rows.length - 1]}행)`, detail: { rows, count: rows.length } });
  }
  return [...list.filter((f) => !drop.has(f)), ...add];
}

export interface RunResult {
  supported: boolean;
  findings: Finding[];
}

export function runRules(ctx: Context): RunResult {
  const rs = ctx.rules;
  const sigRule = rs.rules.find((r) => r.target.signature);
  const misses = checkSignature(ctx.wb, rs);
  if (misses.length > 0) {
    const rule = sigRule ?? ({ id: 'S-FORM-01', level: 'ERROR', message: '지원하지 않는 양식입니다.', basis: '' } as Rule);
    return {
      supported: false,
      findings: [makeFinding(rule, { sheet: misses[0]!.split('!')[0]!, cell: misses[0]!.split('!')[1], detail: { mismatched: misses } })],
    };
  }
  const findings: Finding[] = [];
  for (const rule of rs.rules) {
    if (!rule.enabled) continue;
    const h = handlerFor(rule);
    if (!h) continue;
    try {
      findings.push(...collapseRows(h(ctx, rule)));
    } catch (e) {
      // 규칙 하나가 실패해도 나머지 검사는 계속한다
      findings.push({
        level: 'WARNING',
        ruleId: rule.id,
        sheet: rule.target.sheet ?? '(전체)',
        message: `이 규칙을 실행하지 못했습니다: ${(e as Error).message}`,
        basis: rule.basis,
      });
    }
  }
  return { supported: true, findings };
}

/** 규칙 파일 내용 지문(FNV-1a 32비트). 같은 버전 번호라도 내용이 바뀌면 달라진다 */
export function rulesFingerprint(rules: RuleSet): string {
  const text = JSON.stringify(rules);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
