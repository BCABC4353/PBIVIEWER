
import { useEffect, useRef, useState } from 'react';
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

export interface UseKioskExitGestureResult {
  isHolding: boolean;
  holdMs: number;
}

export function useKioskExitGesture({
  onExit,
  enabled = true,
  holdMs = KIOSK.ESCAPE_HOLD_MS,
}: UseKioskExitGestureOptions): UseKioskExitGestureResult {
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  const holdMsRef = useRef(holdMs);
  holdMsRef.current = holdMs;

  const [isHolding, setIsHolding] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    let holdTimer: NodeJS.Timeout | null = null;

    const clearHold = () => {
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
      setIsHolding(false);
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
        setIsHolding(true);
        holdTimer = setTimeout(() => {
          holdTimer = null;
          setIsHolding(false);
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

  return { isHolding, holdMs };
}

export default useKioskExitGesture;
