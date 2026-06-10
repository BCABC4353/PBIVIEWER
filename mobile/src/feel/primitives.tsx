/**
 * primitives — the five reusable feel components. Screens compose these;
 * they never hand-roll Animated values or call expo-haptics directly.
 *
 *   <PressableScale>  the ONE way anything in the app gets pressed
 *   <Entrance>        staggered weighted drop-in for arriving elements
 *   <AnimatedNumber>  count-up/down digits, tabular, no first-mount flicker
 *   <Pulse>           the quiet breathing loop for in-progress states
 *   <Shimmer>         low-contrast skeleton sweep for loading states
 *
 * Every primitive checks motionEnabled() and degrades to opacity-only (or
 * static) under OS Reduce Motion — that guarantee is the craft, not a bolt-on.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  LayoutChangeEvent,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  TextStyle,
  ViewStyle,
} from 'react-native';
import { color, radius } from '../design/tokens';
import { tap } from './haptics';
import {
  defaultNumberFormat,
  formatAnimatedValue,
  NumberFormat,
  staggerDelay,
} from './motionCore';
import { ease, motionEnabled, springs, timing } from './springs';

// ---------------------------------------------------------------------------
// PressableScale
// ---------------------------------------------------------------------------

export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  /** Fires haptics.tap() on pressIn. Default true — touches answer. */
  haptic?: boolean;
  /** Press scale target (spec §6.9: ~0.97). */
  pressedScale?: number;
  /** Style for the animated container (layout lives here, not on Pressable). */
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * The one press behavior: scale to 0.97 on springs.card + a brief opacity dip,
 * selection haptic on pressIn, generous hit-slop. Under Reduce Motion the
 * scale is skipped and only the opacity dip answers the touch.
 */
