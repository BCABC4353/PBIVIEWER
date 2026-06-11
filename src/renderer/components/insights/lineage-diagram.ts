/**
 * Lineage diagram — pure layout logic for the blast-radius sheet's process
 * diagram (owner punch list v3, item 3): DATAFLOWS → DATASETS → REPORTS as
 * three columns of rounded-rect nodes joined by cubic beziers.
 *
 * Color language (OWNER-AUTHORIZED GREEN — diagram only, overriding the old
 * no-green rule): green = healthy nodes + happy-path edges, red = failed
 * nodes and the edges leaving them, amber = stale/suspect datasets and their
 * edges to reports, ash gray = dormant/never-run (abandoned, not on fire).
 *
 * Everything here is pure and unit-testable: node derivation, damage-first
 * prioritization, the +N-more cap, edge derivation (including report
 * bindings), bezier routing, and middle truncation. No React, no DOM.
 */
import type { InsightsRefreshable } from '../../../shared/types';
import type { BlastRadius } from '../../../shared/blast-radius';
import { isDormant } from './insights-luce';

// ---------------------------------------------------------------------------
// Color language
// ---------------------------------------------------------------------------

export type LineageHealth = 'failed' | 'stale' | 'healthy' | 'dormant';
export type LineageColumn = 'dataflow' | 'dataset' | 'report';

/** The diagram's four voices. Green is owner-authorized HERE only. */
export const lineageColor: Record<LineageHealth, string> = {
  healthy: '#3FB68B',
  failed: '#E5484D',
  stale: '#E5484D', // owner: downstream of a failure IS broken — both red
  dormant: 'rgba(255,255,255,0.45)', // ash, not failure — must still READ as a node
} as const;

/** Damage-first order for prioritization and edge dedupe (worst wins). */
export const damageRank: Record<LineageHealth, number> = {
  failed: 0,
  stale: 1,
  healthy: 2,
  dormant: 3,
} as const;

// ---------------------------------------------------------------------------
// Node + edge derivation
// ---------------------------------------------------------------------------

export interface LineageNodeSpec {
  id: string;
  name: string;
  health: LineageHealth;
}

export interface LineageLinkSpec {
  from: string;
  to: string;
  health: LineageHealth;
}

export interface LineageGraph {
  dataflows: LineageNodeSpec[];
  datasets: LineageNodeSpec[];
  reports: LineageNodeSpec[];
  links: LineageLinkSpec[];
}

export interface LineageReportInput {
  id: string;
  name: string;
  datasetId?: string;
}

/**
 * One item's voice in the diagram: failed (red) beats suspect/overdue
 * (amber) beats dormant/never-run (ash) beats healthy (green).
 */
export function itemHealth(
  item: InsightsRefreshable,
  suspectDatasetIds: ReadonlySet<string>,
  now: number = Date.now(),
): LineageHealth {
  if (item.lastStatus === 'Failed' || item.lastStatus === 'Cancelled') return 'failed';
  if (item.kind === 'dataset' && suspectDatasetIds.has(item.id)) return 'stale';
  if (item.scheduleOverdue) return 'stale';
  if (item.lastStatus === 'Never' || isDormant(item, now)) return 'dormant';
  return 'healthy';
}

/** A report inherits its dataset's trouble: red or amber upstream both mean
 *  "this report may be lying" (amber); ash stays ash; green stays green. */
function reportHealth(datasetHealth: LineageHealth): LineageHealth {
  if (datasetHealth === 'failed' || datasetHealth === 'stale') return 'stale';
  return datasetHealth;
}

/**
 * Build the full (uncapped) lineage graph for ONE workspace:
 * - dataflow nodes + dataset nodes from the group's items;
 * - report nodes for ALL reports bound to the workspace's datasets (a
 *   per-dataset report map computed from snapshot.reports — not just the
 *   blast-radius suspects);
 * - dataflow→dataset edges from upstreamDataflowIds (case-insensitive id
 *   match, same rule as computeBlastRadius) and dataset→report edges from
 *   the datasetId bindings.
 *
 * Edge color: red when it LEAVES a failed node; amber when it carries a
 * suspect dataset's staleness (including a timing-skew implication from a
 * non-failed flow, via blast.suspectsByDataflow); ash from dormant nodes;
 * green for the happy path.
 */
