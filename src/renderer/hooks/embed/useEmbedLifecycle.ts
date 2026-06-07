import { useCallback, useEffect, useRef, useState } from 'react';
import * as pbi from 'powerbi-client';
import { getErrorMessage, isTokenExpiredError } from '../../../shared/powerbi-errors';
import { usePowerBIService } from '../usePowerBIService';
import type { EmbedContext, UsePowerBIEmbedOptions } from './embedTypes';
import type { ErrorPolicy } from './errorPolicy';
import type { UseEmbedWatchdogResult } from './useEmbedWatchdog';
import type { UseEmbedTokenRefreshResult } from './useEmbedTokenRefresh';

export interface UseEmbedLifecycleOptions {
  ctx: EmbedContext;
  containerRef: UsePowerBIEmbedOptions['containerRef'];
  workspaceId: string | undefined;
  itemId: string | undefined;
  buildConfig: UsePowerBIEmbedOptions['buildConfig'];
  events: UsePowerBIEmbedOptions['events'];
  errorFallback: string;
  errorPolicy: ErrorPolicy;
  autoRefreshEnabled: boolean;
  autoRefreshIntervalMinutes: number;
  watchdogMs: number;
  watchdog: UseEmbedWatchdogResult;
  tokenRefresh: UseEmbedTokenRefreshResult;
  refreshEmbedToken: () => Promise<void>;
  /**
   * Current error value, mirrored into a ref so the auto-refresh interval can
   * read it without re-creating the timer on every error/isLoading change.
   */
  error: string | null;
}

export interface UseEmbedLifecycleResult {
  /** Retry button calls this. Resets generation and runs a fresh load. */
  reload: () => void;
  /** Synchronous pre-navigation teardown (ARCH-S1 / PERF-S2). */
  teardownNow: () => void;
}

/**
 * ARCH-S2: Embed load lifecycle.
 *
 * Owns the main load effect (token fetch -> embed -> handler registration),
 * the auto-refresh interval, handler detachment, `reload`, and the
 * synchronous `teardownNow`. Watchdog and token-refresh concerns are injected
 * so this hook only orchestrates them. Behaviour is preserved verbatim from
 * the original monolithic hook.
 */
export function useEmbedLifecycle(
  opts: UseEmbedLifecycleOptions
): UseEmbedLifecycleResult {
  const {
    ctx,
    containerRef,
    workspaceId,
    itemId,
    buildConfig,
    events,
    errorFallback,
    errorPolicy,
    autoRefreshEnabled,
    autoRefreshIntervalMinutes,
    watchdogMs,
    watchdog,
    tokenRefresh,
    refreshEmbedToken,
    error,
  } = opts;

  const {
    embedRef,
    generationRef,
    hasLoadedRef,
    registeredEventsRef,
    tokenExpirationRef,
    tokenRefreshInProgressRef,
    setError,
    setIsLoading,
  } = ctx;
  const { armWatchdog, clearWatchdog } = watchdog;
  const { scheduleProactiveRefresh, clearProactiveRefresh } = tokenRefresh;

  const powerbiService = usePowerBIService();

  // Latest buildConfig / events / error knobs from the caller — refs let us
  // avoid putting them in the effect deps (callers typically pass inline
  // functions/objects).
  const buildConfigRef = useRef(buildConfig);
  const eventsRef = useRef(events);
  const errorFallbackRef = useRef(errorFallback);
  const errorPolicyRef = useRef(errorPolicy);
  // PERF-S1: mirror error state into a ref so the auto-refresh interval can
  // read the current value without the effect depending on `error`.
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
    errorPolicyRef.current = errorPolicy;
  }, [errorPolicy]);
  // PERF-S1: mirror error state into a ref so the auto-refresh interval can
  // read the current value without the effect depending on `error`.
  useEffect(() => {
    errorRef.current = error;
  }, [error]);

  // Reload counter — bumped by the public reload() method to force the
  // load effect to re-run even when workspaceId/itemId haven't changed.
  const [reloadNonce, setReloadNonce] = useState(0);

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
  }, [embedRef, registeredEventsRef]);

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
        armWatchdog(generation);

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
        // errors surface to UI; post-load errors follow the error policy.
        embed.on('error', (event: pbi.service.ICustomEvent<unknown>) => {
          if (generation !== generationRef.current) return; // stale load
          const detail = event?.detail;
          console.error('[usePowerBIEmbed] embed error:', detail);

          if (isTokenExpiredError(detail)) {
            void refreshEmbedToken();
            return;
          }

          const preLoad = !hasLoadedRef.current;
          if (errorPolicyRef.current.shouldSurface({ preLoad })) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    embedRef,
    generationRef,
    hasLoadedRef,
    tokenRefreshInProgressRef,
  ]);

  return { reload, teardownNow };
}
