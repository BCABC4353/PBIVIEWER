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
  error: string | null;
}

export interface UseEmbedLifecycleResult {
  reload: () => void;
  teardownNow: () => void;
}

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

  const buildConfigRef = useRef(buildConfig);
  const eventsRef = useRef(events);
  const errorFallbackRef = useRef(errorFallback);
  const errorPolicyRef = useRef(errorPolicy);
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
  useEffect(() => {
    errorRef.current = error;
  }, [error]);

  const [reloadNonce, setReloadNonce] = useState(0);

  const detachEmbedHandlers = useCallback(() => {
    const embed = embedRef.current;
    if (!embed) return;
    for (const eventName of registeredEventsRef.current) {
      try {
        embed.off(eventName);
      } catch {
      }
    }
    registeredEventsRef.current = [];
  }, [embedRef, registeredEventsRef]);

  useEffect(() => {
    if (!workspaceId || !itemId) {
      setError('Invalid embed parameters');
      setIsLoading(false);
      return;
    }
    if (!containerRef.current) return;

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

        powerbiService.reset(container);

        const tokenResponse =
          await window.electronAPI.content.getEmbedToken(itemId, workspaceId);

        if (generation !== generationRef.current || cancelled) return;

        if (!tokenResponse.success) {
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

        armWatchdog(generation);

        const callerEvents = eventsRef.current ?? {};
        const eventNames = new Set<string>(['loaded', 'error']);
        for (const name of Object.keys(callerEvents)) {
          eventNames.add(name);
        }
        registeredEventsRef.current = Array.from(eventNames);

        embed.on('loaded', (event: pbi.service.ICustomEvent<unknown>) => {
          if (generation !== generationRef.current) return;
          hasLoadedRef.current = true;
          clearWatchdog();
          setIsLoading(false);
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

        embed.on('error', (event: pbi.service.ICustomEvent<unknown>) => {
          if (generation !== generationRef.current) return;
          const detail = event?.detail;
          console.error('[usePowerBIEmbed] embed error:', detail);

          if (isTokenExpiredError(detail)) {
            if (hasLoadedRef.current) {
              void refreshEmbedToken();
            } else {
              setReloadNonce((n) => n + 1);
            }
            return;
          }

          const preLoad = !hasLoadedRef.current;
          if (errorPolicyRef.current.shouldSurface({ preLoad })) {
            clearWatchdog();
            const msg = getErrorMessage(detail) || errorFallbackRef.current;
            setError(msg);
            setIsLoading(false);
          }
          const callerError = eventsRef.current?.error;
          if (callerError) {
            try {
              callerError(event);
            } catch (err) {
              console.warn('[usePowerBIEmbed] caller error handler threw:', err);
            }
          }
        });

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

    const capturedContainer = containerRef.current;
    return () => {
      cancelled = true;
      generationRef.current += 1;
      detachEmbedHandlers();
      clearWatchdog();
      clearProactiveRefresh();
      if (capturedContainer) {
        try {
          powerbiService.reset(capturedContainer);
        } catch {
        }
      }
      embedRef.current = null;
      hasLoadedRef.current = false;
      tokenRefreshInProgressRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, itemId, reloadNonce, powerbiService, watchdogMs]);

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
        });
      }
    }, autoRefreshIntervalMinutes * 60 * 1000);

    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefreshEnabled, autoRefreshIntervalMinutes]);

  const reload = useCallback(() => {
    setReloadNonce((n) => n + 1);
  }, []);

  const teardownNow = useCallback(() => {
    generationRef.current += 1;
    detachEmbedHandlers();
    clearWatchdog();
    clearProactiveRefresh();
    const container = containerRef.current;
    if (container) {
      try {
        powerbiService.reset(container);
      } catch {
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
