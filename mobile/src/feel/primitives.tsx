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


export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  haptic?: boolean;
  pressedScale?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

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


export interface EntranceProps {
  index?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}


export interface AnimatedNumberProps {
  value: number;
  format?: NumberFormat;
  style?: StyleProp<TextStyle>;
}

const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

export function AnimatedNumber({ value, format = defaultNumberFormat, style }: AnimatedNumberProps) {
  const [text, setText] = useState(() => format(value));
  const anim = useRef(new Animated.Value(value)).current;
  const fromRef = useRef(value);
  const formatRef = useRef(format);
  formatRef.current = format;

  useEffect(() => {
    const from = fromRef.current;
    if (value === from) {
      setText(formatRef.current(value));
      return;
    }
    fromRef.current = value;

    if (!motionEnabled()) {
      anim.setValue(value);
      setText(formatRef.current(value));
      return;
    }

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
      setText(formatRef.current(value));
    });
    return () => {
      anim.removeListener(id);
      run.stop();
    };
  }, [value, anim]);

  return <Animated.Text style={[tabular, style]}>{text}</Animated.Text>;
}


export interface PulseProps {
  active: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

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


export interface ShimmerProps {
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

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
    backgroundColor: 'rgba(255,255,255,0.045)',
  },
});


export interface SkeletonPulseProps {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

export function SkeletonPulse({ style, children }: SkeletonPulseProps) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!motionEnabled()) return;
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

export { motionEnabled, springs, timing, ease } from './springs';
export * as haptics from './haptics';
export { staggerDelay, defaultNumberFormat } from './motionCore';
