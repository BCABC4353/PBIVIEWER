/**
 * PROD-S1: useKioskExitGesture
 *
 * Explicit, kiosk-safe exit affordances layered on top of the single-Escape
 * exit (which the browser already wires via fullscreenchange):
 *   1. 3-second Escape HOLD  — hold Escape for KIOSK.ESCAPE_HOLD_MS to exit.
 *   2. Ctrl+Shift+Esc chord  — immediate deliberate exit.
 *
 * Both call the supplied onExit (PresentationMode.doExit). The hold timer is
 * armed on the first Escape keydown and cancelled on keyup or on any other key,
 * so a tap-Escape (which the browser turns into a fullscreen exit) doesn't also
 * fire the hold. All timers/listeners are cleaned up on unmount.
 *
 * isChordExit / isEscape are exported as pure helpers so the gesture logic can
 * be unit-tested without a DOM.
 */

import { useEffect, useRef } from 'react';
import { KIOSK } from '../../../shared/constants';

/** Minimal shape of the keyboard event fields the gesture logic inspects. */
export interface GestureKey {
  key: string;
  ctrlKey: boolean;
  shiftKey: boolean;
}

/** True for the Escape key (covers both `key` spellings across engines). */
export function isEscape(e: GestureKey): boolean {
  return e.key === 'Escape' || e.key === 'Esc';
}

/** True for the Ctrl+Shift+Esc deliberate-exit chord. */
export function isChordExit(e: GestureKey): boolean {
  return e.ctrlKey && e.shiftKey && isEscape(e);
}

export interface UseKioskExitGestureOptions {
  /** Called when a kiosk exit gesture completes. */
  onExit: () => void;
  /** When false the gesture listeners are not attached. */
  enabled?: boolean;
  /** Escape-hold duration (ms). Defaults to KIOSK.ESCAPE_HOLD_MS. */
  holdMs?: number;
}

export function useKioskExitGesture({
  onExit,
  enabled = true,
  holdMs = KIOSK.ESCAPE_HOLD_MS,
}: UseKioskExitGestureOptions): void {
  // Keep latest onExit without re-binding listeners on identity changes.
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  const holdMsRef = useRef(holdMs);
  holdMsRef.current = holdMs;

  useEffect(() => {
    if (!enabled) return;

    let holdTimer: NodeJS.Timeout | null = null;

    const clearHold = () => {
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+Esc — immediate kiosk-safe exit.
      if (isChordExit(e)) {
        e.preventDefault();
        clearHold();
        onExitRef.current();
        return;
      }

      // Escape hold — arm once on first keydown; key repeat re-fires keydown
      // without an intervening keyup, so ignore repeats while armed.
      if (isEscape(e)) {
        if (holdTimer) return;
        holdTimer = setTimeout(() => {
          holdTimer = null;
          onExitRef.current();
        }, holdMsRef.current);
        return;
      }

      // Any other key cancels an in-progress hold.
      clearHold();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (isEscape(e)) clearHold();
    };

    // Releasing modifier keys / losing focus also cancels the hold.
    const handleBlur = () => clearHold();

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      clearHold();
    };
  }, [enabled]);
}

export default useKioskExitGesture;
