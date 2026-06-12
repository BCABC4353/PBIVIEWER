import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { color, space, type } from '../design/tokens';
import type { DataMode, ReportsModel } from '../core/data-source-factory';
import { presentError, type PresentableError } from '../core/error-presenter';
import { thunk } from '../feel/haptics';
import { gateTabBody } from './tab-gate';
import { ErrorState, ListSkeleton, ScreenHeader } from './states';
import {
  defaultExpandedKeys,
  filterCatalogGroups,
  groupKey,
  sortCatalogGroups,
  type ReportCatalogResult,
  type ReportGroup,
  type ReportRef,
} from '../core/report-catalog';

const REPORTS_SUBTITLE = 'Rendered natively — no embedded canvas';

export const ReportsScreen: React.FC<{
  model: ReportsModel | null;
  mode: DataMode;
  onOpen: (report: ReportRef) => void;
  onSignIn: () => void;
}> = ({ model, mode, onOpen, onSignIn }) => {
  const gate = gateTabBody('reports', mode, model !== null);
  if (gate === 'data' && model) {
    return <LiveReportList model={model} onOpen={onOpen} onSignIn={onSignIn} />;
  }
  if (gate === 'sample-reports-card') {
    return (
      <SignedOutCard
        onSignIn={onSignIn}
        title="Sample data has no live reports"
        body="The built-in sample fleet only covers the Fleet and Alerts tabs. Your Power BI apps and workspaces appear here once you're connected."
      />
    );
  }
  return <SignedOutCard onSignIn={onSignIn} />;
};

