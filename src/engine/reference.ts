/**
 * 평가연도(form.year)에서 기준값 계산. 의존성이 없는 작은 모듈이라 화면 스크립트에서도 쓴다.
 */
import type { RuleSet } from './rules.ts';

export interface Period {
  start: string;
  end: string;
}

/** 평가연도(Y)에서 계산되는 기준값 */
export interface ResolvedReference {
  /** 실적 인정 기간: Y-1년 1월 1일 ~ 12월 31일 */
  period_default: Period;
  /** 3~2월 항목(A-3-3, A-10-3, B-2-3, E-2-b): Y-1년 3월 1일 ~ Y년 2월 말일(윤년이면 29일) */
  period_mar_feb: Period;
  /** 전문의 수 기준일: Y-1년 9월 30일 */
  staff_count_date: string;
  /** 논문 실적 연도: Y-1 */
  paper_year: number;
  /** 평가년도 5월 1일(A-2-5, A-3-1, C-1-1) */
  eval_may1: string;
  /** 평가 전년도 10월 1일(A-3-2, B-2-3 b, E-1) */
  prev_oct1: string;
  /** 평가년도 2월 말일(E-2, 윤년이면 29일) */
  feb_end: string;
  /** 큰 파일 확인 기준(MB) */
  large_file_mb: number;
}

export function lastDayOfFeb(year: number): number {
  return new Date(Date.UTC(year, 2, 0)).getUTCDate();
}

/** form.year로 기준값을 계산하고, rules.reference에 직접 적은 값이 있으면 그 값을 쓴다 */
export function resolveReference(rules: Pick<RuleSet, 'form' | 'reference'>): ResolvedReference {
  const y = rules.form.year;
  const py = y - 1;
  const computed: ResolvedReference = {
    period_default: { start: `${py}-01-01`, end: `${py}-12-31` },
    period_mar_feb: { start: `${py}-03-01`, end: `${y}-02-${String(lastDayOfFeb(y)).padStart(2, '0')}` },
    staff_count_date: `${py}-09-30`,
    paper_year: py,
    eval_may1: `${y}-05-01`,
    prev_oct1: `${py}-10-01`,
    feb_end: `${y}-02-${String(lastDayOfFeb(y)).padStart(2, '0')}`,
    large_file_mb: 150,
  };
  const r = rules.reference ?? {};
  return {
    period_default: (r.period_default as Period | undefined) ?? computed.period_default,
    period_mar_feb: (r.period_mar_feb as Period | undefined) ?? computed.period_mar_feb,
    staff_count_date: (r.staff_count_date as string | undefined) ?? computed.staff_count_date,
    paper_year: (r.paper_year as number | undefined) ?? computed.paper_year,
    eval_may1: (r.eval_may1 as string | undefined) ?? computed.eval_may1,
    prev_oct1: (r.prev_oct1 as string | undefined) ?? computed.prev_oct1,
    feb_end: (r.feb_end as string | undefined) ?? computed.feb_end,
    large_file_mb: (r.large_file_mb as number | undefined) ?? computed.large_file_mb,
  };
}

/** 계산된 기준값을 채운 규칙(엔진 내부에서 쓰는 형태) */
export type EffectiveRuleSet = RuleSet & { reference: ResolvedReference & Record<string, unknown> };

export function withResolvedReference(rules: RuleSet): EffectiveRuleSet {
  return { ...rules, reference: { ...(rules.reference ?? {}), ...resolveReference(rules) } };
}


/** 'YYYY-MM-DD' → 'YYYY년 M월 D일' */
export function koDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일`;
}

/** 기간을 문구로: 같은 해 1~12월이면 'YYYY년 1~12월', 달 단위면 'YYYY년 M월~YYYY년 M월', 아니면 날짜 그대로 */
export function koPeriod(p: Period): string {
  const [sy, sm, sd] = p.start.split('-').map(Number) as [number, number, number];
  const [ey, em, ed] = p.end.split('-').map(Number) as [number, number, number];
  const monthEnd = ed === new Date(Date.UTC(ey, em, 0)).getUTCDate();
  if (sd === 1 && monthEnd) {
    if (sy === ey) return `${sy}년 ${sm}~${em}월`;
    return `${sy}년 ${sm}월~${ey}년 ${em}월`;
  }
  return `${koDate(p.start)}~${koDate(p.end)}`;
}

/** 메시지 자리표시 → 값. 규칙 메시지에는 연도·날짜를 직접 적지 않고 이 이름을 쓴다 */
export function messageVars(rules: Pick<RuleSet, 'form' | 'reference'>): Record<string, string> {
  const r = resolveReference(rules);
  return {
    form_year: String(rules.form.year),
    prev_year: String(rules.form.year - 1),
    perf_period: koPeriod(r.period_default),
    marfeb_period: koPeriod(r.period_mar_feb),
    staff_count_date: koDate(r.staff_count_date),
    paper_year: String(r.paper_year),
    eval_may1: koDate(r.eval_may1),
    prev_oct1: koDate(r.prev_oct1),
    feb_end: koDate(r.feb_end),
  };
}

const MESSAGE_VAR = /\{([a-z_0-9]+)\}/g;

/** 문구 안의 {자리표시}를 채운다. 모르는 이름은 그대로 둔다(테스트가 남은 자리표시를 잡는다) */
export function fillText(text: string, vars: Record<string, string>): string {
  return text.replace(MESSAGE_VAR, (m, k: string) => vars[k] ?? m);
}

/** 규칙의 사용자에게 보이는 문구(form.label, 규칙 message·message_referenced)에 계산된 기준일을 채운다 */
export function fillMessages<T extends RuleSet>(rules: T): T {
  const vars = messageVars(rules);
  return {
    ...rules,
    form: { ...rules.form, label: fillText(rules.form.label, vars) },
    rules: rules.rules.map((r) => ({
      ...r,
      message: fillText(r.message, vars),
      ...(r.message_referenced === undefined ? {} : { message_referenced: fillText(r.message_referenced, vars) }),
    })),
  };
}
