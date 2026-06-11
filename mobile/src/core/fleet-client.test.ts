import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LiveFleetClient } from './fleet-client';
import type { TokenProvider } from './types';

const tokens: TokenProvider = { getAccessToken: async () => 'TOK' };

interface FakeRes {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}

const ok = (body: unknown): FakeRes => ({
  ok: true,
  status: 200,
  headers: { get: () => null },
  json: async () => body,
});

const throttled = (retryAfter?: string): FakeRes => ({
  ok: false,
  status: 429,
  headers: {
    get: (name) =>
      retryAfter !== undefined && name.toLowerCase() === 'retry-after' ? retryAfter : null,
  },
  json: async () => ({}),
});

const error = (status: number): FakeRes => ({
  ok: false,
  status,
  headers: { get: () => null },
  json: async () => ({}),
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('get() retry on 429', () => {
  it('retries after the Retry-After delay and succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(throttled('1'))
      .mockResolvedValueOnce(ok({ value: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const p = new LiveFleetClient(tokens).getFleetSnapshot();
    await vi.advanceTimersByTimeAsync(1000);
    const snap = await p;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(snap.workspaceCount).toBe(0);
    expect(snap.partialFailure).toBe(false);
  });

  it('uses a small default backoff when Retry-After is missing', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(throttled())
      .mockResolvedValueOnce(ok({ value: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const p = new LiveFleetClient(tokens).getFleetSnapshot();
    await vi.advanceTimersByTimeAsync(2000);
    await p;

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('caps an absurd Retry-After at 60 s instead of hanging', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(throttled('86400'))
      .mockResolvedValueOnce(ok({ value: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const p = new LiveFleetClient(tokens).getFleetSnapshot();
    await vi.advanceTimersByTimeAsync(60_000);
    await p;

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after bounded retries — and a dead /groups root is a LOUD error, not an empty fleet', async () => {
    const fetchMock = vi.fn().mockResolvedValue(throttled('1'));
    vi.stubGlobal('fetch', fetchMock);

    const settled = new LiveFleetClient(tokens).getFleetSnapshot().then(
      () => null,
      (e: unknown) => e,
    );
    await vi.advanceTimersByTimeAsync(120_000);
    const err = await settled;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/Could not list your workspaces/);
  });

  it('does NOT retry non-429 errors, and surfaces the root failure instead of a blank snapshot', async () => {
    const fetchMock = vi.fn().mockResolvedValue(error(500));
    vi.stubGlobal('fetch', fetchMock);

    await expect(new LiveFleetClient(tokens).getFleetSnapshot()).rejects.toThrow(
      /Could not list your workspaces — Power BI API 500/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});


function routedFetch(routes: Record<string, unknown>, perCall?: () => Promise<void>) {
  return vi.fn(async (url: string) => {
    if (perCall) await perCall();
    const path = url.replace('https://api.powerbi.com/v1.0/myorg', '');
    const hit = routes[path];
    if (hit === undefined) return error(404);
    if (typeof hit === 'number') return error(hit);
    return ok(hit);
  });
}

describe('getFleetSnapshot — partial failure and progress', () => {
  beforeEach(() => vi.useRealTimers());

  it('loads readable workspaces and counts the unreadable ones (partial honesty)', async () => {
    vi.stubGlobal(
      'fetch',
      routedFetch({
        '/groups': {
          value: [
            { id: 'g1', name: 'Good WS' },
            { id: 'g2', name: 'Locked WS' },
          ],
        },
        '/groups/g1/datasets': { value: [{ id: 'd1', name: 'DS One', isRefreshable: false }] },
        '/groups/g1/dataflows': { value: [] },
        '/groups/g2/datasets': 403,
        '/groups/g2/dataflows': 403,
      }),
    );

    const snap = await new LiveFleetClient(tokens).getFleetSnapshot();

    expect(snap.partialFailure).toBe(true);
    expect(snap.failedWorkspaces).toEqual([{ id: 'g2', name: 'Locked WS', error: 'unreadable' }]);
    expect(snap.refreshables.map((r) => r.id)).toEqual(['d1']);
    expect(snap.workspaceCount).toBe(2);
  });

  it('reports real per-workspace progress while the snapshot is in flight', async () => {
    vi.stubGlobal(
      'fetch',
      routedFetch({
        '/groups': {
          value: [
            { id: 'g1', name: 'A' },
            { id: 'g2', name: 'B' },
          ],
        },
        '/groups/g1/datasets': { value: [{ id: 'd1', name: 'DS', isRefreshable: false }] },
        '/groups/g1/dataflows': { value: [] },
        '/groups/g2/datasets': { value: [] },
        '/groups/g2/dataflows': { value: [] },
      }),
    );

    const seen: Array<{ pct: number; items: number }> = [];
    await new LiveFleetClient(tokens).getFleetSnapshot(false, (pct, items) =>
      seen.push({ pct, items }),
    );

    expect(seen).toHaveLength(2);
    expect(seen.at(-1)).toEqual({ pct: 1, items: 1 });
    expect(seen.every((s, i) => i === 0 || s.pct >= seen[i - 1]!.pct)).toBe(true);
  });

  it('caps simultaneous requests so big tenants are not stampeded', async () => {
    const routes: Record<string, unknown> = {
      '/groups': {
        value: Array.from({ length: 9 }, (_, i) => ({ id: `g${i}`, name: `WS ${i}` })),
      },
    };
    for (let i = 0; i < 9; i++) {
      routes[`/groups/g${i}/datasets`] = {
        value: [{ id: `d${i}`, name: `DS ${i}`, isRefreshable: false }],
      };
      routes[`/groups/g${i}/dataflows`] = { value: [] };
    }
    let active = 0;
    let peak = 0;
    vi.stubGlobal(
      'fetch',
      routedFetch(routes, async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 1));
        active -= 1;
      }),
    );

    const snap = await new LiveFleetClient(tokens).getFleetSnapshot();

    expect(snap.refreshables).toHaveLength(9);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(5);
  });
});
