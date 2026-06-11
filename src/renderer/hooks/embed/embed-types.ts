import * as pbi from 'powerbi-client';
import type { ErrorPolicy } from './error-policy';


export type EmbedEvent<T = unknown> = pbi.service.ICustomEvent<T>;

export type EmbedEventHandlers = Record<string, (event: EmbedEvent<unknown>) => void>;

export interface UsePowerBIEmbedOptions {
  workspaceId: string | undefined;
  itemId: string | undefined;
  containerRef: React.RefObject<HTMLDivElement | null>;
  buildConfig: (token: string) =>
    | pbi.IReportEmbedConfiguration
    | pbi.IDashboardEmbedConfiguration;
  events?: EmbedEventHandlers;
  autoRefreshEnabled?: boolean;
  autoRefreshIntervalMinutes?: number;
  watchdogMs?: number;
  errorFallback?: string;
  surfacePostLoadErrors?: boolean;
  errorPolicy?: ErrorPolicy;
}

export interface UsePowerBIEmbedResult {
  isLoading: boolean;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  embedRef: React.MutableRefObject<pbi.Embed | null>;
  reload: () => void;
  refreshEmbedToken: () => Promise<void>;
  teardownNow: () => void;
}

export interface EmbedContext {
  embedRef: React.MutableRefObject<pbi.Embed | null>;
  generationRef: React.MutableRefObject<number>;
  hasLoadedRef: React.MutableRefObject<boolean>;
  tokenExpirationRef: React.MutableRefObject<string | null>;
  tokenRefreshInProgressRef: React.MutableRefObject<boolean>;
  registeredEventsRef: React.MutableRefObject<string[]>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}

export const DEFAULT_WATCHDOG_MS = 45000;
export const DEFAULT_ERROR_FALLBACK = 'This report could not be loaded.';
export const TOKEN_REFRESH_LEAD_MS = 2 * 60 * 1000;
