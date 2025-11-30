import 'dotenv/config';
import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { PARTITION_NAME, APP_NAME } from '../shared/constants';
import { authService } from './auth/auth-service';
import { powerbiApiService } from './services/powerbi-api';
import { settingsService } from './services/settings-service';
import { cacheService } from './services/cache-service';
import { usageTrackingService } from './services/usage-tracking-service';
import type { ContentItem, AppSettings, DatasetRefreshInfo } from '../shared/types';

// Handle creating/removing shortcuts on Windows when installing/uninstalling
try {
  if (require('electron-squirrel-startup')) {
    app.quit();
  }
} catch {
  // electron-squirrel-startup not available, continue
}

let mainWindow: BrowserWindow | null = null;

const isDev = !app.isPackaged;

function createWindow(): void {
  // Get initial theme setting to set correct colors
  const settingsResult = settingsService.getSettings();
  const initialTheme = settingsResult.success && settingsResult.data ? settingsResult.data.theme : 'light';
  // Check if dark theme: either explicit 'dark' or 'system' with native dark mode
  const nativeTheme = require('electron').nativeTheme;
  const isDarkTheme = initialTheme === 'dark' || (initialTheme === 'system' && nativeTheme.shouldUseDarkColors);

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    title: APP_NAME,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: isDarkTheme ? '#1f1f1f' : '#f5f5f5',
      symbolColor: isDarkTheme ? '#ffffff' : '#242424',
      height: 40,
    },
    webPreferences: {
      partition: isDev ? undefined : PARTITION_NAME, // Don't use partition in dev mode
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Needed for electron-store
      webSecurity: !isDev, // Disable web security in dev for localhost
      webviewTag: true, // Enable webview tag for Power BI App viewing
    },
    icon: path.join(__dirname, '../../../assets/icons/icon.png'),
    show: false,
    backgroundColor: isDarkTheme ? '#1f1f1f' : '#f5f5f5',
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

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(async () => {
  // Initialize auth service
  await authService.initialize();

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ============================================
// IPC HANDLERS - Window Controls
// ============================================

ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.handle('window:close', () => {
  mainWindow?.close();
});

ipcMain.handle('window:is-maximized', () => {
  return mainWindow?.isMaximized() ?? false;
});

ipcMain.handle('window:set-title-bar-overlay', (_event, options: { color: string; symbolColor: string }) => {
  if (mainWindow && process.platform === 'win32') {
    mainWindow.setTitleBarOverlay({
      color: options.color,
      symbolColor: options.symbolColor,
      height: 40,
    });
  }
});

// ============================================
// IPC HANDLERS - Auth
// ============================================

ipcMain.handle('auth:login', async () => {
  return await authService.login();
});

ipcMain.handle('auth:logout', async () => {
  return await authService.logout();
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

// ============================================
// IPC HANDLERS - Content
// ============================================

ipcMain.handle('content:get-workspaces', async () => {
  return await powerbiApiService.getWorkspaces();
});

ipcMain.handle('content:get-reports', async (_event, workspaceId: string) => {
  return await powerbiApiService.getReports(workspaceId);
});

ipcMain.handle('content:get-dashboards', async (_event, workspaceId: string) => {
  return await powerbiApiService.getDashboards(workspaceId);
});

ipcMain.handle('content:get-apps', async () => {
  return await powerbiApiService.getApps();
});

ipcMain.handle('content:get-app', async (_event, appId: string) => {
  return await powerbiApiService.getApp(appId);
});

ipcMain.handle('content:get-app-reports', async (_event, appId: string) => {
  return await powerbiApiService.getAppReports(appId);
});

ipcMain.handle('content:get-app-dashboards', async (_event, appId: string) => {
  return await powerbiApiService.getAppDashboards(appId);
});

ipcMain.handle('content:get-embed-token', async (_event, reportId: string, workspaceId: string) => {
  return await powerbiApiService.getEmbedToken(reportId, workspaceId);
});

ipcMain.handle('content:get-dataset-refresh-info', async (_event, datasetId: string) => {
  return await powerbiApiService.getDatasetRefreshInfo(datasetId);
});

ipcMain.handle('content:get-recent', async () => {
  try {
    const result = await powerbiApiService.getAllItems();

    if (!result.success || !result.data) {
      return result;
    }

    // Get workspace names for display
    const workspacesResult = await powerbiApiService.getWorkspaces();
    const workspaceMap = new Map(
      (workspacesResult.data || []).map((ws) => [ws.id, ws.name])
    );

    // Convert to ContentItem format
    const recentItems: ContentItem[] = [
      ...result.data.reports.map((report) => ({
        id: report.id,
        name: report.name,
        type: 'report' as const,
        workspaceId: report.workspaceId,
        workspaceName: workspaceMap.get(report.workspaceId) || 'Unknown',
      })),
      ...result.data.dashboards.map((dashboard) => ({
        id: dashboard.id,
        name: dashboard.name,
        type: 'dashboard' as const,
        workspaceId: dashboard.workspaceId,
        workspaceName: workspaceMap.get(dashboard.workspaceId) || 'Unknown',
      })),
    ];

    return { success: true, data: recentItems };
  } catch (error) {
    return {
      success: false,
      error: { code: 'RECENT_FETCH_FAILED', message: String(error) },
    };
  }
});

// ============================================
// IPC HANDLERS - Cache
// ============================================

ipcMain.handle('cache:get-thumbnail', async (_event, itemId: string, itemType: string, workspaceId: string) => {
  return await cacheService.getThumbnail(itemId, itemType as 'report' | 'dashboard', workspaceId);
});

ipcMain.handle('cache:get-offline', async () => {
  return cacheService.getOfflineContent();
});

ipcMain.handle('cache:save-offline', async (_event, items: ContentItem[]) => {
  return await cacheService.cacheOfflineContent(items);
});

ipcMain.handle('cache:get-last-sync', async () => {
  return cacheService.getLastSyncTime();
});

ipcMain.handle('cache:get-stats', async () => {
  return cacheService.getCacheStats();
});

ipcMain.handle('cache:clear', async () => {
  return cacheService.clearCache();
});

// ============================================
// IPC HANDLERS - Settings
// ============================================

ipcMain.handle('settings:get', async () => {
  return settingsService.getSettings();
});

ipcMain.handle('settings:update', async (_event, updates: Partial<AppSettings>) => {
  return settingsService.updateSettings(updates);
});

ipcMain.handle('settings:reset', async () => {
  return settingsService.resetSettings();
});

// ============================================
// IPC HANDLERS - Usage Tracking
// ============================================

ipcMain.handle('usage:record-open', async (_event, item: {
  id: string;
  name: string;
  type: 'report' | 'dashboard';
  workspaceId: string;
  workspaceName: string;
}) => {
  try {
    usageTrackingService.recordItemOpened(item);
    return { success: true };
  } catch (error) {
    return { success: false, error: { code: 'USAGE_RECORD_FAILED', message: String(error) } };
  }
});

ipcMain.handle('usage:get-recent', async () => {
  try {
    const items = usageTrackingService.getRecentItems();

    const contentItems: ContentItem[] = items.map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      workspaceId: item.workspaceId,
      workspaceName: item.workspaceName,
      lastOpened: item.lastOpened,
      openCount: item.openCount,
    }));

    return { success: true, data: contentItems };
  } catch (error) {
    return { success: false, error: { code: 'USAGE_GET_RECENT_FAILED', message: String(error) } };
  }
});

ipcMain.handle('usage:get-frequent', async () => {
  try {
    const items = usageTrackingService.getFrequentItems();

    const contentItems: ContentItem[] = items.map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      workspaceId: item.workspaceId,
      workspaceName: item.workspaceName,
      lastOpened: item.lastOpened,
      openCount: item.openCount,
    }));

    return { success: true, data: contentItems };
  } catch (error) {
    return { success: false, error: { code: 'USAGE_GET_FREQUENT_FAILED', message: String(error) } };
  }
});

ipcMain.handle('usage:clear', async () => {
  try {
    usageTrackingService.clearUsageData();
    return { success: true };
  } catch (error) {
    return { success: false, error: { code: 'USAGE_CLEAR_FAILED', message: String(error) } };
  }
});

// ============================================
// IPC HANDLERS - App Info
// ============================================

ipcMain.handle('app:get-partition-name', () => {
  // Return the partition name used by the main window
  // In dev mode, we use no partition (undefined/null), in production we use PARTITION_NAME
  return isDev ? null : PARTITION_NAME;
});
