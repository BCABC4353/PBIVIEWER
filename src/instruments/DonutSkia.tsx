import React, { useMemo } from 'react';
import { Canvas, Path, Text as SkText } from '@shopify/react-native-skia';
import { computeDonutGeometry, arcPathString, type DonutSlice } from './donut-geometry';
import { color, whiteAlpha, categoricalHue } from '../design/tokens';
import { tryMatchFont } from './skia-font';

export interface DonutSkiaProps {
  width: number;
  height: number;
  slices: DonutSlice[];
  centerText?: string;
  highlightIndex?: number;
  strokeWidth?: number;
  gapAngle?: number;
}

export function DonutSkia(props: DonutSkiaProps) {
  const {
    width,
    height,
    slices,
    centerText,
    highlightIndex,
    strokeWidth = 18,
    gapAngle = 0.05,
  } = props;

  const centerValueFont = useMemo(
    () => tryMatchFont({ fontFamily: 'System', fontSize: 22, fontStyle: 'normal', fontWeight: '600' }),
    [],
  );
  const centerLabelFont = useMemo(
    () => tryMatchFont({ fontFamily: 'System', fontSize: 10, fontStyle: 'normal', fontWeight: '400' }),
    [],
  );

  const size = Math.min(width, height);
  const geo = useMemo(
    () => computeDonutGeometry(slices, { size, strokeWidth, gapAngle }),
    [slices, size, strokeWidth, gapAngle],
  );

  const hi = highlightIndex ?? (geo.arcs.length > 0 ? 0 : -1);
  const cx = width / 2;
  const cy = height / 2;

  if (geo.arcs.length === 0) {
    return <Canvas style={{ width, height }} />;
  }

  const totalText = centerText ?? String(Math.round(geo.total));

  return (
    <Canvas style={{ width, height }}>
      {geo.arcs.map((arc, i) => {
        const isHi = i === hi;
        const opacity = Math.max(0.15, 0.50 - i * 0.07);
        const arcColor = isHi ? categoricalHue(i) : whiteAlpha(opacity);
        const pathStr = arcPathString(cx, cy, geo.radius, arc.startAngle, arc.endAngle);
        return (
          <Path
            key={`arc-${i}`}
            path={pathStr}
            color={arcColor}
            style="stroke"
            strokeWidth={isHi ? strokeWidth + 2 : strokeWidth}
            strokeCap="butt"
          />
        );
      })}

      {centerValueFont && (
        <SkText
          x={cx - 22}
          y={cy + 8}
          text={totalText}
          color={color.textPrimary}
          font={centerValueFont}
        />
      )}

      {centerLabelFont && (
        <SkText
          x={cx - 14}
          y={cy + 22}
          text="TOTAL"
          color={color.textTertiary}
          font={centerLabelFont}
        />
      )}
    </Canvas>
  );
}
