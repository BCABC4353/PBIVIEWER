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
 *   - The dial is an instrument with a BODY: a radially-lit face under one
 *     top light (D1/D4), graduated minor/major ticks, an unlit groove, a lit
 *     arc built from three stops of one light (breath, bloom, filament — the
 *     filament at FULL opacity is what makes it read as light, not mud), a
 *     tapered needle blade with a counterweight stub, and a machined hub.
 *     Geometry was tuned by rendering frames and judging them BY EYE —
 *     change numbers here only with a rendered before/after.
 *   - One continuous underdamped spring — accelerate, one proud overshoot,
 *     settle. ONE light haptic at the apex. Reduce Motion → nothing at all.
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
import Svg, { Circle, Defs, Line, Polygon, RadialGradient, Stop } from 'react-native-svg';
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
const AnimatedPolygon = Animated.createAnimatedComponent(Polygon);

/** Tick contrast: minors present, majors authoritative. */
const TICK_MINOR_COLOR = 'rgba(255,255,255,0.18)';
const TICK_MAJOR_COLOR = 'rgba(255,255,255,0.55)';
/** The unlit groove the light travels in. */
const TRACK_COLOR = 'rgba(255,255,255,0.06)';
/** Needle blade half-widths: machined taper, wide at the hub, fine at the tip. */
const NEEDLE_BASE_HALF = 2.4;
const NEEDLE_TIP_HALF = 0.6;

/** Dial proportions, all derived from `size` so the instrument scales whole.
 *  The lit arc hugs the tick band (no empty moat) and the needle tip reaches
 *  INTO the ticks — the blade and the light meet at the same radius. */
