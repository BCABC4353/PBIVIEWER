/**
 * LiveFleetClient — HTTP 429 throttling behavior. Power BI throttles the
 * per-workspace fan-out on big tenants (50 workspaces ≈ 100+ list calls plus
 * 2 per dataset); without bounded retry-on-429 every throttled call degrades
 * silently to "unreadable"/empty health. Pure logic: global fetch mocked,
 * fake timers so Retry-After waits cost nothing.
 */
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
      .mockResolvedValueOnce(ok({ value: [] })); // /groups
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

  it('gives up after bounded retries — no infinite loop under sustained throttling', async () => {
    const fetchMock = vi.fn().mockResolvedValue(throttled('1'));
    vi.stubGlobal('fetch', fetchMock);

    const p = new LiveFleetClient(tokens).getFleetSnapshot();
    await vi.advanceTimersByTimeAsync(120_000);
    const snap = await p;

    expect(fetchMock).toHaveBeenCalledTimes(3); // initial + MAX_429_RETRIES
    expect(snap.workspaceCount).toBe(0); // tryList degrades, never throws
  });

  it('does NOT retry non-429 errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(error(500));
    vi.stubGlobal('fetch', fetchMock);

    const snap = await new LiveFleetClient(tokens).getFleetSnapshot();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(snap.workspaceCount).toBe(0);
  });
});
