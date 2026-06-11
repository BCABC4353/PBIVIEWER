import type { DatasetRefreshInfo } from '../../shared/types';
import { formatAgeNoun, STALE_AFTER_MS } from './freshness-format';

const TTL_MS = 5 * 60 * 1000;
const MAX_IN_FLIGHT = 3;

const cache = new Map<string, { value: DatasetRefreshInfo; expires: number }>();
const pending = new Map<string, Promise<DatasetRefreshInfo | null>>();

let active = 0;
const waiters: Array<() => void> = [];

async function acquireSlot(): Promise<void> {
  if (active < MAX_IN_FLIGHT) {
    active++;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  active++;
}

function releaseSlot(): void {
  active--;
  const next = waiters.shift();
  if (next) next();
}

export function getDatasetFreshness(
  datasetId: string,
  workspaceId: string,
): Promise<DatasetRefreshInfo | null> {
  const key = `${workspaceId}|${datasetId}`.toLowerCase();
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.value);
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;

  const task = (async (): Promise<DatasetRefreshInfo | null> => {
    await acquireSlot();
    try {
      const resp = await window.electronAPI.content.getDatasetRefreshInfo(datasetId, workspaceId);
      if (!resp.success) return null;
      cache.set(key, { value: resp.data, expires: Date.now() + TTL_MS });
      return resp.data;
    } catch {
      return null;
    } finally {
      releaseSlot();
      pending.delete(key);
    }
  })();
  pending.set(key, task);
  return task;
}

export function clearDatasetFreshnessCache(): void {
  cache.clear();
}

export interface FreshnessDescription {
  ageLabel: string;
  isStale: boolean;
}

export function describeFreshness(
  lastRefreshTime?: string,
  now: number = Date.now(),
): FreshnessDescription | null {
  if (!lastRefreshTime) return null;
  const ageMs = now - Date.parse(lastRefreshTime);
  if (!Number.isFinite(ageMs)) return null;
  return {
    ageLabel: formatAgeNoun(Math.max(0, ageMs)),
    isStale: ageMs > STALE_AFTER_MS,
  };
}
