/**
 * Design tokens — from docs/design/IOS-CRAFT-SPEC.md ("quiet instrument
 * cluster"). One warm-amber accent; red is NEVER chrome — reserved for broken.
 * Status is always hue + SHAPE GLYPH + label (color-blind safe).
 */
export const color = {
  // OLED-aware layers: true-black bleed behind, near-black working canvas.
  void: '#000000',
  canvas: '#0B0B0D',
  surface1: '#141417',
  surface2: '#1C1C21',
  hairline: 'rgba(255,255,255,0.08)',

  textPrimary: 'rgba(255,255,255,0.92)',
  textSecondary: 'rgba(255,255,255,0.64)',
  textTertiary: 'rgba(255,255,255,0.40)',

  accent: '#E8A33D', // the cabin glow — the app's ONLY chrome accent
  accentDeep: '#B97D2A', // the same light, less of it — shadowed accent metal

  // Semantic status (hue + shape + label, never hue alone)
  ok: '#3FB68B',
  warn: '#E8A33D',
  broken: '#E5484D', // sacred: failures only, never decoration
  neutral: 'rgba(255,255,255,0.40)',
} as const;

export const space = { xs: 4, s: 8, m: 16, l: 24, xl: 32, xxl: 48 } as const;

export const radius = { chip: 8, card: 16, sheet: 24 } as const;

import type { TextStyle } from 'react-native';

export const type: Record<'hero' | 'title' | 'body' | 'caption' | 'micro', TextStyle> = {
  hero: { fontSize: 56, fontWeight: '700', letterSpacing: -1.5, fontVariant: ['tabular-nums'] },
  title: { fontSize: 22, fontWeight: '600', letterSpacing: -0.3 },
  body: { fontSize: 17, fontWeight: '400' },
  caption: { fontSize: 13, fontWeight: '400' },
  micro: { fontSize: 11, fontWeight: '500', letterSpacing: 0.4 },
};

/** Status → shape glyph (color-blind safe; never color alone). */
export const statusGlyph = {
  Completed: '●',
  Failed: '⬣',
  Cancelled: '▲',
  Never: '◌',
  InProgress: '◐',
  Disabled: '◇',
} as const;

export const statusColor = {
  Completed: color.ok,
  Failed: color.broken,
  Cancelled: color.warn,
  Never: color.warn,
  InProgress: color.accent,
  Disabled: color.neutral,
} as const;

export const statusLabel = {
  Completed: 'OK',
  Failed: 'Failed',
  Cancelled: 'Cancelled',
  Never: 'Never run',
  InProgress: 'Running',
  Disabled: 'Live',
} as const;
