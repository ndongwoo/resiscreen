/**
 * rules/*.json 스키마 검증(CI에서 실행). 비개발자가 GitHub 웹에서 규칙을 고친 뒤 오타를 잡는다.
 *   node dist-node/tools/validate_rules.js
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateRuleSet } from '../src/engine/schema.ts';

const dir = join(process.cwd(), 'rules');
const schema = JSON.parse(readFileSync(join(dir, 'schema.json'), 'utf8'));
let failed = 0;
for (const f of readdirSync(dir).filter((f) => /^\d{4}\.json$/.test(f))) {
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  } catch (e) {
    console.error(`${f}: JSON 문법 오류 — ${(e as Error).message}`);
    failed++;
    continue;
  }
  const errs = validateRuleSet(data, schema);
  if (errs.length) {
    failed++;
    console.error(`${f}: ${errs.length}건\n  ${errs.join('\n  ')}`);
  } else console.log(`${f}: 통과`);
}
process.exit(failed ? 1 : 0);