export const SignedOutCard: React.FC<{
  onSignIn: () => void;
  title?: string;
  body?: string;
  screenTitle?: string;
  screenSubtitle?: string;
}> = ({
  onSignIn,
  title = 'Sign in to see your reports',
  body = "Your Power BI apps and workspaces appear here once you're connected.",
  screenTitle = 'Reports',
  screenSubtitle = REPORTS_SUBTITLE,
}) => (
  <SafeAreaView style={styles.screen}>
    <StatusBar barStyle="light-content" />
    <ScreenHeader title={screenTitle} subtitle={screenSubtitle} />
    <View style={styles.signInWrap}>
      <View style={styles.signInCard}>
        <Text style={styles.signInTitle}>{title}</Text>
        <Text style={styles.signInBody}>{body}</Text>
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
  | {
      kind: 'header';
      key: string;
      sectionKey: string;
      name: string;
      sourceKind: 'app' | 'workspace';
      count: number;
      expanded: boolean;
    }
  | { kind: 'report'; key: string; report: ReportRef };

function flatten(groups: ReportGroup[], expanded: ReadonlySet<string>, filtering: boolean): Row[] {
  const rows: Row[] = [];
  for (const g of groups) {
    const key = groupKey(g);
    const open = filtering || expanded.has(key);
    rows.push({
      kind: 'header',
      key: `h-${key}`,
      sectionKey: key,
      name: g.name,
      sourceKind: g.kind,
      count: g.reports.length,
      expanded: open,
    });
    if (!open) continue;
    for (const r of g.reports) {
      rows.push({ kind: 'report', key: `r-${key}-${r.id}`, report: r });
    }
  }
  return rows;
}

const LiveReportList: React.FC<{
  model: ReportsModel;
  onOpen: (report: ReportRef) => void;
  onSignIn: () => void;
}> = ({ model, onOpen, onSignIn }) => {
  const [result, setResult] = useState<ReportCatalogResult | null>(null);
  const [error, setError] = useState<PresentableError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const expandedSeededRef = useRef(false);

  const load = useCallback(
    async (force: boolean) => {
      setError(null);
      try {
        const r = await model.catalog.listReports(force);
        setResult(r);
        if (!expandedSeededRef.current) {
          expandedSeededRef.current = true;
          setExpanded(defaultExpandedKeys(r.groups));
        }
      } catch (e) {
        setError(presentError(e, 'your reports'));
      }
    },
    [model],
  );

  useEffect(() => {
    setResult(null);
    setQuery('');
    expandedSeededRef.current = false;
    void load(false);
  }, [load]);

  const onRefresh = useCallback(async () => {
    thunk();
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  const toggle = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const sorted = useMemo(() => (result ? sortCatalogGroups(result.groups) : []), [result]);
  const filtering = query.trim() !== '';
  const visible = useMemo(() => filterCatalogGroups(sorted, query), [sorted, query]);
  const rows = result ? flatten(visible, expanded, filtering) : [];

  if (!result && !error) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="light-content" />
        <ScreenHeader title="Reports" subtitle={REPORTS_SUBTITLE} />
        <ListSkeleton rows={6} caption="Loading your reports…" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        contentContainerStyle={rows.length === 0 ? styles.grow : undefined}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={color.accent} />
        }
        ListHeaderComponent={
          <>
            <ScreenHeader title="Reports" subtitle={REPORTS_SUBTITLE} />
            {result ? (
              <View style={styles.searchWrap}>
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search reports and workspaces"
                  placeholderTextColor={color.textTertiary}
                  style={styles.search}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                  selectionColor={color.accent}
                  accessibilityLabel="Search reports and workspaces"
                />
                {query !== '' ? (
                  <Pressable
                    onPress={() => setQuery('')}
                    style={styles.searchClear}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Clear search"
                  >
                    <Text style={styles.searchClearText}>✕</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            {result && result.failedSources.length > 0 ? (
              <Text style={styles.partial}>
                Couldn't read: {result.failedSources.join(', ')}
              </Text>
            ) : null}
            {error && rows.length > 0 ? (
              <Text style={styles.partial} accessibilityLiveRegion="polite">
                Couldn't refresh — {error.title}. Showing the last loaded list.
              </Text>
            ) : null}
          </>
        }
        ListEmptyComponent={
          error ? (
            <ErrorState error={error} onRetry={() => void load(true)} onSignIn={onSignIn} />
          ) : result && filtering ? (
            <View style={styles.stateWrap}>
              <Text style={styles.muted}>Nothing matches “{query.trim()}”.</Text>
            </View>
          ) : (
            <View style={styles.stateWrap}>
              <Text style={styles.muted}>
                No reports yet — nothing has been shared with this account.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) =>
          item.kind === 'header' ? (
            <SectionHeader row={item} onToggle={toggle} filtering={filtering} />
          ) : (
            <ReportRow report={item.report} onOpen={onOpen} />
          )
        }
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      />
    </SafeAreaView>
  );
};

const SectionHeader: React.FC<{
  row: Extract<Row, { kind: 'header' }>;
  onToggle: (key: string) => void;
  filtering: boolean;
}> = ({ row, onToggle, filtering }) => (
  <Pressable
    onPress={() => onToggle(row.sectionKey)}
    disabled={filtering}
    style={({ pressed }) => [styles.groupHeader, pressed && !filtering && styles.rowPressed]}
    accessibilityRole="button"
    accessibilityState={{ expanded: row.expanded }}
    accessibilityLabel={`${row.sourceKind === 'app' ? 'App' : 'Workspace'} ${row.name}, ${row.count} ${
      row.count === 1 ? 'report' : 'reports'
    }, ${row.expanded ? 'expanded' : 'collapsed'}`}
  >
    <Text style={styles.groupChevron}>{row.expanded ? '▾' : '▸'}</Text>
    <Text style={styles.groupName} numberOfLines={1}>
      {row.name}
    </Text>
    <Text style={styles.groupKind}>{row.sourceKind === 'app' ? 'APP' : 'WORKSPACE'}</Text>
    <Text style={styles.groupCount}>{row.count}</Text>
  </Pressable>
);

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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  grow: { flexGrow: 1 },

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
    minHeight: 44,
    justifyContent: 'center',
  },
  signInButtonText: { ...type.body, color: color.accent },
  pressed: { opacity: 0.7 },

  searchWrap: {
    marginHorizontal: space.l,
    marginBottom: space.s,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.surface1,
    borderRadius: 12,
  },
  search: {
    ...type.body,
    color: color.textPrimary,
    flex: 1,
    minHeight: 44,
    paddingHorizontal: space.m,
    paddingVertical: 0,
  },
  searchClear: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchClearText: { ...type.caption, color: color.textTertiary },
  partial: { ...type.caption, color: color.textTertiary, paddingHorizontal: space.l, paddingBottom: space.s },
  stateWrap: { paddingHorizontal: space.l, paddingVertical: space.xl, gap: space.m, alignItems: 'flex-start' },
  muted: { ...type.caption, color: color.textTertiary },

  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
    paddingHorizontal: space.l,
    minHeight: 44,
    marginTop: space.s,
  },
  groupChevron: { ...type.caption, color: color.textTertiary, width: 14, textAlign: 'center' },
  groupName: { ...type.body, color: color.textSecondary, flex: 1 },
  groupKind: { ...type.micro, color: color.textTertiary },
  groupCount: { ...type.micro, color: color.textTertiary, minWidth: 18, textAlign: 'right' },

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
  rowGlyph: { fontSize: 16, width: 20, textAlign: 'center', color: color.textTertiary },
  rowBody: { flex: 1 },
  rowName: { ...type.body, color: color.textPrimary },
  rowMeta: { ...type.caption, color: color.textTertiary, marginTop: 2 },
  rowChevron: { ...type.title, color: color.textTertiary },
});
