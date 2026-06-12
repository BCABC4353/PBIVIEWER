import puppeteer from 'puppeteer';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const out = join(root, 'renders');

const PHONE = { width: 430, height: 932, deviceScaleFactor: 3 };
const WIDE = { width: 1460, height: 1000, deviceScaleFactor: 2 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(browser, file, viewport) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.goto('file://' + join(root, file), { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await sleep(300);
  return page;
}

async function shoot(page, name, opts = {}) {
  await page.screenshot({ path: join(out, name), fullPage: !!opts.fullPage });
  console.log('shot', name);
}

const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--force-color-profile=srgb'] });

{
  const p = await open(browser, 'index.html', PHONE);
  await shoot(p, 'index.png', { fullPage: true });
  await p.close();
}

{
  const p = await open(browser, '01-type.html', WIDE);
  await sleep(500);
  await shoot(p, '01-type.png', { fullPage: true });
  await p.close();
}

{
  const p = await open(browser, '02-color.html', WIDE);
  await sleep(300);
  await shoot(p, '02-color.png', { fullPage: true });
  await p.close();
}

{
  const p = await open(browser, '03-instruments.html', PHONE);
  await sleep(2200);
  await p.evaluate(() => window.__lab.api.setStrips(1));
  await sleep(120);
  await shoot(p, '03-instruments.png', { fullPage: true });
  await p.close();
}

{
  const p = await open(browser, '04-controls.html', PHONE);
  await sleep(600);
  await shoot(p, '04-controls.png', { fullPage: true });
  await p.evaluate(() => window.__lab.api.setSeg(1));
  await sleep(150);
  await shoot(p, '04-controls-seg-1-rest.png');
  await p.evaluate(() => window.__lab.api.setSeg(2, 0.45));
  await sleep(150);
  await shoot(p, '04-controls-seg-2-midtravel.png');
  await p.evaluate(() => {
    window.__lab.api.setSeg(2);
    window.__lab.api.setToggle(true);
  });
  await sleep(150);
  await shoot(p, '04-controls-seg-3-settled.png');
  await p.close();
}

{
  const p = await open(browser, '05-fluid.html', WIDE);
  await sleep(2200);
  await p.evaluate(() => {
    window.__lab.api.setStrips(1);
    window.__lab.api.setWidth(700);
  });
  await sleep(250);
  await shoot(p, '05-fluid.png', { fullPage: true });
  await p.evaluate(() => window.__lab.api.setWidth(360));
  await sleep(250);
  await shoot(p, '05-fluid-narrow-360.png', { fullPage: true });
  await p.evaluate(() => window.__lab.api.setWidth(1024));
  await sleep(250);
  await shoot(p, '05-fluid-wide-1024.png', { fullPage: true });
  await p.close();
}

{
  const p = await open(browser, '06-motion.html', WIDE);
  await sleep(3200);
  await p.evaluate(() => window.__lab.api.setDraw(1));
  await sleep(120);
  await shoot(p, '06-motion.png', { fullPage: true });
  await p.evaluate(() => window.__lab.api.setDraw(0.12));
  await sleep(120);
  await shoot(p, '06-motion-draw-1-early.png');
  await p.evaluate(() => window.__lab.api.setDraw(0.55));
  await sleep(120);
  await shoot(p, '06-motion-draw-2-midflight.png');
  await p.evaluate(() => window.__lab.api.setDraw(1));
  await sleep(120);
  await shoot(p, '06-motion-draw-3-settled.png');
  await p.close();
}

await browser.close();

let failed = false;
for (const f of readdirSync(out).filter((f) => f.endsWith('.png')).sort()) {
  const fp = join(out, f);
  const size = statSync(fp).size;
  const buf = readFileSync(fp);
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  const ok = size > 20 * 1024;
  if (!ok) failed = true;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${f}  ${w}x${h}  ${(size / 1024).toFixed(0)} KB`);
}
if (failed) process.exit(1);
