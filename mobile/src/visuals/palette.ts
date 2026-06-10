/**
 * Series palette for native visuals — doctrine: NO rainbow chart palettes.
 * Categorical series are opacity steps of white; the single amber accent marks
 * the highlighted series (latest bar, largest slice, live point). Red never
 * appears here — it is reserved for broken/negative semantics only.
 */
import { color } from '../design/tokens';

/** The one loud color a visual may use — the highlighted series. */
export const highlight = color.accent;

/** Quiet resting shade for non-highlighted bars / strokes. */
export const seriesRest = 'rgba(255,255,255,0.24)';

/** Primary line stroke — bright enough to read, never pure white. */
export const seriesLine = 'rgba(255,255,255,0.66)';

/** Whisper-level area fill under a line (flat, not a gradient). */
export const areaFill = 'rgba(255,255,255,0.06)';

/**
 * Opacity step for slice/series `index` of `count` — brightest first,
 * stepping down toward quiet. Index 0 is expected to take `highlight` instead.
 */
export function seriesShade(index: number, count: number): string {
  if (count <= 1) return seriesLine;
  const max = 0.6;
  const min = 0.18;
  const t = index / (count - 1);
  const opacity = max - t * (max - min);
  return `rgba(255,255,255,${opacity.toFixed(2)})`;
}

/** Shape glyph cycle for legends — status is always shape + color + label. */
export const legendGlyphs = ['●', '■', '▲', '◆', '✚', '✦', '⬟', '◐'] as const;

export const legendGlyph = (index: number): string =>
  legendGlyphs[index % legendGlyphs.length]!;
