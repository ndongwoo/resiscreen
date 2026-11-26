import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FormFormulas, RuleSet } from '../../src/engine/rules.ts';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

export function loadRules(year = 2026): RuleSet {
  return JSON.parse(readFileSync(join(ROOT, `rules/${year}.json`), 'utf8')) as RuleSet;
}

export function loadFormulas(year = 2026): FormFormulas {
  return JSON.parse(readFileSync(join(ROOT, `data/forms/${year}_formulas.json`), 'utf8')) as FormFormulas;
}

export function loadSchema(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(ROOT, 'rules/schema.json'), 'utf8')) as Record<string, unknown>;
}

export const PRIVATE_DIR = join(ROOT, 'tests/fixtures/private');

export function privateFile(name: string): string | null {
  const p = join(PRIVATE_DIR, name);
  return existsSync(p) ? p : null;
}
