
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

    await flushMicrotasks();
    expect(result.current.datasetRefreshTime).toBe('2026-06-01T00:00:00.000Z');
    expect(result.current.newDataAvailable).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(result.current.newDataAvailable).toBe(false);

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

    snapshot = { datasetRefreshTime: '2026-06-02T00:00:00.000Z', dataflowRefreshTime: null };
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(result.current.newDataAvailable).toBe(true);

    rerender({ la: 2000 });
    await flushMicrotasks();
    expect(result.current.newDataAvailable).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(result.current.newDataAvailable).toBe(false);
  });
});
