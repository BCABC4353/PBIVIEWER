
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
  const hasEnteredFullscreen = useRef(false);

  useEffect(() => {
    document.documentElement.requestFullscreen?.().then(() => {
      hasEnteredFullscreen.current = true;
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && !isExitingRef.current && hasEnteredFullscreen.current) {
        isExitingRef.current = true;

        if (slideshowIntervalRef.current) {
          clearInterval(slideshowIntervalRef.current);
          slideshowIntervalRef.current = null;
        }

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
