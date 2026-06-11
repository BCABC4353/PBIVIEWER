import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { color, space, type } from '../design/tokens';
import type { ReportsModel } from '../core/data-source-factory';
import type { LatestRefresh, ReportRef } from '../core/report-catalog';
import { CanvasDerivationError, type DeriveStep } from '../core/canvas-crosswalk';
import type { CanvasSpec } from '../core/dax';
import { SkeletonPulse } from '../feel/primitives';
import { ReportCanvasScreen } from './ReportCanvasScreen';

export const LiveReportScreen: React.FC<{
  report: ReportRef;
  model: ReportsModel;
  onBack: () => void;
}> = ({ report, model, onBack }) => {
  const [spec, setSpec] = useState<CanvasSpec | null>(null);
  const [error, setError] = useState<{ message: string; apiError: string | null } | null>(null);
  const [step, setStep] = useState<DeriveStep | 'locate'>('model');
  const [dsId, setDsId] = useState<string | undefined>(report.datasetId);
  const [refresh, setRefresh] = useState<LatestRefresh | null | 'pending'>('pending');
  const mountedRef = useRef(true);
  const runIdRef = useRef(0);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const derive = useCallback(async () => {
    const runId = ++runIdRef.current;
    const live = () => mountedRef.current && runIdRef.current === runId;
    setSpec(null);
    setError(null);
    let datasetId = report.datasetId;
    if (!datasetId) {
      setStep('locate');
      try {
        datasetId = (await model.resolveDatasetId(report)) ?? undefined;
      } catch (e) {
        if (!live()) return;
        setError({
          message: "Couldn't reach this report's source workspace to locate its dataset.",
          apiError: e instanceof Error ? e.message : String(e),
        });
        return;
      }
      if (!live()) return;
      if (!datasetId) {
        setError({
          message:
            "This report doesn't expose a dataset the app can query (it may be a paginated report), so it can't be rendered natively.",
          apiError: null,
        });
        return;
      }
      setDsId(datasetId);
    }
    setStep('model');
    const effective = datasetId === report.datasetId ? report : { ...report, datasetId };
    try {
      const s = await model.deriveCanvas(effective, {
        onStep: (st) => {
          if (live()) setStep(st);
        },
      });
      if (live()) setSpec(s);
    } catch (e) {
      if (!live()) return;
      if (e instanceof CanvasDerivationError) {
        setError({
          message:
            "This report's data can't be queried from the app. Reading a dataset needs Build permission — ask whoever shared the report to grant you Build on its dataset.",
          apiError: e.apiError,
        });
      } else {
        setError({
          message: "This report's data can't be queried right now.",
          apiError: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }, [model, report]);

  useEffect(() => {
    void derive();
  }, [derive]);

  useEffect(() => {
    if (!error) return;
    let alive = true;
    setRefresh('pending');
    void model
      .fetchRefresh(dsId ? { ...report, datasetId: dsId } : report)
      .then((r) => {
        if (alive && mountedRef.current) setRefresh(r);
      })
      .catch(() => {
        if (alive && mountedRef.current) setRefresh(null);
      });
    return () => {
      alive = false;
    };
  }, [error, model, report, dsId]);

  const runQuery = useMemo(() => (dsId ? model.makeRunner(dsId) : null), [model, dsId]);

  if (spec && runQuery) {
    return <ReportCanvasScreen spec={spec} runQuery={runQuery} onBack={onBack} />;
  }
  if (error) {
    return (
      <Shell onBack={onBack} title={report.name}>
        <ErrorCard
          error={error}
          refresh={refresh}
          onRetry={() => void derive()}
        />
      </Shell>
    );
  }
  return (
    <Shell onBack={onBack} title={report.name}>
      <Deriving step={step} />
    </Shell>
  );
};

const ErrorCard: React.FC<{
  error: { message: string; apiError: string | null };
  refresh: LatestRefresh | null | 'pending';
  onRetry?: () => void;
}> = ({ error, refresh, onRetry }) => {
  const [showDetails, setShowDetails] = useState(false);
  const httpStatus = error.apiError ? /HTTP (\d{3})/.exec(error.apiError)?.[1] ?? null : null;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>CAN'T SHOW THIS REPORT'S DATA</Text>
      <Text style={styles.cardBody}>{error.message}</Text>
      <Text style={styles.cardMeta}>{refreshLine(refresh)}</Text>
      {error.apiError ? <Text style={styles.cardApi}>Error: {error.apiError}</Text> : null}
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Retry reading the dataset"
          style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
        >
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      ) : null}
      {error.apiError ? (
        <>
          <Pressable
            onPress={() => setShowDetails((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showDetails }}
            accessibilityLabel={showDetails ? 'Hide technical details' : 'Show technical details'}
            style={({ pressed }) => [styles.detailsToggle, pressed && styles.pressed]}
          >
            <Text style={styles.detailsToggleText}>
              {showDetails ? '▾ Technical details' : '▸ Technical details'}
            </Text>
          </Pressable>
          {showDetails ? (
            <Text selectable style={styles.detailsBody}>
              {`HTTP status: ${httpStatus ?? 'n/a'}\n${error.apiError}`}
            </Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
};

function refreshLine(refresh: LatestRefresh | null | 'pending'): string {
  if (refresh === 'pending') return 'Checking the dataset’s refresh status…';
  if (refresh === null) return 'Dataset refresh status unavailable.';
  const when = refresh.endTime ? ` · ${new Date(refresh.endTime).toLocaleString()}` : '';
  return `Latest dataset refresh: ${refresh.status}${when}`;
}

const Shell: React.FC<{ onBack: () => void; title: string; children: React.ReactNode }> = ({
  onBack,
  title,
  children,
}) => (
  <SafeAreaView style={styles.screen}>
    <StatusBar barStyle="light-content" />
    <Pressable onPress={onBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Back to reports">
      <Text style={styles.backText}>‹ Reports</Text>
    </Pressable>
    <ScrollView contentContainerStyle={styles.body} contentInsetAdjustmentBehavior="automatic">
      <Text style={styles.title}>{title}</Text>
      {children}
    </ScrollView>
  </SafeAreaView>
);

const STEP_LINE: Record<DeriveStep | 'locate', string> = {
  locate: 'Locating dataset\u2026',
  model: 'Reading model…',
  visuals: 'Building visuals…',
  stats: 'Reading column statistics…',
};

const Deriving: React.FC<{ step: DeriveStep | 'locate' }> = ({ step }) => (
  <View accessibilityLabel={`Loading report: ${STEP_LINE[step]}`}>
    <Text style={styles.stepLine} accessibilityLiveRegion="polite">
      {STEP_LINE[step]}
    </Text>
    <SkeletonPulse style={styles.skeletonWrap}>
      <View style={styles.skeletonKpiRow}>
        <View style={styles.skeletonKpi} />
        <View style={styles.skeletonKpi} />
      </View>
      <View style={styles.skeletonKpiRow}>
        <View style={styles.skeletonKpi} />
        <View style={styles.skeletonKpi} />
      </View>
      <View style={styles.skeletonCard} />
      <View style={styles.skeletonCard} />
    </SkeletonPulse>
  </View>
);

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.canvas,
    paddingTop: Platform.select({ android: StatusBar.currentHeight ?? 0, default: 0 }),
  },
  back: { paddingHorizontal: space.l, paddingVertical: space.s },
  backText: { ...type.body, color: color.accent },
  body: { paddingHorizontal: space.l, paddingBottom: space.xxl, gap: space.m },
  title: { ...type.title, color: color.textPrimary, marginBottom: space.s },

  card: {
    backgroundColor: color.surface1,
    borderRadius: 16,
    padding: space.m,
    gap: space.s,
    alignItems: 'flex-start',
  },
  cardTitle: { ...type.micro, color: color.textTertiary },
  cardBody: { ...type.body, color: color.textPrimary, lineHeight: 24 },
  cardMeta: { ...type.caption, color: color.textSecondary },
  cardApi: { ...type.caption, color: color.textTertiary },

  stepLine: { ...type.caption, color: color.textSecondary, marginBottom: space.m },
  skeletonWrap: { gap: space.m },
  skeletonKpiRow: { flexDirection: 'row', gap: space.m },
  skeletonKpi: { flex: 1, height: 72, borderRadius: 16, backgroundColor: color.surface1 },
  skeletonCard: { height: 180, borderRadius: 16, backgroundColor: color.surface1 },

  detailsToggle: { minHeight: 44, justifyContent: 'center' },
  detailsToggleText: { ...type.caption, color: color.accent },
  detailsBody: {
    ...type.caption,
    color: color.textTertiary,
    backgroundColor: color.surface2,
    borderRadius: 8,
    padding: space.s,
    alignSelf: 'stretch',
    fontVariant: ['tabular-nums'],
  },
  retry: {
    marginTop: space.s,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.accent,
    borderRadius: 8,
    paddingHorizontal: space.m,
    paddingVertical: space.xs,
  },
  pressed: { backgroundColor: color.surface2 },
  retryText: { ...type.caption, color: color.accent },
});
