
import { useEffect, useRef } from 'react';
import { kioskRecoveryDelayMs } from '../../../shared/constants';

export interface UseKioskRecoveryParams {
  error: string | null;
  loaded: boolean;
  active: boolean;
  recover: () => void;
}

export function useKioskRecovery({ error, loaded, active, recover }: UseKioskRecoveryParams): void {
  const attemptRef = useRef(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const recoverRef = useRef(recover);
  recoverRef.current = recover;

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    if (!active) {
      attemptRef.current = 0;
      clearTimer();
      return;
    }

    if (loaded) {
      attemptRef.current = 0;
      clearTimer();
      return;
    }

    if (!error) return clearTimer;

    if (timerRef.current) return clearTimer;

    const arm = () => {
      const delay = kioskRecoveryDelayMs(attemptRef.current);
      timerRef.current = setTimeout(() => {
        attemptRef.current += 1;
        recoverRef.current();
        arm();
      }, delay);
    };

    arm();
    return clearTimer;
  }, [error, loaded, active]);

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
