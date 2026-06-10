import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { color, radius, space, statusColor, statusGlyph, statusLabel, type } from '../design/tokens';
import type { Refreshable } from '../core/types';
import { relativeAge, triggerLabel } from '../core/refresh-health';

export const StatusChip: React.FC<{ status: Refreshable['lastStatus']; overdue?: boolean }> = ({
  status,
  overdue,
}) => (
  <View style={styles.chipRow}>
    <View style={[styles.chip, { borderColor: statusColor[status] }]}>
      <Text style={[styles.chipGlyph, { color: statusColor[status] }]}>{statusGlyph[status]}</Text>
      <Text style={[styles.chipText, { color: statusColor[status] }]}>{statusLabel[status]}</Text>
    </View>
    {overdue ? (
      <View style={[styles.chip, { borderColor: color.broken }]}>
        <Text style={[styles.chipText, { color: color.broken }]}>OVERDUE</Text>
      </View>
    ) : null}
  </View>
);

/** Hero: the one number that matters — how many things need attention. */
export const FleetHero: React.FC<{ broken: number; total: number; generatedAt: string; now: number }> = ({
  broken,
  total,
  generatedAt,
  now,
}) => {
  const healthy = broken === 0;
  return (
    <View style={styles.hero}>
      <Text style={[styles.heroNumber, { color: healthy ? color.textPrimary : color.broken }]}>
        {healthy ? '0' : String(broken)}
      </Text>
      <Text style={styles.heroLabel}>
        {healthy ? `all ${total} refreshables healthy` : `of ${total} need attention`}
      </Text>
      <Text style={styles.heroMeta}>checked {relativeAge(generatedAt, now) || 'just now'}</Text>
    </View>
  );
};

export const FleetRow: React.FC<{ item: Refreshable; now: number; onPress: () => void }> = ({
  item,
  now,
  onPress,
}) => {
  // Quiet breathing on in-progress rows — stillness elsewhere.
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (item.lastStatus !== 'InProgress') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.45, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [item.lastStatus, pulse]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: color.surface2, transform: [{ scale: 0.985 }] }]}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${statusLabel[item.lastStatus]}${item.scheduleOverdue ? ', overdue' : ''}`}
    >
      <Animated.Text style={[styles.rowGlyph, { color: statusColor[item.lastStatus], opacity: pulse }]}>
        {statusGlyph[item.lastStatus]}
      </Animated.Text>
      <View style={styles.rowBody}>
        <Text style={styles.rowName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {item.workspaceName}
          {item.lastSuccessTime ? ` · ${relativeAge(item.lastSuccessTime, now)}` : ''}
        </Text>
      </View>
      {item.scheduleOverdue ? <Text style={[styles.rowFlag, { color: color.broken }]}>!</Text> : null}
      <Text style={styles.rowChevron}>›</Text>
    </Pressable>
  );
};

export const DetailLine: React.FC<{ label: string; value?: string; tone?: string }> = ({ label, value, tone }) =>
  value ? (
    <View style={styles.detailLine}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, tone ? { color: tone } : null]}>{value}</Text>
    </View>
  ) : null;

export const detailTrigger = triggerLabel;

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', gap: space.s },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderRadius: radius.chip,
    paddingHorizontal: space.s, paddingVertical: 4,
  },
  chipGlyph: { fontSize: 12 },
  chipText: { ...type.micro },

  hero: { alignItems: 'center', paddingVertical: space.xl },
  heroNumber: { ...type.hero },
  heroLabel: { ...type.body, color: color.textSecondary, marginTop: space.xs },
  heroMeta: { ...type.caption, color: color.textTertiary, marginTop: space.s },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: space.m,
    paddingHorizontal: space.l, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.hairline,
  },
  rowGlyph: { fontSize: 16, width: 20, textAlign: 'center' },
  rowBody: { flex: 1 },
  rowName: { ...type.body, color: color.textPrimary },
  rowMeta: { ...type.caption, color: color.textTertiary, marginTop: 2 },
  rowFlag: { ...type.title },
  rowChevron: { ...type.title, color: color.textTertiary },

  detailLine: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.hairline,
  },
  detailLabel: { ...type.body, color: color.textSecondary },
  detailValue: { ...type.body, color: color.textPrimary, maxWidth: '60%', textAlign: 'right' },
});
