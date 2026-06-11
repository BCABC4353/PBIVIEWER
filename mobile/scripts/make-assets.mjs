import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');

const CANVAS = '#0B0B0D';
const AMBER = '#E8A33D';

function markSvg({ size, markScale, color, bg }) {
  const c = size / 2;
  const r = (size * markScale) / 2;
  const stroke = r * 0.3;
  const cos45 = Math.SQRT1_2;
  const sx = c - r * cos45;
  const sy = c + r * cos45;
  const ex = c + r * cos45;
  const ey = c + r * cos45;
  const dotA = (78 * Math.PI) / 180;
  const dx = c + r * Math.cos(dotA);
  const dy = c + r * Math.sin(dotA);
  const dotR = stroke * 0.55;
  const rect = bg ? `<rect width="${size}" height="${size}" fill="${bg}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${rect}
  <path d="M ${f(sx)} ${f(sy)} A ${f(r)} ${f(r)} 0 1 1 ${f(ex)} ${f(ey)}"
        fill="none" stroke="${color}" stroke-width="${f(stroke)}" stroke-linecap="round"/>
  <circle cx="${f(dx)}" cy="${f(dy)}" r="${f(dotR)}" fill="${color}"/>
</svg>
`;
}

const f = (n) => Number(n.toFixed(2));

async function png(svg, file, { width, height }) {
  const out = join(ASSETS, file);
  await sharp(Buffer.from(svg), { density: 144 })
    .resize(width, height)
    .png()
    .toFile(out);
  const meta = await sharp(out).metadata();
  console.log(`  ${file.padEnd(34)} ${meta.width}x${meta.height}`);
}

async function main() {
  await mkdir(ASSETS, { recursive: true });
  console.log('Generating Power BI Viewer brand assets →', ASSETS);

  const iconSvg = markSvg({ size: 1024, markScale: 0.58, color: AMBER, bg: CANVAS });
  const bareSvg = markSvg({ size: 1024, markScale: 0.58, color: AMBER, bg: null });
  await writeFile(join(ASSETS, 'icon.svg'), iconSvg);
  await writeFile(join(ASSETS, 'brand-mark.svg'), bareSvg);
  console.log('  icon.svg / brand-mark.svg          (SVG sources)');

  await png(iconSvg, 'icon.png', { width: 1024, height: 1024 });

  const fgSvg = markSvg({ size: 1024, markScale: 0.46, color: AMBER, bg: null });
  await png(fgSvg, 'android-icon-foreground.png', { width: 1024, height: 1024 });
  const monoSvg = markSvg({ size: 1024, markScale: 0.46, color: '#FFFFFF', bg: null });
  await png(monoSvg, 'android-icon-monochrome.png', { width: 1024, height: 1024 });

  const W = 1284;
  const H = 2778;
  const splashMark = markSvg({ size: W * 0.38, markScale: 1, color: AMBER, bg: null });
  const splashSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${CANVAS}"/>
  <g transform="translate(${f((W - W * 0.38) / 2)} ${f((H - W * 0.38) / 2)})">${splashMark
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')}</g>
</svg>
`;
  await writeFile(join(ASSETS, 'splash.svg'), splashSvg);
  await png(splashSvg, 'splash.png', { width: W, height: H });

  await png(bareSvg, 'splash-icon.png', { width: 1024, height: 1024 });

  await png(iconSvg, 'favicon.png', { width: 48, height: 48 });

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
