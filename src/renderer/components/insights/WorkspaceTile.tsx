import React from 'react';
import type { InsightsWorkspaceAccess } from '../../../shared/types';
import { luce, ladder, type WorkspaceGroup } from './insights-luce';
import { tabular } from './insights-shared';



export const WorkspaceTile: React.FC<{
  group: WorkspaceGroup;
  access?: InsightsWorkspaceAccess;
  affectedCount: number;
  morphSource: boolean;
  onOpen: (el: HTMLElement) => void;
}> = ({ group, affectedCount, morphSource, onOpen }) => {
  const broken = group.counts.broken > 0;
  const degraded = group.counts.overdue > 0 || affectedCount > 0;
  const edge = broken
    ? luce.broken
    : degraded
      ? luce.warn
      : 'rgba(63,182,139,0.7)';
  return (
    <div className="relative">
      {broken && <span aria-hidden="true" className="luce-tile-underglow" />}
      <button
        className={`luce-tile${broken ? ' luce-tile--broken' : ''}`}
        style={morphSource ? { viewTransitionName: 'sheet-morph' } : undefined}
        data-workspace-tile={group.workspaceId}
        onClick={(e) => onOpen(e.currentTarget)}
        aria-haspopup="dialog"
        aria-label={`Open ${group.workspaceName} details`}
      >
        <span
          aria-hidden="true"
          className="absolute left-0 top-0 bottom-0"
          style={{ width: 3, background: edge }}
        />
        <div className="flex items-center justify-between gap-3 min-w-0">
          <span className="truncate" style={{ fontSize: 15, fontWeight: 600, color: ladder.hi }}>
            {group.workspaceName}
          </span>
        </div>
        {}
        <div className="mt-3 flex items-end justify-between gap-3">
          <span
            style={{ fontSize: 30, lineHeight: 1, fontWeight: 600, color: broken ? luce.broken : ladder.hi, ...tabular }}
          >
            {Math.round(((group.items.length - group.counts.broken) / Math.max(1, group.items.length)) * 100)}
            <span style={{ fontSize: 14, color: ladder.low }}>%</span>
          </span>
          {(group.counts.broken > 0 || affectedCount > 0) && (
            <span className="text-right" style={{ fontSize: 12, color: luce.broken, ...tabular }}>
              {[
                group.counts.broken > 0 ? `${group.counts.broken} broken` : null,
                affectedCount > 0 ? `${affectedCount} stale rpt${affectedCount === 1 ? '' : 's'}` : null,
              ].filter(Boolean).join(' · ')}
            </span>
          )}
        </div>
      </button>
    </div>
  );
};
