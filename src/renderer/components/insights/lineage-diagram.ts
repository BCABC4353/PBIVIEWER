import type { InsightsRefreshable } from '../../../shared/types';
import type { BlastRadius } from '../../../shared/blast-radius';
import { isDormant } from './insights-luce';


export type LineageHealth = 'failed' | 'stale' | 'healthy' | 'dormant';
export type LineageColumn = 'dataflow' | 'dataset' | 'report';

export const lineageColor: Record<LineageHealth, string> = {
  healthy: '#3FB68B',
  failed: '#E5484D',
  stale: '#E5484D',
  dormant: 'rgba(255,255,255,0.45)',
} as const;

export const damageRank: Record<LineageHealth, number> = {
  failed: 0,
  stale: 1,
  healthy: 2,
  dormant: 3,
} as const;


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

function reportHealth(datasetHealth: LineageHealth): LineageHealth {
  if (datasetHealth === 'failed' || datasetHealth === 'stale') return 'stale';
  return datasetHealth;
}

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

  const reportsByDataset = new Map<string, LineageReportInput[]>();
  for (const r of reports) {
    if (!r.datasetId || !setIds.has(r.datasetId)) continue;
    const list = reportsByDataset.get(r.datasetId) ?? [];
    list.push(r);
    reportsByDataset.set(r.datasetId, list);
  }

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
      if (!flow) continue;
      const flowHealth = health(flow);
      links.push({
        from: flow.id,
        to: ds.id,
        health: flowHealth,
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
            ? 'failed'
            : dsHealth === 'dormant'
                ? 'dormant'
                : 'healthy',
      });
    }
  }

  return { dataflows, datasets, reports: reportNodes, links };
}


export const LINEAGE_CAP = 8;

export function prioritizeDamageFirst(nodes: LineageNodeSpec[]): LineageNodeSpec[] {
  return [...nodes].sort((a, b) => damageRank[a.health] - damageRank[b.health]);
}

export interface CappedColumn {
  visible: LineageNodeSpec[];
  overflow: number;
}

export function capColumn(nodes: LineageNodeSpec[], cap: number = LINEAGE_CAP): CappedColumn {
  const sorted = prioritizeDamageFirst(nodes);
  if (sorted.length <= cap) return { visible: sorted, overflow: 0 };
  return { visible: sorted.slice(0, cap - 1), overflow: sorted.length - (cap - 1) };
}


export function middleTruncate(name: string, max: number = 24): string {
  if (name.length <= max) return name;
  const head = Math.ceil((max - 1) / 2);
  const tail = max - 1 - head;
  return `${name.slice(0, head)}…${name.slice(name.length - tail)}`;
}

export function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  const mx = x1 + (x2 - x1) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}


export interface LineageNode extends LineageNodeSpec {
  column: LineageColumn;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
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

export function overflowNodeId(column: LineageColumn): string {
  return `more:${column}`;
}

export function layoutLineage(
  graph: LineageGraph,
  opts: LineageLayoutOptions = {},
): LineageLayout {
  const width = opts.width ?? 816;
  const nodeWidth = opts.nodeWidth ?? 220;
  const nodeHeight = opts.nodeHeight ?? 30;
  const rowGap = opts.rowGap ?? 10;
  const headerHeight = opts.headerHeight ?? 26;
  const cap = opts.cap ?? Number.MAX_SAFE_INTEGER;

  const columns = [graph.dataflows, graph.datasets, graph.reports];
  const xs: [number, number, number] = [0, (width - nodeWidth) / 2, width - nodeWidth];
  const capped = columns.map((c) => capColumn(c, cap));
  const rowCounts = capped.map((c) => c.visible.length + (c.overflow > 0 ? 1 : 0));
  const maxRows = Math.max(...rowCounts, 1);

  const nodes: LineageNode[] = [];
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
        health: 'dormant',
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
