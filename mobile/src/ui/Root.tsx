import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { color, space, type } from '../design/tokens';
import type { DataSource, Refreshable } from '../core/types';
import type { ReportsModel } from '../core/data-source-factory';
import type { ReportRef } from '../core/report-catalog';
import { FleetHealthScreen, RefreshDetailScreen } from './screens';
import { ReportsScreen, SignedOutCard } from './ReportsScreen';
import { LiveReportScreen } from './LiveReportScreen';
import { AlertsScreen } from './AlertsScreen';
import { tap } from '../feel/haptics';
import { IgnitionOverlay } from '../feel/IgnitionSweep';

/**
 * App shell — own bottom tab bar (Pressable + tokens, no navigation dep).
 * Fleet hosts the existing FleetHealth → RefreshDetail flow; Reports hosts
 * the REAL-report flow (live catalog + dataset-derived canvases; signed out
 * it offers only the sign-in card); Alerts derives its feed from the same
 * DataSource; Settings renders whatever node the composition root hands us,
 * so this shell has zero dependency on the settings implementation.
 */

type TabKey = 'fleet' | 'reports' | 'alerts' | 'settings';

const TABS: ReadonlyArray<{ key: TabKey; glyph: string; label: string }> = [
  { key: 'fleet', glyph: '●', label: 'Fleet' },
  { key: 'reports', glyph: '▦', label: 'Reports' },
  { key: 'alerts', glyph: '◉', label: 'Alerts' },
  { key: 'settings', glyph: '⚙', label: 'Settings' },
];

export const Root: React.FC<{
  source: DataSource;
  /** Live reports seam — null while signed out (Reports shows sign-in). */
  reports: ReportsModel | null;
  settings: React.ReactNode;
}> = ({ source, reports, settings }) => {
  const [tab, setTab] = useState<TabKey>('fleet');
  const [fleetDetail, setFleetDetail] = useState<Refreshable | null>(null);
  const [alertDetail, setAlertDetail] = useState<Refreshable | null>(null);
  const [openReport, setOpenReport] = useState<ReportRef | null>(null);

  // Sign-out (or any model rebuild) invalidates the open report.
  useEffect(() => {
    setOpenReport(null);
  }, [reports]);

  let body: React.ReactNode;
  switch (tab) {
    case 'fleet':
      // Signed out, the landing tab leads to Power BI — never to fiction.
      body =
        reports === null ? (
          <SignedOutCard
            onSignIn={() => setTab('settings')}
            screenTitle="Fleet"
            screenSubtitle="Refresh health across your tenant"
            title="Connect to Power BI"
            body="Sign in once and this page shows the live health of your datasets and dataflows — what refreshed, what's late, what's broken."
          />
        ) : fleetDetail ? (
          <RefreshDetailScreen item={fleetDetail} onBack={() => setFleetDetail(null)} />
        ) : (
          <FleetHealthScreen source={source} onOpen={setFleetDetail} />
        );
      break;
    case 'reports':
      body =
        openReport && reports ? (
          <LiveReportScreen report={openReport} model={reports} onBack={() => setOpenReport(null)} />
        ) : (
          // SafeAreaView is iOS-only — pad unowned tab content past the
          // Android status bar here (owned screens pad themselves).
          <View style={styles.edge}>
            <ReportsScreen
              model={reports}
              onOpen={setOpenReport}
              onSignIn={() => setTab('settings')}
            />
          </View>
        );
      break;
    case 'alerts':
      body =
        reports === null ? (
          <SignedOutCard
            onSignIn={() => setTab('settings')}
            screenTitle="Alerts"
            screenSubtitle="Broken and overdue, nothing else"
            title="Connect to Power BI"
            body="Alerts come from your real refresh history — sign in and anything broken or overdue lands here."
          />
        ) : alertDetail ? (
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
                // The taxonomy's canonical tap() site (haptics.ts: "tab
                // change") — previously unwired, so normal navigation was
                // haptically dead.
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
      {/* The launch ceremony: a brief non-blocking veil that plays ONCE per
          cold start (module-level latch) and fades to reveal the app already
          laid out beneath it. Tab switches and back-navigation can never
          bring it back — it unmounts itself and stays gone. */}
      <IgnitionOverlay />
    </View>
  );
};

// SafeAreaView is iOS-only; on Android the status bar overlaps the first
// render unless containers pad past it explicitly.
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
    paddingBottom: space.l, // clears the home indicator
  },
  tab: { flex: 1, alignItems: 'center', gap: 2 },
  tabPressed: { opacity: 0.7, transform: [{ scale: 0.96 }] },
  tabGlyph: { ...type.body },
  tabLabel: { ...type.micro },
});
