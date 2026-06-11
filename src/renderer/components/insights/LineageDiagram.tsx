import React, { useMemo } from 'react';
import type { WorkspaceGroup } from './insights-luce';
import {
  deriveLineage,
  layoutLineage,
  lineageColor,
  type LineageReportInput,
} from './lineage-diagram';
import type { BlastRadius } from '../../../shared/blast-radius';

/**
 * Lineage diagram (owner v3 #3) — the sheet's PRIMARY visual: the workspace's
 * blast radius drawn as a process diagram. Three columns (DATAFLOWS →
 * DATASETS → REPORTS), rounded-rect nodes, smooth bezier edges. Green is the
 * happy path (owner-authorized here, and here only), red the fails and the
 * edges leaving them, amber the stale/suspect path into reports, ash the
 * dormant fleet. All placement logic lives in lineage-diagram.ts (pure,
 * tested); this component only paints the result.
 */
export const LineageDiagram: React.FC<{
  group: WorkspaceGroup;
  blast: BlastRadius;
  reports: LineageReportInput[];
}> = ({ group, blast, reports }) => {
  const layout = useMemo(
    () => layoutLineage(deriveLineage(group.items, blast, reports)),
    [group, blast, reports],
  );
  if (layout.nodes.length === 0) return null;
  const damage = (h: string): boolean => h === 'failed' || h === 'stale';
  return (
    <svg
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      width="100%"
      role="img"
      aria-label={`${group.workspaceName} lineage — dataflows to datasets to reports`}
      data-testid="lineage-diagram"
      // Natural height — every node at full size; the SHEET scrolls, the
      // diagram never compresses the owner's data (owner v4).
      style={{ display: 'block', height: layout.height }}
    >
      {/* Column headers in the engraved legend style. */}
      {(['DATAFLOWS', 'DATASETS', 'REPORTS'] as const).map((label, i) => (
        <text key={label} x={layout.columnX[i]! + 2} y={12} className="luce-lineage-header">
          {label}
        </text>
      ))}
      {layout.edges.map((e) => (
        <g
          key={`${e.from}->${e.to}`}
          data-testid="lineage-edge"
          data-from={e.from}
          data-to={e.to}
          data-health={e.health}
        >
          {/* Damage edges carry a soft under-glow. */}
          {damage(e.health) && (
            <path d={e.path} fill="none" stroke={lineageColor[e.health]} strokeWidth={6} strokeOpacity={0.16} />
          )}
          <path
            d={e.path}
            fill="none"
            stroke={lineageColor[e.health]}
            strokeWidth={damage(e.health) ? 2 : 1.5}
            strokeOpacity={e.health === 'dormant' ? 0.55 : 0.9}
          />
        </g>
      ))}
      {layout.nodes.map((n) => (
        <g
          key={n.id}
          role="img"
          aria-label={n.name}
          data-testid="lineage-node"
          data-node-id={n.id}
          data-column={n.column}
          data-health={n.health}
        >
          <title>{n.name}</title>
          <rect
            x={n.x}
            y={n.y}
            width={n.width}
            height={n.height}
            rx={8}
            fill="#141417"
            stroke={lineageColor[n.health]}
            strokeWidth={2}
            strokeOpacity={n.health === 'dormant' ? 0.6 : 1}
          />
          <text
            x={n.x + n.width / 2}
            y={n.y + n.height / 2 + 4}
            textAnchor="middle"
            fill={lineageColor[n.health]}
            opacity={n.health === 'dormant' ? 0.85 : 1}
            style={{ fontSize: 11, fontWeight: 500 }}
          >
            {n.label}
          </text>
        </g>
      ))}
    </svg>
  );
};
