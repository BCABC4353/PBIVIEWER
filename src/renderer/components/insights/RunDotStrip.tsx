import React from 'react';
import type { InsightsRefreshable } from '../../../shared/types';
import { luce, ladder, dotStripCells, failureRateCaption } from './insights-luce';
import { formatTime, tabular } from './insights-shared';

/** Tooltip for one dot: failed dataset dots explain themselves (Matt #5). */
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

/**
 * 12 dots, oldest → newest, filled from the LEFT. One pulse grammar everywhere
 * (DESIGN-CONTRACT §A): fail = red, ok = white-alpha .25, unused slots are
 * unlit lamps. The caption lives UNDER the dots, 10px/faint (§C).
 */
export const RunDotStrip: React.FC<{
  runs?: InsightsRefreshable['recentRuns'];
  kind: InsightsRefreshable['kind'];
  /** Decorative copy on a tile face: no tooltips, no testid — the sheet-row
   *  strips stay the single interactive source of truth (Matt #5). */
  quiet?: boolean;
  /** Dot diameter: 7px in the sheet/hero, 6px on the n=20 tiles (§A/§B). */
  size?: number;
  /** Force the failure-rate caption even when quiet (the hero asset strips
   *  stay non-interactive but must still show "5 of 8 runs failed" — Matt). */
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
