/** 인원 기준 재계산: A-2-2(n ≤ N-3), B-5·C-4 비율 */
import type { Context, Rule } from '../rules.ts';
import { makeFinding } from '../rules.ts';
import type { Finding } from '../report.ts';
import { asText, getQualified, itemCodeFor, splitRef, toNumber } from '../values.ts';
import { expandRange, parseCoord } from '../xlsx/refs.ts';

/**
 * A-2-2 n ≤ N-3. n = 연차별 전공의 정원 중 최댓값(양식 J4 '최다 연차의 전공의 수'), N = 정원책정 지도전문의 수.
 */
export function a22(ctx: Context, rule: Rule): Finding[] {
  const t = rule.target;
  const N = toNumber(getQualified(ctx.wb, t.supervisors));
  const [rs, rr] = splitRef(t.residents_by_year);
  const counts = expandRange(rr).map((r) => toNumber(getQualified(ctx.wb, `'${rs}'!${r}`)));
  const [ss, sc] = splitRef(t.selection);
  const selected = asText(getQualified(ctx.wb, t.selection)).trim();
  if (N === null || counts.every((c) => c === null) || !selected) return []; // 빈칸은 required 규칙이 잡는다
  const n = Math.max(...counts.map((c) => c ?? 0));
  const expected = n <= N - 3 ? t.yes : t.no;
  if (selected === expected) return [];
  const sheet = ctx.wb.sheetByName.get(ss);
  return [
    makeFinding(rule, {
      sheet: ss,
      cell: sc,
      itemCode: itemCodeFor(sheet, parseCoord(sc).col),
      message: `${rule.message} (계산: n=${n}, N=${N}, N-3=${N - 3} → '${expected}', 선택: '${selected}')`,
      detail: { n, N, expected, selected },
    }),
  ];
}

const REL_TOL = 1e-6;

export function ratios(ctx: Context, rule: Rule): Finding[] {
  const t = rule.target;
  const out: Finding[] = [];
  for (const chk of t.checks as { cell: string; num: string[]; den: string }[]) {
    const [sheetName, ref] = splitRef(chk.cell);
    const sheet = ctx.wb.sheetByName.get(sheetName);
    if (!sheet) continue;
    const nums = chk.num.map((c) => toNumber(getQualified(ctx.wb, c)));
    const den = toNumber(getQualified(ctx.wb, chk.den));
    const observed = toNumber(getQualified(ctx.wb, chk.cell));
    if (nums.some((n) => n === null) || den === null || den === 0) continue; // 빈칸·0은 다른 규칙이 잡는다
    const expected = nums.reduce<number>((a, b) => a + (b ?? 0), 0) / den;
    if (observed === null || Math.abs(observed - expected) > REL_TOL * Math.max(1, Math.abs(expected))) {
      out.push(
        makeFinding(rule, {
          sheet: sheetName,
          cell: ref,
          itemCode: itemCodeFor(sheet, parseCoord(ref).col),
          message: `${rule.message} (계산 ${round(expected)}, 입력 ${observed === null ? '없음' : round(observed)})`,
          detail: { expected, observed },
        }),
      );
    }
  }
  if (t.denominator_must_equal && t.checks?.[0]) {
    const den = t.checks[0].den as string;
    const a = toNumber(getQualified(ctx.wb, den));
    const b = toNumber(getQualified(ctx.wb, t.denominator_must_equal));
    if (a !== null && b !== null && Math.abs(a - b) > 1e-9) {
      const [s, r] = splitRef(den);
      out.push(
        makeFinding(rule, {
          sheet: s,
          cell: r,
          itemCode: itemCodeFor(ctx.wb.sheetByName.get(s), parseCoord(r).col),
          message: `B-5 분모(전공의 총 정원) ${a}가 양식 수식대로 가져온 A-3-2 정원 합계 ${b}와 다릅니다. 수식이 지워졌거나 값을 직접 고쳤는지 확인하세요(현재 인원이 아니라 총 정원으로 나눕니다).`,
          detail: { denominator: a, expected: b },
        }),
      );
    }
  }
  return out;
}

function round(n: number): string {
  return String(Math.round(n * 10000) / 10000);
}
