import React from 'react';
import type { InsightsRefreshable } from '../../../shared/types';
import {
  luce,
  ladder,
  statusLabel,
  downForLabel,
  dormantDownLabel,
  isDormant,
} from './insights-luce';
import { formatTime, relativeAge, triggerLabel, tabular } from './insights-shared';
import { KindDot } from './KindDot';
import { RunDotStrip } from './RunDotStrip';

function statusMetaLine(
  item: InsightsRefreshable,
  stale: boolean,
): { text: string; color: string } | null {
  const down = downForLabel(item);
  if (item.lastStatus === 'Failed' || item.lastStatus === 'Cancelled') {
    return {
      text: `${statusLabel[item.lastStatus].toUpperCase()}${down ? ` · ${down}` : ''}`,
      color: luce.broken,
    };
  }
  if (stale) return { text: 'FAILED · upstream', color: luce.broken };
  if (item.scheduleOverdue) return { text: `OVERDUE${down ? ` · ${down}` : ''}`, color: luce.warn };
  if (isDormant(item)) {
    const d = dormantDownLabel(item);
    return { text: `DORMANT${d ? ` · ${d}` : ''}`, color: luce.dormant };
  }
  if (item.lastStatus === 'Never') return { text: 'NEVER RUN', color: luce.warn };
  if (item.lastStatus === 'InProgress') return { text: 'RUNNING', color: luce.accent };
  if (item.lastStatus === 'Disabled') return { text: 'LIVE', color: luce.textTertiary };
  return null;
}

export const RefreshableRow: React.FC<{ item: InsightsRefreshable; stale?: boolean }> = ({
  item,
  stale = false,
}) => {
  const anchor = item.lastAttemptTime || item.lastSuccessTime;
  const rel = relativeAge(anchor);
  const status = statusMetaLine(item, stale);
  return (
  <>
    <div
      role="row"
      className="grid items-center transition-colors hover:bg-white/[0.03]"
      style={{
        gridTemplateColumns: '16px minmax(0, 2fr) 132px 240px',
        columnGap: 16,
        padding: '12px 0',
      }}
    >
      {}
      <KindDot kind={item.kind} />

      {}
      <div className="min-w-0">
        <div className="truncate text-sm font-medium" style={{ color: luce.textPrimary }}>
          {item.name}
        </div>
        {item.errorCode && (
          <div data-selectable className="mt-1 text-[12px] truncate" style={{ color: luce.textTertiary }}>
            {item.errorCode}
          </div>
        )}
      </div>

      {}
      <div style={{ width: 132 }}>
        <RunDotStrip runs={item.recentRuns} kind={item.kind} />
      </div>

      {}
      <div className="text-right min-w-0">
        {status && (
          <div
            className="overflow-hidden text-ellipsis whitespace-nowrap font-semibold"
            style={{ fontSize: 11, color: status.color, ...tabular }}
          >
            {status.text}
          </div>
        )}
        <div
          className="overflow-hidden text-ellipsis whitespace-nowrap"
          style={{ fontSize: 11, color: ladder.low }}
          title={formatTime(anchor)}
        >
          {[rel || '—', item.kind === 'dataset' ? triggerLabel(item.lastRefreshType) : null].filter(Boolean).join(' · ')}
        </div>
      </div>
    </div>
        {item.recentRuns?.some((r) => !r.ok && r.errorDetail) && (
          <div
            data-selectable
            className="pb-3 text-[12px]"
            style={{ color: luce.textTertiary, paddingLeft: 32, paddingRight: 12 }}
          >
            {(() => {
              let det = [...(item.recentRuns ?? [])].reverse().find((r) => !r.ok && r.errorDetail)?.errorDetail ?? '';
              if (det.startsWith('{')) {
                const m = /"code"\s*:\s*"([^"]+)"/.exec(det);
                det = m?.[1] ?? '';
              }
              det = det.replace(/<\/?(pii|ccon)>/g, '');
              const first = det.split(/\.\.|\. /)[0] ?? det;
              return first;
            })()}
          </div>
        )}
  </>
  );
};
