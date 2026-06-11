
import { useEffect, useRef } from 'react';
import { kioskRecoveryDelayMs } from '../../../shared/constants';

export interface UseKioskRecoveryParams {
  error: string | null;
  active: boolean;
  recover: () => void;
}

export function useKioskRecovery({ error, active, recover }: UseKioskRecoveryParams): void {
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

    if (!error || !active) {
      attemptRef.current = 0;
      clearTimer();
      return;
    }

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
  }, [error, active]);

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
