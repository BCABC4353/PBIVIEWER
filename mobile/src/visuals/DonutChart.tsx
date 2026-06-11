import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { color, space, type } from '../design/tokens';
import { formatValue, type DonutData, type ValueFormat } from '../core/dax';
import { highlight, legendGlyph, seriesShade } from './palette';

const SIZE = 148;
const STROKE = 16;
const GAP = 0.05;

const polar = (cx: number, cy: number, r: number, a: number) => ({
  x: cx + r * Math.cos(a),
  y: cy + r * Math.sin(a),
});

function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const start = polar(cx, cy, r, a0);
  const end = polar(cx, cy, r, a1);
  const largeArc = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

export const DonutChart: React.FC<{
  data: DonutData;
  format?: ValueFormat;
  centerLabel?: string;
}> = ({ data, format = 'number', centerLabel = 'total' }) => {
  const slices = data.slices;
  if (slices.length === 0) return <Text style={styles.empty}>No data</Text>;

  const total = slices.reduce((s, d) => s + d.value, 0);
  const largest = slices.reduce((bi, s, i) => (s.value > slices[bi]!.value ? i : bi), 0);
  const sliceColor = (i: number) => (i === largest ? highlight : seriesShade(i, slices.length));

  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const r = (SIZE - STROKE) / 2;
  let angle = -Math.PI / 2;

  return (
    <View
      accessibilityLabel={`Donut chart, ${centerLabel} ${formatValue(total, format)}, ${slices
        .map((s) => `${s.label} ${formatValue(s.value, format)}`)
        .join(', ')}`}
    >
      <View style={styles.row}>
        <View style={styles.ringWrap}>
          <Svg width={SIZE} height={SIZE}>
            {slices.length === 1 ? (
              <Circle cx={cx} cy={cy} r={r} stroke={sliceColor(0)} strokeWidth={STROKE} fill="none" />
            ) : (
              slices.map((s, i) => {
                const sweep = (s.value / total) * Math.PI * 2;
                const a0 = angle + GAP / 2;
                const a1 = angle + sweep - GAP / 2;
                angle += sweep;
                if (a1 <= a0) return null;
                return (
                  <Path
                    key={`${s.label}-${i}`}
                    d={arcPath(cx, cy, r, a0, a1)}
                    stroke={sliceColor(i)}
                    strokeWidth={STROKE}
                    strokeLinecap="butt"
                    fill="none"
                  />
                );
              })
            )}
          </Svg>
          <View style={styles.center} pointerEvents="none">
            <Text style={styles.centerValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {formatValue(total, format)}
            </Text>
            <Text style={styles.centerLabel} numberOfLines={1}>
              {centerLabel.toUpperCase()}
            </Text>
          </View>
        </View>
        <View style={styles.legend}>
          {slices.map((s, i) => (
            <View key={`${s.label}-${i}`} style={styles.legendRow}>
              <Text style={[styles.legendGlyph, { color: sliceColor(i) }]}>{legendGlyph(i)}</Text>
              <Text style={styles.legendLabel} numberOfLines={1}>
                {s.label}
              </Text>
              <Text style={styles.legendValue}>{formatValue(s.value, format)}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  empty: { ...type.caption, color: color.textTertiary, marginTop: space.m },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.l, marginTop: space.m },
  ringWrap: { width: SIZE, height: SIZE },
  center: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: STROKE + space.s,
  },
  centerValue: { ...type.title, color: color.textPrimary, fontVariant: ['tabular-nums'] },
  centerLabel: { ...type.micro, color: color.textTertiary, marginTop: 2 },
  legend: { flex: 1, gap: space.s },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  legendGlyph: { ...type.caption, width: 16, textAlign: 'center' },
  legendLabel: { ...type.caption, color: color.textSecondary, flex: 1 },
  legendValue: { ...type.caption, color: color.textPrimary, fontVariant: ['tabular-nums'] },
});
