import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { color, direction, space, type } from '../design/tokens';
import { formatValue, type KpiData, type ValueFormat } from '../core/dax';

export const KpiTile: React.FC<{
  data: KpiData;
  format?: ValueFormat;
  delta?: number;
}> = ({ data, format = 'number', delta }) => {
  const value = formatValue(data.value, format);
  const hasDelta = delta !== undefined && Number.isFinite(delta);
  const up = hasDelta && delta! > 0;
  const flat = hasDelta && delta === 0;
  const deltaColor = flat ? color.textTertiary : up ? direction.up : direction.down;
  const deltaGlyph = flat ? '—' : up ? '▲' : '▼';
  const deltaText = hasDelta ? formatValue(Math.abs(delta!), 'percent') : '';

  return (
    <View
      accessibilityLabel={`${data.label}: ${value}${
        hasDelta ? `, ${up ? 'up' : flat ? 'flat' : 'down'} ${deltaText}` : ''
      }`}
    >
      <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
        {value}
      </Text>
      {hasDelta ? (
        <View style={styles.deltaRow}>
          <Text style={[styles.deltaGlyph, { color: deltaColor }]}>{deltaGlyph}</Text>
          <Text style={[styles.deltaText, { color: deltaColor }]}>{deltaText}</Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  value: { ...type.hero, color: color.textPrimary, marginTop: space.s },
  deltaRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.xs, marginTop: space.xs },
  deltaGlyph: { ...type.micro },
  deltaText: { ...type.caption, fontVariant: ['tabular-nums'] },
});
