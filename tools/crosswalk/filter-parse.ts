import type { FilterStatus } from './types.ts';

export function unwrapLiteral(value: unknown): string | null {
  const lit = (value as Record<string, unknown>)?.['Literal'] as Record<string, unknown> | undefined;
  const raw = lit?.['Value'];
  if (typeof raw !== 'string') return null;
  if (raw.length >= 2 && raw.startsWith("'") && raw.endsWith("'")) {
    return raw.slice(1, -1).replace(/''/g, "'");
  }
  if (raw.endsWith('L') && /^-?\d+L$/.test(raw)) return raw.slice(0, -1);
  if (raw.endsWith('D') && /^-?[\d.]+D$/.test(raw)) return raw.slice(0, -1);
  return raw;
}

export function extractInValues(inNode: Record<string, unknown>): string[] | null {
  const rawValues = inNode['Values'];
  if (!Array.isArray(rawValues)) return null;
  const out: string[] = [];
  for (const tuple of rawValues) {
    if (!Array.isArray(tuple) || tuple.length === 0) return null;
    const lit = unwrapLiteral(tuple[0]);
    if (lit === null) return null;
    out.push(lit);
  }
  return out;
}

export function parseCategoricalFilter(
  filterBody: Record<string, unknown> | undefined,
): { status: FilterStatus; values?: string[]; reason?: string } {
  if (!filterBody) return { status: 'unparseable', reason: 'no filter body' };
  const where = filterBody['Where'] as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(where) || where.length === 0) {
    return { status: 'unparseable', reason: 'no Where clause' };
  }
  if (where.length > 1) {
    return { status: 'unparseable', reason: 'compound multi-condition Where' };
  }
  const cond = where[0]?.['Condition'] as Record<string, unknown> | undefined;
  if (!cond) return { status: 'unparseable', reason: 'no Condition' };
  if ('Not' in cond) {
    return { status: 'unparseable', reason: 'negated (Not) condition' };
  }
  if ('And' in cond || 'Or' in cond) {
    return { status: 'unparseable', reason: 'compound And/Or condition' };
  }
  const inNode = cond['In'] as Record<string, unknown> | undefined;
  if (!inNode) {
    const kind = Object.keys(cond)[0] ?? 'unknown';
    return { status: 'unparseable', reason: `non-In condition: ${kind}` };
  }
  const values = extractInValues(inNode);
  if (values === null || values.length === 0) {
    return { status: 'unparseable', reason: 'In condition with no extractable literal values' };
  }
  return { status: 'in-values', values };
}
