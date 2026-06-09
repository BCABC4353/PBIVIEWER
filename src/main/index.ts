import { app, BrowserWindow, session } from 'electron';
import { PARTITION_NAME } from '../shared/constants';
import { authService } from './auth/auth-service';
import { installCsp, registerWebviewSecurity } from './security';
import { createWindow, getMainWindow, isDev } from './window';
import { setupLogging } from './ipc/log';
import { registerAllIpcHandlers } from './ipc/register';
import { setupAutoUpdater } from './updater';

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
    // Present embedded browser surfaces (the AAD auth window and the App
    // <webview>) as plain Chrome. Microsoft 365 / Power BI flag the default
    // Electron user-agent (the "Electron/<ver>" + app-name tokens) as an
    // unsupported / "out of date" browser and refuse silent SSO — which forced a
    // password re-prompt in the Apps webview on Electron 42. Stripping those
    // tokens keeps the real (current) Chromium version while looking supported.
    const appNameToken = app.getName().replace(/[.*+?^${}()|[\]\\\s]/g, '\\$&');
    app.userAgentFallback = app.userAgentFallback
      .replace(/ Electron\/[\d.]+/i, '')
      .replace(new RegExp(` ${appNameToken}\\/[\\d.]+`, 'i'), '');

    // Content Security Policy - register on default session always, and on the
    // partition session in production (where the packaged renderer is file://).
    installCsp(session.defaultSession);
    if (!isDev) installCsp(session.fromPartition(PARTITION_NAME));

    // SEC-S1: webview guard is wired onto each WebContents in the
    // web-contents-created handler below (will-attach-webview is a WebContents
    // event, not a Session event). Nothing to do here.

    // Initialize auth service. A throw here must NOT leave the app running with
    // no window (a double-clicked app where "nothing happens"). Log it and show
    // the window anyway so the user still reaches the login screen.
    try {
      await authService.initialize();
    } catch (err) {
      console.error('[startup] authService.initialize() failed; showing window anyway:', err);
    }

    createWindow();

    // Auto-update: Windows installs silently on next restart; macOS shows a
    // "new version available" notice. No-op in dev / unpackaged builds.
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

// Diagnosability: log TLS/certificate failures (e.g. a corporate TLS-inspection
// root CA that isn't in the OS trust store) instead of failing silently with a
// blank window. We do NOT auto-trust — callback(false) preserves the secure
// default; this only surfaces the host + error code in the log file for IT.
app.on('certificate-error', (_event, _webContents, url, error, _certificate, callback) => {
  console.error('[certificate-error]', url, error);
  callback(false);
});

// SEC-S1: webview security guard (will-attach-webview / web-contents-created).
registerWebviewSecurity();

// Register all IPC handlers (window, auth, content, settings, export, usage, app, log).
registerAllIpcHandlers();
