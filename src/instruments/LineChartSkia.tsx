import React, { useMemo } from 'react';
import { Canvas, Path, Circle, Text as SkText } from '@shopify/react-native-skia';
import { computeLineGeometry, type LinePoint } from './line-geometry';
import { color, whiteAlpha, categoricalHue } from '../design/tokens';
import { tryMatchFont } from './skia-font';

export interface LineChartSkiaProps {
  width: number;
  height: number;
  points: LinePoint[];
  rollingWindow?: number;
  sigmaMultiplier?: number;
  padH?: number;
  padV?: number;
}

export function LineChartSkia(props: LineChartSkiaProps) {
  const {
    width,
    height,
    points,
    rollingWindow = 5,
    sigmaMultiplier = 1.5,
    padH = 12,
    padV = 16,
  } = props;

  const axisFont = useMemo(
    () => tryMatchFont({ fontFamily: 'System', fontSize: 10, fontStyle: 'normal', fontWeight: '400' }),
    [],
  );

  const geo = useMemo(
    () => computeLineGeometry(points, { width, height, padH, padV }, rollingWindow, sigmaMultiplier),
    [points, width, height, padH, padV, rollingWindow, sigmaMultiplier],
  );

  if (geo.points.length === 0) {
    return <Canvas style={{ width, height }} />;
  }

  const lastPt = geo.points[geo.points.length - 1]!;

  return (
    <Canvas style={{ width, height }}>
      {geo.bandFillPath !== '' && (
        <Path
          path={geo.bandFillPath}
          color={whiteAlpha(0.05)}
          style="fill"
        />
      )}

      {geo.bandUpperPath !== '' && (
        <Path
          path={geo.bandUpperPath}
          color={whiteAlpha(0.18)}
          style="stroke"
          strokeWidth={1}
        />
      )}

      {geo.bandLowerPath !== '' && (
        <Path
          path={geo.bandLowerPath}
          color={whiteAlpha(0.18)}
          style="stroke"
          strokeWidth={1}
        />
      )}

      <Path
        path={geo.areaPath}
        color={whiteAlpha(0.06)}
        style="fill"
      />

      <Path
        path={geo.linePath}
        color={whiteAlpha(0.66)}
        style="stroke"
        strokeWidth={2}
        strokeJoin="round"
        strokeCap="round"
      />

      <Circle
        cx={lastPt.x}
        cy={lastPt.y}
        r={3.5}
        color={categoricalHue(0)}
      />

      {axisFont && (
        <SkText
          x={padH}
          y={height - 2}
          text={geo.points[0]!.label}
          color={color.textTertiary}
          font={axisFont}
        />
      )}

      {axisFont && (
        <SkText
          x={width - padH - 28}
          y={height - 2}
          text={lastPt.label}
          color={color.textTertiary}
          font={axisFont}
        />
      )}
    </Canvas>
  );
}
