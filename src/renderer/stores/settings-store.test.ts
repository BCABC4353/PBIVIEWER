import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSettingsStore } from './settings-store';
import { DEFAULT_SETTINGS } from '../../shared/constants';
import type { AppSettings, IPCResponse } from '../../shared/types';


const failure: IPCResponse<AppSettings> = {
  success: false,
  error: { code: 'SETTINGS_WRITE_FAILED', message: 'disk full' },
};

beforeEach(() => {
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS, isLoading: false, error: null });
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

    let resolveSlider!: (r: IPCResponse<AppSettings>) => void;
    update.mockImplementationOnce(
      () => new Promise<IPCResponse<AppSettings>>((resolve) => {
        resolveSlider = resolve;
      }),
    );
    const sliderWrite = useSettingsStore.getState().updateSettings({ slideshowInterval: 90 });
    expect(useSettingsStore.getState().settings.slideshowInterval).toBe(90);

    await useSettingsStore.getState().updateSettings({ theme: 'dark' });
    expect(useSettingsStore.getState().settings.theme).toBe('dark');

    resolveSlider(failure);
    await sliderWrite;

    expect(useSettingsStore.getState().settings.slideshowInterval).toBe(
      DEFAULT_SETTINGS.slideshowInterval,
    );
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

    await useSettingsStore.getState().updateSettings({
      autoStartMode: 'off',
      autoStartReportId: undefined,
      autoStartWorkspaceId: undefined,
    });

    const settings = useSettingsStore.getState().settings;
    expect(settings.autoStartMode).toBe('report');
    expect(settings.autoStartReportId).toBe('r-1');
    expect(settings.autoStartWorkspaceId).toBe('w-1');
  });
});
