/**
 * useCursorHide
 *
 * Hides the mouse cursor after a few seconds of inactivity while in
 * presentation/fullscreen, and reveals it on mousemove.
 *
 * Returns `cursorHidden` so the overlay can toggle a `cursor-none` utility
 * class. The inactivity timer is reset on every mousemove and cleaned up on
 * unmount; the listener is bound to `document` only (window re-dispatches the
 * same bubbled mousemove, which would fire the handler twice).
 */

import { useEffect, useState, useRef } from 'react';
import { KIOSK } from '../../../shared/constants';

export interface UseCursorHideOptions {
  /** When false the timer is disabled and the cursor is always shown. */
  enabled?: boolean;
  /** Inactivity delay before hiding (ms). Defaults to KIOSK.CURSOR_HIDE_MS. */
  delayMs?: number;
}

export function useCursorHide({
  enabled = true,
  delayMs = KIOSK.CURSOR_HIDE_MS,
}: UseCursorHideOptions = {}): boolean {
  const [cursorHidden, setCursorHidden] = useState(false);

  // Avoid re-arming the effect (and re-binding the listener) when only the
  // delay changes mid-flight — read it through a ref.
  const delayRef = useRef(delayMs);
  delayRef.current = delayMs;

  useEffect(() => {
    if (!enabled) {
      setCursorHidden(false);
      return;
    }

    let timeout: NodeJS.Timeout | undefined;

    const arm = () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => setCursorHidden(true), delayRef.current);
    };

    const handleMouseMove = () => {
      setCursorHidden(false);
      arm();
    };

    // Start the inactivity countdown immediately on mount.
    arm();
    document.addEventListener('mousemove', handleMouseMove);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      if (timeout) clearTimeout(timeout);
    };
  }, [enabled]);

  return cursorHidden;
}

export default useCursorHide;
