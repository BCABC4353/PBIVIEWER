import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Platform,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { color, space, type } from '../design/tokens';
import type { DataSource, FleetSnapshot, Refreshable } from '../core/types';
import { sortWorstFirst } from '../core/refresh-health';
import { presentError, type PresentableError } from '../core/error-presenter';
import { groupFleetByWorkspace, type WorkspaceTile } from '../core/workspace-tiles';
import { FleetHero } from './components';
import { BlastSheet, WorkspaceTileCard, type FrameRect } from './BlastRadius';
import { ErrorState } from './states';
import { SkeletonPulse } from '../feel/primitives';
import { thunk } from '../feel/haptics';

export const FleetHealthScreen: React.FC<{
  source: DataSource;
  sample?: boolean;
  onOpen: (r: Refreshable) => void;
  onSignIn?: () => void;
}> = ({ source, sample, onOpen, onSignIn }) => {
  const [snapshot, setSnapshot] = useState<FleetSnapshot | null>(null);
  const [error, setError] = useState<PresentableError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState<{ pct: number; items: number } | null>(null);
  const [expanded, setExpanded] = useState<{
    tile: WorkspaceTile;
    origin: FrameRect;
    host: { width: number; height: number };
  } | null>(null);
  const hostRef = useRef<View>(null);
  const runIdRef = useRef(0);
  const now = Date.now();

  const load = useCallback(
    async (force: boolean) => {
      const runId = ++runIdRef.current;
      const live = () => runIdRef.current === runId;
      setError(null);
      setProgress(null);
      try {
        const snap = await source.getFleetSnapshot(force, (pct, items) => {
          if (live()) setProgress({ pct, items });
        });
        if (live()) setSnapshot(snap);
      } catch (e) {
        if (live()) setError(presentError(e, 'your fleet'));
      } finally {
        if (live()) setProgress(null);
      }
    },
    [source],
  );

  useEffect(() => {
    setSnapshot(null);
    void load(false);
  }, [load]);

  const sorted = useMemo(() => (snapshot ? sortWorstFirst(snapshot.refreshables) : []), [snapshot]);
  const broken = sorted.filter(
    (r) => r.lastStatus === 'Failed' || r.lastStatus === 'Cancelled' || r.scheduleOverdue,
  ).length;

  const tiles = useMemo(
    () => (snapshot ? groupFleetByWorkspace(snapshot.refreshables) : []),
    [snapshot],
  );

  useEffect(() => {
    setExpanded(null);
  }, [snapshot]);

  const expandTile = useCallback((tile: WorkspaceTile, windowFrame: FrameRect) => {
    const host = hostRef.current;
    if (!host) return;
    host.measureInWindow((hx, hy, hw, hh) => {
      setExpanded({
        tile,
        origin: { x: windowFrame.x - hx, y: windowFrame.y - hy, width: windowFrame.width, height: windowFrame.height },
        host: { width: hw, height: hh },
      });
    });
  }, []);

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />
      {error && !snapshot ? (
        <ErrorState error={error} onRetry={() => void load(true)} onSignIn={onSignIn} />
      ) : !snapshot ? (
        <FleetSkeleton progress={progress} />
      ) : (
        <View ref={hostRef} collapsable={false} style={styles.host}>
          <FlatList
            data={tiles}
            keyExtractor={(t) => t.workspaceId}
            ListHeaderComponent={
              <>
                <FleetHero
                  broken={broken}
                  total={sorted.length}
                  generatedAt={snapshot.generatedAt}
                  now={now}
                  sample={sample}
                />
                {snapshot.partialFailure ? (
                  <Text style={styles.partial}>
                    {snapshot.failedWorkspaces.length}{' '}
                    {snapshot.failedWorkspaces.length === 1 ? 'workspace' : 'workspaces'} couldn't be
                    read
                  </Text>
                ) : null}
                {error ? (
                  <Text style={styles.partial} accessibilityLiveRegion="polite">
                    Couldn't refresh — {error.title}. Showing the last loaded snapshot.
                  </Text>
                ) : null}
              </>
            }
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={styles.emptyText}>
                  No refreshable datasets or dataflows in your workspaces yet.
                </Text>
              </View>
            }
            renderItem={({ item }) => <WorkspaceTileCard tile={item} onExpand={expandTile} />}
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
          {expanded ? (
            <BlastSheet
              tile={expanded.tile}
              origin={expanded.origin}
              host={expanded.host}
              now={now}
              onClose={() => setExpanded(null)}
              onOpenItem={onOpen}
            />
          ) : null}
        </View>
      )}
    </SafeAreaView>
  );
};

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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.canvas,
    paddingTop: Platform.select({ android: StatusBar.currentHeight ?? 0, default: 0 }),
  },
  host: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.m, padding: space.l },
  emptyText: { ...type.body, color: color.textSecondary, textAlign: 'center' },
  partial: { ...type.caption, color: color.textTertiary, textAlign: 'center', paddingBottom: space.m },
  skeletonCaption: { ...type.caption, color: color.textTertiary, textAlign: 'center', paddingVertical: space.m },

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
});
