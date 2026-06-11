import { ipcMain } from 'electron';
import { settingsService } from '../services/settings-service';
import { validateAppSettingsPatch } from '../../shared/validation';
import type { AppSettings } from '../../shared/types';

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:get', async () => {
    return settingsService.getSettings();
  });

  ipcMain.handle('settings:update', async (_event, updates: Partial<AppSettings>) => {
    const { sanitized, rejected } = validateAppSettingsPatch(updates);
    if (rejected.length > 0) {
      return { success: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid settings payload' } };
    }
    return settingsService.updateSettings(sanitized);
  });

  ipcMain.handle('settings:reset', async () => {
    return settingsService.resetSettings();
  });
}
