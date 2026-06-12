import type { FilterStatus, ComparisonOp, LeafPredicate, FilterPredicate } from './types.ts';

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

function isStringLiteral(value: unknown): boolean {
  const lit = (value as Record<string, unknown>)?.['Literal'] as Record<string, unknown> | undefined;
  const raw = lit?.['Value'];
  if (typeof raw !== 'string') return false;
  return raw.length >= 2 && raw.startsWith("'") && raw.endsWith("'");
}

const DATETIME_MIDNIGHT = /^datetime'(\d{4})-(\d{2})-(\d{2})(?:T00:00:00)?'$/;
const DATETIME_NONMIDNIGHT = /^datetime'/;

function unwrapLiteralForPredicate(value: unknown): { scalar: string; isString: boolean } | null {
  const lit = (value as Record<string, unknown>)?.['Literal'] as Record<string, unknown> | undefined;
  const raw = lit?.['Value'];
  if (typeof raw !== 'string') return null;

  if (raw.length >= 2 && raw.startsWith("'") && raw.endsWith("'")) {
    const unquoted = raw.slice(1, -1).replace(/''/g, "'");
    return { scalar: unquoted, isString: true };
  }

  if (DATETIME_MIDNIGHT.test(raw)) {
    const m = DATETIME_MIDNIGHT.exec(raw)!;
    return { scalar: `DATE(${m[1]},${m[2]},${m[3]})`, isString: false };
  }

  if (DATETIME_NONMIDNIGHT.test(raw)) {
    return null;
  }

  if (raw === 'true') return { scalar: 'TRUE()', isString: false };
  if (raw === 'false') return { scalar: 'FALSE()', isString: false };

  if (raw.endsWith('L') && /^-?\d+L$/.test(raw)) return { scalar: raw.slice(0, -1), isString: false };
  if (raw.endsWith('D') && /^-?[\d.]+D$/.test(raw)) return { scalar: raw.slice(0, -1), isString: false };

  if (/^-?[\d.]+$/.test(raw)) return { scalar: raw, isString: false };

  return null;
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

function extractInValuesForPredicate(
  inNode: Record<string, unknown>,
): { values: string[]; isString: boolean } | null {
  const rawValues = inNode['Values'];
  if (!Array.isArray(rawValues)) return null;
  const out: string[] = [];
  let isString = false;
  for (const tuple of rawValues) {
    if (!Array.isArray(tuple) || tuple.length === 0) return null;
    const parsed = unwrapLiteralForPredicate(tuple[0]);
    if (parsed === null) return null;
    if (parsed.isString) isString = true;
    out.push(parsed.scalar);
  }
  return { values: out, isString };
}

const COMPARISON_KIND_MAP: Record<number, ComparisonOp> = {
  0: '=',
  1: '>',
  2: '>=',
  3: '<',
  4: '<=',
};

function parseComparisonNode(
  cmpNode: Record<string, unknown>,
): { op: ComparisonOp; value: string; isString: boolean } | null {
  const kind = cmpNode['ComparisonKind'];
  if (typeof kind !== 'number') return null;
  const op = COMPARISON_KIND_MAP[kind];
  if (!op) return null;
  const right = cmpNode['Right'];
  const parsed = unwrapLiteralForPredicate(right);
  if (!parsed) return null;
  return { op, value: parsed.scalar, isString: parsed.isString };
}

function parseBetweenNode(
  betweenNode: Record<string, unknown>,
): { lo: string; hi: string; isString: boolean } | null {
  const lower = betweenNode['Lower'];
  const upper = betweenNode['Upper'];
  const loParsed = unwrapLiteralForPredicate(lower);
  const hiParsed = unwrapLiteralForPredicate(upper);
  if (!loParsed || !hiParsed) return null;
  return { lo: loParsed.scalar, hi: hiParsed.scalar, isString: loParsed.isString || hiParsed.isString };
}

function parseLeafCond(
  cond: Record<string, unknown>,
): { pred: LeafPredicate; column: string } | { reason: string } {
  if ('In' in cond) {
    const inNode = cond['In'] as Record<string, unknown>;
    const parsed = extractInValuesForPredicate(inNode);
    if (!parsed || parsed.values.length === 0) return { reason: 'In condition with no extractable literal values' };
    const exprs = inNode['Expressions'];
    const col = extractColumnName(exprs);
    if (!col) return { reason: 'In condition target is not a plain Column' };
    return { pred: { kind: 'not-in', values: parsed.values, isString: parsed.isString }, column: col };
  }

  if ('Comparison' in cond) {
    const cmpNode = cond['Comparison'] as Record<string, unknown>;
    const parsed = parseComparisonNode(cmpNode);
    if (!parsed) return { reason: 'Comparison condition with unrecognised kind or non-literal right side' };
    const col = extractColumnName([cmpNode['Left']]);
    if (!col) return { reason: 'Comparison left side is not a plain Column' };
    return { pred: { kind: 'comparison', op: parsed.op, value: parsed.value, isString: parsed.isString }, column: col };
  }

  if ('Between' in cond) {
    const betNode = cond['Between'] as Record<string, unknown>;
    const parsed = parseBetweenNode(betNode);
    if (!parsed) return { reason: 'Between condition with non-literal bounds' };
    const col = extractColumnName([betNode['Expression']]);
    if (!col) return { reason: 'Between target is not a plain Column' };
    return { pred: { kind: 'between', lo: parsed.lo, hi: parsed.hi, isString: parsed.isString }, column: col };
  }

  const kind = Object.keys(cond)[0] ?? 'unknown';
  return { reason: `unhandled leaf condition kind: ${kind}` };
}

function extractColumnName(exprs: unknown): string | null {
  const arr = Array.isArray(exprs) ? exprs : [exprs];
  const first = arr[0];
  if (!first || typeof first !== 'object') return null;
  const f = first as Record<string, unknown>;

  if ('Column' in f) {
    const col = f['Column'] as Record<string, unknown> | undefined;
    const prop = col?.['Property'];
    return typeof prop === 'string' ? prop : null;
  }

  if ('Expression' in f) {
    const inner = f['Expression'] as Record<string, unknown> | undefined;
    if (inner && 'Column' in inner) {
      const col = inner['Column'] as Record<string, unknown> | undefined;
      const prop = col?.['Property'];
      return typeof prop === 'string' ? prop : null;
    }
  }

  return null;
}

type ParseCondResult =
  | { status: 'ok'; pred: FilterPredicate; column: string }
  | { status: 'err'; reason: string };

function parseCondNode(cond: Record<string, unknown>, depth: number): ParseCondResult {
  if (depth > 3) return { status: 'err', reason: 'And/Or nesting depth exceeds 3' };

  if ('Not' in cond) {
    const inner = (cond['Not'] as Record<string, unknown>)?.['Expression'] as Record<string, unknown> | undefined;
    if (!inner) return { status: 'err', reason: 'Not condition with no inner Expression' };
    if ('In' in inner) {
      const inNode = inner['In'] as Record<string, unknown>;
      const parsed = extractInValuesForPredicate(inNode);
      if (!parsed || parsed.values.length === 0) return { status: 'err', reason: 'Not(In) with no extractable literal values' };
      const exprs = inNode['Expressions'];
      const col = extractColumnName(exprs);
      if (!col) return { status: 'err', reason: 'Not(In) target is not a plain Column' };
      return { status: 'ok', pred: { kind: 'not-in', values: parsed.values, isString: parsed.isString }, column: col };
    }
    return { status: 'err', reason: 'Not wraps a non-In condition; cannot translate' };
  }

  if ('And' in cond || 'Or' in cond) {
    const isAnd = 'And' in cond;
    const node = (isAnd ? cond['And'] : cond['Or']) as Record<string, unknown> | undefined;
    if (!node) return { status: 'err', reason: 'And/Or node missing' };
    const leftCond = node['Left'] as Record<string, unknown> | undefined;
    const rightCond = node['Right'] as Record<string, unknown> | undefined;
    if (!leftCond || !rightCond) return { status: 'err', reason: 'And/Or missing Left or Right' };

    const leftR = parseCondNode(leftCond, depth + 1);
    if (leftR.status === 'err') return leftR;
    const rightR = parseCondNode(rightCond, depth + 1);
    if (rightR.status === 'err') return rightR;

    if (leftR.column !== rightR.column) {
      return { status: 'err', reason: `cross-column And/Or: ${leftR.column} vs ${rightR.column}` };
    }

    const leftPred = leftR.pred;
    const rightPred = rightR.pred;

    if (leftPred.kind === 'and-or' || rightPred.kind === 'and-or') {
      return { status: 'err', reason: 'nested And/Or with non-leaf children not supported' };
    }

    return {
      status: 'ok',
      pred: { kind: 'and-or', op: isAnd ? 'AND' : 'OR', left: leftPred, right: rightPred },
      column: leftR.column,
    };
  }

  const leafR = parseLeafCond(cond);
  if ('reason' in leafR) return { status: 'err', reason: leafR.reason };
  return { status: 'ok', pred: leafR.pred, column: leafR.column };
}

export function parseCategoricalFilter(
  filterBody: Record<string, unknown> | undefined,
): { status: FilterStatus; values?: string[]; predicate?: FilterPredicate; reason?: string } {
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

  if ('In' in cond) {
    const inNode = cond['In'] as Record<string, unknown> | undefined;
    if (!inNode) return { status: 'unparseable', reason: 'In node missing' };
    const values = extractInValues(inNode);
    if (values === null || values.length === 0) {
      return { status: 'unparseable', reason: 'In condition with no extractable literal values' };
    }
    return { status: 'in-values', values };
  }

  if ('Not' in cond) {
    const r = parseCondNode(cond, 1);
    if (r.status === 'err') return { status: 'unparseable', reason: r.reason };
    const pred = r.pred;
    if (pred.kind === 'not-in') {
      return {
        status: 'not-in',
        predicate: pred,
        values: isStringLiteral((cond['Not'] as Record<string, unknown>)?.['Expression']) ? undefined : undefined,
      };
    }
    return { status: 'unparseable', reason: 'Not wraps unexpected inner shape' };
  }

  if ('Comparison' in cond || 'Between' in cond) {
    const r = parseCondNode(cond, 1);
    if (r.status === 'err') return { status: 'unparseable', reason: r.reason };
    const pred = r.pred;
    if (pred.kind === 'comparison') return { status: 'comparison', predicate: pred };
    if (pred.kind === 'between') return { status: 'between', predicate: pred };
    return { status: 'unparseable', reason: 'unexpected predicate kind from leaf parse' };
  }

  if ('And' in cond || 'Or' in cond) {
    const r = parseCondNode(cond, 1);
    if (r.status === 'err') return { status: 'unparseable', reason: r.reason };
    return { status: 'and-or', predicate: r.pred };
  }

  const kind = Object.keys(cond)[0] ?? 'unknown';
  return { status: 'unparseable', reason: `unhandled condition kind: ${kind}` };
}
