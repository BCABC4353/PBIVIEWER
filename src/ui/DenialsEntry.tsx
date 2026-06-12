import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color, space, type } from '../design/tokens';

export const DenialsEntryRow: React.FC<{ onPress?: () => void }> = ({ onPress }) => {
  if (!onPress) return null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Demo: Denials screen"
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <Text style={styles.glyph}>▦</Text>
      <View style={styles.body}>
        <Text style={styles.name}>Denials</Text>
        <Text style={styles.meta}>Demo · Board 11 crosswalk</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
};

export const DenialsEntryButton: React.FC<{ onPress?: () => void }> = ({ onPress }) => {
  if (!onPress) return null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Demo: Denials screen"
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
    >
      <Text style={styles.buttonText}>Demo: Denials</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    minHeight: 44,
    paddingHorizontal: space.l,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hairline,
  },
  rowPressed: { backgroundColor: color.surface2, transform: [{ scale: 0.985 }] },
  glyph: { fontSize: 16, width: 20, textAlign: 'center', color: color.textTertiary },
  body: { flex: 1 },
  name: { ...type.body, color: color.textPrimary },
  meta: { ...type.caption, color: color.textTertiary, marginTop: 2 },
  chevron: { ...type.title, color: color.textTertiary },
  button: {
    marginTop: space.s,
    borderWidth: 1,
    borderColor: color.accent,
    borderRadius: 12,
    paddingHorizontal: space.l,
    paddingVertical: space.s,
    minHeight: 44,
    justifyContent: 'center',
  },
  buttonPressed: { opacity: 0.7 },
  buttonText: { ...type.body, color: color.accent },
});
