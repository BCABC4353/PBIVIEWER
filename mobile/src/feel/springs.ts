/**
 * springs — the app's entire motion vocabulary, translated from
 * docs/design/IOS-CRAFT-SPEC.md §4.1 into RN Animated.spring configs.
 *
 * MAPPING (exact, not eyeballed): RN's Animated.spring accepts the physical
 * stiffness/damping/mass triple and integrates the same damped-harmonic
 * oscillator as iOS CASpringAnimation, so SwiftUI's
 * `.spring(response:dampingFraction:)` converts losslessly:
 *
 *     stiffness = (2π / response)² · mass        (mass = 1)
 *     damping   = dampingFraction · 2 · √stiffness
 *
 * (We deliberately do NOT use friction/tension or speed/bounciness — those are
 * legacy Origami vocabularies that RN internally converts to this same model.)
 *
 * Rule of the house: stillness is the default. Anything the finger drags uses
 * `springs.gesture`; anything the system launches on release uses the others.
 * High damping, no toy bounce — weight, not wobble.
 */
import { AccessibilityInfo, Easing } from 'react-native';
import { createReduceMotionCache, springFromResponse } from './motionCore';

/** An Animated.spring config minus toValue — spread it at the call site. */
export interface FeelSpring {
  stiffness: number;
  damping: number;
  mass: number;
  overshootClamping?: boolean;
  useNativeDriver: boolean;
}

function spec(responseSec: number, dampingFraction: number, overshootClamping = false): FeelSpring {
  return { ...springFromResponse(responseSec, dampingFraction), overshootClamping, useNativeDriver: true };
}

export const springs = {
  /**
   * Screen / tab transitions. SwiftUI 0.45 / 0.86 ("confident, settles clean").
   * Overshoot-clamped: navigation NEVER bounces.
   */
  nav: spec(0.45, 0.86, true),

  /**
   * Card expand / collapse / press scale. SwiftUI 0.42 / 0.82
   * ("weighty lift, no wobble") — a whisper of life, fully settled.
   */
  card: spec(0.42, 0.82),

  /**
   * Finger-tracked: drag-release, rubber-band catch, over-scroll settle.
   * SwiftUI interactiveSpring 0.15 / 0.86 — very stiff so it follows the
   * finger near-1:1 and catches immediately on release.
   */
  gesture: spec(0.15, 0.86),

  /**
   * Element / alert arrival ("arrives with intent"). SwiftUI 0.40 / 0.80 —
   * the weighted drop-in: lands, takes one breath of settle, stops.
   */
  arrival: spec(0.4, 0.8),
} as const satisfies Record<string, FeelSpring>;

/** Durations (ms) for the non-spring moments. */
export const timing = {
  /** Cross-fades: skeleton → content, opacity dips (spec §5.5: 250ms). */
  fade: 250,
  /** Per-item entrance stagger — see <Entrance index>. */
  stagger: 45,
  /** AnimatedNumber count-up length (ease-out). */
  count: 600,
  /** One full breath of the in-progress Pulse (1 → 0.45 → 1). */
  pulse: 1800,
  /** One shimmer sweep across a skeleton block (spec §5.5: ~1.2s). */
  shimmer: 1200,
} as const;

/** The easing for non-spring moves. Springs carry their own physics. */
export const ease = {
  /** Count-ups and arrivals that decelerate into place. */
  out: Easing.out(Easing.cubic),
  /** Breathing loops — symmetric, organic. */
  inOut: Easing.inOut(Easing.ease),
} as const;

// ---------------------------------------------------------------------------
// Reduce Motion
// ---------------------------------------------------------------------------

const reduceMotionCache = createReduceMotionCache({
  getInitial: () => AccessibilityInfo.isReduceMotionEnabled(),
  subscribe: (onChange) => {
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', onChange);
    return () => sub.remove();
  },
});

/**
 * Synchronous gate every primitive checks before moving anything.
 * `true`  → full spring motion.
 * `false` → OS Reduce Motion is ON: degrade to opacity-only (fade in place,
 *           static pulse, no translation/scale). Cached at startup and kept
 *           live via the `reduceMotionChanged` subscription.
 */
export function motionEnabled(): boolean {
  return reduceMotionCache.motionEnabled();
}

/** Resolves once the initial OS Reduce Motion read has landed (rarely needed). */
export const motionReady: Promise<void> = reduceMotionCache.ready;
