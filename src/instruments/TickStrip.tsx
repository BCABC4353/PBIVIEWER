import React from 'react';
import { useWindowDimensions } from 'react-native';
import {
  Canvas,
  Line,
  Path,
  Text as SkText,
  Group,
} from '@shopify/react-native-skia';
import { computeStripGeometry, type StripSize } from './tick-strip-geometry';
import { brand } from '../design/tokens';

const TRACK_COLOR = 'rgba(255,255,255,0.14)';
const MINOR_COLOR = 'rgba(255,255,255,0.16)';
const MINUTE_COLOR = 'rgba(255,255,255,0.34)';
const MAJOR_COLOR = 'rgba(255,255,255,0.60)';
const FILL_COLOR_MAIN = 'rgba(201,203,209,0.75)';
const LABEL_COLOR = '#80848F';
const LABEL_COLOR_OVERDUE = '#FFB02E';
const MARK_COLOR = 'rgba(255,255,255,0.85)';
const OVERDUEBAND_COLOR = 'rgba(255,176,46,0.30)';
const AMBER_OVERDUE = '#FFB02E';

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
  const { size, value, overdue = 0, cycle = 15, overflowSpan = 60, valueText } = props;
  const { width: screenW } = useWindowDimensions();
  const w = props.width ?? screenW;
  const h = heightForSize(size);

  const geo = computeStripGeometry({ width: w, size, cycle, value, overdue, overflowSpan });
  const { spec, x0, x1, xMark, minorTicks, ticks, overdueTicks, isOverdue } = geo;
  const base = spec.base;

  const liveColor = isOverdue ? AMBER_OVERDUE : brand.orange;
  const stemTop = base - spec.major - (spec.showValue ? 14 : 5);
  const caretBaseY = stemTop - spec.caretH;

  const caretPath = trianglePath(geo.xTarget, stemTop, caretBaseY, spec.caretW / 2);

  return (
    <Canvas style={{ width: w, height: h }}>
      <Line
        p1={{ x: x0 - 4, y: base }}
        p2={{ x: x1 + 4, y: base }}
        color={TRACK_COLOR}
        strokeWidth={1}
      />

      {minorTicks.map((tick, i) => (
        <Line
          key={`minor-${i}`}
          p1={{ x: tick.x, y: base }}
          p2={{ x: tick.x, y: base - spec.minor }}
          color={MINOR_COLOR}
          strokeWidth={1}
        />
      ))}

      {ticks.map((tick, i) => (
        <Line
          key={`tick-${i}`}
          p1={{ x: tick.x, y: base }}
          p2={{ x: tick.x, y: base - (tick.isMajor ? spec.major : spec.minute) }}
          color={tick.isMajor ? MAJOR_COLOR : MINUTE_COLOR}
          strokeWidth={tick.isMajor ? 1.6 : 1}
        />
      ))}

      {spec.labels && ticks.filter(t => t.isMajor && t.label != null).map((tick, i) => (
        <SkText
          key={`label-${i}`}
          x={tick.x - 5}
          y={base + 17}
          text={tick.label!}
          color={isOverdue && tick.label === String(cycle) ? LABEL_COLOR_OVERDUE : LABEL_COLOR}
          font={null}
        />
      ))}

      {isOverdue && (
        <Line
          p1={{ x: xMark, y: base + 3 }}
          p2={{ x: xMark, y: base - spec.major - 4 }}
          color={MARK_COLOR}
          strokeWidth={2}
        />
      )}

      {overdueTicks.map((tick, i) => (
        <Line
          key={`otick-${i}`}
          p1={{ x: tick.x, y: base }}
          p2={{ x: tick.x, y: base - spec.minute }}
          color={OVERDUEBAND_COLOR}
          strokeWidth={1}
        />
      ))}

      <Line
        p1={{ x: x0, y: base }}
        p2={{ x: Math.min(geo.xTarget, xMark), y: base }}
        color={FILL_COLOR_MAIN}
        strokeWidth={spec.fillW}
      />

      {isOverdue && (
        <Line
          p1={{ x: xMark, y: base }}
          p2={{ x: geo.xTarget, y: base }}
          color={AMBER_OVERDUE}
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
