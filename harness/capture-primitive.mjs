import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'out');
const PORT = 5200;
const VIEWPORT = { width: 1400, height: 900 };
const FRAME_COUNT = 40;
const SPEED_MULT = 0.15;
const BASE_DUR_MS = 420;
const SLOW_DUR_MS = BASE_DUR_MS / SPEED_MULT;
const FIRST_TILE_ID = 'a';
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

async function captureFrames(page, scenario, driveFn, notesLines) {
  const scenarioDir = path.join(OUT, scenario);
  mkdirSync(scenarioDir, { recursive: true });

  await page.goto(`http://localhost:${PORT}/primitive.html`, { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 800));

  await page.evaluate((mult) => {
    if (window.__morph) window.__morph.setSpeed(mult);
  }, SPEED_MULT);
  await new Promise((r) => setTimeout(r, 100));

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
      const morphNode = document.querySelector('[data-morph-node="true"]');
      const blocked = probed ? (
        probed.classList.contains('luce-scrim') ||
        (probed.getAttribute('aria-modal') === 'true' && !probed.closest('button')) ||
        (morphNode && probed === morphNode && getComputedStyle(morphNode).pointerEvents !== 'none')
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
  log('Starting Vite dev server for primitive demo...');
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

    const primitiveNotes = [
      'PRIMITIVE REEL — FLIP MomentumSpring morph (Sprint 3)',
      '',
      `Speed multiplier: ${SPEED_MULT} (timeScale=${SPEED_MULT}, ~${Math.round(SLOW_DUR_MS)}ms total)`,
      '',
      'The FLIP primitive uses useSharedElementMorph with createMomentumSpring.',
      'The morph node [data-morph-node="true"] is the REAL DOM element receiving CSS transform.',
      'getBoundingClientRect on it moves frame-by-frame during the animation.',
      'All 40 frames should have present:true with continuously moving rects.',
    ];

    log('\n--- Scenario: primitive-open ---');
    await captureFrames(page, 'primitive-open',
      async (pg) => {
        await pg.evaluate((tileId) => { window.__morph?.open(tileId); }, FIRST_TILE_ID);
      },
      primitiveNotes,
    );

    log('\n--- Scenario: primitive-close ---');
    await captureFrames(page, 'primitive-close',
      async (pg) => {
        await pg.evaluate((tileId) => { window.__morph?.open(tileId); }, FIRST_TILE_ID);
        await new Promise((r) => setTimeout(r, SLOW_DUR_MS + 500));
        await pg.evaluate(() => { window.__morph?.close(); });
      },
      [...primitiveNotes, '', 'Close scenario: tile opens fully, then close triggered.'],
    );

    log('\n--- Scenario: primitive-open-then-reverse-at-40 ---');
    await captureFrames(page, 'primitive-open-then-reverse-at-40',
      async (pg) => {
        await pg.evaluate((tileId, progress) => {
          window.__morph?.openThenInterruptAt(tileId, progress);
        }, FIRST_TILE_ID, 0.4);
      },
      [
        ...primitiveNotes,
        '',
        'Interrupt-at-40 scenario: open triggered, close fired at ~40% progress.',
        'Spring retargets to 0 mid-flight; momentum carries forward then reverses.',
        'No snap — position is continuous at the interrupt point.',
      ],
    );

    log('\n--- Scenario: primitive-reduced-motion ---');
    await page.emulateMediaFeatures([
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ]);
    await captureFrames(page, 'primitive-reduced-motion',
      async (pg) => {
        await pg.evaluate((tileId) => { window.__morph?.open(tileId); }, FIRST_TILE_ID);
      },
      [
        'REDUCED-MOTION scenario: prefers-reduced-motion: reduce emulated.',
        'useSharedElementMorph skips the spring and opens instantly.',
        'All frames show the settled (fully open) panel — static rect, all present.',
      ],
    );
    await page.emulateMediaFeatures([
      { name: 'prefers-reduced-motion', value: 'no-preference' },
    ]);

    log('\nAll primitive scenarios captured.');
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
