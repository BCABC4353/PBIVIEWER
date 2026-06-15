import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'out');
const PORT = 5199;
const VIEWPORT = { width: 1400, height: 900 };
const FRAME_COUNT = 40;
const SPEED_MULT = 0.15;
const BASE_DUR_MS = 420;
const SLOW_DUR_MS = BASE_DUR_MS / SPEED_MULT;
const FIRST_TILE_ID = 'beta';
const PROBE_X = 200;
const PROBE_Y = 200;

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

async function captureFrames(page, scenario, driveFn, notesLines) {
  const scenarioDir = path.join(OUT, scenario);
  mkdirSync(scenarioDir, { recursive: true });

  await page.reload({ waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 600));

  await page.evaluate((mult) => {
    if (window.__morph) window.__morph.setSpeed(mult);
  }, SPEED_MULT);
  await new Promise((r) => setTimeout(r, 50));

  await driveFn(page);

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
      const blocked = probed ? (
        probed.classList.contains('luce-scrim') ||
        (probed.getAttribute('aria-modal') === 'true' && !probed.closest('button'))
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
  log(`  frames.json written: ${framesJsonPath} (${frameData.length} entries)`);

  const gifPath = path.join(OUT, `${scenario}.gif`);
  await encodePngToGif(pngPaths, gifPath);

  if (notesLines && notesLines.length > 0) {
    const notesPath = path.join(OUT, `${scenario}.notes.txt`);
    writeFileSync(notesPath, notesLines.join('\n') + '\n');
  }

  return frameData;
}

async function main() {
  log('Starting Vite dev server...');
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

    page.on('pageerror', (e) => log('PAGEERROR:', e.message.slice(0, 200)));
    page.on('console', (m) => {
      if (m.type() === 'error') log('CONSOLE ERR:', m.text().slice(0, 200));
    });

    const baseUrl = `http://localhost:${PORT}/`;
    await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1000));

    const vtSupport = await page.evaluate(() => typeof document.startViewTransition === 'function');
    log(`View-Transition API supported: ${vtSupport}`);

    const baselineNotes = [
      'BASELINE REEL — Current View-Transition morph (Sprint 1)',
      '',
      `View-Transition API available: ${vtSupport}`,
      '',
      'HONESTY CAVEAT — View-Transition measurability:',
      'The current morph uses document.startViewTransition with CSS ::view-transition-group(sheet-morph).',
      'During a View Transition, the browser creates pseudo-element snapshots (::view-transition-old,',
      '::view-transition-new) that are NOT addressable via getBoundingClientRect from JS.',
      'The .luce-sheet div only exists in the DOM AFTER the transition callback completes (open)',
      'or is REMOVED before the transition starts (close). So:',
      '  - During "opening": .luce-sheet is absent from DOM until the callback fires mid-transition.',
      '    getTrackedRect() returns null for most opening frames, then the final rect once sheet mounts.',
      '  - During "closing": .luce-sheet is removed immediately; getTrackedRect() returns null.',
      '  - The ::view-transition-group pseudo-element that IS moving cannot be measured via JS.',
      '',
      'This is the fundamental reason for the Sprint 2+ FLIP refactor: FLIP keeps the real DOM',
      'element present and moving continuously, making every frame measurable.',
      '',
      'For this baseline Sprint 1 reel, capture honestly records what IS measurable:',
      '  - present:false during most of the View-Transition frames (the pseudo-element is moving,',
      '    not the real DOM node)',
      '  - rect appears only when the real sheet node is mounted/visible',
      '  - A-2/A-3/A-4 will FAIL on this baseline — expected, this is the before story',
    ];

    log('\n--- Scenario: baseline-open ---');
    await captureFrames(page, 'baseline-open',
      async (pg) => {
        await pg.evaluate((tileId) => { window.__morph?.open(tileId); }, FIRST_TILE_ID);
      },
      baselineNotes,
    );

    log('\n--- Scenario: baseline-close ---');
    await captureFrames(page, 'baseline-close',
      async (pg) => {
        await pg.evaluate((tileId) => { window.__morph?.open(tileId); }, FIRST_TILE_ID);
        await new Promise((r) => setTimeout(r, SLOW_DUR_MS + 200));
        await pg.evaluate(() => { window.__morph?.close(); });
      },
      [...baselineNotes, '', 'Close scenario: sheet opens first, then close is triggered.'],
    );

    log('\n--- Scenario: baseline-open-then-reverse-at-40 ---');
    await captureFrames(page, 'baseline-open-then-reverse-at-40',
      async (pg) => {
        await pg.evaluate((tileId, progress) => {
          window.__morph?.openThenInterruptAt(tileId, progress);
        }, FIRST_TILE_ID, 0.4);
      },
      [
        ...baselineNotes,
        '',
        'Interrupt-at-40 scenario: open triggered, close fired at ~40% progress.',
        'With View-Transitions, interrupt calls skipTransition() on the in-flight VT,',
        'which causes the browser to jump to the end state rather than reversing mid-flight.',
        'This is the RESTART problem: position snaps rather than reversing smoothly.',
      ],
    );

    log('\n--- Scenario: baseline-reduced-motion ---');
    await page.emulateMediaFeatures([
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ]);
    await captureFrames(page, 'baseline-reduced-motion',
      async (pg) => {
        await pg.evaluate((tileId) => { window.__morph?.open(tileId); }, FIRST_TILE_ID);
      },
      [
        'REDUCED-MOTION scenario: prefers-reduced-motion: reduce emulated.',
        'InsightsPage skips View-Transition when prefersReducedMotion() returns true,',
        'so the sheet mounts instantly. All frames should show the settled sheet.',
        'This scenario should be a clean PASS for presence/rect (sheet is static).',
      ],
    );
    await page.emulateMediaFeatures([
      { name: 'prefers-reduced-motion', value: 'no-preference' },
    ]);

    log('\nAll scenarios captured.');
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
