/**
 * Pure-layout coverage for the lineage diagram (owner punch list v3 #3):
 * column assignment, the diagram color language (red fails / amber stale /
 * green happy path / ash dormant), damage-first prioritization, the +N-more
 * cap, edge derivation including report bindings, bezier routing, and
 * middle truncation.
 */
import { describe, it, expect } from 'vitest';
import type { InsightsRefreshable } from '../../../shared/types';
import type { BlastRadius } from '../../../shared/blast-radius';
import {
  itemHealth,
  deriveLineage,
  prioritizeDamageFirst,
  capColumn,
  layoutLineage,
  middleTruncate,
  edgePath,
  overflowNodeId,
  lineageColor,
  LINEAGE_CAP,
  type LineageNodeSpec,
} from './lineage-diagram';

const NOW = Date.parse('2026-06-10T12:00:00.000Z');

function item(overrides: Partial<InsightsRefreshable>): InsightsRefreshable {
  return {
    kind: 'dataset',
    id: 'ds-1',
    name: 'Model',
    workspaceId: 'ws-1',
    workspaceName: 'Sales',
    lastStatus: 'Completed',
    lastAttemptTime: '2026-06-10T03:00:00.000Z',
    lastSuccessTime: '2026-06-10T03:00:00.000Z',
    ...overrides,
  };
}

function blastOf(
  suspectIds: string[] = [],
  byFlow: Array<[string, InsightsRefreshable[]]> = [],
): Pick<BlastRadius, 'suspectDatasetIds' | 'suspectsByDataflow'> {
  return {
    suspectDatasetIds: new Set(suspectIds),
    suspectsByDataflow: new Map(byFlow),
  };
}

describe('itemHealth — the diagram color language', () => {
  it('reads failed/cancelled as red, suspects and overdue as amber', () => {
    expect(itemHealth(item({ lastStatus: 'Failed' }), new Set(), NOW)).toBe('failed');
    expect(itemHealth(item({ lastStatus: 'Cancelled' }), new Set(), NOW)).toBe('failed');
    expect(itemHealth(item({ id: 'sus' }), new Set(['sus']), NOW)).toBe('stale');
    expect(itemHealth(item({ scheduleOverdue: true }), new Set(), NOW)).toBe('stale');
  });

  it('reads dormant and never-run as ash (isDormant helper), healthy as green', () => {
    const old = new Date(NOW - 482 * 24 * 3600_000).toISOString();
    expect(itemHealth(item({ lastAttemptTime: old, lastSuccessTime: old }), new Set(), NOW)).toBe('dormant');
    expect(
      itemHealth(item({ lastStatus: 'Never', lastAttemptTime: undefined, lastSuccessTime: undefined }), new Set(), NOW),
    ).toBe('dormant');
    expect(itemHealth(item({}), new Set(), NOW)).toBe('healthy');
  });

  it('lets failure outrank dormancy: FAILED · down 1347d stays red, not ash', () => {
    const ancient = new Date(NOW - 1347 * 24 * 3600_000).toISOString();
    expect(
      itemHealth(item({ lastStatus: 'Failed', lastAttemptTime: ancient, lastSuccessTime: ancient }), new Set(), NOW),
    ).toBe('failed');
  });

  it('suspect dataflows never exist — only datasets can be amber suspects', () => {
    expect(itemHealth(item({ kind: 'dataflow', id: 'sus' }), new Set(['sus']), NOW)).toBe('healthy');
  });

  it('exposes green/red/amber/ash tokens for the diagram only', () => {
    expect(lineageColor.healthy).toBe('#3FB68B');
    expect(lineageColor.failed).toBe('#E5484D');
    expect(lineageColor.stale).toBe('#E8A33D');
    expect(lineageColor.dormant).toContain('255,255,255'); // ash, not a hue
  });
});

