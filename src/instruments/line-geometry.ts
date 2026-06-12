import type { RollingPoint } from '../enhance/rolling';
import { isOk, rollingStats } from '../enhance/index';

export interface LinePoint {
  value: number;
  label: string;
}

export interface LineGeometryOpts {
  width: number;
  height: number;
  padH: number;
  padV: number;
}

export interface PlotPoint {
  x: number;
  y: number;
  value: number;
  label: string;
}

export interface BandPoint {
  x: number;
  upperY: number;
  lowerY: number;
}

export interface LineGeometry {
  points: PlotPoint[];
  band: BandPoint[] | null;
  linePath: string;
  areaPath: string;
  bandUpperPath: string;
  bandLowerPath: string;
  bandFillPath: string;
  minValue: number;
  maxValue: number;
  plotWidth: number;
  plotHeight: number;
}

function toY(value: number, minV: number, range: number, plotH: number, padV: number): number {
  return padV + (1 - (value - minV) / range) * plotH;
}

export function computeLineGeometry(
  input: LinePoint[],
  opts: LineGeometryOpts,
  rollingWindow: number = 5,
  sigmaMultiplier: number = 1.5,
): LineGeometry {
  const { width, height, padH, padV } = opts;
  const n = input.length;
  const plotWidth = width - padH * 2;
  const plotHeight = height - padV * 2;

  const empty: LineGeometry = {
    points: [],
    band: null,
    linePath: '',
    areaPath: '',
    bandUpperPath: '',
    bandLowerPath: '',
    bandFillPath: '',
    minValue: 0,
    maxValue: 0,
    plotWidth,
    plotHeight,
  };

  if (n === 0) return empty;

  const values = input.map(p => p.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || 1;

  const xOf = (i: number) =>
    n === 1 ? width / 2 : padH + (i / (n - 1)) * plotWidth;

  const yOf = (v: number) => toY(v, minValue, range, plotHeight, padV);

  const points: PlotPoint[] = input.map((p, i) => ({
    x: xOf(i),
    y: yOf(p.value),
    value: p.value,
    label: p.label,
  }));

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');

  const lastPt = points[points.length - 1]!;
  const firstPt = points[0]!;
  const areaPath =
    `${linePath} L ${lastPt.x.toFixed(1)} ${height} L ${firstPt.x.toFixed(1)} ${height} Z`;

  const rollingResult = rollingStats(values, rollingWindow, sigmaMultiplier);

  let band: BandPoint[] | null = null;
  let bandUpperPath = '';
  let bandLowerPath = '';
  let bandFillPath = '';

  if (isOk(rollingResult)) {
    const bandPoints: BandPoint[] = rollingResult.value.points.map((rp: RollingPoint, i: number) => ({
      x: xOf(i),
      upperY: yOf(rp.upper),
      lowerY: yOf(rp.lower),
    }));
    band = bandPoints;

    bandUpperPath = bandPoints
      .map((bp, i) => `${i === 0 ? 'M' : 'L'} ${bp.x.toFixed(1)} ${bp.upperY.toFixed(1)}`)
      .join(' ');

    const reversedLower = [...bandPoints].reverse();
    bandLowerPath = reversedLower
      .map((bp, i) => `${i === 0 ? 'M' : 'L'} ${bp.x.toFixed(1)} ${bp.lowerY.toFixed(1)}`)
      .join(' ');

    bandFillPath =
      bandUpperPath +
      ' L ' +
      reversedLower.map(bp => `${bp.x.toFixed(1)} ${bp.lowerY.toFixed(1)}`).join(' L ') +
      ' Z';
  }

  return {
    points,
    band,
    linePath,
    areaPath,
    bandUpperPath,
    bandLowerPath,
    bandFillPath,
    minValue,
    maxValue,
    plotWidth,
    plotHeight,
  };
}
