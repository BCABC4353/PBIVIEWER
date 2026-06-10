import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { color, radius, space, type } from '../design/tokens';

/**
 * Native bar sparkline — the first of the app's OWN visuals. Data comes from
 * Power BI; pixels come from us. Pure Views (no chart lib, no webview), so it
 * inherits the app's type, spacing, and accent like every other component.
 */
export const Sparkline: React.FC<{
  values: number[];
  label: string;
  unit?: string;
}> = ({ values, label, unit = 'min' }) => {
  if (values.length === 0) return null;
  const max = Math.max(...values, 1);
  const latest = values[values.length - 1]!;
  // The newest bar gets the accent; history stays quiet.
  return (
    <View style={styles.card} accessibilityLabel={`${label}: latest ${latest} ${unit}`}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.latest}>
          {latest}
          <Text style={styles.unit}> {unit}</Text>
        </Text>
      </View>
      <View style={styles.bars}>
        {values.map((v, i) => (
          <View
            key={i}
            style={[
              styles.bar,
              {
                height: Math.max(3, Math.round((v / max) * 48)),
                backgroundColor: i === values.length - 1 ? color.accent : color.surface2,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface1,
    borderRadius: radius.card,
    padding: space.m,
    marginTop: space.l,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  label: { ...type.caption, color: color.textSecondary },
  latest: { ...type.title, color: color.textPrimary, fontVariant: ['tabular-nums'] },
  unit: { ...type.caption, color: color.textTertiary },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    height: 48,
    marginTop: space.m,
  },
  bar: { flex: 1, borderRadius: 2 },
});
