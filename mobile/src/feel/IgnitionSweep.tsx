/**
 * IgnitionSweep — the launch ceremony, played EXACTLY ONCE per cold app start.
 *
 * What the owner rejected: "a yellow line shaped like a dial that inches up"
 * replayed on every back-navigation, mounted as a gate that hid the app.
 * What this is now:
 *
 *   - <IgnitionOverlay> is a brief, non-blocking veil over the app shell.
 *     Content (or skeletons) is laid out and live BENEATH it the whole time;
 *     `pointerEvents="none"` means it never even blocks a tap. It fades out
 *     to REVEAL the app within IGNITION_TOTAL_MS (≤ 1400 ms, D6).
 *   - It plays once per JS bundle — the module-level latch in ignition-logic
 *     survives unmount/remount, so tab switches, back-navigation, pull-to-
 *     refresh and data-mode switches can NEVER replay it.
 *   - The dial is an instrument, not a line: graduated minor/major tick arc,
 *     a needle with a hub and counterweight tail, and a soft amber glow trail
 *     (two intensities, D8). One continuous underdamped spring — accelerate
 *     to full throw, one proud overshoot, settle. Never staged hops.
 *   - ONE light haptic impact at the overshoot apex (haptics.apex), nothing
 *     else. Reduce Motion → no ceremony at all, no haptic, instant content.
 *
 * Animation runs on the UI thread: react-native-reanimated useAnimatedProps
 * over react-native-svg. All decisions (latch, arc math, tick layout, spring
 * physics, timeline) are pure and tested in ignition-logic.ts; this file is
 * only the Reanimated/SVG/haptic shell.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Line } from 'react-native-svg';
import { color } from '../design/tokens';
import { apex } from './haptics';
import {
  arcDashArray,
  arcSpan,
  gaugeTicks,
  ignitionHasPlayed,
  IGNITION_FADE_MS,
  IGNITION_KEYSET_MS,
  IGNITION_REVEAL_MS,
  IGNITION_SPRING,
  markIgnitionPlayed,
  MAX_NEEDLE_FRACTION,
  polarPoint,
  SWEEP_DEGREES,
  SWEEP_START_DEGREES,
} from './ignition-logic';
import { motionEnabled, motionReady } from './springs';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedLine = Animated.createAnimatedComponent(Line);

/** Dial proportions, all derived from `size` so the instrument scales whole. */
function dialLayout(size: number) {
  const c = size / 2;
  const tickOuter = c - 4;
  return {
    c,
    tickOuter,
    tickMinorInner: tickOuter - 7,
    tickMajorInner: tickOuter - 13,
    trailRadius: tickOuter - 24,
    needleTip: tickOuter - 18,
    needleTail: 16,
    hubRadius: 9,
  };
}

const TICKS = gaugeTicks();

export interface IgnitionOverlayProps {
  /** Dial diameter in dp. */
  size?: number;
}

/**
 * The once-per-launch ceremony veil. Mount it LAST in the app shell (above
 * everything); it claims the launch latch, plays the sweep, lifts, and
 * unmounts itself. On every subsequent mount of anything, it renders null.
 */
