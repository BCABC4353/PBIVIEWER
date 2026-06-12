import React, { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import {
  Canvas,
  Line,
  Path,
  Text as SkText,
} from '@shopify/react-native-skia';
import { computeStripGeometry, type StripSize } from './tick-strip-geometry';
import { brand, strip } from '../design/tokens';
import { tryMatchFont } from './skia-font';

export interface TickStripProps {
  size: StripSize;
  value: number;
  overdue?: number;
  cycle?: number;
  overflowSpan?: number;
  valueText?: string;
  width?: number;
}

function heightForSize(size: StripSize): number {
  if (size === 'large') return 96;
  if (size === 'medium') return 30;
  return 14;
}

function trianglePath(cx: number, tipY: number, baseY: number, halfW: number): string {
  return `M ${cx - halfW} ${baseY} L ${cx + halfW} ${baseY} L ${cx} ${tipY} Z`;
}

export function TickStrip(props: TickStripProps) {
  const { size, value, overdue = 0, cycle = 15, overflowSpan = 60 } = props;
  const { width: screenW } = useWindowDimensions();
  const w = props.width ?? screenW;
  const h = heightForSize(size);

  const labelFont = useMemo(
    () => tryMatchFont({ fontFamily: 'System', fontSize: 11, fontStyle: 'normal', fontWeight: '400' }),
    [],
  );

  const geo = computeStripGeometry({ width: w, size, cycle, value, overdue, overflowSpan });
  const { spec, x0, x1, xMark, minorTicks, ticks, overdueTicks, isOverdue } = geo;
  const base = spec.base;

  const liveColor = isOverdue ? strip.amberOverdue : brand.orange;
  const stemTop = base - spec.major - (spec.showValue ? 14 : 5);
  const caretBaseY = stemTop - spec.caretH;

  const caretPath = trianglePath(geo.xTarget, stemTop, caretBaseY, spec.caretW / 2);

  return (
    <Canvas style={{ width: w, height: h }}>
      <Line
        p1={{ x: x0 - 4, y: base }}
        p2={{ x: x1 + 4, y: base }}
        color={strip.track}
        strokeWidth={1}
      />

      {minorTicks.map((tick, i) => (
        <Line
          key={`minor-${i}`}
          p1={{ x: tick.x, y: base }}
          p2={{ x: tick.x, y: base - spec.minor }}
          color={strip.minor}
          strokeWidth={1}
        />
      ))}

      {ticks.map((tick, i) => (
        <Line
          key={`tick-${i}`}
          p1={{ x: tick.x, y: base }}
          p2={{ x: tick.x, y: base - (tick.isMajor ? spec.major : spec.minute) }}
          color={tick.isMajor ? strip.major : strip.minute}
          strokeWidth={tick.isMajor ? 1.6 : 1}
        />
      ))}

      {spec.labels && labelFont && ticks.filter(t => t.isMajor && t.label != null).map((tick, i) => (
        <SkText
          key={`label-${i}`}
          x={tick.x - 5}
          y={base + 17}
          text={tick.label!}
          color={isOverdue && tick.label === String(cycle) ? strip.labelOverdue : strip.label}
          font={labelFont}
        />
      ))}

      {isOverdue && (
        <Line
          p1={{ x: xMark, y: base + 3 }}
          p2={{ x: xMark, y: base - spec.major - 4 }}
          color={strip.mark}
          strokeWidth={2}
        />
      )}

      {overdueTicks.map((tick, i) => (
        <Line
          key={`otick-${i}`}
          p1={{ x: tick.x, y: base }}
          p2={{ x: tick.x, y: base - spec.minute }}
          color={strip.overdueBand}
          strokeWidth={1}
        />
      ))}

      <Line
        p1={{ x: x0, y: base }}
        p2={{ x: Math.min(geo.xTarget, xMark), y: base }}
        color={strip.fill}
        strokeWidth={spec.fillW}
      />

      {isOverdue && (
        <Line
          p1={{ x: xMark, y: base }}
          p2={{ x: geo.xTarget, y: base }}
          color={strip.amberOverdue}
          strokeWidth={spec.fillW}
        />
      )}

      <Line
        p1={{ x: geo.xTarget, y: stemTop }}
        p2={{ x: geo.xTarget, y: base }}
        color={liveColor}
        strokeWidth={spec.fillW === 1 ? 1 : 1.4}
      />

      <Path
        path={caretPath}
        color={liveColor}
      />
    </Canvas>
  );
}
