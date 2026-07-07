import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'out');
const PORT = 5207;
const VIEWPORT = { width: 1400, height: 900 };
const TIME_SCALE = 0.9;
const BUDGET_MS = 1000 / 60;

mkdirSync(OUT, { recursive: true });
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
  throw new Error(`Server on port ${port} did not start`);
}

async function waitForMorph(page) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (await page.evaluate(() => Boolean(window.__morph))) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('window.__morph never became available');
}

function applyVariant(variant) {
  const ID = '__perf_variant_style';
  const ex = document.getElementById(ID);
  if (ex) ex.remove();
  let css = '';
  if (variant === 'contain-paint') css = `.luce-sheet { contain: layout paint !important; }`;
  else if (variant === 'contain-paint-willchange') css = `.luce-sheet { contain: layout paint !important; will-change: width, height, left, top !important; }`;
  if (css) {
    const s = document.createElement('style');
    s.id = ID; s.textContent = css; document.head.appendChild(s);
  }
}

function pct(sorted, q) {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))];
}

const MAIN_THREAD_WORK = new Set([
  'RunTask', 'FunctionCall', 'TimerFire', 'FireAnimationFrame',
  'Layout', 'UpdateLayoutTree', 'RecalculateStyles', 'ParseHTML',
  'Paint', 'PaintImage', 'UpdateLayerTree', 'Layerize', 'PrePaint',
  'CompositeLayers', 'HitTest', 'EventDispatch', 'commit',
]);
const LAYOUT_PAINT = new Set([
  'Layout', 'UpdateLayoutTree', 'RecalculateStyles',
  'Paint', 'PaintImage', 'UpdateLayerTree', 'Layerize', 'PrePaint',
]);

function analyzeTrace(events, t0, t1) {
  const win = events.filter((e) => e.ts != null && e.ts / 1000 >= t0 && e.ts / 1000 <= t1);

  const frameEvents = win
    .filter((e) => e.name === 'DrawFrame' || e.name === 'BeginFrame' || (e.name === 'Commit' && e.ph === 'X'))
    .map((e) => e.ts / 1000)
    .sort((a, b) => a - b);

  const topTasks = win
    .filter((e) => e.ph === 'X' && e.name === 'RunTask' && e.dur != null)
    .map((e) => ({ start: e.ts / 1000, dur: e.dur / 1000 }))
    .sort((a, b) => a.start - b.start);

  const taskDurs = topTasks.map((t) => t.dur).sort((a, b) => a - b);

  const lp = win.filter((e) => e.ph === 'X' && LAYOUT_PAINT.has(e.name) && e.dur != null);
  const byType = {};
  for (const e of lp) {
    byType[e.name] = (byType[e.name] ?? 0) + e.dur / 1000;
  }

  const taskStats = {
    count: taskDurs.length,
    median: taskDurs.length ? +pct(taskDurs, 0.5).toFixed(3) : null,
    p95: taskDurs.length ? +pct(taskDurs, 0.95).toFixed(3) : null,
    worst: taskDurs.length ? +taskDurs[taskDurs.length - 1].toFixed(3) : null,
    overBudget: taskDurs.filter((d) => d > BUDGET_MS).length,
    totalMs: +taskDurs.reduce((s, d) => s + d, 0).toFixed(2),
  };

  return { taskStats, layoutPaintTotals: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, +v.toFixed(2)])), frameMarkerCount: frameEvents.length };
}

