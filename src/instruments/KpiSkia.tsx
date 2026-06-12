import React, { useMemo } from 'react';
import { Canvas, Text as SkText } from '@shopify/react-native-skia';
import { computeKpiLayout, deltaDirection } from './kpi-geometry';
import { color, direction } from '../design/tokens';
import { tryMatchFont } from './skia-font';

export interface KpiSkiaProps {
  width: number;
  height: number;
  label: string;
  value: string;
  delta?: number | null;
  deltaText?: string;
}

export function KpiSkia(props: KpiSkiaProps) {
  const { width, height, label, value, delta = null, deltaText } = props;

  const labelFont = useMemo(
    () => tryMatchFont({ fontFamily: 'System', fontSize: 10, fontStyle: 'normal', fontWeight: '500' }),
    [],
  );
  const deltaFont = useMemo(
    () => tryMatchFont({ fontFamily: 'System', fontSize: 12, fontStyle: 'normal', fontWeight: '400' }),
    [],
  );

  const layout = computeKpiLayout({ width, height });
  const valueFont = useMemo(
    () => tryMatchFont({ fontFamily: 'System', fontSize: layout.valueFontSize, fontStyle: 'normal', fontWeight: '400' }),
    [layout.valueFontSize],
  );

  const dir = deltaDirection(delta);

  const deltaColor =
    dir === 'up' ? direction.up :
    dir === 'down' ? direction.down :
    color.textTertiary;

  const deltaGlyph = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '—';
  const deltaDisplay = deltaText ?? (delta !== null ? String(Math.abs(delta)) : '');

  return (
    <Canvas style={{ width, height }}>
      {labelFont && (
        <SkText
          x={layout.labelX}
          y={layout.labelY}
          text={label.toUpperCase()}
          color={color.textTertiary}
          font={labelFont}
        />
      )}

      {valueFont && (
        <SkText
          x={layout.valueX}
          y={layout.valueY}
          text={value}
          color={color.textPrimary}
          font={valueFont}
        />
      )}

      {delta !== null && deltaFont && (
        <SkText
          x={layout.deltaX}
          y={layout.deltaY}
          text={`${deltaGlyph} ${deltaDisplay}`}
          color={deltaColor}
          font={deltaFont}
        />
      )}
    </Canvas>
  );
}
