import { useCallback, useEffect, useRef, useState } from 'react';
import * as pbi from 'powerbi-client';
import { getErrorMessage, isTokenExpiredError } from '../../shared/utils';
import { usePowerBIService } from './usePowerBIService';

/**
 * Event handler map passed by callers. The hook owns 'loaded' and 'error'
 * lifecycle: caller's handlers for those names run AFTER the hook's
 * built-in housekeeping (watchdog clear, isLoading=false, hasLoaded flag,
 * token-expiry handling). Any other event names (pageChanged, tileClicked,
 * ...) are registered as-is on the embed.
 */
export type EmbedEventHandlers = Record<string, (event: any) => void>;

export interface UsePowerBIEmbedOptions {
  workspaceId: string | undefined;
  itemId: string | undefined;
  containerRef: React.RefObject<HTMLDivElement | null>;
  /**
   * Builds the embed configuration for the current load. Receives the freshly
   * fetched access token. Must return a complete IReportEmbedConfiguration or
   * IDashboardEmbedConfiguration including any viewer-specific settings.
   */
  buildConfig: (token: string) =>
    | pbi.IReportEmbedConfiguration
    | pbi.IDashboardEmbedConfiguration;
  /**
   * Viewer-supplied event handlers. The hook always registers 'loaded' and
   * 'error' (its built-ins) regardless of whether the caller provides them.
   * Caller handlers run after the hook's built-in housekeeping.
   */
  events?: EmbedEventHandlers;
  /** Re-enabled by default. Auto-refresh respects document visibility. */
  autoRefreshEnabled?: boolean;
  autoRefreshIntervalMinutes?: number;
  /** Watchdog timeout in ms. Default 45000. */
  watchdogMs?: number;
  /** Default error text when no detail is available. */
  errorFallback?: string;
  /**
   * If true, post-load 'error' events also surface to the error UI. Default
   * false (ReportViewer-style: post-load errors are silent). PresentationMode
   * and DashboardViewer want true.
   */
  surfacePostLoadErrors?: boolean;
}

export interface UsePowerBIEmbedResult {
  isLoading: boolean;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  embedRef: React.MutableRefObject<pbi.Embed | null>;
  /** Retry button calls this. Resets generation and runs a fresh load. */
  reload: () => void;
  /** Manual token refresh — also wired to visibilitychange and the proactive timer. */
  refreshEmbedToken: () => Promise<void>;
}

const DEFAULT_WATCHDOG_MS = 45000;
const DEFAULT_ERROR_FALLBACK = 'This report could not be loaded.';
const TOKEN_REFRESH_LEAD_MS = 2 * 60 * 1000; // refresh 2 min before expiry

