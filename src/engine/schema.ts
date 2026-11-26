/**
 * 작은 JSON Schema 검증기(규칙 파일 전용). 외부 라이브러리를 늘리지 않기 위해 직접 구현.
 * 지원: type, required, properties, additionalProperties, items, enum, const, pattern,
 *       minimum, maximum, minItems, anyOf, $ref(#/definitions/...)
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
type Schema = Record<string, any>;

function typeOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

function typeMatches(v: unknown, t: string | string[]): boolean {
  const ts = Array.isArray(t) ? t : [t];
  const actual = typeOf(v);
  return ts.some((x) => x === actual || (x === 'number' && actual === 'integer'));
}

export function validate(value: unknown, schema: Schema, root: Schema = schema, path = '$'): string[] {
  if (schema.$ref) {
    const m = /^#\/definitions\/(.+)$/.exec(schema.$ref);
    const target = m ? root.definitions?.[m[1]!] : undefined;
    if (!target) return [`${path}: 스키마 참조를 찾을 수 없음 ${schema.$ref}`];
    return validate(value, target, root, path);
  }
  const errs: string[] = [];
  if (schema.anyOf) {
    const ok = (schema.anyOf as Schema[]).some((s) => validate(value, s, root, path).length === 0);
    if (!ok) errs.push(`${path}: 허용된 형태 중 어느 것과도 맞지 않습니다`);
    return errs;
  }
  if (schema.type && !typeMatches(value, schema.type)) return [`${path}: ${schema.type} 형식이어야 합니다(현재 ${typeOf(value)})`];
  if (schema.const !== undefined && value !== schema.const) errs.push(`${path}: ${JSON.stringify(schema.const)} 이어야 합니다`);
  if (schema.enum && !(schema.enum as unknown[]).includes(value)) errs.push(`${path}: 허용 값은 ${schema.enum.join(', ')} 입니다`);
  if (typeof value === 'string' && schema.pattern && !new RegExp(schema.pattern).test(value)) errs.push(`${path}: 형식(${schema.pattern})이 맞지 않습니다`);
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errs.push(`${path}: ${schema.minimum} 이상이어야 합니다`);
    if (schema.maximum !== undefined && value > schema.maximum) errs.push(`${path}: ${schema.maximum} 이하여야 합니다`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errs.push(`${path}: 항목이 ${schema.minItems}개 이상이어야 합니다`);
    if (schema.items) value.forEach((v, i) => errs.push(...validate(v, schema.items, root, `${path}[${i}]`)));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    for (const k of schema.required ?? []) if (!(k in obj)) errs.push(`${path}: '${k}' 항목이 필요합니다`);
    const props: Record<string, Schema> = schema.properties ?? {};
    for (const [k, v] of Object.entries(obj)) {
      if (props[k]) errs.push(...validate(v, props[k], root, `${path}.${k}`));
      else if (schema.additionalProperties === false) errs.push(`${path}: 알 수 없는 항목 '${k}' (오타인지 확인)`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object')
        errs.push(...validate(v, schema.additionalProperties, root, `${path}.${k}`));
    }
  }
  return errs;
}

/** 스키마 검증 + 스키마로 표현하기 어려운 교차 확인(규칙 ID 중복, 참조 규칙 존재) */
export function validateRuleSet(rules: unknown, schema: Schema): string[] {
  const errs = validate(rules, schema);
  if (errs.length) return errs;
  const rs = rules as { rules: { id: string; target: Record<string, unknown> }[] };
  const ids = new Set<string>();
  for (const r of rs.rules) {
    if (ids.has(r.id)) errs.push(`규칙 ID가 중복됩니다: ${r.id}`);
    ids.add(r.id);
  }
  for (const r of rs.rules) {
    const ref = r.target['ranges_from_rule'];
    if (typeof ref === 'string' && !ids.has(ref)) errs.push(`${r.id}: ranges_from_rule이 가리키는 규칙이 없습니다(${ref})`);
  }
  return errs;
}
