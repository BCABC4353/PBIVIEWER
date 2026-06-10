import React, { useCallback, useEffect, useState } from 'react';
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
import { color, space, type } from '../design/tokens';
import type { ReportsModel } from '../core/data-source-factory';
import type { ReportCatalogResult, ReportRef } from '../core/report-catalog';

/**
 * Reports — the signed-in user's REAL Power BI reports, apps first, then
 * workspaces. There is no sample data here: signed out, the tab holds one
 * quiet card with the sign-in action; signed in, every row is a live report
 * whose canvas is derived from its dataset. The list is quiet; the canvases
 * carry the show.
 */
export const ReportsScreen: React.FC<{
  /** Null = not signed in (mock mode) — show only the sign-in card. */
  model: ReportsModel | null;
  onOpen: (report: ReportRef) => void;
  /** Takes the user to the Settings sign-in flow. */
  onSignIn: () => void;
}> = ({ model, onOpen, onSignIn }) =>
  model ? <LiveReportList model={model} onOpen={onOpen} /> : <SignedOutCard onSignIn={onSignIn} />;

/** Signed out: one quiet card, sign-in right there. Nothing fake to browse. */
const SignedOutCard: React.FC<{ onSignIn: () => void }> = ({ onSignIn }) => (
  <SafeAreaView style={styles.screen}>
    <StatusBar barStyle="light-content" />
    <Header />
    <View style={styles.signInWrap}>
      <View style={styles.signInCard}>
        <Text style={styles.signInTitle}>Sign in to see your reports</Text>
        <Text style={styles.signInBody}>
          Your Power BI apps and workspaces appear here once you're connected.
        </Text>
        <Pressable
          onPress={onSignIn}
          accessibilityRole="button"
          accessibilityLabel="Connect to Power BI"
          style={({ pressed }) => [styles.signInButton, pressed && styles.pressed]}
        >
          <Text style={styles.signInButtonText}>Connect to Power BI</Text>
        </Pressable>
      </View>
    </View>
  </SafeAreaView>
);

type Row =
  | { kind: 'header'; key: string; name: string; sourceKind: 'app' | 'workspace' }
  | { kind: 'report'; key: string; report: ReportRef };

function flatten(result: ReportCatalogResult): Row[] {
  const rows: Row[] = [];
  for (const g of result.groups) {
    rows.push({ kind: 'header', key: `h-${g.kind}-${g.id}`, name: g.name, sourceKind: g.kind });
    for (const r of g.reports) {
      rows.push({ kind: 'report', key: `r-${g.id}-${r.id}`, report: r });
    }
  }
  return rows;
}

const LiveReportList: React.FC<{
  model: ReportsModel;
  onOpen: (report: ReportRef) => void;
}> = ({ model, onOpen }) => {
  const [result, setResult] = useState<ReportCatalogResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (force: boolean) => {
      setError(null);
      try {
        const r = await model.catalog.listReports(force);
        setResult(r);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load reports');
      }
    },
    [model],
  );

  useEffect(() => {
    setResult(null);
    void load(false);
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  const rows = result ? flatten(result) : [];

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={color.accent} />
        }
        ListHeaderComponent={
          <>
            <Header />
            {result && result.failedSources.length > 0 ? (
              <Text style={styles.partial}>
                Couldn't read: {result.failedSources.join(', ')}
              </Text>
            ) : null}
          </>
        }
        ListEmptyComponent={
          error ? (
            <View style={styles.stateWrap}>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable
                onPress={() => void load(true)}
                accessibilityRole="button"
                accessibilityLabel="Retry loading reports"
                style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
              >
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          ) : result ? (
            <View style={styles.stateWrap}>
              <Text style={styles.muted}>
                No reports yet — nothing has been shared with this account.
              </Text>
            </View>
          ) : (
            <View style={styles.stateWrap}>
              <Text style={styles.muted}>Loading your reports…</Text>
            </View>
          )
        }
        renderItem={({ item }) =>
          item.kind === 'header' ? (
            <View style={styles.groupHeader}>
              <Text style={styles.groupName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.groupKind}>
                {item.sourceKind === 'app' ? 'APP' : 'WORKSPACE'}
              </Text>
            </View>
          ) : (
            <ReportRow report={item.report} onOpen={onOpen} />
          )
        }
        contentInsetAdjustmentBehavior="automatic"
      />
    </SafeAreaView>
  );
};

const ReportRow: React.FC<{ report: ReportRef; onOpen: (r: ReportRef) => void }> = ({
  report,
  onOpen,
}) => (
  <Pressable
    onPress={() => onOpen(report)}
    style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    accessibilityRole="button"
    accessibilityLabel={`Open report ${report.name} from ${report.sourceName}`}
  >
    <Text style={styles.rowGlyph}>▦</Text>
    <View style={styles.rowBody}>
      <Text style={styles.rowName} numberOfLines={1}>
        {report.name}
      </Text>
      <Text style={styles.rowMeta} numberOfLines={1}>
        {report.sourceName}
        {report.datasetId ? '' : ' · no queryable dataset'}
      </Text>
    </View>
    <Text style={styles.rowChevron}>›</Text>
  </Pressable>
);

const Header: React.FC = () => (
  <View style={styles.header}>
    <Text style={styles.title}>Reports</Text>
    <Text style={styles.subtitle}>Rendered natively — no embedded canvas</Text>
  </View>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  header: { paddingHorizontal: space.l, paddingTop: space.m, paddingBottom: space.l },
  title: { ...type.title, color: color.textPrimary },
  subtitle: { ...type.caption, color: color.textTertiary, marginTop: 4 },

  // Signed-out card
  signInWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: space.l, paddingBottom: space.xxl },
  signInCard: {
    backgroundColor: color.surface1,
    borderRadius: 16,
    padding: space.l,
    alignItems: 'flex-start',
    gap: space.s,
  },
  signInTitle: { ...type.body, fontWeight: '600', color: color.textPrimary },
  signInBody: { ...type.caption, color: color.textSecondary, lineHeight: 18 },
  signInButton: {
    marginTop: space.s,
    borderWidth: 1,
    borderColor: color.accent,
    borderRadius: 12,
    paddingHorizontal: space.l,
    paddingVertical: space.s,
  },
  signInButtonText: { ...type.body, color: color.accent },
  pressed: { opacity: 0.7 },

  // Live list
  partial: { ...type.caption, color: color.textTertiary, paddingHorizontal: space.l, paddingBottom: space.s },
  stateWrap: { paddingHorizontal: space.l, paddingVertical: space.xl, gap: space.m, alignItems: 'flex-start' },
  muted: { ...type.caption, color: color.textTertiary },
  errorText: { ...type.caption, color: color.textSecondary },
  retry: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.accent,
    borderRadius: 8,
    paddingHorizontal: space.m,
    paddingVertical: space.xs,
  },
  retryText: { ...type.caption, color: color.accent },

  groupHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: space.l,
    paddingTop: space.l,
    paddingBottom: space.s,
  },
  groupName: { ...type.micro, color: color.textTertiary, flexShrink: 1 },
  groupKind: { ...type.micro, color: color.textTertiary },

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
