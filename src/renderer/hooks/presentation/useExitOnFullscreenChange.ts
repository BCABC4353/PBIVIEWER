/**
 * ARCH-S7: useExitOnFullscreenChange
 *
 * Owns the fullscreen lifecycle for presentation mode, extracted verbatim:
 * 1. Attempt to enter fullscreen on mount (non-blocking; tracks success via an
 *    internal ref so a later exit only fires after we actually entered).
 * 2. Listen for fullscreen exit — Escape pulls the document out of fullscreen,
 *    which is the cue to tear down the embed and navigate back to the report.
 *
 * The teardown/navigate path mirrors doExit() but is intentionally inlined here
 * (PERF-S2 / ARCH-S1 teardownNow delegation preserved). The caller supplies the
 * shared isExitingRef and slideshowIntervalRef so both exit paths coordinate.
 */

import { useEffect, useRef } from 'react';
import type { NavigateFunction } from 'react-router-dom';

export interface UseExitOnFullscreenChangeParams {
  workspaceId: string | undefined;
  reportId: string | undefined;
  navigate: NavigateFunction;
  teardownNow: () => void;
  isExitingRef: React.MutableRefObject<boolean>;
  slideshowIntervalRef: React.MutableRefObject<NodeJS.Timeout | null>;
}

export function useExitOnFullscreenChange({
  workspaceId,
  reportId,
  navigate,
  teardownNow,
  isExitingRef,
  slideshowIntervalRef,
}: UseExitOnFullscreenChangeParams): void {
  // hasEnteredFullscreen gates the fullscreenchange exit handler so it only
  // fires once we have actually entered fullscreen.
  const hasEnteredFullscreen = useRef(false);

  // Try to enter fullscreen on mount (don't block if it fails)
  useEffect(() => {
    document.documentElement.requestFullscreen?.().then(() => {
      hasEnteredFullscreen.current = true;
    }).catch(() => {});
  }, []);

  // Listen for fullscreen exit — Escape pulls us out of fullscreen, which
  // is our cue to navigate back to the standard report view.
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && !isExitingRef.current && hasEnteredFullscreen.current) {
        isExitingRef.current = true;

        // Stop slideshow
        if (slideshowIntervalRef.current) {
          clearInterval(slideshowIntervalRef.current);
          slideshowIntervalRef.current = null;
        }

        // PERF-S2 / ARCH-S1: delegate teardown to the hook — no direct
        // embed.off or powerbiService calls here. Forces iframe to stop
        // rendering before navigate() runs.
        teardownNow();

        if (workspaceId && reportId) {
          navigate(`/report/${workspaceId}/${reportId}`, { replace: true });
        } else {
          navigate('/', { replace: true });
        }
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [workspaceId, reportId, navigate, teardownNow, isExitingRef, slideshowIntervalRef]);
}

export default useExitOnFullscreenChange;
