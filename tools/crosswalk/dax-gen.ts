import {
  columnRef,
  measureRef,
  daxStringLiteral,
} from './escape.ts';
import { buildPredicateFilterClause } from './predicate-gen.ts';
import type { VisualRecord, Projection, FieldExpr, FilterEntry, Diagnostic } from './reader.ts';

const AGG_DAX: Record<number, string> = {
  0: 'SUM',
  1: 'AVERAGE',
  2: 'MIN',
  3: 'MAX',
  4: 'COUNT',
  5: 'COUNTA',
  6: 'MEDIAN',
  7: 'STDEV.P',
  8: 'VAR.P',
};

const GROUP_ROLES = new Set(['Category', 'Axis', 'Rows', 'Columns', 'Data', 'Legend', 'Series', 'Location']);
const MEASURE_ROLES = new Set(['Y', 'Values', 'Value', 'X', 'Size', 'Tooltips', 'Measure']);
const SKIP_TYPES = new Set(['actionbutton', 'image', 'textbox', 'text']);

export interface DaxResult {
  dax: string | null;
  filtersIncomplete: boolean;
  diagnostics: Diagnostic[];
}

function fieldToGroupExpr(field: FieldExpr): string | null {
  if (field.kind === 'Column') return columnRef(field.table, field.property);
  if (field.kind === 'Measure') return null;
  return null;
}

function fieldToValueExpr(field: FieldExpr, queryRef: string): { expr: string; name: string } | null {
  if (field.kind === 'Measure') {
    const safeName = safeValueName(field.property, queryRef);
    return { expr: measureRef(field.property), name: safeName };
  }
  if (field.kind === 'Aggregation') {
    const aggFn = AGG_DAX[field.fn];
    if (!aggFn) return null;
    const inner = columnRef(field.table, field.property);
    const safeName = safeValueName(field.property, queryRef);
    return { expr: `${aggFn}(${inner})`, name: safeName };
  }
  if (field.kind === 'Column') {
    return null;
  }
  return null;
}

function safeValueName(property: string, queryRef: string): string {
  const base = property.replace(/[^A-Za-z0-9_]/g, '_');
  if (base.length === 0) return queryRef.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 30) || 'Value';
  return base + '_0';
}

function buildFilterClause(filterEntry: FilterEntry): string | null {
  const field = filterEntry.field;
  if (!field || field.kind !== 'Column') return null;
  const values = filterEntry.values;
  if (!Array.isArray(values) || values.length === 0) return null;
  const colRef = columnRef(field.table, field.property);
  const valueLiterals = values.map((v) => daxStringLiteral(v));
  return `KEEPFILTERS(TREATAS({${valueLiterals.join(', ')}}, ${colRef}))`;
}

