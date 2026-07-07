import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'out');
const PORT = 5202;
const VIEWPORT = { width: 1400, height: 900 };
const TIME_SCALE = 0.9;
const BUDGET_MS = 1000 / 60;

mkdirSync(OUT, { recursive: true });

function log(...args) {
  process.stdout.write(args.join(' ') + '\n');
}

async function waitForServer(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const { default: http } = await import('http');
      await new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${port}/`, (res) => {
          res.destroy();
          resolve(null);
        });
        req.on('error', reject);
        req.setTimeout(1000, () => { req.destroy(); reject(new Error('timeout')); });
      });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`Server on port ${port} did not start within ${timeoutMs}ms`);
}

async function waitForMorph(page, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await page.evaluate(() => Boolean(window.__morph));
    if (ready) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('window.__morph never became available');
}

async function getFirstTileId(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-workspace-tile]');
    return el ? el.getAttribute('data-workspace-tile') : null;
  });
}

function stats(deltas) {
  if (deltas.length === 0) {
    return { count: 0, median: null, p95: null, worst: null, over16_7: 0, fps: null };
  }
  const sorted = [...deltas].sort((a, b) => a - b);
  const pick = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))];
  const median = pick(0.5);
  const p95 = pick(0.95);
  const worst = sorted[sorted.length - 1];
  const over = deltas.filter((d) => d > BUDGET_MS).length;
  return {
    count: deltas.length,
    median: +median.toFixed(3),
    p95: +p95.toFixed(3),
    worst: +worst.toFixed(3),
    over16_7: over,
    fps: +(1000 / median).toFixed(1),
  };
}

function applyVariantScript(variant) {
  const ID = '__perf_variant_style';
  let css = '';
  if (variant === 'contain-paint') {
    css = `.luce-sheet { contain: layout paint !important; }`;
  } else if (variant === 'contain-paint-willchange') {
    css = `.luce-sheet { contain: layout paint !important; will-change: width, height, left, top !important; }`;
  }
  const existing = document.getElementById(ID);
  if (existing) existing.remove();
  if (css) {
    const styleEl = document.createElement('style');
    styleEl.id = ID;
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }
  return getComputedStyle(document.querySelector('.luce-sheet') ?? document.body).contain;
}

async function recordFrames(page, action, settleMs) {
  await page.evaluate(() => {
    window.__frames = [];
    window.__rafActive = true;
    let last = performance.now();
    const loop = (t) => {
      const d = t - last;
      last = t;
      window.__frames.push(+d.toFixed(4));
      if (window.__rafActive) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });

  await new Promise((r) => setTimeout(r, 80));
  await action();
  await new Promise((r) => setTimeout(r, settleMs));

  const captured = await page.evaluate(() => {
    window.__rafActive = false;
    return window.__frames.slice();
  });
  return captured;
}

function morphWindow(deltas) {
  if (deltas.length <= 4) return deltas;
  return deltas.slice(2, deltas.length - 2);
}

async function idleRafProbe(page) {
  await page.evaluate(() => {
    window.__idleCount = 0;
    window.__idleActive = true;
    const loop = () => {
      window.__idleCount += 1;
      if (window.__idleActive) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  await new Promise((r) => setTimeout(r, 1000));
  return page.evaluate(() => {
    window.__idleActive = false;
    return window.__idleCount;
  });
}

async function runVariant(page, tileId, variant, openSettleMs) {
  const containValue = await page.evaluate(applyVariantScript, variant);
  await new Promise((r) => setTimeout(r, 150));

  const openDeltas = await recordFrames(page, async () => {
    await page.evaluate((id) => { window.__morph?.open(id); }, tileId);
  }, openSettleMs);

  await new Promise((r) => setTimeout(r, 300));

  const closeDeltas = await recordFrames(page, async () => {
    await page.evaluate(() => { window.__morph?.close(); });
  }, openSettleMs);

  await new Promise((r) => setTimeout(r, 300));

  const openWin = morphWindow(openDeltas);
  const closeWin = morphWindow(closeDeltas);

  return {
    variant,
    containComputed: containValue,
    open: { ...stats(openWin), rawCount: openDeltas.length },
    close: { ...stats(closeWin), rawCount: closeDeltas.length },
    openDeltas: openWin,
    closeDeltas: closeWin,
  };
}

async function main() {
  log('Starting Vite dev server for perf profiling...');
  const isWin = os.platform() === 'win32';
  const viteBin = isWin ? 'node_modules\\.bin\\vite.cmd' : 'node_modules/.bin/vite';
  const viteProc = spawn(
    viteBin,
    ['--config', 'harness/vite.config.mjs', '--port', String(PORT)],
    {
      cwd: path.resolve(__dirname, '..'),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' },
      shell: isWin,
    },
  );
  viteProc.stdout.on('data', (d) => process.stdout.write('[vite] ' + d));
  viteProc.stderr.on('data', (d) => process.stderr.write('[vite:err] ' + d));

  try {
    await waitForServer(PORT);
    log(`Vite ready on :${PORT}`);
  } catch (e) {
    viteProc.kill();
    throw e;
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const result = { timeScale: TIME_SCALE, viewport: VIEWPORT, budgetMs: +BUDGET_MS.toFixed(3), variants: {} };

  try {
    const page = await browser.newPage();
    await page.setViewport({ ...VIEWPORT, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => log('PAGEERROR:', e.message.slice(0, 300)));
    page.on('console', (m) => { if (m.type() === 'error') log('CONSOLE ERR:', m.text().slice(0, 300)); });

    await page.goto(`http://localhost:${PORT}/real.html`, { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1200));
    await waitForMorph(page);

    const tileId = await getFirstTileId(page);
    log(`First tile id: ${tileId}`);

    await page.evaluate((ts) => { window.__morph?.setSpeed(ts); }, TIME_SCALE);
    await new Promise((r) => setTimeout(r, 100));

    const settleMs = Math.round((400 / TIME_SCALE) + 600);
    log(`Per-morph capture window: ${settleMs}ms (timeScale=${TIME_SCALE})`);

    for (const variant of ['baseline', 'contain-paint', 'contain-paint-willchange']) {
      log(`\n--- Variant: ${variant} ---`);
      const v = await runVariant(page, tileId, variant, settleMs);
      log(`  open:  median ${v.open.median}ms (${v.open.fps}fps) p95 ${v.open.p95}ms worst ${v.open.worst}ms over16.7 ${v.open.over16_7}/${v.open.count}`);
      log(`  close: median ${v.close.median}ms (${v.close.fps}fps) p95 ${v.close.p95}ms worst ${v.close.worst}ms over16.7 ${v.close.over16_7}/${v.close.count}`);
      log(`  contain computed: ${v.containComputed}`);
      result.variants[variant] = v;
    }

    log('\n--- Idle RAF probe (after morph settled) ---');
    await page.evaluate(applyVariantScript, 'baseline');
    await page.evaluate((id) => { window.__morph?.open(id); }, tileId);
    await new Promise((r) => setTimeout(r, settleMs));
    await page.evaluate(() => { window.__morph?.close(); });
    await new Promise((r) => setTimeout(r, settleMs));
    const idleCount = await idleRafProbe(page);
    log(`  RAF callbacks during 1000ms idle window: ${idleCount} (own probe loop runs ~60, so subtract that)`);
    result.idleRaf = { probeWindowMs: 1000, callbackCount: idleCount, note: 'count includes the probe loop itself (~60/s). App-side idle RAF would push this materially above ~60.' };

  } finally {
    await browser.close();
    viteProc.kill();
  }

  const outPath = path.join(OUT, 'perf-frametimes.json');
  writeFileSync(outPath, JSON.stringify(result, null, 2));
  log(`\nWrote ${outPath}`);
}

main().catch((e) => {
  process.stderr.write('PERF FAILED: ' + e.message + '\n' + (e.stack || '') + '\n');
  process.exit(1);
});
