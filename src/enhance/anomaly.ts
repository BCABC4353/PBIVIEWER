import { ok, insufficient, type Result } from './types';
import type { RollingPoint } from './rolling';

export type AnomalySide = 'above' | 'below';

export interface AnomalyFlag {
  index: number;
  value: number;
  side: AnomalySide;
  magnitude: number;
}

export interface AnomalyResult {
  flags: AnomalyFlag[];
}

export function anomalyFlags(
  series: number[],
  band: RollingPoint[],
): Result<AnomalyResult> {
  if (series.length === 0) {
    return insufficient('series must be non-empty');
  }

  if (band.length === 0) {
    return insufficient('band must be non-empty');
  }

  if (series.length !== band.length) {
    return insufficient('series and band must have equal length');
  }

  for (const v of series) {
    if (!Number.isFinite(v)) return insufficient('series contains non-finite values');
  }

  for (const p of band) {
    if (!Number.isFinite(p.upper) || !Number.isFinite(p.lower)) {
      return insufficient('band contains non-finite upper/lower values');
    }
  }

  const flags: AnomalyFlag[] = [];

  for (let i = 0; i < series.length; i++) {
    const value = series[i]!;
    const { upper, lower } = band[i]!;

    if (value > upper) {
      flags.push({ index: i, value, side: 'above', magnitude: value - upper });
    } else if (value < lower) {
      flags.push({ index: i, value, side: 'below', magnitude: lower - value });
    }
  }

  return ok({ flags });
}