async function captureMorph(page, client, label, action, settleMs) {
  const tracePath = path.join(OUT, `__trace-${label}.json`);
  await client.send('Tracing.start', {
    traceConfig: {
      includedCategories: [
        'devtools.timeline',
        'disabled-by-default-devtools.timeline',
        'disabled-by-default-devtools.timeline.frame',
        'blink.user_timing',
      ],
    },
    transferMode: 'ReturnAsStream',
  });

  const t0 = await page.evaluate(() => performance.now());
  await new Promise((r) => setTimeout(r, 60));
  await action();
  await new Promise((r) => setTimeout(r, settleMs));
  const t1 = await page.evaluate(() => performance.now());

  const streamPromise = new Promise((resolve) => {
    client.once('Tracing.tracingComplete', async (ev) => {
      const handle = ev.stream;
      let data = '';
      while (true) {
        const chunk = await client.send('IO.read', { handle, size: 1024 * 1024 });
        data += chunk.data;
        if (chunk.eof) break;
      }
      await client.send('IO.close', { handle });
      resolve(data);
    });
  });
  await client.send('Tracing.end');
  const raw = await streamPromise;

  let parsed;
  try { parsed = JSON.parse(raw); } catch { parsed = { traceEvents: [] }; }
  const events = parsed.traceEvents ?? parsed;

  const result = analyzeWholeTrace(events, t1 - t0);
  try { rmSync(tracePath, { force: true }); } catch {}
  return result;
}

function analyzeWholeTrace(events, windowMs) {
  const xEvents = events.filter((e) => e.ph === 'X' && e.dur != null);

  const allTasks = xEvents
    .filter((e) => e.name === 'RunTask')
    .map((e) => ({ ts: e.ts / 1000, dur: e.dur / 1000 }))
    .sort((a, b) => a.ts - b.ts);
  const traceStart = allTasks.length ? allTasks[0].ts : 0;

  const topTasks = allTasks.map((t) => t.dur).sort((a, b) => a - b);

  const worstTask = allTasks.reduce((m, t) => (t.dur > m.dur ? t : m), { ts: traceStart, dur: 0 });
  const worstOffsetMs = +(worstTask.ts - traceStart).toFixed(1);

  const rafDurs = xEvents
    .filter((e) => e.name === 'FireAnimationFrame')
    .map((e) => e.dur / 1000)
    .sort((a, b) => a - b);
  const rafStats = {
    count: rafDurs.length,
    median: rafDurs.length ? +pct(rafDurs, 0.5).toFixed(3) : null,
    p95: rafDurs.length ? +pct(rafDurs, 0.95).toFixed(3) : null,
    worst: rafDurs.length ? +rafDurs[rafDurs.length - 1].toFixed(3) : null,
    overBudget: rafDurs.filter((d) => d > BUDGET_MS).length,
  };

  const lp = xEvents.filter((e) => LAYOUT_PAINT.has(e.name));
  const byType = {};
  for (const e of lp) byType[e.name] = (byType[e.name] ?? 0) + e.dur / 1000;

  const nameCounts = {};
  for (const e of xEvents) nameCounts[e.name] = (nameCounts[e.name] ?? 0) + 1;

  const taskStats = {
    count: topTasks.length,
    median: topTasks.length ? +pct(topTasks, 0.5).toFixed(3) : null,
    p95: topTasks.length ? +pct(topTasks, 0.95).toFixed(3) : null,
    worst: topTasks.length ? +topTasks[topTasks.length - 1].toFixed(3) : null,
    overBudget: topTasks.filter((d) => d > BUDGET_MS).length,
    totalMs: +topTasks.reduce((s, d) => s + d, 0).toFixed(2),
  };
  return {
    taskStats,
    rafTaskStats: rafStats,
    worstTaskOffsetMs: worstOffsetMs,
    layoutPaintTotals: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, +v.toFixed(2)])),
    topEventNames: Object.fromEntries(Object.entries(nameCounts).sort((a, b) => b[1] - a[1]).slice(0, 12)),
    windowMs: +windowMs.toFixed(1),
  };
}

