import { app, BrowserWindow, ipcMain, dialog, screen, session, shell } from 'electron';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PARTITION_NAME, APP_NAME } from '../shared/constants';
import { authService } from './auth/auth-service';
import { powerbiApiService } from './services/powerbi-api';
import { settingsService } from './services/settings-service';
import { usageTrackingService } from './services/usage-tracking-service';
import type { ContentItem, AppSettings, DatasetRefreshInfo } from '../shared/types';

let mainWindow: BrowserWindow | null = null;

const isDev = !app.isPackaged;

// ============================================
// SECURITY HELPERS
// ============================================

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateUUID(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return UUID_REGEX.test(value) ? value : null;
}

function isValidExportPath(filePath: string): boolean {
  const resolved = path.resolve(filePath);
  const home = os.homedir();
  const downloads = app.getPath('downloads');
  const desktop = app.getPath('desktop');
  const documents = app.getPath('documents');
  const allowedRoots = [home, downloads, desktop, documents];
  return (
    allowedRoots.some((root) => resolved.startsWith(root + path.sep) || resolved === root) &&
    resolved.toLowerCase().endsWith('.pdf')
  );
}

const APP_CSP =
  "default-src 'self'; script-src 'self'; " +
  "frame-src https://app.powerbi.com https://login.microsoftonline.com; " +
  "connect-src https://api.powerbi.com https://login.microsoftonline.com; " +
  "style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
  "object-src 'none'; base-uri 'self'";

function installCsp(sess: Electron.Session): void {
  sess.webRequest.onHeadersReceived((details, callback) => {
    // Enforce CSP ONLY on our own app document (file://). Never rewrite headers on
    // remote Power BI / AAD responses (different URLs), or the embeds break.
    if (details.url.startsWith('file://')) {
      callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [APP_CSP] } });
    } else {
      callback({ responseHeaders: details.responseHeaders });
    }
  });
}

