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

const TICK_MINOR_COLOR = 'rgba(255,255,255,0.18)';
const TICK_MAJOR_COLOR = 'rgba(255,255,255,0.55)';
const TRACK_COLOR = 'rgba(255,255,255,0.06)';
const NEEDLE_BASE_HALF = 2.4;
const NEEDLE_TIP_HALF = 0.6;

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
  size?: number;
}

export function IgnitionOverlay({ size = 200 }: IgnitionOverlayProps) {
  const [visible, setVisible] = useState(() => !ignitionHasPlayed());

  const progress = useSharedValue(0);
  const veil = useSharedValue(1);
  const dial = useSharedValue(0);
  const apexFired = useSharedValue(false);

  useEffect(() => {
    if (!visible) return;
    markIgnitionPlayed();
    let cancelled = false;
    void motionReady.then(() => {
      if (cancelled) return;
      if (!motionEnabled()) {
        setVisible(false);
        return;
      }
      dial.value = withTiming(1, { duration: IGNITION_KEYSET_MS, easing: Easing.out(Easing.quad) });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.veil, veilStyle]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={dialStyle}>
        <Svg width={size} height={size}>
          <Defs>
            {}
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

          {}
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

          {}
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

          {}
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

          {}
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
          {}
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
          {}
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

          {}
          <AnimatedLine
            animatedProps={tailProps}
            stroke={color.accentDeep}
            strokeWidth={4.5}
            strokeLinecap="round"
          />
          <AnimatedPolygon animatedProps={bladeProps} fill={color.accent} />

          {}
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
