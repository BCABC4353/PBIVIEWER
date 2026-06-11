
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

    expect(useSettingsStore.getState().settings.slideshowInterval).toBe(30);
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

    unmount();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ slideshowInterval: 45 });

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
