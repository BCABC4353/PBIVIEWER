import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { color, space, statusColor, statusGlyph, statusLabel, type } from '../design/tokens';
import type { DataSource, FleetSnapshot, Refreshable } from '../core/types';
import { relativeAge, statusOrder } from '../core/refresh-health';

/** Why an item is in the feed — one quiet sentence per alert. */
function alertReason(r: Refreshable): string {
  if (r.lastStatus === 'Failed') return r.errorCode ?? 'Refresh failed';
  if (r.lastStatus === 'Cancelled') return 'Refresh cancelled';
  if (r.lastStatus === 'Never') return 'Never refreshed';
  if (r.scheduleOverdue) return `Overdue${r.scheduleSummary ? ` · ${r.scheduleSummary}` : ''}`;
  return statusLabel[r.lastStatus];
}

const isAlert = (r: Refreshable): boolean =>
  r.lastStatus === 'Failed' ||
  r.lastStatus === 'Cancelled' ||
  r.lastStatus === 'Never' ||
  r.scheduleOverdue === true;

/** Worst first (core ordering), newest first within the same severity band. */
function sortAlerts(items: Refreshable[]): Refreshable[] {
  return [...items].sort((a, b) => {
    const s = statusOrder[a.lastStatus] - statusOrder[b.lastStatus];
    if (s !== 0) return s;
    const at = a.lastAttemptTime ? Date.parse(a.lastAttemptTime) : 0;
    const bt = b.lastAttemptTime ? Date.parse(b.lastAttemptTime) : 0;
    if (bt !== at) return bt - at;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Alert feed derived from the fleet snapshot — Failed / Cancelled / Overdue /
 * Never-run items, worst and newest first. The empty state is the point:
 * quiet means healthy.
 */
export const AlertsScreen: React.FC<{
  source: DataSource;
  onOpen?: (item: Refreshable) => void;
}> = ({ source, onOpen }) => {
  const [snapshot, setSnapshot] = useState<FleetSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const now = Date.now();

  const load = useCallback(
    async (force: boolean) => {
      setError(null);
      try {
        setSnapshot(await source.getFleetSnapshot(force));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load alerts');
      }
    },
    [source],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const alerts = useMemo(
    () => (snapshot ? sortAlerts(snapshot.refreshables.filter(isAlert)) : []),
    [snapshot],
  );

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />
      {error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void load(true)} style={styles.retry}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : !snapshot ? (
        <View style={styles.center}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.skeletonRow} />
          ))}
        </View>
      ) : alerts.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.clearGlyph} accessibilityElementsHidden>
            ●
          </Text>
          <Text style={styles.clearTitle} accessibilityLabel="All clear, no alerts">
            All clear
          </Text>
          <Text style={styles.clearMeta}>
            No failed, overdue, or never-run refreshables · checked{' '}
            {relativeAge(snapshot.generatedAt, now) || 'just now'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={alerts}
          keyExtractor={(r) => `${r.kind}-${r.workspaceId}-${r.id}`}
          ListHeaderComponent={
            <View style={styles.header}>
              <Text style={styles.title}>Alerts</Text>
              <Text style={styles.subtitle}>
                {alerts.length} need{alerts.length === 1 ? 's' : ''} attention
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={onOpen ? () => onOpen(item) : undefined}
              disabled={!onOpen}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              accessibilityRole="button"
              accessibilityLabel={`${item.name}, ${statusLabel[item.lastStatus]}${
                item.scheduleOverdue ? ', overdue' : ''
              }, ${item.workspaceName}`}
            >
              <Text style={[styles.rowGlyph, { color: statusColor[item.lastStatus] }]}>
                {statusGlyph[item.lastStatus]}
              </Text>
              <View style={styles.rowBody}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {alertReason(item)} · {item.workspaceName}
                </Text>
              </View>
              <Text style={styles.rowAge}>
                {item.lastAttemptTime ? relativeAge(item.lastAttemptTime, now) : '—'}
              </Text>
            </Pressable>
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={color.accent}
              onRefresh={() => {
                setRefreshing(true);
                void load(true).finally(() => setRefreshing(false));
              }}
            />
          }
          contentInsetAdjustmentBehavior="automatic"
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.s, padding: space.l },
  errorText: { ...type.body, color: color.textSecondary, textAlign: 'center' },
  retry: {
    borderWidth: 1,
    borderColor: color.accent,
    borderRadius: 12,
    paddingHorizontal: space.l,
    paddingVertical: space.s,
    marginTop: space.s,
  },
  retryText: { ...type.body, color: color.accent },
  skeletonRow: { width: '88%', height: 52, borderRadius: 12, backgroundColor: color.surface1, opacity: 0.5, marginVertical: 6 },

  clearGlyph: { ...type.title, color: color.ok },
  clearTitle: { ...type.title, color: color.textPrimary },
  clearMeta: { ...type.caption, color: color.textTertiary, textAlign: 'center' },

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
  rowGlyph: { fontSize: 16, width: 20, textAlign: 'center' },
  rowBody: { flex: 1 },
  rowName: { ...type.body, color: color.textPrimary },
  rowMeta: { ...type.caption, color: color.textTertiary, marginTop: 2 },
  rowAge: { ...type.caption, color: color.textTertiary, fontVariant: ['tabular-nums'] },
});
