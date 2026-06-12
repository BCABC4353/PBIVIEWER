import { columnRef, daxStringLiteral } from './escape.ts';
import type { FilterPredicate, LeafPredicate } from './types.ts';

function daxScalar(value: string, isString: boolean): string {
  return isString ? daxStringLiteral(value) : value;
}

function leafPredicate(colRef: string, pred: LeafPredicate): string {
  if (pred.kind === 'not-in') {
    const literals = pred.values.map((v) => daxScalar(v, pred.isString)).join(', ');
    return `NOT(${colRef} IN {${literals}})`;
  }
  if (pred.kind === 'comparison') {
    return `${colRef} ${pred.op} ${daxScalar(pred.value, pred.isString)}`;
  }
  if (pred.kind === 'between') {
    return `${colRef} >= ${daxScalar(pred.lo, pred.isString)} && ${colRef} <= ${daxScalar(pred.hi, pred.isString)}`;
  }
  const _: never = pred;
  return _;
}

function renderPredicate(colRef: string, pred: FilterPredicate): string {
  if (pred.kind === 'and-or') {
    const leftExpr = leafPredicate(colRef, pred.left);
    const rightExpr = leafPredicate(colRef, pred.right);
    const join = pred.op === 'AND' ? ' && ' : ' || ';
    return `(${leftExpr})${join}(${rightExpr})`;
  }
  return leafPredicate(colRef, pred);
}

export function buildPredicateFilterClause(
  table: string,
  column: string,
  pred: FilterPredicate,
): string {
  const colRef = columnRef(table, column);
  const body = renderPredicate(colRef, pred);
  return `KEEPFILTERS(FILTER(ALL(${colRef}), ${body}))`;
}
