/**
 * 빌드할 때 rules/ 폴더의 모든 연도 규칙(YYYY.json)과 자동계산 칸 위치(data/forms/YYYY_formulas.json)를 모아 번들에 넣는다.
 * 새 연도 파일을 추가하면 다시 빌드할 때 자동으로 포함된다. 엑셀의 signature로 연도를 골라 쓴다(엔진).
 */
import type { FormFormulas, RuleSet } from '../engine/rules.ts';

const ruleModules = import.meta.glob<RuleSet>('../../rules/[0-9][0-9][0-9][0-9].json', { eager: true, import: 'default' });
const formulaModules = import.meta.glob<FormFormulas>('../../data/forms/*_formulas.json', { eager: true, import: 'default' });

/** 최근 연도가 먼저 */
export const RULESETS: RuleSet[] = Object.values(ruleModules).sort((a, b) => b.form.year - a.form.year);

export const FORMULAS: Record<number, FormFormulas> = Object.fromEntries(Object.values(formulaModules).map((f) => [f.year, f]));

/** 서지 설정·연락처 예시·큰 파일 기준은 가장 최근 연도 규칙을 따른다 */
export const LATEST: RuleSet = RULESETS[0]!;
