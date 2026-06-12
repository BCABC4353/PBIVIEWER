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
import appConfig from '../../app.json';
import { color, space, type } from '../design/tokens';
import {
  authSessionRedirectConfigured,
  azureConfigValid,
  getCurrentUser,
  signIn,
  signOut,
  type UserInfo,
} from '../auth/msal-auth';
import { deviceCodeController } from '../auth/device-code-controller-instance';
import type { DeviceCodeFlowState } from '../auth/device-code-controller';
import { codeCountdown } from '../auth/device-code-format';
import { probeHaptics, type HapticProbeResult } from '../feel/haptics';
import type { DataMode } from '../core/data-source-factory';

const APP_VERSION: string = appConfig.expo.version;

const DEVICE_LOGIN_URL = 'https://microsoft.com/devicelogin';

export interface SettingsScreenProps {
  mode: DataMode;
  onModeChange: (mode: DataMode) => void;
  onBack?: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ mode, onModeChange, onBack }) => {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [flow, setFlow] = useState<DeviceCodeFlowState>(() => deviceCodeController.getState());
  const [feelRunning, setFeelRunning] = useState(false);
  const [feelResults, setFeelResults] = useState<HapticProbeResult[]>([]);

  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  useEffect(() => deviceCodeController.subscribe(setFlow), []);

  useEffect(
    () =>
      deviceCodeController.onSignedIn((u) => {
        if (mountedRef.current) setUser(u);
      }),
    [],
  );

  useEffect(() => {
    void getCurrentUser().then((u) => {
      if (mountedRef.current) setUser(u);
    });
  }, []);

  const flowBusy = flow.phase === 'requesting' || flow.phase === 'polling';
  const anyBusy = busy || flowBusy;
  const errorText = error ?? (flow.phase === 'error' ? flow.message : null);

  const finishSignIn = useCallback(
    (u: UserInfo | null) => {
      setUser(u);
      onModeChange('live');
    },
    [onModeChange],
  );

  const connect = useCallback(async (): Promise<void> => {
    setError(null);
    if (!authSessionRedirectConfigured) {
      await deviceCodeController.start();
      return;
    }
    setBusy(true);
    try {
      const u = await signIn();
      if (u) finishSignIn(u);
    } catch (e) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : 'Sign-in failed');
      }
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [finishSignIn]);

  const cancelDeviceFlow = useCallback(() => {
    deviceCodeController.cancel();
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
    setConfirmingSignOut(false);
    deviceCodeController.clearError();
    await signOut();
    if (mountedRef.current) setUser(null);
    onModeChange('mock');
  }, [onModeChange]);

  const selectMode = useCallback(
    async (next: DataMode) => {
      if (next === mode || anyBusy) return;
      setError(null);
      deviceCodeController.clearError();
      if (next === 'live') {
        const existing = user ?? (await getCurrentUser());
        if (!existing) {
          await connect();
          return;
        }
      }
      onModeChange(next);
    },
    [mode, anyBusy, user, connect, onModeChange],
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
            <Text style={styles.backText}>‹ Back</Text>
          </Pressable>
        ) : null}
        <Text style={styles.title} accessibilityRole="header">
          Settings
        </Text>

        <Section label="ACCOUNT">
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
          <Hairline />
          {user ? (
            confirmingSignOut ? (
              <>
                <View style={styles.row}>
                  <Text style={styles.rowSub}>
                    Sign out of {user.username}? You'll be back on sample data until you sign in
                    again.
                  </Text>
                </View>
                <Hairline />
                <SettingsRow
                  title="Sign out"
                  destructive
                  disabled={anyBusy}
                  onPress={() => void disconnect()}
                  accessibilityLabel="Confirm sign out"
                />
                <Hairline />
                <SettingsRow
                  title="Cancel"
                  onPress={() => setConfirmingSignOut(false)}
                  accessibilityLabel="Cancel sign out"
                />
              </>
            ) : (
              <SettingsRow
                title="Sign out"
                disabled={anyBusy}
                onPress={() => setConfirmingSignOut(true)}
              />
            )
          ) : (
            <SettingsRow
              title={anyBusy ? 'Connecting…' : 'Connect to Power BI'}
              disabled={anyBusy || !azureConfigValid}
              onPress={() => void connect()}
            />
          )}
        </Section>

        {flow.phase === 'polling' ? (
          <DeviceCodeCard
            userCode={flow.userCode}
            pollStatus={flow.pollStatus}
            expiresAt={flow.expiresAt}
            onCopyAndOpen={() => void copyAndOpen(flow.userCode)}
            onCancel={cancelDeviceFlow}
          />
        ) : null}

        {flow.phase === 'expired' ? (
          <View style={[styles.card, styles.deviceCard]}>
            <Text style={styles.deviceLead}>
              The sign-in code expired before it was entered.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.deviceButton, pressed && styles.rowPressed]}
              onPress={() => void deviceCodeController.start()}
              accessibilityRole="button"
              accessibilityLabel="Get a new sign-in code"
            >
              <Text style={styles.deviceButtonText}>Get a new code</Text>
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
        {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

        <Section label="DATA SOURCE">
          <ModeRow
            label="Sample data"
            sub="Built-in fleet, no sign-in"
            selected={mode === 'mock'}
            onPress={() => void selectMode('mock')}
          />
          <Hairline />
          <ModeRow
            label="Live"
            sub="Your Power BI workspaces"
            selected={mode === 'live'}
            disabled={!azureConfigValid}
            onPress={() => void selectMode('live')}
          />
        </Section>

        <Section label="FEEL">
          <SettingsRow
            title={feelRunning ? 'Testing feel…' : 'Test feel'}
            sub="Fires every haptic verb in sequence and reports each result"
            disabled={feelRunning}
            onPress={() => void runFeelTest()}
          />
          {feelResults.length > 0 ? (
            <>
              <Hairline />
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
        </Section>

        <Section label="ABOUT">
          <View style={[styles.row, styles.rowBetween]}>
            <Text style={styles.rowText}>Version</Text>
            <Text style={styles.rowMuted}>{APP_VERSION}</Text>
          </View>
        </Section>
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

const Section: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <>
    <Text style={styles.sectionLabel}>{label}</Text>
    <View style={styles.card}>{children}</View>
  </>
);

const Hairline: React.FC = () => <View style={styles.hairline} />;

const SettingsRow: React.FC<{
  title: string;
  sub?: string;
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}> = ({ title, sub, destructive, disabled, onPress, accessibilityLabel }) => (
  <Pressable
    style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel ?? title}
    accessibilityState={{ disabled: !!disabled }}
  >
    <Text
      style={[
        styles.rowAction,
        destructive && styles.rowDestructive,
        disabled && styles.rowDisabled,
      ]}
    >
      {title}
    </Text>
    {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
  </Pressable>
);

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
    accessibilityLabel={`${label} — ${sub}`}
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

const DeviceCodeCard: React.FC<{
  userCode: string;
  pollStatus: 'waiting' | 'slow_down';
  expiresAt: number;
  onCopyAndOpen: () => void;
  onCancel: () => void;
}> = ({ userCode, pollStatus, expiresAt, onCopyAndOpen, onCancel }) => (
  <View style={[styles.card, styles.deviceCard]}>
    <Text style={styles.deviceLead}>
      On any computer or phone, go to microsoft.com/devicelogin and enter:
    </Text>
    <Text
      style={styles.deviceCode}
      accessibilityLabel={`Sign-in code ${userCode.split('').join(' ')}`}
    >
      {userCode}
    </Text>
    <CodeCountdown expiresAt={expiresAt} />
    <Pressable
      style={({ pressed }) => [styles.deviceButton, pressed && styles.rowPressed]}
      onPress={onCopyAndOpen}
      accessibilityRole="button"
      accessibilityLabel="Copy code and open microsoft.com/devicelogin"
    >
      <Text style={styles.deviceButtonText}>
        Copy code & open microsoft.com/devicelogin
      </Text>
    </Pressable>
    <Text style={styles.deviceStatus}>
      {pollStatus === 'slow_down'
        ? 'Microsoft asked us to poll slower — still waiting…'
        : 'Waiting for you to enter the code…'}
    </Text>
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onCancel}
      accessibilityRole="button"
      accessibilityLabel="Cancel sign-in"
    >
      <Text style={[styles.rowAction, styles.deviceCancel]}>Cancel</Text>
    </Pressable>
  </View>
);

const CodeCountdown: React.FC<{ expiresAt: number }> = ({ expiresAt }) => {
  const [label, setLabel] = useState<string | null>(() => codeCountdown(expiresAt, Date.now()));
  useEffect(() => {
    setLabel(codeCountdown(expiresAt, Date.now()));
    const id = setInterval(() => setLabel(codeCountdown(expiresAt, Date.now())), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return (
    <Text style={styles.deviceCountdown} accessibilityLiveRegion="polite">
      {label ? `code valid ${label}` : 'Code expired'}
    </Text>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  back: { paddingHorizontal: space.l, paddingVertical: space.s, minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
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
  row: { paddingHorizontal: space.m, paddingVertical: space.m, minHeight: 44, justifyContent: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowPressed: { backgroundColor: color.surface2 },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: color.hairline, marginLeft: space.m },

  rowText: { ...type.body, color: color.textPrimary },
  rowSub: { ...type.caption, color: color.textTertiary, marginTop: 2 },
  rowMuted: { ...type.body, color: color.textSecondary },
  rowAction: { ...type.body, color: color.accent },
  rowDestructive: { color: color.broken },
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
  deviceCountdown: {
    ...type.caption,
    color: color.textSecondary,
    fontVariant: ['tabular-nums'],
    marginBottom: space.m,
  },
  deviceButton: {
    borderWidth: 1,
    borderColor: color.accent,
    borderRadius: 12,
    paddingHorizontal: space.l,
    paddingVertical: space.s,
    minHeight: 44,
    justifyContent: 'center',
    marginTop: space.s,
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
