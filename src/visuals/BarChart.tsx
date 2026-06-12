import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { brand, color, space, type, whiteAlpha } from '../design/tokens';
import { formatValue, type SeriesData, type ValueFormat } from '../core/dax';
import { highlight, seriesRest } from './palette';
import { barIndexForX } from './scrub-logic';
import { ScrubHintCaption, useScrub } from './scrub';
import { bandSegments, type BandSegment } from '../ui/bar-chart-vm';
import type { RollingPoint, AnomalyFlag } from '../enhance';

const CHART_HEIGHT = 120;
const bandWhisper = whiteAlpha(0.08);

export const BarChart: React.FC<{
  data: SeriesData;
  format?: ValueFormat;
  highlightIndex?: number;
  band?: RollingPoint[];
  flags?: AnomalyFlag[];
}> = ({ data, format = 'number', highlightIndex, band, flags }) => {
  const scrub = useScrub(data.points.length, barIndexForX);

  const points = data.points;
  if (points.length === 0) return <Text style={styles.empty}>No data</Text>;

  const max = Math.max(...points.map((p) => p.value), 0);
  const scale = max || 1;
  const segments: BandSegment[] | null =
    band && band.length === points.length ? bandSegments(band, flags ?? [], scale) : null;
  const flagCount = segments ? segments.filter((s) => s.flagged).length : 0;
  const hi = highlightIndex ?? points.length - 1;
  const sel = scrub.selected !== null && scrub.selected < points.length ? scrub.selected : null;
  const active = sel !== null ? points[sel] : undefined;
  const latest = points[hi]!;

  return (
    <View
      accessibilityLabel={`Bar chart, ${points.length} bars, latest ${latest.label} ${formatValue(latest.value, format)}${
        segments ? `, control band shown, ${flagCount} anomal${flagCount === 1 ? 'y' : 'ies'} flagged` : ''
      }`}
    >
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
          const seg = segments ? segments[i]! : null;
          const flagged = seg?.flagged ?? false;
          return (
            <View
              key={`${p.label}-${i}`}
              style={styles.barSlot}
              accessible
              accessibilityLabel={`${p.label || `bar ${i + 1}`}: ${formatValue(p.value, format)}${
                flagged ? ', anomaly' : ''
              }`}
            >
              {seg ? (
                <View
                  pointerEvents="none"
                  style={[
                    styles.bandRegion,
                    {
                      bottom: seg.lowerFrac * CHART_HEIGHT,
                      height: Math.max(StyleSheet.hairlineWidth, (seg.upperFrac - seg.lowerFrac) * CHART_HEIGHT),
                    },
                  ]}
                />
              ) : null}
              {flagged ? <Text style={styles.flag}>▲</Text> : null}
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
  bandRegion: {
    position: 'absolute',
    left: 1,
    right: 1,
    borderRadius: 1,
    backgroundColor: bandWhisper,
  },
  flag: {
    position: 'absolute',
    top: 0,
    alignSelf: 'center',
    fontSize: 9,
    lineHeight: 10,
    color: brand.orange,
  },
  bar: { borderRadius: 2 },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.xs, gap: space.s },
  axisLabel: { ...type.micro, color: color.textTertiary, flexShrink: 1 },
});
