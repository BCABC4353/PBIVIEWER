import { useCallback, useRef } from 'react';
import type { EmbedContext } from './embedTypes';

export interface UseEmbedWatchdogResult {
  /** Clears any pending watchdog timer. Idempotent. */
  clearWatchdog: () => void;
  /**
   * Arms the watchdog for the given load generation. If neither 'loaded' nor a
   * pre-load 'error' arrives within `watchdogMs`, surfaces a timeout message —
   * but only while the captured generation is still current and the embed has
   * not loaded.
   */
  armWatchdog: (generation: number) => void;
}

/**
 * ARCH-S2: Watchdog timer for the embed load. Extracted verbatim from the
 * original monolithic hook — fires a "taking too long" error if the embed
 * never reports loaded or a pre-load error.
 */
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
