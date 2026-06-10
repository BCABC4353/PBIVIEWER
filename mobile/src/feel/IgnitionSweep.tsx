/**
 * IgnitionSweep — the app's signature primitive, the "oh" moment.
 *
 * Like a car's gauge-needle sweep at ignition: an amber arc sweeps as the
 * fleet snapshot loads, each REAL item checked ticks a detent under the thumb,
 * and on a clean load the needle settles on the end-stop with one warm
 * confirm() as the hero number lands. If anything broke, the sweep CATCHES —
 * the needle halts short, fault() fires, and `onCaught` tells the host to
 * surface the failed item (in red — red belongs to the broken thing, never to
 * this chrome).
 *
 * HONESTY RULE: every detent is caused by a real API response landing.
 * Nothing here invents progress, delays completion, or fakes ticks.
 *
 * All decisions (arc math, detent counting, settle/catch machine) are pure and
 * tested in ignition-logic.ts; this file is only the Animated/SVG/haptic shell.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { color } from '../design/tokens';
import { confirm, detent, fault } from './haptics';
import {
  advanceSweep,
  arcDashArray,
  arcGeometry,
  arcTargetFraction,
  clamp01,
  detentTicks,
  initialSweepState,
  SWEEP_START_DEGREES,
  type SweepState,
} from './ignition-logic';
import { motionEnabled, springs } from './springs';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface IgnitionSweepProps {
  /** REAL loading progress 0..1, driven by the host — never synthesized here. */
  progress: number;
  /** Count of items actually answered by the API so far (detent per increment). */
  itemsChecked: number;
  /** True the moment the host knows the load includes a failure. */
  failed: boolean;
  /** Clean completion: fires once, after the arc lands — cue the hero number. */
  onSettled?: () => void;
  /** The catch report: fires once when the sweep halts on a failure, so the
   *  host can surface the failed item in red. */
  onCaught?: () => void;
  /** Outer square size in dp. */
  size?: number;
}

export function IgnitionSweep({
  progress,
  itemsChecked,
  failed,
  onSettled,
  onCaught,
  size = 96,
}: IgnitionSweepProps) {
  const strokeWidth = Math.max(3, size * 0.06);
  const geometry = useMemo(() => arcGeometry(size, strokeWidth), [size, strokeWidth]);

  // Fraction of the sweep revealed (0..1) — chases `progress` on springs.gesture.
  const anim = useRef(new Animated.Value(0)).current;
  const stateRef = useRef<SweepState>(initialSweepState());
  const prevCheckedRef = useRef(itemsChecked); // mount baseline: no phantom ticks
  const completionFiredRef = useRef(false);

  // Callbacks by ref so in-flight springs never capture stale closures.
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;
  const onCaughtRef = useRef(onCaught);
  onCaughtRef.current = onCaught;

  // Detents — one gated tick per batch of REAL responses. Runs before the
  // drive effect below so the completion batch still ticks while 'sweeping'.
  // Reduce Motion → no detents (the contract is: instant settle, ONE haptic).
  useEffect(() => {
    const ticks = detentTicks(prevCheckedRef.current, itemsChecked);
    prevCheckedRef.current = itemsChecked;
    if (ticks > 0 && stateRef.current.phase === 'sweeping' && motionEnabled()) {
      detent();
    }
  }, [itemsChecked]);

  // Drive the needle + settle/catch transitions.
  useEffect(() => {
    const result = advanceSweep(stateRef.current, progress, failed);
    stateRef.current = result.state;
    const target = arcTargetFraction(result.state, progress);

    const fireCompletion = () => {
      if (completionFiredRef.current) return;
      completionFiredRef.current = true;
      if (result.haptic === 'confirm') confirm();
      if (result.haptic === 'fault') fault();
      if (result.justSettled) onSettledRef.current?.();
      if (result.justCaught) onCaughtRef.current?.();
    };

    if (!motionEnabled()) {
      // Reduce Motion: no sweep — instant settle, single completion haptic only.
      anim.setValue(target);
      if (result.justSettled || result.justCaught) fireCompletion();
      return;
    }

    if (result.justCaught) {
      // The CATCH: fault fires AT the halt — the needle snapping short IS the event.
      fireCompletion();
      Animated.spring(anim, { toValue: target, ...springs.gesture, useNativeDriver: false }).start();
      return;
    }

    if (result.justSettled) {
      // Clean ignition: finish the sweep, then confirm() as the hero lands.
      Animated.spring(anim, { toValue: target, ...springs.gesture, useNativeDriver: false }).start(
        fireCompletion,
      );
      return;
    }

    // Still sweeping — chase the live progress.
    Animated.spring(anim, { toValue: target, ...springs.gesture, useNativeDriver: false }).start();
  }, [progress, failed, anim]);

  const dashArray = arcDashArray(geometry);
  const dashOffset = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [geometry.arcLength, 0],
  });

  return (
    <View
      style={[styles.box, { width: size, height: size }]}
      accessibilityRole="progressbar"
      accessibilityLabel={failed ? 'Fleet check caught a failure' : 'Checking fleet'}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamp01(progress) * 100) }}
    >
      <Svg
        width={size}
        height={size}
        // Dash arcs start at 3 o'clock; rotate so the sweep runs lower-left →
        // lower-right like a tachometer, gap at the bottom.
        style={{ transform: [{ rotate: `${SWEEP_START_DEGREES}deg` }] }}
      >
        {/* Track: the full gauge throw, hairline-faint. */}
        <Circle
          cx={geometry.center}
          cy={geometry.center}
          r={geometry.radius}
          stroke={color.hairline}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={dashArray}
          fill="none"
        />
        {/* Needle sweep: the one amber accent, chasing real progress. */}
        <AnimatedCircle
          cx={geometry.center}
          cy={geometry.center}
          r={geometry.radius}
          stroke={color.accent}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={dashArray}
          strokeDashoffset={dashOffset}
          fill="none"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
