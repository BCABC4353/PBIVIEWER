import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'out');
const PORT = 5209;
const log = (...a) => process.stdout.write(a.join(' ') + '\n');

async function waitForServer(port) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const { default: http } = await import('http');
      await new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${port}/`, (res) => { res.destroy(); resolve(null); });
        req.on('error', reject);
        req.setTimeout(1000, () => { req.destroy(); reject(new Error('t')); });
      });
      return;
    } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  throw new Error('no server');
}
async function waitForMorph(page) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (await page.evaluate(() => Boolean(window.__morph))) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('no __morph');
}

async function main() {
  const isWin = os.platform() === 'win32';
  const viteBin = isWin ? 'node_modules\\.bin\\vite.cmd' : 'node_modules/.bin/vite';
  const viteProc = spawn(viteBin, ['--config', 'harness/vite.config.mjs', '--port', String(PORT)], {
    cwd: path.resolve(__dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0' }, shell: isWin,
  });
  await waitForServer(PORT);
  log(`Vite ready :${PORT}`);
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 1 });
    await page.goto(`http://localhost:${PORT}/real.html`, { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1200));
    await waitForMorph(page);
    const tileId = await page.evaluate(() => document.querySelector('[data-workspace-tile]')?.getAttribute('data-workspace-tile'));
    await page.evaluate((ts) => window.__morph?.setSpeed(ts), 0.9);
    await page.evaluate((id) => window.__morph?.open(id), tileId);
    await new Promise((r) => setTimeout(r, 1200));

    await page.screenshot({ path: path.join(OUT, 'shadow-baseline.png') });
    log('captured shadow-baseline.png (contain: layout)');

    await page.evaluate(() => {
      const s = document.createElement('style');
      s.id = '__cp';
      s.textContent = '.luce-sheet { contain: layout paint !important; }';
      document.head.appendChild(s);
    });
    await new Promise((r) => setTimeout(r, 300));
    await page.screenshot({ path: path.join(OUT, 'shadow-contain-paint.png') });
    log('captured shadow-contain-paint.png (contain: layout paint)');

    const shadow = await page.evaluate(() => {
      const el = document.querySelector('.luce-sheet');
      const cs = getComputedStyle(el);
      return { boxShadow: cs.boxShadow.slice(0, 120), contain: cs.contain, overflow: cs.overflow };
    });
    log('sheet computed: ' + JSON.stringify(shadow));
  } finally {
    await browser.close();
    viteProc.kill();
  }
}
main().catch((e) => { process.stderr.write('FAIL: ' + e.message + '\n'); process.exit(1); });
