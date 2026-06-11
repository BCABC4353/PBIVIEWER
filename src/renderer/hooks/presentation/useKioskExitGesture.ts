
import { useEffect, useRef } from 'react';
import { KIOSK } from '../../../shared/constants';

export interface GestureKey {
  key: string;
  ctrlKey: boolean;
  shiftKey: boolean;
}

export function isEscape(e: GestureKey): boolean {
  return e.key === 'Escape' || e.key === 'Esc';
}

export function isChordExit(e: GestureKey): boolean {
  return e.ctrlKey && e.shiftKey && (e.key === 'q' || e.key === 'Q');
}

export interface UseKioskExitGestureOptions {
  onExit: () => void;
  enabled?: boolean;
  holdMs?: number;
}

export function useKioskExitGesture({
  onExit,
  enabled = true,
  holdMs = KIOSK.ESCAPE_HOLD_MS,
}: UseKioskExitGestureOptions): void {
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
      if (isChordExit(e)) {
        e.preventDefault();
        clearHold();
        onExitRef.current();
        return;
      }

      if (isEscape(e)) {
        if (holdTimer) return;
        holdTimer = setTimeout(() => {
          holdTimer = null;
          onExitRef.current();
        }, holdMsRef.current);
        return;
      }

      clearHold();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (isEscape(e)) clearHold();
    };

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
