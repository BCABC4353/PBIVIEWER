import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList, Pressable, RefreshControl, SafeAreaView, StatusBar, StyleSheet, Text, View,
} from 'react-native';
import { color, space, type } from '../design/tokens';
import type { DataSource, FleetSnapshot, Refreshable } from '../core/types';
import { sortWorstFirst } from '../core/refresh-health';
import { DetailLine, FleetHero, FleetRow, StatusChip, detailTrigger } from './components';
import { Sparkline } from './Sparkline';
import { IgnitionSweep } from '../feel/IgnitionSweep';
import { thunk } from '../feel/haptics';
import { relativeAge } from '../core/refresh-health';

export const FleetHealthScreen: React.FC<{ source: DataSource; onOpen: (r: Refreshable) => void }> = ({
  source,
  onOpen,
}) => {
  const [snapshot, setSnapshot] = useState<FleetSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Ignition Sweep state: real progress only (0 → 1 on the API answering);
  // settled flips when the arc lands (clean) or catches (failure present).
  const [ignition, setIgnition] = useState({ progress: 0, items: 0, failed: false, settled: false });
  const now = Date.now();

  const load = useCallback(
    async (force: boolean) => {
      setError(null);
      try {
        const snap = await source.getFleetSnapshot(force);
        const failed = snap.refreshables.some(
          (r) => r.lastStatus === 'Failed' || r.lastStatus === 'Cancelled' || r.scheduleOverdue,
        );
        setSnapshot(snap);
        setIgnition((i) =>
          i.settled ? i : { progress: 1, items: snap.refreshables.length, failed, settled: false },
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load fleet status');
      }
    },
    [source],
  );

  useEffect(() => {
    // New data source → fresh ignition.
    setSnapshot(null);
    setIgnition({ progress: 0, items: 0, failed: false, settled: false });
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
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void load(true)} style={styles.retry}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : !snapshot || !ignition.settled ? (
        <View style={styles.center}>
          {/* The Ignition Sweep — the gauge-needle ritual. Ticks are REAL API
              responses; on failure the arc catches and the board opens on red. */}
          <IgnitionSweep
            progress={ignition.progress}
            itemsChecked={ignition.items}
            failed={ignition.failed}
            onSettled={() => setIgnition((i) => ({ ...i, settled: true }))}
            onCaught={() => setIgnition((i) => ({ ...i, settled: true }))}
          />
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(r) => `${r.kind}-${r.workspaceId}-${r.id}`}
          ListHeaderComponent={
            <FleetHero broken={broken} total={sorted.length} generatedAt={snapshot.generatedAt} now={now} />
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
  screen: { flex: 1, backgroundColor: color.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.m, padding: space.l },
  errorText: { ...type.body, color: color.textSecondary, textAlign: 'center' },
  retry: { borderWidth: 1, borderColor: color.accent, borderRadius: 12, paddingHorizontal: space.l, paddingVertical: space.s },
  retryText: { ...type.body, color: color.accent },
  skeletonRow: { width: '88%', height: 52, borderRadius: 12, backgroundColor: color.surface1, opacity: 0.5, marginVertical: 6 },

  back: { paddingHorizontal: space.l, paddingVertical: space.s },
  backText: { ...type.body, color: color.accent },
  detailHeader: { paddingHorizontal: space.l, paddingTop: space.m },
  detailTitle: { ...type.title, color: color.textPrimary },
  detailSub: { ...type.caption, color: color.textTertiary, marginTop: 4 },
  detailBody: { paddingHorizontal: space.l, marginTop: space.l },
});