export function PressableScale({
  haptic = true,
  pressedScale = 0.97,
  style,
  children,
  onPressIn,
  onPressOut,
  hitSlop = 8,
  ...rest
}: PressableScaleProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const dim = useRef(new Animated.Value(1)).current;

  const animateTo = useCallback(
    (pressed: boolean) => {
      if (motionEnabled()) {
        Animated.spring(scale, { toValue: pressed ? pressedScale : 1, ...springs.card }).start();
      }
      Animated.timing(dim, {
        toValue: pressed ? 0.85 : 1,
        duration: pressed ? 90 : timing.fade,
        easing: ease.out,
        useNativeDriver: true,
      }).start();
    },
    [dim, scale, pressedScale],
  );

  return (
    <Pressable
      hitSlop={hitSlop}
      onPressIn={(e) => {
        if (haptic) tap();
        animateTo(true);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        animateTo(false);
        onPressOut?.(e);
      }}
      {...rest}
    >
      <Animated.View style={[style, { opacity: dim, transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Entrance
// ---------------------------------------------------------------------------

export interface EntranceProps {
  /** Position in a staggered group; delay = staggerDelay(index, timing.stagger). */
  index?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * Weighted drop-in on mount: translateY 12 → 0 on springs.arrival + fade,
 * staggered per index (clamped — long lists don't parade). Reduce Motion →
 * fade only, in place.
 */
export function Entrance({ index = 0, style, children }: EntranceProps) {
  const motion = useRef(motionEnabled()).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(motion ? 12 : 0)).current;

  useEffect(() => {
    const delay = staggerDelay(index, timing.stagger);
    const fadeIn = Animated.timing(opacity, {
      toValue: 1,
      duration: timing.fade,
      delay,
      easing: ease.out,
      useNativeDriver: true,
    });
    const animation = motion
      ? Animated.parallel([
          fadeIn,
          Animated.spring(translateY, { toValue: 0, delay, ...springs.arrival }),
        ])
      : fadeIn;
    animation.start();
    return () => animation.stop();
    // Mount-only: an Entrance happens once; index changes don't re-enter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// AnimatedNumber
// ---------------------------------------------------------------------------

export interface AnimatedNumberProps {
  value: number;
  /** Pure formatter (default: rounded, thousands-grouped). */
  format?: NumberFormat;
  style?: StyleProp<TextStyle>;
}

const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

/**
 * Counts up/down to `value` over ~600ms ease-out, digits tabular so nothing
 * reflows. Renders the final value immediately on mount (no flicker); only a
 * CHANGE animates. Reduce Motion (or haptic-less platforms) → instant swap.
 */
export function AnimatedNumber({ value, format = defaultNumberFormat, style }: AnimatedNumberProps) {
  const [text, setText] = useState(() => format(value));
  const anim = useRef(new Animated.Value(value)).current;
  const fromRef = useRef(value);
  const formatRef = useRef(format);
  formatRef.current = format;

  useEffect(() => {
    const from = fromRef.current;
    if (value === from) {
      // First mount (or no-op update): final value is already rendered.
      setText(formatRef.current(value));
      return;
    }
    fromRef.current = value;

    if (!motionEnabled()) {
      anim.setValue(value);
      setText(formatRef.current(value));
      return;
    }

    // Listener-driven text → JS-side value → useNativeDriver must be false.
    const id = anim.addListener(({ value: v }) =>
      setText(formatAnimatedValue(v, from, value, formatRef.current)),
    );
    const run = Animated.timing(anim, {
      toValue: value,
      duration: timing.count,
      easing: ease.out,
      useNativeDriver: false,
    });
    run.start(() => {
      anim.removeListener(id);
      setText(formatRef.current(value)); // land exactly, always
    });
    return () => {
      anim.removeListener(id);
      run.stop();
    };
  }, [value, anim]);

  return <Animated.Text style={[tabular, style]}>{text}</Animated.Text>;
}

// ---------------------------------------------------------------------------
// Pulse
// ---------------------------------------------------------------------------

export interface PulseProps {
  /** Breathing while true; settles to full opacity when false. */
  active: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * The quiet in-progress breath: opacity 1 → 0.45 → 1 over 1.8s, ease-in-out,
 * looping. Stops cleanly (settles back to 1) when active flips off.
 * Reduce Motion → static 0.7 opacity while active.
 */
export function Pulse({ active, style, children }: PulseProps) {
  const opacity = useRef(new Animated.Value(1)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    loopRef.current?.stop();
    loopRef.current = null;

    if (!active) {
      Animated.timing(opacity, {
        toValue: 1,
        duration: timing.fade,
        easing: ease.out,
        useNativeDriver: true,
      }).start();
      return;
    }

    if (!motionEnabled()) {
      opacity.setValue(0.7);
      return;
    }

    const half = timing.pulse / 2;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.45, duration: half, easing: ease.inOut, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: half, easing: ease.inOut, useNativeDriver: true }),
      ]),
    );
    loopRef.current = loop;
    loop.start();
    return () => loop.stop();
  }, [active, opacity]);

  return <Animated.View style={[style, { opacity }]}>{children}</Animated.View>;
}

// ---------------------------------------------------------------------------
// Shimmer
// ---------------------------------------------------------------------------

export interface ShimmerProps {
  /** Block height (skeletons should mirror the real layout). */
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Skeleton block with a very-low-contrast highlight band sweeping across
 * (~1.2s loop). Highlight is deliberately faint — aggressive shimmer reads
 * cheap. Reduce Motion → gentle opacity pulse 0.6 ↔ 1.0 instead of the sweep.
 */
export function Shimmer({ height = 16, borderRadius = radius.chip, style }: ShimmerProps) {
  const motion = motionEnabled();
  const progress = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const [width, setWidth] = useState(0);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  }, []);

  useEffect(() => {
    if (motion) {
      if (width <= 0) return;
      progress.setValue(0);
      const sweep = Animated.loop(
        Animated.timing(progress, {
          toValue: 1,
          duration: timing.shimmer,
          easing: ease.inOut,
          useNativeDriver: true,
        }),
      );
      sweep.start();
      return () => sweep.stop();
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.6, duration: timing.shimmer, easing: ease.inOut, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: timing.shimmer, easing: ease.inOut, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [motion, width, progress, opacity]);

  const band = Math.max(64, width * 0.4);
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-band, width],
  });

  return (
    <Animated.View
      onLayout={onLayout}
      style={[shimmerStyles.base, { height, borderRadius, opacity }, style]}
    >
      {motion && width > 0 ? (
        <Animated.View style={[shimmerStyles.band, { width: band, transform: [{ translateX }] }]} />
      ) : null}
    </Animated.View>
  );
}

const shimmerStyles = StyleSheet.create({
  base: {
    backgroundColor: color.surface1,
    overflow: 'hidden',
  },
  band: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    // ≤8% lighter than the base — the faint specular pass, not a flashlight.
    backgroundColor: 'rgba(255,255,255,0.045)',
  },
});

// ---------------------------------------------------------------------------
// SkeletonPulse
// ---------------------------------------------------------------------------

export interface SkeletonPulseProps {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * The quiet skeleton host: wrap dim placeholder blocks (surface-colored Views
 * mirroring the real layout) and the WHOLE group shimmers as one cheap
 * native-driver opacity loop (1 ↔ 0.55, ~1.6 s) — a single animated node no
 * matter how many blocks. Under Reduce Motion the shimmer is disabled
 * entirely: static blocks, zero animation.
 */
export function SkeletonPulse({ style, children }: SkeletonPulseProps) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!motionEnabled()) return; // Reduce Motion: no shimmer at all.
    const half = 800;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.55, duration: half, easing: ease.inOut, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: half, easing: ease.inOut, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return <Animated.View style={[style, { opacity }]}>{children}</Animated.View>;
}

// Re-exports so screens can import the whole feel kit from one place.
export { motionEnabled, springs, timing, ease } from './springs';
export * as haptics from './haptics';
export { staggerDelay, defaultNumberFormat } from './motionCore';
