import { useCallback, useEffect, useRef, useState } from 'react';
import * as pbi from 'powerbi-client';
import { getErrorMessage, isTokenExpiredError } from '../../shared/powerbi-errors';
import { usePowerBIService } from './usePowerBIService';

/**
 * NEW-ARCH-2: Typed wrapper for Power BI SDK custom events.
 * Callers can specialise T to narrow the `detail` payload for events they
 * know the shape of (e.g. pageChanged, tileClicked). Falls back to `unknown`
 * for events whose schema is not yet typed at the call site.
 */
export type EmbedEvent<T = unknown> = pbi.service.ICustomEvent<T>;

/**
 * Event handler map passed by callers. The hook owns 'loaded' and 'error'
 * lifecycle: caller's handlers for those names run AFTER the hook's
 * built-in housekeeping (watchdog clear, isLoading=false, hasLoaded flag,
 * token-expiry handling). Any other event names (pageChanged, tileClicked,
 * ...) are registered as-is on the embed.
 */
export type EmbedEventHandlers = Record<string, (event: EmbedEvent<unknown>) => void>;

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
  /**
   * ARCH-S1 / PERF-S2: Synchronous teardown — detaches all registered SDK
   * event handlers, cancels pending timers, and hard-resets the embed
   * container via powerbiService.reset(). Safe to call before navigation
   * so the iframe stops rendering before the component unmounts.
   *
   * Callers (e.g. PresentationMode exit / fullscreen-escape) MUST call this
   * instead of touching embed.off or powerbiService directly.
   */
  teardownNow: () => void;
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
    // PERF-B1: default raised from 1 to 10 to match DEFAULT_SETTINGS.autoRefreshInterval.
    autoRefreshIntervalMinutes = 10,
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
  // PERF-S1: stable refs so the auto-refresh interval effect doesn't re-create
  // the setInterval on every render that touches error / isLoading state.
  const errorRef = useRef<string | null>(null);

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
  // PERF-S1: mirror error state into a ref so the auto-refresh interval can
  // read the current value without the effect depending on `error`.
  useEffect(() => {
    errorRef.current = error;
  }, [error]);

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
  const refreshEmbedTokenRef = useRef<(() => Promise<void>) | null>(null);

  const refreshEmbedToken = useCallback(async (): Promise<void> => {
    if (!workspaceId || !itemId) return;
    if (tokenRefreshInProgressRef.current) return;
    // Capture the generation NOW. If a rapid report-to-report switch bumps
    // generation while we're awaiting the IPC, this call's result is for the
    // old embed — discard it instead of writing to refs / triggering reloads
    // on the new one.
    const myGen = generationRef.current;
    // Skip work if the embed isn't actually loaded — visibility-change and
    // proactive-timer callers can fire mid-load. The reload trigger that used
    // to live in the !loaded branch is exactly the kind of "stale callback
    // stomps new load" race we want to avoid.
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
        // BEH-S7: prefer the friendly userMessage when the main process supplies
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
        // Powerbi-client typings split setAccessToken between Report/Dashboard,
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
          // BEH-S7: prefer the friendly userMessage when the main process supplies one.
          throw new Error(
            tokenResponse.error.userMessage ||
              tokenResponse.error.message ||
              'Failed to get embed token'
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
        embed.on('loaded', (event: pbi.service.ICustomEvent<unknown>) => {
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
        embed.on('error', (event: pbi.service.ICustomEvent<unknown>) => {
          if (generation !== generationRef.current) return; // stale load
          const detail = event?.detail;
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
        setError(err instanceof Error ? err.message : errorFallbackRef.current);
        setIsLoading(false);
        clearWatchdog();
      }
    };

    void run();

    // Capture containerRef.current now so the cleanup closure uses the value
    // captured at effect-run time rather than re-reading the ref at teardown
    // (the ref may have changed by then — react-hooks/exhaustive-deps).
    const capturedContainer = containerRef.current;
    return () => {
      cancelled = true;
      // Bump generation again so any callbacks fired during teardown are
      // recognised as stale.
      generationRef.current += 1;
      detachEmbedHandlers();
      clearWatchdog();
      clearProactiveRefresh();
      if (capturedContainer) {
        try {
          powerbiService.reset(capturedContainer);
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
  //
  // PERF-S1 / BEH-S1: read current error and loaded state through refs so that
  // neither `error` nor `isLoading` state changes cause this effect to tear
  // down and recreate the setInterval. The only legitimate reasons to restart
  // the timer are a user-toggled on/off or an interval-length change.
  useEffect(() => {
    if (!autoRefreshEnabled) return;

    const intervalId = setInterval(() => {
      if (
        embedRef.current &&
        hasLoadedRef.current &&
        !errorRef.current &&
        document.visibilityState === 'visible'
      ) {
        (embedRef.current as pbi.Report).refresh?.().catch(() => {
          // Some visuals throw authorization errors during auto-refresh —
          // non-fatal, the embed is still usable.
        });
      }
    }, autoRefreshIntervalMinutes * 60 * 1000);

    return () => clearInterval(intervalId);
    // errorRef / hasLoadedRef are stable MutableRefObjects — ESLint correctly
    // omits them from deps. Only the user-configurable knobs go here.
  }, [autoRefreshEnabled, autoRefreshIntervalMinutes]);

  const reload = useCallback(() => {
    setReloadNonce((n) => n + 1);
  }, []);

  /**
   * ARCH-S1 / PERF-S2: Synchronous pre-navigation teardown.
   *
   * Detaches all registered SDK event handlers, cancels both pending timers,
   * and hard-resets the embed container via powerbiService.reset(). Safe to
   * call before navigate() so the iframe stops rendering immediately rather
   * than waiting for the React unmount cycle.
   *
   * The hook's own cleanup (effect return) will no-op gracefully on the
   * subsequent unmount because embedRef / registeredEventsRef are already
   * cleared here.
   */
  const teardownNow = useCallback(() => {
    // Bump generation so any in-flight async callbacks (token refresh,
    // watchdog timeout) see a mismatch and bail out.
    generationRef.current += 1;
    detachEmbedHandlers();
    clearWatchdog();
    clearProactiveRefresh();
    const container = containerRef.current;
    if (container) {
      try {
        powerbiService.reset(container);
      } catch {
        // Ignore reset errors — container may already be detached.
      }
    }
    embedRef.current = null;
    hasLoadedRef.current = false;
    tokenRefreshInProgressRef.current = false;
  }, [
    detachEmbedHandlers,
    clearWatchdog,
    clearProactiveRefresh,
    containerRef,
    powerbiService,
  ]);

  return {
    isLoading,
    error,
    setError,
    embedRef,
    reload,
    refreshEmbedToken,
    teardownNow,
  };
}
