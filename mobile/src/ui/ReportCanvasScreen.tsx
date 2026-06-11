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
  useWindowDimensions,
} from 'react-native';
import { color, space, type } from '../design/tokens';
import {
  shapeForVisual,
  type CanvasSpec,
  type QueryResult,
  type VisualSpec,
} from '../core/dax';
import { presentError } from '../core/error-presenter';
import { motionEnabled } from '../feel/springs';
import { BarChart, DataTable, DonutChart, KpiTile, LineChart, VisualCard } from '../visuals';

export const ReportCanvasScreen: React.FC<{
  spec: CanvasSpec;
  runQuery: (dax: string) => Promise<QueryResult>;
  onBack: () => void;
}> = ({ spec, runQuery, onBack }) => {
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const kpis = useMemo(() => spec.visuals.filter((v) => v.kind === 'kpi'), [spec]);
  const others = useMemo(() => spec.visuals.filter((v) => v.kind !== 'kpi'), [spec]);

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <Pressable onPress={onBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Back to reports">
        <Text style={styles.backText}>‹ Reports</Text>
      </Pressable>
      <ScrollView contentContainerStyle={styles.canvas} contentInsetAdjustmentBehavior="automatic">
        <Text style={styles.title}>{spec.title}</Text>
        {kpis.length > 0 ? (
          <View style={styles.kpiRow}>
            {kpis.map((v, i) => (
              <CanvasVisual
                key={v.title}
                visual={v}
                runQuery={runQuery}
                index={i}
                style={landscape ? styles.kpiTileLandscape : styles.kpiTile}
              />
            ))}
          </View>
        ) : null}
        <View style={landscape ? styles.visualsGridLandscape : styles.visualsStack}>
          {others.map((v, i) => (
            <CanvasVisual
              key={v.title}
              visual={v}
              runQuery={runQuery}
              index={kpis.length + i}
              style={landscape ? styles.visualHalf : undefined}
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const CanvasVisual: React.FC<{
  visual: VisualSpec;
  runQuery: (dax: string) => Promise<QueryResult>;
  index: number;
  style?: object;
}> = ({ visual, runQuery, index, style }) => {
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setResult(null);
    try {
      setResult(await runQuery(visual.dax));
    } catch (e) {
      const friendly = presentError(e, 'this visual');
      setError(
        friendly.kind === 'unknown'
          ? friendly.detail ?? 'Query failed'
          : `${friendly.title} — ${friendly.body}`,
      );
    }
  }, [runQuery, visual.dax]);

  useEffect(() => {
    void load();
  }, [load]);

  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!motionEnabled()) {
      enter.setValue(1);
      return;
    }
    Animated.timing(enter, {
      toValue: 1,
      duration: 420,
      delay: index * 70,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [enter, index]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: enter,
          transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
        },
      ]}
    >
      <VisualCard title={visual.title} loading={!result && !error} error={error} onRetry={() => void load()}>
        {result ? <ShapedBody visual={visual} result={result} /> : null}
      </VisualCard>
    </Animated.View>
  );
};

const ShapedBody: React.FC<{ visual: VisualSpec; result: QueryResult }> = ({ visual, result }) => {
  const shaped = shapeForVisual(visual, result);
  switch (shaped.kind) {
    case 'kpi':
      return <KpiTile data={shaped.data} format={visual.format} />;
    case 'bar':
      return <BarChart data={shaped.data} format={visual.format} />;
    case 'line':
      return <LineChart data={shaped.data} format={visual.format} />;
    case 'donut':
      return <DonutChart data={shaped.data} format={visual.format} />;
    case 'table':
      return <DataTable data={shaped.data} />;
  }
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.canvas,
    paddingTop: Platform.select({ android: StatusBar.currentHeight ?? 0, default: 0 }),
  },
  back: { paddingHorizontal: space.l, paddingVertical: space.s, minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  backText: { ...type.body, color: color.accent },
  canvas: { paddingHorizontal: space.l, paddingBottom: space.xxl, gap: space.m },
  title: { ...type.title, color: color.textPrimary, marginBottom: space.s },
  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.m },
  kpiTile: { flex: 1 },
  kpiTileLandscape: { flexGrow: 1, flexBasis: '22%' },
  visualsStack: { gap: space.m },
  visualsGridLandscape: { flexDirection: 'row', flexWrap: 'wrap', gap: space.m },
  visualHalf: { flexGrow: 1, flexBasis: '45%' },
});
