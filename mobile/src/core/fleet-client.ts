/**
 * Live Power BI fleet client — same REST surface the desktop app uses, driven
 * by an injected TokenProvider (auth is swappable: mock today, MSAL next).
 * Pure fetch; runs on React Native's fetch unchanged.
 */
import type { DataSource, FleetSnapshot, Refreshable, TokenProvider } from './types';
import {
  deriveDatasetHealth,
  deriveDataflowHealth,
  deriveScheduleInfo,
  type RawRefreshEntry,
  type RawTransaction,
  type RawSchedule,
} from './refresh-health';

const BASE = 'https://api.powerbi.com/v1.0/myorg';
const WORKSPACE_BATCH = 3;
const ITEM_CONCURRENCY = 4;
/** Bounded retries on HTTP 429 (Power BI throttles big tenants). */
const MAX_429_RETRIES = 2;
/** Cap honored Retry-After at 60 s so a hostile/huge header can't hang us. */
const MAX_RETRY_AFTER_S = 60;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        results[i] = await fn(items[i] as T);
      }
    }),
  );
  return results;
}

export class LiveFleetClient implements DataSource {
  private cache: { value: FleetSnapshot; expires: number } | null = null;
  private static readonly TTL_MS = 5 * 60 * 1000;

  constructor(private readonly tokens: TokenProvider) {}

  private async get<T>(path: string): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const token = await this.tokens.getAccessToken();
      const res = await fetch(`${BASE}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // Power BI throttles fan-out on big tenants with 429 + Retry-After.
      // Without this, tryList() swallows the 429 and the item silently shows
      // as unreadable/empty. Bounded retry honoring Retry-After (seconds).
      if (res.status === 429 && attempt < MAX_429_RETRIES) {
        const retryAfter = Number(res.headers.get('Retry-After'));
        const seconds =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter, MAX_RETRY_AFTER_S)
            : 2 * (attempt + 1); // header absent/unparsable → small backoff
        await sleep(seconds * 1000);
        continue;
      }
      if (!res.ok) throw new Error(`Power BI API ${res.status} on ${path}`);
      return (await res.json()) as T;
    }
  }

  private async tryList<T>(path: string): Promise<T[] | null> {
    try {
      const r = await this.get<{ value?: T[] }>(path);
      return r.value ?? [];
    } catch {
      return null;
    }
  }

  async getFleetSnapshot(force = false): Promise<FleetSnapshot> {
    if (!force && this.cache && this.cache.expires > Date.now()) return this.cache.value;

    const groups =
      (await this.tryList<{ id: string; name: string }>('/groups')) ?? [];
    const refreshables: Refreshable[] = [];
    const failedWorkspaces: FleetSnapshot['failedWorkspaces'] = [];

    for (let i = 0; i < groups.length; i += WORKSPACE_BATCH) {
      const batch = groups.slice(i, i + WORKSPACE_BATCH);
      await Promise.all(
        batch.map(async (ws) => {
          const [datasets, dataflows] = await Promise.all([
            this.tryList<{ id: string; name: string; configuredBy?: string; isRefreshable?: boolean }>(
              `/groups/${ws.id}/datasets`,
            ),
            this.tryList<{ objectId: string; name: string }>(`/groups/${ws.id}/dataflows`),
          ]);
          if (datasets === null && dataflows === null) {
            failedWorkspaces.push({ id: ws.id, name: ws.name, error: 'unreadable' });
            return;
          }
          const dsRows = await mapWithConcurrency(datasets ?? [], ITEM_CONCURRENCY, async (ds): Promise<Refreshable> => {
            const base = {
              kind: 'dataset' as const,
              id: ds.id,
              name: ds.name,
              workspaceId: ws.id,
              workspaceName: ws.name,
              configuredBy: ds.configuredBy,
            };
            if (ds.isRefreshable === false) return { ...base, lastStatus: 'Disabled' };
            const hist =
              (await this.tryList<RawRefreshEntry>(`/groups/${ws.id}/datasets/${ds.id}/refreshes?$top=5`)) ?? [];
            const health = deriveDatasetHealth(hist);
            let sched: RawSchedule | null = null;
            try {
              sched = await this.get<RawSchedule>(`/groups/${ws.id}/datasets/${ds.id}/refreshSchedule`);
            } catch {
              /* live/push datasets have no schedule */
            }
            return { ...base, ...health, ...deriveScheduleInfo(sched, health.lastSuccessTime, Date.now()) };
          });
          refreshables.push(...dsRows);

          const dfRows = await mapWithConcurrency(dataflows ?? [], ITEM_CONCURRENCY, async (df): Promise<Refreshable> => {
            const hist =
              (await this.tryList<RawTransaction>(`/groups/${ws.id}/dataflows/${df.objectId}/transactions?$top=5`)) ?? [];
            return {
              kind: 'dataflow',
              id: df.objectId,
              name: df.name,
              workspaceId: ws.id,
              workspaceName: ws.name,
              ...deriveDataflowHealth(hist),
            };
          });
          refreshables.push(...dfRows);
        }),
      );
    }

    if (groups.length > 0 && failedWorkspaces.length === groups.length) {
      throw new Error('Every workspace failed to load — check sign-in and network.');
    }

    const snapshot: FleetSnapshot = {
      generatedAt: new Date().toISOString(),
      workspaceCount: groups.length,
      refreshables,
      partialFailure: failedWorkspaces.length > 0,
      failedWorkspaces,
    };
    this.cache = { value: snapshot, expires: Date.now() + LiveFleetClient.TTL_MS };
    return snapshot;
  }
}
