export interface ScaleConfig {
  minWidth: number;
  maxWidth: number;
  minScale: number;
  maxScale: number;
}

export interface ScaledValue {
  scaled: number;
  clamped: boolean;
}

const DEFAULT_CONFIG: ScaleConfig = {
  minWidth: 320,
  maxWidth: 1440,
  minScale: 0.75,
  maxScale: 1.5,
};

export function scaleFactor(containerWidth: number, config: ScaleConfig = DEFAULT_CONFIG): number {
  const { minWidth, maxWidth, minScale, maxScale } = config;
  if (maxWidth <= minWidth) return minScale;
  if (containerWidth <= minWidth) return minScale;
  if (containerWidth >= maxWidth) return maxScale;
  const t = (containerWidth - minWidth) / (maxWidth - minWidth);
  return minScale + t * (maxScale - minScale);
}

export function scale(value: number, containerWidth: number, config: ScaleConfig = DEFAULT_CONFIG): number {
  const factor = scaleFactor(containerWidth, config);
  return value * factor;
}

export function scaleWithMeta(
  value: number,
  containerWidth: number,
  config: ScaleConfig = DEFAULT_CONFIG,
): ScaledValue {
  const { minWidth, maxWidth } = config;
  const clamped = containerWidth <= minWidth || containerWidth >= maxWidth;
  return { scaled: scale(value, containerWidth, config), clamped };
}

export function scaleLinear(
  containerWidth: number,
  fromValue: number,
  toValue: number,
  config: ScaleConfig = DEFAULT_CONFIG,
): number {
  const { minWidth, maxWidth } = config;
  if (maxWidth <= minWidth) return fromValue;
  if (containerWidth <= minWidth) return fromValue;
  if (containerWidth >= maxWidth) return toValue;
  const t = (containerWidth - minWidth) / (maxWidth - minWidth);
  return fromValue + t * (toValue - fromValue);
}

export function scaleClamp(
  value: number,
  containerWidth: number,
  minResult: number,
  maxResult: number,
  config: ScaleConfig = DEFAULT_CONFIG,
): number {
  const raw = scale(value, containerWidth, config);
  return Math.max(minResult, Math.min(maxResult, raw));
}
