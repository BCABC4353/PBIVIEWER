/**
 * reduceMotion — RN shell wiring AccessibilityInfo into the pure
 * createReduceMotionCache (motionCore.ts). One app-wide singleton: animations
 * ask `motionEnabled()` SYNCHRONOUSLY at the moment they start; the cache
 * stays correct via the OS subscription.
 */
import { AccessibilityInfo } from 'react-native';
import { createReduceMotionCache } from './motionCore';

const cache = createReduceMotionCache({
  getInitial: () => AccessibilityInfo.isReduceMotionEnabled(),
  subscribe: (onChange) => {
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', onChange);
    return () => sub.remove();
  },
});

/** True when full motion is allowed (Reduce Motion is OFF). Synchronous. */
export const motionEnabled = (): boolean => cache.motionEnabled();
