import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { color, radius, space, type } from '../design/tokens';

/**
 * Surface every native visual sits on: surface1 card, caption title, and the
 * three quiet states — breathing skeleton (never a spinner), error with a
 * quiet retry, and content.
 */
export const VisualCard: React.FC<{
  title: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  style?: ViewStyle;
  children?: React.ReactNode;
}> = ({ title, loading, error, onRetry, style, children }) => {
  const breathe = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    if (!loading) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 0.7, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0.35, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [loading, breathe]);

  return (
    <View
      style={[styles.card, style]}
      accessibilityLabel={
        error ? `${title}, failed to load` : loading ? `${title}, loading` : title
      }
    >
      <Text style={styles.title} numberOfLines={1}>
        {title.toUpperCase()}
      </Text>
      {loading ? (
        <Animated.View style={[styles.skeleton, { opacity: breathe }]} />
      ) : error ? (
        <View style={styles.errorWrap}>
          <Text style={styles.errorText} numberOfLines={2}>
            {error}
          </Text>
          {onRetry ? (
            <Pressable
              onPress={onRetry}
              accessibilityRole="button"
              accessibilityLabel={`Retry ${title}`}
              style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]}
            >
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        children
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface1,
    borderRadius: radius.card,
    padding: space.m,
  },
  title: { ...type.micro, color: color.textTertiary },
  skeleton: {
    height: 96,
    marginTop: space.m,
    borderRadius: radius.chip,
    backgroundColor: color.surface2,
  },
  errorWrap: { marginTop: space.m, gap: space.s, alignItems: 'flex-start' },
  errorText: { ...type.caption, color: color.textSecondary },
  retry: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.accent,
    borderRadius: radius.chip,
    paddingHorizontal: space.m,
    paddingVertical: space.xs,
  },
  retryPressed: { backgroundColor: color.surface2 },
  retryText: { ...type.caption, color: color.accent },
});
