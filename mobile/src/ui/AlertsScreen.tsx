import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { itemRank } from '../core/refresh-health';
import { presentError, type PresentableError } from '../core/error-presenter';
import { thunk } from '../feel/haptics';
import { ErrorState, ListSkeleton, ScreenHeader } from './states';
import { Timestamp } from './Timestamp';

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

function sortAlerts(items: Refreshable[]): Refreshable[] {
  return [...items].sort((a, b) => {
    const s = itemRank(a) - itemRank(b);
    if (s !== 0) return s;
    const at = a.lastAttemptTime ? Date.parse(a.lastAttemptTime) : 0;
    const bt = b.lastAttemptTime ? Date.parse(b.lastAttemptTime) : 0;
    if (bt !== at) return bt - at;
    return a.name.localeCompare(b.name);
  });
}

export const AlertsScreen: React.FC<{
  source: DataSource;
  onOpen?: (item: Refreshable) => void;
  onSignIn?: () => void;
}> = ({ source, onOpen, onSignIn }) => {
  const [snapshot, setSnapshot] = useState<FleetSnapshot | null>(null);
  const [error, setError] = useState<PresentableError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const runIdRef = useRef(0);
  const now = Date.now();

  const load = useCallback(
    async (force: boolean) => {
      const runId = ++runIdRef.current;
      const live = () => runIdRef.current === runId;
      setError(null);
      try {
        const snap = await source.getFleetSnapshot(force);
        if (live()) setSnapshot(snap);
      } catch (e) {
        if (live()) setError(presentError(e, 'alerts'));
      }
    },
    [source],
  );

  useEffect(() => {
    setSnapshot(null);
    void load(false);
  }, [load]);

  const alerts = useMemo(
    () => (snapshot ? sortAlerts(snapshot.refreshables.filter(isAlert)) : []),
    [snapshot],
  );

  if (error && !snapshot) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="light-content" />
        <ErrorState error={error} onRetry={() => void load(true)} onSignIn={onSignIn} />
      </SafeAreaView>
    );
  }

  if (!snapshot) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="light-content" />
        <ScreenHeader title="Alerts" />
        <ListSkeleton rows={3} caption="Checking your fleet…" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <FlatList
        data={alerts}
        keyExtractor={(r) => `${r.kind}-${r.workspaceId}-${r.id}`}
        contentContainerStyle={alerts.length === 0 ? styles.grow : undefined}
        ListHeaderComponent={
          <>
            {alerts.length > 0 ? (
              <ScreenHeader
                title="Alerts"
                subtitle={`${alerts.length} need${alerts.length === 1 ? 's' : ''} attention`}
              />
            ) : null}
            {error ? (
              <Text style={styles.partial} accessibilityLiveRegion="polite">
                Couldn't refresh — {error.title}. Showing the last loaded alerts.
              </Text>
            ) : null}
          </>
        }
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.clearGlyph} accessibilityElementsHidden>
              ●
            </Text>
            <Text style={styles.clearTitle} accessibilityLabel="All clear, no alerts">
              All clear
            </Text>
            <Text style={styles.clearMeta}>
              No failed, overdue, or never-run refreshables ·{' '}
              <Timestamp iso={snapshot.generatedAt} now={now} prefix="checked " style={styles.clearMeta} />
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
            <Timestamp iso={item.lastAttemptTime} now={now} style={styles.rowAge} />
          </Pressable>
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={color.accent}
            onRefresh={() => {
              thunk();
              setRefreshing(true);
              void load(true).finally(() => setRefreshing(false));
            }}
          />
        }
        contentInsetAdjustmentBehavior="automatic"
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  grow: { flexGrow: 1 },
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: space.s, padding: space.l },

  partial: { ...type.caption, color: color.textTertiary, textAlign: 'center', paddingHorizontal: space.l, paddingBottom: space.s },
  clearGlyph: { ...type.title, color: color.ok },
  clearTitle: { ...type.title, color: color.textPrimary },
  clearMeta: { ...type.caption, color: color.textTertiary, textAlign: 'center' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    minHeight: 44,
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
