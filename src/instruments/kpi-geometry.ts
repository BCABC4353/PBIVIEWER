export interface KpiGeometryOpts {
  width: number;
  height: number;
}

export interface KpiLayout {
  valueX: number;
  valueY: number;
  labelX: number;
  labelY: number;
  deltaX: number;
  deltaY: number;
  valueFontSize: number;
  labelFontSize: number;
  deltaFontSize: number;
}

export function computeKpiLayout(opts: KpiGeometryOpts): KpiLayout {
  const { width, height } = opts;
  const pad = 20;
  const valueFontSize = Math.min(56, Math.floor(height * 0.55));
  const labelFontSize = 10;
  const deltaFontSize = 12;

  const labelY = pad + labelFontSize;
  const valueY = labelY + 8 + valueFontSize;
  const deltaY = valueY + 14 + deltaFontSize;

  return {
    valueX: pad,
    valueY,
    labelX: pad,
    labelY,
    deltaX: pad,
    deltaY,
    valueFontSize,
    labelFontSize,
    deltaFontSize,
  };
}

export type DeltaDirection = 'up' | 'down' | 'flat';

export function deltaDirection(delta: number | null): DeltaDirection {
  if (delta === null || delta === 0) return 'flat';
  return delta > 0 ? 'up' : 'down';
}
