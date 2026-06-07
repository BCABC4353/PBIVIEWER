import { app, BrowserWindow, session } from 'electron';
import { PARTITION_NAME } from '../shared/constants';
import { authService } from './auth/auth-service';
import { installCsp, registerWebviewSecurity } from './security';
import { createWindow, getMainWindow, isDev } from './window';
import { setupLogging } from './ipc/log';
import { registerAllIpcHandlers } from './ipc/register';

setupLogging();

// Global error handlers are installed by `log.errorHandler.startCatching()` in
// setupLogging() — do not duplicate them here, or each crash logs twice.

// App lifecycle
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
    // Content Security Policy - register on default session always, and on the
    // partition session in production (where the packaged renderer is file://).
    installCsp(session.defaultSession);
    if (!isDev) installCsp(session.fromPartition(PARTITION_NAME));

    // SEC-S1: webview guard is wired onto each WebContents in the
    // web-contents-created handler below (will-attach-webview is a WebContents
    // event, not a Session event). Nothing to do here.

    // Initialize auth service
    await authService.initialize();

    createWindow();

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

// SEC-S1: webview security guard (will-attach-webview / web-contents-created).
registerWebviewSecurity();

// Register all IPC handlers (window, auth, content, settings, export, usage, app, log).
registerAllIpcHandlers();
