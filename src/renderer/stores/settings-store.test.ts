import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSettingsStore } from './settings-store';
import { DEFAULT_SETTINGS } from '../../shared/constants';
import type { AppSettings, IPCResponse } from '../../shared/types';

// updateSettings applies the delta optimistically, then persists via IPC. On
// failure it must roll back ONLY the keys that call touched — a whole-object
// snapshot restore would also revert unrelated updates that landed while the
// failing IPC round-trip was in flight (e.g. a failing slider write clobbering
// a concurrent theme change).

const failure: IPCResponse<AppSettings> = {
  success: false,
  error: { code: 'SETTINGS_WRITE_FAILED', message: 'disk full' },
};

beforeEach(() => {
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS, isLoading: false, error: null });
  // Rollback paths log via console.error; silence it so failures stay readable.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('settings-store updateSettings (per-key rollback)', () => {
  it('keeps the optimistic value when the write succeeds', async () => {
    await useSettingsStore.getState().updateSettings({ slideshowInterval: 90 });
    expect(useSettingsStore.getState().settings.slideshowInterval).toBe(90);
  });

  it('rolls back the touched keys when the write fails', async () => {
    vi.mocked(window.electronAPI.settings.update).mockResolvedValueOnce(failure);
    await useSettingsStore.getState().updateSettings({ slideshowInterval: 90 });
    expect(useSettingsStore.getState().settings.slideshowInterval).toBe(
      DEFAULT_SETTINGS.slideshowInterval,
    );
  });

  it('rolls back the touched keys when the IPC throws', async () => {
    vi.mocked(window.electronAPI.settings.update).mockRejectedValueOnce(new Error('ipc dead'));
    await useSettingsStore.getState().updateSettings({ slideshowInterval: 90 });
    expect(useSettingsStore.getState().settings.slideshowInterval).toBe(
      DEFAULT_SETTINGS.slideshowInterval,
    );
  });

  it('a failing update rolls back ONLY its own keys, preserving a concurrent update', async () => {
    const update = vi.mocked(window.electronAPI.settings.update);

    // The slider write's IPC hangs; while it is in flight, an unrelated
    // theme update lands successfully.
    let resolveSlider!: (r: IPCResponse<AppSettings>) => void;
    update.mockImplementationOnce(
      () => new Promise<IPCResponse<AppSettings>>((resolve) => {
        resolveSlider = resolve;
      }),
    );
    const sliderWrite = useSettingsStore.getState().updateSettings({ slideshowInterval: 90 });
    expect(useSettingsStore.getState().settings.slideshowInterval).toBe(90); // optimistic

    await useSettingsStore.getState().updateSettings({ theme: 'dark' });
    expect(useSettingsStore.getState().settings.theme).toBe('dark');

    // The slider write now FAILS → only slideshowInterval reverts.
    resolveSlider(failure);
    await sliderWrite;

    expect(useSettingsStore.getState().settings.slideshowInterval).toBe(
      DEFAULT_SETTINGS.slideshowInterval,
    );
    // The concurrent theme change must NOT be clobbered by the rollback.
    expect(useSettingsStore.getState().settings.theme).toBe('dark');
  });

  it('restores multi-key updates wholesale on failure (including undefined keys)', async () => {
    useSettingsStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        autoStartMode: 'report',
        autoStartReportId: 'r-1',
        autoStartWorkspaceId: 'w-1',
      },
    });
    vi.mocked(window.electronAPI.settings.update).mockResolvedValueOnce(failure);

    // The coalesced mode-change write (clears the ids) fails...
    await useSettingsStore.getState().updateSettings({
      autoStartMode: 'off',
      autoStartReportId: undefined,
      autoStartWorkspaceId: undefined,
    });

    // ...so every touched key — including the explicitly-undefined ones —
    // returns to its pre-optimistic value.
    const settings = useSettingsStore.getState().settings;
    expect(settings.autoStartMode).toBe('report');
    expect(settings.autoStartReportId).toBe('r-1');
    expect(settings.autoStartWorkspaceId).toBe('w-1');
  });
});
