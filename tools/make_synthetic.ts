/**
 * 공개 테스트용 합성 샘플 생성(개인정보 없음).
 *   npm run build:node && node dist-node/tools/make_synthetic.js
 * tests/fixtures/synthetic/ 에 완성본 1개, 오류 포함본 1개를 만든다.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildXlsx } from '../tests/helpers/build_xlsx.ts';
import { syntheticForm } from '../tests/helpers/synthetic_form.ts';
import type { FormFormulas, RuleSet } from '../src/engine/rules.ts';

const root = process.cwd();
const rules = JSON.parse(readFileSync(join(root, 'rules/2026.json'), 'utf8')) as RuleSet;
const formulas = JSON.parse(readFileSync(join(root, 'data/forms/2026_formulas.json'), 'utf8')) as FormFormulas;
const out = join(root, 'tests/fixtures/synthetic');
mkdirSync(out, { recursive: true });

writeFileSync(join(out, '합성_2026_완성본.xlsx'), await buildXlsx(syntheticForm(rules, formulas)));
writeFileSync(
  join(out, '합성_2026_오류포함.xlsx'),
  await buildXlsx(
    syntheticForm(rules, formulas, {
      patch: {
        전체: { K7: undefined, H6: undefined, H7: 6, FK6: '9년 3개월', DS6: 5, DU8: { f: 'DS6/DT6', v: 5 / 4 }, EA6: 0.5 },
        'k 수면무호흡': { C5: undefined, E6: undefined },
        'd T&A': { D5: '가나다' },
        'a 고실': { C5: { v: 45300, s: 2 } },
      },
    }),
  ),
);
console.log(`합성 샘플 2개 생성: ${out}`);
