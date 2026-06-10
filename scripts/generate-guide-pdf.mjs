/**
 * Generates docs/manual/PowerBI-Viewer-User-Guide.pdf from the HTML source.
 *
 * Usage:  node scripts/generate-guide-pdf.mjs
 *
 * Implementation: uses the project's existing `electron` devDependency
 * (no puppeteer / extra Chrome download needed). When invoked with plain
 * node, the script re-executes itself under the Electron binary; inside
 * Electron it loads the HTML in a hidden BrowserWindow, waits for images
 * to decode, and calls webContents.printToPDF with:
 *   - A4 + preferCSSPageSize (the HTML's @page rule carries margin: 14mm)
 *   - printBackground: true (preserves callout shading / accent colours)
 *
 * On a headless Linux box Electron still needs a display server — run it as
 * `xvfb-run node scripts/generate-guide-pdf.mjs` there. On Windows/macOS
 * desktops it runs as-is.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, writeFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const HTML_PATH = path.join(PROJECT_ROOT, 'docs', 'manual', 'PowerBI-Viewer-User-Guide.html');
const PDF_PATH = path.join(PROJECT_ROOT, 'docs', 'manual', 'PowerBI-Viewer-User-Guide.pdf');

if (!existsSync(HTML_PATH)) {
  console.error(`HTML source not found: ${HTML_PATH}`);
  process.exit(1);
}

// `import('electron')` resolves differently by runtime:
//   - plain Node:  the package's default export is the PATH to the binary
//   - Electron:    it is the Electron API object
const electron = (await import('electron')).default;

if (typeof electron === 'string') {
  // ---- Plain node: re-exec this same script under the Electron binary ----
  const { spawnSync } = await import('child_process');
  console.log('Relaunching under Electron...');
  const result = spawnSync(electron, ['--no-sandbox', __filename], {
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' },
  });
  process.exit(result.status ?? 1);
}

// ---- Electron main process from here on ----
const { app, BrowserWindow } = electron;

app.disableHardwareAcceleration();

// NOTE: with an ESM entry point Electron does not emit 'ready' until the
// module finishes evaluating, so a top-level `await app.whenReady()` would
// deadlock. Run the async work without awaiting it at top level.
async function main() {
  await app.whenReady();

  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: {
      offscreen: false,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  console.log(`Source : ${HTML_PATH}`);
  console.log(`Output : ${PDF_PATH}`);
  console.log('Loading HTML...');
  await win.loadFile(HTML_PATH);

  // Wait for every image (the screenshots) to finish decoding, then let
  // layout settle briefly before printing.
  const imageReport = await win.webContents.executeJavaScript(`
    (async () => {
      const imgs = Array.from(document.images);
      imgs.forEach((img) => { img.loading = 'eager'; });
      await Promise.all(
        imgs.map((img) =>
          img.complete && img.naturalWidth > 0
            ? Promise.resolve()
            : new Promise((res) => {
                img.addEventListener('load', res, { once: true });
                img.addEventListener('error', res, { once: true });
              }),
        ),
      );
      await new Promise((r) => setTimeout(r, 500));
      return { total: imgs.length, loaded: imgs.filter((i) => i.naturalWidth > 0).length };
    })()
  `);
  console.log(`Images: ${imageReport.loaded}/${imageReport.total} loaded`);
  if (imageReport.loaded < imageReport.total) {
    console.warn('Warning: some images failed to load and will be blank in the PDF.');
  }

  console.log('Printing to PDF...');
  const pdfBuffer = await win.webContents.printToPDF({
    pageSize: 'A4',
    printBackground: true,
    // The HTML @page rule carries margin: 14mm; preferCSSPageSize lets the
    // CSS declaration fully control the page box.
    preferCSSPageSize: true,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
  });

  writeFileSync(PDF_PATH, pdfBuffer);
  console.log(`PDF written: ${PDF_PATH} (${(pdfBuffer.length / 1024).toFixed(0)} KB)`);
}

main().then(
  () => app.exit(0),
  (err) => {
    console.error('PDF generation failed:', err);
    app.exit(1);
  },
);
