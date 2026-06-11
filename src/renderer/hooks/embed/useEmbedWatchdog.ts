import { useCallback, useRef } from 'react';
import type { EmbedContext } from './embed-types';

export interface UseEmbedWatchdogResult {
  clearWatchdog: () => void;
  armWatchdog: (generation: number) => void;
}

export function useEmbedWatchdog(
  ctx: EmbedContext,
  watchdogMs: number
): UseEmbedWatchdogResult {
  const watchdogRef = useRef<NodeJS.Timeout | null>(null);

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const { generationRef, hasLoadedRef, setError, setIsLoading } = ctx;

  const armWatchdog = useCallback(
    (generation: number) => {
      clearWatchdog();
      watchdogRef.current = setTimeout(() => {
        if (generation !== generationRef.current) return;
        if (hasLoadedRef.current) return;
        setError(
          'This is taking too long to load. Check your connection and try again.'
        );
        setIsLoading(false);
      }, watchdogMs);
    },
    [clearWatchdog, generationRef, hasLoadedRef, setError, setIsLoading, watchdogMs]
  );

  return { clearWatchdog, armWatchdog };
}
