import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 5208;
const TIME_SCALE = 0.9;
const log = (...a) => process.stdout.write(a.join(' ') + '\n');

async function waitForServer(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const { default: http } = await import('http');
      await new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${port}/`, (res) => { res.destroy(); resolve(null); });
        req.on('error', reject);
        req.setTimeout(1000, () => { req.destroy(); reject(new Error('timeout')); });
      });
      return;
    } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  throw new Error('server did not start');
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
    cwd: path.resolve(__dirname, '..'),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0' }, shell: isWin,
  });
  await waitForServer(PORT);
  log(`Vite ready on :${PORT}`);

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 1 });
    await page.goto(`http://localhost:${PORT}/real.html`, { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1200));
    await waitForMorph(page);
    const tileId = await page.evaluate(() => document.querySelector('[data-workspace-tile]')?.getAttribute('data-workspace-tile'));
    await page.evaluate((ts) => window.__morph?.setSpeed(ts), TIME_SCALE);

    const settle = Math.round(400 / TIME_SCALE) + 700;

    async function probe(windowMs) {
      await page.evaluate(() => {
        window.__cnt = 0;
        window.__t0 = performance.now();
        window.__run = true;
        function loop() {
          window.__cnt += 1;
          if (window.__run) requestAnimationFrame(loop);
        }
        requestAnimationFrame(loop);
      });
      await new Promise((r) => setTimeout(r, windowMs));
      return page.evaluate(() => { window.__run = false; return window.__cnt; });
    }

    log('Opening then closing morph, then probing idle RAF...');
    await page.evaluate((id) => window.__morph?.open(id), tileId);
    await new Promise((r) => setTimeout(r, settle));
    await page.evaluate(() => window.__morph?.close());
    await new Promise((r) => setTimeout(r, settle));

    const idle1 = await probe(1000);
    await new Promise((r) => setTimeout(r, 300));
    const idle2 = await probe(1000);

    log(`Idle RAF probe (settled, no morph active): own-loop callbacks in 1000ms = ${idle1}, repeat = ${idle2}`);
    log(`Interpretation: a single vsync-locked RAF loop yields ~60. The morph spring is NOT scheduling RAF at rest if this is ~60 and not materially higher.`);

    log('\nNow probing DURING a held-open state (sheet mounted, spring settled at progress=1):');
    await page.evaluate((id) => window.__morph?.open(id), tileId);
    await new Promise((r) => setTimeout(r, settle));
    const heldOpen = await probe(1000);
    log(`Held-open idle RAF callbacks in 1000ms = ${heldOpen} (should still be ~60 — spring self-terminated after open)`);
  } finally {
    await browser.close();
    viteProc.kill();
  }
}

main().catch((e) => { process.stderr.write('IDLE FAILED: ' + e.message + '\n'); process.exit(1); });