function dialLayout(size: number) {
  const c = size / 2;
  const faceRadius = c - 2;
  const tickOuter = c - 10;
  const arcRadius = tickOuter - 16;
  return {
    c,
    faceRadius,
    tickOuter,
    tickMinorInner: tickOuter - 6,
    tickMajorInner: tickOuter - 11,
    arcRadius,
    needleTip: arcRadius + 4,
    needleTail: 14,
    hubRadius: 12,
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
export function IgnitionOverlay({ size = 200 }: IgnitionOverlayProps) {
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
  const arc = arcSpan(layout.arcRadius);

  const veilStyle = useAnimatedStyle(() => ({ opacity: veil.value }));
  const dialStyle = useAnimatedStyle(() => ({ opacity: dial.value }));

  // The lit arc chases the needle (clamped — the light never overshoots the
  // throw; only the needle's mass does). Three stops of ONE light share the
  // same offset: breath (wide, faint), bloom (mid), filament (full opacity).
  const litArcBreathProps = useAnimatedProps(() => {
    const f = Math.min(1, Math.max(0, progress.value));
    return { strokeDashoffset: arc.arcLength * (1 - f) };
  });
  const litArcBloomProps = useAnimatedProps(() => {
    const f = Math.min(1, Math.max(0, progress.value));
    return { strokeDashoffset: arc.arcLength * (1 - f) };
  });
  const litArcFilamentProps = useAnimatedProps(() => {
    const f = Math.min(1, Math.max(0, progress.value));
    return { strokeDashoffset: arc.arcLength * (1 - f) };
  });

  // The needle blade: a tapered polygon (machined, not drawn) — wide at the
  // hub, fine at the tip, the whole move one UI-thread interpolation.
  const bladeProps = useAnimatedProps(() => {
    const f = Math.min(MAX_NEEDLE_FRACTION, Math.max(0, progress.value));
    const a = ((SWEEP_START_DEGREES + f * SWEEP_DEGREES) * Math.PI) / 180;
    const dirX = Math.cos(a);
    const dirY = Math.sin(a);
    const perpX = -dirY;
    const perpY = dirX;
    const baseR = layout.hubRadius - 2;
    const bx = layout.c + baseR * dirX;
    const by = layout.c + baseR * dirY;
    const nx = layout.c + (layout.needleTip - 1) * dirX;
    const ny = layout.c + (layout.needleTip - 1) * dirY;
    const tx = layout.c + layout.needleTip * dirX;
    const ty = layout.c + layout.needleTip * dirY;
    const points =
      `${bx + NEEDLE_BASE_HALF * perpX},${by + NEEDLE_BASE_HALF * perpY} ` +
      `${nx + NEEDLE_TIP_HALF * perpX},${ny + NEEDLE_TIP_HALF * perpY} ` +
      `${tx},${ty} ` +
      `${nx - NEEDLE_TIP_HALF * perpX},${ny - NEEDLE_TIP_HALF * perpY} ` +
      `${bx - NEEDLE_BASE_HALF * perpX},${by - NEEDLE_BASE_HALF * perpY}`;
    return { points };
  });

  // Counterweight stub: short, deeper amber — the mass behind the blade.
  const tailProps = useAnimatedProps(() => {
    const f = Math.min(MAX_NEEDLE_FRACTION, Math.max(0, progress.value));
    const a = ((SWEEP_START_DEGREES + f * SWEEP_DEGREES) * Math.PI) / 180;
    return {
      x1: layout.c,
      y1: layout.c,
      x2: layout.c - layout.needleTail * Math.cos(a),
      y2: layout.c - layout.needleTail * Math.sin(a),
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
          <Defs>
            {/* One top light over the whole face (D4). */}
            <RadialGradient id="ignition-face" cx="50%" cy="38%" rx="75%" ry="75%">
              <Stop offset="0%" stopColor="#1A1A1E" />
              <Stop offset="62%" stopColor={color.surface1} />
              <Stop offset="100%" stopColor="#0E0E11" />
            </RadialGradient>
            <RadialGradient id="ignition-hub" cx="50%" cy="35%" rx="80%" ry="80%">
              <Stop offset="0%" stopColor="#26262C" />
              <Stop offset="100%" stopColor={color.surface1} />
            </RadialGradient>
          </Defs>

          {/* Instrument body: a material, not a void. */}
          <Circle cx={layout.c} cy={layout.c} r={layout.faceRadius} fill="url(#ignition-face)" />
          <Circle
            cx={layout.c}
            cy={layout.c}
            r={layout.faceRadius}
            fill="none"
            stroke="rgba(255,255,255,0.07)"
            strokeWidth={1}
          />
          <Circle
            cx={layout.c}
            cy={layout.c - 0.5}
            r={layout.faceRadius - 1}
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth={1}
          />

          {/* Graduated tick arc: minors present, majors authoritative. */}
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
                stroke={t.major ? TICK_MAJOR_COLOR : TICK_MINOR_COLOR}
                strokeWidth={t.major ? 2 : 1}
                strokeLinecap="round"
              />
            );
          })}

          {/* Unlit groove: the full throw the light will travel. */}
          <Circle
            cx={layout.c}
            cy={layout.c}
            r={layout.arcRadius}
            stroke={TRACK_COLOR}
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={arcDashArray(arc)}
            strokeDashoffset={0}
            fill="none"
            rotation={SWEEP_START_DEGREES}
            origin={`${layout.c}, ${layout.c}`}
          />

          {/* The lit arc — three stops of one light (D8: two glow intensities
              around a full-opacity filament). Breath… */}
          <AnimatedCircle
            cx={layout.c}
            cy={layout.c}
            r={layout.arcRadius}
            stroke={color.accent}
            strokeOpacity={0.07}
            strokeWidth={13}
            strokeLinecap="round"
            strokeDasharray={arcDashArray(arc)}
            animatedProps={litArcBreathProps}
            fill="none"
            rotation={SWEEP_START_DEGREES}
            origin={`${layout.c}, ${layout.c}`}
          />
          {/* …bloom… */}
          <AnimatedCircle
            cx={layout.c}
            cy={layout.c}
            r={layout.arcRadius}
            stroke={color.accent}
            strokeOpacity={0.22}
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray={arcDashArray(arc)}
            animatedProps={litArcBloomProps}
            fill="none"
            rotation={SWEEP_START_DEGREES}
            origin={`${layout.c}, ${layout.c}`}
          />
          {/* …filament: FULL opacity — this is what reads as light. */}
          <AnimatedCircle
            cx={layout.c}
            cy={layout.c}
            r={layout.arcRadius}
            stroke={color.accent}
            strokeOpacity={1}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeDasharray={arcDashArray(arc)}
            animatedProps={litArcFilamentProps}
            fill="none"
            rotation={SWEEP_START_DEGREES}
            origin={`${layout.c}, ${layout.c}`}
          />

          {/* Counterweight stub behind the hub, then the tapered blade. */}
          <AnimatedLine
            animatedProps={tailProps}
            stroke={color.accentDeep}
            strokeWidth={4.5}
            strokeLinecap="round"
          />
          <AnimatedPolygon animatedProps={bladeProps} fill={color.accent} />

          {/* Hub: a machined boss with weight, top-lit, amber pip center. */}
          <Circle cx={layout.c} cy={layout.c} r={layout.hubRadius} fill="url(#ignition-hub)" />
          <Circle
            cx={layout.c}
            cy={layout.c}
            r={layout.hubRadius}
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth={1}
          />
          <Circle cx={layout.c} cy={layout.c} r={3.2} fill={color.accent} />
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
