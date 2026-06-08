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

    // On a HiDPI display capturePage returns physical pixels (e.g. 2x), so
    // dividing raw pixels by 96 DPI yields a PDF page twice the intended size.
    // Convert to logical (CSS) dimensions using the display scale factor first;
    // on a 1x display scaleFactor is 1 so behaviour is unchanged.
    let scaleFactor = 1;
    try {
      scaleFactor = screen.getDisplayMatching(mainWindow.getBounds()).scaleFactor || 1;
    } catch {
      scaleFactor = 1;
    }
    const cssWidth = Math.max(1, Math.round(imgWidth / scaleFactor));
    const cssHeight = Math.max(1, Math.round(imgHeight / scaleFactor));

    // Convert logical pixel dimensions to microns for PDF page size
    // 1 inch = 25400 microns, 96 CSS px per inch.
    const MICRONS_PER_INCH = 25400;
    const pageWidthMicrons = Math.round((cssWidth / 96) * MICRONS_PER_INCH);
    const pageHeightMicrons = Math.round((cssHeight / 96) * MICRONS_PER_INCH);

    // Convert image to base64 PNG
    const pngBuffer = image.toPNG();
    const base64 = pngBuffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64}`;

    pdfWindow = new BrowserWindow({
      show: false,
      width: cssWidth,
      height: cssHeight,
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

    // NEW-PERF-1: race a 30 s deadline against the data: URL load so a
    // stalled/crashed renderer cannot orphan the hidden window and leak memory.
    // The finally block always closes pdfWindow, but it only runs once the
    // promise settles — without this race the await above could hang forever.
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

      // E2: one-shot per export. Use .once() so these handlers self-detach the
      // moment they fire — without this the same hidden-window webContents would
      // accumulate did-finish-load / did-fail-load listeners across repeated
      // exports (a listener leak). The race below settles exactly once, so only
      // one of the two ever fires; .once() guarantees the unfired one is the
      // only listener that could linger, and pdfWindow.close() in `finally`
      // tears down the webContents (and its listeners) regardless.
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
