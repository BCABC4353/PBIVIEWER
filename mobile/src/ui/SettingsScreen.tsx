import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { color, space, type } from '../design/tokens';
import {
  adoptTokenSet,
  authSessionRedirectConfigured,
  azureConfigValid,
  getCurrentUser,
  SCOPES,
  signIn,
  signOut,
  type UserInfo,
} from '../auth/msal-auth';
import { AZURE_CONFIG } from '../auth/azure-config';
import {
  DeviceCodeCancelledError,
  pollDeviceCode,
  requestDeviceCode,
  type DeviceCodeFetch,
} from '../auth/device-code-auth';
import { probeHaptics, type HapticProbeResult } from '../feel/haptics';
import { setSavedMode, type DataMode } from '../core/data-source-factory';

const APP_VERSION = '1.0.0';

const DEVICE_LOGIN_URL = 'https://microsoft.com/devicelogin';

interface DeviceFlowState {
  userCode: string;
  status: string;
}

export interface SettingsScreenProps {
  mode: DataMode;
  onModeChange: (mode: DataMode) => void;
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
  const [deviceFlow, setDeviceFlow] = useState<DeviceFlowState | null>(null);
  const [feelRunning, setFeelRunning] = useState(false);
  const [feelResults, setFeelResults] = useState<HapticProbeResult[]>([]);

