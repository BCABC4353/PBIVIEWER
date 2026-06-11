import { useCallback, useEffect, useRef } from 'react';
import * as pbi from 'powerbi-client';
import type { EmbedContext } from './embed-types';
import { TOKEN_REFRESH_LEAD_MS } from './embed-types';

export interface UseEmbedTokenRefreshOptions {
  workspaceId: string | undefined;
  itemId: string | undefined;
}

export interface UseEmbedTokenRefreshResult {
  refreshEmbedToken: () => Promise<void>;
  scheduleProactiveRefresh: () => void;
  clearProactiveRefresh: () => void;
}

export function useEmbedTokenRefresh(
  ctx: EmbedContext,
  options: UseEmbedTokenRefreshOptions
): UseEmbedTokenRefreshResult {
  const { workspaceId, itemId } = options;
  const {
    embedRef,
    generationRef,
    hasLoadedRef,
    tokenExpirationRef,
    tokenRefreshInProgressRef,
    setError,
    setIsLoading,
  } = ctx;

  const proactiveRefreshRef = useRef<NodeJS.Timeout | null>(null);

  const clearProactiveRefresh = useCallback(() => {
    if (proactiveRefreshRef.current) {
      clearTimeout(proactiveRefreshRef.current);
      proactiveRefreshRef.current = null;
    }
  }, []);

  const refreshEmbedTokenRef = useRef<(() => Promise<void>) | null>(null);

  const scheduleProactiveRefresh = useCallback(() => {
    clearProactiveRefresh();
    const expiration = tokenExpirationRef.current;
    if (!expiration) return;
    const expirationMs = new Date(expiration).getTime();
    if (!Number.isFinite(expirationMs)) return;
    const fireAt = expirationMs - TOKEN_REFRESH_LEAD_MS;
    const rawDelay = fireAt - Date.now();
    if (rawDelay <= 0) {
      proactiveRefreshRef.current = setTimeout(() => {
        void refreshEmbedTokenRef.current?.();
      }, 0);
      return;
    }
    const delay = Math.min(rawDelay, 24 * 60 * 60 * 1000);
    proactiveRefreshRef.current = setTimeout(() => {
      void refreshEmbedTokenRef.current?.();
    }, delay);
  }, [clearProactiveRefresh, tokenExpirationRef]);

  const refreshEmbedToken = useCallback(async (): Promise<void> => {
    if (!workspaceId || !itemId) return;
    if (tokenRefreshInProgressRef.current) return;
    const myGen = generationRef.current;
    if (!embedRef.current || !hasLoadedRef.current) return;
    tokenRefreshInProgressRef.current = true;
    try {
      const tokenResponse = await window.electronAPI.content.getEmbedToken(
        itemId,
        workspaceId
      );

      if (myGen !== generationRef.current) return;

      if (!tokenResponse.success) {
        throw new Error(
          tokenResponse.error.userMessage ||
            tokenResponse.error.message ||
            'Failed to refresh access token'
        );
      }

      tokenExpirationRef.current = tokenResponse.data.expiration;
      const token = tokenResponse.data.token;

      if (embedRef.current && hasLoadedRef.current && myGen === generationRef.current) {
        await (embedRef.current as pbi.Report).setAccessToken(token);
        await (embedRef.current as pbi.Report).refresh();
        if (myGen !== generationRef.current) return;
        scheduleProactiveRefresh();
      }
    } catch (err) {
      if (myGen !== generationRef.current) return;
      setError(
        err instanceof Error
          ? err.message
          : 'Session expired. Please log in again.'
      );
      setIsLoading(false);
    } finally {
      if (myGen === generationRef.current) {
        tokenRefreshInProgressRef.current = false;
      }
    }
  }, [
    workspaceId,
    itemId,
    scheduleProactiveRefresh,
    embedRef,
    generationRef,
    hasLoadedRef,
    tokenExpirationRef,
    tokenRefreshInProgressRef,
    setError,
    setIsLoading,
  ]);

  useEffect(() => {
    refreshEmbedTokenRef.current = refreshEmbedToken;
  }, [refreshEmbedToken]);

  const isTokenExpiringSoon = useCallback(() => {
    const expiration = tokenExpirationRef.current;
    if (!expiration) return false;
    const expirationMs = new Date(expiration).getTime();
    return (
      Number.isFinite(expirationMs) &&
      Date.now() >= expirationMs - TOKEN_REFRESH_LEAD_MS
    );
  }, [tokenExpirationRef]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        isTokenExpiringSoon()
      ) {
        void refreshEmbedToken();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshEmbedToken, isTokenExpiringSoon]);

  return { refreshEmbedToken, scheduleProactiveRefresh, clearProactiveRefresh };
}