describe('deriveLineage — column assignment + edge derivation', () => {
  const flow = item({ kind: 'dataflow', id: 'df-1', name: 'Root Flow', lastStatus: 'Failed' });
  const sus = item({ id: 'ds-sus', name: 'Suspect Model', upstreamDataflowIds: ['DF-1'] }); // case-insensitive
  const clean = item({ id: 'ds-clean', name: 'Clean Model' });
  const reports = [
    { id: 'r-1', name: 'Exec Daily', datasetId: 'ds-sus' },
    { id: 'r-2', name: 'Quiet Report', datasetId: 'ds-clean' },
    { id: 'r-3', name: 'Foreign Report', datasetId: 'ds-elsewhere' }, // not this workspace's dataset
    { id: 'r-4', name: 'Unbound Report' }, // no datasetId — no lineage signal
  ];

  it('assigns dataflows / datasets / reports to their columns', () => {
    const g = deriveLineage([flow, sus, clean], blastOf(['ds-sus'], [['df-1', [sus]]]), reports, NOW);
    expect(g.dataflows.map((n) => n.id)).toEqual(['df-1']);
    expect(g.datasets.map((n) => n.id)).toEqual(['ds-sus', 'ds-clean']);
    // ALL reports of the workspace's datasets appear — not just suspects.
    expect(g.reports.map((n) => n.id)).toEqual(['r-1', 'r-2']);
  });

  it('colors nodes: failed flow red, suspect amber, clean dataset green, suspect-bound report amber', () => {
    const g = deriveLineage([flow, sus, clean], blastOf(['ds-sus'], [['df-1', [sus]]]), reports, NOW);
    expect(g.dataflows[0]?.health).toBe('failed');
    expect(g.datasets.find((n) => n.id === 'ds-sus')?.health).toBe('stale');
    expect(g.datasets.find((n) => n.id === 'ds-clean')?.health).toBe('healthy');
    expect(g.reports.find((n) => n.id === 'r-1')?.health).toBe('stale');
    expect(g.reports.find((n) => n.id === 'r-2')?.health).toBe('healthy');
  });

  it('derives edges: red leaving the failed flow, amber from suspect to report, green happy path', () => {
    const g = deriveLineage([flow, sus, clean], blastOf(['ds-sus'], [['df-1', [sus]]]), reports, NOW);
    expect(g.links).toContainEqual({ from: 'df-1', to: 'ds-sus', health: 'failed' });
    expect(g.links).toContainEqual({ from: 'ds-sus', to: 'r-1', health: 'stale' });
    expect(g.links).toContainEqual({ from: 'ds-clean', to: 'r-2', health: 'healthy' });
  });

  it('marks a timing-skew implication amber even when the flow itself is green', () => {
    const lateFlow = item({ kind: 'dataflow', id: 'df-late', name: 'Late Flow' });
    const skewed = item({ id: 'ds-skew', name: 'Skewed Model', upstreamDataflowIds: ['df-late'] });
    const g = deriveLineage(
      [lateFlow, skewed],
      blastOf(['ds-skew'], [['df-late', [skewed]]]),
      [],
      NOW,
    );
    expect(g.dataflows[0]?.health).toBe('healthy');
    expect(g.links).toContainEqual({ from: 'df-late', to: 'ds-skew', health: 'stale' });
  });

  it('routes ash edges out of dormant flows and skips lineage to invisible flows', () => {
    const old = new Date(NOW - 500 * 24 * 3600_000).toISOString();
    const dustyFlow = item({ kind: 'dataflow', id: 'df-dusty', name: 'Dusty Flow', lastAttemptTime: old, lastSuccessTime: old });
    const ds = item({ id: 'ds-x', name: 'X', upstreamDataflowIds: ['df-dusty', 'df-not-visible'] });
    const g = deriveLineage([dustyFlow, ds], blastOf(), [], NOW);
    expect(g.links).toEqual([{ from: 'df-dusty', to: 'ds-x', health: 'dormant' }]);
  });

  it('inherits report health from a FAILED dataset as amber (may be reading stale data)', () => {
    const dead = item({ id: 'ds-dead', name: 'Dead Model', lastStatus: 'Failed' });
    const g = deriveLineage([dead], blastOf(), [{ id: 'r-x', name: 'Bound', datasetId: 'ds-dead' }], NOW);
    expect(g.reports[0]?.health).toBe('stale');
    expect(g.links).toContainEqual({ from: 'ds-dead', to: 'r-x', health: 'failed' });
  });
});

