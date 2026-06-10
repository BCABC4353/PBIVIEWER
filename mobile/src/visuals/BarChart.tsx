import React, { useCallback, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import { color, space, type } from '../design/tokens';
import { formatValue, type SeriesData, type ValueFormat } from '../core/dax';
import { detent } from '../feel/haptics';
import { highlight, seriesRest } from './palette';
import { barIndexForX } from './scrub-logic';

const CHART_HEIGHT = 120;
const TAP_SLOP = 4; // px of travel before a touch counts as a scrub, not a tap

/**
 * Vertical bar chart — history rests quiet, the latest bar carries the amber
 * accent. Hairline grid; touch is the entry: press a bar to read its exact
 * value (mono readout), DRAG to scrub — the nearest bar lights amber, the
 * readout follows live, and a detent ticks each time the index changes.
 * Release keeps the last selection; a plain tap clears it. Scrubbing is
 * interaction, not decoration — it ignores Reduce Motion.
 */
export const BarChart: React.FC<{
  data: SeriesData;
  format?: ValueFormat;
  /** Index of the accented bar; defaults to the latest. */
  highlightIndex?: number;
}> = ({ data, format = 'number', highlightIndex }) => {
  const [selected, setSelected] = useState<number | null>(null);
  const widthRef = useRef(0);
  const countRef = useRef(data.points.length);
  countRef.current = data.points.length;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const movedRef = useRef(false);

  // Snap the scrub to the bar under the finger; detent ONLY on index change
  // (detent() is internally rate-limited, so fast scrubs purr, never buzz).
  const scrubTo = useCallback((x: number) => {
    const idx = barIndexForX(x, widthRef.current, countRef.current);
    if (idx < 0 || idx === selectedRef.current) return;
    selectedRef.current = idx;
    setSelected(idx);
    detent();
  }, []);

  const endTouch = useCallback(() => {
    // A drag keeps its last selection; a plain tap clears back to latest.
    if (!movedRef.current) {
      selectedRef.current = null;
      setSelected(null);
    }
  }, []);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // Yield to the surrounding ScrollView only when the drag is clearly
        // vertical — horizontal scrubs keep the chart.
        onPanResponderTerminationRequest: (_e, g) => Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderGrant: (e) => {
          movedRef.current = false;
          scrubTo(e.nativeEvent.locationX);
        },
        onPanResponderMove: (e, g) => {
          if (Math.abs(g.dx) > TAP_SLOP || Math.abs(g.dy) > TAP_SLOP) movedRef.current = true;
          scrubTo(e.nativeEvent.locationX);
        },
        onPanResponderRelease: endTouch,
        onPanResponderTerminate: endTouch,
      }),
    [scrubTo, endTouch],
  );

  const points = data.points;
  if (points.length === 0) return <Text style={styles.empty}>No data</Text>;

  const max = Math.max(...points.map((p) => p.value), 0);
  const min = Math.min(...points.map((p) => p.value), 0);
  const range = max - min || 1;
  const hi = highlightIndex ?? points.length - 1;
  // Guard against a stale selection if the data shrank under it.
  const sel = selected !== null && selected < points.length ? selected : null;
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
        // box-only: the plot itself owns every touch, so locationX is always
        // plot-relative and the scrub math stays honest.
        pointerEvents="box-only"
        onLayout={(e) => {
          widthRef.current = e.nativeEvent.layout.width;
        }}
        {...pan.panHandlers}
      >
        {/* Quiet grid hairlines behind the bars. */}
        {[0, 0.5, 1].map((t) => (
          <View key={t} style={[styles.grid, { top: t * (CHART_HEIGHT - 1) }]} />
        ))}
        {points.map((p, i) => {
          const h = Math.max(3, Math.round(((p.value - Math.min(min, 0)) / range) * CHART_HEIGHT));
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
