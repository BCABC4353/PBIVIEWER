export interface BarInput {
  values: number[];
  labels: string[];
}

export interface BarGeometryOpts {
  width: number;
  height: number;
  padH: number;
  padV: number;
  gap: number;
}

export interface BarRect {
  x: number;
  y: number;
  w: number;
  h: number;
  value: number;
  label: string;
  normalised: number;
}

export interface BarGeometry {
  bars: BarRect[];
  baseY: number;
  maxValue: number;
}

export function computeBarGeometry(
  input: BarInput,
  opts: BarGeometryOpts,
): BarGeometry {
  const { values, labels } = input;
  const { width, height, padH, padV, gap } = opts;

  const n = values.length;
  if (n === 0) {
    return { bars: [], baseY: height - padV, maxValue: 0 };
  }

  const maxValue = Math.max(...values.map(v => Math.max(v, 0)), 1);
  const plotW = width - padH * 2;
  const plotH = height - padV * 2;
  const baseY = height - padV;
  const slotW = plotW / n;
  const barW = Math.max(2, slotW - gap);

  const bars: BarRect[] = values.map((value, i) => {
    const normalised = Math.max(value, 0) / maxValue;
    const barH = Math.max(2, normalised * plotH);
    const x = padH + i * slotW + (slotW - barW) / 2;
    const y = baseY - barH;
    return {
      x,
      y,
      w: barW,
      h: barH,
      value,
      label: labels[i] ?? String(i),
      normalised,
    };
  });

  return { bars, baseY, maxValue };
}
