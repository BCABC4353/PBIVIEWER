import { useCallback, useEffect, useRef } from 'react';
import * as pbi from 'powerbi-client';
import type { EmbedContext } from './embedTypes';
import { TOKEN_REFRESH_LEAD_MS } from './embedTypes';

export interface UseEmbedTokenRefreshOptions {
  workspaceId: string | undefined;
  itemId: string | undefined;
}

export interface UseEmbedTokenRefreshResult {
  /** Manual token refresh — also wired to visibilitychange and the proactive timer. */
  refreshEmbedToken: () => Promise<void>;
  /** Schedules the one-shot proactive refresh for the current token expiry. */
  scheduleProactiveRefresh: () => void;
  /** Cancels any pending proactive-refresh timer. Idempotent. */
  clearProactiveRefresh: () => void;
}

/**
 * Token lifecycle for the embed.
 *
 * Owns the proactive-refresh timer, the manual/automatic `refreshEmbedToken`
 * call, and the visibilitychange backstop.
 */
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

  // refreshEmbedToken needs to reference itself (re-schedule after success)
  // and is called from setTimeouts created before it's defined. A ref breaks
  // the cycle without forcing a re-render dance.
  const refreshEmbedTokenRef = useRef<(() => Promise<void>) | null>(null);

  /**
   * Schedules a one-shot setTimeout that fires 2 min before token expiry.
   * Runs regardless of document.visibilityState — kiosk / wall-display use
   * case. The visibilitychange backstop in another effect handles the case
   * where the tab was suspended through the proactive window.
   */
  const scheduleProactiveRefresh = useCallback(() => {
    clearProactiveRefresh();
    const expiration = tokenExpirationRef.current;
    if (!expiration) return;
    const expirationMs = new Date(expiration).getTime();
    if (!Number.isFinite(expirationMs)) return;
    const fireAt = expirationMs - TOKEN_REFRESH_LEAD_MS;
    const rawDelay = fireAt - Date.now();
    if (rawDelay <= 0) {
      // Already inside the refresh window — fire immediately on next tick.
      proactiveRefreshRef.current = setTimeout(() => {
        void refreshEmbedTokenRef.current?.();
      }, 0);
      return;
    }
    // Clamp to 24h: a malformed far-future expiry could otherwise exceed
    // setTimeout's 2^31-1 ms ceiling, which silently fires IMMEDIATELY. Capping
    // means we re-evaluate at most a day out and reschedule against the real
    // expiry then, instead of busy-refreshing.
    const delay = Math.min(rawDelay, 24 * 60 * 60 * 1000);
    proactiveRefreshRef.current = setTimeout(() => {
      void refreshEmbedTokenRef.current?.();
    }, delay);
  }, [clearProactiveRefresh, tokenExpirationRef]);

  const refreshEmbedToken = useCallback(async (): Promise<void> => {
    if (!workspaceId || !itemId) return;
    if (tokenRefreshInProgressRef.current) return;
    // Capture the generation NOW. If a rapid report-to-report switch bumps
    // generation while we're awaiting the IPC, this call's result is for the
    // old embed — discard it instead of writing to refs / triggering reloads
    // on the new one.
    const myGen = generationRef.current;
    // Skip work if the embed isn't actually loaded — visibility-change and
    // proactive-timer callers can fire mid-load. Do NOT trigger a reload from
    // this branch: a stale callback reloading would stomp the new load.
    if (!embedRef.current || !hasLoadedRef.current) return;
    tokenRefreshInProgressRef.current = true;
    try {
      const tokenResponse = await window.electronAPI.content.getEmbedToken(
        itemId,
        workspaceId
      );

      // Bail if the generation moved while we were awaiting the IPC.
      if (myGen !== generationRef.current) return;

      if (!tokenResponse.success) {
        // Prefer the friendly userMessage when the main process supplies
        // one; fall back to the raw message so logs still carry full detail.
        throw new Error(
          tokenResponse.error.userMessage ||
            tokenResponse.error.message ||
            'Failed to refresh access token'
        );
      }

      tokenExpirationRef.current = tokenResponse.data.expiration;
      const token = tokenResponse.data.token;

      // Re-check the embed is still alive and loaded after the await.
      if (embedRef.current && hasLoadedRef.current && myGen === generationRef.current) {
        // powerbi-client typings split setAccessToken between Report/Dashboard,
        // but the runtime method exists on all loaded embeds.
        await (embedRef.current as pbi.Report).setAccessToken(token);
        // Same story for refresh().
        await (embedRef.current as pbi.Report).refresh();
        if (myGen !== generationRef.current) return;
        // Reschedule proactive refresh for the new expiry.
        scheduleProactiveRefresh();
      }
    } catch (err) {
      // Only surface errors if this refresh is still relevant to the current
      // embed. A stale failure must not paint over a healthy new load.
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

  // Visibility-change backstop — proactive timer covers the common case,
  // this catches "tab was suspended through the proactive window".
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
