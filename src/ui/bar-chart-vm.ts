import { rollingStats, anomalyFlags, isOk, isInsufficient } from '../enhance';
import type { RollingPoint, AnomalyFlag } from '../enhance';
import type { SeriesPoint } from '../core/dax';

export interface ControlBandResult {
  band: RollingPoint[];
  flags: AnomalyFlag[];
}

export type ControlBandOutcome =
  | { kind: 'ok'; data: ControlBandResult }
  | { kind: 'insufficient'; reason: string };

export function computeControlBands(
  points: SeriesPoint[],
  window: number,
  sigmaMultiplier: number,
): ControlBandOutcome {
  if (points.length === 0) {
    return { kind: 'insufficient', reason: 'empty series' };
  }
  const values = points.map((p) => p.value);
  const rolling = rollingStats(values, window, sigmaMultiplier);
  if (isInsufficient(rolling)) {
    return { kind: 'insufficient', reason: rolling.reason };
  }
  const band = rolling.value.points;
  const flags = anomalyFlags(values, band);
  if (isInsufficient(flags)) {
    return { kind: 'insufficient', reason: flags.reason };
  }
  return { kind: 'ok', data: { band, flags: flags.value.flags } };
}

export interface BandSegment {
  upperFrac: number;
  lowerFrac: number;
  flagged: boolean;
}

export function bandSegments(
  band: RollingPoint[],
  flags: AnomalyFlag[],
  scale: number,
): BandSegment[] {
  const denom = scale > 0 ? scale : 1;
  const flaggedIndices = new Set(flags.map((f) => f.index));
  return band.map((p, i) => {
    const upper = Math.min(1, Math.max(0, p.upper / denom));
    const lower = Math.min(1, Math.max(0, p.lower / denom));
    return {
      upperFrac: Math.max(upper, lower),
      lowerFrac: Math.min(upper, lower),
      flagged: flaggedIndices.has(i),
    };
  });
}

export function formatDeltaGlyph(delta: number): '▲' | '▼' | '—' {
  if (delta > 0) return '▲';
  if (delta < 0) return '▼';
  return '—';
}

export function isAboveFlag(flag: AnomalyFlag): boolean {
  return flag.side === 'above';
}

export function isBelowFlag(flag: AnomalyFlag): boolean {
  return flag.side === 'below';
}

export function flagsAtIndex(flags: AnomalyFlag[], index: number): AnomalyFlag[] {
  return flags.filter((f) => f.index === index);
}

export { isOk, isInsufficient };
