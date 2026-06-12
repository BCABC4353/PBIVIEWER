import React, { useMemo } from 'react';
import { Canvas, Rect, Line, Text as SkText } from '@shopify/react-native-skia';
import { computeWaterfallGeometry } from './waterfall-geometry';
import type { WaterfallStep } from '../enhance/bridge';
import { waterfall, color } from '../design/tokens';
import { tryMatchFont } from './skia-font';

export interface WaterfallSkiaProps {
  width: number;
  height: number;
  steps: WaterfallStep[];
  totals?: string[];
  padH?: number;
  padV?: number;
  gap?: number;
}

function kindColor(kind: 'increment' | 'decrement' | 'total'): string {
  if (kind === 'increment') return waterfall.increment;
  if (kind === 'decrement') return waterfall.decrement;
  return waterfall.total;
}

export function WaterfallSkia(props: WaterfallSkiaProps) {
  const {
    width,
    height,
    steps,
    totals = [],
    padH = 12,
    padV = 20,
    gap = 4,
  } = props;

  const axisFont = useMemo(
    () => tryMatchFont({ fontFamily: 'System', fontSize: 9, fontStyle: 'normal', fontWeight: '400' }),
    [],
  );

  const totalsSet = useMemo(() => new Set(totals), [totals]);
  const geo = useMemo(
    () => computeWaterfallGeometry(steps, { width, height, padH, padV, gap }, totalsSet),
    [steps, width, height, padH, padV, gap, totalsSet],
  );

  return (
    <Canvas style={{ width, height }}>
      {geo.connectors.map((conn, i) => (
        <Line
          key={`conn-${i}`}
          p1={{ x: conn.x1, y: conn.y1 }}
          p2={{ x: conn.x2, y: conn.y2 }}
          color={waterfall.connector}
          strokeWidth={1}
        />
      ))}

      {geo.bars.map((bar, i) => (
        <Rect
          key={`bar-${i}`}
          x={bar.x}
          y={bar.y}
          width={bar.w}
          height={bar.h}
          color={kindColor(bar.kind)}
        />
      ))}

      {axisFont && geo.bars.map((bar, i) => (
        <SkText
          key={`lbl-${i}`}
          x={bar.x + bar.w / 2 - 8}
          y={geo.baseY + 14}
          text={bar.label.slice(0, 5)}
          color={color.textTertiary}
          font={axisFont}
        />
      ))}
    </Canvas>
  );
}