export function buildDax(visual: VisualRecord, outerDiags: Diagnostic[]): DaxResult {
  const diags: Diagnostic[] = [];
  const visualType = visual.visualType.toLowerCase();

  if (SKIP_TYPES.has(visualType)) {
    return { dax: null, filtersIncomplete: false, diagnostics: diags };
  }

  const qs = visual.query.queryState;
  const groupExprs: string[] = [];
  const valueExprs: Array<{ expr: string; name: string }> = [];
  const seenNames = new Set<string>();

  for (const [role, roleData] of Object.entries(qs)) {
    const isGroup = GROUP_ROLES.has(role);
    const isMeasure = MEASURE_ROLES.has(role);

    for (const proj of roleData.projections) {
      if (!proj.field) continue;

      if (isGroup) {
        const ge = fieldToGroupExpr(proj.field);
        if (ge && !groupExprs.includes(ge)) {
          groupExprs.push(ge);
        } else if (!ge && (proj.field.kind === 'Aggregation' || proj.field.kind === 'Measure')) {
          const ve = fieldToValueExpr(proj.field, proj.queryRef);
          if (ve) {
            const name = uniquifyName(ve.name, seenNames);
            seenNames.add(name);
            valueExprs.push({ expr: ve.expr, name });
          }
        }
      } else if (isMeasure) {
        const ve = fieldToValueExpr(proj.field, proj.queryRef);
        if (ve) {
          const name = uniquifyName(ve.name, seenNames);
          seenNames.add(name);
          valueExprs.push({ expr: ve.expr, name });
        } else {
          const ge = fieldToGroupExpr(proj.field);
          if (ge && !groupExprs.includes(ge)) {
            groupExprs.push(ge);
          }
        }
      }
    }
  }

  if (groupExprs.length === 0 && valueExprs.length === 0) {
    return { dax: null, filtersIncomplete: false, diagnostics: diags };
  }

  const filterClauses: string[] = [];
  let filtersIncomplete = false;

  if (visual.filterConfig?.filters) {
    for (const fe of visual.filterConfig.filters) {
      if (fe.status === 'not-applicable') continue;

      if (fe.status === 'unparseable') {
        filtersIncomplete = true;
        diags.push({
          level: 'warn',
          code: 'FILTER_OMITTED',
          message: `Categorical filter ${fe.name} omitted (${fe.reason ?? 'unparseable'})`,
          path: visual.name,
        });
        continue;
      }

      const field = fe.field;
      if (!field || field.kind !== 'Column') {
        filtersIncomplete = true;
        diags.push({
          level: 'warn',
          code: 'FILTER_FIELD_NOT_COLUMN',
          message: `Categorical filter ${fe.name} field is not a Column; omitted`,
          path: visual.name,
        });
        continue;
      }

      if (fe.status === 'not-in' || fe.status === 'comparison' || fe.status === 'between' || fe.status === 'and-or') {
        if (!fe.predicate) {
          filtersIncomplete = true;
          diags.push({
            level: 'warn',
            code: 'FILTER_OMITTED',
            message: `Categorical filter ${fe.name} missing predicate; omitted`,
            path: visual.name,
          });
          continue;
        }
        filterClauses.push(buildPredicateFilterClause(field.table, field.property, fe.predicate));
        continue;
      }

      const clause = buildFilterClause(fe);
      if (clause) {
        filterClauses.push(clause);
      } else {
        filtersIncomplete = true;
        diags.push({
          level: 'warn',
          code: 'FILTER_OMITTED',
          message: `Categorical filter ${fe.name} could not be compiled and was omitted`,
          path: visual.name,
        });
      }
    }
  }

  const parts: string[] = [
    ...groupExprs,
    ...valueExprs.map((v) => `${daxStringLiteral(v.name)}, ${v.expr}`),
    ...filterClauses,
  ];

  const dax = `EVALUATE\nSUMMARIZECOLUMNS(\n  ${parts.join(',\n  ')}\n)`;

  for (const d of diags) outerDiags.push(d);

  return { dax, filtersIncomplete, diagnostics: diags };
}

function uniquifyName(base: string, seen: Set<string>): string {
  if (!seen.has(base)) return base;
  let i = 1;
  while (seen.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

export function buildDaxFromProjections(
  groupProjections: Projection[],
  valueProjections: Projection[],
  filterClauses: string[],
): string {
  const groupExprs = groupProjections
    .map((p) => (p.field ? fieldToGroupExpr(p.field) : null))
    .filter((x): x is string => x !== null);

  const seenNames = new Set<string>();
  const valueParts = valueProjections
    .map((p) => {
      if (!p.field) return null;
      const ve = fieldToValueExpr(p.field, p.queryRef);
      if (!ve) return null;
      const name = uniquifyName(ve.name, seenNames);
      seenNames.add(name);
      return `${daxStringLiteral(name)}, ${ve.expr}`;
    })
    .filter((x): x is string => x !== null);

  const parts = [...groupExprs, ...valueParts, ...filterClauses];
  return `EVALUATE\nSUMMARIZECOLUMNS(\n  ${parts.join(',\n  ')}\n)`;
}
