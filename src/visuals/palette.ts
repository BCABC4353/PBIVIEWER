import { color } from '../design/tokens';

export const highlight = color.accent;

export const seriesRest = 'rgba(255,255,255,0.24)';

export const seriesLine = 'rgba(255,255,255,0.66)';

export const areaFill = 'rgba(255,255,255,0.06)';

export function seriesShade(index: number, count: number): string {
  if (count <= 1) return seriesLine;
  const max = 0.6;
  const min = 0.18;
  const t = index / (count - 1);
  const opacity = max - t * (max - min);
  return `rgba(255,255,255,${opacity.toFixed(2)})`;
}

export const legendGlyphs = ['●', '■', '▲', '◆', '✚', '✦', '⬟', '◐'] as const;

export const legendGlyph = (index: number): string =>
  legendGlyphs[index % legendGlyphs.length]!;