function createWindow(): void {
  // Get initial theme setting to set correct colors
  const settingsResult = settingsService.getSettings();
  const initialTheme = settingsResult.success ? settingsResult.data.theme : 'light';
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
      sandbox: true,
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

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Global error handlers
process.on('unhandledRejection', (reason) => console.error('[Main] Unhandled rejection:', reason));
process.on('uncaughtException', (error) => console.error('[Main] Uncaught exception:', error));

// App lifecycle
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
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

// ============================================
// WEBVIEW SECURITY - Handle popups
// ============================================

// Handle all webContents creation (including webviews)
app.on('web-contents-created', (_, contents) => {
  // Only handle webviews, not the main window
  if (contents.getType() === 'webview') {
    // Handle new windows/popups - open in system browser with URL validation
    contents.setWindowOpenHandler(({ url }) => {
      try {
        const parsed = new URL(url);
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
          shell.openExternal(url);
        }
      } catch {
        // Invalid URL, ignore
      }
      return { action: 'deny' };
    });

    // Restrict webview navigation to allowed domains
    contents.on('will-navigate', (event, url) => {
      try {
        const allowed = ['app.powerbi.com', 'login.microsoftonline.com', 'login.live.com', 'aadcdn.msftauth.net', 'aadcdn.msauth.net'];
        const hostname = new URL(url).hostname;
        if (!allowed.some((d) => hostname === d || hostname.endsWith('.' + d))) {
          event.preventDefault();
        }
      } catch {
        event.preventDefault();
      }
    });
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

ipcMain.handle('auth:validate-token', async () => {
  return await authService.validateToken();
});

// ============================================
// IPC HANDLERS - Content
// ============================================

ipcMain.handle('content:get-workspaces', async () => {
  return await powerbiApiService.getWorkspaces();
});

ipcMain.handle('content:get-reports', async (_event, workspaceId: string) => {
  const id = validateUUID(workspaceId);
  if (!id) return { success: false, error: { code: 'INVALID_INPUT', message: 'Invalid workspace ID' } };
  return await powerbiApiService.getReports(id);
});

ipcMain.handle('content:get-dashboards', async (_event, workspaceId: string) => {
  const id = validateUUID(workspaceId);
  if (!id) return { success: false, error: { code: 'INVALID_INPUT', message: 'Invalid workspace ID' } };
  return await powerbiApiService.getDashboards(id);
});

ipcMain.handle('content:get-dashboard', async (_event, workspaceId: string, dashboardId: string) => {
  const wsId = validateUUID(workspaceId);
  const dbId = validateUUID(dashboardId);
  if (!wsId || !dbId) return { success: false, error: { code: 'INVALID_INPUT', message: 'Invalid ID' } };
  return await powerbiApiService.getDashboard(wsId, dbId);
});

ipcMain.handle('content:get-apps', async () => {
  return await powerbiApiService.getApps();
});

ipcMain.handle('content:get-app', async (_event, appId: string) => {
  const id = validateUUID(appId);
  if (!id) return { success: false, error: { code: 'INVALID_INPUT', message: 'Invalid app ID' } };
  return await powerbiApiService.getApp(id);
});

ipcMain.handle('content:get-app-reports', async (_event, appId: string) => {
  const id = validateUUID(appId);
  if (!id) return { success: false, error: { code: 'INVALID_INPUT', message: 'Invalid app ID' } };
  return await powerbiApiService.getAppReports(id);
});

ipcMain.handle('content:get-app-dashboards', async (_event, appId: string) => {
  const id = validateUUID(appId);
  if (!id) return { success: false, error: { code: 'INVALID_INPUT', message: 'Invalid app ID' } };
  return await powerbiApiService.getAppDashboards(id);
});

ipcMain.handle('content:get-embed-token', async (_event, reportId: string, workspaceId: string) => {
  const rId = validateUUID(reportId);
  const wId = validateUUID(workspaceId);
  if (!rId || !wId) return { success: false, error: { code: 'INVALID_INPUT', message: 'Invalid ID' } };
  return await powerbiApiService.getEmbedToken(rId, wId);
});

ipcMain.handle(
  'content:export-report-pdf',
  async (
    _event,
    reportId: string,
    workspaceId: string,
    pageName?: string,
    bookmarkState?: string,
    filePath?: string
  ) => {
    const rId = validateUUID(reportId);
    const wId = validateUUID(workspaceId);
    if (!rId || !wId) return { success: false, error: { code: 'INVALID_INPUT', message: 'Invalid ID' } };

    if (!filePath) {
      return { success: false, error: { code: 'NO_PATH', message: 'No export path provided' } };
    }

    if (!isValidExportPath(filePath)) {
      return { success: false, error: { code: 'INVALID_PATH', message: 'Export path must be a .pdf under user directory' } };
    }

    const exportResponse = await powerbiApiService.exportReportToPdf(rId, wId, pageName, bookmarkState);

    if (!exportResponse.success) {
      return exportResponse;
    }

    await fs.writeFile(filePath, exportResponse.data);
    return { success: true, data: { path: filePath } };
  }
);

ipcMain.handle('export:choose-pdf-path', async () => {
  if (!mainWindow) {
    return {
      success: false,
      error: { code: 'NO_WINDOW', message: 'Main window not available' },
    };
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const defaultPath = path.join(app.getPath('downloads'), `powerbi-export-${timestamp}.pdf`);

  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export to PDF',
    defaultPath,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });

  if (canceled || !filePath) {
    return {
      success: false,
      error: { code: 'CANCELLED', message: 'Export cancelled' },
    };
  }

  return { success: true, data: { path: filePath } };
});

ipcMain.handle('content:get-dataset-refresh-info', async (_event, datasetId: string, workspaceId?: string) => {
  const dId = validateUUID(datasetId);
  if (!dId) return { success: false, error: { code: 'INVALID_INPUT', message: 'Invalid dataset ID' } };
  const wId = workspaceId ? validateUUID(workspaceId) : undefined;
  if (workspaceId && !wId) return { success: false, error: { code: 'INVALID_INPUT', message: 'Invalid workspace ID' } };
  return await powerbiApiService.getDatasetRefreshInfo(dId, wId ?? undefined);
});

ipcMain.handle('content:get-all-items', async () => {
  return await powerbiApiService.getAllItems();
});

ipcMain.handle('content:get-recent', async () => {
  // Return usage-based recent items instead of enumerating the entire tenant
  // This is much faster and doesn't cause timeouts on large tenants
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
    return {
      success: false,
      error: { code: 'RECENT_FETCH_FAILED', message: String(error) },
    };
  }
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
// IPC HANDLERS - Export
// ============================================

ipcMain.handle(
  'export:current-view-pdf',
  async (
    _event,
    options?: {
      bounds?: { x: number; y: number; width: number; height: number };
      insets?: { top?: number; right?: number; bottom?: number; left?: number };
      filePath?: string;
    }
  ) => {
  if (!mainWindow) {
    return {
      success: false,
      error: { code: 'NO_WINDOW', message: 'Main window not available' },
    };
  }

  const targetPath = options?.filePath;
  if (!targetPath) {
    return {
      success: false,
      error: { code: 'NO_PATH', message: 'No export path provided' },
    };
  }

  if (!isValidExportPath(targetPath)) {
    return {
      success: false,
      error: { code: 'INVALID_PATH', message: 'Export path must be a .pdf under user directory' },
    };
  }

  let pdfWindow: BrowserWindow | null = null;
  try {
    let captureRect: Electron.Rectangle | undefined;
    const bounds = options?.bounds;
    const insets = options?.insets;
    if (bounds && Number.isFinite(bounds.width) && Number.isFinite(bounds.height)) {
      const baseX = Math.max(0, Math.round(bounds.x));
      const baseY = Math.max(0, Math.round(bounds.y));
      const baseWidth = Math.max(0, Math.round(bounds.width));
      const baseHeight = Math.max(0, Math.round(bounds.height));
      const insetLeft = Math.max(0, Math.round(insets?.left ?? 0));
      const insetTop = Math.max(0, Math.round(insets?.top ?? 0));
      const insetRight = Math.max(0, Math.round(insets?.right ?? 0));
      const insetBottom = Math.max(0, Math.round(insets?.bottom ?? 0));
      const width = Math.max(0, baseWidth - insetLeft - insetRight);
      const height = Math.max(0, baseHeight - insetTop - insetBottom);
      if (width > 0 && height > 0) {
        captureRect = {
          x: baseX + insetLeft,
          y: baseY + insetTop,
          width,
          height,
        };
      }
    }

    const image = await mainWindow.webContents.capturePage(captureRect);
    const { width: imgWidth, height: imgHeight } = image.getSize();
    
    // Convert pixel dimensions to microns for PDF page size
    // 1 inch = 25400 microns, 96 DPI standard screen resolution
    const MICRONS_PER_INCH = 25400;
    const pageWidthMicrons = Math.round((imgWidth / 96) * MICRONS_PER_INCH);
    const pageHeightMicrons = Math.round((imgHeight / 96) * MICRONS_PER_INCH);
    
    // Convert image to base64 PNG
    const pngBuffer = image.toPNG();
    const base64 = pngBuffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64}`;
    
    pdfWindow = new BrowserWindow({
      show: false,
      width: imgWidth,
      height: imgHeight,
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
      },
    });

    // HTML with viewport meta and image sized to viewport
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=${imgWidth}, height=${imgHeight}">
  <style>
    @page { margin: 0; size: ${imgWidth}px ${imgHeight}px; }
    * { margin: 0; padding: 0; }
    html, body { width: ${imgWidth}px; height: ${imgHeight}px; overflow: hidden; }
    img { width: ${imgWidth}px; height: ${imgHeight}px; display: block; }
  </style>
</head>
<body>
  <img src="${dataUrl}">
</body>
</html>`;

    // Use did-finish-load event - critical for ensuring content loads before PDF generation
    await new Promise<void>((resolve, reject) => {
      pdfWindow!.webContents.on('did-finish-load', () => resolve());
      pdfWindow!.webContents.on('did-fail-load', (_e, code, desc) => reject(new Error(`Load failed: ${code} ${desc}`)));
      pdfWindow!.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    });

    const pdfBuffer = await pdfWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: { width: pageWidthMicrons, height: pageHeightMicrons },
      preferCSSPageSize: true,
    });

    await fs.writeFile(targetPath, pdfBuffer);

    return { success: true, data: { path: targetPath } };
  } catch (error) {
    return {
      success: false,
      error: { code: 'EXPORT_FAILED', message: String(error) },
    };
  } finally {
    if (pdfWindow) {
      pdfWindow.close();
    }
  }
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
    return { success: true, data: undefined };
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
    return { success: true, data: undefined };
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

ipcMain.handle('app:get-version', () => {
  // Returns the version from package.json - single source of truth
  return app.getVersion();
});
