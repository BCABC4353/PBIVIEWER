import React from 'react';
import { FlatList, Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { color, space, type } from '../design/tokens';
import { DEMO_CANVASES, type DemoCanvas } from '../visuals/demo-canvases';

/**
 * Report canvases — pages of Power BI DATA rendered with the app's own
 * visuals. The list is quiet; the canvases carry the show.
 */
export const ReportsScreen: React.FC<{
  onOpen: (canvas: DemoCanvas) => void;
  canvases?: readonly DemoCanvas[];
}> = ({ onOpen, canvases = DEMO_CANVASES }) => (
  <SafeAreaView style={styles.screen}>
    <StatusBar barStyle="light-content" />
    <FlatList
      data={[...canvases]}
      keyExtractor={(c) => c.id}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.title}>Reports</Text>
          <Text style={styles.subtitle}>Rendered natively — no embedded canvas</Text>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => onOpen(item)}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          accessibilityRole="button"
          accessibilityLabel={`Open report ${item.spec.title}, ${item.spec.visuals.length} visuals`}
        >
          <Text style={styles.rowGlyph}>▦</Text>
          <View style={styles.rowBody}>
            <Text style={styles.rowName} numberOfLines={1}>
              {item.spec.title}
            </Text>
            <Text style={styles.rowMeta} numberOfLines={1}>
              {item.subtitle} · {item.spec.visuals.length} visuals
            </Text>
          </View>
          <Text style={styles.rowChevron}>›</Text>
        </Pressable>
      )}
      contentInsetAdjustmentBehavior="automatic"
    />
  </SafeAreaView>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  header: { paddingHorizontal: space.l, paddingTop: space.m, paddingBottom: space.l },
  title: { ...type.title, color: color.textPrimary },
  subtitle: { ...type.caption, color: color.textTertiary, marginTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    paddingHorizontal: space.l,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },
  rowPressed: { backgroundColor: color.surface2, transform: [{ scale: 0.985 }] },
  rowGlyph: { fontSize: 16, width: 20, textAlign: 'center', color: color.textTertiary },
  rowBody: { flex: 1 },
  rowName: { ...type.body, color: color.textPrimary },
  rowMeta: { ...type.caption, color: color.textTertiary, marginTop: 2 },
  rowChevron: { ...type.title, color: color.textTertiary },
});