describe('prioritizeDamageFirst + capColumn (+N more)', () => {
  const mk = (id: string, health: LineageNodeSpec['health']): LineageNodeSpec => ({
    id,
    name: id,
    health,
  });

  it('orders failed → stale → healthy → dormant, stably within a tier', () => {
    const out = prioritizeDamageFirst([
      mk('d1', 'dormant'),
      mk('h1', 'healthy'),
      mk('f1', 'failed'),
      mk('s1', 'stale'),
      mk('h2', 'healthy'),
      mk('f2', 'failed'),
    ]);
    expect(out.map((n) => n.id)).toEqual(['f1', 'f2', 's1', 'h1', 'h2', 'd1']);
  });

  it('shows every node when at or under the cap (no overflow row)', () => {
    const nodes = Array.from({ length: LINEAGE_CAP }, (_, i) => mk(`n${i}`, 'healthy'));
    expect(capColumn(nodes)).toEqual({ visible: nodes, overflow: 0 });
  });

  it('caps an over-full column at cap rows: cap-1 named damage-first + the overflow count', () => {
    const nodes = [
      ...Array.from({ length: 20 }, (_, i) => mk(`dormant${i}`, 'dormant')),
      mk('failed', 'failed'),
      mk('stale', 'stale'),
    ];
    const { visible, overflow } = capColumn(nodes);
    expect(visible).toHaveLength(LINEAGE_CAP - 1);
    // Damage survives the cap — the FALLON ash fleet folds into +N more.
    expect(visible[0]?.id).toBe('failed');
    expect(visible[1]?.id).toBe('stale');
    expect(overflow).toBe(22 - (LINEAGE_CAP - 1));
  });
});

describe('middleTruncate', () => {
  it('returns short names whole', () => {
    expect(middleTruncate('BILLING - CORE')).toBe('BILLING - CORE');
    expect(middleTruncate('123456789012345678901234')).toBe('123456789012345678901234');
  });

  it('middle-truncates >24 chars so both ends survive', () => {
    const out = middleTruncate('AUTO FINANCE REPORTING MODEL - PRODUCTION');
    expect(out).toHaveLength(24);
    expect(out.startsWith('AUTO FINANCE')).toBe(true);
    expect(out.endsWith('PRODUCTION')).toBe(true);
    expect(out).toContain('…');
  });
});

describe('edgePath', () => {
  it('routes a smooth cubic bezier with the control points at mid-x', () => {
    expect(edgePath(0, 10, 100, 50)).toBe('M 0 10 C 50 10, 50 50, 100 50');
  });
});

