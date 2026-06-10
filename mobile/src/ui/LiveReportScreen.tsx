import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
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
import { CanvasDerivationError } from '../core/canvas-crosswalk';
import type { CanvasSpec } from '../core/dax';
import { ReportCanvasScreen } from './ReportCanvasScreen';

/**
 * One REAL report. Derives a CanvasSpec from the report's dataset (crosswalk
 * v1), then hands the existing ReportCanvasScreen a live executeDax runner.
 * When the dataset can't be queried, this screen says so honestly: what
 * happened, the dataset's latest refresh status, and the exact API error —
 * never fake data, never a blank screen.
 */
export const LiveReportScreen: React.FC<{
  report: ReportRef;
  model: ReportsModel;
  onBack: () => void;
}> = ({ report, model, onBack }) => {
  const [spec, setSpec] = useState<CanvasSpec | null>(null);
  const [error, setError] = useState<{ message: string; apiError: string | null } | null>(null);
  const [refresh, setRefresh] = useState<LatestRefresh | null | 'pending'>('pending');
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  const derive = useCallback(async () => {
    setSpec(null);
    setError(null);
    if (!report.datasetId) {
      setError({
        message:
          "This report doesn't expose a dataset the app can query (it may be a paginated report), so it can't be rendered natively.",
        apiError: null,
      });
      return;
    }
    try {
      const s = await model.deriveCanvas(report);
      if (mountedRef.current) setSpec(s);
    } catch (e) {
      if (!mountedRef.current) return;
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

  // Refresh status rides along on the explanation card — best-effort only.
  useEffect(() => {
    if (!error) return;
    let alive = true;
    setRefresh('pending');
    void model
      .fetchRefresh(report)
      .then((r) => {
        if (alive && mountedRef.current) setRefresh(r);
      })
      .catch(() => {
        if (alive && mountedRef.current) setRefresh(null);
      });
    return () => {
      alive = false;
    };
  }, [error, model, report]);

  const runQuery = useMemo(
    () => (report.datasetId ? model.makeRunner(report.datasetId) : null),
    [model, report.datasetId],
  );

  if (spec && runQuery) {
    return <ReportCanvasScreen spec={spec} runQuery={runQuery} onBack={onBack} />;
  }
  if (error) {
    return (
      <Shell onBack={onBack} title={report.name}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>CAN'T SHOW THIS REPORT'S DATA</Text>
          <Text style={styles.cardBody}>{error.message}</Text>
          <Text style={styles.cardMeta}>{refreshLine(refresh)}</Text>
          {error.apiError ? <Text style={styles.cardApi}>API error: {error.apiError}</Text> : null}
          {report.datasetId ? (
            <Pressable
              onPress={() => void derive()}
              accessibilityRole="button"
              accessibilityLabel="Retry reading the dataset"
              style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
            >
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          ) : null}
        </View>
      </Shell>
    );
  }
  return (
    <Shell onBack={onBack} title={report.name}>
      <Deriving />
    </Shell>
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

/** Quiet breathing skeleton while the model is being read — never a spinner. */
const Deriving: React.FC = () => {
  const breathe = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 0.7, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0.35, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breathe]);
  return (
    <View style={styles.card} accessibilityLabel="Reading the dataset model">
      <Text style={styles.cardMeta}>Reading the dataset model…</Text>
      <Animated.View style={[styles.skeleton, { opacity: breathe }]} />
    </View>
  );
};

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
  skeleton: { height: 96, alignSelf: 'stretch', borderRadius: 8, backgroundColor: color.surface2 },
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
