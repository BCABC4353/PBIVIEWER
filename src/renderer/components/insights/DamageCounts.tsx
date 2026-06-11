import React from 'react';
import { luce, ladder, type WorkspaceGroup } from './insights-luce';
import { tabular } from './insights-shared';

/** Damage summary chips (§A/§B): `N broken` red · `N overdue` amber · `N OK`
 *  low. Health is silent — no green, no "all good" substitute. */
export const DamageCounts: React.FC<{ counts: WorkspaceGroup['counts']; size?: number; gap?: number }> = ({
  counts,
  size = 11,
  gap = 10,
}) => {
  const quiet = counts.ok + counts.live;
  return (
    <span className="flex items-center shrink-0 whitespace-nowrap" style={{ fontSize: size, gap, ...tabular }}>
      {counts.broken > 0 && <span style={{ color: luce.broken }}>{counts.broken} broken</span>}
      {counts.overdue > 0 && <span style={{ color: luce.warn }}>{counts.overdue} overdue</span>}
      <span style={{ color: ladder.low }}>{quiet} OK</span>
    </span>
  );
};
