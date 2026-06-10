import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList, Platform, Pressable, RefreshControl, SafeAreaView, StatusBar, StyleSheet, Text, View,
} from 'react-native';
import { color, space, type } from '../design/tokens';
import type { DataSource, FleetSnapshot, Refreshable } from '../core/types';
import { sortWorstFirst } from '../core/refresh-health';
import { DetailLine, FleetHero, FleetRow, StatusChip, detailTrigger } from './components';
import { Sparkline } from './Sparkline';
import { SkeletonPulse } from '../feel/primitives';
import { thunk } from '../feel/haptics';
import { relativeAge } from '../core/refresh-health';

export const FleetHealthScreen: React.FC<{ source: DataSource; onOpen: (r: Refreshable) => void }> = ({
  source,
  onOpen,
}) => {
  const [snapshot, setSnapshot] = useState<FleetSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState<{ pct: number; items: number } | null>(null);
  const now = Date.now();

  const load = useCallback(
    async (force: boolean) => {
      setError(null);
      setProgress(null);
      try {
        // Live mode walks workspaces×datasets×refreshes — a long fetch on a
        // real tenant. The source reports each workspace as it lands so the
        // skeleton can say how far along it is instead of sitting mute.
        setSnapshot(
          await source.getFleetSnapshot(force, (pct, items) => setProgress({ pct, items })),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load fleet status');
      } finally {
        setProgress(null);
      }
    },
    [source],
  );

  useEffect(() => {
    // First mount or data source changed: the old rows would be the wrong
    // data, so drop to quiet skeletons while the snapshot is in flight.
    // No ceremony here, ever — the ignition sweep plays once per app launch
    // (IgnitionOverlay in Root), never per screen, never per data source.
    setSnapshot(null);
    void load(false);
  }, [load]);

  const sorted = useMemo(() => (snapshot ? sortWorstFirst(snapshot.refreshables) : []), [snapshot]);
  const broken = sorted.filter(
    (r) => r.lastStatus === 'Failed' || r.lastStatus === 'Cancelled' || r.scheduleOverdue,
  ).length;

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />
      {error ? (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Couldn't read your fleet</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            onPress={() => void load(true)}
            style={styles.retry}
            accessibilityRole="button"
            accessibilityLabel="Retry loading fleet status"
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : !snapshot ? (
        // Loading never blocks: quiet dim blocks mirroring the hero + rows,
        // shimmering as one cheap opacity loop. Never a dial, never a wall.
        // The caption beneath reports REAL progress on long live fetches.
        <FleetSkeleton progress={progress} />
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(r) => `${r.kind}-${r.workspaceId}-${r.id}`}
          ListHeaderComponent={
            <>
              <FleetHero broken={broken} total={sorted.length} generatedAt={snapshot.generatedAt} now={now} />
              {snapshot.partialFailure ? (
                <Text style={styles.partial}>
                  {snapshot.failedWorkspaces.length}{' '}
                  {snapshot.failedWorkspaces.length === 1 ? 'workspace' : 'workspaces'} couldn't be
                  read
                </Text>
              ) : null}
            </>
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.errorText}>
                No refreshable datasets or dataflows in your workspaces yet.
              </Text>
            </View>
          }
          renderItem={({ item }) => <FleetRow item={item} now={now} onPress={() => onOpen(item)} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={color.accent}
              onRefresh={() => {
                thunk(); // the catch — pull-to-refresh engages with weight
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

/**
 * The fleet's loading face: dim surface blocks in the exact shape of the
 * content (hero number, hero label, rows), pulsed by ONE animated node.
 * Reduce Motion → the same blocks, perfectly still.
 */
const FleetSkeleton: React.FC<{ progress: { pct: number; items: number } | null }> = ({
  progress,
}) => (
  <View style={styles.skeleton}>
    <SkeletonPulse>
      <View style={styles.skeletonHero} />
      <View style={styles.skeletonHeroLabel} />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={styles.skeletonRow} />
      ))}
    </SkeletonPulse>
    <Text style={styles.skeletonCaption} accessibilityLiveRegion="polite">
      {progress
        ? `Reading workspaces — ${Math.round(progress.pct * 100)}% · ${progress.items} item${
            progress.items === 1 ? '' : 's'
          } found`
        : 'Reading your tenant…'}
    </Text>
  </View>
);

export const RefreshDetailScreen: React.FC<{ item: Refreshable; onBack: () => void }> = ({ item, onBack }) => {
  const now = Date.now();
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <Pressable onPress={onBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Back">
        <Text style={styles.backText}>‹ Fleet</Text>
      </Pressable>
      <View style={styles.detailHeader}>
        <Text style={styles.detailTitle}>{item.name}</Text>
        <Text style={styles.detailSub}>
          {item.workspaceName} · {item.kind}
        </Text>
        <View style={{ marginTop: space.m }}>
          <StatusChip status={item.lastStatus} overdue={item.scheduleOverdue} />
        </View>
      </View>
      <View style={styles.detailBody}>
        <DetailLine label="Last success" value={item.lastSuccessTime ? relativeAge(item.lastSuccessTime, now) : '—'} />
        <DetailLine label="Last attempt" value={item.lastAttemptTime ? relativeAge(item.lastAttemptTime, now) : '—'} />
        {item.kind === 'dataset' ? <DetailLine label="Trigger" value={detailTrigger(item.lastRefreshType)} /> : null}
        <DetailLine label="Schedule" value={item.scheduleSummary} />
        <DetailLine label="Owner" value={item.configuredBy} />
        <DetailLine label="Error" value={item.errorCode} tone={color.broken} />
        {item.recentDurationsMin ? (
          <Sparkline values={item.recentDurationsMin} label="Refresh duration — recent runs" />
        ) : null}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.canvas,
    // SafeAreaView is iOS-only; on Android the first render would slide
    // under the status bar without this.
    paddingTop: Platform.select({ android: StatusBar.currentHeight ?? 0, default: 0 }),
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.m, padding: space.l },
  errorTitle: { ...type.body, color: color.textPrimary, fontWeight: '600', textAlign: 'center' },
  errorText: { ...type.body, color: color.textSecondary, textAlign: 'center' },
  partial: { ...type.caption, color: color.textTertiary, textAlign: 'center', paddingBottom: space.m },
  skeletonCaption: { ...type.caption, color: color.textTertiary, textAlign: 'center', paddingVertical: space.m },
  retry: { borderWidth: 1, borderColor: color.accent, borderRadius: 12, paddingHorizontal: space.l, paddingVertical: space.s },
  retryText: { ...type.body, color: color.accent },

  // Skeletons mirror the real layout: centered hero block, then row blocks.
  skeleton: { flex: 1, paddingHorizontal: space.l },
  skeletonHero: {
    alignSelf: 'center', width: 96, height: 56, borderRadius: 12,
    backgroundColor: color.surface1, marginTop: space.xl,
  },
  skeletonHeroLabel: {
    alignSelf: 'center', width: 180, height: 13, borderRadius: 7,
    backgroundColor: color.surface1, marginTop: space.s, marginBottom: space.xl,
  },
  skeletonRow: { height: 52, borderRadius: 12, backgroundColor: color.surface1, marginBottom: space.m },

  back: { paddingHorizontal: space.l, paddingVertical: space.s },
  backText: { ...type.body, color: color.accent },
  detailHeader: { paddingHorizontal: space.l, paddingTop: space.m },
  detailTitle: { ...type.title, color: color.textPrimary },
  detailSub: { ...type.caption, color: color.textTertiary, marginTop: 4 },
  detailBody: { paddingHorizontal: space.l, marginTop: space.l },
});
