import React, { useMemo } from 'react';
import { Canvas, Rect, Text as SkText } from '@shopify/react-native-skia';
import { computeBarGeometry, type BarInput } from './bar-geometry';
import { color, whiteAlpha, categoricalHue } from '../design/tokens';
import { tryMatchFont } from './skia-font';

export interface BarChartSkiaProps {
  width: number;
  height: number;
  input: BarInput;
  highlightIndex?: number;
  padH?: number;
  padV?: number;
  gap?: number;
}

export function BarChartSkia(props: BarChartSkiaProps) {
  const {
    width,
    height,
    input,
    highlightIndex,
    padH = 12,
    padV = 16,
    gap = 4,
  } = props;

  const axisFont = useMemo(
    () => tryMatchFont({ fontFamily: 'System', fontSize: 10, fontStyle: 'normal', fontWeight: '400' }),
    [],
  );

  const geo = computeBarGeometry(input, { width, height, padH, padV, gap });
  const hi = highlightIndex ?? (geo.bars.length > 0 ? geo.bars.length - 1 : 0);

  return (
    <Canvas style={{ width, height }}>
      {geo.bars.map((bar, i) => {
        const isHi = i === hi;
        const barColor = isHi ? categoricalHue(0) : whiteAlpha(0.28);
        return (
          <Rect
            key={`bar-${i}`}
            x={bar.x}
            y={bar.y}
            width={bar.w}
            height={bar.h}
            color={barColor}
          />
        );
      })}

      {axisFont && geo.bars.map((bar, i) => (
        <SkText
          key={`lbl-${i}`}
          x={bar.x + bar.w / 2 - 8}
          y={geo.baseY + 13}
          text={bar.label.slice(0, 4)}
          color={color.textTertiary}
          font={axisFont}
        />
      ))}
    </Canvas>
  );
}
