import { app, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { getMainWindow } from '../window';
import { exportCurrentViewPdf, type ExportCurrentViewOptions } from '../services/export-service';
import { approveExportPath } from './export-paths';

export function registerExportIpc(): void {
  ipcMain.handle('export:choose-pdf-path', async () => {
    const mainWindow = getMainWindow();
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

    approveExportPath(filePath);
    return { success: true, data: { path: filePath } };
  });

  ipcMain.handle('export:current-view-pdf', async (_event, options?: ExportCurrentViewOptions) => {
    return await exportCurrentViewPdf(getMainWindow(), options);
  });
}