export function usePowerBIEmbed(
  options: UsePowerBIEmbedOptions
): UsePowerBIEmbedResult {
  const {
    workspaceId,
    itemId,
    containerRef,
    buildConfig,
    events,
    autoRefreshEnabled = true,
    autoRefreshIntervalMinutes = 1,
    watchdogMs = DEFAULT_WATCHDOG_MS,
    errorFallback = DEFAULT_ERROR_FALLBACK,
    surfacePostLoadErrors = false,
  } = options;

  const powerbiService = usePowerBIService();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const embedRef = useRef<pbi.Embed | null>(null);
  // Generation counter — every load attempt bumps this. Async callbacks
  // (watchdog, loaded, error) capture the generation at registration time
  // and bail if the current generation has moved on. Kills the
  // rapid-report-to-report stale-flash race.
  const generationRef = useRef(0);
  const hasLoadedRef = useRef(false);
  const watchdogRef = useRef<NodeJS.Timeout | null>(null);
  const proactiveRefreshRef = useRef<NodeJS.Timeout | null>(null);
  const tokenExpirationRef = useRef<string | null>(null);
  const tokenRefreshInProgressRef = useRef(false);
  // Tracks which event names we actually registered, so cleanup detaches
  // exactly that set (caller's events ∪ 'loaded' ∪ 'error').
  const registeredEventsRef = useRef<string[]>([]);
  // Latest buildConfig / events from the caller — refs let us avoid putting
  // them in the effect deps (callers typically pass inline functions/objects).
  const buildConfigRef = useRef(buildConfig);
  const eventsRef = useRef(events);
  const errorFallbackRef = useRef(errorFallback);
  const surfacePostLoadErrorsRef = useRef(surfacePostLoadErrors);

  useEffect(() => {
    buildConfigRef.current = buildConfig;
  }, [buildConfig]);
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);
  useEffect(() => {
    errorFallbackRef.current = errorFallback;
  }, [errorFallback]);
  useEffect(() => {
    surfacePostLoadErrorsRef.current = surfacePostLoadErrors;
  }, [surfacePostLoadErrors]);

  // Reload counter — bumped by the public reload() method to force the
  // load effect to re-run even when workspaceId/itemId haven't changed.
  const [reloadNonce, setReloadNonce] = useState(0);

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const clearProactiveRefresh = useCallback(() => {
    if (proactiveRefreshRef.current) {
      clearTimeout(proactiveRefreshRef.current);
      proactiveRefreshRef.current = null;
    }
  }, []);

  const detachEmbedHandlers = useCallback(() => {
    const embed = embedRef.current;
    if (!embed) return;
    for (const eventName of registeredEventsRef.current) {
      try {
        // powerbi-client's off(eventName) with no handler removes ALL
        // listeners for that event — confirmed via Context7.
        embed.off(eventName);
      } catch {
        // ignore detach errors
      }
    }
    registeredEventsRef.current = [];
  }, []);

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
    const delay = fireAt - Date.now();
    if (delay <= 0) {
      // Already inside the refresh window — fire immediately on next tick.
      proactiveRefreshRef.current = setTimeout(() => {
        void refreshEmbedTokenRef.current?.();
      }, 0);
      return;
    }
    proactiveRefreshRef.current = setTimeout(() => {
      void refreshEmbedTokenRef.current?.();
    }, delay);
  }, [clearProactiveRefresh]);

  // refreshEmbedToken needs to reference itself (re-schedule after success)
  // and is called from setTimeouts created before it's defined. A ref breaks
  // the cycle without forcing a re-render dance.
  const refreshEmbedTokenRef = useRef<() => Promise<void>>(undefined as any);

  const refreshEmbedToken = useCallback(async (): Promise<void> => {
    if (!workspaceId || !itemId) return;
    if (tokenRefreshInProgressRef.current) return;
    tokenRefreshInProgressRef.current = true;
    try {
      const tokenResponse = await window.electronAPI.content.getEmbedToken(
        itemId,
        workspaceId
      );

      if (!tokenResponse.success) {
        throw new Error(
          tokenResponse.error.message || 'Failed to refresh access token'
        );
      }

      tokenExpirationRef.current = tokenResponse.data.expiration;
      const token = tokenResponse.data.token;

      if (embedRef.current && hasLoadedRef.current) {
        // Powerbi-client typings split setAccessToken between Report/Dashboard,
        // but the runtime method exists on all loaded embeds.
        await (embedRef.current as pbi.Report).setAccessToken(token);
        // Same story for refresh().
        await (embedRef.current as pbi.Report).refresh();
        // Reschedule proactive refresh for the new expiry.
        scheduleProactiveRefresh();
      } else {
        // Embed was reset (or never loaded) — kick a fresh load.
        setReloadNonce((n) => n + 1);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Session expired. Please log in again.'
      );
      setIsLoading(false);
    } finally {
      tokenRefreshInProgressRef.current = false;
    }
  }, [workspaceId, itemId, scheduleProactiveRefresh]);

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
  }, []);

  // Main load effect — runs on workspaceId/itemId/reloadNonce change.
  useEffect(() => {
    if (!workspaceId || !itemId) {
      setError('Invalid embed parameters');
      setIsLoading(false);
      return;
    }
    if (!containerRef.current) return;

    // Bump generation FIRST so any in-flight callbacks from the previous
    // load see a mismatch and bail out before touching state.
    generationRef.current += 1;
    const generation = generationRef.current;
    hasLoadedRef.current = false;

    setIsLoading(true);
    setError(null);

    let cancelled = false;

    const run = async () => {
      try {
        const container = containerRef.current;
        if (!container) return;

        // Reset any previous embed in the container before fetching token.
        powerbiService.reset(container);

        const tokenResponse =
          await window.electronAPI.content.getEmbedToken(itemId, workspaceId);

        // Generation guard — a newer load started during the await.
        if (generation !== generationRef.current || cancelled) return;

        if (!tokenResponse.success) {
          throw new Error(
            tokenResponse.error.message || 'Failed to get embed token'
          );
        }

        const token = tokenResponse.data.token;
        tokenExpirationRef.current = tokenResponse.data.expiration;

        const embedConfig = buildConfigRef.current(token);

        if (!containerRef.current) return;
        const embed = powerbiService.embed(containerRef.current, embedConfig);
        embedRef.current = embed;

        // Watchdog — fires if neither loaded nor pre-load error arrives.
        clearWatchdog();
        watchdogRef.current = setTimeout(() => {
          if (generation !== generationRef.current) return;
          if (hasLoadedRef.current) return;
          setError(
            'This is taking too long to load. Check your connection and try again.'
          );
          setIsLoading(false);
        }, watchdogMs);

        // Register handlers. Track names so cleanup can detach the exact set.
        const callerEvents = eventsRef.current ?? {};
        const eventNames = new Set<string>(['loaded', 'error']);
        for (const name of Object.keys(callerEvents)) {
          eventNames.add(name);
        }
        registeredEventsRef.current = Array.from(eventNames);

        // Built-in loaded handler — housekeeping first, then caller's loaded.
        embed.on('loaded', (event: any) => {
          if (generation !== generationRef.current) return; // stale load
          hasLoadedRef.current = true;
          clearWatchdog();
          setIsLoading(false);
          // Proactive refresh becomes meaningful only once the embed is alive
          // (we need a real setAccessToken target). Schedule here.
          scheduleProactiveRefresh();
          const callerLoaded = eventsRef.current?.loaded;
          if (callerLoaded) {
            try {
              callerLoaded(event);
            } catch (err) {
              console.warn('[usePowerBIEmbed] caller loaded handler threw:', err);
            }
          }
        });

        // Built-in error handler — token expiry routes to refresh; pre-load
        // errors surface to UI; post-load errors are silent unless caller
        // opted in via surfacePostLoadErrors.
        embed.on('error', (event: any) => {
          if (generation !== generationRef.current) return; // stale load
          const detail = event?.detail;
          // eslint-disable-next-line no-console
          console.error('[usePowerBIEmbed] embed error:', detail);

          if (isTokenExpiredError(detail)) {
            void refreshEmbedToken();
            return;
          }

          const preLoad = !hasLoadedRef.current;
          if (preLoad || surfacePostLoadErrorsRef.current) {
            clearWatchdog();
            const msg = getErrorMessage(detail) || errorFallbackRef.current;
            setError(msg);
            setIsLoading(false);
          }
          // Always give caller's error handler a chance (e.g. logging).
          const callerError = eventsRef.current?.error;
          if (callerError) {
            try {
              callerError(event);
            } catch (err) {
              console.warn('[usePowerBIEmbed] caller error handler threw:', err);
            }
          }
        });

        // Register any extra caller events verbatim.
        for (const [name, handler] of Object.entries(callerEvents)) {
          if (name === 'loaded' || name === 'error') continue;
          embed.on(name, handler);
        }
      } catch (err) {
        if (generation !== generationRef.current || cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load');
        setIsLoading(false);
        clearWatchdog();
      }
    };

    void run();

    return () => {
      cancelled = true;
      // Bump generation again so any callbacks fired during teardown are
      // recognised as stale.
      generationRef.current += 1;
      detachEmbedHandlers();
      clearWatchdog();
      clearProactiveRefresh();
      const container = containerRef.current;
      if (container) {
        try {
          powerbiService.reset(container);
        } catch {
          // ignore reset errors during teardown
        }
      }
      embedRef.current = null;
      hasLoadedRef.current = false;
      tokenRefreshInProgressRef.current = false;
    };
    // buildConfig/events/error knobs are read via refs to keep this effect
    // stable across renders. Only identity-changing inputs go in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, itemId, reloadNonce, powerbiService, watchdogMs]);

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

  // Auto-refresh interval — embed.refresh() at the user's configured cadence,
  // but only when the tab is visible, embed has loaded, and there's no error.
  useEffect(() => {
    if (!autoRefreshEnabled) return;

    const intervalId = setInterval(() => {
      if (
        embedRef.current &&
        hasLoadedRef.current &&
        !error &&
        document.visibilityState === 'visible'
      ) {
        (embedRef.current as pbi.Report).refresh?.().catch(() => {
          // Some visuals throw authorization errors during auto-refresh —
          // non-fatal, the embed is still usable.
        });
      }
    }, autoRefreshIntervalMinutes * 60 * 1000);

    return () => clearInterval(intervalId);
  }, [autoRefreshEnabled, autoRefreshIntervalMinutes, error]);

  const reload = useCallback(() => {
    setReloadNonce((n) => n + 1);
  }, []);

  return {
    isLoading,
    error,
    setError,
    embedRef,
    reload,
    refreshEmbedToken,
  };
}