export function IgnitionOverlay({ size = 184 }: IgnitionOverlayProps) {
  // The latch read happens once, before first paint: if this bundle already
  // played the ceremony, this overlay never exists at all.
  const [visible, setVisible] = useState(() => !ignitionHasPlayed());

  /** Sweep fraction 0 → 1 (briefly > 1 at the overshoot apex). */
  const progress = useSharedValue(0);
  /** The veil: opaque canvas → transparent, revealing the app beneath. */
  const veil = useSharedValue(1);
  /** Key-set: the dial's light arrives before its motion (D6 step 1). */
  const dial = useSharedValue(0);
  const apexFired = useSharedValue(false);

  useEffect(() => {
    if (!visible) return;
    markIgnitionPlayed();
    let cancelled = false;
    void motionReady.then(() => {
      if (cancelled) return;
      if (!motionEnabled()) {
        // Reduce Motion: no ceremony, no haptic — instant content.
        setVisible(false);
        return;
      }
      dial.value = withTiming(1, { duration: IGNITION_KEYSET_MS, easing: Easing.out(Easing.quad) });
      // ONE continuous spring: accelerate, overshoot once, settle. The spring
      // is never retargeted — staged hops are exactly what got rejected.
      progress.value = withDelay(IGNITION_KEYSET_MS, withSpring(1, IGNITION_SPRING));
      veil.value = withDelay(
        IGNITION_REVEAL_MS,
        withTiming(0, { duration: IGNITION_FADE_MS, easing: Easing.out(Easing.quad) }, (finished) => {
          if (finished) runOnJS(setVisible)(false);
        }),
      );
    });
    return () => {
      cancelled = true;
    };
    // Mount-only: the ceremony is a single choreography, never re-entered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The one haptic: a light impact exactly at the overshoot apex — the moment
  // the needle's mass carries it past the end-stop and it starts back.
  useAnimatedReaction(
    () => progress.value,
    (current, previous) => {
      if (!apexFired.value && previous !== null && previous > 1 && current < previous) {
        apexFired.value = true;
        runOnJS(apex)();
      }
    },
  );

  const layout = dialLayout(size);
  const trail = arcSpan(layout.trailRadius);

  const veilStyle = useAnimatedStyle(() => ({ opacity: veil.value }));
  const dialStyle = useAnimatedStyle(() => ({ opacity: dial.value }));

  // Glow trail chases the needle (clamped — the trail never overshoots the
  // throw; only the needle's mass does).
  const trailHaloProps = useAnimatedProps(() => {
    const f = Math.min(1, Math.max(0, progress.value));
    return { strokeDashoffset: trail.arcLength * (1 - f) };
  });
  const trailCoreProps = useAnimatedProps(() => {
    const f = Math.min(1, Math.max(0, progress.value));
    return { strokeDashoffset: trail.arcLength * (1 - f) };
  });

  // The needle: tip + counterweight tail, rotated by raw trig so the whole
  // move is a single UI-thread interpolation.
  const needleProps = useAnimatedProps(() => {
    const f = Math.min(MAX_NEEDLE_FRACTION, Math.max(0, progress.value));
    const a = ((SWEEP_START_DEGREES + f * SWEEP_DEGREES) * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    return {
      x1: layout.c - layout.needleTail * cos,
      y1: layout.c - layout.needleTail * sin,
      x2: layout.c + layout.needleTip * cos,
      y2: layout.c + layout.needleTip * sin,
    };
  });

  if (!visible) return null;

  return (
    <Animated.View
      // Never block the app: the user can interact with content beneath the
      // veil even while it is lifting.
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.veil, veilStyle]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={dialStyle}>
        <Svg width={size} height={size}>
          {/* Graduated tick arc: minors faint, majors brighter and longer. */}
          {TICKS.map((t) => {
            const inner = t.major ? layout.tickMajorInner : layout.tickMinorInner;
            const p1 = polarPoint(layout.c, layout.c, inner, t.angleDeg);
            const p2 = polarPoint(layout.c, layout.c, layout.tickOuter, t.angleDeg);
            return (
              <Line
                key={t.angleDeg}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke={t.major ? color.textTertiary : color.hairline}
                strokeWidth={t.major ? 2 : 1}
                strokeLinecap="round"
              />
            );
          })}
          {/* Track: the full throw, hairline-faint — the unlit gauge face. */}
          <Circle
            cx={layout.c}
            cy={layout.c}
            r={layout.trailRadius}
            stroke={color.hairline}
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray={arcDashArray(trail)}
            strokeDashoffset={0}
            fill="none"
            rotation={SWEEP_START_DEGREES}
            origin={`${layout.c}, ${layout.c}`}
          />
          {/* Glow trail — two intensities only (D8): wide soft halo… */}
          <AnimatedCircle
            cx={layout.c}
            cy={layout.c}
            r={layout.trailRadius}
            stroke={color.accent}
            strokeOpacity={0.16}
            strokeWidth={10}
            strokeLinecap="round"
            strokeDasharray={arcDashArray(trail)}
            animatedProps={trailHaloProps}
            fill="none"
            rotation={SWEEP_START_DEGREES}
            origin={`${layout.c}, ${layout.c}`}
          />
          {/* …and a narrow lit core. */}
          <AnimatedCircle
            cx={layout.c}
            cy={layout.c}
            r={layout.trailRadius}
            stroke={color.accent}
            strokeOpacity={0.45}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeDasharray={arcDashArray(trail)}
            animatedProps={trailCoreProps}
            fill="none"
            rotation={SWEEP_START_DEGREES}
            origin={`${layout.c}, ${layout.c}`}
          />
          {/* The needle: full amber, with mass — tail balances the tip. */}
          <AnimatedLine
            animatedProps={needleProps}
            stroke={color.accent}
            strokeWidth={3}
            strokeLinecap="round"
          />
          {/* Hub: a machined boss with a lit center cap. */}
          <Circle
            cx={layout.c}
            cy={layout.c}
            r={layout.hubRadius}
            fill={color.surface1}
            stroke={color.surface2}
            strokeWidth={2}
          />
          <Circle cx={layout.c} cy={layout.c} r={2.5} fill={color.accent} />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  veil: {
    backgroundColor: color.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
