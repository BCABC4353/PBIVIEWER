import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { color, space, type } from '../design/tokens';
import type { DataSource, Refreshable } from '../core/types';
import type { DataMode, ReportsModel } from '../core/data-source-factory';
import type { ReportRef } from '../core/report-catalog';
import { FleetHealthScreen, RefreshDetailScreen } from './screens';
import { ReportsScreen } from './ReportsScreen';
import { LiveReportScreen } from './LiveReportScreen';
import { AlertsScreen } from './AlertsScreen';
import { tap } from '../feel/haptics';
import { IgnitionOverlay } from '../feel/IgnitionSweep';


type TabKey = 'fleet' | 'reports' | 'alerts' | 'settings';

const TABS: ReadonlyArray<{ key: TabKey; glyph: string; label: string }> = [
  { key: 'fleet', glyph: '●', label: 'Fleet' },
  { key: 'reports', glyph: '▦', label: 'Reports' },
  { key: 'alerts', glyph: '◉', label: 'Alerts' },
  { key: 'settings', glyph: '⚙', label: 'Settings' },
];

export const Root: React.FC<{
  mode: DataMode;
  source: DataSource;
  reports: ReportsModel | null;
  settings: React.ReactNode;
}> = ({ mode, source, reports, settings }) => {
  const [tab, setTab] = useState<TabKey>('fleet');
  const [fleetDetail, setFleetDetail] = useState<Refreshable | null>(null);
  const [alertDetail, setAlertDetail] = useState<Refreshable | null>(null);
  const [openReport, setOpenReport] = useState<ReportRef | null>(null);

  useEffect(() => {
    setOpenReport(null);
  }, [reports]);

  useEffect(() => {
    setFleetDetail(null);
    setAlertDetail(null);
  }, [source]);

  let body: React.ReactNode;
  switch (tab) {
    case 'fleet':
      body = fleetDetail ? (
        <RefreshDetailScreen item={fleetDetail} onBack={() => setFleetDetail(null)} />
      ) : (
        <FleetHealthScreen source={source} sample={mode === 'mock'} onOpen={setFleetDetail} />
      );
      break;
    case 'reports':
      body =
        openReport && reports ? (
          <LiveReportScreen report={openReport} model={reports} onBack={() => setOpenReport(null)} />
        ) : (
          <View style={styles.edge}>
            <ReportsScreen
              model={reports}
              mode={mode}
              onOpen={setOpenReport}
              onSignIn={() => setTab('settings')}
            />
          </View>
        );
      break;
    case 'alerts':
      body = alertDetail ? (
        <RefreshDetailScreen item={alertDetail} onBack={() => setAlertDetail(null)} />
      ) : (
        <View style={styles.edge}>
          <AlertsScreen source={source} onOpen={setAlertDetail} />
        </View>
      );
      break;
    case 'settings':
      body = <View style={styles.settingsHost}>{settings}</View>;
      break;
  }

  return (
    <View style={styles.root}>
      <View style={styles.body}>{body}</View>
      <View style={styles.tabBar} accessibilityRole="tablist">
        {TABS.map((t) => {
          const active = t.key === tab;
          const tone = active ? color.accent : color.textTertiary;
          return (
            <Pressable
              key={t.key}
              onPress={() => {
                if (t.key !== tab) tap();
                setTab(t.key);
              }}
              style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={t.label}
            >
              <Text style={[styles.tabGlyph, { color: tone }]}>{t.glyph}</Text>
              <Text style={[styles.tabLabel, { color: tone }]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {}
      <IgnitionOverlay />
    </View>
  );
};

const androidStatusPad = Platform.select({ android: StatusBar.currentHeight ?? 0, default: 0 });

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.void },
  body: { flex: 1 },
  edge: { flex: 1, backgroundColor: color.canvas, paddingTop: androidStatusPad },
  settingsHost: { flex: 1, backgroundColor: color.canvas, paddingTop: androidStatusPad },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: color.canvas,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hairline,
    paddingTop: space.s,
    paddingBottom: space.l,
  },
  tab: { flex: 1, alignItems: 'center', gap: 2 },
  tabPressed: { opacity: 0.7, transform: [{ scale: 0.96 }] },
  tabGlyph: { ...type.body },
  tabLabel: { ...type.micro },
});
