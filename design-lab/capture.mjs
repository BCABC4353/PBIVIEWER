import puppeteer from 'puppeteer';
import { PNG } from 'pngjs';
import * as gifencMod from 'gifenc';
import { writeFileSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const { GIFEncoder, quantize, applyPalette } = gifencMod.GIFEncoder ? gifencMod : gifencMod.default;

const root = dirname(fileURLToPath(import.meta.url));
const out = join(root, 'renders');
const framesRoot = '/tmp/design-lab-frames';

const ANIMS = ['bars', 'stack', 'line', 'donut', 'waterfall', 'sankey', 'table', 'kpi'];
const DT = 50;
const HOLD_MS = 900;

const only = process.argv.slice(2);
const want = (n) => only.length === 0 || only.includes(n);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--force-color-profile=srgb'] });

function encodeGif(frames, file) {
  const gif = GIFEncoder();
  frames.forEach((f, k) => {
    const palette = quantize(f.rgba, 256);
    const index = applyPalette(f.rgba, palette);
    gif.writeFrame(index, f.w, f.h, { palette, delay: k === frames.length - 1 ? HOLD_MS : DT });
  });
  gif.finish();
  writeFileSync(file, gif.bytes());
  console.log('gif', file.split('/').pop(), frames.length, 'frames', frames[0].w + 'x' + frames[0].h, (statSync(file).size / 1024).toFixed(0) + ' KB');
}

async function captureBoard(file, clipSel, durExpr, seekExpr, gifName, framesDirName) {
  const page = await browser.newPage();
  await page.setViewport({ width: 430, height: 980, deviceScaleFactor: 1 });
  await page.goto('file://' + join(root, file), { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await sleep(300);
  const el = await page.$(clipSel);
  const box = await el.boundingBox();
  const clip = { x: Math.floor(box.x), y: Math.floor(box.y), width: Math.floor(box.width), height: Math.floor(box.height) };
  const dur = await page.evaluate(durExpr);
  const n = Math.ceil(dur / DT) + 1;
  const dir = join(framesRoot, framesDirName);
  mkdirSync(dir, { recursive: true });
  const frames = [];
  for (let k = 0; k < n; k++) {
    await page.evaluate(seekExpr, k * DT);
    const buf = await page.screenshot({ clip });
    writeFileSync(join(dir, `f${String(k).padStart(3, '0')}.png`), buf);
    const png = PNG.sync.read(Buffer.from(buf));
    frames.push({ w: png.width, h: png.height, rgba: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.length) });
  }
  await page.close();
  encodeGif(frames, join(out, gifName));
}

for (const name of ANIMS.filter((n) => want('08') || want(n))) {
  const page = await browser.newPage();
  await page.setViewport({ width: 520, height: 980, deviceScaleFactor: 1 });
  await page.goto('file://' + join(root, '08-animation.html') + '?solo=' + name, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await sleep(250);

  const el = await page.$(`[data-anim="${name}"]`);
  const box = await el.boundingBox();
  const clip = { x: Math.floor(box.x), y: Math.floor(box.y), width: Math.floor(box.width), height: Math.floor(box.height) };
  const dur = await page.evaluate((n) => window.__lab.api.demoDur(n), name);
  const n = Math.ceil(dur / DT) + 1;

  const dir = join(framesRoot, name);
  mkdirSync(dir, { recursive: true });

  const frames = [];
  for (let k = 0; k < n; k++) {
    await page.evaluate((nm, ms) => window.__lab.api.seekDemo(nm, ms), name, k * DT);
    const buf = await page.screenshot({ clip });
    writeFileSync(join(dir, `f${String(k).padStart(2, '0')}.png`), buf);
    const png = PNG.sync.read(Buffer.from(buf));
    frames.push({ w: png.width, h: png.height, rgba: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.length) });
  }
  await page.close();

  encodeGif(frames, join(out, `anim-${name}.gif`));
}

if (want('09')) {
  await captureBoard(
    '09-transitions.html',
    '#demoPhone',
    () => window.__lab.api.morphDur,
    (ms) => window.__lab.api.seekMorph(ms),
    '09-transitions-morph.gif',
    'morph'
  );
}

if (want('10')) {
  await captureBoard(
    '10-ledger.html',
    '#demoPhone',
    () => window.__lab.api.ledgerDur,
    (ms) => window.__lab.api.seekLedger(ms),
    '10-ledger-pivot.gif',
    'ledger'
  );
}

if (want('11')) {
  await captureBoard(
    '11-crosswalk.html',
    '[data-ledger="0"]',
    () => window.__lab.api.crosswalkLedgerDur,
    (ms) => window.__lab.api.seekDenialsLedger(ms),
    '11-ledger-denials.gif',
    'crosswalk-ledger'
  );
}

await browser.close();

for (const f of readdirSync(out).filter((f) => f.endsWith('.gif')).sort()) {
  console.log('out', f, (statSync(join(out, f)).size / 1024).toFixed(0) + ' KB');
}
