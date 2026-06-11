import React from 'react';
import type { InsightsRefreshable } from '../../../shared/types';
import { luce, ladder, dotStripCells, failureRateCaption } from './insights-luce';
import { formatTime, tabular } from './insights-shared';

function dotTitle(
  cell: ReturnType<typeof dotStripCells>[number],
  kind: InsightsRefreshable['kind'],
): string | undefined {
  if (cell.state === 'none') return undefined;
  const time = formatTime(cell.endTime);
  if (cell.state === 'ok') return `OK · ${time}`;
  if (kind === 'dataflow') {
    return `Failed · ${time} (no detail provided by Power BI for dataflows)`;
  }
  if (cell.errorCode) return `Failed · ${time} · ${cell.errorCode}`;
  return `Failed · ${time}`;
}

export const RunDotStrip: React.FC<{
  runs?: InsightsRefreshable['recentRuns'];
  kind: InsightsRefreshable['kind'];
  quiet?: boolean;
  size?: number;
  caption?: boolean;
}> = ({ runs, kind, quiet = false, size = 7, caption = false }) => {
  const cells = dotStripCells(runs);
  const label = failureRateCaption(runs);
  return (
    <div
      className="flex flex-col items-start gap-1"
      {...(quiet ? {} : { 'data-testid': 'run-dot-strip' })}
    >
      <div className="flex items-center" style={{ gap: 4 }} aria-hidden="true">
        {cells.map((c, i) => (
          <span
            key={i}
            title={quiet ? undefined : dotTitle(c, kind)}
            className="inline-block rounded-full"
            style={{
              width: size,
              height: size,
              ...(c.state === 'ok'
                ? { background: 'rgba(255,255,255,0.25)' }
                : c.state === 'fail'
                  ? { background: luce.broken, transform: 'scale(1.25)' }
                  : { background: 'rgba(255,255,255,0.07)' }),
            }}
          />
        ))}
      </div>
      {quiet && !caption ? null : label ? (
        <span style={{ fontSize: 10, color: ladder.faint, ...tabular }}>{label}</span>
      ) : (
        <span style={{ fontSize: 10, color: ladder.faint }}>
          last {Math.min(runs?.length ?? 0, 12) || '—'} runs
        </span>
      )}
    </div>
  );
};
