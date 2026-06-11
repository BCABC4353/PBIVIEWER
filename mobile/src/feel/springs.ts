import { AccessibilityInfo, Easing } from 'react-native';
import { createReduceMotionCache, springFromResponse } from './motionCore';

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
  nav: spec(0.45, 0.86, true),

  card: spec(0.42, 0.82),

  gesture: spec(0.15, 0.86),

  arrival: spec(0.4, 0.8),
} as const satisfies Record<string, FeelSpring>;

export const timing = {
  fade: 250,
  stagger: 45,
  count: 600,
  pulse: 1800,
  shimmer: 1200,
} as const;

export const ease = {
  out: Easing.out(Easing.cubic),
  inOut: Easing.inOut(Easing.ease),
} as const;


const reduceMotionCache = createReduceMotionCache({
  getInitial: () => AccessibilityInfo.isReduceMotionEnabled(),
  subscribe: (onChange) => {
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', onChange);
    return () => sub.remove();
  },
});

export function motionEnabled(): boolean {
  return reduceMotionCache.motionEnabled();
}

export const motionReady: Promise<void> = reduceMotionCache.ready;
