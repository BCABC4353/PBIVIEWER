import * as pbi from 'powerbi-client';
import type { ErrorPolicy } from './errorPolicy';

/**
 * Shared types and refs for the decomposed Power BI embed hooks.
 *
 * usePowerBIEmbed is split into three cooperating hooks (lifecycle, token
 * refresh, watchdog). They share a single mutable ref-bag (`EmbedContext`) so
 * the decomposition preserves the original single-hook semantics exactly —
 * the generation counter, loaded flag, and embed handle are the same objects
 * across all three.
 */

/**
 * Typed wrapper for Power BI SDK custom events.
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
  /** Enabled by default. Auto-refresh respects document visibility. */
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
   *
   * Internally translated into an {@link ErrorPolicy} strategy. The
   * boolean remains the public knob for backward compatibility with the three
   * viewers; pass `errorPolicy` to override the strategy directly.
   */
  surfacePostLoadErrors?: boolean;
  /**
   * Strategy object deciding whether a given 'error' event surfaces
   * to the error UI. When omitted, derived from `surfacePostLoadErrors`.
   */
  errorPolicy?: ErrorPolicy;
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
   * Synchronous teardown — detaches all registered SDK
   * event handlers, cancels pending timers, and hard-resets the embed
   * container via powerbiService.reset(). Safe to call before navigation
   * so the iframe stops rendering before the component unmounts.
   *
   * Callers (e.g. PresentationMode exit / fullscreen-escape) MUST call this
   * instead of touching embed.off or powerbiService directly.
   */
  teardownNow: () => void;
}

/**
 * Shared mutable state for the decomposed embed hooks. A single instance is
 * created by {@link usePowerBIEmbed} and threaded into each sub-hook so they
 * operate on the same refs — this is what keeps the split behaviourally
 * identical to the original monolithic hook.
 */
export interface EmbedContext {
  embedRef: React.MutableRefObject<pbi.Embed | null>;
  /**
   * Generation counter — every load attempt bumps this. Async callbacks
   * (watchdog, loaded, error, token refresh) capture the generation at
   * registration time and bail if the current generation has moved on. Kills
   * the rapid-report-to-report stale-flash race.
   */
  generationRef: React.MutableRefObject<number>;
  hasLoadedRef: React.MutableRefObject<boolean>;
  tokenExpirationRef: React.MutableRefObject<string | null>;
  tokenRefreshInProgressRef: React.MutableRefObject<boolean>;
  /**
   * Tracks which event names we actually registered, so cleanup detaches
   * exactly that set (caller's events ∪ 'loaded' ∪ 'error').
   */
  registeredEventsRef: React.MutableRefObject<string[]>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}

export const DEFAULT_WATCHDOG_MS = 45000;
export const DEFAULT_ERROR_FALLBACK = 'This report could not be loaded.';
export const TOKEN_REFRESH_LEAD_MS = 2 * 60 * 1000; // refresh 2 min before expiry
