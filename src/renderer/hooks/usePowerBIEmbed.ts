import { useMemo, useRef, useState } from 'react';
import * as pbi from 'powerbi-client';
import {
  DEFAULT_WATCHDOG_MS,
  DEFAULT_ERROR_FALLBACK,
} from './embed/embedTypes';
import type {
  EmbedContext,
  UsePowerBIEmbedOptions,
  UsePowerBIEmbedResult,
} from './embed/embedTypes';
import { resolveErrorPolicy } from './embed/errorPolicy';
import { useEmbedWatchdog } from './embed/useEmbedWatchdog';
import { useEmbedTokenRefresh } from './embed/useEmbedTokenRefresh';
import { useEmbedLifecycle } from './embed/useEmbedLifecycle';

export type {
  EmbedEvent,
  EmbedEventHandlers,
  UsePowerBIEmbedOptions,
  UsePowerBIEmbedResult,
} from './embed/embedTypes';

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
    autoRefreshIntervalMinutes = 10,
    watchdogMs = DEFAULT_WATCHDOG_MS,
    errorFallback = DEFAULT_ERROR_FALLBACK,
    surfacePostLoadErrors = false,
    errorPolicy,
  } = options;

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const embedRef = useRef<pbi.Embed | null>(null);
  const generationRef = useRef(0);
  const hasLoadedRef = useRef(false);
  const tokenExpirationRef = useRef<string | null>(null);
  const tokenRefreshInProgressRef = useRef(false);
  const registeredEventsRef = useRef<string[]>([]);

  const ctx: EmbedContext = useMemo(
    () => ({
      embedRef,
      generationRef,
      hasLoadedRef,
      tokenExpirationRef,
      tokenRefreshInProgressRef,
      registeredEventsRef,
      setIsLoading,
      setError,
    }),
    []
  );

  const resolvedErrorPolicy = useMemo(
    () => resolveErrorPolicy(surfacePostLoadErrors, errorPolicy),
    [surfacePostLoadErrors, errorPolicy]
  );

  const watchdog = useEmbedWatchdog(ctx, watchdogMs);
  const tokenRefresh = useEmbedTokenRefresh(ctx, { workspaceId, itemId });

  const { reload, teardownNow } = useEmbedLifecycle({
    ctx,
    containerRef,
    workspaceId,
    itemId,
    buildConfig,
    events,
    errorFallback,
    errorPolicy: resolvedErrorPolicy,
    autoRefreshEnabled,
    autoRefreshIntervalMinutes,
    watchdogMs,
    watchdog,
    tokenRefresh,
    refreshEmbedToken: tokenRefresh.refreshEmbedToken,
    error,
  });

  return {
    isLoading,
    error,
    setError,
    embedRef,
    reload,
    refreshEmbedToken: tokenRefresh.refreshEmbedToken,
    teardownNow,
  };
}
