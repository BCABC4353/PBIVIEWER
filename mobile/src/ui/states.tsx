import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color, space, type } from '../design/tokens';
import type { PresentableError } from '../core/error-presenter';
import { SkeletonPulse } from '../feel/primitives';

export const ActionButton: React.FC<{
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
}> = ({ label, onPress, accessibilityLabel }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel ?? label}
    style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
  >
    <Text style={styles.buttonText}>{label}</Text>
  </Pressable>
);

export const ErrorState: React.FC<{
  error: PresentableError;
  onRetry?: () => void;
  onSignIn?: () => void;
}> = ({ error, onRetry, onSignIn }) => {
  const showSignIn = error.signIn && onSignIn !== undefined;
  const showRetry = onRetry !== undefined && (error.retry || !showSignIn);
  return (
    <View style={styles.center}>
      <Text style={styles.title}>{error.title}</Text>
      <Text style={styles.body}>{error.body}</Text>
      {error.detail ? (
        <Text selectable style={styles.detail} numberOfLines={4}>
          {error.detail}
        </Text>
      ) : null}
      <View style={styles.actions}>
        {showSignIn ? <ActionButton label="Sign in" onPress={onSignIn!} /> : null}
        {showRetry ? <ActionButton label="Try again" onPress={onRetry!} /> : null}
      </View>
    </View>
  );
};

export const EmptyState: React.FC<{ title?: string; body: string; children?: React.ReactNode }> = ({
  title,
  body,
  children,
}) => (
  <View style={styles.center}>
    {title ? <Text style={styles.title}>{title}</Text> : null}
    <Text style={styles.body}>{body}</Text>
    {children}
  </View>
);

export const ScreenHeader: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => (
  <View style={styles.header}>
    <Text style={styles.headerTitle} accessibilityRole="header">
      {title}
    </Text>
    {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
  </View>
);

export const ListSkeleton: React.FC<{ rows?: number; caption?: string }> = ({ rows = 6, caption }) => (
  <View style={styles.skeletonWrap}>
    <SkeletonPulse>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={styles.skeletonRow} />
      ))}
    </SkeletonPulse>
    {caption ? (
      <Text style={styles.skeletonCaption} accessibilityLiveRegion="polite">
        {caption}
      </Text>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  center: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.s,
    padding: space.l,
  },
  title: { ...type.body, color: color.textPrimary, fontWeight: '600', textAlign: 'center' },
  body: { ...type.body, color: color.textSecondary, textAlign: 'center' },
  detail: { ...type.caption, color: color.textTertiary, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: space.m, marginTop: space.s },
  button: {
    borderWidth: 1,
    borderColor: color.accent,
    borderRadius: 12,
    paddingHorizontal: space.l,
    paddingVertical: space.s,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: { backgroundColor: color.surface2 },
  buttonText: { ...type.body, color: color.accent },

  header: { paddingHorizontal: space.l, paddingTop: space.m, paddingBottom: space.l },
  headerTitle: { ...type.title, color: color.textPrimary },
  headerSubtitle: { ...type.caption, color: color.textTertiary, marginTop: 4 },

  skeletonWrap: { flex: 1, paddingHorizontal: space.l, paddingTop: space.m },
  skeletonRow: { height: 52, borderRadius: 12, backgroundColor: color.surface1, marginBottom: space.m },
  skeletonCaption: { ...type.caption, color: color.textTertiary, textAlign: 'center', paddingVertical: space.m },
});
