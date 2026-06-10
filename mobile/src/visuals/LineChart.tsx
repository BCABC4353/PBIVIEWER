import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { color, space, type } from '../design/tokens';
import { formatValue, type SeriesData, type ValueFormat } from '../core/dax';
import { areaFill, highlight, seriesLine } from './palette';

const CHART_HEIGHT = 120;
const PAD_V = 6; // keeps the stroke and last-point dot inside the svg

/**
 * Line chart — svg path with a flat whisper of area fill (no gradients), the
 * last point dotted in amber, min/max read as quiet mono labels.
 */
export const LineChart: React.FC<{
  data: SeriesData;
  format?: ValueFormat;
}> = ({ data, format = 'number' }) => {
  const [width, setWidth] = useState(0);
  const points = data.points;
  if (points.length === 0) return <Text style={styles.empty}>No data</Text>;

  const values = points.map((p) => p.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const last = points[points.length - 1]!;

  const x = (i: number) =>
    points.length === 1 ? width / 2 : (i / (points.length - 1)) * width;
  const y = (v: number) => PAD_V + (1 - (v - min) / range) * (CHART_HEIGHT - 2 * PAD_V);

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(' ');
  const areaPath = `${linePath} L ${x(points.length - 1).toFixed(1)} ${CHART_HEIGHT} L ${x(0).toFixed(1)} ${CHART_HEIGHT} Z`;

  return (
    <View
      accessibilityLabel={`Line chart, ${points.length} points, latest ${last.label} ${formatValue(
        last.value,
        format,
      )}, range ${formatValue(min, format)} to ${formatValue(max, format)}`}
    >
      <View style={styles.readout}>
        <Text style={styles.readoutLabel} numberOfLines={1}>
          {last.label}
        </Text>
        <Text style={styles.readoutValue}>{formatValue(last.value, format)}</Text>
      </View>
      <View
        style={styles.plot}
        onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
      >
        {/* min/max rails — quiet mono labels pinned to the plot edges */}
        <Text style={[styles.rail, styles.railTop]}>{formatValue(max, format)}</Text>
        <Text style={[styles.rail, styles.railBottom]}>{formatValue(min, format)}</Text>
        {width > 0 ? (
          <Svg width={width} height={CHART_HEIGHT}>
            <Path d={areaPath} fill={areaFill} />
            <Path d={linePath} stroke={seriesLine} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            <Circle cx={x(points.length - 1)} cy={y(last.value)} r={3.5} fill={highlight} />
          </Svg>
        ) : null}
      </View>
      <View style={styles.axis}>
        <Text style={styles.axisLabel} numberOfLines={1}>
          {points[0]!.label}
        </Text>
        {points.length > 1 ? (
          <Text style={styles.axisLabel} numberOfLines={1}>
            {last.label}
          </Text>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  empty: { ...type.caption, color: color.textTertiary, marginTop: space.m },
  readout: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: space.s,
    gap: space.s,
  },
  readoutLabel: { ...type.caption, color: color.textSecondary, flexShrink: 1 },
  readoutValue: { ...type.title, color: color.textPrimary, fontVariant: ['tabular-nums'] },
  plot: { height: CHART_HEIGHT, marginTop: space.m },
  rail: { ...type.micro, color: color.textTertiary, position: 'absolute', right: 0, fontVariant: ['tabular-nums'] },
  railTop: { top: 0 },
  railBottom: { bottom: 0 },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.xs, gap: space.s },
  axisLabel: { ...type.micro, color: color.textTertiary, flexShrink: 1 },
});
