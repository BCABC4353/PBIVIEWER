
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { act } from 'react';

import { useEmbedWatchdog } from './useEmbedWatchdog';
import type { EmbedContext } from './embedTypes';

const WATCHDOG_MS = 45000;

function makeCtx(): {
  ctx: EmbedContext;
  setError: ReturnType<typeof vi.fn>;
  setIsLoading: ReturnType<typeof vi.fn>;
} {
  const setError = vi.fn();
  const setIsLoading = vi.fn();
  const ctx: EmbedContext = {
    embedRef: { current: null },
    generationRef: { current: 1 },
    hasLoadedRef: { current: false },
    tokenExpirationRef: { current: null },
    tokenRefreshInProgressRef: { current: false },
    registeredEventsRef: { current: [] },
    setError,
    setIsLoading,
  };
  return { ctx, setError, setIsLoading };
}

describe('#7 useEmbedWatchdog', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('surfaces a timeout error when a load never completes', () => {
    const { ctx, setError, setIsLoading } = makeCtx();
    const { result } = renderHook(() => useEmbedWatchdog(ctx, WATCHDOG_MS));

    act(() => result.current.armWatchdog(ctx.generationRef.current));

    act(() => vi.advanceTimersByTime(WATCHDOG_MS - 1));
    expect(setError).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(setError).toHaveBeenCalledWith(
      expect.stringContaining('taking too long'),
    );
    expect(setIsLoading).toHaveBeenCalledWith(false);
  });

  it('does not fire after a successful load clears the watchdog', () => {
    const { ctx, setError } = makeCtx();
    const { result } = renderHook(() => useEmbedWatchdog(ctx, WATCHDOG_MS));

    act(() => result.current.armWatchdog(ctx.generationRef.current));
    ctx.hasLoadedRef.current = true;
    act(() => result.current.clearWatchdog());

    act(() => vi.advanceTimersByTime(WATCHDOG_MS * 2));
    expect(setError).not.toHaveBeenCalled();
  });

  it('does not fire if a newer load generation has started', () => {
    const { ctx, setError } = makeCtx();
    const { result } = renderHook(() => useEmbedWatchdog(ctx, WATCHDOG_MS));

    act(() => result.current.armWatchdog(ctx.generationRef.current));
    ctx.generationRef.current += 1;

    act(() => vi.advanceTimersByTime(WATCHDOG_MS));
    expect(setError).not.toHaveBeenCalled();
  });

  it('does not fire if the embed already reported loaded', () => {
    const { ctx, setError } = makeCtx();
    const { result } = renderHook(() => useEmbedWatchdog(ctx, WATCHDOG_MS));

    act(() => result.current.armWatchdog(ctx.generationRef.current));
    ctx.hasLoadedRef.current = true;

    act(() => vi.advanceTimersByTime(WATCHDOG_MS));
    expect(setError).not.toHaveBeenCalled();
  });

  it('re-arming cancels the prior timer (no double error)', () => {
    const { ctx, setError } = makeCtx();
    const { result } = renderHook(() => useEmbedWatchdog(ctx, WATCHDOG_MS));

    act(() => result.current.armWatchdog(ctx.generationRef.current));
    act(() => vi.advanceTimersByTime(WATCHDOG_MS / 2));
    act(() => result.current.armWatchdog(ctx.generationRef.current));
    act(() => vi.advanceTimersByTime(WATCHDOG_MS / 2));
    expect(setError).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(WATCHDOG_MS / 2));
    expect(setError).toHaveBeenCalledTimes(1);
  });
});
