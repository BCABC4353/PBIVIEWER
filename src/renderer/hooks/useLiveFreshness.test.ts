/**
 * useLiveFreshness — newDataAvailable must be anchored to a SERVER timestamp
 * captured at load (server-vs-server), never to the local clock. These tests
 * drive the hook with a controllable fetcher + fake timers and assert:
 *   - no "new data" at load, even though the dataset has a refresh time
 *   - "new data" flips true only when a STRICTLY-NEWER dataset refresh arrives
 *   - a reload re-baselines, so an already-applied refresh stops reading as new
 *     (this is what prevents the clock-skew refresh loop on auto-refresh reports)
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useLiveFreshness, type FreshnessSnapshot } from './useLiveFreshness';

const POLL_MS = 5 * 60 * 1000;

async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('useLiveFreshness', () => {
  it('does not flag new data at load, then flags it only when a strictly-newer refresh arrives', async () => {
    vi.useFakeTimers();
    let snapshot: FreshnessSnapshot | null = {
      datasetRefreshTime: '2026-06-01T00:00:00.000Z',
      dataflowRefreshTime: null,
    };
    const fetcher = vi.fn(async () => snapshot);

    const { result } = renderHook(() => useLiveFreshness(fetcher, 1000));

    // Flush the mount poll + the load re-baseline poll.
    await flushMicrotasks();
    expect(result.current.datasetRefreshTime).toBe('2026-06-01T00:00:00.000Z');
    expect(result.current.newDataAvailable).toBe(false);

    // Same data on the next poll → still not "new".
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(result.current.newDataAvailable).toBe(false);

    // A strictly-newer dataset refresh lands → the 5-min poll surfaces it.
    snapshot = { datasetRefreshTime: '2026-06-02T00:00:00.000Z', dataflowRefreshTime: null };
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(result.current.newDataAvailable).toBe(true);
  });

  it('re-baselines on reload so an applied refresh no longer reads as new (no skew loop)', async () => {
    vi.useFakeTimers();
    let snapshot: FreshnessSnapshot | null = {
      datasetRefreshTime: '2026-06-01T00:00:00.000Z',
      dataflowRefreshTime: null,
    };
    const fetcher = vi.fn(async () => snapshot);

    const { result, rerender } = renderHook(({ la }: { la: number }) => useLiveFreshness(fetcher, la), {
      initialProps: { la: 1000 },
    });
    await flushMicrotasks();

    // Newer data arrives → flagged.
    snapshot = { datasetRefreshTime: '2026-06-02T00:00:00.000Z', dataflowRefreshTime: null };
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(result.current.newDataAvailable).toBe(true);

    // The screen reloads (manual refresh, or report.refresh() + setLastLoadAt) →
    // loadedAt changes → re-baseline to the now-applied data → not "new" anymore.
    rerender({ la: 2000 });
    await flushMicrotasks();
    expect(result.current.newDataAvailable).toBe(false);

    // And it STAYS false on the next poll with the same data — the bug this guards
    // against would re-assert true every poll because server-time > local clock.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(result.current.newDataAvailable).toBe(false);
  });
});
