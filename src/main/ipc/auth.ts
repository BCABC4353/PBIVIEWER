import { ipcMain } from 'electron';
import { authService } from '../auth/auth-service';
import { powerbiApiService } from '../services/powerbi-api';

export function registerAuthIpc(): void {
  ipcMain.handle('auth:login', async () => {
    return await authService.login();
  });

  ipcMain.handle('auth:logout', async () => {
    const result = await authService.logout();
    // Drop account-scoped API caches so the next account on this machine can
    // never be served the signed-out account's cached data.
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

  // Account switcher — logout() then login({ prompt: 'select_account' }).
  ipcMain.handle('auth:switch-account', async () => {
    // Clear account-scoped API caches up front: switchAccount tears the old
    // session down internally, so the cache must not survive into the new one.
    powerbiApiService.clearCaches();
    return await authService.switchAccount();
  });
}
