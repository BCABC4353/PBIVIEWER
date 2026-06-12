export const color = {
  void: '#000000',
  canvas: '#0B0B0D',
  surface1: '#141417',
  surface2: '#1C1C21',
  hairline: 'rgba(255,255,255,0.08)',

  textPrimary: 'rgba(255,255,255,0.92)',
  textSecondary: 'rgba(255,255,255,0.64)',
  textTertiary: 'rgba(255,255,255,0.40)',

  accent: '#E8A33D',
  accentDeep: '#B97D2A',

  ok: '#3FB68B',
  warn: '#E8A33D',
  broken: '#E5484D',
  neutral: 'rgba(255,255,255,0.40)',

  scrim: 'rgba(0,0,0,0.55)',
  shimmerHighlight: 'rgba(255,255,255,0.045)',
} as const;

export const brand = {
  orange: '#FF7900',
  blue: '#0F4D97',
  blueBacklit: '#5D9FEF',
} as const;

export const direction = {
  up: brand.orange,
  down: brand.blueBacklit,
} as const;

export const waterfall = {
  increment: brand.orange,
  decrement: brand.blueBacklit,
  total: '#A9ACB6',
  connector: 'rgba(255,255,255,0.10)',
} as const;

export const strip = {
  track: 'rgba(255,255,255,0.14)',
  minor: 'rgba(255,255,255,0.16)',
  minute: 'rgba(255,255,255,0.34)',
  major: 'rgba(255,255,255,0.60)',
  fill: 'rgba(201,203,209,0.75)',
  label: '#80848F',
  labelOverdue: '#FFB02E',
  mark: 'rgba(255,255,255,0.85)',
  overdueBand: 'rgba(255,176,46,0.30)',
  amberOverdue: '#FFB02E',
} as const;

export const categorical = {
  AZURE: '#4F9DDE',
  CYAN: '#3FC0C9',
  MINT: '#74B79E',
  OLIVE: '#B7B24E',
  SLATE: '#8294CF',
  VIOLET: '#9A8BEC',
  PLUM: '#C77BD8',
  MAGENTA: '#E0789F',
} as const;

export const categoricalOrder = [
  'AZURE',
  'CYAN',
  'MINT',
  'OLIVE',
  'SLATE',
  'VIOLET',
  'PLUM',
  'MAGENTA',
] as const;

export type CategoricalName = (typeof categoricalOrder)[number];

export function categoricalHue(index: number): string {
  const order = categoricalOrder;
  const i = ((Math.trunc(index) % order.length) + order.length) % order.length;
  return categorical[order[i]!];
}

export function whiteAlpha(opacity: number): string {
  const clamped = Math.max(0, Math.min(1, opacity));
  return `rgba(255,255,255,${clamped})`;
}

export function blackAlpha(opacity: number): string {
  const clamped = Math.max(0, Math.min(1, opacity));
  return `rgba(0,0,0,${clamped})`;
}

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
