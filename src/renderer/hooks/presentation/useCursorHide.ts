
import { useEffect, useState, useRef } from 'react';
import { KIOSK } from '../../../shared/constants';

export interface UseCursorHideOptions {
  enabled?: boolean;
  delayMs?: number;
}

export function useCursorHide({
  enabled = true,
  delayMs = KIOSK.CURSOR_HIDE_MS,
}: UseCursorHideOptions = {}): boolean {
  const [cursorHidden, setCursorHidden] = useState(false);

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
