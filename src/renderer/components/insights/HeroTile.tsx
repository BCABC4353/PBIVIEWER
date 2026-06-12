import React from 'react';
import type { InsightsWorkspaceAccess } from '../../../shared/types';
import {
  luce,
  ladder,
  statusLabel,
  downForLabel,
  isDown,
  workspaceSuspectCount,
  workspaceAffectedReportCount,
  oldestSuccessIso,
  type WorkspaceGroup,
} from './insights-luce';
import type { BlastRadius } from '../../../shared/blast-radius';
import { formatTime, relativeAge, tabular } from './insights-shared';
import { DamageCounts } from './DamageCounts';
import { HeroLabel } from './HeroLabel';
import { RunDotStrip } from './RunDotStrip';

export const HeroTile: React.FC<{
  group: WorkspaceGroup;
  access?: InsightsWorkspaceAccess;
  blast: BlastRadius;
  onOpen: (el: HTMLElement) => void;
}> = ({ group, access, blast, onOpen }) => {
  const broken = group.counts.broken > 0;
  const suspectCount = workspaceSuspectCount(group, blast.suspectDatasetIds);
  const edge = broken
    ? luce.broken
    : group.counts.overdue > 0 || suspectCount > 0
      ? luce.warn
      : 'rgba(63,182,139,0.7)';
  const affected = workspaceAffectedReportCount(group, blast);
  const assets = group.items;
  const shownAssets = assets.slice(0, 5);
  const members = !access || access.users === null ? null : access.users;
  const oldest = oldestSuccessIso(group.items);
  const schedule = group.items.find((i) => i.scheduleSummary)?.scheduleSummary;
  const nowrap: React.CSSProperties = {
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };
  return (
    <button
      className="luce-tile luce-hero-tile"
      data-testid="luce-hero-tile"
      data-workspace-tile={group.workspaceId}
      onClick={(e) => onOpen(e.currentTarget)}
      aria-haspopup="dialog"
      aria-label={`Open ${group.workspaceName} details`}
    >
      <span
        aria-hidden="true"
        className="absolute left-0 top-0 bottom-0"
        style={{ width: 4, borderRadius: '4px 0 0 4px', background: edge }}
      />
      {}
      <div className="flex items-start justify-between gap-4 min-w-0">
        <span
          className="truncate"
          style={{ fontSize: 28, lineHeight: 1.2, fontWeight: 600, color: ladder.hi, letterSpacing: '-0.01em' }}
        >
          {group.workspaceName}
        </span>
        <DamageCounts counts={group.counts} size={13} gap={16} />
      </div>
      {}
      {suspectCount > 0 && (
        <div className="mt-2" style={{ fontSize: 14, fontWeight: 500, color: luce.warn }}>
          {affected} report{affected === 1 ? '' : 's'} may be reading stale data — open to trace
        </div>
      )}
      {}
      <div className="mt-6 grid grid-cols-3" style={{ gap: 32 }}>
        <div className="min-w-0">
          <HeroLabel>Assets</HeroLabel>
          {shownAssets.map((item) => (
            <div key={`${item.kind}-${item.id}`} className="mt-2 min-w-0">
              <div className="truncate" style={{ fontSize: 13, color: ladder.mid }}>
                {item.name}
              </div>
              {isDown(item) && (
                <div
                  className="mt-0.5 font-semibold whitespace-nowrap"
                  style={{ fontSize: 11, color: luce.broken, ...tabular }}
                >
                  {statusLabel[item.lastStatus].toUpperCase()}
                  {downForLabel(item) ? ` · ${downForLabel(item)}` : ''}
                </div>
              )}
              <div className="mt-1">
                <RunDotStrip quiet caption runs={item.recentRuns} kind={item.kind} />
              </div>
            </div>
          ))}
          {assets.length > 5 && (
            <div className="mt-2" style={{ fontSize: 11, color: ladder.low }}>
              +{assets.length - 5} more
            </div>
          )}
        </div>
        <div className="min-w-0">
          <HeroLabel>Members</HeroLabel>
          {members === null ? (
            <div className="mt-2" style={{ fontSize: 12, color: ladder.low, ...nowrap }}>
              not visible to your account
            </div>
          ) : (
            <>
              <div className="mt-2" style={{ fontSize: 20, fontWeight: 600, color: ladder.hi, ...tabular }}>
                {members.length}
              </div>
              {members.slice(0, 5).map((u, i) => (
                <div key={`${u.email || u.name}-${i}`} className="mt-1 truncate" style={{ fontSize: 12, color: ladder.mid }}>
                  {u.name}
                </div>
              ))}
            </>
          )}
        </div>
        <div className="min-w-0">
          <HeroLabel>Freshness</HeroLabel>
          <div className="mt-2" style={{ fontSize: 12, ...nowrap }}>
            <span style={{ color: ladder.low }}>Oldest success: </span>
            <span style={{ color: ladder.mid }}>{oldest ? relativeAge(oldest) || 'just now' : '—'}</span>
          </div>
          {oldest && (
            <div title={formatTime(oldest)} style={{ display: 'none' }}>
              {}
            </div>
          )}
          <div className="mt-2" style={{ fontSize: 12, ...nowrap }}>
            <span style={{ color: ladder.low }}>Next scheduled: </span>
            <span style={{ color: ladder.mid }}>{schedule ?? '—'}</span>
          </div>
        </div>
      </div>
    </button>
  );
};