  const cancelPollRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
      cancelPollRef.current = true;
    },
    [],
  );

  useEffect(() => {
    void getCurrentUser().then((u) => {
      if (mountedRef.current) setUser(u);
    });
  }, []);

  const finishSignIn = useCallback(
    async (u: UserInfo | null) => {
      setUser(u);
      await setSavedMode('live');
      onModeChange('live');
      onDataSourceChange?.();
    },
    [onModeChange, onDataSourceChange],
  );

  const connectViaDeviceCode = useCallback(async (): Promise<UserInfo | null> => {
    const cfg = {
      clientId: AZURE_CONFIG.clientId,
      tenantId: AZURE_CONFIG.tenantId,
      scopes: SCOPES,
    };
    const deps = { fetch: fetch as unknown as DeviceCodeFetch };
    cancelPollRef.current = false;
    const challenge = await requestDeviceCode(cfg, deps);
    if (!mountedRef.current) return null;
    setDeviceFlow({
      userCode: challenge.userCode,
      status: 'Waiting for you to enter the code…',
    });
    try {
      const tokens = await pollDeviceCode(cfg, challenge, deps, {
        cancelled: () => cancelPollRef.current,
        onStatus: (s) => {
          if (mountedRef.current) {
            setDeviceFlow((d) =>
              d
                ? {
                    ...d,
                    status:
                      s === 'slow_down'
                        ? 'Microsoft asked us to poll slower — still waiting…'
                        : 'Waiting for you to enter the code…',
                  }
                : d,
            );
          }
        },
      });
      const u = await adoptTokenSet(tokens);
      if (mountedRef.current) {
        setDeviceFlow(null);
        await finishSignIn(u);
      }
      return u;
    } catch (e) {
      if (mountedRef.current) setDeviceFlow(null);
      if (e instanceof DeviceCodeCancelledError) return null;
      throw e;
    }
  }, [finishSignIn]);

  const connect = useCallback(async (): Promise<UserInfo | null> => {
    setError(null);
    setBusy(true);
    try {
      if (!authSessionRedirectConfigured) {
        return await connectViaDeviceCode();
      }
      const u = await signIn();
      if (u) await finishSignIn(u);
      return u;
    } catch (e) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : 'Sign-in failed');
      }
      return null;
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [connectViaDeviceCode, finishSignIn]);

  const cancelDeviceFlow = useCallback(() => {
    cancelPollRef.current = true;
    setDeviceFlow(null);
    setBusy(false);
  }, []);

  const copyAndOpen = useCallback(async (code: string) => {
    try {
      await Clipboard.setStringAsync(code);
    } catch {
    }
    try {
      await Linking.openURL(DEVICE_LOGIN_URL);
    } catch {
      if (mountedRef.current) {
        setError(`Could not open the browser — go to ${DEVICE_LOGIN_URL} and enter the code.`);
      }
    }
  }, []);

  const disconnect = useCallback(async () => {
    setError(null);
    await signOut();
    setUser(null);
    await setSavedMode('mock');
    onModeChange('mock');
    onDataSourceChange?.();
  }, [onModeChange, onDataSourceChange]);

  const selectMode = useCallback(
    async (next: DataMode) => {
      if (next === mode || busy) return;
      setError(null);
      if (next === 'live') {
        const existing = user ?? (await getCurrentUser());
        if (!existing) {
          await connect();
          return;
        }
      }
      await setSavedMode(next);
      onModeChange(next);
      onDataSourceChange?.();
    },
    [mode, busy, user, connect, onModeChange, onDataSourceChange],
  );

  const runFeelTest = useCallback(async () => {
    if (feelRunning) return;
    setFeelRunning(true);
    setFeelResults([]);
    await probeHaptics((r) => {
      if (mountedRef.current) setFeelResults((rs) => [...rs, r]);
    });
    if (mountedRef.current) setFeelRunning(false);
  }, [feelRunning]);

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

        {}
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

        {}
        {deviceFlow ? (
          <View style={[styles.card, styles.deviceCard]}>
            <Text style={styles.deviceLead}>
              On any computer or phone, go to microsoft.com/devicelogin and enter:
            </Text>
            <Text
              style={styles.deviceCode}
              accessibilityLabel={`Sign-in code ${deviceFlow.userCode.split('').join(' ')}`}
            >
              {deviceFlow.userCode}
            </Text>
            <Pressable
              style={({ pressed }) => [styles.deviceButton, pressed && styles.rowPressed]}
              onPress={() => void copyAndOpen(deviceFlow.userCode)}
              accessibilityRole="button"
            >
              <Text style={styles.deviceButtonText}>
                Copy code & open microsoft.com/devicelogin
              </Text>
            </Pressable>
            <Text style={styles.deviceStatus}>{deviceFlow.status}</Text>
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={cancelDeviceFlow}
              accessibilityRole="button"
            >
              <Text style={[styles.rowAction, styles.deviceCancel]}>Cancel</Text>
            </Pressable>
          </View>
        ) : null}

        {!azureConfigValid ? (
          <Text style={styles.caption}>
            This build has no Azure credentials, so live mode is unavailable. Put the
            desktop app's clientId/tenantId into mobile/src/auth/azure-config.local.json
            (created by `npm start`; gitignored) and restart — no Entra portal changes
            needed: sign-in uses a device code at microsoft.com/devicelogin.
          </Text>
        ) : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {}
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

        {}
        <Text style={styles.sectionLabel}>FEEL</Text>
        <View style={styles.card}>
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => void runFeelTest()}
            disabled={feelRunning}
            accessibilityRole="button"
          >
            <Text style={styles.rowAction}>{feelRunning ? 'Testing feel…' : 'Test feel'}</Text>
            <Text style={styles.rowSub}>
              Fires every haptic verb in sequence and reports each result
            </Text>
          </Pressable>
          {feelResults.length > 0 ? (
            <>
              <View style={styles.hairline} />
              <View style={styles.row}>
                {feelResults.map((r) => (
                  <Text
                    key={r.verb}
                    style={[styles.feelLine, { color: r.ok ? color.textSecondary : color.broken }]}
                  >
                    {r.ok ? '✓' : '✗'} {r.verb}
                    {r.detail ? ` — ${r.detail}` : ''}
                  </Text>
                ))}
                {!feelRunning ? (
                  <Text style={styles.rowSub}>
                    All ✓ but felt nothing? Check iPhone Settings → Sounds & Haptics →
                    System Haptics, and that Silent Mode haptics are on.
                  </Text>
                ) : null}
              </View>
            </>
          ) : null}
        </View>

        {}
        <Text style={styles.sectionLabel}>ABOUT</Text>
        <View style={styles.card}>
          <View style={[styles.row, styles.rowBetween]}>
            <Text style={styles.rowText}>Version</Text>
            <Text style={styles.rowMuted}>{APP_VERSION}</Text>
          </View>
        </View>
        <Text style={styles.caption}>
          How live mode works: you sign in once with your Microsoft account
          (in Expo Go that's a one-time code at microsoft.com/devicelogin).
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

  deviceCard: { marginTop: space.m, paddingVertical: space.m, alignItems: 'center' },
  deviceLead: {
    ...type.caption,
    color: color.textSecondary,
    textAlign: 'center',
    paddingHorizontal: space.l,
  },
  deviceCode: {
    color: color.accent,
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: 6,
    fontVariant: ['tabular-nums'],
    marginVertical: space.m,
  },
  deviceButton: {
    borderWidth: 1,
    borderColor: color.accent,
    borderRadius: 12,
    paddingHorizontal: space.l,
    paddingVertical: space.s,
  },
  deviceButtonText: { ...type.body, color: color.accent, textAlign: 'center' },
  deviceStatus: { ...type.caption, color: color.textTertiary, marginTop: space.m },
  deviceCancel: { color: color.textTertiary },

  feelLine: { ...type.caption, marginTop: 2 },

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
