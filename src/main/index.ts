import { app, BrowserWindow, session } from 'electron';
import { PARTITION_NAME } from '../shared/constants';
import { authService } from './auth/auth-service';
import { installCsp, registerWebviewSecurity } from './security';
import { createWindow, getMainWindow, isDev } from './window';
import { setupLogging } from './ipc/log';
import { registerAllIpcHandlers } from './ipc/register';
import { releaseDisplaySleepBlocker } from './ipc/kiosk';
import { setupAutoUpdater } from './updater';
import { getIssueBeacon } from './services/issue-beacon-service';

setupLogging();


if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    const appNameToken = app.getName().replace(/[.*+?^${}()|[\]\\\s]/g, '\\$&');
    app.userAgentFallback = app.userAgentFallback
      .replace(/ Electron\/[\d.]+/i, '')
      .replace(new RegExp(` ${appNameToken}\\/[\\d.]+`, 'i'), '');

    installCsp(session.defaultSession);
    if (!isDev) installCsp(session.fromPartition(PARTITION_NAME));


    try {
      await authService.initialize();
    } catch (err) {
      console.error('[startup] authService.initialize() failed; showing window anyway:', err);
    }

    createWindow();

    getIssueBeacon().start();

    setupAutoUpdater();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  releaseDisplaySleepBlocker();
});

app.on('certificate-error', (_event, _webContents, url, error, _certificate, callback) => {
  console.error('[certificate-error]', url, error);
  callback(false);
});

registerWebviewSecurity();

registerAllIpcHandlers();
