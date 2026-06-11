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
  const settingsResult = settingsService.getSettings();
  const initialTheme = settingsResult.success ? settingsResult.data.theme : 'light';
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
      partition: isDev ? undefined : PARTITION_NAME,
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
    },
    icon: path.join(__dirname, '../../../assets/icons/icon.png'),
    show: false,
    backgroundColor: isDarkTheme ? TITLE_BAR_COLORS.dark.background : TITLE_BAR_COLORS.light.background,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));
  }

  mainWindow.webContents.on('will-navigate', (event, url) => {
    let allowed = false;
    try {
      const parsed = new URL(url);
      allowed =
        parsed.protocol === 'file:' ||
        (isDev && parsed.protocol === 'http:' && parsed.hostname === 'localhost');
    } catch {
    }
    if (!allowed) {
      event.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:') shell.openExternal(url);
    } catch {
    }
    return { action: 'deny' };
  });

  let crashReloads = 0;
  let crashWindowStart = Date.now();
  let crashBackoffTimer: ReturnType<typeof setTimeout> | null = null;
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return;
    const now = Date.now();
    if (now - crashWindowStart > 60_000) {
      crashReloads = 0;
      crashWindowStart = now;
    }
    if (crashReloads >= 3) {
      if (!crashBackoffTimer) {
        crashBackoffTimer = setTimeout(() => {
          crashBackoffTimer = null;
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.reload();
          }
        }, 60_000);
      }
      return;
    }
    crashReloads++;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.reload();
    }
  });

  mainWindow.on('closed', () => {
    if (crashBackoffTimer) {
      clearTimeout(crashBackoffTimer);
      crashBackoffTimer = null;
    }
    mainWindow = null;
  });
}
