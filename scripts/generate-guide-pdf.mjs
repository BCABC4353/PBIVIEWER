
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

const electron = (await import('electron')).default;

if (typeof electron === 'string') {
  const { spawnSync } = await import('child_process');
  console.log('Relaunching under Electron...');
  const result = spawnSync(electron, ['--no-sandbox', __filename], {
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' },
  });
  process.exit(result.status ?? 1);
}

const { app, BrowserWindow } = electron;

app.disableHardwareAcceleration();

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
