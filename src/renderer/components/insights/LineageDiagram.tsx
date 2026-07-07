import React, { useMemo } from 'react';
import type { WorkspaceGroup } from './insights-luce';
import {
  deriveLineage,
  layoutLineage,
  lineageColor,
  type LineageReportInput,
} from './lineage-diagram';
import type { BlastRadius } from '../../../shared/blast-radius';

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
      preserveAspectRatio="xMidYMin meet"
      role="img"
      aria-label={`${group.workspaceName} lineage — dataflows to datasets to reports`}
      data-testid="lineage-diagram"
      style={{ display: 'block' }}
    >
      {}
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
          {}
          {damage(e.health) && (
            <path
              d={e.path}
              fill="none"
              stroke={lineageColor[e.health]}
              strokeWidth={6}
              strokeOpacity={0.16}
              vectorEffect="non-scaling-stroke"
            />
          )}
          <path
            d={e.path}
            fill="none"
            stroke={lineageColor[e.health]}
            strokeWidth={damage(e.health) ? 2 : 1.5}
            strokeOpacity={e.health === 'dormant' ? 0.55 : 0.9}
            vectorEffect="non-scaling-stroke"
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
            vectorEffect="non-scaling-stroke"
          />
          <foreignObject x={n.x} y={n.y} width={n.width} height={n.height}>
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                padding: '2px 8px',
                boxSizing: 'border-box',
                fontSize: 11,
                fontWeight: 500,
                lineHeight: 1.15,
                color: lineageColor[n.health],
                opacity: n.health === 'dormant' ? 0.85 : 1,
                overflowWrap: 'anywhere',
              }}
            >
              {n.label}
            </div>
          </foreignObject>
        </g>
      ))}
    </svg>
  );
};
