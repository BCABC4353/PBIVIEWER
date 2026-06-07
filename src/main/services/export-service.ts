import { BrowserWindow } from 'electron';
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
        // NEW-SEC-2: explicit hardening — this window loads a self-contained
        // data: URL and must never reach Node or the network.
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    // NEW-SEC-2: deny any window.open() or navigation attempts from the
    // transient PDF render window — it loads only a data: URL.
    pdfWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    pdfWindow.webContents.on('will-navigate', (event) => {
      event.preventDefault();
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
}
