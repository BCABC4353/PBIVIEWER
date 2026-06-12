export interface Diagnostic {
  level: 'warn' | 'error';
  code: string;
  message: string;
  path: string;
}

export interface FieldExprColumn {
  kind: 'Column';
  table: string;
  property: string;
}

export interface FieldExprMeasure {
  kind: 'Measure';
  table: string;
  property: string;
}

export interface FieldExprAggregation {
  kind: 'Aggregation';
  table: string;
  property: string;
  fn: number;
}

export type FieldExpr = FieldExprColumn | FieldExprMeasure | FieldExprAggregation;

export interface Projection {
  field: FieldExpr | null;
  queryRef: string;
  nativeQueryRef?: string;
  displayName?: string;
  active?: boolean;
}

export interface QueryRole {
  projections: Projection[];
}

export interface VisualQuery {
  queryState: Record<string, QueryRole>;
}

export interface VisualPosition {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  tabOrder?: number;
}

export type FilterStatus = 'in-values' | 'not-in' | 'comparison' | 'between' | 'and-or' | 'unparseable' | 'not-applicable';

export type ComparisonOp = '>=' | '>' | '<=' | '<' | '=';

export interface PredicateComparison {
  kind: 'comparison';
  op: ComparisonOp;
  value: string;
  isString: boolean;
}

export interface PredicateBetween {
  kind: 'between';
  lo: string;
  hi: string;
  isString: boolean;
}

export interface PredicateNotIn {
  kind: 'not-in';
  values: string[];
  isString: boolean;
}

export interface PredicateAndOr {
  kind: 'and-or';
  op: 'AND' | 'OR';
  left: LeafPredicate;
  right: LeafPredicate;
}

export type LeafPredicate = PredicateComparison | PredicateBetween | PredicateNotIn;
export type FilterPredicate = LeafPredicate | PredicateAndOr;

export interface FilterEntry {
  name: string;
  field: FieldExpr | null;
  type: string;
  values?: string[];
  predicate?: FilterPredicate;
  status: FilterStatus;
  reason?: string;
}

export interface VisualRecord {
  name: string;
  position: VisualPosition;
  visualType: string;
  query: VisualQuery;
  isHidden?: boolean;
  filterConfig?: { filters: FilterEntry[] };
  mobile?: MobilePosition;
}

export interface MobilePosition {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
}

export interface PageRecord {
  name: string;
  displayName: string;
  width: number;
  height: number;
  visuals: VisualRecord[];
}

export interface ReportRecord {
  reportDir: string;
  pages: PageRecord[];
  diagnostics: Diagnostic[];
}
