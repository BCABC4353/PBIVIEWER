export interface DonutSlice {
  value: number;
  label: string;
}

export interface DonutGeometryOpts {
  size: number;
  strokeWidth: number;
  gapAngle: number;
}

export interface ArcSegment {
  startAngle: number;
  endAngle: number;
  value: number;
  label: string;
  share: number;
  index: number;
}

export interface DonutGeometry {
  arcs: ArcSegment[];
  cx: number;
  cy: number;
  radius: number;
  total: number;
}

export function computeDonutGeometry(
  slices: DonutSlice[],
  opts: DonutGeometryOpts,
): DonutGeometry {
  const { size, strokeWidth, gapAngle } = opts;
  const cx = size / 2;
  const cy = size / 2;
  const radius = (size - strokeWidth) / 2;

  const positive = slices.filter(s => s.value > 0);
  const total = positive.reduce((s, sl) => s + sl.value, 0);

  if (total <= 0) {
    return { arcs: [], cx, cy, radius, total: 0 };
  }

  const arcs: ArcSegment[] = [];
  let angle = -Math.PI / 2;

  for (let i = 0; i < positive.length; i++) {
    const sl = positive[i]!;
    const share = sl.value / total;
    const sweep = share * Math.PI * 2;
    const startAngle = angle + gapAngle / 2;
    const endAngle = angle + sweep - gapAngle / 2;
    if (endAngle > startAngle) {
      arcs.push({ startAngle, endAngle, value: sl.value, label: sl.label, share, index: i });
    }
    angle += sweep;
  }

  return { arcs, cx, cy, radius, total };
}

export function arcPathString(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): string {
  const sx = cx + r * Math.cos(startAngle);
  const sy = cy + r * Math.sin(startAngle);
  const ex = cx + r * Math.cos(endAngle);
  const ey = cy + r * Math.sin(endAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`;
}
