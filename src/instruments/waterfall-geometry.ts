import type { WaterfallStep } from '../enhance/bridge';

export interface WaterfallGeometryOpts {
  width: number;
  height: number;
  padH: number;
  padV: number;
  gap: number;
}

export type BarKind = 'increment' | 'decrement' | 'total';

export interface WaterfallBar {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: BarKind;
  label: string;
  value: number;
  floatY: number;
}

export interface ConnectorLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface WaterfallGeometry {
  bars: WaterfallBar[];
  connectors: ConnectorLine[];
  baseY: number;
  zeroY: number;
  minValue: number;
  maxValue: number;
}

function classifyKind(step: WaterfallStep): BarKind {
  if (step.kind === 'new') return 'increment';
  if (step.kind === 'dropped') return 'decrement';
  return step.delta >= 0 ? 'increment' : 'decrement';
}

export function computeWaterfallGeometry(
  steps: WaterfallStep[],
  opts: WaterfallGeometryOpts,
  totals?: Set<string>,
): WaterfallGeometry {
  const { width, height, padH, padV, gap } = opts;
  const plotW = width - padH * 2;
  const plotH = height - padV * 2;

  if (steps.length === 0) {
    const baseY = height - padV;
    return { bars: [], connectors: [], baseY, zeroY: baseY, minValue: 0, maxValue: 0 };
  }

  const n = steps.length;
  const slotW = plotW / n;
  const barW = Math.max(4, slotW - gap);

  const runningValues: number[] = [];
  let running = 0;
  for (const step of steps) {
    running += step.delta;
    runningValues.push(running);
  }

  const starts: number[] = [];
  let acc = 0;
  for (const step of steps) {
    starts.push(acc);
    acc += step.delta;
  }

  const allValues = [...starts, ...runningValues, 0];
  const minValue = Math.min(...allValues);
  const maxValue = Math.max(...allValues);
  const range = maxValue - minValue || 1;
  const baseY = height - padV;

  const toY = (v: number) => baseY - ((v - minValue) / range) * plotH;
  const zeroY = toY(0);

  const bars: WaterfallBar[] = steps.map((step, i) => {
    const x = padH + i * slotW + (slotW - barW) / 2;
    const isTotalBar = totals?.has(step.key) ?? false;
    const kind: BarKind = isTotalBar ? 'total' : classifyKind(step);

    const startVal = starts[i]!;
    const endVal = startVal + step.delta;
    const topVal = Math.max(startVal, endVal);
    const botVal = Math.min(startVal, endVal);

    const y = toY(topVal);
    const h = Math.max(2, Math.abs(toY(botVal) - toY(topVal)));

    return {
      x,
      y,
      w: barW,
      h,
      kind,
      label: step.key,
      value: step.delta,
      floatY: toY(startVal),
    };
  });

  const connectors: ConnectorLine[] = [];
  for (let i = 0; i < bars.length - 1; i++) {
    const cur = bars[i]!;
    const nxt = bars[i + 1]!;
    const rightEdgeX = cur.x + cur.w;
    const nextLeftX = nxt.x;
    const connectY = cur.y + cur.h < cur.floatY ? cur.y + cur.h : cur.y;
    const endTopVal = starts[i]! + steps[i]!.delta;
    const connY = toY(endTopVal);
    connectors.push({
      x1: rightEdgeX,
      y1: connY,
      x2: nextLeftX,
      y2: connY,
    });
  }

  return { bars, connectors, baseY, zeroY, minValue, maxValue };
}
