/**
 * useKioskExitGesture
 *
 * Explicit, kiosk-safe exit affordances layered on top of the single-Escape
 * exit (which the browser already wires via fullscreenchange):
 *   1. 3-second Escape HOLD  — primary gesture: hold Escape for
 *      KIOSK.ESCAPE_HOLD_MS to exit.
 *   2. Ctrl+Shift+Q chord    — immediate deliberate exit.
 *
 * Do NOT use Ctrl+Shift+Esc for the chord: it is the Windows Task Manager
 * system hotkey, and the OS intercepts it before it can reach the app.
 * Ctrl+Shift+Q is not OS-reserved on Windows and is not a default
 * Chromium/Electron renderer shortcut, so the keydown actually reaches the app.
 * (Alt+F4 is deliberately avoided: it kills the window instead of running the
 * graceful doExit teardown.)
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

/**
 * True for the Ctrl+Shift+Q deliberate-exit chord.
 *
 * Not Ctrl+Shift+Esc — Windows intercepts that as the Task Manager hotkey
 * before it can reach the app. The `q`
 * comparison is case-insensitive because Shift uppercases the emitted `key`.
 */
export function isChordExit(e: GestureKey): boolean {
  return e.ctrlKey && e.shiftKey && (e.key === 'q' || e.key === 'Q');
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
      // Ctrl+Shift+Q — immediate kiosk-safe exit.
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