describe('layoutLineage — placement, +N more node, edge remapping', () => {
  const flow = item({ kind: 'dataflow', id: 'df-1', name: 'Root Flow', lastStatus: 'Failed' });
  const sus = item({ id: 'ds-sus', name: 'Suspect Model', upstreamDataflowIds: ['df-1'] });

  it('places the three columns left / center / right with headers above', () => {
    const g = deriveLineage([flow, sus], blastOf(['ds-sus'], [['df-1', [sus]]]), [
      { id: 'r-1', name: 'Exec Daily', datasetId: 'ds-sus' },
    ], NOW);
    const layout = layoutLineage(g);
    const fNode = layout.nodes.find((n) => n.id === 'df-1')!;
    const dNode = layout.nodes.find((n) => n.id === 'ds-sus')!;
    const rNode = layout.nodes.find((n) => n.id === 'r-1')!;
    expect(fNode.column).toBe('dataflow');
    expect(dNode.column).toBe('dataset');
    expect(rNode.column).toBe('report');
    expect(fNode.x).toBe(layout.columnX[0]);
    expect(dNode.x).toBe(layout.columnX[1]);
    expect(rNode.x).toBe(layout.columnX[2]);
    expect(fNode.x).toBeLessThan(dNode.x);
    expect(dNode.x).toBeLessThan(rNode.x);
    // Nodes carry the middle-truncated label but keep the full name.
    expect(dNode.label).toBe('Suspect Model');
    expect(layout.height).toBeLessThanOrEqual(360);
  });

  it('routes edges between drawn nodes as beziers, damage colors intact', () => {
    const g = deriveLineage([flow, sus], blastOf(['ds-sus'], [['df-1', [sus]]]), [
      { id: 'r-1', name: 'Exec Daily', datasetId: 'ds-sus' },
    ], NOW);
    const layout = layoutLineage(g);
    const red = layout.edges.find((e) => e.from === 'df-1' && e.to === 'ds-sus')!;
    const amber = layout.edges.find((e) => e.from === 'ds-sus' && e.to === 'r-1')!;
    expect(red.health).toBe('failed');
    expect(amber.health).toBe('stale');
    expect(red.path).toMatch(/^M [\d.]+ [\d.]+ C /);
  });

  it('folds a FALLON-scale dormant fleet into a "+N more" ash node and re-routes its edges', () => {
    const old = new Date(NOW - 482 * 24 * 3600_000).toISOString();
    const dormants = Array.from({ length: 20 }, (_, i) =>
      item({ id: `ds-d${i}`, name: `Dusty ${i}`, lastAttemptTime: old, lastSuccessTime: old }),
    );
    const g = deriveLineage([flow, sus, ...dormants], blastOf(['ds-sus'], [['df-1', [sus]]]), [
      { id: 'r-1', name: 'Exec Daily', datasetId: 'ds-sus' },
      // Bound to ds-d15 — far enough down the ash fleet to be capped away.
      { id: 'r-d', name: 'Dusty Report', datasetId: 'ds-d15' },
    ], NOW);
    const layout = layoutLineage(g);
    const datasetNodes = layout.nodes.filter((n) => n.column === 'dataset');
    expect(datasetNodes).toHaveLength(LINEAGE_CAP); // 7 named + the +N more node
    const more = datasetNodes.find((n) => n.id === overflowNodeId('dataset'))!;
    expect(more.label).toBe('+14 more');
    expect(more.overflow).toBe(14);
    expect(more.health).toBe('dormant'); // ash, never a failure read
    // The suspect survives the cap (damage-first) — it is a named node.
    expect(datasetNodes[0]?.id).toBe('ds-sus');
    // The dusty report's edge re-routes from its hidden dataset to +N more.
    expect(
      layout.edges.some((e) => e.from === overflowNodeId('dataset') && e.to === 'r-d' && e.health === 'dormant'),
    ).toBe(true);
  });

  it('dedupes parallel edges into one, keeping the WORST health', () => {
    const old = new Date(NOW - 482 * 24 * 3600_000).toISOString();
    // Two hidden datasets both feed the same report-id space via the overflow
    // node: one healthy-bound, one amber-bound — amber must win the dedupe.
    const hidden = Array.from({ length: 9 }, (_, i) =>
      item({ id: `ds-h${i}`, name: `Hidden ${i}`, lastAttemptTime: old, lastSuccessTime: old }),
    );
    const g = deriveLineage([...hidden], blastOf(), [], NOW);
    // Manufacture two parallel links between the same drawn pair.
    g.links.push({ from: 'ds-h7', to: 'ds-h8', health: 'healthy' });
    g.links.push({ from: 'ds-h7', to: 'ds-h8', health: 'stale' });
    const layout = layoutLineage(g, { cap: 8 });
    const moreId = overflowNodeId('dataset');
    const selfEdges = layout.edges.filter((e) => e.from === moreId && e.to === moreId);
    expect(selfEdges).toHaveLength(1);
    expect(selfEdges[0]?.health).toBe('stale');
  });

  it('returns an empty layout for an empty graph', () => {
    const layout = layoutLineage({ dataflows: [], datasets: [], reports: [], links: [] });
    expect(layout.nodes).toHaveLength(0);
    expect(layout.edges).toHaveLength(0);
  });
});
