import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'out');
const PORT = 5201;
const VIEWPORT = { width: 1400, height: 900 };
const FRAME_COUNT = 40;
const SPEED_MULT = 0.15;
const BASE_DUR_MS = 400;
const SLOW_DUR_MS = BASE_DUR_MS / SPEED_MULT;
const PROBE_X = 200;
const PROBE_Y = 800;

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

async function encodePngToGif(pngPaths, gifPath) {
  const gifencMod = await import('gifenc');
  const { GIFEncoder, quantize, applyPalette } = gifencMod.default ?? gifencMod;
  const { PNG } = await import('pngjs');

  const frames = [];
  for (const p of pngPaths) {
    if (!existsSync(p)) continue;
    const data = readFileSync(p);
    const png = PNG.sync.read(data);
    frames.push({ width: png.width, height: png.height, data: png.data });
  }
  if (frames.length === 0) {
    writeFileSync(gifPath, Buffer.alloc(0));
    return;
  }

  const { width, height } = frames[0];
  const gif = GIFEncoder();
  for (const frame of frames) {
    const rgba = new Uint8ClampedArray(frame.data.buffer);
    const palette = quantize(rgba, 256);
    const index = applyPalette(rgba, palette);
    gif.writeFrame(index, width, height, { palette, delay: 80 });
  }
  gif.finish();
  writeFileSync(gifPath, Buffer.from(gif.bytes()));
  log(`  GIF written: ${gifPath} (${frames.length} frames)`);
}

async function getFirstTileId(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-workspace-tile]');
    return el ? el.getAttribute('data-workspace-tile') : null;
  });
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

async function captureFrames(page, scenario, driveFn, notesLines) {
  const scenarioDir = path.join(OUT, scenario);
  mkdirSync(scenarioDir, { recursive: true });

  await page.goto(`http://localhost:${PORT}/real.html`, { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1200));

  await waitForMorph(page);

  const tileId = await getFirstTileId(page);
  log(`  First tile id: ${tileId}`);

  await page.evaluate((mult) => {
    if (window.__morph) window.__morph.setSpeed(mult);
  }, SPEED_MULT);
  await new Promise((r) => setTimeout(r, 50));

  await driveFn(page, tileId);

  const frameData = [];
  const pngPaths = [];
  const interval = SLOW_DUR_MS / FRAME_COUNT;

  for (let i = 0; i < FRAME_COUNT; i++) {
    await new Promise((r) => setTimeout(r, interval));

    const record = await page.evaluate((probeX, probeY) => {
      const morph = window.__morph;
      if (!morph) return null;
      const rect = morph.getTrackedRect();
      const st = morph.state();
      const probed = document.elementFromPoint(probeX, probeY);
      const sheetEl = document.querySelector('.luce-sheet');
      const sheetStyle = sheetEl ? getComputedStyle(sheetEl).pointerEvents : null;
      const blocked = probed ? (
        (probed === sheetEl && sheetStyle === 'none') ||
        (probed.closest('.luce-sheet') && sheetStyle === 'none')
      ) : false;
      return {
        frame: 0,
        t: 0,
        rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
        present: rect !== null,
        pointerBlockedAtCenter: blocked,
        phase: st.phase,
        progress: st.progress,
      };
    }, PROBE_X, PROBE_Y);

    if (!record) continue;

    record.frame = i;
    record.t = i / (FRAME_COUNT - 1);

    const pngPath = path.join(scenarioDir, `frame-${String(i).padStart(3, '0')}.png`);
    await page.screenshot({ path: pngPath });
    pngPaths.push(pngPath);
    frameData.push(record);
  }

  const framesJsonPath = path.join(OUT, `${scenario}.frames.json`);
  writeFileSync(framesJsonPath, JSON.stringify(frameData, null, 2));
  log(`  frames.json: ${framesJsonPath} (${frameData.length} entries)`);

  const gifPath = path.join(OUT, `${scenario}.gif`);
  await encodePngToGif(pngPaths, gifPath);

  if (notesLines && notesLines.length > 0) {
    const notesPath = path.join(OUT, `${scenario}.notes.txt`);
    writeFileSync(notesPath, notesLines.join('\n') + '\n');
  }

  return frameData;
}

async function main() {
  log('Starting Vite dev server for real integration...');
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

  try {
    const page = await browser.newPage();
    await page.setViewport({ ...VIEWPORT, deviceScaleFactor: 1 });

    page.on('pageerror', (e) => log('PAGEERROR:', e.message.slice(0, 300)));
    page.on('console', (m) => {
      if (m.type() === 'error') log('CONSOLE ERR:', m.text().slice(0, 300));
    });

    const realNotes = [
      'REAL INTEGRATION REEL — S5 wired Insights tile FLIP morph',
      '',
      `Speed multiplier: ${SPEED_MULT} (timeScale=${SPEED_MULT}, ~${Math.round(SLOW_DUR_MS)}ms total)`,
      '',
      'InsightsPage renders real WorkspaceTile -> WorkspaceSheet via useSheetMorph -> useSharedElementMorph.',
      'getTrackedRect measures .luce-sheet (the FLIP target node), same contract as primitive harness.',
      'phase/progress sourced from window.__morphHandle (injected by use-sheet-morph shim under __HARNESS=true).',
    ];

    log('\n--- Scenario: real-open ---');
    await captureFrames(page, 'real-open',
      async (pg, tileId) => {
        await pg.evaluate((id) => { window.__morph?.open(id); }, tileId);
      },
      realNotes,
    );

    log('\n--- Scenario: real-close ---');
    await captureFrames(page, 'real-close',
      async (pg, tileId) => {
        await pg.evaluate((id) => { window.__morph?.open(id); }, tileId);
        await new Promise((r) => setTimeout(r, SLOW_DUR_MS + 500));
        await pg.evaluate(() => { window.__morph?.close(); });
      },
      [...realNotes, '', 'Close: tile opens fully, then close triggered.'],
    );

    log('\n--- Scenario: real-open-then-reverse-at-40 ---');
    await captureFrames(page, 'real-open-then-reverse-at-40',
      async (pg, tileId) => {
        await pg.evaluate((id, progress) => {
          window.__morph?.openThenInterruptAt(id, progress);
        }, tileId, 0.4);
      },
      [...realNotes, '', 'Interrupt-at-40: open triggered, close at ~40% spring progress.'],
    );

    log('\n--- Scenario: real-reduced-motion ---');
    await page.emulateMediaFeatures([
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ]);
    await captureFrames(page, 'real-reduced-motion',
      async (pg, tileId) => {
        await pg.evaluate((id) => { window.__morph?.open(id); }, tileId);
      },
      [...realNotes, '', 'Reduced-motion: useSheetMorph skips spring, sheet mounts instantly.'],
    );
    await page.emulateMediaFeatures([
      { name: 'prefers-reduced-motion', value: 'no-preference' },
    ]);

    log('\nAll real scenarios captured.');
  } finally {
    await browser.close();
    viteProc.kill();
    log('Done.');
  }
}

main().catch((e) => {
  process.stderr.write('CAPTURE FAILED: ' + e.message + '\n' + (e.stack || '') + '\n');
  process.exit(1);
});
