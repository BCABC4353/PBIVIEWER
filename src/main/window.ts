import { app, BrowserWindow, shell, nativeTheme } from 'electron';
import * as path from 'path';
import { PARTITION_NAME, APP_NAME, TITLE_BAR_COLORS } from '../shared/constants';
import { settingsService } from './services/settings-service';

let mainWindow: BrowserWindow | null = null;

export const isDev = !app.isPackaged;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function createWindow(): void {
  // Get initial theme setting to set correct colors
  const settingsResult = settingsService.getSettings();
  const initialTheme = settingsResult.success ? settingsResult.data.theme : 'light';
  // Check if dark theme: either explicit 'dark' or 'system' with native dark mode
  const isDarkTheme = initialTheme === 'dark' || (initialTheme === 'system' && nativeTheme.shouldUseDarkColors);

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    title: APP_NAME,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: isDarkTheme ? TITLE_BAR_COLORS.dark.background : TITLE_BAR_COLORS.light.background,
      symbolColor: isDarkTheme ? TITLE_BAR_COLORS.dark.symbol : TITLE_BAR_COLORS.light.symbol,
      height: 40,
    },
    webPreferences: {
      partition: isDev ? undefined : PARTITION_NAME, // Don't use partition in dev mode
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true, // Enable webview tag for Power BI App viewing
    },
    icon: path.join(__dirname, '../../../assets/icons/icon.png'),
    show: false,
    backgroundColor: isDarkTheme ? TITLE_BAR_COLORS.dark.background : TITLE_BAR_COLORS.light.background,
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));
  }

  // Navigation guard - prevent main window from navigating to external sites
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://') && !url.startsWith('http://localhost')) {
      event.preventDefault();
    }
  });

  // Deny window.open on the main window - open https links in the system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:') shell.openExternal(url);
    } catch {
      // ignore invalid URL
    }
    return { action: 'deny' };
  });

  // Kiosk resilience (NEW-PROD-2): if the renderer process crashes (OOM / GPU
  // fault) on an unattended wall display, auto-reload so it self-heals instead
  // of going blank. Bounded to 3 reloads per 60 s so a hard, repeatable crash
  // does not spin in an infinite reload loop.
  let crashReloads = 0;
  let crashWindowStart = Date.now();
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return;
    const now = Date.now();
    if (now - crashWindowStart > 60_000) {
      crashReloads = 0;
      crashWindowStart = now;
    }
    if (crashReloads >= 3) return;
    crashReloads++;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.reload();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}
