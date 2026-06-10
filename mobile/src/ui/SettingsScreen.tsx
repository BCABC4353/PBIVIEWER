/**
 * Settings — account, data-source mode, about. Same "quiet instrument
 * cluster" language as the rest of the app: near-black canvas, one amber
 * accent, hairline separators, no third-party UI.
 *
 * Self-contained: talks to the auth module directly (signIn/signOut/
 * getCurrentUser). The host only supplies the current mode and listens for
 * mode / data-source changes so it can rebuild its DataSource.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { color, space, type } from '../design/tokens';
import {
  azureConfigValid,
  getCurrentUser,
  signIn,
  signOut,
  type UserInfo,
} from '../auth/msal-auth';
import { setSavedMode, type DataMode } from '../core/data-source-factory';

// Keep in sync with app.json "version" (no expo-constants dependency — this
// screen stays importable anywhere).
const APP_VERSION = '1.0.0';

export interface SettingsScreenProps {
  mode: DataMode;
  onModeChange: (mode: DataMode) => void;
  /** Fired after anything that invalidates the current DataSource
   *  (mode switch, sign-in, sign-out) so the host can rebuild it. */
  onDataSourceChange?: () => void;
  onBack?: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  mode,
  onModeChange,
  onDataSourceChange,
  onBack,
}) => {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getCurrentUser().then(setUser);
  }, []);

  const connect = useCallback(async (): Promise<UserInfo | null> => {
    setError(null);
    setBusy(true);
    try {
      const u = await signIn();
      if (u) {
        setUser(u);
        onDataSourceChange?.();
      }
      return u;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed');
      return null;
    } finally {
      setBusy(false);
    }
  }, [onDataSourceChange]);

  const disconnect = useCallback(async () => {
    setError(null);
    await signOut();
    setUser(null);
    // Live mode without credentials is a dead end — drop back to sample data.
    await setSavedMode('mock');
    onModeChange('mock');
    onDataSourceChange?.();
  }, [onModeChange, onDataSourceChange]);

  const selectMode = useCallback(
    async (next: DataMode) => {
      if (next === mode || busy) return;
      setError(null);
      if (next === 'live') {
        // Live needs credentials: reuse the session if present, else sign in.
        const existing = user ?? (await getCurrentUser());
        if (!existing) {
          const u = await connect();
          if (!u) return; // dismissed or failed — stay on sample data
        }
      }
      await setSavedMode(next);
      onModeChange(next);
      onDataSourceChange?.();
    },
    [mode, busy, user, connect, onModeChange, onDataSourceChange],
  );

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentInsetAdjustmentBehavior="automatic">
        {onBack ? (
          <Pressable onPress={onBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Back">
            <Text style={styles.backText}>‹ Fleet</Text>
          </Pressable>
        ) : null}
        <Text style={styles.title}>Settings</Text>

        {/* ── Account ─────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            {user ? (
              <View>
                <Text style={styles.rowText}>{user.name ?? user.username}</Text>
                {user.name ? <Text style={styles.rowSub}>{user.username}</Text> : null}
              </View>
            ) : (
              <Text style={styles.rowMuted}>Sample data mode — not signed in</Text>
            )}
          </View>
          <View style={styles.hairline} />
          {user ? (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => void disconnect()}
              disabled={busy}
              accessibilityRole="button"
            >
              <Text style={styles.rowAction}>Sign out</Text>
            </Pressable>
          ) : (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => void connect()}
              disabled={busy || !azureConfigValid}
              accessibilityRole="button"
            >
              <Text style={[styles.rowAction, !azureConfigValid && styles.rowDisabled]}>
                {busy ? 'Connecting…' : 'Connect to Power BI'}
              </Text>
            </Pressable>
          )}
        </View>
        {!azureConfigValid ? (
          <Text style={styles.caption}>
            This build has no Azure credentials baked in, so live mode is unavailable.
            Paste the desktop app's clientId/tenantId into src/auth/azure-config.ts.
          </Text>
        ) : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {/* ── Data source ─────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>DATA SOURCE</Text>
        <View style={styles.card}>
          <ModeRow
            label="Sample data"
            sub="Built-in fleet, no sign-in"
            selected={mode === 'mock'}
            onPress={() => void selectMode('mock')}
          />
          <View style={styles.hairline} />
          <ModeRow
            label="Live"
            sub="Your Power BI workspaces"
            selected={mode === 'live'}
            disabled={!azureConfigValid}
            onPress={() => void selectMode('live')}
          />
        </View>

        {/* ── About ───────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>ABOUT</Text>
        <View style={styles.card}>
          <View style={[styles.row, styles.rowBetween]}>
            <Text style={styles.rowText}>Version</Text>
            <Text style={styles.rowMuted}>{APP_VERSION}</Text>
          </View>
        </View>
        <Text style={styles.caption}>
          How live mode works: you sign in once with your Microsoft account.
          Tokens stay in this device's secure storage and renew silently —
          no passwords are stored. The app then reads refresh health straight
          from the Power BI REST API; nothing leaves your device.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const ModeRow: React.FC<{
  label: string;
  sub: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}> = ({ label, sub, selected, disabled, onPress }) => (
  <Pressable
    style={({ pressed }) => [styles.row, styles.rowBetween, pressed && styles.rowPressed]}
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="radio"
    accessibilityState={{ selected, disabled: !!disabled }}
  >
    <View>
      <Text style={[styles.rowText, disabled && styles.rowDisabled]}>{label}</Text>
      <Text style={styles.rowSub}>{sub}</Text>
    </View>
    <Text style={[styles.radio, selected ? styles.radioOn : styles.radioOff]}>
      {selected ? '●' : '○'}
    </Text>
  </Pressable>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  back: { paddingHorizontal: space.l, paddingVertical: space.s },
  backText: { ...type.body, color: color.accent },
  title: { ...type.title, color: color.textPrimary, paddingHorizontal: space.l, paddingTop: space.m },

  sectionLabel: {
    ...type.micro,
    color: color.textTertiary,
    paddingHorizontal: space.l,
    marginTop: space.xl,
    marginBottom: space.s,
  },
  card: {
    backgroundColor: color.surface1,
    borderRadius: 16,
    marginHorizontal: space.m,
    overflow: 'hidden',
  },
  row: { paddingHorizontal: space.m, paddingVertical: space.m, justifyContent: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowPressed: { backgroundColor: color.surface2 },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: color.hairline, marginLeft: space.m },

  rowText: { ...type.body, color: color.textPrimary },
  rowSub: { ...type.caption, color: color.textTertiary, marginTop: 2 },
  rowMuted: { ...type.body, color: color.textSecondary },
  rowAction: { ...type.body, color: color.accent },
  rowDisabled: { color: color.textTertiary },

  radio: { fontSize: 16 },
  radioOn: { color: color.accent },
  radioOff: { color: color.textTertiary },

  caption: {
    ...type.caption,
    color: color.textTertiary,
    paddingHorizontal: space.l,
    marginTop: space.s,
    lineHeight: 18,
  },
  errorText: {
    ...type.caption,
    color: color.broken,
    paddingHorizontal: space.l,
    marginTop: space.s,
  },
});
