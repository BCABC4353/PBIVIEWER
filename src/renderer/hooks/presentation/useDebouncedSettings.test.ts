/**
 * useDebouncedSettings — the slider persist path must (1) update the store
 * optimistically on every drag step but hit the IPC only once per drag, and
 * (2) FLUSH a still-pending delta on unmount. Clear-without-flush was the bug:
 * a drag ending just before navigation showed the new value (optimistic store
 * write) while disk never got it, so the next launch silently reverted it.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebouncedSettings } from './useDebouncedSettings';
import { useSettingsStore } from '../../stores/settings-store';
import { DEFAULT_SETTINGS } from '../../../shared/constants';

function resetStore(): void {
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS, isLoading: false, error: null });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('useDebouncedSettings', () => {
  it('updates the store on every step but persists only the final drag value', async () => {
    vi.useFakeTimers();
    resetStore();
    const update = vi.mocked(window.electronAPI.settings.update);

    const { result } = renderHook(() => useDebouncedSettings());
    act(() => {
      result.current.onIntervalChange(10);
      result.current.onIntervalChange(20);
      result.current.onIntervalChange(30);
    });

    // Optimistic store write is immediate (slider thumb tracks the drag)...
    expect(useSettingsStore.getState().settings.slideshowInterval).toBe(30);
    // ...but no IPC until the debounce window closes.
    expect(update).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ slideshowInterval: 30 });
  });

  it('FLUSHES a pending update on unmount instead of dropping it', () => {
    vi.useFakeTimers();
    resetStore();
    const update = vi.mocked(window.electronAPI.settings.update);

    const { result, unmount } = renderHook(() => useDebouncedSettings());
    act(() => {
      result.current.onIntervalChange(45);
    });
    expect(update).not.toHaveBeenCalled();

    // Unmount mid-debounce: the pending value must persist NOW, not vanish.
    unmount();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ slideshowInterval: 45 });

    // The cancelled timer must not double-persist after the flush.
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('onDebouncedUpdate merges interleaved keys into one persisted delta', async () => {
    vi.useFakeTimers();
    resetStore();
    const update = vi.mocked(window.electronAPI.settings.update);

    const { result } = renderHook(() => useDebouncedSettings());
    act(() => {
      result.current.onDebouncedUpdate({ slideshowInterval: 25 });
      result.current.onDebouncedUpdate({ autoRefreshInterval: 5 });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ slideshowInterval: 25, autoRefreshInterval: 5 });
  });
});
