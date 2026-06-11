import { BrowserWindow, screen } from 'electron';
import { promises as fs } from 'fs';
import { isValidExportPath } from '../security';

export interface ExportCurrentViewOptions {
  bounds?: { x: number; y: number; width: number; height: number };
  insets?: { top?: number; right?: number; bottom?: number; left?: number };
  filePath?: string;
}

export async function exportCurrentViewPdf(
  mainWindow: BrowserWindow | null,
  options?: ExportCurrentViewOptions
) {
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

    let scaleFactor = 1;
    try {
      scaleFactor = screen.getDisplayMatching(mainWindow.getBounds()).scaleFactor || 1;
    } catch {
      scaleFactor = 1;
    }
    const cssWidth = Math.max(1, Math.round(imgWidth / scaleFactor));
    const cssHeight = Math.max(1, Math.round(imgHeight / scaleFactor));

    const MICRONS_PER_INCH = 25400;
    const pageWidthMicrons = Math.round((cssWidth / 96) * MICRONS_PER_INCH);
    const pageHeightMicrons = Math.round((cssHeight / 96) * MICRONS_PER_INCH);

    const pngBuffer = image.toPNG();
    const base64 = pngBuffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64}`;

    pdfWindow = new BrowserWindow({
      show: false,
      width: cssWidth,
      height: cssHeight,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    pdfWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    pdfWindow.webContents.on('will-navigate', (event) => {
      event.preventDefault();
    });

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=${cssWidth}, height=${cssHeight}">
  <style>
    @page { margin: 0; size: ${cssWidth}px ${cssHeight}px; }
    * { margin: 0; padding: 0; }
    html, body { width: ${cssWidth}px; height: ${cssHeight}px; overflow: hidden; }
    img { width: ${cssWidth}px; height: ${cssHeight}px; display: block; }
  </style>
</head>
<body>
  <img src="${dataUrl}">
</body>
</html>`;

    const LOAD_TIMEOUT_MS = 30_000;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(loadTimer);
        fn();
      };

      const loadTimer = setTimeout(() => {
        settle(() => reject(new Error('Export window load timed out after 30 s')));
      }, LOAD_TIMEOUT_MS);

      pdfWindow!.webContents.once('did-finish-load', () => settle(resolve));
      pdfWindow!.webContents.once('did-fail-load', (_e, code, desc) =>
        settle(() => reject(new Error(`Load failed: ${code} ${desc}`))),
      );
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
}