async function main() {
  const isWin = os.platform() === 'win32';
  const viteBin = isWin ? 'node_modules\\.bin\\vite.cmd' : 'node_modules/.bin/vite';
  const viteProc = spawn(viteBin, ['--config', 'harness/vite.config.mjs', '--port', String(PORT)], {
    cwd: path.resolve(__dirname, '..'),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0' },
    shell: isWin,
  });
  viteProc.stdout.on('data', (d) => process.stdout.write('[vite] ' + d));
  viteProc.stderr.on('data', (d) => process.stderr.write('[vite:err] ' + d));

  try { await waitForServer(PORT); log(`Vite ready on :${PORT}`); }
  catch (e) { viteProc.kill(); throw e; }

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const result = { timeScale: TIME_SCALE, viewport: VIEWPORT, budgetMs: +BUDGET_MS.toFixed(3), method: 'CDP Tracing — RunTask main-thread durations + Layout/Paint event totals, windowed to each morph at perf.now() boundaries', variants: {} };

  try {
    const page = await browser.newPage();
    await page.setViewport({ ...VIEWPORT, deviceScaleFactor: 1 });
    const client = await page.target().createCDPSession();
    page.on('pageerror', (e) => log('PAGEERROR:', e.message.slice(0, 200)));

    await page.goto(`http://localhost:${PORT}/real.html`, { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1200));
    await waitForMorph(page);

    const tileId = await page.evaluate(() => document.querySelector('[data-workspace-tile]')?.getAttribute('data-workspace-tile'));
    log(`First tile id: ${tileId}`);
    await page.evaluate((ts) => window.__morph?.setSpeed(ts), TIME_SCALE);
    await new Promise((r) => setTimeout(r, 100));

    const settleMs = Math.round((400 / TIME_SCALE) + 500);
    log(`Capture window per morph: ${settleMs}ms`);

    for (const variant of ['baseline', 'contain-paint', 'contain-paint-willchange']) {
      log(`\n--- Variant: ${variant} ---`);
      await page.evaluate(applyVariant, variant);
      await new Promise((r) => setTimeout(r, 150));

      const open = await captureMorph(page, client, `${variant}-open`, async () => {
        await page.evaluate((id) => window.__morph?.open(id), tileId);
      }, settleMs);
      await new Promise((r) => setTimeout(r, 300));

      const close = await captureMorph(page, client, `${variant}-close`, async () => {
        await page.evaluate(() => window.__morph?.close());
      }, settleMs);
      await new Promise((r) => setTimeout(r, 300));

      const containComputed = await page.evaluate(() => {
        const s = document.getElementById('__perf_variant_style');
        return s ? s.textContent : '(none)';
      });

      log(`  OPEN  RAF-frame: median ${open.rafTaskStats.median}ms p95 ${open.rafTaskStats.p95}ms worst ${open.rafTaskStats.worst}ms over16.7 ${open.rafTaskStats.overBudget}/${open.rafTaskStats.count}`);
      log(`        worst RunTask ${open.taskStats.worst}ms at +${open.worstTaskOffsetMs}ms from trace start`);
      log(`        layout+paint totals: ${JSON.stringify(open.layoutPaintTotals)}`);
      log(`  CLOSE RAF-frame: median ${close.rafTaskStats.median}ms p95 ${close.rafTaskStats.p95}ms worst ${close.rafTaskStats.worst}ms over16.7 ${close.rafTaskStats.overBudget}/${close.rafTaskStats.count}`);
      log(`        worst RunTask ${close.taskStats.worst}ms at +${close.worstTaskOffsetMs}ms from trace start`);
      log(`        layout+paint totals: ${JSON.stringify(close.layoutPaintTotals)}`);
      result.variants[variant] = { open, close, injectedCss: containComputed };
    }

  } finally {
    await browser.close();
    viteProc.kill();
  }

  const outPath = path.join(OUT, 'perf-trace.json');
  writeFileSync(outPath, JSON.stringify(result, null, 2));
  log(`\nWrote ${outPath}`);
}

main().catch((e) => { process.stderr.write('TRACE FAILED: ' + e.message + '\n' + (e.stack || '') + '\n'); process.exit(1); });
