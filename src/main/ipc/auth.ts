import { ipcMain } from 'electron';
import { authService } from '../auth/auth-service';
import { powerbiApiService } from '../services/powerbi-api';

export function registerAuthIpc(): void {
  ipcMain.handle('auth:login', async () => {
    return await authService.login();
  });

  ipcMain.handle('auth:logout', async () => {
    const result = await authService.logout();
    powerbiApiService.clearCaches();
    return result;
  });

  ipcMain.handle('auth:get-user', async () => {
    return await authService.getCurrentUser();
  });

  ipcMain.handle('auth:get-token', async () => {
    return await authService.getAccessToken();
  });

  ipcMain.handle('auth:is-authenticated', async () => {
    return await authService.isAuthenticated();
  });

  ipcMain.handle('auth:validate-token', async () => {
    return await authService.validateToken();
  });

  ipcMain.handle('auth:switch-account', async () => {
    powerbiApiService.clearCaches();
    return await authService.switchAccount();
  });
}
