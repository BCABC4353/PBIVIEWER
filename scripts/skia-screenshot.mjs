import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const __dir = fileURLToPath(new URL('..', import.meta.url));
const exportDir = join(__dir, 'night-out', 'skia-export3');
const outDir = join(__dir, 'night-out', 'skia');

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
};

function serve(port) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let p = req.url === '/' ? '/index.html' : req.url;
      p = p.split('?')[0];
      const filePath = join(exportDir, p);
      if (existsSync(filePath)) {
        const ext = extname(filePath);
        const mime = MIME[ext] ?? 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mime });
        res.end(readFileSync(filePath));
      } else {
        res.writeHead(404);
        res.end('Not found: ' + p);
      }
    });
    server.listen(port, () => resolve(server));
  });
}

async function run() {
  console.log('[screenshot] Starting static server on port 19999...');
  const server = await serve(19999);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 430, height: 900, deviceScaleFactor: 2 });

    const errors = [];
    const requests = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
      else if (msg.type() === 'log') console.log('[page]', msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('request', (req) => {
      if (req.url().includes('wasm') || req.url().includes('canvaskit')) {
        requests.push(req.url());
        console.log('[request]', req.url());
      }
    });
    page.on('response', (res) => {
      if (res.url().includes('wasm') || res.url().includes('canvaskit')) {
        console.log('[response]', res.url(), res.status());
      }
    });

    console.log('[screenshot] Navigating to http://localhost:19999/');
    await page.goto('http://localhost:19999/', { waitUntil: 'networkidle0', timeout: 30000 });

    await new Promise(r => setTimeout(r, 12000));

    const skiaState = await page.evaluate(() => {
      const g = globalThis;
      return {
        hasCanvasKit: typeof g.CanvasKit !== 'undefined',
        ckType: typeof g.CanvasKit,
        hasPictureRecorder: typeof g.CanvasKit !== 'undefined' && typeof g.CanvasKit.PictureRecorder !== 'undefined',
        ckKeys: typeof g.CanvasKit !== 'undefined' ? Object.keys(g.CanvasKit).slice(0, 20) : [],
      };
    });
    console.log('[skia-state]', JSON.stringify(skiaState));

    const outPath = join(outDir, 'tick-strip-render.png');
    await page.screenshot({ path: outPath, fullPage: true });
    console.log('[screenshot] Screenshot saved to:', outPath);

    if (errors.length > 0) {
      console.log('[screenshot] Page errors:');
      errors.forEach(e => console.log('  ', e));
    } else {
      console.log('[screenshot] No page errors.');
    }

    const canvasCount = await page.evaluate(() => document.querySelectorAll('canvas').length);
    console.log('[screenshot] Canvas elements on page:', canvasCount);

    const canvasPixelData = await page.evaluate(() => {
      const canvases = Array.from(document.querySelectorAll('canvas'));
      return canvases.slice(0, 3).map((c, i) => {
        try {
          const ctx = c.getContext('2d');
          if (!ctx) return { i, w: c.width, h: c.height, hasCtx: false };
          const data = ctx.getImageData(0, 0, Math.min(c.width, 5), Math.min(c.height, 5));
          const nonZero = data.data.some(v => v !== 0);
          return { i, w: c.width, h: c.height, hasCtx: true, hasPixels: nonZero };
        } catch (e) {
          return { i, w: c.width, h: c.height, err: String(e) };
        }
      });
    });
    console.log('[canvas-pixels]', JSON.stringify(canvasPixelData));

    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log('[screenshot] Body text (first 200 chars):', bodyText.slice(0, 200));

  } finally {
    await browser.close();
    server.close();
  }
}

run().catch((e) => {
  console.error('[screenshot] FATAL:', e.message);
  process.exit(1);
});
