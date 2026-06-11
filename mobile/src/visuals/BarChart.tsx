import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { color, space, type } from '../design/tokens';
import { formatValue, type SeriesData, type ValueFormat } from '../core/dax';
import { highlight, seriesRest } from './palette';
import { barIndexForX } from './scrub-logic';
import { ScrubHintCaption, useScrub } from './scrub';

const CHART_HEIGHT = 120;

export const BarChart: React.FC<{
  data: SeriesData;
  format?: ValueFormat;
  highlightIndex?: number;
}> = ({ data, format = 'number', highlightIndex }) => {
  const scrub = useScrub(data.points.length, barIndexForX);

  const points = data.points;
  if (points.length === 0) return <Text style={styles.empty}>No data</Text>;

  const max = Math.max(...points.map((p) => p.value), 0);
  const scale = max || 1;
  const hi = highlightIndex ?? points.length - 1;
  const sel = scrub.selected !== null && scrub.selected < points.length ? scrub.selected : null;
  const active = sel !== null ? points[sel] : undefined;
  const latest = points[hi]!;

  return (
    <View accessibilityLabel={`Bar chart, ${points.length} bars, latest ${latest.label} ${formatValue(latest.value, format)}`}>
      <View style={styles.readout}>
        <Text style={styles.readoutLabel} numberOfLines={1}>
          {active ? active.label : latest.label}
        </Text>
        <Text style={styles.readoutValue}>
          {formatValue(active ? active.value : latest.value, format)}
        </Text>
      </View>
      <View
        style={styles.plot}
        pointerEvents="box-only"
        onLayout={scrub.onLayout}
        {...scrub.panHandlers}
      >
        {[0, 0.5, 1].map((t) => (
          <View key={t} style={[styles.grid, { top: t * (CHART_HEIGHT - 1) }]} />
        ))}
        {points.map((p, i) => {
          const h = Math.max(3, Math.round((Math.max(p.value, 0) / scale) * CHART_HEIGHT));
          const amber = sel !== null ? i === sel : i === hi;
          return (
            <View
              key={`${p.label}-${i}`}
              style={styles.barSlot}
              accessible
              accessibilityLabel={`${p.label || `bar ${i + 1}`}: ${formatValue(p.value, format)}`}
            >
              <View
                style={[
                  styles.bar,
                  {
                    height: h,
                    backgroundColor: amber ? highlight : seriesRest,
                  },
                ]}
              />
            </View>
          );
        })}
      </View>
      <View style={styles.axis}>
        <Text style={styles.axisLabel} numberOfLines={1}>
          {points[0]!.label}
        </Text>
        {points.length > 1 ? (
          <Text style={styles.axisLabel} numberOfLines={1}>
            {points[points.length - 1]!.label}
          </Text>
        ) : null}
      </View>
      <ScrubHintCaption visible={scrub.hintVisible} />
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
  plot: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.xs,
    height: CHART_HEIGHT,
    marginTop: space.m,
  },
  grid: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.hairline,
  },
  barSlot: { flex: 1, height: CHART_HEIGHT, justifyContent: 'flex-end' },
  bar: { borderRadius: 2 },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.xs, gap: space.s },
  axisLabel: { ...type.micro, color: color.textTertiary, flexShrink: 1 },
});
