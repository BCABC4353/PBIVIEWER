import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AppSettings } from '../../shared/types';

const backing = new Map<string, unknown>();

vi.mock('electron-store', () => {
  return {
    default: class {
      get(key: string, defaultValue?: unknown): unknown {
        return backing.has(key) ? backing.get(key) : defaultValue;
      }
      set(key: string, value: unknown): void {
        backing.set(key, value);
      }
    },
  };
});

import { settingsService } from './settings-service';
import { DEFAULT_SETTINGS } from '../../shared/constants';

const PRE_EXISTING_INSTALL = {
  theme: 'light',
  sidebarCollapsed: false,
  slideshowInterval: 45,
  slideshowMode: 'bookmarks',
  autoStartSlideshow: true,
  autoRefreshInterval: 15,
};

beforeEach(() => {
  backing.clear();
});

describe('settingsService.getSettings — back-filling defaults added after install', () => {
  it('returns full defaults when nothing was ever stored', () => {
    const res = settingsService.getSettings();
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data).toEqual(DEFAULT_SETTINGS);
  });

  it('back-fills fields missing from a pre-existing install with their defaults', () => {
    backing.set('settings', { ...PRE_EXISTING_INSTALL });

    const res = settingsService.getSettings();
    expect(res.success).toBe(true);
    if (!res.success) return;

    expect(res.data.autoRefreshEnabled).toBe(DEFAULT_SETTINGS.autoRefreshEnabled);
    expect(res.data.autoStartMode).toBe(DEFAULT_SETTINGS.autoStartMode);
    expect(res.data.usageClearOnLogout).toBe(DEFAULT_SETTINGS.usageClearOnLogout);
    expect(res.data.autoRefreshEnabled).not.toBeUndefined();
    expect(res.data.autoStartMode).not.toBeUndefined();
    expect(res.data.usageClearOnLogout).not.toBeUndefined();
  });

  it('keeps stored values over defaults', () => {
    backing.set('settings', { ...PRE_EXISTING_INSTALL, usageClearOnLogout: 'always' });

    const res = settingsService.getSettings();
    expect(res.success).toBe(true);
    if (!res.success) return;

    expect(res.data.theme).toBe('light');
    expect(res.data.sidebarCollapsed).toBe(false);
    expect(res.data.slideshowInterval).toBe(45);
    expect(res.data.slideshowMode).toBe('bookmarks');
    expect(res.data.autoStartSlideshow).toBe(true);
    expect(res.data.autoRefreshInterval).toBe(15);
    expect(res.data.usageClearOnLogout).toBe('always');
  });
});

describe('settingsService.updateSettings — persists the merged object', () => {
  it('applies the update on top of back-filled defaults and persists the full shape', () => {
    backing.set('settings', { ...PRE_EXISTING_INSTALL });

    const res = settingsService.updateSettings({ theme: 'system' });
    expect(res.success).toBe(true);
    if (!res.success) return;

    expect(res.data.theme).toBe('system');
    expect(res.data.autoRefreshEnabled).toBe(DEFAULT_SETTINGS.autoRefreshEnabled);
    expect(res.data.autoStartMode).toBe(DEFAULT_SETTINGS.autoStartMode);
    expect(res.data.usageClearOnLogout).toBe(DEFAULT_SETTINGS.usageClearOnLogout);

    const persisted = backing.get('settings') as AppSettings;
    expect(persisted.theme).toBe('system');
    expect(persisted.slideshowInterval).toBe(45);
    expect(persisted.autoRefreshEnabled).toBe(DEFAULT_SETTINGS.autoRefreshEnabled);
    expect(persisted.autoStartMode).toBe(DEFAULT_SETTINGS.autoStartMode);
    expect(persisted.usageClearOnLogout).toBe(DEFAULT_SETTINGS.usageClearOnLogout);
  });

  it('keeps a stored newer-field value when the update does not touch it', () => {
    backing.set('settings', { ...PRE_EXISTING_INSTALL, usageClearOnLogout: 'on-shared-machine' });

    const res = settingsService.updateSettings({ sidebarCollapsed: true });
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.usageClearOnLogout).toBe('on-shared-machine');
    expect((backing.get('settings') as AppSettings).usageClearOnLogout).toBe('on-shared-machine');
  });
});

describe('settingsService.resetSettings', () => {
  it('restores and persists pure defaults', () => {
    backing.set('settings', { ...PRE_EXISTING_INSTALL, usageClearOnLogout: 'always' });

    const res = settingsService.resetSettings();
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data).toEqual(DEFAULT_SETTINGS);
    expect(backing.get('settings')).toEqual(DEFAULT_SETTINGS);

    const after = settingsService.getSettings();
    expect(after.success).toBe(true);
    if (after.success) expect(after.data).toEqual(DEFAULT_SETTINGS);
  });
});