export function deriveLineage(
  items: InsightsRefreshable[],
  blast: Pick<BlastRadius, 'suspectDatasetIds' | 'suspectsByDataflow'>,
  reports: LineageReportInput[],
  now: number = Date.now(),
): LineageGraph {
  const flows = items.filter((i) => i.kind === 'dataflow');
  const sets = items.filter((i) => i.kind === 'dataset');
  const flowByLowerId = new Map(flows.map((f) => [f.id.toLowerCase(), f]));
  const setIds = new Set(sets.map((s) => s.id));

  const health = (item: InsightsRefreshable): LineageHealth =>
    itemHealth(item, blast.suspectDatasetIds, now);

  // Per-dataset report map from snapshot.reports — every report bound to one
  // of this workspace's datasets, suspect or not.
  const reportsByDataset = new Map<string, LineageReportInput[]>();
  for (const r of reports) {
    if (!r.datasetId || !setIds.has(r.datasetId)) continue;
    const list = reportsByDataset.get(r.datasetId) ?? [];
    list.push(r);
    reportsByDataset.set(r.datasetId, list);
  }

  // Owner rule: dormancy propagates. A dataset fed ONLY by dormant flows is
  // dormant (failure/staleness still outrank); reports inherit downstream.
  const effectiveDatasetHealth = (s: InsightsRefreshable): LineageHealth => {
    const own = health(s);
    if (own === 'failed' || own === 'stale' || own === 'dormant') return own;
    const ups = (s.upstreamDataflowIds ?? [])
      .map((id) => flowByLowerId.get(id.toLowerCase()))
      .filter((f): f is InsightsRefreshable => Boolean(f));
    if (ups.length > 0 && ups.every((f) => health(f) === 'dormant')) return 'dormant';
    return own;
  };

  const dataflows = flows.map((f) => ({ id: f.id, name: f.name, health: health(f) }));
  const datasets = sets.map((s) => ({ id: s.id, name: s.name, health: effectiveDatasetHealth(s) }));
  const reportNodes: LineageNodeSpec[] = [];
  const seenReports = new Set<string>();
  const links: LineageLinkSpec[] = [];

  for (const ds of sets) {
    const dsHealth = effectiveDatasetHealth(ds);
    for (const flowId of ds.upstreamDataflowIds ?? []) {
      const flow = flowByLowerId.get(flowId.toLowerCase());
      if (!flow) continue; // lineage can reference flows the snapshot can't see
      const flowHealth = health(flow);
      const implicated = (blast.suspectsByDataflow.get(flow.id) ?? []).some(
        (s) => s.id === ds.id,
      );
      links.push({
        from: flow.id,
        to: ds.id,
        health:
          // The damage path is CONTIGUOUS (owner v8): an edge touching a red
          // node at EITHER end is red — grey-into-red reads as a broken chain.
          flowHealth === 'failed' || dsHealth === 'failed' || dsHealth === 'stale'
            ? 'failed'
            : implicated
              ? 'stale'
              : flowHealth === 'dormant'
                ? 'dormant'
                : 'healthy',
      });
    }
    for (const r of reportsByDataset.get(ds.id) ?? []) {
      if (!seenReports.has(r.id)) {
        seenReports.add(r.id);
        reportNodes.push({ id: r.id, name: r.name, health: reportHealth(dsHealth) });
      }
      links.push({
        from: ds.id,
        to: r.id,
        health:
          dsHealth === 'failed' || dsHealth === 'stale'
            ? 'failed' // contiguous damage (owner v8)
            : dsHealth === 'dormant'
                ? 'dormant'
                : 'healthy',
      });
    }
  }

  return { dataflows, datasets, reports: reportNodes, links };
}

// ---------------------------------------------------------------------------
// Damage-first prioritization + the +N-more cap
// ---------------------------------------------------------------------------

/** Max visible nodes per column — real workspaces carry 25+ datasets. */
export const LINEAGE_CAP = 8;

/** Stable damage-first order: failed, stale, healthy, dormant (ash last). */
export function prioritizeDamageFirst(nodes: LineageNodeSpec[]): LineageNodeSpec[] {
  return [...nodes].sort((a, b) => damageRank[a.health] - damageRank[b.health]);
}

export interface CappedColumn {
  visible: LineageNodeSpec[];
  /** How many nodes the "+N more" ash node stands in for (0 = none). */
  overflow: number;
}

/**
 * Cap a column at `cap` rows, damage-first. When the column overflows, the
 * last row is surrendered to a "+N more" ash node, so cap-1 named nodes show.
 */
export function capColumn(nodes: LineageNodeSpec[], cap: number = LINEAGE_CAP): CappedColumn {
  const sorted = prioritizeDamageFirst(nodes);
  if (sorted.length <= cap) return { visible: sorted, overflow: 0 };
  return { visible: sorted.slice(0, cap - 1), overflow: sorted.length - (cap - 1) };
}

// ---------------------------------------------------------------------------
// Truncation + edge routing
// ---------------------------------------------------------------------------

/** Middle-truncate to `max` chars: "AUTO FINANCE…G MODEL" — ends survive. */
export function middleTruncate(name: string, max: number = 24): string {
  if (name.length <= max) return name;
  const head = Math.ceil((max - 1) / 2);
  const tail = max - 1 - head;
  return `${name.slice(0, head)}…${name.slice(name.length - tail)}`;
}

/** Smooth cubic bezier between two node anchor points, left → right. */
export function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  const mx = x1 + (x2 - x1) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}

