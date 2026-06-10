/**
 * Tests for the slideshow auto-recovery backoff hook.
 *
 * Verifies the 5s → 30s → 60s → 60s… schedule, that recovery only runs while
 * active, that the backoff index resets after a successful recovery (error
 * clears), and that pending timers are cleaned up on unmount.
 */

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
    renderHook(() => useKioskRecovery({ error: 'boom', active: true, recover }));

    act(() => vi.advanceTimersByTime(D0 - 1));
    expect(recover).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(recover).toHaveBeenCalledTimes(1);
  });

  it('does not attempt recovery when inactive (slideshow not playing)', () => {
    const recover = vi.fn();
    renderHook(() => useKioskRecovery({ error: 'boom', active: false, recover }));
    act(() => vi.advanceTimersByTime(D0 * 2));
    expect(recover).not.toHaveBeenCalled();
  });

  it('does not attempt recovery when there is no error', () => {
    const recover = vi.fn();
    renderHook(() => useKioskRecovery({ error: null, active: true, recover }));
    act(() => vi.advanceTimersByTime(D2 * 2));
    expect(recover).not.toHaveBeenCalled();
  });

  it('follows the 5s → 30s → 60s → 60s backoff across a persistent error', () => {
    const recover = vi.fn();
    // error stays set the whole time; the hook self-chains each attempt.
    renderHook(() => useKioskRecovery({ error: 'boom', active: true, recover }));

    act(() => vi.advanceTimersByTime(D0)); // 1st attempt at D0
    expect(recover).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(D1)); // 2nd attempt at D1
    expect(recover).toHaveBeenCalledTimes(2);

    act(() => vi.advanceTimersByTime(D2)); // 3rd attempt at D2
    expect(recover).toHaveBeenCalledTimes(3);

    act(() => vi.advanceTimersByTime(D2)); // 4th attempt still at D2 (clamped)
    expect(recover).toHaveBeenCalledTimes(4);
  });

  it('resets the backoff index after a successful recovery (error clears)', () => {
    const recover = vi.fn();
    const { rerender } = renderHook(
      (props: { error: string | null }) =>
        useKioskRecovery({ error: props.error, active: true, recover }),
      { initialProps: { error: 'boom' as string | null } },
    );

    // First failure cycle → 1st attempt at D0.
    act(() => vi.advanceTimersByTime(D0));
    expect(recover).toHaveBeenCalledTimes(1);

    // Recovery succeeds: error clears, backoff resets.
    rerender({ error: null });
    act(() => vi.advanceTimersByTime(D2));

    // New error streak begins → next attempt should again be the FIRST delay.
    rerender({ error: 'boom2' });
    act(() => vi.advanceTimersByTime(D0 - 1));
    expect(recover).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(1));
    expect(recover).toHaveBeenCalledTimes(2);
  });

  it('clears the pending timer on unmount (no leak / no post-unmount call)', () => {
    const recover = vi.fn();
    const { unmount } = renderHook(() =>
      useKioskRecovery({ error: 'boom', active: true, recover }),
    );
    act(() => vi.advanceTimersByTime(D0 - 1));
    unmount();
    act(() => vi.advanceTimersByTime(D0 * 4));
    expect(recover).not.toHaveBeenCalled();
  });
});
