/**
 * useKioskRecovery
 *
 * Slideshow auto-recovery with backoff for unattended wall-display use.
 *
 * When the embedded report errors/crashes while a slideshow is running, this
 * hook schedules a recovery attempt (reload/re-embed) on the
 * KIOSK_RECOVERY_BACKOFF_MS schedule: 5s → 30s → 60s, then keeps retrying at
 * 60s. The backoff index advances on each scheduled attempt and resets once a
 * recovery succeeds (i.e. the error clears).
 *
 * Wiring contract:
 *   - `error`     — the embed error signal from usePowerBIEmbed (string | null).
 *   - `active`    — only attempt recovery while the slideshow is meant to be
 *                   running (caller passes isPlaying). When false, any pending
 *                   timer is cancelled and the backoff index is reset.
 *   - `recover`   — the action that re-embeds (usePowerBIEmbed.reload).
 *
 * The pending timer is always cleared on dependency change and on unmount, so
 * there are no leaks across exit/unmount.
 */

import { useEffect, useRef } from 'react';
import { kioskRecoveryDelayMs } from '../../../shared/constants';

export interface UseKioskRecoveryParams {
  /** Embed error signal (string while errored, null when healthy). */
  error: string | null;
  /** Whether recovery should be attempted (e.g. slideshow is playing). */
  active: boolean;
  /** Re-embed / reload action invoked on each recovery attempt. */
  recover: () => void;
}

export function useKioskRecovery({ error, active, recover }: UseKioskRecoveryParams): void {
  // Zero-based count of recovery attempts scheduled for the current error
  // streak. Drives the backoff delay; reset to 0 once the error clears.
  const attemptRef = useRef(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  // Keep the latest recover() without re-arming the effect on identity changes.
  const recoverRef = useRef(recover);
  recoverRef.current = recover;

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    // Healthy or inactive: a previous error has cleared (successful recovery)
    // or the slideshow stopped — reset backoff and cancel any pending attempt.
    if (!error || !active) {
      attemptRef.current = 0;
      clearTimer();
      return;
    }

    // Errored while active. Schedule a recovery and, since the error may persist
    // (a failed reload keeps `error` set, which doesn't change the deps and so
    // won't re-run this effect), self-chain the next attempt from inside the
    // callback. The chain stops when the error clears: this effect re-runs and
    // its cleanup cancels the pending timer. Don't stack timers for the streak.
    if (timerRef.current) return clearTimer;

    const arm = () => {
      const delay = kioskRecoveryDelayMs(attemptRef.current);
      timerRef.current = setTimeout(() => {
        // Advance the backoff index for the next attempt in this streak. The
        // index clamps inside kioskRecoveryDelayMs, so after the last step it
        // keeps retrying at the final (60s) delay.
        attemptRef.current += 1;
        recoverRef.current();
        // Re-arm for the next attempt. If the recovery succeeded, the next
        // render clears `error`, re-runs this effect, and the cleanup below
        // cancels this freshly-armed timer before it fires.
        arm();
      }, delay);
    };

    arm();
    return clearTimer;
  }, [error, active]);

  // Final safety: clear any pending timer on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);
}

export default useKioskRecovery;