// ---------------------------------------------------------------------------
// Layout — node placement, column centering, edge remapping
// ---------------------------------------------------------------------------

export interface LineageNode extends LineageNodeSpec {
  column: LineageColumn;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Middle-truncated display label (full name stays in `name`). */
  label: string;
  /** Set on the "+N more" stand-in node. */
  overflow?: number;
}

export interface LineageEdge extends LineageLinkSpec {
  path: string;
}

export interface LineageLayout {
  nodes: LineageNode[];
  edges: LineageEdge[];
  width: number;
  height: number;
  /** Left x of each column, for the engraved column headers. */
  columnX: [number, number, number];
}

export interface LineageLayoutOptions {
  width?: number;
  nodeWidth?: number;
  nodeHeight?: number;
  rowGap?: number;
  headerHeight?: number;
  cap?: number;
}

const COLUMN_KEYS: [LineageColumn, LineageColumn, LineageColumn] = [
  'dataflow',
  'dataset',
  'report',
];

/** Stable id for a column's "+N more" stand-in node. */
export function overflowNodeId(column: LineageColumn): string {
  return `more:${column}`;
}

/**
 * Lay the capped graph out: three columns (left/center/right), rows top-down
 * in damage-first order, shorter columns vertically centered against the
 * tallest. Edges whose endpoint was capped away re-route to that column's
 * "+N more" node; parallel edges between the same drawn pair dedupe to the
 * WORST health so damage never disappears into the aggregate.
 */
export function layoutLineage(
  graph: LineageGraph,
  opts: LineageLayoutOptions = {},
): LineageLayout {
  const width = opts.width ?? 816;
  const nodeWidth = opts.nodeWidth ?? 220;
  const nodeHeight = opts.nodeHeight ?? 30;
  const rowGap = opts.rowGap ?? 10;
  const headerHeight = opts.headerHeight ?? 26;
  // Owner mandate: the diagram shows EVERY node — his data is never elided
  // ("you don't get to cut off and say +10 others"). The sheet scrolls; the
  // diagram takes the height it needs. capColumn remains for explicit opts.
  const cap = opts.cap ?? Number.MAX_SAFE_INTEGER;

  const columns = [graph.dataflows, graph.datasets, graph.reports];
  const xs: [number, number, number] = [0, (width - nodeWidth) / 2, width - nodeWidth];
  const capped = columns.map((c) => capColumn(c, cap));
  const rowCounts = capped.map((c) => c.visible.length + (c.overflow > 0 ? 1 : 0));
  const maxRows = Math.max(...rowCounts, 1);

  const nodes: LineageNode[] = [];
  /** original id → drawn id (itself, or the column's +N-more node). */
  const drawnId = new Map<string, string>();

  capped.forEach((col, i) => {
    const column = COLUMN_KEYS[i]!;
    const x = xs[i]!;
    const rows = rowCounts[i]!;
    const top = headerHeight + ((maxRows - rows) * (nodeHeight + rowGap)) / 2;
    col.visible.forEach((n, row) => {
      nodes.push({
        ...n,
        column,
        x,
        y: top + row * (nodeHeight + rowGap),
        width: nodeWidth,
        height: nodeHeight,
        label: middleTruncate(n.name),
      });
      drawnId.set(n.id, n.id);
    });
    if (col.overflow > 0) {
      const id = overflowNodeId(column);
      nodes.push({
        id,
        name: `${col.overflow} more ${column}s`,
        health: 'dormant', // ash — the rest of the fleet, not a failure
        column,
        x,
        y: top + col.visible.length * (nodeHeight + rowGap),
        width: nodeWidth,
        height: nodeHeight,
        label: `+${col.overflow} more`,
        overflow: col.overflow,
      });
      const visibleIds = new Set(col.visible.map((n) => n.id));
      for (const n of columns[i]!) {
        if (!visibleIds.has(n.id)) drawnId.set(n.id, id);
      }
    }
  });

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const bestByPair = new Map<string, LineageLinkSpec>();
  for (const link of graph.links) {
    const from = drawnId.get(link.from);
    const to = drawnId.get(link.to);
    if (!from || !to) continue;
    const key = `${from}->${to}`;
    const prev = bestByPair.get(key);
    if (!prev || damageRank[link.health] < damageRank[prev.health]) {
      bestByPair.set(key, { from, to, health: link.health });
    }
  }
  const edges: LineageEdge[] = [...bestByPair.values()].map((e) => {
    const a = nodeById.get(e.from)!;
    const b = nodeById.get(e.to)!;
    return {
      ...e,
      path: edgePath(a.x + a.width, a.y + a.height / 2, b.x, b.y + b.height / 2),
    };
  });

  const height = headerHeight + maxRows * (nodeHeight + rowGap) - rowGap + 8;
  return { nodes, edges, width, height, columnX: xs };
}
