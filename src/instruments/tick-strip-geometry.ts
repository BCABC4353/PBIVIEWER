export type StripSize = 'large' | 'medium' | 'small';

export interface StripSizeSpec {
  pad: number;
  base: number;
  minor: number;
  minute: number;
  major: number;
  caretW: number;
  caretH: number;
  fillW: number;
  labels: boolean;
  showValue: boolean;
  valueSize: number;
}

export const STRIP_SIZES: Record<StripSize, StripSizeSpec> = {
  large:  { pad: 22, base: 62, minor: 6, minute: 13, major: 20, caretW: 11, caretH: 9,   fillW: 2,   labels: true,  showValue: true,  valueSize: 16 },
  medium: { pad: 4,  base: 24, minor: 0, minute: 5,  major: 10, caretW: 8,  caretH: 6.5, fillW: 1.5, labels: false, showValue: false, valueSize: 0  },
  small:  { pad: 2,  base: 12, minor: 0, minute: 3,  major: 6,  caretW: 6,  caretH: 5,   fillW: 1,   labels: false, showValue: false, valueSize: 0  },
};

export interface MinorTick {
  x: number;
}

export interface MajorTick {
  x: number;
  isMajor: boolean;
  label?: string;
}

export interface OverdueTick {
  x: number;
}

export interface StripGeometry {
  spec: StripSizeSpec;
  x0: number;
  x1: number;
  span: number;
  mainW: number;
  xMark: number;
  perMin: number;
  xTarget: number;
  xFillA: number;
  xFillB: number;
  minorTicks: MinorTick[];
  ticks: MajorTick[];
  overdueTicks: OverdueTick[];
  isOverdue: boolean;
  overW: number;
}

export function computeStripGeometry(opts: {
  width: number;
  size: StripSize;
  cycle?: number;
  value: number;
  overdue?: number;
  overflowSpan?: number;
}): StripGeometry {
  const spec = STRIP_SIZES[opts.size];
  const cycle = opts.cycle ?? 15;
  const overdue = opts.overdue ?? 0;
  const overflowSpan = opts.overflowSpan ?? 60;
  const w = opts.width;
  const value = opts.value;

  const x0 = spec.pad;
  const x1 = w - spec.pad;
  const span = x1 - x0;
  const mainW = overdue > 0 ? span * 0.74 : span;
  const xMark = x0 + mainW;
  const perMin = mainW / cycle;

  const minorTicks: MinorTick[] = [];
  if (spec.minor > 0) {
    for (let q = 0; q <= cycle * 4; q++) {
      if (q % 4 === 0) continue;
      minorTicks.push({ x: x0 + (perMin * q) / 4 });
    }
  }

  const ticks: MajorTick[] = [];
  for (let m = 0; m <= cycle; m++) {
    const x = x0 + perMin * m;
    const isMajor = m % 5 === 0;
    ticks.push({
      x,
      isMajor,
      label: spec.labels && isMajor ? String(m) : undefined,
    });
  }

  const overdueTicks: OverdueTick[] = [];
  let xTarget: number;
  if (overdue > 0) {
    const overW = x1 - xMark;
    for (let m = 5; m < overflowSpan; m += 5) {
      overdueTicks.push({ x: xMark + (overW * m) / overflowSpan });
    }
    xTarget = xMark + (x1 - xMark) * Math.min(overdue / overflowSpan, 0.97);
  } else {
    xTarget = x0 + perMin * value;
  }

  const overW = x1 - xMark;

  return {
    spec,
    x0,
    x1,
    span,
    mainW,
    xMark,
    perMin,
    xTarget,
    xFillA: xTarget,
    xFillB: overdue > 0 ? xTarget : xMark,
    minorTicks,
    ticks,
    overdueTicks,
    isOverdue: overdue > 0,
    overW,
  };
}
