
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { useKioskRecovery } from './useKioskRecovery';
import { KIOSK_RECOVERY_BACKOFF_MS } from '../../../shared/constants';

const [D0, D1, D2] = KIOSK_RECOVERY_BACKOFF_MS as readonly [number, number, number];

describe('PROD-S1 useKioskRecovery', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('schedules the first recovery after the first backoff delay', () => {
    const recover = vi.fn();
    renderHook(() => useKioskRecovery({ error: 'boom', loaded: false, active: true, recover }));

    act(() => vi.advanceTimersByTime(D0 - 1));
    expect(recover).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(recover).toHaveBeenCalledTimes(1);
  });

  it('does not attempt recovery when inactive (slideshow not playing)', () => {
    const recover = vi.fn();
    renderHook(() => useKioskRecovery({ error: 'boom', loaded: false, active: false, recover }));
    act(() => vi.advanceTimersByTime(D0 * 2));
    expect(recover).not.toHaveBeenCalled();
  });

  it('does not attempt recovery when there is no error', () => {
    const recover = vi.fn();
    renderHook(() => useKioskRecovery({ error: null, loaded: false, active: true, recover }));
    act(() => vi.advanceTimersByTime(D2 * 2));
    expect(recover).not.toHaveBeenCalled();
  });

  it('follows the 5s → 30s → 60s → 60s backoff across a persistent error', () => {
    const recover = vi.fn();
    renderHook(() => useKioskRecovery({ error: 'boom', loaded: false, active: true, recover }));

    act(() => vi.advanceTimersByTime(D0));
    expect(recover).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(D1));
    expect(recover).toHaveBeenCalledTimes(2);

    act(() => vi.advanceTimersByTime(D2));
    expect(recover).toHaveBeenCalledTimes(3);

    act(() => vi.advanceTimersByTime(D2));
    expect(recover).toHaveBeenCalledTimes(4);
  });

  it('resets the backoff only after a sustained successful load, not a transient error-clear', () => {
    const recover = vi.fn();
    const { rerender } = renderHook(
      (props: { error: string | null; loaded: boolean }) =>
        useKioskRecovery({ error: props.error, loaded: props.loaded, active: true, recover }),
      { initialProps: { error: 'boom' as string | null, loaded: false } },
    );

    act(() => vi.advanceTimersByTime(D0));
    expect(recover).toHaveBeenCalledTimes(1);

    // The report finished loading — this resets the escalation.
    rerender({ error: null, loaded: true });
    act(() => vi.advanceTimersByTime(D2));

    rerender({ error: 'boom2', loaded: false });
    act(() => vi.advanceTimersByTime(D0 - 1));
    expect(recover).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(1));
    expect(recover).toHaveBeenCalledTimes(2);
  });

  it('does NOT reset the backoff when reload transiently clears the error (regression: D-H1)', () => {
    const recover = vi.fn();
    const { rerender } = renderHook(
      (props: { error: string | null; loaded: boolean }) =>
        useKioskRecovery({ error: props.error, loaded: props.loaded, active: true, recover }),
      { initialProps: { error: 'boom' as string | null, loaded: false } },
    );

    // First retry fires at D0; the reload momentarily clears error but never loads.
    act(() => vi.advanceTimersByTime(D0));
    expect(recover).toHaveBeenCalledTimes(1);
    rerender({ error: null, loaded: false }); // reload in flight
    act(() => vi.advanceTimersByTime(D0));
    rerender({ error: 'boom', loaded: false }); // load failed again

    // Backoff must have escalated to D1, not restarted at D0.
    act(() => vi.advanceTimersByTime(D1 - 1));
    expect(recover).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(1));
    expect(recover).toHaveBeenCalledTimes(2);
  });

  it('clears the pending timer on unmount (no leak / no post-unmount call)', () => {
    const recover = vi.fn();
    const { unmount } = renderHook(() =>
      useKioskRecovery({ error: 'boom', loaded: false, active: true, recover }),
    );
    act(() => vi.advanceTimersByTime(D0 - 1));
    unmount();
    act(() => vi.advanceTimersByTime(D0 * 4));
    expect(recover).not.toHaveBeenCalled();
  });
});
